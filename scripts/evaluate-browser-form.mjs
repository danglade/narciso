// Live regression: synthetic httpbin form only, isolated history, no Photon.
// Requires the already-connected local Chrome extension; never starts a gateway.
import {mkdtempSync,mkdirSync,symlinkSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {homedir} from 'node:os';
import assert from 'node:assert/strict';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const runtime=process.env.NARCISO_DATA_DIR||resolve(homedir(),'.local/share/narciso/data');
const evaluations=resolve(homedir(),'.local/share/narciso/evaluations');mkdirSync(evaluations,{recursive:true,mode:0o700});
const directory=mkdtempSync(resolve(evaluations,'form-controls-'));
process.env.NARCISO_DATA_DIR=directory;process.env.NARCISO_BROWSER_INTERACTIVE='1';
symlinkSync(resolve(runtime,'browser.sock'),resolve(directory,'browser.sock'));
const load=p=>import(pathToFileURL(resolve(root,p)));
const {browserRequest}=await load('src/browser.mjs');
const status=await browserRequest('test',{op:'status'});
if(status.interactionVersion!==3)throw Error('Reload Narciso extension 0.2.2 before this live regression. No form opened.');
const {openStore,acceptDelivery}=await load('src/store.mjs');const {handle}=await load('src/assistant.mjs');
const origin=process.env.NARCISO_TEST_FORM_ORIGIN||'https://httpbin.org';
assert.ok(['https://httpbin.org','https://httpbingo.org'].includes(origin));
const db=openStore();const conversation='synthetic-form-controls-'+Date.now();const transcript=[];
async function turn(body){
 const id='test-'+(transcript.length+1);acceptDelivery(db,id,conversation,body);db.prepare("UPDATE deliveries SET state='processing' WHERE id=?").run(id);
 const reply=await handle(db,conversation,body,id);db.prepare("UPDATE deliveries SET state='completed' WHERE id=?").run(id);
 transcript.push({body,reply});writeFileSync(resolve(directory,'transcript.json'),JSON.stringify(transcript,null,2),{mode:0o600});
 console.log(JSON.stringify({turn:transcript.length,reply}));assert.doesNotMatch(reply,/approve [A-F0-9]{8}|falta tu aprobaci[oó]n/i);
}
try{
 await turn('Usa exclusivamente este sitio, sin espejos alternativos. Abre '+origin+'/forms/post y completa este formulario de prueba con datos ficticios: Customer name NARCISO-CONTROLS, Telephone 202-555-0142, E-mail narciso-demo@example.com. Pizza Small, topping Bacon, delivery time 5:00 PM, instrucciones Dejar en el driveway. No envíes todavía.');
 const errands=db.prepare('SELECT * FROM errands').all();assert.equal(errands.length,1,'Reuse a single tab/errand');
 const tabId=errands[0].tab_id;
 // Host observation replaces the snapshot; subsequent model turns must inspect.
 const page=await browserRequest(conversation,{op:'inspect',tabId});assert.equal(page.url,origin+'/forms/post');
 for(const label of ['Small','Bacon'])assert.equal(page.controls.find(c=>c.label===label)?.checked,true,`${label} must actually be selected`);
 assert.equal(db.prepare('SELECT count(*) n FROM approvals').get().n,0);
 assert.equal(db.prepare("SELECT count(*) n FROM errand_actions WHERE json_extract(payload,'$.operation.action')='click'").get().n,0,'Do not submit a fill-only request');
 await turn('Ahora envía ese formulario de demostración con los datos ficticios y verifica los valores devueltos. Deja la pestaña abierta para que yo pueda comprobar el resultado.');
 const result=await browserRequest(conversation,{op:'read',tabId});assert.equal(result.url,origin+'/post');
 const form=JSON.parse(result.text).form;const echoed=Object.fromEntries(Object.entries(form).map(([k,v])=>[k,Array.isArray(v)&&v.length===1?v[0]:v]));
 assert.deepEqual(echoed,{comments:'Dejar en el driveway',custemail:'narciso-demo@example.com',custname:'NARCISO-CONTROLS',custtel:'202-555-0142',delivery:'17:00',size:'small',topping:'bacon'});
 assert.equal(db.prepare("SELECT count(*) n FROM errand_actions WHERE json_extract(payload,'$.operation.action')='click'").get().n,1,'Submit exactly once');
 assert.equal(db.prepare("SELECT count(*) n FROM errand_actions WHERE state IN ('needs_review','executing')").get().n,0);
 const summary={passed:true,directory,origin,turns:transcript.length,radioVerified:true,checkboxVerified:true,echoVerified:true};writeFileSync(resolve(directory,'summary.json'),JSON.stringify(summary,null,2),{mode:0o600});console.log(JSON.stringify(summary));
}finally{
 if(db.prepare("SELECT name FROM sqlite_master WHERE name='errands'").get())for(const e of db.prepare('SELECT tab_id FROM errands').all())try{await browserRequest(conversation,{op:'close',tabId:e.tab_id});}catch{}
 db.close();
}
