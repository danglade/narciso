// Frozen, opt-in A/B of conversation instructions. Official Claude subscription;
// real MCP surface, isolated state, no Google credentials or Photon connection.
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,cpSync,copyFileSync,symlinkSync,readdirSync,rmSync,existsSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash,randomInt,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
const here=fileURLToPath(new URL('.',import.meta.url)),root=resolve(here,'../..');
const read=p=>readFileSync(p,'utf8');
const sha=s=>createHash('sha256').update(s).digest('hex');
const cases=JSON.parse(read(join(here,'cases.json')));
const args=process.argv.slice(2);
const fixedTime='2026-09-17T23:30:00.000Z';
if(args[0]==='--child'){
 const [,variant,id,output]=args,c=cases.find(x=>x.id===id);
 if(!c||!['current','simple'].includes(variant))throw new Error('Invalid evaluation');
 const dir=mkdtempSync(join(tmpdir(),'narciso-core-ab-')),app=join(dir,'app'),data=join(dir,'data');
 mkdirSync(app);mkdirSync(data,{mode:0o700});
 cpSync(join(root,'src'),join(app,'src'),{recursive:true});
 for(const f of ['SOUL.md','CONTEXT.example.md','package.json'])copyFileSync(join(root,f),join(app,f));
 symlinkSync(join(root,'node_modules'),join(app,'node_modules'),'dir');
 let code=read(join(app,'src/claude.mjs'));
 code=code.replace('Current time: ${new Date().toISOString()}.',`Current time: ${fixedTime}.`);
 if(variant==='simple'){
  const start=code.indexOf('  const baseSystem = '),end=code.indexOf('  const system = options.isolated');
  if(start<0||end<start)throw new Error('Runtime changed; review comparison adapter');
  const system=read(join(here,'simple-system.md'))+'\n\n'+read(join(here,'contract.md'))+'\n\n'+read(join(root,'CONTEXT.example.md'))+`\nCurrent time: ${fixedTime}. Timezone: America/New_York.`;
  code=code.slice(0,start)+`  const baseSystem = ${JSON.stringify(system)} + '\\n' + (options.system || '');\n`+code.slice(end);
 }
 writeFileSync(join(app,'src/claude.mjs'),code);
 process.env.NARCISO_DATA_DIR=data;
 process.env.NARCISO_GOOGLE_EMAIL='';process.env.NARCISO_OWNER_PHONE='';
 process.env.NARCISO_CHAT_MODEL='claude-opus-5';process.env.NARCISO_CHAT_EFFORT='high';
 process.env.NARCISO_TIMEZONE='America/New_York';
 const load=f=>import(pathToFileURL(join(app,'src',f)).href);
 const {openStore,saveMessage,acceptDelivery}=await load('store.mjs');
 const {handle}=await load('assistant.mjs');
 const {startJob}=await load('jobs.mjs');
 const db=openStore(),conversation='eval-'+id;
 const result={id,variant,model:'claude-opus-5',effort:'high'};
 try{
  c.history.forEach((m,i)=>saveMessage(db,`history-${i}`,conversation,m.role,m.body));
  if(c.background){
   acceptDelivery(db,'earlier-task',conversation,c.history[0].body);
   db.prepare("UPDATE deliveries SET state='processing' WHERE id='earlier-task'").run();
   startJob(db,conversation,'earlier-task','Revisión del caso ficticio',c.history[0].body);
   db.prepare("UPDATE deliveries SET state='sent' WHERE id='earlier-task'").run();
   db.prepare("UPDATE jobs SET state='queued'").run();
  }
  const turn=randomUUID();acceptDelivery(db,turn,conversation,c.prompt);
  db.prepare("UPDATE deliveries SET state='processing' WHERE id=?").run(turn);
  const start=Date.now();result.reply=await handle(db,conversation,c.prompt,turn);result.durationMs=Date.now()-start;
  result.words=result.reply.trim().split(/\s+/).length;
  result.jobs=db.prepare('SELECT state FROM jobs').all();
  result.approvals=db.prepare('SELECT action,state FROM approvals').all();
  const events=readdirSync(join(data,'traces')).flatMap(n=>read(join(data,'traces',n)).trim().split('\n').map(s=>JSON.parse(s)));
  result.toolNames=[...new Set(events.flatMap(e=>(e.data?.message?.content||[]).filter(b=>b.type==='tool_use').map(b=>b.name)))];
  result.modelConfigurations=events.filter(e=>e.kind==='model_configuration').map(e=>e.data);
 }catch(e){result.error=e.message;}
 finally{db.close();writeFileSync(output,JSON.stringify(result,null,2)+'\n',{mode:0o600});rmSync(dir,{recursive:true,force:true});}
 if(result.error)process.exitCode=1;
}else{
 const idx=args.indexOf('--output');if(idx<0)throw new Error('Pass --output with a private output directory');
 const out=resolve(args[idx+1]);if(existsSync(join(out,'manifest.json')))throw new Error('Frozen run exists; use a new directory, never overwrite answers');
 mkdirSync(out,{recursive:true,mode:0o700});
 const labels=Array(6).fill('current').concat(Array(6).fill('simple'));
 const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;};
 shuffle(labels);
 const key=Object.fromEntries(cases.map((c,i)=>[c.id,{A:labels[i],B:labels[i]==='current'?'simple':'current'}]));
 const files=['cases.json','simple-system.md','contract.md','run.mjs'];
 const manifest={created:new Date().toISOString(),fixedTime,model:'claude-opus-5',effort:'high',sourceHashes:Object.fromEntries([...files.map(f=>['experiments/core-ab/'+f,sha(read(join(here,f)))]),...['src/claude.mjs','src/mcp.mjs','src/assistant.mjs','SOUL.md','CONTEXT.example.md'].map(f=>[f,sha(read(join(root,f)))])]),caseOrder:shuffle(cases.map(c=>c.id)),key};
 writeFileSync(join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{mode:0o600});
 const results={};let completed=0;
 for(const c of cases){
  results[c.id]={};
  for(const variant of shuffle(['current','simple'])){
   const target=join(out,`${c.id}-${variant}.json`);
   const exitCode=await new Promise((done,reject)=>{
    const child=spawn(process.execPath,[fileURLToPath(import.meta.url),'--child',variant,c.id,target],{cwd:root,env:process.env,stdio:['ignore','ignore','pipe']});
    let stderr='';child.stderr.on('data',s=>{stderr=(stderr+s.toString()).slice(-2000);});
    child.on('error',reject);child.on('close',code=>{if(code)console.error(`Evaluation ${c.id} could not complete; retained as failure.`);done(code);});
   });
   results[c.id][variant]=JSON.parse(read(target));
   console.log(JSON.stringify({completed:++completed,total:cases.length*2,case:c.id,status:exitCode?'failed':'done'}));
  }
 }
 const blind=manifest.caseOrder.map((id,i)=>{const c=cases.find(c=>c.id===id);return {number:i+1,id,title:c.title,history:c.history,prompt:c.prompt,A:results[id][key[id].A].reply??'[No llegó una respuesta.]',B:results[id][key[id].B].reply??'[No llegó una respuesta.]'};});
 writeFileSync(join(out,'blind.json'),JSON.stringify(blind,null,2)+'\n',{mode:0o600});
 const markdown=['# Comparación ciega','A/B se mezcla por caso. Elige A, B, empate o ninguna. Valora criterio, naturalidad, iniciativa y exactitud.'];
 for(const c of blind)markdown.push(`## ${c.number}. ${c.title}`,c.history.length?'Contexto:\n'+c.history.map(m=>`${m.role==='user'?'Usuario':'Asistente'}: ${m.body}`).join('\n\n'):'',`Pregunta: ${c.prompt}`,'### A',c.A,'### B',c.B,'Elección: ___\nMotivo: ___');
 writeFileSync(join(out,'blind.md'),markdown.filter(Boolean).join('\n\n')+'\n',{mode:0o600});
 console.log(JSON.stringify({finished:true,cases:blind.length,output:out}));
}
