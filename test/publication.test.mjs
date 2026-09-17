import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore,acceptDelivery,saveMessage} from '../src/store.mjs';
import {saveEvidence,getEvidence,validateFindings,sumEvidenceAmounts,captureEvidence} from '../src/evidence.mjs';
import {publishResearch,validateDraft,validateComposition,EvidenceRejected,PublicationRejected} from '../src/publication.mjs';
import {createJobRunner} from '../src/job-runner.mjs';
import {startJob,updateJob,cancelJob,recoverJobs} from '../src/jobs.mjs';
import {actionCatalog,renderAction} from '../src/next-actions.mjs';
import {modelProfile} from '../src/claude.mjs';
function setup(){const db=openStore(':memory:');const job={id:'job',conversation:'owner',objective:'Review notices'};
 const sourceId=saveEvidence(db,job.id,'gmail_review_bodies','body','The service reports an unrecognized login at 02:10.');
 const finding={id:'login',statement:'El servicio avisa de un acceso desconocido a las 02:10.',category:'security',kind:'reported',importance:'high',citations:[{sourceId,quote:'unrecognized login at 02:10'}],calculationId:'',uncertainty:'Falta confirmar si fue tuyo.'};
 const research={status:'completed',reply:'DO NOT SEND THE RESEARCH DRAFT',checkpoint:'Facts only',language:'es',notify:false,findings:[finding]};return {db,job,finding,research,sourceId};}
function composed({supported=true,badDraft=false}={}){return {
 verdicts:[{id:'login',supported,disposition:supported?'include':'unsupported',reason:supported?'Source reports the access.':'Authorization inferred from an alert.'}],
 detailLevel:'summary',paragraphs:supported?[{text:badDraft?'Hubo un acceso a las 04:30.':'El servicio avisa de un acceso desconocido.',findingIds:['login']}]:[],
 action:supported?{kind:'confirm_recognition',targets:[{findingId:'login',label:'servicio'}]}:{kind:'none',targets:[]},
};}
function fakeRun(log,{badDraft=false,badAudit=false}={}){return async(_c,messages,id,_media,options)=>{
 log.push({id,options,packet:JSON.parse(messages[0].body)});
 if(id.includes(':compose-'))return composed({badDraft});
 return {supported:!badAudit,missingImportant:false,useful:true,issues:badAudit?['Unsupported implication']:[]};
};}

test('evidence references are task-bound, quotes exact and truncation preserved',()=>{
 const {db,job,finding,sourceId}=setup();assert.equal(validateFindings(db,job.id,[finding]).sources.length,1);
 assert.throws(()=>getEvidence(db,'other',sourceId));
 assert.throws(()=>validateFindings(db,job.id,[{...finding,citations:[{sourceId,quote:'the owner authorized it'}]}]));
 assert.throws(()=>validateFindings(db,job.id,[finding,finding]));
 const captured=captureEvidence(db,job.id,'gmail_review_bodies',{items:[{id:'mail',body:'Only first section',bodyTruncated:true}]});
 assert.equal(getEvidence(db,job.id,captured.items[0].evidenceId).truncated,true);db.close();
});
test('sourced totals refuse invented values and repeated transaction identities',()=>{
 const {db,job}=setup();const evidenceId=saveEvidence(db,job.id,'receipt','body','Transaction TX123 amount USD 25.10');
 const item={source:'TX123',amount:'25.10',evidenceId,quote:'Transaction TX123 amount USD 25.10'};
 const total=sumEvidenceAmounts(db,job.id,[item],'USD');assert.equal(total.total,'25.10');assert.equal(getEvidence(db,job.id,total.evidenceId).level,'calculation');
 assert.throws(()=>sumEvidenceAmounts(db,job.id,[{...item,amount:'35.10'}],'USD'));
 assert.throws(()=>sumEvidenceAmounts(db,job.id,[item,item],'USD'));
 assert.throws(()=>sumEvidenceAmounts(db,job.id,[{...item,source:'different'}],'USD'));db.close();
});
test('editor cannot add numbers, cite unknown findings, expose IDs or omit important facts',()=>{
 const {db,finding}=setup();
 for(const paragraphs of [
  [{text:'Un acceso a las 09:00',findingIds:['login']}],
  [{text:'Todo normal',findingIds:['unknown']}],
  [{text:'T-ABCDEF12',findingIds:['login']}],
 ])assert.throws(()=>validateDraft({paragraphs},[finding]),EvidenceRejected);
 const low={...finding,id:'low',importance:'low'};
 assert.throws(()=>validateDraft({paragraphs:[{text:'Otro aviso',findingIds:['low']}]},[finding,low]));db.close();
});
test('publication isolates stages, hides research prose, and resumes cached stages',async()=>{
 const {db,job,research}=setup();const log=[];const run=fakeRun(log);
 const reply=await publishResearch(db,job,research,{run});assert.match(reply,/¿Reconoces/);assert.doesNotMatch(reply,/DO NOT SEND/);
 assert.equal(log.length,2);assert.ok(log.every(c=>c.options.isolated));
 assert.ok(log.every(c=>c.options.phase==='publication'));
 const compose=log.find(c=>c.id.includes(':compose-'));assert.ok(compose.packet.sources.length);assert.equal(compose.packet.history,undefined);
 assert.equal(db.prepare('SELECT count(*) AS n FROM task_stage_metrics').get().n,2);
 assert.equal(await publishResearch(db,job,research,{run}),reply);assert.equal(log.length,2);
 await publishResearch(db,job,research,{run,updates:[{id:1,body:'Use yesterday'}]});assert.equal(log.length,4);db.close();
});
test('a cached audit cannot approve a different rendered message',async()=>{
 const {db,job,research}=setup();await publishResearch(db,job,research,{run:fakeRun([])});
 const altered=composed();altered.paragraphs[0].text='El servicio notificó actividad sin reconocer.';
 db.prepare("UPDATE task_artifacts SET output=? WHERE job_id=? AND stage='compose-0'").run(JSON.stringify(altered),job.id);
 let audited;
 const reply=await publishResearch(db,job,research,{run:async(_c,messages,id)=>{
  assert.match(id,/:audit-0:/);audited=JSON.parse(messages[0].body).renderedReply;
  return {supported:true,missingImportant:false,useful:true,issues:[]};
 }});
 assert.equal(audited,reply);assert.match(audited,/actividad sin reconocer/);db.close();
});
test('important rejected claims stop publication; unapproved draft never reaches delivery',async()=>{
 const {db,job,research}=setup();let runs=0;
 await assert.rejects(publishResearch(db,job,research,{run:async()=>{runs++;return composed({supported:false});}}),EvidenceRejected);assert.equal(runs,1);
 const fresh=setup();const log=[];
 await assert.rejects(publishResearch(fresh.db,fresh.job,fresh.research,{run:fakeRun(log,{badAudit:true})}),PublicationRejected);
 assert.equal(log.length,6); // compose/audit, two bounded repairs
 assert.equal(fresh.db.prepare('SELECT count(*) AS n FROM job_events').get().n,0);db.close();fresh.db.close();
});

test('summary removes incidental detail but explicitly requested detail can retain times',()=>{
 const {db,finding}=setup();
 const c=composed();c.paragraphs[0].text='El servicio avisa de un acceso a las 02:10.';
 assert.throws(()=>validateComposition(c,[finding]),/precise clock/);
 c.detailLevel='requested_detail';assert.match(validateComposition(c,[finding]).reply,/02:10/);
 c.detailLevel='summary';c.paragraphs[0].text='detalle '.repeat(159).trim();
 assert.throws(()=>validateComposition(c,[finding]),/45 words/);
 c.paragraphs=Array.from({length:4},()=>({text:'detalle '.repeat(40).trim(),findingIds:['login']}));
 assert.throws(()=>validateComposition(c,[finding]),/limit is 160/);db.close();
});

test('source details and free-form offers cannot sneak around the action catalog',()=>{
 const {db,finding}=setup();finding.statement+=' Código 123456.';
 for(const text of ['Código 123456.','Puedo pagar esa factura.','I can close your session.','¿Quieres ayuda?','Solo verifiqué la aritmética.']){
  const c=composed();c.paragraphs[0].text=text;
  assert.throws(()=>validateComposition(c,[finding]));
 }
 const limited=composed();limited.paragraphs[0].text='No puedo pagar desde aquí.';
 assert.doesNotThrow(()=>validateComposition(limited,[finding]));
 const c=composed();c.action={kind:'pay_bill',targets:[]};assert.throws(()=>validateComposition(c,[finding]));
 c.action={kind:'confirm_recognition',targets:[{findingId:'login',label:'other service'}]};assert.throws(()=>validateComposition(c,[finding]),/literal label/);
 c.action={kind:'confirm_recognition',targets:[{findingId:'login',label:'123456'}]};assert.throws(()=>validateComposition(c,[finding]),/authentication code/);
 db.close();
});

test('omissions and action targets are tied to included supported findings',()=>{
 const {db,finding}=setup();const low={...finding,id:'routine',importance:'low',category:'other',statement:'Newsletter de Example.'};
 const c=composed();c.verdicts.push({id:'routine',supported:true,disposition:'routine',reason:'Routine newsletter.'});
 assert.doesNotThrow(()=>validateComposition(c,[finding,low]));
 c.action={kind:'draft_reply',targets:[{findingId:'routine',label:'Example'}]};assert.throws(()=>validateComposition(c,[finding,low]),/included finding/);
 c.action={kind:'none',targets:[]};c.verdicts[0].disposition='lower_priority';
 c.verdicts[1].disposition='include';c.paragraphs=[{text:'Newsletter de Example.',findingIds:['routine']}];
 assert.throws(()=>validateComposition(c,[finding,low]),/high-importance/);db.close();
});

test('host action catalog follows tools and permits no follow-up for routine outcomes',()=>{
 const disabled=actionCatalog([]);assert.ok(!disabled.some(a=>a.kind==='inspect_mail'));
 const finding={id:'mail',statement:'Ana pidió tus datos de contacto.',category:'request'};
 assert.equal(renderAction({kind:'draft_reply',targets:[{findingId:'mail',label:'Ana'}]},[finding]),'¿Quieres que prepare una respuesta para Ana?');
 assert.equal(renderAction({kind:'none',targets:[]},[finding]),'');
 assert.throws(()=>renderAction({kind:'inspect_mail',targets:[{findingId:'mail',label:'Ana'}]},[finding],'es',disabled),/unavailable/);
 assert.throws(()=>renderAction({kind:'confirm_recognition',targets:[{findingId:'mail',label:'Ana'}]},[finding]),/security/);
 assert.throws(()=>renderAction({kind:'draft_reply',targets:[{findingId:'mail',label:'Ana'}]},[{...finding,category:'money'}]),/direct-request/);
 const bill={id:'bill',statement:'Factura de Acme por USD 420.',category:'money'};
 assert.equal(renderAction({kind:'inspect_mail',targets:[{findingId:'bill',label:'Acme'}]},[bill]),'¿Quieres que busque en tu correo un comprobante de pago de Acme?');
 assert.equal(modelProfile('task',{},'publication').effort,'high');
 assert.equal(modelProfile('task',{}).effort,'xhigh');
 assert.equal(modelProfile('task',{NARCISO_PUBLICATION_EFFORT:'medium'},'publication').effort,'medium');
});

test('usefulness audit can reject an accurate but poor action and repair it without research',async()=>{
 const {db,job,research}=setup();let calls=0;
 const reply=await publishResearch(db,job,research,{run:async(_c,_m,id)=>{
  calls++;if(id.includes(':compose-'))return composed();
  return {supported:true,missingImportant:false,useful:calls>2,issues:calls>2?[]:['Prioritize asking the owner to recognize the access.']};
 }});
 assert.match(reply,/Reconoces/);assert.equal(calls,4);db.close();
});
test('cancellation during publication prevents saving a stage or returning a reply',async()=>{
 const {db,job,research}=setup();const controller=new AbortController();
 await assert.rejects(publishResearch(db,job,research,{signal:controller.signal,run:async()=>{controller.abort();return composed();}}));
 assert.equal(db.prepare('SELECT count(*) AS n FROM task_artifacts').get().n,0);db.close();
});
function runnerSetup(){const db=openStore(':memory:');acceptDelivery(db,'origin','owner','Review');db.prepare("UPDATE deliveries SET state='processing'").run();saveMessage(db,'origin','owner','user','Review');const job=startJob(db,'owner','origin','Review','Review');db.prepare("UPDATE deliveries SET state='sent'").run();return {db,job};}
const done={status:'completed',reply:'RAW DRAFT',checkpoint:'facts',language:'es',notify:false,findings:[]};
test('runner waits for publication, rejects stale edits after owner clarification, and resumes saved research',async()=>{
 const {db,job}=runnerSetup();let researchCalls=0,finish;const pending=new Promise(r=>finish=r);
 const runner=createJobRunner(db,{autoStart:false,run:async()=>{researchCalls++;return done;},publish:async()=>pending});
 const running=runner.step();await new Promise(r=>setImmediate(r));assert.equal(db.prepare('SELECT count(*) AS n FROM job_events').get().n,0);
 updateJob(db,'owner',job.id,'new','Only yesterday');finish('OLD SUMMARY');await running;
 assert.equal(db.prepare('SELECT state FROM jobs').get().state,'queued');assert.equal(db.prepare('SELECT count(*) AS n FROM job_events').get().n,0);
 let fail=true;const resume=createJobRunner(db,{autoStart:false,run:async()=>{researchCalls++;return done;},publish:async()=>{if(fail){fail=false;throw new Error('temporary editor failure');}return 'VERIFIED';}});
 await resume.step();assert.equal(researchCalls,2);recoverJobs(db);await resume.step();assert.equal(researchCalls,2);
 assert.equal(db.prepare('SELECT body FROM job_events').get().body,'VERIFIED');db.close();
});
test('runner sends neither a rejected research draft nor an unreviewed intermediate finding',async()=>{
 const {db}=runnerSetup();const runner=createJobRunner(db,{autoStart:false,run:async()=>({...done,status:'continue',notify:true,findings:[{}]}),publish:async()=>{throw new EvidenceRejected('Unsupported relationship');}});
 await runner.step();assert.equal(db.prepare('SELECT count(*) AS n FROM job_events').get().n,0);
 assert.match(db.prepare('SELECT checkpoint FROM jobs').get().checkpoint,/Unsupported relationship/);db.close();
});

 test('relevant reported facts return to research even when not marked high importance',async()=>{
  const {db,job,research}=setup();research.findings[0].importance='normal';let runs=0;
  await assert.rejects(publishResearch(db,job,research,{run:async()=>{runs++;return composed({supported:false});}}),EvidenceRejected);
  assert.equal(runs,1);db.close();
 });

test('editor preserves explicit timezones and enforces the summary budget',()=>{
 const {db,finding}=setup();finding.statement+=' UTC';
 assert.throws(()=>validateDraft({paragraphs:[{text:'Acceso a las 02:10',findingIds:['login']}]},[finding]),/timezone/);
 assert.doesNotThrow(()=>validateDraft({paragraphs:[{text:'Acceso a las 02:10 UTC',findingIds:['login']}]},[finding]));
 assert.throws(()=>validateDraft({paragraphs:[{text:'uno '.repeat(251),findingIds:['login']}]},[finding]),/budget/);db.close();
});

test('one durable model-call budget covers research and publication',async()=>{
 const {db}=runnerSetup();let calls=0;
 const runner=createJobRunner(db,{autoStart:false,maxCalls:1,run:async()=>{calls++;return done;},publish:async(_db,_job,_out,{run})=>run()});
 await runner.step();assert.equal(calls,1);assert.equal(db.prepare('SELECT state FROM jobs').get().state,'blocked');
 assert.equal(db.prepare('SELECT calls FROM task_model_calls').get().calls,1);assert.doesNotMatch(db.prepare('SELECT body FROM job_events').get().body,/RAW DRAFT/);db.close();
});

test('oversized evidence packets are rejected before consuming model calls',async()=>{
 const {db,job,finding,research}=setup();let calls=0;
 finding.citations=Array.from({length:5},(_,i)=>({sourceId:saveEvidence(db,job.id,'large-source','body',`Notice ${i} `+'x'.repeat(43900)),quote:`Notice ${i}`}));
 await assert.rejects(publishResearch(db,job,research,{run:async()=>{calls++;}}),/too large/);
 assert.equal(calls,0);db.close();
});

test('editor-only failure does not send research back through another Google pass',async()=>{
 const {db}=runnerSetup();let researchCalls=0;
 const runner=createJobRunner(db,{autoStart:false,run:async()=>{researchCalls++;return done;},publish:async()=>{throw new PublicationRejected('Final text remains unsupported');}});
 await runner.step();await runner.step();assert.equal(researchCalls,1);assert.equal(db.prepare('SELECT state FROM jobs').get().state,'blocked');assert.doesNotMatch(db.prepare('SELECT body FROM job_events').get().body,/RAW DRAFT/);db.close();
});
