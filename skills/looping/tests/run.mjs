#!/usr/bin/env node
// Testes do looping: node tests/run.mjs  (roda numa pasta temporária, não toca em loops reais)
import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const SCR = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts');
const dir = mkdtempSync(join(tmpdir(), 'looping-test-'));
const env = { ...process.env, CLAUDE_CODE_SESSION_ID: 'teste-sessao', HOME: dir, USERPROFILE: dir };
const run = (...a) => spawnSync(process.execPath, [join(SCR, 'loop.mjs'), ...a], { cwd: dir, env, encoding: 'utf8' });
const hook = (extra = {}) => {
  const r = spawnSync(process.execPath, [join(SCR, 'stop-check.mjs')], { cwd: dir, env, encoding: 'utf8',
    input: JSON.stringify({ cwd: dir, session_id: 'teste-sessao', ...extra }) });
  return r.stdout ? JSON.parse(r.stdout) : null;
};
const B = () => JSON.parse(readFileSync(join(dir, '.loop', 'backlog.json'), 'utf8'));
let ok = 0, falhas = 0;
const t = (nome, cond) => { if (cond) { ok++; console.log('✓', nome); } else { falhas++; console.log('✗', nome); } };

run('init', 'teste', '--limite', '3');
run('add', 'tarefa do usuário', '--origem', 'usuario');
t('hook bloqueia com item aberto', hook()?.decision === 'block' && /aberto/.test(hook().reason));
t('pergunta é bloqueada como pergunta', /parou para perguntar/.test(hook({ last_assistant_message: 'Fiz 3 itens. Quer que eu continue?' })?.reason || ''));
t('pergunta não conta para estagnação', (() => { const n = B().hook.bloqueios_sem_progresso; for (let i = 0; i < 12; i++) hook({ last_assistant_message: 'Posso seguir?' }); return B().ativo && B().hook.bloqueios_sem_progresso === n; })());
t('stop do agente é recusado', run('stop', 'x').status === 2 && B().ativo);
t('done sem evidência é recusado', run('done', '1').status === 2);
t('done com verificação que falha não fecha', run('done', '1', '--verificar', 'node -e "process.exit(1)"').status === 2 && B().itens[0].status === 'pendente');
t('done com verificação que passa fecha', run('done', '1', '--verificar', 'node -e "process.exit(0)"').status === 0 && B().itens[0].verificado);
t('init com loop ativo continua sem apagar', /CONTINUANDO/.test(run('init', 'outro pedido').stdout) && B().itens.length === 1);
t('sweep com achado cria item e conta novos', /1 novo/.test(run('sweep', 'tudo', '--achado', 'bug achado').stdout) && B().itens.length === 2);
t('hook bloqueia com o achado aberto', /aberto/.test(hook()?.reason || ''));
run('done', '2', 'ok');
t('hook pede varredura limpa', /varredura final/.test(hook()?.reason || ''));
t('sweep sem achados conta zero', /0 novo/.test(run('sweep', 'tudo de novo').stdout));
t('ask cria pergunta travada fora do limite', /NÃO pergunte/.test(run('ask', 'qual cor?').stdout) && B().itens.at(-1).status === 'travado');
run('sweep', 'final');
t('hook encerra quando acabou', /encerrado/.test(hook()?.reason || '') && !B().ativo);
t('init após fim arquiva o anterior', (run('init', 'novo'), B().itens.length === 0 && readdirSync(join(dir, '.loop', 'historico')).length === 1));
run('add', 'parado');
for (let i = 0; i < 10; i++) hook({ last_assistant_message: 'Resumo do que fiz.' });
t('estagnação pausa (não encerra)', B().pausado === true && !B().ativo);
t('init em loop pausado retoma', /CONTINUANDO/.test(run('init', 'x').stdout) && B().ativo && B().itens.length === 1);
t('limite vira sugestão', (() => { for (let i = 0; i < 20; i++) run('add', `x${i}`); return /sugestão/.test(run('add', 'extra').stdout) && B().sugestoes.length >= 1; })());
t('loop de outra sessão é ignorado', spawnSync(process.execPath, [join(SCR, 'stop-check.mjs')], { cwd: dir, env, encoding: 'utf8', input: JSON.stringify({ cwd: dir, session_id: 'outra' }) }).stdout === '');

try { rmSync(dir, { recursive: true, force: true }); } catch {}
console.log(`\n${ok} passaram, ${falhas} falharam`);
process.exit(falhas ? 1 : 0);
