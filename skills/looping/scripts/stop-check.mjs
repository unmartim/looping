#!/usr/bin/env node
// Hook de parada (Stop) do looping. Se houver loop ativo em .loop/backlog.json, impede o agente de
// encerrar enquanto houver item aberto ou faltar a varredura final limpa. Sem loop ativo, não faz nada.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

let input = {};
try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch {}
// Acha o backlog desta sessão: pelo registro global (sessão → arquivo) ou pela pasta da sessão.
let FILE = join(input.cwd || process.cwd(), '.loop', 'backlog.json');
const REG = join(homedir(), '.looping', 'sessoes.json');
if (input.session_id && existsSync(REG)) {
  try { const m = JSON.parse(readFileSync(REG, 'utf8')); if (m[input.session_id]) FILE = m[input.session_id]; } catch {}
}
if (!existsSync(FILE)) process.exit(0);
const b = JSON.parse(readFileSync(FILE, 'utf8'));
if (!b.ativo) process.exit(0);
// Loop de outra sessão (outro agente) nesta mesma pasta: não é da conta desta.
if (b.sessao && input.session_id && b.sessao !== input.session_id) process.exit(0);

const SCRIPT = `node "${join(dirname(fileURLToPath(import.meta.url)), 'loop.mjs')}"`;
const save = () => writeFileSync(FILE, JSON.stringify(b, null, 2));
const allow = (motivo) => { b.ativo = false; b.motivo_fim = motivo; save(); process.exit(0); };
const block = (reason) => {
  b.hook ||= { bloqueios_sem_progresso: 0, ultima_rev: 0 };
  b.hook.bloqueios_sem_progresso = b.rev === b.hook.ultima_rev ? b.hook.bloqueios_sem_progresso + 1 : 1;
  b.hook.ultima_rev = b.rev;
  if (b.hook.bloqueios_sem_progresso > 5) allow('estagnado: 5 tentativas de parar sem nenhum avanço no backlog');
  save();
  process.stdout.write(JSON.stringify({
    decision: 'block',
    reason: `[looping] ${reason} O loop libera sozinho quando terminar de verdade. Estado: ${SCRIPT} status`,
  }));
  process.exit(0);
};

const abertos = b.itens.filter((x) => ['pendente', 'fazendo'].includes(x.status));
const limiteAtingido = b.itens.filter((x) => x.origem === 'agente').length >= b.limite;

if (abertos.length) {
  const p = abertos.find((x) => x.status === 'fazendo') || abertos[0];
  block(`Ainda há ${abertos.length} item(ns) aberto(s). Continue por #${p.id} ${p.titulo}. ` +
    `Corrija, verifique e rode: ${SCRIPT} done ${p.id} "<evidência>" (ou fail ${p.id} "<motivo>" se não passar).`);
}
if (limiteAtingido) allow(`limite de ${b.limite} tarefas criadas pelo agente atingido e backlog zerado`);
const v = b.ultima_varredura;
if (!v || v.rev < b.rev || v.novos > 0) {
  block('Backlog zerado, mas falta a varredura final limpa. Varra de novo todo o escopo do objetivo atrás de bugs ' +
    `e melhorias concretas; registre com ${SCRIPT} add "<título>" --tipo bug|melhoria e depois ${SCRIPT} sweep "<o que varreu>" --novos N. ` +
    'O loop só termina com uma varredura sem novidades depois da última mudança.');
}
allow('concluído: backlog zerado e varredura final sem novidades');
