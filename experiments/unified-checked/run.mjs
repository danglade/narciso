// Explicit, isolated evaluations only. No live gateway import or outbound transport.
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,cpSync,copyFileSync,symlinkSync,readdirSync,rmSync,existsSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,join} from 'node:path';
import {tmpdir,homedir} from 'node:os';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
const here=fileURLToPath(new URL('.',import.meta.url)),root=resolve(here,'../..');
const read=p=>readFileSync(p,'utf8'),sha=s=>createHash('sha256').update(s).digest('hex');
const args=process.argv.slice(2),common=read(join(here,'common.md'));

if(args[0]==='--child'){
 const c=JSON.parse(read(args[1])),output=args[2];
 const dir=mkdtempSync(join(tmpdir(),'narciso-checked-')),app=join(dir,'app'),data=join(dir,'data');
 mkdirSync(app);mkdirSync(data,{mode:0o700});
 cpSync(join(root,'src'),join(app,'src'),{recursive:true});cpSync(join(root,'browser'),join(app,'browser'),{recursive:true});
 for(const f of ['SOUL.md','CONTEXT.example.md','package.json'])copyFileSync(join(root,f),join(app,f));
 symlinkSync(join(root,'node_modules'),join(app,'node_modules'),'dir');
 copyFileSync(join(here,'fixture-mcp.mjs'),join(app,'src/mcp.mjs'));
 writeFileSync(join(data,'sources.json'),JSON.stringify(c.sources),{mode:0o600});
 const taskCommon=common.replace('2026-09-18T14:30:00.000Z',c.requestedAt||'2026-09-18T14:30:00.000Z');
 let code=read(join(app,'src/claude.mjs'));const start=code.indexOf('  const baseSystem = '),end=code.indexOf('  const system = options.isolated');
 if(start<0||end<start)throw new Error('Review adapter for changed runtime');
 code=code.slice(0,start)+`  const baseSystem = ${JSON.stringify(taskCommon)} + '\\n' + (options.system || '');\n`+code.slice(end);writeFileSync(join(app,'src/claude.mjs'),code);
 process.env.NARCISO_DATA_DIR=data;process.env.NARCISO_GOOGLE_EMAIL='';process.env.NARCISO_OWNER_PHONE='';
 process.env.NARCISO_CHAT_MODEL=process.env.NARCISO_TASK_MODEL='claude-opus-5';
 process.env.NARCISO_CHAT_EFFORT=process.env.NARCISO_TASK_EFFORT=process.env.NARCISO_PUBLICATION_EFFORT='high';
 const load=f=>import(pathToFileURL(join(app,'src',f)).href);
 const {openStore,saveMessage,acceptDelivery}=await load('store.mjs');
 const {startJob}=await load('jobs.mjs');const {respond}=await load('claude.mjs');
 const {createUnifiedJobRunner}=await load('unified.mjs');const {createJobNotifier}=await load('job-runner.mjs');
 const {imessageBubbles}=await load('imessage-format.mjs');
 const db=openStore(),conversation='evaluation',started=Date.now();
 const result={id:c.id,variant:'checked',model:'claude-opus-5',effort:'high',mode:c.shadow?'saved-evidence-shadow':'synthetic',deliveries:[],events:[]};let runner,notifier;
 try{
  for(const [i,m] of c.history.entries())saveMessage(db,'history-'+i,conversation,m.role,m.body);
  acceptDelivery(db,'origin',conversation,c.prompt);db.prepare("UPDATE deliveries SET state='processing'").run();saveMessage(db,'origin',conversation,'user',c.prompt);
  const job=startJob(db,conversation,'origin','Revisar solicitud',c.prompt);
  db.prepare('UPDATE jobs SET created=? WHERE id=?').run(Date.parse(c.requestedAt||'2026-09-18T14:30:00.000Z'),job.id);
  db.prepare("UPDATE deliveries SET state='sent'").run();
  runner=createUnifiedJobRunner(db,{autoStart:false,maxSteps:8,maxCalls:16,run:respond,report:event=>result.events.push({event,atMs:Date.now()-started})});
  notifier=createJobNotifier(db,{autoStart:false,split:imessageBubbles,send:async(_c,body)=>result.deliveries.push({body,atMs:Date.now()-started})});
  for(let step=0;step<9;step++){
   if(!['waiting_ack','queued','running'].includes(db.prepare('SELECT state FROM jobs').get().state))break;
   await runner.step();await notifier.flush();
  }
  const jobResult=db.prepare('SELECT state,result,checkpoint,steps FROM jobs').get();Object.assign(result,jobResult);result.reply=jobResult.result;
  result.failures=db.prepare('SELECT phase,error_type,detail FROM task_failures').all();
  result.access=db.prepare('SELECT tool,source_id FROM eval_access').all();
  result.artifacts=db.prepare('SELECT stage,output FROM task_artifacts ORDER BY created').all();
  result.parts=db.prepare('SELECT part,state FROM job_event_parts ORDER BY part').all();
  result.research=db.prepare('SELECT output FROM task_research').get()?.output;
  const events=readdirSync(join(data,'traces')).flatMap(n=>read(join(data,'traces',n)).trim().split('\n').filter(Boolean).map(JSON.parse));
  result.modelConfigurations=events.filter(e=>e.kind==='model_configuration').map(e=>e.data);
  result.tools=[...new Set(events.flatMap(e=>(e.data?.message?.content||[]).filter(b=>b.type==='tool_use').map(b=>b.name)))];
  result.profileVerified=result.modelConfigurations.length>0&&result.modelConfigurations.every(p=>p.model==='claude-opus-5'&&p.effort==='high');
 }catch(e){result.error=e.message;}
 finally{
  await runner?.stop();await notifier?.stop();result.durationMs=Date.now()-started;db.close();
  writeFileSync(output,JSON.stringify(result,null,2)+'\n',{mode:0o600});rmSync(dir,{recursive:true,force:true});
 }
 if(result.error)process.exitCode=1;
}else{
 const idx=args.indexOf('--output');if(idx<0)throw new Error('Pass --output PRIVATE_DIRECTORY');const out=resolve(args[idx+1]);
 // Prevent accidental publication of real snapshots via this public repository.
 if(out===root||out.startsWith(root+'/'))throw new Error('Evaluation output must be outside the public checkout');
 mkdirSync(out,{recursive:true,mode:0o700});if(existsSync(join(out,'manifest.json')))throw new Error('Frozen run exists; do not overwrite');
 let cases=JSON.parse(read(join(here,args.includes('--style')?'style-cases.json':'cases.json')));
 if(args.includes('--shadow')){
  const db=new DatabaseSync(join(homedir(),'.local/share/narciso/data/narciso.sqlite'),{readOnly:true});
  try{
   const job=db.prepare("SELECT * FROM jobs WHERE state IN ('completed','blocked') AND EXISTS (SELECT 1 FROM task_evidence e WHERE e.task_id=jobs.id AND e.tool NOT IN ('owner_request','owner_clarification')) ORDER BY created DESC LIMIT 1").get();
   if(!job)throw new Error('No saved real task has evidence for shadow replay');
   const rows=db.prepare("SELECT * FROM task_evidence WHERE task_id=? AND tool NOT IN ('owner_request','owner_clarification') ORDER BY created,rowid").all(job.id);
   const prompt=db.prepare("SELECT body FROM messages WHERE id=? AND role='user'").get(job.origin)?.body||job.objective;
   cases=[{id:'shadow-1',title:'Saved real task',shadow:true,sourceJob:job.id,requestedAt:new Date(job.created).toISOString(),prompt,history:JSON.parse(job.snapshot).messages.filter(m=>m.role==='user'&&m.id!==job.origin),sources:rows.map((r,i)=>({id:'source-'+i,title:r.tool+' '+r.level,snippet:r.text.slice(0,300),text:r.text,truncated:!!r.truncated})),rubric:{must:['Stay within actually saved evidence; never claim live account access'],mustNot:['Send messages or modify accounts']}}];
  }finally{db.close();}
 }
 const paths=['experiments/unified-checked/run.mjs','experiments/unified-checked/cases.json','experiments/unified-checked/style-cases.json','experiments/unified-checked/common.md','experiments/unified-checked/fixture-mcp.mjs',...readdirSync(join(root,'src')).filter(n=>n.endsWith('.mjs')).map(n=>'src/'+n)];
 writeFileSync(join(out,'manifest.json'),JSON.stringify({created:new Date().toISOString(),variant:'checked',mode:args.includes('--shadow')?'saved-evidence-shadow':'synthetic',cases:cases.map(c=>c.id),hashes:Object.fromEntries(paths.map(p=>[p,sha(read(join(root,p)))]))},null,2),{mode:0o600});
 // Sequential: preserve all attempts and avoid changing the latency through competing runs.
 for(const c of cases){
  const input=join(out,c.id+'-input.json'),output=join(out,c.id+'-result.json');writeFileSync(input,JSON.stringify(c,null,2),{mode:0o600});
  const exit=await new Promise((done,reject)=>{const child=spawn(process.execPath,[fileURLToPath(import.meta.url),'--child',input,output],{cwd:root,env:process.env,stdio:['ignore','ignore','ignore']});child.on('error',reject);child.on('close',done);});
  const result=JSON.parse(read(output));console.log(JSON.stringify({case:c.id,state:result.state,error:exit?'Evaluation failed':undefined,calls:result.modelConfigurations?.length,parts:result.parts?.length}));
 }
 console.log(JSON.stringify({finished:true,output:out}));
}
