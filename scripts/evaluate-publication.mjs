// Explicit, opt-in model evaluation: consumes the owner's Claude Code plan.
// Fixed synthetic regressions reproduce failure patterns without personal mail.
import {mkdtempSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const directory=mkdtempSync(join(tmpdir(),'narciso-evidence-eval-'));
process.env.NARCISO_DATA_DIR=directory;
const {respond,modelProfile}=await import('../src/claude.mjs');
const {compositionInstructions,compositionSchema,compositionZ,stageExtractor,publishResearch}=await import('../src/publication.mjs');
const {actionCatalog}=await import('../src/next-actions.mjs');
const {openStore}=await import('../src/store.mjs');
const {saveEvidence}=await import('../src/evidence.mjs');
const cases=JSON.parse(readFileSync(new URL('../test/fixtures/evidence-review.json',import.meta.url),'utf8'));
const db=openStore();
try{
 const sources=cases.map(c=>({id:saveEvidence(db,'eval','fixture','body',c.text,c.truncated),text:c.text,truncated:c.truncated,level:'body',tool:'fixture',dependencies:[]}));
 const findings=cases.map((c,i)=>({id:c.id,statement:c.statement,category:c.category,kind:'reported',importance:'high',citations:[{sourceId:sources[i].id,quote:c.quote}],calculationId:'',uncertainty:''}));
 const verdict=await respond('evaluation',[{id:'fixed-cases',role:'user',body:JSON.stringify({findings,sources,language:'es',coverage:[],objective:'Qué merece atención',availableActions:actionCatalog(),mode:'final'})}], 'review-evaluation',[],
  {taskId:'eval',phase:'publication',isolated:true,schema:compositionSchema,extract:stageExtractor(compositionZ),system:compositionInstructions});
 const byId=new Map(verdict.verdicts.map(v=>[v.id,v]));
 const results=cases.map(c=>({case:c.id,expected:c.expected,actual:byId.get(c.id)?.supported,pass:byId.get(c.id)?.supported===c.expected}));
 console.log(JSON.stringify({model:modelProfile('eval',process.env,'publication'),results},null,2));
 if(results.some(r=>!r.pass)||verdict.verdicts.length!==cases.length)throw new Error('Evidence review regression failed');
 // Also exercise the real isolated composer and final audit with a supported fact.
 const reply=await publishResearch(db,{id:'eval',conversation:'evaluation',objective:'Qué merece atención'},
  {language:'es',findings:[findings[0]]});
 for(const name of readdirSync(join(directory,'traces'))){
  for(const line of readFileSync(join(directory,'traces',name),'utf8').split('\n').filter(Boolean)){
   const record=JSON.parse(line);const event=record.data;
   if(record.kind==='claude_event'&&event?.type==='system'&&event.subtype==='init'){
    if((event.mcp_servers||[]).length||(event.tools||[]).some(t=>t.startsWith('mcp__')||['Bash','Read','Write','Edit','WebFetch'].includes(t)))throw new Error('Publication process unexpectedly has tools');
   }
  }
 }
 console.log(JSON.stringify({publicationPassed:true,toolsIsolated:true,reply}));
}finally{db.close();rmSync(directory,{recursive:true,force:true});}
