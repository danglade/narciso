import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {openStore,acceptDelivery,saveMessage} from '../src/store.mjs';
import {createCancellation,cancellationCommand} from '../src/cancellation.mjs';
import {recoverJobs,startJob,addJobEvent} from '../src/jobs.mjs';
import {createJobNotifier} from '../src/job-runner.mjs';
import {createInboundBurst} from '../src/inbound-burst.mjs';
const exec=promisify(execFile),url=name=>pathToFileURL(resolve('src',name)).href;
const command=text=>cancellationCommand({type:'text',text});
test('cancellation while a background notification waits to send preserves cancelled state and suppresses stale output',async()=>{
 const db=openStore(':memory:'),c=createCancellation(db);
 try{
 acceptDelivery(db,'origin','owner','Review');db.prepare("UPDATE deliveries SET state='processing'").run();
 const job=startJob(db,'owner','origin','Review','Review');addJobEvent(db,job,'completed','Stale result');
 let ready,release;const entered=new Promise(r=>ready=r),gate=new Promise(r=>release=r);let sent=0;
 const notifier=createJobNotifier(db,{autoStart:false,send:async(_conversation,_body,isCurrent)=>{ready();await gate;if(!isCurrent())throw Error('cancelled');sent++;}});
 const pending=notifier.flush();await entered;acceptDelivery(db,'stop','owner','para');c.cancel('owner','stop',command('para'));release();await pending;
 assert.equal(sent,0);assert.equal(db.prepare('SELECT state FROM job_events').get().state,'cancelled');
 assert.equal(db.prepare("SELECT count(*) n FROM messages WHERE role='assistant'").get().n,0);
 }finally{db.close();}
});
test('recognizes standalone English/Spanish stop including owner typo, never account actions or quoted content',()=>{
 for(const text of ['No pera','No hagas más nada','No hagas nada más','Narciso, para por favor.','cancela la tarea','STOP!','cancel this task','Please stop','Don’t do anything else'])assert.ok(command(text),text);
 for(const text of ['No pares','cancela mi suscripción','cancel my order','para mañana revisa el correo','El correo dice "stop"','¿Puedes explicar cómo cancelar?','stop and pay the invoice'])assert.equal(command(text),null,text);
 assert.equal(cancellationCommand({type:'attachment',text:'stop'}),null);
 assert.equal(cancellationCommand({type:'group',items:[{content:{type:'text',text:'stop'}}]}),null);
 assert.ok(cancellationCommand({type:'reply',content:{type:'text',text:'stop'},quoted:{text:'pay'}}));
});
test('cancellation revokes active, queued, blocked and pending actions durably within one conversation',()=>{
 const db=openStore(':memory:'),c=createCancellation(db);
 try{
 for(const [id,conv] of [['active','one'],['queued','one'],['other','two'],['stop','one']]){acceptDelivery(db,id,conv,id);saveMessage(db,id,conv,'user',id);}
 db.prepare("UPDATE deliveries SET state='processing' WHERE id='active'").run();const run=c.begin('one','active');
 db.prepare("INSERT INTO jobs(id,conversation,origin,title,objective,snapshot,state,created,updated) VALUES ('job','one','active','x','x','{}','running',1,1)").run();
 db.prepare("INSERT INTO job_events VALUES ('event','job','finding','late','pending',1)").run();
 db.prepare("INSERT INTO approvals VALUES ('ABCD','one','x','{}','pending',1)").run();
 const before=c.epoch('one');assert.match(c.cancel('one','stop',command('No hagas mas nada')),/Detenido/);
 assert.ok(run.signal.aborted);assert.throws(run.check,/cancelled/);
 assert.equal(db.prepare("SELECT state FROM deliveries WHERE id='queued'").get().state,'cancelled');
 assert.equal(db.prepare("SELECT state FROM deliveries WHERE id='other'").get().state,'queued');
 assert.equal(db.prepare('SELECT state FROM jobs').get().state,'cancelled');assert.equal(db.prepare('SELECT state FROM job_events').get().state,'cancelled');assert.equal(db.prepare('SELECT state FROM approvals').get().state,'cancelled');
 assert.ok(c.epoch('one')>before);assert.equal(c.epoch('two'),0);
 recoverJobs(db);const again=createCancellation(db);assert.equal(again.epoch('one'),c.epoch('one'));assert.equal(db.prepare('SELECT state FROM jobs').get().state,'cancelled');
 acceptDelivery(db,'new','one','new task');db.prepare("UPDATE deliveries SET state='processing' WHERE id='new'").run();const next=c.begin('one','new');run.end();next.check();next.end();
 }finally{db.close()}
});
test('stop discards an unflushed URL/caption burst',()=>{
 const emitted=[],scheduled=[];const burst=createInboundBurst({emit:x=>emitted.push(x),schedule:f=>(scheduled.push(f),1),cancel:()=>{}});
 burst.push({space:{id:'one'},message:{content:{type:'text',text:'https://example.com'}}});burst.discard('one');scheduled[0]();assert.deepEqual(emitted,[]);
});
test('actual Photon gateway prioritizes stop, aborts active execution, drops queued work and sends a new screenshot before its reply',async()=>{
 const dir=mkdtempSync('/tmp/narciso-cancel-gateway-');
 try{
 const log=dir+'/events.jsonl';
 writeFileSync(dir+'/sdk.mjs',`import{appendFileSync}from'node:fs';export const attachment=(bytes,options)=>({type:'attachment',bytes,options});export const text=t=>({type:'text',text:t});const log=x=>appendFileSync(${JSON.stringify(log)},JSON.stringify(x)+'\\n');
 export async function Spectrum(){setInterval(()=>{},1000);const space={id:'dm',type:'dm',send:async c=>{log(c.type==='attachment'?{image:c.bytes.length,mime:c.options.mimeType}:{sent:c.text});return{};}};
 const message=(id,t)=>({id,direction:'inbound',sender:{address:'+15550000001'},timestamp:new Date().toISOString(),content:text(t),read:async()=>log({read:id})});
 return {stop:async()=>{},messages:(async function*(){yield[space,message('a','long task')];while(!globalThis.cancelTestStarted)await new Promise(r=>setTimeout(r,5));yield[space,message('b','queued mutation')];yield[space,message('c','No hagas más nada')];yield[space,message('d','screenshot please')];setTimeout(()=>process.kill(process.pid,'SIGTERM'),1500);await new Promise(()=>{});})()};}
 `);
 writeFileSync(dir+'/imessage.mjs',`export const imessage=()=>({});imessage.config=()=>({});`);
 writeFileSync(dir+'/runner.mjs',`export const createJobRunner=()=>({stop:async()=>{}});export const createJobNotifier=()=>({stop:async()=>{}});`);
 writeFileSync(dir+'/assistant.mjs',`import{queueCapture}from ${JSON.stringify(url('browser-captures.mjs'))};import{appendFileSync}from'node:fs';const log=x=>appendFileSync(${JSON.stringify(log)},JSON.stringify(x)+'\\n');export async function handle(db,conversation,input,id,media){log({handled:input});if(input==='long task'){globalThis.cancelTestStarted=true;await new Promise((r,j)=>{media.signal.addEventListener('abort',()=>{log({aborted:true});r();},{once:true});});return 'STALE';}queueCapture(db,{conversation,turnId:id,windowId:10,pid:7,title:'synthetic',image:{mimeType:'image/png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jx1kAAAAASUVORK5CYII='}});return 'Aquí está';}`);
 writeFileSync(dir+'/loader.mjs',`const replacements=${JSON.stringify({'spectrum-ts':pathToFileURL(dir+'/sdk.mjs').href,'spectrum-ts/providers/imessage':pathToFileURL(dir+'/imessage.mjs').href,[url('assistant.mjs')]:pathToFileURL(dir+'/assistant.mjs').href,[url('job-runner.mjs')]:pathToFileURL(dir+'/runner.mjs').href})};export async function resolve(s,c,n){const key=replacements[s]?s:(c.parentURL?new URL(s,c.parentURL).href:s);return replacements[key]?{url:replacements[key],shortCircuit:true}:n(s,c);}`);
 await exec(process.execPath,['--experimental-loader',dir+'/loader.mjs',resolve('src/photon.mjs')],{env:{...process.env,NARCISO_DATA_DIR:dir,NARCISO_OWNER_PHONE:'+15550000001',PHOTON_PROJECT_ID:'fake',PHOTON_PROJECT_SECRET:'fake'},timeout:8000});
 const events=readFileSync(log,'utf8').trim().split('\n').map(JSON.parse);
 assert.ok(events.some(e=>e.aborted));assert.deepEqual(events.filter(e=>e.handled).map(e=>e.handled),['long task','screenshot please']);
 assert.deepEqual(events.filter(e=>e.sent).map(e=>e.sent),['Detenido. No seguiré con esa tarea.','Aquí está']);
 assert.ok(events.find(e=>e.image)?.image>0);assert.ok(events.findIndex(e=>e.image)<events.findIndex(e=>e.sent==='Aquí está'));
 const db=openStore(dir+'/narciso.sqlite');assert.equal(db.prepare("SELECT state FROM deliveries WHERE id='dm:a'").get().state,'cancelled');assert.equal(db.prepare("SELECT state FROM deliveries WHERE id='dm:b'").get().state,'cancelled');db.close();
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test('aborting real Claude subprocess wrapper also terminates its MCP-like descendant',async()=>{
 const dir=mkdtempSync('/tmp/narciso-cancel-process-');
 try{
 const marker=dir+'/child.pid';
 writeFileSync(dir+'/fake-claude',`#!${process.execPath}\nconst{spawn}=require('node:child_process');const child=spawn(process.execPath,['-e',${JSON.stringify("process.on('SIGTERM',()=>{});require('node:fs').writeFileSync("+JSON.stringify(marker)+",String(process.pid));setInterval(()=>{},1000);")}],{stdio:'ignore'});process.on('SIGTERM',()=>process.exit(0));setInterval(()=>{},1000);`,{mode:0o700});
 writeFileSync(dir+'/run.mjs',`import assert from'node:assert/strict';import{existsSync,readFileSync}from'node:fs';import{respond}from ${JSON.stringify(url('claude.mjs'))};const c=new AbortController();const result=respond('test',[{role:'user',body:'synthetic'}],'test',[],{isolated:true,signal:c.signal});const rejection=assert.rejects(result,{name:'AbortError'});for(let i=0;i<100&&!existsSync(${JSON.stringify(marker)});i++)await new Promise(r=>setTimeout(r,20));assert.ok(existsSync(${JSON.stringify(marker)}));const pid=Number(readFileSync(${JSON.stringify(marker)},'utf8'));c.abort();await rejection;for(let i=0;i<100;i++){try{process.kill(pid,0)}catch(e){if(e.code==='ESRCH'){console.log('descendant terminated');process.exit(0)}throw e;}await new Promise(r=>setTimeout(r,20));}throw Error('Descendant survived cancellation');`);
 const {stdout}=await exec(process.execPath,[dir+'/run.mjs'],{env:{...process.env,NARCISO_DATA_DIR:dir,NARCISO_CLAUDE_BIN:dir+'/fake-claude'},timeout:9000});assert.match(stdout,/descendant terminated/);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
