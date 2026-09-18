// Real Claude Code + installed CUA + existing Chrome. No Photon, no account data.
import {createServer} from 'node:http';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {homedir} from 'node:os';
import assert from 'node:assert/strict';
const {checkDesktop}=await import('../src/cua.mjs');checkDesktop();
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const base=resolve(homedir(),'.local/share/narciso/evaluations');mkdirSync(base,{recursive:true,mode:0o700});const resume=process.env.NARCISO_CUA_RESUME;const directory=resume?resolve(resume):mkdtempSync(resolve(base,'cua-'));
assert.ok(directory.startsWith(base+'/cua-'));
const saved=resume?JSON.parse(readFileSync(resolve(directory,'run.json'),'utf8')):null;
process.env.NARCISO_DATA_DIR=directory;process.env.NARCISO_BROWSER_INTERACTIVE='1';process.env.NARCISO_BROWSER_BACKEND='cua';
let submissions=[];
const server=createServer(async(req,res)=>{
 if(req.method==='POST'&&req.url==='/result'){
  let body='';for await(const chunk of req){body+=chunk;if(body.length>10000){res.writeHead(413).end();return}}
  submissions.push(Object.fromEntries(new URLSearchParams(body)));writeFileSync(resolve(directory,'submissions.json'),JSON.stringify(submissions),{mode:0o600});
  res.setHeader('Content-Type','text/html');res.end('<h1>Demo received</h1><pre>'+JSON.stringify(submissions.at(-1),null,2).replaceAll('<','&lt;')+'</pre>');
 }else if(req.url==='/')res.end(readFileSync(resolve(root,'test/fixtures/cua-form.html')));
 else res.writeHead(404).end();
});await new Promise(r=>server.listen(saved?.port||0,'127.0.0.1',r));
const {openStore,acceptDelivery}=await import('../src/store.mjs');const {handle}=await import('../src/assistant.mjs');const db=openStore(),conversation=saved?.conversation||'cua-eval-'+Date.now(),transcript=[];
if(resume)db.prepare("UPDATE deliveries SET state='failed' WHERE state='processing'").run();
writeFileSync(resolve(directory,'run.json'),JSON.stringify({port:server.address().port,conversation}),{mode:0o600});
console.log(JSON.stringify({directory,port:server.address().port}));
async function turn(body){const id='cua-test-'+Date.now()+'-'+(transcript.length+1);acceptDelivery(db,id,conversation,body);db.prepare("UPDATE deliveries SET state='processing' WHERE id=?").run(id);const reply=await handle(db,conversation,body,id);db.prepare("UPDATE deliveries SET state='completed' WHERE id=?").run(id);transcript.push({body,reply});writeFileSync(resolve(directory,'transcript.json'),JSON.stringify(transcript,null,2),{mode:0o600});console.log(JSON.stringify({turn:transcript.length,reply}));assert.doesNotMatch(reply,/approve [A-F0-9]{8}/i);}
try{
 await turn(`${resume?'Retoma la MISMA pestaña existente de la prueba interrumpida, conserva lo que ya esté correcto y completa lo que falta. La página es':'Abre UNA pestaña nueva en Chrome con'} http://127.0.0.1:${server.address().port}/. Es una prueba local con datos ficticios. Completa Customer name con NARCISO-CUA, Pizza Small, Bacon, Delivery Driveway, Instructions Dejar en el driveway. Activa el indicador del control personalizado (círculo azul, debe quedar verde). Comprueba los campos y NO envíes todavía.`);
 assert.equal(submissions.length,0,'Preparation must not submit');
 const rows=db.prepare('SELECT operation,state FROM cua_actions').all();assert.ok(rows.length>5,'Must actually use CUA');
 await turn('Ahora envía ese formulario de demostración una sola vez y verifica el resultado devuelto. Deja abierta la pestaña.');
 assert.equal(submissions.length,1,'Exactly one synthetic submission');
 assert.deepEqual(submissions[0],{name:'NARCISO-CUA',size:'small',topping:'bacon',delivery:'driveway',instructions:'Dejar en el driveway',custom:'on'});
 assert.equal(db.prepare('SELECT count(*) n FROM approvals').get().n,0);
 const summary={passed:true,directory,backend:'cua',submissionVerified:true,customCanvasVerified:true,turns:transcript.length,resumed:Boolean(resume)};writeFileSync(resolve(directory,'summary.json'),JSON.stringify(summary),{mode:0o600});console.log(JSON.stringify(summary));
}finally{db.close();await new Promise(r=>server.close(r));}
