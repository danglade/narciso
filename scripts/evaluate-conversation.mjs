// Opt-in real-model conversation evaluation. No Photon, Google credentials, or
// private owner context; a copied runtime and temporary SQLite exercise the
// actual chat, MCP, worker and publication paths. Uses Claude subscription quota.
import {mkdtempSync,mkdirSync,cpSync,copyFileSync,symlinkSync,readFileSync,writeFileSync,rmSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const directory=mkdtempSync(join(tmpdir(),'narciso-conversation-'));
const app=join(directory,'app'),data=join(directory,'data');
mkdirSync(app);mkdirSync(data,{mode:0o700});
cpSync(join(root,'src'),join(app,'src'),{recursive:true});
for(const file of ['SOUL.md','CONTEXT.example.md','package.json'])copyFileSync(join(root,file),join(app,file));
symlinkSync(join(root,'node_modules'),join(app,'node_modules'),'dir');
process.env.NARCISO_DATA_DIR=data;
process.env.NARCISO_GOOGLE_EMAIL='';
process.env.NARCISO_OWNER_PHONE='';
const load=name=>import(pathToFileURL(join(app,'src',name)).href);
const {openStore,acceptDelivery}=await load('store.mjs');
const {handle}=await load('assistant.mjs');
const {createJobRunner,createJobNotifier}=await load('job-runner.mjs');
const db=openStore();
const report={date:new Date().toISOString(),isolation:'temporary runtime, public context, no Google tokens, no Photon',turns:[],events:[],checks:{}};
const conversation='synthetic-behavior-evaluation';
const started=Date.now();
const record=(kind,extra={})=>report.events.push({kind,elapsedMs:Date.now()-started,...extra});
let runner;
let worker;
async function turn(label,input){
 const id=randomUUID(),before=Date.now();
 acceptDelivery(db,id,conversation,input);
 db.prepare("UPDATE deliveries SET state='processing' WHERE id=?").run(id);
 record('turn_start',{label});
 const reply=await handle(db,conversation,input,id);
 db.prepare("UPDATE deliveries SET state='sent',response=? WHERE id=?").run(reply,id);
 const result={label,input,reply,durationMs:Date.now()-before};
 report.turns.push(result);record('turn_complete',{label});
 console.log(JSON.stringify(result));return reply;
}
const clean=text=>!(/T-[A-F0-9]{8}|<\/?(?:thinking|analysis|scratchpad)|mcp__|task_start|task_status/i.test(text));
try{
 const priority=await turn('priority','Quiero probar un caso ficticio contigo, sin acceder a cuentas ni ejecutar acciones. Imagina que hoy llegaron estos correos: un acceso a CloudNest desde un dispositivo que no reconozco; una factura de Acme por $240 que vence mañana; un reclutador que pide mi disponibilidad, sin fecha límite; un recibo de una compra que sí reconozco; y 30 newsletters. ¿Qué merece mi atención y qué harías después?');
 report.checks.shortTriage=priority.split(/\s+/).length<=160;
 const correction=await turn('correction','Seguimos con el caso ficticio: el acceso a CloudNest sí fui yo y la factura de Acme ya está pagada. Tengo dos minutos; ¿qué queda que merezca mi atención?');
 report.checks.shortCorrection=correction.split(/\s+/).length<=70;
 report.checks.noReopenedDeviceAdvice=!/marcarlo como de confianza|dispositivo de confianza/i.test(correction);
 const unavailable=await turn('unavailable_web','Ahora una investigación real, solo de lectura: busca en la documentación oficial de Playwright y Chrome qué conviene para un asistente personal en un Mac que necesita conservar sesiones y dejarme intervenir cuando aparece un CAPTCHA o MFA. Compara un perfil persistente dedicado con conectarse a un Chrome ya abierto. Quiero tu recomendación, las 3 limitaciones más importantes y enlaces a las fuentes. No instales ni cambies nada.');
 report.checks.noUnsupportedWebJob=db.prepare('SELECT count(*) AS n FROM jobs').get().n===0;
 report.checks.webLimitationExpressed=/no (?:tengo|puedo|está|cuento)|sin (?:navegador|acceso)|no hay/i.test(unavailable);
 report.checks.noUnverifiedReplacementReport=unavailable.split(/\s+/).length<=100;
 const memory=await turn('context_recall','Volviendo al caso ficticio anterior: ¿qué había quedado pendiente?');
 report.checks.pendingRecruiterRecalled=/recruiter|reclutador/i.test(memory);
 report.checks.noRoutineCleanupInvented=!/archiv|limpiar|limpieza/i.test(correction+' '+memory);
 // A supported background scenario in the same conversation: the web task
 // above has no tools here, so it is not a comparable research workload.
 // Cancel any unsupported job locally to keep it out of this scenario.
 db.prepare("UPDATE jobs SET state='cancelled' WHERE state IN ('waiting_ack','queued','running')").run();
 const objective=`Revisa en segundo plano este lote ficticio de avisos, sin acceder a cuentas ni ejecutar cambios. Deduplica por ID y separa pagos recibidos de pendientes. Contrasta el digest y dime solo lo que merece atención, con total exacto de lo recibido. Los datos están completos para este ejercicio; no hay que consultar Gmail.
Aviso A01: pago recibido USD 110.00.
Aviso A02: pago recibido USD 80.00.
Aviso A03: pago recibido USD 110.00.
Aviso A04: pago recibido USD 135.00.
Aviso A05: pago recibido USD 110.00.
Aviso A06: pago recibido USD 50.00.
Aviso A07: pago recibido USD 160.00.
Aviso A08: pago recibido USD 110.00.
Aviso A09: pago recibido USD 110.00.
Aviso A10: pago recibido USD 110.00.
Reenvío A01: pago recibido USD 110.00; duplicado del mismo pago, no otro ingreso.
Aviso P01: pago pendiente USD 75.00; no recibido.
Digest D01: afirma 10 pagos recibidos por USD 1105.00; no contiene otras transacciones.
Operaciones: falló la limpieza nocturna de Atlas; no consta causa ni impacto.
Promociones: 30 newsletters sin vencimientos ni solicitudes directas.
No programes seguimientos. No sumes el digest ni el reenvío como pagos nuevos.`;
 const ack=await turn('background_ack',objective);
 const job=db.prepare("SELECT * FROM jobs WHERE state='waiting_ack' ORDER BY created DESC LIMIT 1").get();
 report.checks.backgroundSaved=Boolean(job);
 report.checks.briefAcknowledgment=ack.split(/\s+/).length<=45&&clean(ack);
 if(job){
  runner=createJobRunner(db,{autoStart:false,maxSteps:5,maxCalls:18,report:(event)=>record(event)});
  worker=runner.step();
  report.checks.workerRunningBeforeQuestion=db.prepare('SELECT state FROM jobs WHERE id=?').get(job.id).state==='running';
  const arithmetic=await turn('interleaved_arithmetic','Mientras tanto, ¿cuánto es 17 por 4?');
  report.checks.arithmeticOnly=/^68[.!]?$/.test(arithmetic.trim());
  report.checks.questionFinishedBeforeResearch=!report.events.some(e=>e.kind==='task_completed');
  await worker;
  for(let i=0;i<4&&db.prepare('SELECT state FROM jobs WHERE id=?').get(job.id).state==='queued';i++)await runner.step();
  const final=db.prepare('SELECT state,result,steps FROM jobs WHERE id=?').get(job.id);
  report.background=final;
  report.checks.researchCompleted=final.state==='completed';
  report.checks.exactTotal=/1[,.\s]?085(?:[.,]00)?/.test(final.result||'');
  const sent=[];
  const notifier=createJobNotifier(db,{autoStart:false,send:async(_conversation,body)=>{sent.push(body);record('result_delivered');}});
  for(let i=0;i<3;i++)await notifier.flush();
  report.deliveries=sent;
  report.checks.resultDelivered=sent.includes(final.result);
  console.log(JSON.stringify({background:final,checks:report.checks}));
 }
 report.checks.noInternalIds=report.turns.every(t=>clean(t.reply))&&(report.deliveries||[]).every(clean);
 report.checks.noGoogleApprovals=db.prepare('SELECT count(*) AS n FROM approvals').get().n===0;
 // Retain tool NAMES only; raw CLI deliberation and traces are never published.
 report.toolNames=[...new Set(readdirSync(join(data,'traces')).flatMap(name=>readFileSync(join(data,'traces',name),'utf8').trim().split('\n').flatMap(line=>{
  const e=JSON.parse(line);return (e.data?.message?.content||[]).filter(b=>b.type==='tool_use').map(b=>b.name);
 })))].sort();
 report.pass=Object.values(report.checks).every(Boolean);
 if(!report.pass)process.exitCode=1;
}catch(error){report.error=error.message;process.exitCode=1;}
finally{
 if(worker)await worker.catch(()=>{});
 if(runner)await runner.stop();
 db.close();
 const i=process.argv.indexOf('--output');
 if(i>=0)writeFileSync(resolve(process.argv[i+1]),JSON.stringify(report,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify({checks:report.checks,error:report.error,pass:report.pass}));
 rmSync(directory,{recursive:true,force:true});
}
