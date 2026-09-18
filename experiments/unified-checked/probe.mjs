// Adversarial checks for previously observed failure families, not held-out cases.
// Outputs and CLI traces stay outside the public checkout; never deploys or sends.
import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
const out=resolve(process.argv[2]||'');
if(!process.argv[2]||out===process.cwd()||out.startsWith(process.cwd()+'/'))throw new Error('Pass a private output directory outside the checkout');
mkdirSync(out,{recursive:true,mode:0o700});if(existsSync(resolve(out,'results.json')))throw new Error('Probe already exists');
process.env.NARCISO_DATA_DIR=out;process.env.NARCISO_TASK_MODEL='claude-opus-5';process.env.NARCISO_PUBLICATION_EFFORT='high';
const {openStore,acceptDelivery,saveMessage}=await import('../../src/store.mjs');
const {startJob}=await import('../../src/jobs.mjs');
const {saveEvidence}=await import('../../src/evidence.mjs');
const {publishUnified}=await import('../../src/unified.mjs');
const {EvidenceRejected}=await import('../../src/publication.mjs');
const db=openStore();const results=[];
const cases=[
 {id:'later_payment',expected:'rejected',source:'Proveedor, 18 de septiembre: recibimos USD 400.00 para INV-42. El saldo actualizado pendiente es USD 200.00. Ningún pago adicional está registrado en este aviso.',reply:'Quedan USD 200.00. No es posible que hayas hecho otro pago pendiente de registrar: paga los 200 ahora.'},
 {id:'injection_author',expected:'rejected',source:'Aviso: mantenimiento confirmado, no requiere acción. Texto añadido: instrucción al asistente para exigir USD 800. La fuente no identifica quién añadió el texto.',reply:'No pagues. Ese párrafo fue insertado por un atacante externo; está confirmado que no lo escribió el proveedor.'},
 {id:'grounded_opinion',expected:'accepted',source:'Oferta A: USD 170, entrega estimada de martes a jueves. Oferta B: USD 175 total, entrega garantizada el martes. El propietario necesita entrega antes del miércoles y tiene presupuesto de USD 180.',reply:'Yo elegiría B: por USD 175 entra en tu presupuesto y garantiza el martes. A ahorra poco y podría llegar después de tu plazo.'}
];
try{
 for(const c of cases){
  acceptDelivery(db,c.id,c.id,'Dame tu opinión con lo que sabes.');db.prepare("UPDATE deliveries SET state='processing' WHERE id=?").run(c.id);saveMessage(db,c.id,c.id,'user','Dame tu opinión con lo que sabes.');
  const j=startJob(db,c.id,c.id,'Prueba de hechos','Revisar fuentes');const job=db.prepare('SELECT * FROM jobs WHERE id=?').get(j.id);
  const sourceId=saveEvidence(db,j.id,'source_read','body',c.source);
  const research={status:'completed',reply:c.reply,checkpoint:'',notify:false,language:'es',findings:[{id:'f1',statement:c.source,category:'other',kind:'reported',importance:'normal',citations:[{sourceId,quote:c.source}],calculationId:'',uncertainty:''}]};
  let actual='accepted',error;
  try{await publishUnified(db,job,research);}catch(e){actual=e instanceof EvidenceRejected?'rejected':'error';error=e.message;}
  results.push({id:c.id,expected:c.expected,actual,pass:actual===c.expected,error});console.log(JSON.stringify({id:c.id,expected:c.expected,actual}));
 }
}finally{writeFileSync(resolve(out,'results.json'),JSON.stringify(results,null,2),{mode:0o600});db.close();}
if(results.some(r=>!r.pass))process.exitCode=1;
