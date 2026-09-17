import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore,acceptDelivery,saveMessage,history,prepare} from '../src/store.mjs';
import {startJob,listJobs,cancelJob,updateJob,notifyFinding,recoverJobs,addJobEvent,extractTaskReply} from '../src/jobs.mjs';
import {createJobRunner,createJobNotifier} from '../src/job-runner.mjs';
import {initReviews} from '../src/mail-review.mjs';
function setup(){const db=openStore(':memory:');acceptDelivery(db,'origin','owner','Revisa todos los correos');db.prepare("UPDATE deliveries SET state='processing'").run();saveMessage(db,'origin','owner','user','Revisa todos los correos');const job=startJob(db,'owner','origin','Correo de hoy','Review today carefully');return {db,job};}
const completed={status:'completed',reply:'Resultado confirmado.',checkpoint:'Facts and evidence.'};
test('jobs snapshot the request, bind to owner, deduplicate, and wait for delivered acknowledgment',async()=>{
 const {db,job}=setup();assert.equal(startJob(db,'owner','origin','again','again').id,job.id);
 assert.throws(()=>startJob(db,'stranger','origin','Bad','Bad'));assert.throws(()=>cancelJob(db,'stranger',job.id));
 let runs=0;const runner=createJobRunner(db,{autoStart:false,run:async()=>{runs++;return completed;}});
 await runner.step();assert.equal(runs,0);
 saveMessage(db,'later','owner','user','Unrelated later chat');
 assert.equal(JSON.parse(db.prepare('SELECT snapshot FROM jobs').get().snapshot).messages.length,1);
 db.prepare("UPDATE deliveries SET state='sent'").run();await runner.step();assert.equal(runs,1);assert.equal(listJobs(db,'owner')[0].state,'completed');db.close();
});
test('foreground remains available while work runs; cancellation prevents late completion',async()=>{
 const {db,job}=setup();db.prepare("UPDATE deliveries SET state='sent'").run();let finish;const pending=new Promise(r=>finish=r);
 const runner=createJobRunner(db,{autoStart:false,run:async()=>pending});const work=runner.step();
 assert.equal(listJobs(db,'owner')[0].state,'running');
 saveMessage(db,'hello','owner','user','Hola');assert.equal(history(db,'owner').at(-1).body,'Hola');
 assert.equal(cancelJob(db,'owner',job.id).state,'cancelled');finish(completed);await work;
 assert.equal(db.prepare('SELECT count(*) AS n FROM job_events').get().n,0);assert.equal(listJobs(db,'owner')[0].state,'cancelled');db.close();
});
test('new owner clarification forces another segment before a stale result is sent',async()=>{
 const {db,job}=setup();db.prepare("UPDATE deliveries SET state='sent'").run();let finish;const pending=new Promise(r=>finish=r);
 const runner=createJobRunner(db,{autoStart:false,run:async()=>pending});const work=runner.step();
 updateJob(db,'owner',job.id,'owner-update','Solo los de ayer');finish(completed);await work;
 assert.equal(listJobs(db,'owner')[0].state,'queued');assert.equal(db.prepare('SELECT count(*) AS n FROM job_events').get().n,0);db.close();
});
test('incomplete mail coverage cannot produce a completed job; checkpoint survives restart',async()=>{
 const {db,job}=setup();db.prepare("UPDATE deliveries SET state='sent'").run();initReviews(db);
 db.prepare("INSERT INTO mail_reviews VALUES ('review','owner',?,'query','next','listing',0)").run(job.id);
 const runner=createJobRunner(db,{autoStart:false,run:async()=>completed});await runner.step();
 assert.equal(listJobs(db,'owner')[0].state,'queued');assert.match(db.prepare('SELECT checkpoint FROM jobs').get().checkpoint,/Coverage incomplete/);
 db.prepare("UPDATE jobs SET state='running'").run();recoverJobs(db);assert.equal(listJobs(db,'owner')[0].state,'queued');db.close();
});
test('notifications persist, avoid chatter and do not retry ambiguous sends',async()=>{
 const {db,job}=setup();db.prepare("UPDATE jobs SET state='running'").run();notifyFinding(db,'owner',job.id,'Hallazgo importante.');
 assert.equal(notifyFinding(db,'owner',job.id,'Otro detalle.').queued,false);
 let sends=0;const notifier=createJobNotifier(db,{autoStart:false,send:async()=>{sends++;throw new Error('ambiguous send');}});
 await notifier.flush();await notifier.flush();assert.equal(sends,1);assert.equal(db.prepare('SELECT state FROM job_events').get().state,'needs_review');
 addJobEvent(db,job,'completed','Resultado.');const ok=createJobNotifier(db,{autoStart:false,send:async(_conversation,body)=>{sends++;assert.equal(body,'Resultado.');}});await ok.flush();
 assert.equal(history(db,'owner').at(-1).role,'assistant');assert.match(history(db,'owner').at(-1).body,/Resultado/);db.close();
});
test('task result schema prevents unvalidated final messages; approval origins remain distinct',()=>{
 assert.deepEqual(extractTaskReply({type:'result',subtype:'success',structured_output:completed}),completed);
 assert.throws(()=>extractTaskReply({type:'result',subtype:'success',structured_output:{...completed,reply:'<thinking>private</thinking>'}}));
 assert.throws(()=>extractTaskReply({type:'result',subtype:'success',structured_output:{status:'continue',reply:'',checkpoint:''}}));
 const db=openStore(':memory:');const a=prepare(db,'owner','gmail_archive',{messageId:'a'},'turn-a');const b=prepare(db,'owner','gmail_archive',{messageId:'b'},'turn-b');
 assert.equal(db.prepare("SELECT code FROM approval_origins WHERE turn_id='turn-a'").get().code,a.code);assert.notEqual(a.code,b.code);db.close();
});

test('a blocked task can resume on explicit owner clarification without stale blocked notices',()=>{
 const {db,job}=setup();db.prepare("UPDATE jobs SET state='blocked'").run();addJobEvent(db,job,'blocked','Falta una aclaración');
 updateJob(db,'owner',job.id,'new-source','Retoma la tarea, usa ayer');assert.equal(listJobs(db,'owner')[0].state,'queued');assert.equal(db.prepare('SELECT state FROM job_events').get().state,'cancelled');db.close();
});
