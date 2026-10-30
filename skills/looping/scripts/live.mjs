#!/usr/bin/env node
// Servidor local do cartão ao vivo do looping. Só escuta em 127.0.0.1 e só lê backlogs registrados.
//   GET /health          → { ok: true }
//   GET /loop/<sessao>   → o backlog da sessão (registro em ~/.looping/sessoes.json)
// Encerra sozinho depois de 30 min sem nenhum loop ativo.
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export const PORTA = 47821;
const REG = join(homedir(), '.looping', 'sessoes.json');
const ler = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } };
let ultimoAtivo = Date.now();

const srv = http.createServer((req, res) => {
  const h = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/health') { res.writeHead(200, h); return res.end('{"ok":true}'); }
  const m = url.pathname.match(/^\/loop\/([\w-]+)$/);
  if (!m) { res.writeHead(404, h); return res.end('{}'); }
  const reg = existsSync(REG) ? ler(REG) || {} : {};
  const arq = reg[m[1]];
  const b = arq && existsSync(arq) ? ler(arq) : null;
  if (!b) { res.writeHead(404, h); return res.end('{}'); }
  if (b.ativo) ultimoAtivo = Date.now();
  const { objetivo, limite, ativo, motivo_fim, ultima_varredura, sugestoes = [], itens } = b;
  res.writeHead(200, h);
  res.end(JSON.stringify({
    objetivo, limite, ativo, motivo: motivo_fim || '', sug: sugestoes.length,
    v: ultima_varredura ? { quando: ultima_varredura.quando, novos: ultima_varredura.novos } : null,
    itens: itens.map(({ id, titulo, tipo, origem, status }) => ({ id, titulo, tipo, origem, status })),
  }));
});
srv.on('error', () => process.exit(0)); // porta já em uso: outro servidor já atende
srv.listen(PORTA, '127.0.0.1');
setInterval(() => {
  const reg = existsSync(REG) ? ler(REG) || {} : {};
  if (Object.values(reg).some((f) => ler(f)?.ativo)) ultimoAtivo = Date.now();
  if (Date.now() - ultimoAtivo > 30 * 60 * 1000) process.exit(0);
}, 60 * 1000);
