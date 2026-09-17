import {z} from 'zod';
import {readSchemas} from './google.mjs';

// This catalog describes proposals, not execution. An accepted proposal returns
// to the normal chat tools and their existing approval/authorization boundaries.
const catalog={
  confirm_recognition:{tools:[],description:'Ask the owner whether they recognize the cited access/activity; prefer this over further research when only the owner can answer.'},
  inspect_mail:{tools:['gmail_search','gmail_read'],description:'Offer to inspect related email about a specific unresolved issue. Do not offer another broad review of mail already reviewed.'},
  draft_reply:{tools:[],description:'Offer to compose a response in chat to a cited direct request (request category). Target its person/company, not an invoice number. For an unresolved invoice balance, inspect related mail first. This does not send email or create a Gmail draft.'},
  check_calendar:{tools:['calendar_list','calendar_events'],description:'Offer to check calendar availability for the cited scheduling request.'},
  inspect_document:{tools:['docs_read'],description:'Offer to read a cited Google document whose identifier is already available. Do not promise arbitrary web browsing or opening unseen attachments.'},
};
export const actionKinds=['none',...Object.keys(catalog)];
export const actionZ=z.object({kind:z.enum(actionKinds),targets:z.array(z.object({findingId:z.string().min(1).max(40),label:z.string().max(64)}).strict()).max(2)}).strict();
export const actionSchema={type:'object',additionalProperties:false,properties:{kind:{type:'string',enum:actionKinds},targets:{type:'array',maxItems:2,items:{type:'object',additionalProperties:false,properties:{findingId:{type:'string',minLength:1,maxLength:40},label:{type:'string',maxLength:64}},required:['findingId','label']}}},required:['kind','targets']};
export function actionCatalog(tools=Object.keys(readSchemas)){
  return [{kind:'none',description:'No follow-up when nothing useful is needed. Do not manufacture a question.'},
    ...Object.entries(catalog).filter(([,c])=>c.tools.every(t=>tools.includes(t))).map(([kind,c])=>({kind,description:c.description}))];
}
export function renderAction(action,findings,language='es',available=actionCatalog()){
  action=actionZ.parse(action);
  if(!available.some(c=>c.kind===action.kind))throw new Error('Proposed action is unavailable.');
  if(action.kind==='none'){
    if(action.targets.length)throw new Error('No-action must have no targets.');
    return '';
  }
  if(!action.targets.length)throw new Error('An action must target a cited finding.');
  for(const t of action.targets){
    const finding=findings.find(f=>f.id===t.findingId);
    if(!finding||!finding.statement.toLowerCase().includes(t.label.toLowerCase())||/[\n\r?<>:]/.test(t.label)||/\b[TE]-[a-f\d]{8,}\b/i.test(t.label))throw new Error('Action target must be a short literal label from an included finding.');
    if(action.kind==='confirm_recognition'&&/dispositivo|device|desconocid|unrecognized/i.test(t.label))throw new Error('Name the service as action target, or use an empty label for an unnamed service.');
    if(action.kind==='confirm_recognition'&&/^(?:\d{1,3}\.){3}\d{1,3}$/.test(t.label))throw new Error('Use the service name, not an IP, as the action target.');
    if(action.kind==='confirm_recognition'&&finding.category!=='security')throw new Error('Recognition questions require a security finding.');
    if(action.kind==='draft_reply'&&finding.category!=='request')throw new Error('A reply proposal needs a direct-request finding. For an unresolved invoice, offer to inspect related mail instead.');
  }
  const labels=[...new Set(action.targets.map(t=>t.label).filter(Boolean))].join(language==='en'?' and ':' y ');
  if(!labels&&action.kind!=='confirm_recognition')throw new Error('This action needs a named target.');
  const invoice=action.kind==='inspect_mail'&&action.targets.some(t=>findings.some(f=>f.id===t.findingId&&f.category==='money'&&/\b(?:factura|invoice|bill)\b/i.test(f.statement)));
  const templates=language==='en'?{
    confirm_recognition:labels?`Do you recognize that activity on ${labels}?`:'Was that you?',
    inspect_mail:invoice?`Want me to look for a payment confirmation for ${labels} in your email?`:`Want me to check the emails about ${labels} to see what happened?`,
    draft_reply:`Want me to prepare a reply to ${labels}?`,
    check_calendar:`Want me to check your availability for ${labels}?`,
    inspect_document:`Want me to read ${labels} and pull out what matters?`,
  }:{
    confirm_recognition:labels?`¿Reconoces esos accesos a ${labels}?`:'¿Fuiste tú?',
    inspect_mail:invoice?`¿Quieres que busque en tu correo un comprobante de pago de ${labels}?`:`¿Quieres que revise los correos sobre ${labels} para ver qué pasó?`,
    draft_reply:`¿Quieres que prepare una respuesta para ${labels}?`,
    check_calendar:`¿Quieres que revise tu disponibilidad para ${labels}?`,
    inspect_document:`¿Quieres que lea ${labels} y te diga lo importante?`,
  };
  return templates[action.kind];
}
