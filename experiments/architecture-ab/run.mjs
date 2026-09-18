// Opt-in comparison. No production writes, external sends or account credentials.
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,cpSync,copyFileSync,symlinkSync,readdirSync,rmSync,existsSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash,randomInt} from 'node:crypto';
import {spawn} from 'node:child_process';
const here=fileURLToPath(new URL('.',import.meta.url)),root=resolve(here,'../..');
const read=p=>readFileSync(p,'utf8'),sha=s=>createHash('sha256').update(s).digest('hex');
const cases=JSON.parse(read(join(here,'cases.json'))),args=process.argv.slice(2);
const common=read(join(here,'common.md'));
const smoke={id:'smoke',prompt:'¿A qué hora es la reunión?',history:[],sources:[{id:'meeting',title:'Reunión confirmada',snippet:'La hora está en el texto.',text:'La reunión empieza a las 11:30 AM ET del 21 de septiembre.'}]};
const concurrent={...cases[0],id:'concurrency',prompt:'Revisa estas novedades en segundo plano y avísame cuando termines.',sources:cases[0].sources.map(s=>({...s,delayMs:10000}))};

if(args[0]==='--child'){
 const [,variant,id,output]=args;
 const c=id==='smoke'?smoke:id==='concurrency'?concurrent:cases.find(c=>c.id===id);
 if(!c||!['staged','unified'].includes(variant))throw new Error('Invalid case/variant');
 const dir=mkdtempSync(join(tmpdir(),'narciso-architecture-')),app=join(dir,'app'),data=join(dir,'data');
 mkdirSync(app);mkdirSync(data,{mode:0o700});
 cpSync(join(root,'src'),join(app,'src'),{recursive:true});
 cpSync(join(root,'browser'),join(app,'browser'),{recursive:true});
 for(const f of ['SOUL.md','CONTEXT.example.md','package.json'])copyFileSync(join(root,f),join(app,f));
 symlinkSync(join(root,'node_modules'),join(app,'node_modules'),'dir');
 copyFileSync(join(here,'fixture-mcp.mjs'),join(app,'src/mcp.mjs'));
 writeFileSync(join(data,'sources.json'),JSON.stringify(c.sources),{mode:0o600});
 let code=read(join(app,'src/claude.mjs'));
 const start=code.indexOf('  const baseSystem = '),end=code.indexOf('  const system = options.isolated');
 if(start<0||end<start)throw new Error('Runtime changed; review evaluation adapter');
 code=code.slice(0,start)+`  const baseSystem = ${JSON.stringify(common)} + '\\n' + (options.system || '');\n`+code.slice(end);
 writeFileSync(join(app,'src/claude.mjs'),code);
 process.env.NARCISO_DATA_DIR=data;process.env.NARCISO_GOOGLE_EMAIL='';process.env.NARCISO_OWNER_PHONE='';
 for(const k of ['NARCISO_CHAT_MODEL','NARCISO_TASK_MODEL'])process.env[k]='claude-opus-5';
 for(const k of ['NARCISO_CHAT_EFFORT','NARCISO_TASK_EFFORT','NARCISO_PUBLICATION_EFFORT'])process.env[k]='high';
 const load=f=>import(pathToFileURL(join(app,'src',f)).href);
 const {openStore,saveMessage,acceptDelivery}=await load('store.mjs');
 const {startJob}=await load('jobs.mjs');
 const {respond}=await load('claude.mjs');
 const {createJobRunner,createJobNotifier,workerInstructions}=await load('job-runner.mjs');
 const {extractReply}=await load('reply-stream.mjs');
 const {actionCatalog}=await load('next-actions.mjs');
 const {publishResearch}=await load('publication.mjs');
 const db=openStore(),conversation='eval-'+id;
 const result={id,variant,model:'claude-opus-5',effort:'high',calls:0,events:[],deliveries:[]};
 const started=Date.now();let runner,notifier;
 try{
  c.history.forEach((m,i)=>saveMessage(db,`history-${i}`,conversation,m.role,m.body));
  acceptDelivery(db,'origin',conversation,c.prompt);db.prepare("UPDATE deliveries SET state='processing'").run();
  saveMessage(db,'origin',conversation,'user',c.prompt);
  const job=startJob(db,conversation,'origin','Investigar la petición',c.prompt);
  // Both variants start with the SAME real persisted job/ack state. This test
  // isolates investigation/publication, not the foreground delegation decision.
  db.prepare("UPDATE deliveries SET state='sent'").run();
  const run=async(...a)=>{
   result.calls++;
   if(variant==='unified'&&!a[4]?.isolated){
    a[4]={...a[4],system:workerInstructions.replace(
     'You are the RESEARCH stage for one saved owner task. You do not write the final iMessage.\nThe host checks evidence, reviews findings, edits and audits the reply separately.',
     'You own this saved task from investigation through the finished reply. Research, choose what matters, and write the final message in the same context. No mandatory separate composer or auditor runs.')
     .replace('Your reply field is a PRIVATE working note, never a user notification.',
      'On completed, your reply field is the finished message for the owner. Keep evidence IDs, private bookkeeping and internal deliberation out of it. Other status replies remain private.')
     +'\nYou have authority to choose a useful next action from actual available capabilities. Facts need sources; opinions must be grounded. Keep the findings record for later evaluation, not as prose for the owner.'};
   }
   return respond(...a);
  };
  runner=createJobRunner(db,{autoStart:false,maxSteps:4,maxCalls:12,run,
   report:(event)=>result.events.push({event,atMs:Date.now()-started}),
   publish:variant==='unified'?async(_db,_job,research)=>extractReply({type:'result',subtype:'success',structured_output:{reply:research.reply}})
    :(_db,_job,research,options)=>publishResearch(_db,_job,research,{...options,availableActions:actionCatalog([])})});
  notifier=createJobNotifier(db,{autoStart:false,send:async(_conversation,body)=>result.deliveries.push({body,atMs:Date.now()-started})});
  for(let i=0;i<5;i++){
   if(!['waiting_ack','queued','running'].includes(db.prepare('SELECT state FROM jobs WHERE id=?').get(job.id).state))break;
   if(id==='concurrency'&&i===0){
    let finished=false;const work=runner.step().finally(()=>{finished=true;});
    const deadline=Date.now()+60000;
    while(!finished&&Date.now()<deadline){
     const table=db.prepare("SELECT name FROM sqlite_master WHERE name='eval_access'").get();
     if(table&&db.prepare("SELECT count(*) AS n FROM eval_access WHERE tool='source_read'").get().n)break;
     await new Promise(r=>setTimeout(r,100));
    }
    result.asideStartedWhileRunning=!finished;
    result.aside=await respond(conversation,[{id:'aside',role:'user',body:'Mientras tanto, ¿cuánto es 17 por 4?'}],'aside',[],{isolated:true,system:common});
    result.asideAtMs=Date.now()-started;result.asideFinishedBeforeTask=!finished;
    await work;
   }else await runner.step();
   await notifier.flush();
  }
  const row=db.prepare('SELECT state,result FROM jobs WHERE id=?').get(job.id);
  result.state=row.state;result.reply=result.deliveries.at(-1)?.body||row.result||'[No llegó una respuesta.]';
  result.failures=db.prepare('SELECT phase,error_type,detail FROM task_failures').all();
  result.access=db.prepare('SELECT tool,source_id FROM eval_access').all();
  result.research=db.prepare('SELECT output FROM task_research WHERE job_id=?').get(job.id)?.output;
  result.publication=db.prepare('SELECT stage,output FROM task_artifacts WHERE job_id=? ORDER BY created').all(job.id);
  result.deliveryStates=db.prepare('SELECT kind,state FROM job_events').all();
  const events=readdirSync(join(data,'traces')).flatMap(n=>read(join(data,'traces',n)).trim().split('\n').filter(Boolean).map(JSON.parse));
  result.modelConfigurations=events.filter(e=>e.kind==='model_configuration').map(e=>e.data);
  result.toolNames=[...new Set(events.flatMap(e=>(e.data?.message?.content||[]).filter(b=>b.type==='tool_use').map(b=>b.name)))];
  result.profileVerified=result.modelConfigurations.every(p=>p.model==='claude-opus-5'&&p.effort==='high');
 }catch(e){result.error=e.message;}
 finally{
  await runner?.stop();await notifier?.stop();result.durationMs=Date.now()-started;db.close();
  writeFileSync(output,JSON.stringify(result,null,2)+'\n',{mode:0o600});rmSync(dir,{recursive:true,force:true});
 }
 if(result.error)process.exitCode=1;
}else{
 const idx=args.indexOf('--output');if(idx<0)throw new Error('Pass --output PRIVATE_DIRECTORY');
 const out=resolve(args[idx+1]);mkdirSync(out,{recursive:true,mode:0o700});
 const selected=args.includes('--smoke')?[smoke]:args.includes('--concurrency')?[concurrent]:cases;
 if(existsSync(join(out,'manifest.json')))throw new Error('Frozen run already exists; never overwrite');
 const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;};
 const labels=shuffle(selected.map((_,i)=>i%2?'staged':'unified'));
 const key=Object.fromEntries(selected.map((c,i)=>[c.id,{A:labels[i],B:labels[i]==='staged'?'unified':'staged'}]));
 const paths=['experiments/architecture-ab/run.mjs','experiments/architecture-ab/fixture-mcp.mjs','experiments/architecture-ab/common.md','experiments/architecture-ab/cases.json',...readdirSync(join(root,'src')).filter(n=>n.endsWith('.mjs')).map(n=>'src/'+n)];
 const manifest={created:new Date().toISOString(),model:'claude-opus-5',effort:'high',smoke:args.includes('--smoke'),concurrency:args.includes('--concurrency'),key,caseOrder:shuffle(selected.map(c=>c.id)),hashes:Object.fromEntries(paths.map(p=>[p,sha(read(join(root,p)))]))};
 writeFileSync(join(out,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600});
 let completed=0;const results={};
 for(const c of selected){
  results[c.id]={};
  // Two independent CLI runs; no subagents or live gateway are started.
  await Promise.all(shuffle(['staged','unified']).map(async variant=>{
   const output=join(out,`${c.id}-${variant}.json`);
   const code=await new Promise((done,reject)=>{
    const child=spawn(process.execPath,[fileURLToPath(import.meta.url),'--child',variant,c.id,output],{cwd:root,env:process.env,stdio:['ignore','ignore','ignore']});
    child.on('error',reject);child.on('close',done);
   });
   results[c.id][variant]=existsSync(output)?JSON.parse(read(output)):{error:'Child did not return'};
   console.log(JSON.stringify({completed:++completed,total:selected.length*2,case:c.id,status:code?'failed':results[c.id][variant].state}));
  }));
 }
 const blind=manifest.caseOrder.map((id,i)=>{const c=selected.find(c=>c.id===id);return {number:i+1,id,title:c.title,history:[{role:'user',body:'Perfil de prueba: dirijo un negocio, priorizo compromisos próximos y problemas operativos. No busco empleo; prefiero recomendaciones concretas.'},...c.history],sources:c.sources.map(s=>({title:s.title,text:s.text})),prompt:c.prompt,A:results[id][key[id].A].reply||'[No llegó una respuesta.]',B:results[id][key[id].B].reply||'[No llegó una respuesta.]'};});
 writeFileSync(join(out,'blind.json'),JSON.stringify(blind,null,2),{mode:0o600});
 console.log(JSON.stringify({finished:true,output:out}));
}
