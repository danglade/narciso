import {randomBytes,createHash} from 'node:crypto';
import {history} from './store.mjs';
export const activeStates=['waiting_ack','queued','running'];
export function initJobs(db){db.exec(`
 CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,conversation TEXT NOT NULL,origin TEXT UNIQUE NOT NULL,title TEXT NOT NULL,objective TEXT NOT NULL,snapshot TEXT NOT NULL,state TEXT NOT NULL,checkpoint TEXT NOT NULL DEFAULT '',result TEXT,steps INTEGER NOT NULL DEFAULT 0,failures INTEGER NOT NULL DEFAULT 0,created INTEGER NOT NULL,updated INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS job_updates(id INTEGER PRIMARY KEY,job_id TEXT NOT NULL,source TEXT NOT NULL,body TEXT NOT NULL,created INTEGER NOT NULL,UNIQUE(job_id,source));
 CREATE TABLE IF NOT EXISTS job_events(id TEXT PRIMARY KEY,job_id TEXT NOT NULL,kind TEXT NOT NULL,body TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending',created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS approval_origins(code TEXT PRIMARY KEY,turn_id TEXT NOT NULL);
`);}
export function boundJob(db,id,conversation){const job=db.prepare('SELECT * FROM jobs WHERE id=? AND conversation=?').get(id,conversation);if(!job)throw new Error('Unsupported task: not found in this conversation.');return job;}
export function startJob(db,conversation,origin,title,objective){
 const delivery=db.prepare("SELECT id FROM deliveries WHERE id=? AND conversation=? AND state='processing'").get(origin,conversation);
 if(!delivery)throw new Error('Unsupported task: no active owner message.');
 const existing=db.prepare('SELECT id,title,state FROM jobs WHERE origin=?').get(origin);if(existing)return existing;
 if(db.prepare("SELECT count(*) AS n FROM jobs WHERE conversation=? AND state IN ('waiting_ack','queued','running')").get(conversation).n>=3)throw new Error('Unsupported task: three investigations already active. Finish or cancel one first.');
 const id='T-'+randomBytes(4).toString('hex').toUpperCase();
 const images=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='media_images'").get()?db.prepare('SELECT delivery,path FROM media_images WHERE conversation=? ORDER BY created DESC,rowid DESC LIMIT 4').all(conversation).reverse():[];
 const snapshot=JSON.stringify({messages:history(db,conversation),images});
 db.prepare("INSERT INTO jobs(id,conversation,origin,title,objective,snapshot,state,created,updated) VALUES (?,?,?,?,?,?,'waiting_ack',?,?)").run(id,conversation,origin,title,objective,snapshot,Date.now(),Date.now());
 return {id,title,state:'waiting_ack',instruction:'Reply now with a short natural acknowledgment, without task IDs or technical headers. The host starts the saved investigation after this reply is delivered. Do not do the investigation in this conversation.'};
}
export function listJobs(db,conversation){return db.prepare('SELECT id,title,state,result,steps,updated FROM jobs WHERE conversation=? ORDER BY created DESC LIMIT 10').all(conversation).map(j=>({...j,result:j.result?.slice(0,4000)}));}
export function updateJob(db,conversation,id,source,body){
 const job=boundJob(db,id,conversation);
 if(!activeStates.includes(job.state)&&job.state!=='blocked')throw new Error('Unsupported task: this task is already closed.');
 db.prepare('INSERT OR IGNORE INTO job_updates(job_id,source,body,created) VALUES (?,?,?,?)').run(id,source,body,Date.now());
 if(job.state==='blocked')db.prepare("UPDATE job_events SET state='cancelled' WHERE job_id=? AND state='pending' AND kind='blocked'").run(id);
 if(job.state==='blocked')db.prepare('DELETE FROM task_model_calls WHERE job_id=?').run(id);
 if(job.state==='blocked')db.prepare("UPDATE jobs SET state='queued',steps=0,failures=0,updated=? WHERE id=?").run(Date.now(),id);
 return {id,state:job.state==='blocked'?'queued':job.state,instruction:'Clarification saved; active work will use it at its next checkpoint.'};
}
export function cancelJob(db,conversation,id){boundJob(db,id,conversation);db.prepare("UPDATE jobs SET state='cancelled',updated=? WHERE id=? AND state IN ('waiting_ack','queued','running','blocked')").run(Date.now(),id);db.prepare("UPDATE job_events SET state='cancelled' WHERE job_id=? AND state='pending'").run(id);return {id,state:boundJob(db,id,conversation).state};}
export function addJobEvent(db,job,kind,body){
 if(!body.trim()||body.length>22000||/<\/?(?:thinking|analysis|scratchpad|reasoning)(?:\s|>)/i.test(body))throw new Error('Unsupported task update.');
 const key=createHash('sha256').update(job.id+'\0'+kind+'\0'+body).digest('hex');
 db.prepare('INSERT OR IGNORE INTO job_events(id,job_id,kind,body,created) VALUES (?,?,?,?,?)').run(key,job.id,kind,body,Date.now());
 return key;
}
export function notifyFinding(db,conversation,id,body){
 const job=boundJob(db,id,conversation);if(job.state!=='running')throw new Error('Unsupported task: not running.');
 const sent=db.prepare("SELECT count(*) AS n,max(created) AS latest FROM job_events WHERE job_id=? AND kind='finding'").get(id);
 if(sent.n>=2||Date.now()-(sent.latest||0)<60000)return {queued:false,reason:'Update limit; include remaining findings in the final result.'};
 addJobEvent(db,job,'finding',body);return {queued:true};
}
export function recoverJobs(db){
 // Worker tools are read-only. Interrupted reads can resume from a durable checkpoint.
 db.prepare("UPDATE jobs SET state='queued' WHERE state='running'").run();
 db.prepare("UPDATE jobs SET state='blocked',result='No pude confirmar la entrega del acuse inicial. Pídeme retomar la tarea.' WHERE state='waiting_ack' AND origin IN (SELECT id FROM deliveries WHERE state='needs_review')").run();
 db.prepare("UPDATE job_events SET state='needs_review' WHERE state='sending'").run();
}
export const taskReplySchema={type:'object',properties:{status:{type:'string',enum:['continue','completed','blocked']},reply:{type:'string',maxLength:18000},checkpoint:{type:'string',maxLength:18000}},required:['status','reply','checkpoint'],additionalProperties:false};
export function extractTaskReply(event){const o=event?.structured_output;
 if(event?.type!=='result'||event.subtype!=='success'||event.is_error||!o||Object.keys(o).sort().join(',')!=='checkpoint,reply,status'||!['continue','completed','blocked'].includes(o.status)||typeof o.reply!=='string'||typeof o.checkpoint!=='string'||o.reply.length>18000||o.checkpoint.length>18000||(!o.reply.trim()&&o.status!=='continue')||(!o.checkpoint.trim()&&o.status==='continue')||/<\/?(?:thinking|analysis|scratchpad|reasoning)(?:\s|>)/i.test(o.reply))throw new Error('Invalid task result');return o;
}
