import {saveMessage} from './store.mjs';

// Only standalone owner commands. Never inspect quoted text, images, tool output,
// or objects such as “cancel my subscription” as an emergency stop.
export function cancellationCommand(content) {
 for(let i=0;i<4&&content?.type==='reply';i++)content=content.content;
 if(content?.type!=='text'||typeof content.text!=='string')return null;
 const input=content.text.trim();
 const normalized=input.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase()
  .replace(/[¡!¿?.,;:]/g,' ').replace(/\s+/g,' ').trim()
  .replace(/^narciso\s+/,'').replace(/^(por favor|please)\s+/,'').replace(/\s+(por favor|please)$/,'');
 const es=/^(para|parate|detente|alto|espera|no (?:para|pera|espera)|no (?:hagas|haga) (?:mas nada|nada mas|nada)|(?:para|deten|cancela|cancelar)(?: (?:todo|la tarea|esta tarea|la tarea actual|lo que estas haciendo))?)$/;
 const en=/^(stop|stop now|stop please|wait|hold on|cancel|cancel (?:it|that|this|everything|the task|this task|current task)|stop (?:everything|the task|what you are doing)|(?:don['’]?t|do not) do anything(?: else)?|never mind|nevermind)$/;
 return es.test(normalized)?{input,language:'es'}:en.test(normalized)?{input,language:'en'}:null;
}
export function interrupted(){return Object.assign(new Error('Task cancelled by owner'),{name:'AbortError'});}
export function assertTurnActive(db,conversation,id,signal){
 if(signal?.aborted)throw interrupted();
 const d=db.prepare('SELECT state FROM deliveries WHERE id=? AND conversation=?').get(id,conversation);
 if(d&&d.state!=='processing')throw interrupted();
}
export function createCancellation(db){
 db.exec('CREATE TABLE IF NOT EXISTS cancellations(seq INTEGER PRIMARY KEY AUTOINCREMENT, delivery_id TEXT UNIQUE NOT NULL, conversation TEXT NOT NULL, created INTEGER NOT NULL)');
 const active=new Map();
 const exists=name=>Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name));
 return {
  epoch(conversation){return db.prepare('SELECT coalesce(max(seq),0) n FROM cancellations WHERE conversation=?').get(conversation).n;},
  begin(conversation,id){
   assertTurnActive(db,conversation,id);const controller=new AbortController();active.set(conversation,{id,controller});
   return {signal:controller.signal,check:()=>assertTurnActive(db,conversation,id,controller.signal),end(){if(active.get(conversation)?.id===id)active.delete(conversation);}};
  },
  cancel(conversation,id,command){
   const accepted=db.prepare("SELECT id FROM deliveries WHERE id=? AND conversation=? AND state='queued'").get(id,conversation);
   if(!accepted)throw Error('Cancellation requires a newly accepted owner delivery');
   db.exec('BEGIN IMMEDIATE');let inFlight=false;
   try{
    db.prepare('INSERT INTO cancellations(delivery_id,conversation,created) VALUES (?,?,?)').run(id,conversation,Date.now());
    db.prepare("UPDATE deliveries SET state='control_pending' WHERE id=?").run(id);
    inFlight=Boolean(db.prepare("SELECT id FROM deliveries WHERE conversation=? AND state='sending' LIMIT 1").get(conversation));
    if(exists('cua_actions'))inFlight||=Boolean(db.prepare("SELECT id FROM cua_actions WHERE conversation=? AND state IN ('dispatching','uncertain') LIMIT 1").get(conversation));
    inFlight||=Boolean(db.prepare("SELECT code FROM approvals WHERE conversation=? AND state='executing' LIMIT 1").get(conversation));
    if(exists('errand_actions'))inFlight||=Boolean(db.prepare("SELECT a.id FROM errand_actions a JOIN errands e ON e.id=a.errand_id WHERE e.conversation=? AND a.state IN ('executing','needs_review') LIMIT 1").get(conversation));
    db.prepare("UPDATE deliveries SET state='cancelled' WHERE conversation=? AND state IN ('queued','processing','sending')").run(conversation);
    db.prepare("UPDATE jobs SET state='cancelled',updated=? WHERE conversation=? AND state IN ('waiting_ack','queued','running','blocked')").run(Date.now(),conversation);
    db.prepare("UPDATE job_events SET state='cancelled' WHERE job_id IN (SELECT id FROM jobs WHERE conversation=?) AND state IN ('pending','sending')").run(conversation);
    if(exists('job_event_parts'))db.prepare("UPDATE job_event_parts SET state='cancelled' WHERE event_id IN (SELECT e.id FROM job_events e JOIN jobs j ON j.id=e.job_id WHERE j.conversation=?) AND state IN ('pending','sending')").run(conversation);
    db.prepare("UPDATE approvals SET state='cancelled' WHERE conversation=? AND state='pending'").run(conversation);
    db.prepare("UPDATE message_reactions SET state='cancelled' WHERE delivery_id IN (SELECT id FROM deliveries WHERE conversation=? AND state='cancelled') AND state='pending'").run(conversation);
    if(exists('errands'))db.prepare("UPDATE errands SET state='cancelled',updated=? WHERE conversation=? AND state!='completed'").run(Date.now(),conversation);
    if(exists('browser_captures'))db.prepare("UPDATE browser_captures SET state='cancelled' WHERE conversation=? AND state IN ('pending','sending','sent')").run(conversation);
    saveMessage(db,id,conversation,'user',command.input);
    db.exec('COMMIT');
   }catch(e){db.exec('ROLLBACK');throw e;}
   active.get(conversation)?.controller.abort();
   return command.language==='en'
    ? 'Stopped. I won’t continue that work.'+(inFlight?' An action already sent may have taken effect; stopping does not undo it.':'')
    : 'Detenido. No seguiré con esa tarea.'+(inFlight?' Una acción ya enviada podría haberse aplicado; detenerla no la deshace.':'');
  }
 };
}
