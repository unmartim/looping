#!/usr/bin/env node
// Backlog do looping. Estado em .loop/backlog.json no diretório atual.
// Uso:
//   loop.mjs init "<objetivo>" [--limite 20]          inicia (limite = máx. de tarefas criadas pelo agente)
//   loop.mjs add "<título>" [--tipo bug|melhoria|tarefa] [--origem agente|usuario] [--impacto alto|medio|baixo]
//   loop.mjs start <id>                               marca como fazendo
//   loop.mjs done <id> "<evidência>"                  conclui (evidência obrigatória)
//   loop.mjs fail <id> "<motivo>"                     tentativa falhou (3 falhas = travado)
//   loop.mjs reopen <id> --por <id>                   corrigir <por> quebrou <id> (2x entre os mesmos = conflito)
//   loop.mjs sweep "<o que foi varrido>" [--novos N]  registra uma varredura (N = itens novos encontrados)
//   loop.mjs status | next | report | stop "<motivo>"
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(process.cwd(), '.loop');
const FILE = join(DIR, 'backlog.json');
const args = process.argv.slice(2);
const cmd = args[0];
const FLAGS = ['--limite', '--tipo', '--origem', '--impacto', '--por', '--novos'];
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const pos = args.slice(1).filter((a, i, arr) => !a.startsWith('--') && !FLAGS.includes(arr[i - 1]));
const now = () => new Date().toISOString();
const load = () => {
  if (!existsSync(FILE)) { console.error('Sem loop aqui. Rode: loop.mjs init "<objetivo>"'); process.exit(2); }
  return JSON.parse(readFileSync(FILE, 'utf8'));
};
const save = (b) => { b.rev = (b.rev || 0) + 1; b.atualizado = now(); writeFileSync(FILE, JSON.stringify(b, null, 2)); };
const find = (b, id) => {
  const it = b.itens.find((x) => x.id === Number(id));
  if (!it) { console.error(`Item #${id} não existe`); process.exit(2); }
  return it;
};
const abertos = (b) => b.itens.filter((x) => ['pendente', 'fazendo'].includes(x.status));
const criadosAgente = (b) => b.itens.filter((x) => x.origem === 'agente').length;
const ORDEM = { bug: 0, tarefa: 1, melhoria: 2 };
const IMP = { alto: 0, medio: 1, baixo: 2 };
const proximo = (b) => abertos(b).sort((x, y) =>
  (y.status === 'fazendo') - (x.status === 'fazendo') ||
  ORDEM[x.tipo] - ORDEM[y.tipo] || IMP[x.impacto] - IMP[y.impacto] || x.id - y.id)[0];

function resumo(b) {
  const c = (s) => b.itens.filter((x) => x.status === s).length;
  const lim = criadosAgente(b) >= b.limite ? ' (LIMITE ATINGIDO: não registre novas descobertas)' : '';
  const v = b.ultima_varredura;
  return [
    `Loop: ${b.objetivo}`,
    `Estado: ${b.ativo ? 'ATIVO' : 'encerrado'}${b.motivo_fim ? ` (${b.motivo_fim})` : ''}`,
    `Itens: ${b.itens.length} | pendente ${c('pendente')} | fazendo ${c('fazendo')} | feito ${c('feito')} | travado ${c('travado')} | conflito ${c('conflito')}`,
    `Criadas pelo agente: ${criadosAgente(b)}/${b.limite}${lim}`,
    `Última varredura: ${v ? `${v.quando}, ${v.novos} novo(s)` : 'nenhuma'}`,
  ].join('\n');
}

switch (cmd) {
  case 'init': {
    if (existsSync(FILE) && JSON.parse(readFileSync(FILE, 'utf8')).ativo) {
      console.error('Já existe um loop ativo aqui. Use status, ou stop antes de iniciar outro.'); process.exit(2);
    }
    mkdirSync(DIR, { recursive: true });
    const b = {
      objetivo: pos[0] || '(sem objetivo)', limite: Number(opt('--limite', 20)), ativo: true, criado: now(),
      itens: [], varreduras: [], ultima_varredura: null, sugestoes: [], rev: 0,
      hook: { bloqueios_sem_progresso: 0, ultima_rev: 0 },
    };
    save(b); console.log(resumo(b)); break;
  }
  case 'add': {
    const b = load(); const origem = opt('--origem', 'agente');
    if (origem === 'agente' && criadosAgente(b) >= b.limite) {
      b.sugestoes.push(pos[0]); save(b);
      console.log(`Limite de ${b.limite} tarefas criadas pelo agente atingido. Guardado como sugestão: "${pos[0]}".`); break;
    }
    const it = {
      id: b.itens.length + 1, titulo: pos[0], tipo: opt('--tipo', 'tarefa'), impacto: opt('--impacto', 'medio'),
      origem, status: 'pendente', tentativas: 0, evidencia: null, quebrado_por: [], criado: now(),
    };
    b.itens.push(it); save(b);
    console.log(`#${it.id} registrado [${it.tipo}/${it.impacto}/${origem}] ${it.titulo} (agente: ${criadosAgente(b)}/${b.limite})`); break;
  }
  case 'start': { const b = load(); const it = find(b, pos[0]); it.status = 'fazendo'; save(b); console.log(`#${it.id} fazendo: ${it.titulo}`); break; }
  case 'done': {
    const b = load(); const it = find(b, pos[0]);
    if (!pos[1]) { console.error('Evidência obrigatória: o teste, build, print ou comando que prova que está pronto.'); process.exit(2); }
    it.status = 'feito'; it.evidencia = pos[1]; it.concluido = now(); save(b);
    const n = b.itens.filter((x) => x.status === 'feito').length;
    console.log(`#${it.id} feito. ${abertos(b).length} aberto(s).${n % 5 === 0 ? `\n\n[status a cada 5 concluídas]\n${resumo(b)}` : ''}`); break;
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
    const b = load(); const v = { quando: now(), o_que: pos[0] || '', novos: Number(opt('--novos', 0)), rev: b.rev + 1 };
    b.varreduras.push(v); b.ultima_varredura = v; save(b); console.log(`Varredura registrada: ${v.novos} novo(s).`); break;
  }
  case 'next': {
    const b = load(); const it = proximo(b);
    console.log(it ? `#${it.id} [${it.tipo}/${it.impacto}] ${it.titulo}` : 'Nada aberto. Faça a varredura final.'); break;
  }
  case 'status': console.log(resumo(load())); break;
  case 'report': {
    const b = load(); console.log(resumo(b) + '\n');
    for (const s of ['feito', 'travado', 'conflito', 'pendente', 'fazendo']) {
      const l = b.itens.filter((x) => x.status === s); if (!l.length) continue;
      console.log(`## ${s} (${l.length})`);
      for (const x of l) {
        console.log(`- #${x.id} [${x.tipo}/${x.origem}] ${x.titulo}` +
          (x.evidencia ? `: ${x.evidencia}` : '') + (x.ultimo_erro ? ` (erro: ${x.ultimo_erro})` : '') +
          (x.conflito_com ? ` (conflita com #${x.conflito_com})` : ''));
      }
    }
    if (b.sugestoes?.length) { console.log(`## sugestões além do limite (${b.sugestoes.length})`); b.sugestoes.forEach((s) => console.log(`- ${s}`)); }
    break;
  }
  case 'stop': { const b = load(); b.ativo = false; b.motivo_fim = pos[0] || 'encerrado pelo usuário'; save(b); console.log(resumo(b)); break; }
  default: console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 12).join('\n'));
}
