import {recoverCaptures,sendCaptures} from './browser-captures.mjs';
import {createCancellation,cancellationCommand,interrupted} from './cancellation.mjs';
import {createInboundBurst,combinedDelivery} from './inbound-burst.mjs';
import {recoverErrands} from './errands.mjs';
import { Spectrum, text, attachment } from 'spectrum-ts';
import { imessage } from 'spectrum-ts/providers/imessage';
import { openSync, closeSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { local, owner, normalizePhone } from './config.mjs';
import { openStore, acceptDelivery, saveMessage } from './store.mjs';
import { prepareInput, describeInput, MediaError } from './media.mjs';
import { handle } from './assistant.mjs';
import { acceptedMessage, chunks, summaryChunks } from './photon-policy.mjs';
import { recoverJobs } from './jobs.mjs';
import { createJobRunner,createJobNotifier } from './job-runner.mjs';
import { reactionPump } from './reactions.mjs';
import { acknowledgeRead, serialQueue } from './receipts.mjs';

if (!normalizePhone(owner)) throw new Error('Set an exact owner phone number.');
if (!process.env.PHOTON_PROJECT_ID || !process.env.PHOTON_PROJECT_SECRET) throw new Error('Photon credentials are missing.');
const lockPath = resolve(local,'photon.lock');
try {
  const pid = Number(readFileSync(lockPath,'utf8'));
  if (!Number.isSafeInteger(pid) || pid<1) throw new Error('Invalid process lock; inspect it locally.');
  try { process.kill(pid,0); throw new Error('Narciso is already running.'); }
  catch(e) { if(e.code==='ESRCH') unlinkSync(lockPath); else throw e; }
} catch(e) { if(e.code!=='ENOENT') throw e; }
const lock=openSync(lockPath,'wx',0o600);
writeFileSync(lock,String(process.pid)); closeSync(lock);
process.on('exit',()=>{try{unlinkSync(lockPath);}catch{}});

const db = openStore();
db.exec('CREATE TABLE IF NOT EXISTS runtime (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS delivery_groups (delivery_id TEXT PRIMARY KEY, turn_id TEXT NOT NULL)');
db.prepare('INSERT OR IGNORE INTO runtime VALUES (?,?)').run('activated_at',String(Date.now()));
const activatedAt=Number(db.prepare('SELECT value FROM runtime WHERE key=?').get('activated_at').value);
db.prepare("UPDATE deliveries SET state='needs_review' WHERE state IN ('queued','processing','sending')").run();
db.prepare("UPDATE message_reactions SET state='needs_review' WHERE state IN ('pending','sending')").run();
recoverJobs(db);
recoverCaptures(db);
if(process.env.NARCISO_BROWSER_INTERACTIVE==='1')recoverErrands(db);
const connectionDeadline=setTimeout(()=>{
  console.error('Photon startup timed out; supervisor will retry.'); process.exit(1);
},45000);
const app = await Spectrum({projectId:process.env.PHOTON_PROJECT_ID,
  projectSecret:process.env.PHOTON_PROJECT_SECRET, providers:[imessage.config()],telemetry:false});
clearTimeout(connectionDeadline);
console.log(JSON.stringify({event:'narciso_connected',time:new Date().toISOString(),pid:process.pid}));
let stopping=false;
const cancellation=createCancellation(db);
const queue=serialQueue();
const outgoing=serialQueue();
async function withDeadline(promise){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Photon operation timed out')),15000);})]);}finally{clearTimeout(timer);}}
async function sendChunks(space,body,split=chunks,check=()=>{}){for(const chunk of split(body)){check();await withDeadline(space.send(text(chunk)));}}
const jobReport=(event,taskId)=>console.log(JSON.stringify({event,taskId,time:new Date().toISOString()}));
const runner=createJobRunner(db,{report:jobReport});
const notifier=createJobNotifier(db,{report:jobReport,send:async(conversation,body,isCurrent=()=>true)=>{
  const epoch=cancellation.epoch(conversation);
  const check=()=>{if(!isCurrent()||cancellation.epoch(conversation)!==epoch)throw interrupted();};
  const space=await withDeadline(imessage(app).space.get(conversation));
  if(space.type!=='dm')throw new Error('Background destination is not a DM');
  await outgoing.add(()=>sendChunks(space,body,summaryChunks,check));
}});
function processFragments(items){
 const {space,message,deliveryId,report,ids,content}=combinedDelivery(items);
 const mark=(state,response)=>{for(const id of ids)db.prepare("UPDATE deliveries SET state=?,response=? WHERE id=? AND state!='cancelled'").run(state,response??null,id);};
 const cancelled=()=>ids.some(id=>db.prepare('SELECT state FROM deliveries WHERE id=?').get(id)?.state==='cancelled');
 for(const id of ids)db.prepare('INSERT OR IGNORE INTO delivery_groups VALUES (?,?)').run(id,deliveryId);
 if(items.length>1)report('input_fragments_grouped');
 queue.add(async()=>{
      await Promise.all(items.map(item=>item.acknowledged));
      if(cancelled())return;
      mark('processing');
      const execution=cancellation.begin(space.id,deliveryId);
      const reactions=reactionPump(db,deliveryId,message,report);
      try {
        let response;
        try {
          const prepared=await prepareInput(content,{deliveryId,conversation:space.id});
          execution.check();
          report(prepared.hasMedia?'media_prepared':'text_prepared');
          response=await handle(db,space.id,prepared.input,deliveryId,{...prepared,signal:execution.signal});
        } catch(error) {
          if(!(error instanceof MediaError))throw error;
          response=error.message;report('media_rejected');
        }
        await reactions.stop();
        execution.check();
        mark('sending',response);
        await outgoing.add(async()=>{
          const check=()=>{if(cancelled()||execution.signal.aborted)throw interrupted();};
          await sendCaptures(db,space.id,deliveryId,{check,send:(bytes,mimeType)=>withDeadline(space.send(attachment(bytes,{mimeType,name:'browser-screenshot'+(mimeType==='image/png'?'.png':'.jpg')})))});
          await sendChunks(space,response,chunks,check);
        });
        if(cancelled())return;
        mark('sent',response);
        report('response_sent');
      } catch {
        await reactions.stop();
        if(cancelled()||execution.signal.aborted){report('turn_cancelled');return;}
        const state=db.prepare('SELECT state FROM deliveries WHERE id=?').get(deliveryId).state;
        for(const id of ids)db.prepare("UPDATE deliveries SET state='needs_review' WHERE id=?").run(id);
        db.prepare("UPDATE jobs SET state='blocked',result='No pude confirmar el acuse de esta tarea. Pídeme retomarla.',updated=? WHERE origin=? AND state='waiting_ack'").run(Date.now(),deliveryId);
        console.error(JSON.stringify({event:'turn_needs_review',deliveryId,stage:state,time:new Date().toISOString()}));
        // Never retry an ambiguous send; that can create duplicate messages.
        if(state==='processing') {
          try {await outgoing.add(()=>{if(cancelled())throw interrupted();return space.send(text('I couldn’t finish that request. Your task is saved, but I haven’t confirmed completion. Please try again or check Narciso on the Mac.'));});}catch{}
        }
      } finally {execution.end();}
    }).catch(()=>report('queue_job_failed'));
}
const burst=createInboundBurst({emit:processFragments});

async function shutdown() {
  if(stopping)return; stopping=true;
  const kill=setTimeout(()=>process.exit(0),5000); kill.unref();
  burst.flushAll();
  await Promise.all([runner.stop(),notifier.stop(),queue.idle()]); await outgoing.idle(); await app.stop(); process.exit(0);
}
process.on('SIGTERM',shutdown); process.on('SIGINT',shutdown);
try {
  for await (const [space,message] of app.messages) {
    if (stopping || !acceptedMessage(space,message,owner,activatedAt)) continue;
    const deliveryId=`${space.id}:${message.id}`;
    if(!acceptDelivery(db,deliveryId,space.id,describeInput(message.content)))continue;
    const report=event=>console.log(JSON.stringify({event,deliveryId,time:new Date().toISOString()}));
    report('owner_message_accepted');
    // Acknowledge immediately, even if the serial worker is busy. A receipt
    // means the owner message is durably accepted, not that its work is done.
    const acknowledged=acknowledgeRead(message,report);
    const command=cancellationCommand(message.content);
    if(command){
      // Revoke persistent authority immediately, before any receipt/network await
      // and outside the model's serial queue. The model cannot veto this stop.
      const response=cancellation.cancel(space.id,deliveryId,command);
      burst.discard(space.id);report('cancellation_accepted');
      void (async()=>{
        await acknowledged;
        try{
          await outgoing.add(()=>sendChunks(space,response));
          db.prepare("UPDATE deliveries SET state='sent',response=? WHERE id=?").run(response,deliveryId);
          saveMessage(db,deliveryId+':reply',space.id,'assistant',response);
          report('cancellation_confirmed');
        }catch{db.prepare("UPDATE deliveries SET state='needs_review' WHERE id=?").run(deliveryId);report('cancellation_reply_unconfirmed');}
      })().catch(()=>report('cancellation_reply_unconfirmed'));
      continue;
    }
    burst.push({space,message,deliveryId,report,acknowledged});
  }
  if(!stopping) throw new Error('Photon stream ended.');
} catch {
  console.error('Photon connection stopped; supervisor will reconnect.');
  try {await app.stop();}catch{}
  process.exit(1);
}
