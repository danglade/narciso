// Opt-in, public synthetic fixtures. No Google calls, Photon connection or writes.
import {mkdtempSync,readFileSync,writeFileSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
const directory=mkdtempSync(join(tmpdir(),'narciso-experience-'));
process.env.NARCISO_DATA_DIR=directory;
const {openStore}=await import('../src/store.mjs');
const {saveEvidence,sumEvidenceAmounts}=await import('../src/evidence.mjs');
const {publishResearch}=await import('../src/publication.mjs');
const {respond}=await import('../src/claude.mjs');
const cases=JSON.parse(readFileSync(new URL('../test/fixtures/experience.json',import.meta.url),'utf8'));
const selected=cases.filter(c=>!process.env.NARCISO_EVAL_CASE||c.id===process.env.NARCISO_EVAL_CASE);
if(!selected.length){rmSync(directory,{recursive:true,force:true});throw new Error('Unknown evaluation case');}
const db=openStore();
const reports=[];
function findingsFor(c){return c.findings.map(f=>{
  let citations,calculationId='';
  if(f.receipts){
    const items=f.receipts.map(item=>{const quote=`Example Bank reported incoming payment ${item.source}: USD ${item.amount}.`;return {...item,quote,evidenceId:saveEvidence(db,c.id,'gmail_review_bodies','body',quote)};});
    const calculation=sumEvidenceAmounts(db,c.id,items,'USD');calculationId=calculation.evidenceId;
    citations=items.map(i=>({sourceId:i.evidenceId,quote:i.quote}));
  }else citations=[{sourceId:saveEvidence(db,c.id,'gmail_review_bodies','body',f.text),quote:f.text}];
  return {id:f.id,statement:f.statement,category:f.category,importance:f.importance,kind:'reported',uncertainty:f.uncertainty||'',citations,calculationId};
});}
try{
 for(const c of selected){
  try{
  const findings=findingsFor(c),research={language:c.language,findings};
  const started=Date.now();let calls=0;
  const reply=await publishResearch(db,{id:c.id,conversation:'evaluation',objective:c.objective},research,{run:(...args)=>{calls++;return respond(...args);}});
  const last=JSON.parse(db.prepare("SELECT output FROM task_artifacts WHERE job_id=? AND stage LIKE 'compose-%' ORDER BY created DESC LIMIT 1").get(c.id).output);
  const included=new Set(last.paragraphs.flatMap(p=>p.findingIds));
  const checks={action:last.action.kind===c.expect.action,includes:c.expect.include.every(id=>included.has(id)),omits:c.expect.omit.every(id=>!included.has(id)),absent:c.expect.absent.every(s=>!reply.toLowerCase().includes(s.toLowerCase())),present:(c.expect.present||[]).every(s=>reply.includes(s)),words:reply.split(/\s+/).length<=c.expect.maxWords};
  const report={case:c.id,pass:Object.values(checks).every(Boolean),checks,calls,durationMs:Date.now()-started,words:reply.split(/\s+/).length,action:last.action.kind,reply};
  reports.push(report);console.log(JSON.stringify(report));
  if(c.id==='daily_mixed'&&process.argv.includes('--baseline')){
    // Frozen previous architecture for the same packet; never import private files.
    const baseline=join(directory,'baseline');
    execFileSync('mkdir',['-p',baseline]);
    execFileSync('tar',['-x','-C',baseline],{input:execFileSync('git',['archive','ba90f6f','src','SOUL.md','CONTEXT.example.md'])});
    symlinkSync(resolve('node_modules'),join(baseline,'node_modules'),'dir');
    const {publishResearch:oldPublish}=await import(join(baseline,'src/publication.mjs'));
    let oldCalls=0;const oldStarted=Date.now();
    // Use its original model profile (xhigh) and prompts, as previously deployed.
    const {respond:oldRespond}=await import(join(baseline,'src/claude.mjs'));
    try{
      const oldReply=await oldPublish(db,{id:c.id,conversation:'evaluation',objective:c.objective},research,{run:(...args)=>{oldCalls++;return oldRespond(...args);}});
      const old={case:'baseline_daily_mixed',calls:oldCalls,durationMs:Date.now()-oldStarted,words:oldReply.split(/\s+/).length,reply:oldReply};reports.push(old);console.log(JSON.stringify(old));
    }catch(error){const old={case:'baseline_daily_mixed',calls:oldCalls,durationMs:Date.now()-oldStarted,error:error.message};reports.push(old);console.log(JSON.stringify(old));}
  }
  }catch(error){
    const last=db.prepare("SELECT output FROM task_artifacts WHERE job_id=? AND stage LIKE 'compose-%' ORDER BY created DESC LIMIT 1").get(c.id);
    const failed={case:c.id,pass:false,error:error.message,lastComposition:last?JSON.parse(last.output):null};
    reports.push(failed);console.log(JSON.stringify(failed));
  }
 }
 const outputIndex=process.argv.indexOf('--output');
 if(outputIndex>=0)writeFileSync(resolve(process.argv[outputIndex+1]),JSON.stringify(reports,null,2),{mode:0o600});
 if(reports.some(r=>r.pass===false))process.exitCode=1;
}finally{db.close();rmSync(directory,{recursive:true,force:true});}
