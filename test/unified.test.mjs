import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore,saveMessage,acceptDelivery,history} from '../src/store.mjs';
import {startJob,addJobEvent,cancelJob,recoverJobs} from '../src/jobs.mjs';
import {saveEvidence} from '../src/evidence.mjs';
import {calendarIssues,publishUnified,createUnifiedJobRunner} from '../src/unified.mjs';
import {imessageBubbles,plainMessage} from '../src/imessage-format.mjs';
import {createJobNotifier} from '../src/job-runner.mjs';
import {EvidenceRejected,PublicationRejected} from '../src/publication.mjs';

function setup(){
 const db=openStore(':memory:');acceptDelivery(db,'origin','owner','¿Qué harías con la factura?');
 db.prepare("UPDATE deliveries SET state='processing'").run();saveMessage(db,'origin','owner','user','¿Qué harías con la factura?');
 const start=startJob(db,'owner','origin','Factura','Revisar factura');db.prepare("UPDATE deliveries SET state='sent'").run();
 db.prepare('UPDATE jobs SET created=?').run(Date.parse('2026-09-18T14:30Z'));
 const job=db.prepare('SELECT * FROM jobs').get();
 const quote='El recibo del 18 de septiembre indica saldo pendiente de USD 200.00, vence el 22 de septiembre.';
 const sourceId=saveEvidence(db,job.id,'source_read','body',quote);
 const research={status:'completed',reply:'Según el recibo, quedan USD 200.00 para el martes 22 de septiembre.',checkpoint:'',notify:false,language:'es',findings:[{id:'f1',statement:quote,category:'money',importance:'normal',kind:'reported',citations:[{sourceId,quote}],calculationId:'',uncertainty:''}]};
 return {db,job,research,sourceId};
}
test('calendar rejects wrong weekday without blocking a correct service window or inventing a year override',()=>{
 assert.equal(calendarIssues('vence lunes 22 de septiembre','2026-09-18').length,1);
 assert.equal(calendarIssues('martes 22 de septiembre, 9:00–13:00 ET','2026-09-18').length,0);
 assert.equal(calendarIssues('lunes 22 de septiembre de 2025','2026-09-18').length,0);
 assert.equal(calendarIssues('lunes 31 de febrero','2026-09-18').length,1);
 assert.equal(calendarIssues('lunes 4 de enero','2026-12-20').length,0);
 assert.equal(calendarIssues('martes 4 de enero de 2027','2026-12-20').length,1);
});
test('material check sees uncited contradictory sources; accepted answer is author text, not a rewrite',async()=>{
 const {db,job,research}=setup();const other=saveEvidence(db,job.id,'source_read','body','El banco confirma otro pago posterior.');let calls=0;
 const run=async(_c,m,_id,_blocks,options)=>{calls++;assert.equal(options.isolated,true);const p=JSON.parse(m[0].body);assert.ok(p.sources.some(s=>s.id===other));assert.equal(p.reply,research.reply);return {issues:[]};};
 assert.equal(await publishUnified(db,job,research,{run}),research.reply);
 assert.equal(await publishUnified(db,job,research,{run}),research.reply);assert.equal(calls,1);
 await publishUnified(db,job,{...research,reply:'Según el recibo, el saldo es USD 200.00.'},{run:async()=>{calls++;return {issues:[]};}});assert.equal(calls,2);db.close();
});
test('factual correction returns draft, findings and source access to the same worker role',async()=>{
 const {db,job,research}=setup();let authors=0,checks=0;
 const runner=createUnifiedJobRunner(db,{autoStart:false,run:async(_c,m,_id,_blocks,o)=>{
  if(o.isolated){checks++;return {issues:[]};}
  authors++;assert.match(o.system,/You own a saved task/);
  if(authors===1)return {...research,reply:'El saldo vence lunes 22 de septiembre.'};
  const request=JSON.parse(m.at(-1).body);assert.match(request.checkpoint,/Previous draft.*lunes 22/s);assert.match(request.checkpoint,/martes/);assert.equal(request.previousFindings.length,1);
  return research;
 }});
 await runner.step();assert.equal(db.prepare('SELECT state FROM jobs').get().state,'queued');assert.equal(checks,0);
 await runner.step();assert.equal(db.prepare('SELECT state FROM jobs').get().state,'completed');assert.equal(authors,2);assert.equal(checks,1);await runner.stop();db.close();
});
test('material issues are bounded, tied to exact reply, and never silently approved',async()=>{
 const {db,job,research,sourceId}=setup();const run=async()=>({issues:[{quote:'USD 200.00',sourceIds:[sourceId],problem:'Another receipt reports a later payment; do not recommend a duplicate payment.'}]});
 for(let n=0;n<2;n++)await assert.rejects(publishUnified(db,job,research,{run}),EvidenceRejected);
 await assert.rejects(publishUnified(db,job,research,{run}),PublicationRejected);
 await assert.rejects(publishUnified(db,job,{...research,reply:'Nuevo texto'},{run:async()=>({issues:[{quote:'Invented quote',sourceIds:[],problem:'bad'}]})}),/ungrounded/);db.close();
});
test('plain iMessage formatting preserves meaning, money and links across bubbles',()=>{
 const input='**Saldo:** USD 200.00.\n\nConsulta [el recibo](https://example.com/r/42).\n\n¿Lo revisamos?';
 const parts=imessageBubbles(input);assert.deepEqual(parts,['Saldo: USD 200.00.','Consulta el recibo (https://example.com/r/42).','¿Lo revisamos?']);
 const long=Array.from({length:45},()=> 'Texto con $12.50 y fechas.').join(' ');
 const split=imessageBubbles(long,{maxChars:100});assert.equal(split.join(' '),long);assert.ok(split.every(s=>s.length<=100));
 assert.equal(plainMessage('17 * 4 = 68'), '17 * 4 = 68');
});
test('partial bubble send is saved, ambiguous second send stops and is never replayed after recovery',async()=>{
 const {db,job}=setup();addJobEvent(db,job,'completed','Uno.\n\nDos.\n\nTres.');let sends=0;
 const notifier=createJobNotifier(db,{autoStart:false,split:imessageBubbles,send:async()=>{if(++sends===2)throw new Error('network ambiguity');}});
 await notifier.flush();recoverJobs(db);await notifier.flush();assert.equal(sends,2);
 assert.deepEqual(db.prepare('SELECT state FROM job_event_parts ORDER BY part').all().map(p=>p.state),['sent','needs_review','pending']);
 assert.equal(history(db,'owner').at(-1).body,'Uno.');assert.equal(db.prepare('SELECT state FROM job_events').get().state,'needs_review');await notifier.stop();db.close();
});
test('cancelling between bubbles prevents unsent messages',async()=>{
 for(const rejectAfterCancel of [false,true]){
 const {db,job}=setup();addJobEvent(db,job,'finding','Uno.\n\nDos.');let sends=0;
 const notifier=createJobNotifier(db,{autoStart:false,split:imessageBubbles,send:async()=>{sends++;cancelJob(db,'owner',job.id);if(rejectAfterCancel)throw Error('Cancelled during send');}});
 await notifier.flush();await notifier.flush();assert.deepEqual(db.prepare('SELECT state FROM job_event_parts ORDER BY part').all().map(p=>p.state),['cancelled','cancelled']);
 await notifier.flush();assert.equal(sends,1);assert.equal(db.prepare('SELECT state FROM job_events').get().state,'cancelled');await notifier.stop();db.close();
 }
});
