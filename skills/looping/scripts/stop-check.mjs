#!/usr/bin/env node
// Hook de parada (Stop) do looping. Com loop ativo nesta sessão, impede o agente de encerrar enquanto houver
// item aberto ou faltar a varredura final limpa, e recusa respostas que param para perguntar ao usuário.
// Sem loop ativo, não faz nada.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const LIMITE_ESTAGNACAO = 8;
let input = {};
try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch {}

let FILE = join(input.cwd || process.cwd(), '.loop', 'backlog.json');
const REG = join(homedir(), '.looping', 'sessoes.json');
if (input.session_id && existsSync(REG)) {
  try { const m = JSON.parse(readFileSync(REG, 'utf8')); if (m[input.session_id]) FILE = m[input.session_id]; } catch {}
}
if (!existsSync(FILE)) process.exit(0);
const b = JSON.parse(readFileSync(FILE, 'utf8'));
if (!b.ativo) process.exit(0);
if (b.sessao && input.session_id && b.sessao !== input.session_id) process.exit(0);

const S = `node "${join(dirname(fileURLToPath(import.meta.url)), 'loop.mjs')}"`;
const save = () => writeFileSync(FILE, JSON.stringify(b, null, 2));
const out = (reason) => { process.stdout.write(JSON.stringify({ decision: 'block', reason: `[looping] ${reason}` })); process.exit(0); };
const REGRA = 'É PROIBIDO parar para resumir o que fez, pedir confirmação ou perguntar "quer que eu continue?": ' +
  'a única forma de encerrar é concluir os itens. Dúvida que só o usuário resolve: ' + S + ' ask "<dúvida>" e siga. ' +
  `Viu algo novo? Registre com ${S} add "<título>" --tipo bug|melhoria.`;

// Encerramento (ou pausa): devolve o turno uma última vez para o relatório.
const fim = (motivo, pausar = false) => {
  b.ativo = false; b.pausado = pausar; b.motivo_fim = motivo; save();
  out(pausar
    ? `Loop PAUSADO (${motivo}). Rode ${S} report, entregue o relatório e diga que o usuário retoma com "continua o loop".`
    : `Loop encerrado (${motivo}). Rode ${S} report e entregue o relatório (o cartão ao vivo já mostra o fim).`);
};

// Última mensagem do agente: parou para perguntar?
function ultimaFala() {
  try {
    const linhas = readFileSync(input.transcript_path, 'utf8').trim().split('\n');
    for (let i = linhas.length - 1; i >= 0; i--) {
      const e = JSON.parse(linhas[i]);
      if (e.type !== 'assistant') continue;
      const t = (e.message?.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim();
      if (t) return t;
    }
  } catch {}
  return '';
}
const fala = input.last_assistant_message || ultimaFala();
const PERGUNTA = /(\?\s*(\*|_|`|\))*\s*$)|quer que eu|posso (seguir|continuar|prosseguir)|deseja que|prefere que|devo (seguir|continuar)|me (diga|avisa|confirma)|aguardo (sua|seu|a sua)|qual (você|voce) prefere|sigo (com|para)/i;
const perguntou = PERGUNTA.test(fala.slice(-600));

const abertos = b.itens.filter((x) => ['pendente', 'fazendo'].includes(x.status));
const p = abertos.find((x) => x.status === 'fazendo') || abertos[0];

// Contador de estagnação: só conta quando o backlog não mudou E o agente não parou para perguntar
// (pergunta tem bloqueio próprio, para não "ganhar" o fim do loop insistindo).
b.hook ||= { bloqueios_sem_progresso: 0, ultima_rev: 0 };
if (!perguntou) {
  b.hook.bloqueios_sem_progresso = b.rev === b.hook.ultima_rev ? b.hook.bloqueios_sem_progresso + 1 : 1;
  b.hook.ultima_rev = b.rev;
  if (b.hook.bloqueios_sem_progresso > LIMITE_ESTAGNACAO) fim(`sem avanço em ${LIMITE_ESTAGNACAO} tentativas de parar`, true);
}
save();

if (perguntou) {
  out(`Você parou para perguntar ao usuário. Isso é proibido no loop. Transforme cada pergunta em ${S} ask "<dúvida>", ` +
    `decida o resto com bom senso e continue${p ? ` por #${p.id} ${p.titulo}` : ' com a varredura'}. ${REGRA}`);
}
if (abertos.length) {
  out(`Ainda há ${abertos.length} item(ns) aberto(s). Continue por #${p.id} ${p.titulo}: corrija, verifique e rode ` +
    `${S} done ${p.id} --verificar "<comando de teste>" (ou fail ${p.id} "<motivo>"). ${REGRA}`);
}
if (b.itens.filter((x) => x.origem === 'agente' && x.tipo !== 'pergunta').length >= b.limite) fim(`limite de ${b.limite} tarefas criadas pelo agente atingido e backlog zerado`);
const v = b.ultima_varredura;
if (!v || v.rev < b.rev || v.novos > 0) {
  out(`Backlog zerado, mas falta a varredura final limpa. Varra de novo TODO o escopo (testes, build, telas, fluxos) e rode ` +
    `${S} sweep "<o que varreu>" --achado "<cada problema encontrado>" ... (sem --achado se não achou nada). ` +
    `O loop só termina com uma varredura sem novidades depois da última mudança. ${REGRA}`);
}
fim('concluído: backlog zerado e varredura final sem novidades');
