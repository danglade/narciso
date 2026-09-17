import {createHash} from 'node:crypto';
import {z} from 'zod';
import {sumAmounts} from './amounts.mjs';
import {timezone} from './config.mjs';

export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function initEvidence(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS task_evidence (
    id TEXT PRIMARY KEY, task_id TEXT NOT NULL, tool TEXT NOT NULL, level TEXT NOT NULL,
    truncated INTEGER NOT NULL, text TEXT NOT NULL, dependencies TEXT NOT NULL, created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS task_model_calls (job_id TEXT PRIMARY KEY, calls INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS task_research (job_id TEXT PRIMARY KEY, input_key TEXT NOT NULL, output TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS task_artifacts (job_id TEXT NOT NULL, input_key TEXT NOT NULL, stage TEXT NOT NULL,
      output TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY(job_id,input_key,stage));`);
}
export function saveEvidence(db, taskId, tool, level, text, truncated=false, dependencies=[]) {
  initEvidence(db);
  const clipped=text.length>45000;
  text=text.slice(0,45000);
  const id='E-'+digest({taskId,tool,level,text,truncated:truncated||clipped,dependencies}).slice(0,24);
  db.prepare('INSERT OR IGNORE INTO task_evidence VALUES (?,?,?,?,?,?,?,?)')
    .run(id,taskId,tool,level,Number(truncated||clipped),text,JSON.stringify(dependencies),Date.now());
  return id;
}
export function getEvidence(db,taskId,id) {
  const row=db.prepare('SELECT * FROM task_evidence WHERE id=? AND task_id=?').get(id,taskId);
  if(!row)throw new Error('Unsupported evidence: source not found in this task.');
  return {id:row.id,tool:row.tool,level:row.level,truncated:!!row.truncated,text:row.text,dependencies:JSON.parse(row.dependencies)};
}
export function evidenceIndex(db,taskId) {
  initEvidence(db);
  return db.prepare('SELECT id,tool,level,truncated FROM task_evidence WHERE task_id=? ORDER BY created,rowid').all(taskId);
}
// Capture only content actually returned to the researcher, never unseen full bodies.
export function captureEvidence(db,taskId,tool,value) {
  if(['gmail_review_overviews','gmail_review_bodies'].includes(tool)) {
    return {...value,items:value.items.map(item=>{
      if(item.error)return item;
      const instant=Date.parse(item.Date);
      const messageTime=Number.isFinite(instant)?{instant:new Date(instant).toISOString(),
        local:new Intl.DateTimeFormat('en-US',{timeZone:timezone,dateStyle:'medium',timeStyle:'short'}).format(new Date(instant)),timezone,meaning:'Notification timestamp, not necessarily event time'}:null;
      return {...item,messageTime,evidenceId:saveEvidence(db,taskId,tool,
        tool==='gmail_review_bodies'?'body':'overview',
        [item.id,item.From,item.Subject,item.Date,messageTime?JSON.stringify({messageTime}):'',item.body??item.snippet].filter(Boolean).join('\n'),!!item.bodyTruncated)};
    })};
  }
  const text=typeof value==='string'?value:JSON.stringify(value);
  return {...(Array.isArray(value)?{items:value}:value),evidenceId:saveEvidence(db,taskId,tool,tool==='sum_amounts'?'calculation':'tool',text,!!value?.truncated)};
}

export const citationZ=z.object({sourceId:z.string().min(1).max(60),quote:z.string().min(1).max(1800)}).strict();
export const findingZ=z.object({id:z.string().min(1).max(40),statement:z.string().min(1).max(1800),
  category:z.enum(['security','money','operations','deadline','request','other']),
  kind:z.enum(['reported','inference']),importance:z.enum(['high','normal','low']),
  citations:z.array(citationZ).min(1).max(8),calculationId:z.string().max(60),uncertainty:z.string().max(800)}).strict();
const str=maxLength=>({type:'string',maxLength});
export const findingSchema={type:'object',additionalProperties:false,properties:{
  id:{...str(40),minLength:1},statement:{...str(1800),minLength:1},
  category:{type:'string',enum:['security','money','operations','deadline','request','other']},
  kind:{type:'string',enum:['reported','inference']},importance:{type:'string',enum:['high','normal','low']},
  citations:{type:'array',minItems:1,maxItems:8,items:{type:'object',additionalProperties:false,
    properties:{sourceId:{...str(60),minLength:1},quote:{...str(1800),minLength:1}},required:['sourceId','quote']}},
  calculationId:str(60),uncertainty:str(800)},required:['id','statement','category','kind','importance','citations','calculationId','uncertainty']};
export const researchZ=z.object({status:z.enum(['continue','completed','blocked']),reply:z.string().max(18000),
  checkpoint:z.string().max(18000),language:z.enum(['es','en']),notify:z.boolean(),findings:z.array(findingZ).max(16)}).strict();
export const researchSchema={type:'object',additionalProperties:false,properties:{status:{type:'string',enum:['continue','completed','blocked']},
  reply:str(18000),checkpoint:str(18000),language:{type:'string',enum:['es','en']},notify:{type:'boolean'},findings:{type:'array',maxItems:16,items:findingSchema}},
  required:['status','reply','checkpoint','language','notify','findings']};
export function extractResearch(event){
  if(event?.type!=='result'||event.subtype!=='success'||event.is_error)throw new Error('Invalid research result');
  return researchZ.parse(event.structured_output);
}
const normalize=text=>text.replace(/\s+/g,' ').trim();
export function validateFindings(db,taskId,findings) {
  const parsed=z.array(findingZ).max(16).parse(findings);const ids=new Set();const sources=new Map();
  function source(id){const s=getEvidence(db,taskId,id);sources.set(id,s);return s;}
  for(const finding of parsed){
    if(ids.has(finding.id))throw new Error('Unsupported finding: duplicate ID.');ids.add(finding.id);
    for(const c of finding.citations){const s=source(c.sourceId);
      if(!normalize(s.text).includes(normalize(c.quote)))throw new Error('Unsupported finding: quote is not in its captured source.');
    }
    if(finding.kind==='inference'&&!finding.uncertainty.trim())throw new Error('Unsupported finding: inference needs an explicit uncertainty.');
    if(finding.calculationId){const calc=source(finding.calculationId);
      if(calc.level!=='calculation')throw new Error('Unsupported finding: total lacks a stored calculation.');
      for(const id of calc.dependencies)source(id);
    }
  }
  return {findings:parsed,sources:[...sources.values()]};
}
// A sourced total requires a quote containing both the transaction identity and
// the amount. Semantic interpretation/currency still needs the evidence review.
export function sumEvidenceAmounts(db,taskId,items,currency){
  for(const item of items){
    const s=getEvidence(db,taskId,item.evidenceId);
    if(!normalize(s.text).includes(normalize(item.quote))||!item.quote.includes(item.source))
      throw new Error('Unsupported total: quote must contain its transaction identifier and match a captured source.');
    const amounts=[...item.quote.matchAll(/(?<![\w.])-?\d[\d,]*(?:\.\d{1,2})?(?!\w|\.\d)/g)].map(m=>m[0].replaceAll(',',''));
    const canonical=amount=>sumAmounts([{source:'value',amount}],currency).total;
    if(!amounts.some(amount=>{try{return canonical(amount)===canonical(item.amount);}catch{return false;}}))
      throw new Error('Unsupported total: amount not found in the quoted source.');
  }
  const result=sumAmounts(items,currency);
  const evidenceId=saveEvidence(db,taskId,'sum_amounts','calculation',JSON.stringify({inputs:items,...result}),false,[...new Set(items.map(i=>i.evidenceId))]);
  return {...result,evidenceId};
}

export class ModelBudgetExceeded extends Error {}
export function reserveModelCall(db,jobId,limit=36){
  db.prepare('INSERT OR IGNORE INTO task_model_calls VALUES (?,0)').run(jobId);
  const claimed=db.prepare('UPDATE task_model_calls SET calls=calls+1 WHERE job_id=? AND calls<?').run(jobId,limit);
  if(!claimed.changes)throw new ModelBudgetExceeded('Task model-call budget exhausted');
}
