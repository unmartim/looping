#!/usr/bin/env node
// Imprime uma página HTML (cartão de status do looping) a partir de .loop/backlog.json.
// Uso: node card.mjs  → passe a saída para openbot.html_render.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const FILE = join(process.cwd(), '.loop', 'backlog.json');
if (!existsSync(FILE)) { console.error('Sem .loop/backlog.json nesta pasta.'); process.exit(2); }
const b = JSON.parse(readFileSync(FILE, 'utf8'));
const dados = {
  objetivo: b.objetivo, limite: b.limite, ativo: b.ativo, motivo: b.motivo_fim || '',
  v: b.ultima_varredura ? { quando: b.ultima_varredura.quando, novos: b.ultima_varredura.novos } : null,
  sug: (b.sugestoes || []).length,
  itens: b.itens.map(({ id, titulo, tipo, origem, status }) => ({ id, titulo, tipo, origem, status })),
};
const json = JSON.stringify(dados).replace(/</g, '\\u003c');

process.stdout.write(`<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}body{margin:0;font-family:var(--font-sans);color:var(--foreground)}
.wrap{display:flex;flex-direction:column;gap:12px;padding:4px 2px}
.top{display:flex;justify-content:space-between;align-items:center}
.brand{font-weight:600;font-size:15px}.brand span{color:var(--chart-1)}
.pill{font-size:12px;padding:3px 10px;border-radius:999px;border:1px solid var(--border);color:var(--muted-foreground)}
.pill.on{border-color:var(--success);color:var(--success)}
.card{border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;background:var(--card)}
.obj{font-weight:600;font-size:14px;margin-bottom:10px}.fim{font-size:12px;color:var(--muted-foreground);margin-top:6px}
.bar{height:8px;border-radius:99px;background:var(--muted);overflow:hidden}.bar i{display:block;height:100%;background:var(--success);border-radius:99px}
.prog{display:flex;justify-content:space-between;font-size:12px;color:var(--muted-foreground);margin-top:6px}.prog b{color:var(--foreground)}
.chips{display:flex;flex-wrap:wrap;gap:6px}.chip{font-size:12px;padding:3px 9px;border-radius:999px;background:var(--muted);color:var(--muted-foreground)}
.chip.on{color:var(--foreground)}.chip .d{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:6px;vertical-align:1px}
.kv{display:grid;grid-template-columns:1fr auto;row-gap:4px;font-size:13px}.kv span:nth-child(odd){color:var(--muted-foreground)}
.now{border-color:var(--chart-1)}.now small{color:var(--chart-1);font-weight:600;font-size:12px}.now div{font-size:14px;margin-top:3px}
ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px}
li{display:grid;grid-template-columns:18px 1fr auto;gap:8px;font-size:13px;padding:6px 4px}
li .t{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}li .m{font-size:11px;color:var(--muted-foreground)}
li.feito .t{color:var(--muted-foreground);text-decoration:line-through}
.sug{font-size:12px;color:var(--chart-4)}
.btns{display:flex;gap:8px}button{font:inherit;font-size:12px;padding:6px 12px;border-radius:var(--radius);border:1px solid var(--border);background:transparent;color:var(--foreground);cursor:pointer}
button:hover{background:var(--muted)}button.danger{color:var(--destructive);border-color:var(--destructive)}
</style></head><body><div class="wrap" id="app"></div><script>
const b=${json};
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const S={fazendo:['◆','var(--chart-1)'],pendente:['○','var(--foreground)'],feito:['✓','var(--success)'],travado:['✕','var(--destructive)'],conflito:['⇄','var(--chart-4)']};
const ord=['fazendo','pendente','travado','conflito','feito'];const c=s=>b.itens.filter(i=>i.status===s).length;
const tot=b.itens.length,fe=c('feito'),pct=tot?Math.round(fe/tot*100):0,ag=b.itens.filter(i=>i.origem==='agente').length;
const at=b.itens.find(i=>i.status==='fazendo');
const h=b.v?new Date(b.v.quando).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})+' · '+(b.v.novos?b.v.novos+' novo(s)':'limpa'):'pendente';
const chip=s=>'<span class="chip '+(c(s)?'on':'')+'"><span class="d" style="background:'+(c(s)?S[s][1]:'var(--border)')+'"></span>'+c(s)+' '+s+'</span>';
const lista=b.itens.filter(i=>i!==at).sort((x,y)=>ord.indexOf(x.status)-ord.indexOf(y.status)||y.id-x.id).map(i=>'<li class="'+i.status+'"><span style="color:'+S[i.status][1]+'">'+S[i.status][0]+'</span><span class="t">'+esc(i.titulo)+'</span><span class="m">'+i.tipo+(i.origem==='usuario'?' · você':'')+'</span></li>').join('');
const send=t=>{if(window.openbotPage)openbotPage.sendMessage(t)};
document.getElementById('app').innerHTML='<div class="top"><div class="brand"><span>⟳</span> Looping</div><div class="pill '+(b.ativo?'on':'')+'">'+(b.ativo?'● ativo':'■ encerrado')+'</div></div>'
+'<div class="card"><div class="obj">'+esc(b.objetivo)+'</div><div class="bar"><i style="width:'+pct+'%"></i></div><div class="prog"><span><b>'+pct+'%</b> concluído</span><span>'+fe+'/'+tot+' tarefas</span></div>'+(b.motivo?'<div class="fim">'+esc(b.motivo)+'</div>':'')+'</div>'
+'<div class="chips">'+ord.map(chip).join('')+'</div>'
+'<div class="kv"><span>descobertas do agente</span><span>'+ag+'/'+b.limite+'</span><span>última varredura</span><span>'+h+'</span></div>'
+(at?'<div class="card now"><small>◆ AGORA</small><div>#'+at.id+' '+esc(at.titulo)+'</div></div>':'')
+'<ul>'+lista+'</ul>'+(b.sug?'<div class="sug">✦ '+b.sug+' sugestão(ões) além do limite</div>':'')
+(b.ativo?'<div class="btns"><button id="r">Ver relatório</button><button class="danger" id="p">Parar loop</button></div>':'');
const r=document.getElementById('r');if(r){r.onclick=()=>send('Me mostra o relatório do loop');document.getElementById('p').onclick=()=>send('Para o loop');}
</script></body></html>`);
