#!/usr/bin/env node
// Backlog do looping. Estado em .loop/backlog.json no diretório atual.
// Uso:
//   loop.mjs init "<objetivo>" [--limite 20]   inicia; com loop ativo ou pausado, CONTINUA o mesmo (não apaga nada)
//   loop.mjs add "<título>" [--tipo bug|melhoria|tarefa] [--origem agente|usuario] [--impacto alto|medio|baixo]
//   loop.mjs ask "<dúvida que só o usuário resolve>"   registra pergunta (vai travada para o relatório)
//   loop.mjs start <id>
//   loop.mjs done <id> ["<evidência>"] [--verificar "<comando>"]   com --verificar, só fecha se o comando passar
//   loop.mjs fail <id> "<motivo>"              tentativa falhou (3 falhas = travado)
//   loop.mjs reopen <id> --por <id>            corrigir <por> quebrou <id> (2x entre os mesmos = conflito)
//   loop.mjs sweep "<o que foi varrido>" [--achado "<título>" ...] [--tipo bug|melhoria]
//                                              registra a varredura; cada --achado vira item; novos = contados pelo script
//   loop.mjs resume                            retoma um loop pausado
//   loop.mjs status | next | report | stop "<motivo>" --pedido-do-usuario
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const AQUI = dirname(fileURLToPath(import.meta.url));
const DIR = join(process.cwd(), '.loop');
const FILE = join(DIR, 'backlog.json');
const args = process.argv.slice(2);
const cmd = args[0];
const FLAGS = ['--limite', '--tipo', '--origem', '--impacto', '--por', '--novos', '--achado', '--verificar'];
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const todos = (n) => args.flatMap((a, i) => (a === n && args[i + 1] !== undefined ? [args[i + 1]] : []));
const pos = args.slice(1).filter((a, i, arr) => !a.startsWith('--') && !FLAGS.includes(arr[i - 1]));
const now = () => new Date().toISOString();
const sair = (msg) => { console.error(msg); process.exit(2); };
const load = () => {
  if (!existsSync(FILE)) sair('Sem loop aqui. Rode: loop.mjs init "<objetivo>"');
  return JSON.parse(readFileSync(FILE, 'utf8'));
};
const save = (b) => { b.rev = (b.rev || 0) + 1; b.atualizado = now(); writeFileSync(FILE, JSON.stringify(b, null, 2)); };
const find = (b, id) => b.itens.find((x) => x.id === Number(id)) || sair(`Item #${id} não existe`);
const abertos = (b) => b.itens.filter((x) => ['pendente', 'fazendo'].includes(x.status));
const criadosAgente = (b) => b.itens.filter((x) => x.origem === 'agente' && x.tipo !== 'pergunta').length;
const ORDEM = { bug: 0, tarefa: 1, melhoria: 2, pergunta: 3 };
const IMP = { alto: 0, medio: 1, baixo: 2 };
const proximo = (b) => abertos(b).sort((x, y) =>
  (y.status === 'fazendo') - (x.status === 'fazendo') ||
  ORDEM[x.tipo] - ORDEM[y.tipo] || IMP[x.impacto] - IMP[y.impacto] || x.id - y.id)[0];
const estado = (b) => (b.ativo ? 'ATIVO' : b.pausado ? 'PAUSADO' : 'encerrado');

// Registro global sessão → backlog, para o hook achar o loop mesmo quando a sessão roda em outra pasta.
function registrar(sessao) {
  if (!sessao) return;
  const dir = join(homedir(), '.looping'); mkdirSync(dir, { recursive: true });
  const reg = join(dir, 'sessoes.json');
  let m = {}; try { m = JSON.parse(readFileSync(reg, 'utf8')); } catch {}
  m[sessao] = FILE; writeFileSync(reg, JSON.stringify(m, null, 2));
}

const CARTAO = `\n>>> MOSTRE O CARTÃO AO VIVO AGORA (uma vez; ele se atualiza sozinho): rode "node \\"${join(AQUI, 'card.mjs')}\\"" ` +
  'e passe a saída EXATA para openbot.html_render (via openbot.tool_call, título "Looping"). Nunca faça um cartão seu. Fora do OpenBot, ignore.';

function subirLive() {
  try { spawn(process.execPath, [join(AQUI, 'live.mjs')], { detached: true, stdio: 'ignore', windowsHide: true }).unref(); } catch {}
}

function novoItem(b, titulo, { tipo = 'tarefa', impacto = 'medio', origem = 'agente' } = {}) {
  if (!titulo) sair('Título obrigatório.');
  if (origem === 'agente' && tipo !== 'pergunta' && criadosAgente(b) >= b.limite) {
    b.sugestoes.push(titulo);
    return `Limite de ${b.limite} tarefas criadas pelo agente atingido. Guardado como sugestão: "${titulo}".`;
  }
  const it = {
    id: b.itens.reduce((m, x) => Math.max(m, x.id), 0) + 1, titulo, tipo, impacto, origem,
    status: 'pendente', tentativas: 0, evidencia: null, quebrado_por: [], criado: now(),
  };
  b.itens.push(it);
  return `#${it.id} registrado [${tipo}/${impacto}/${origem}] ${titulo} (agente: ${criadosAgente(b)}/${b.limite})`;
}

function resumo(b) {
  const c = (s) => b.itens.filter((x) => x.status === s).length;
  const lim = criadosAgente(b) >= b.limite ? ' (LIMITE ATINGIDO: descobertas viram sugestões)' : '';
  const v = b.ultima_varredura;
  return [
    `Loop: ${b.objetivo}`,
    `Estado: ${estado(b)}${b.motivo_fim ? ` (${b.motivo_fim})` : ''}`,
    `Itens: ${b.itens.length} | pendente ${c('pendente')} | fazendo ${c('fazendo')} | feito ${c('feito')} | travado ${c('travado')} | conflito ${c('conflito')}`,
    `Criadas pelo agente: ${criadosAgente(b)}/${b.limite}${lim}`,
    `Última varredura: ${v ? `${v.quando}, ${v.novos} novo(s)` : 'nenhuma'}`,
  ].join('\n');
}

switch (cmd) {
  case 'init': {
    mkdirSync(DIR, { recursive: true });
    const sessao = process.env.CLAUDE_CODE_SESSION_ID || null;
    if (existsSync(FILE)) {
      const b = JSON.parse(readFileSync(FILE, 'utf8'));
      if (b.ativo || b.pausado) {
        // Continua o mesmo loop: nada é apagado. O novo pedido vira nota e as tarefas novas entram com add.
        b.ativo = true; b.pausado = false; b.motivo_fim = '';
        b.hook = { bloqueios_sem_progresso: 0, ultima_rev: b.rev };
        if (pos[0] && pos[0] !== b.objetivo) (b.notas ||= []).push(`${now()}: ${pos[0]}`);
        if (sessao) b.sessao = sessao;
        save(b); registrar(b.sessao); subirLive();
        console.log(`CONTINUANDO O LOOP EXISTENTE (nada foi apagado). Registre as tarefas novas com add.\n${resumo(b)}${CARTAO}`);
        break;
      }
      mkdirSync(join(DIR, 'historico'), { recursive: true });
      renameSync(FILE, join(DIR, 'historico', `${now().replace(/[:.]/g, '-')}.json`));
    }
    const b = {
      objetivo: pos[0] || '(sem objetivo)', limite: Number(opt('--limite', 20)), ativo: true, pausado: false,
      criado: now(), itens: [], varreduras: [], ultima_varredura: null, sugestoes: [], rev: 0, sessao,
      hook: { bloqueios_sem_progresso: 0, ultima_rev: 0 },
    };
    save(b); registrar(sessao); subirLive(); console.log(resumo(b) + CARTAO); break;
  }
  case 'add': {
    const b = load();
    const msg = novoItem(b, pos[0], { tipo: opt('--tipo', 'tarefa'), impacto: opt('--impacto', 'medio'), origem: opt('--origem', 'agente') });
    save(b); console.log(msg); break;
  }
  case 'ask': {
    const b = load();
    const msg = novoItem(b, `[pergunta] ${pos[0] || ''}`, { tipo: 'pergunta', impacto: 'baixo' });
    const it = b.itens[b.itens.length - 1]; it.status = 'travado'; it.ultimo_erro = 'precisa do usuário';
    save(b); console.log(`${msg}\nPergunta guardada para o relatório final. NÃO pergunte agora: siga com o próximo item (next).`); break;
  }
  case 'start': { const b = load(); const it = find(b, pos[0]); it.status = 'fazendo'; save(b); console.log(`#${it.id} fazendo: ${it.titulo}`); break; }
  case 'done': {
    const b = load(); const it = find(b, pos[0]); const verificar = opt('--verificar');
    let evidencia = pos[1] || '';
    if (verificar) {
      const r = spawnSync(verificar, { shell: true, encoding: 'utf8', timeout: 15 * 60 * 1000, cwd: process.cwd() });
      const saida = `${r.stdout || ''}${r.stderr || ''}`.trim().split('\n').slice(-6).join(' | ');
      if (r.status !== 0) {
        it.tentativas++; it.ultimo_erro = `verificação falhou: ${verificar} (exit ${r.status}) ${saida}`.slice(0, 500);
        it.status = it.tentativas >= 3 ? 'travado' : 'pendente'; save(b);
        sair(`#${it.id} NÃO concluído: "${verificar}" falhou (exit ${r.status}). Tentativa ${it.tentativas}/3.\n${saida}`);
      }
      evidencia = `${evidencia ? `${evidencia}; ` : ''}verificado: ${verificar} (exit 0) ${saida}`.slice(0, 600);
    }
    if (!evidencia) sair('Evidência obrigatória. Prefira --verificar "<comando>" (teste, build, typecheck): o item só fecha se o comando passar.');
    it.status = 'feito'; it.evidencia = evidencia; it.verificado = Boolean(verificar); it.concluido = now(); save(b);
    const n = b.itens.filter((x) => x.status === 'feito').length;
    console.log(`#${it.id} feito${verificar ? ' (verificado)' : ''}. ${abertos(b).length} aberto(s).` +
      (n % 3 === 0 ? `\n\n[status]\n${resumo(b)}\nViu algo novo enquanto trabalhava? Registre agora com add.` : ''));
    break;
  }
  case 'fail': {
    const b = load(); const it = find(b, pos[0]); it.tentativas++; it.ultimo_erro = pos[1] || '';
    it.status = it.tentativas >= 3 ? 'travado' : 'pendente'; save(b);
    console.log(it.status === 'travado'
      ? `#${it.id} TRAVADO após 3 tentativas. Vai para "precisa de você". Siga para o próximo.`
      : `#${it.id} tentativa ${it.tentativas}/3 falhou.`); break;
  }
  case 'reopen': {
    const b = load(); const it = find(b, pos[0]); const por = Number(opt('--por', 0));
    it.quebrado_por.push(por); it.status = 'pendente';
    const outro = por ? b.itens.find((x) => x.id === por) : null;
    const vezes = it.quebrado_por.filter((x) => x === por).length + (outro ? outro.quebrado_por.filter((x) => x === it.id).length : 0);
    if (outro && vezes >= 2) {
      it.status = 'conflito'; outro.status = 'conflito'; it.conflito_com = por; outro.conflito_com = it.id; save(b);
      console.log(`CONFLITO: #${it.id} e #${por} quebram um ao outro. Os dois vão para "precisa de você". Siga com o resto.`);
    } else { save(b); console.log(`#${it.id} reaberto (quebrado por #${por || '?'}).`); }
    break;
  }
  case 'sweep': {
    const b = load(); const msgs = [];
    for (const a of todos('--achado')) msgs.push(novoItem(b, a, { tipo: opt('--tipo', 'bug'), impacto: opt('--impacto', 'medio') }));
    // Novos = itens criados desde a varredura anterior (contado pelo script, não informado pelo agente).
    const desde = b.ultima_varredura?.quando || b.criado;
    const novos = b.itens.filter((x) => x.criado > desde && x.origem === 'agente' && x.tipo !== 'pergunta').length + (b.sugestoes.length - (b.ultima_varredura?.sugestoes ?? 0));
    const v = { quando: now(), o_que: pos[0] || '', novos, sugestoes: b.sugestoes.length, rev: b.rev + 1 };
    b.varreduras.push(v); b.ultima_varredura = v; save(b);
    if (msgs.length) console.log(msgs.join('\n'));
    console.log(`Varredura registrada: ${novos} novo(s) desde a anterior.${novos ? ' O loop continua: resolva os novos e varra de novo.' : ''}`);
    break;
  }
  case 'resume': {
    const b = load(); b.ativo = true; b.pausado = false; b.motivo_fim = '';
    b.hook = { bloqueios_sem_progresso: 0, ultima_rev: b.rev };
    if (process.env.CLAUDE_CODE_SESSION_ID) b.sessao = process.env.CLAUDE_CODE_SESSION_ID;
    save(b); registrar(b.sessao); subirLive(); console.log(`Loop retomado.\n${resumo(b)}${CARTAO}`); break;
  }
  case 'next': {
    const b = load(); const it = proximo(b);
    console.log(it ? `#${it.id} [${it.tipo}/${it.impacto}] ${it.titulo}` : 'Nada aberto. Faça a varredura final (sweep).'); break;
  }
  case 'status': console.log(resumo(load())); break;
  case 'report': {
    const b = load(); console.log(resumo(b) + '\n');
    const perguntas = b.itens.filter((x) => x.tipo === 'pergunta');
    for (const s of ['feito', 'travado', 'conflito', 'pendente', 'fazendo']) {
      const l = b.itens.filter((x) => x.status === s && x.tipo !== 'pergunta'); if (!l.length) continue;
      console.log(`## ${s} (${l.length})`);
      for (const x of l) {
        console.log(`- #${x.id} [${x.tipo}/${x.origem}] ${x.titulo}` + (x.evidencia ? `: ${x.evidencia}` : '') +
          (x.ultimo_erro ? ` (erro: ${x.ultimo_erro})` : '') + (x.conflito_com ? ` (conflita com #${x.conflito_com})` : ''));
      }
    }
    if (perguntas.length) { console.log(`## perguntas para o usuário (${perguntas.length})`); perguntas.forEach((x) => console.log(`- ${x.titulo.replace('[pergunta] ', '')}`)); }
    if (b.sugestoes?.length) { console.log(`## sugestões além do limite (${b.sugestoes.length})`); b.sugestoes.forEach((s) => console.log(`- ${s}`)); }
    break;
  }
  case 'stop': {
    if (!args.includes('--pedido-do-usuario')) sair('Recusado: só o usuário encerra o loop. Continue o próximo item (next). Dúvida vira "ask".');
    const b = load(); b.ativo = false; b.pausado = false; b.motivo_fim = pos[0] || 'encerrado pelo usuário'; save(b); console.log(resumo(b)); break;
  }
  default: console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 15).join('\n'));
}
