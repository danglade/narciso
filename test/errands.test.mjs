import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {createServer} from 'node:net';
import {once} from 'node:events';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {openStore,acceptDelivery,saveMessage,claimApproval} from '../src/store.mjs';
import {startErrand,inspectErrand,actErrand,prepareErrandAction,executeErrandAction,verifyErrand,cancelErrand,listErrands,recoverErrands,browserApprovalText,settleErrandStep,browserStepReply} from '../src/errands.mjs';
import {interactPage as serializedInteractPage} from '../browser/extension/interaction.js';
const interactPage=op=>{const r=serializedInteractPage(op);if(r.error)throw Object.assign(new Error(r.error),{attempted:r.attempted});return r;};
import {validateRequest} from '../browser/extension/protocol.js';

// Controlled DOM surface for the actual serialized extension function. This is
// not a live Chrome test; it verifies snapshot identity and mutation behavior.
function form(){
 const names=['document','location','getComputedStyle','HTMLInputElement','HTMLTextAreaElement','HTMLSelectElement','__narcisoInteractionV1'];
 const saved=new Map(names.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 class Element {
  constructor(tag,type,label){Object.assign(this,{tagName:tag,type,innerText:tag==='BUTTON'?label:'',name:label,labels:[{innerText:label}],isConnected:true,disabled:false,readOnly:false,checked:false,_value:'',events:[],attributes:{},form:{action:'https://portal.example/request',method:'post'}});}
  get formAction(){return this.attributes.formaction||globalThis.location.href;}set formAction(v){this.attributes.formaction=v;}
  get value(){return this._value;}set value(v){this._value=v;}
  getClientRects(){return [{}];}getAttribute(key){return this.attributes[key]??null;}hasAttribute(key){return Object.hasOwn(this.attributes,key);}
  dispatchEvent(e){this.events.push(e.type);return true;}
  click(){this.clicks=(this.clicks||0)+1;if(this.type==='checkbox')this.checked=!this.checked;if(this.type==='radio'){for(const e of globalThis.document.elements)if(e.type==='radio'&&e.name===this.name)e.checked=false;this.checked=true;}this.onclick?.();}
 }
 const input=new Element('INPUT','text','Name'),select=new Element('SELECT','select-one','Category'),check=new Element('INPUT','checkbox','Updates'),submit=new Element('BUTTON','submit','Submit request');
 select.options=[{label:'General',value:'general',disabled:false},{label:'Closed',value:'closed',disabled:true}];
 const doc={title:'Controlled request',body:{innerText:'Request form'},blocked:false,elements:[input,select,check,submit],querySelector(){return this.blocked?{}:null;},querySelectorAll(){return this.elements;}};
 Object.assign(globalThis,{document:doc,location:{href:'https://portal.example/request',origin:'https://portal.example'},getComputedStyle:()=>({visibility:'visible'}),HTMLInputElement:Element,HTMLTextAreaElement:Element,HTMLSelectElement:Element});
 delete globalThis.__narcisoInteractionV1;
 submit.onclick=()=>{doc.body.innerText='Request received. Reference DEMO-42.';};
 return {doc,input,select,check,submit,Element,cleanup(){for(const [k,d] of saved)d?Object.defineProperty(globalThis,k,d):delete globalThis[k];}};
}
function store(path=':memory:'){
 const db=openStore(path);acceptDelivery(db,'turn','owner','Complete the controlled request');saveMessage(db,'turn','owner','user','Complete the controlled request');db.prepare("UPDATE deliveries SET state='processing'").run();return db;
}
function enable(){const old=process.env.NARCISO_BROWSER_INTERACTIVE;process.env.NARCISO_BROWSER_INTERACTIVE='1';return ()=>old===undefined?delete process.env.NARCISO_BROWSER_INTERACTIVE:process.env.NARCISO_BROWSER_INTERACTIVE=old;}
const request=async(_conversation,op)=>({...interactPage(op),tabId:1,capturedAt:new Date().toISOString()});

test('protocol admits only typed snapshot actions, not selectors, scripts or click payloads',()=>{
 const base={op:'act',scope:'a'.repeat(64),tabId:1,snapshotId:'12345678-1234-1234-1234-123456789abc',ref:'c0',action:'fill',value:'Raul'};
 assert.equal(validateRequest(base).value,'Raul');
 for(const invalid of [{...base,selector:'#pay'},{...base,script:'x'},{...base,ref:'button'},{...base,action:'click'},{...base,action:'check',value:'true'}])assert.throws(()=>validateRequest(invalid));
});

test('actual DOM actions support controlled fields and consume snapshots once',()=>{
 const f=form();try{
  f.input.value='Owner draft';let page=interactPage({op:'inspect'});assert.ok(!JSON.stringify(page).includes('Owner draft'));
  const op={op:'act',snapshotId:page.snapshotId,ref:'c0',action:'fill',value:'Raul'};
  assert.equal(interactPage(op).applied,true);assert.equal(f.input.value,'Raul');assert.deepEqual(f.input.events,['input','change']);assert.throws(()=>interactPage(op),/Stale/);
  page=interactPage({op:'inspect'});assert.equal(interactPage({op:'act',snapshotId:page.snapshotId,ref:'c1',action:'select',value:'general'}).applied,true);
  page=interactPage({op:'inspect'});assert.equal(interactPage({op:'act',snapshotId:page.snapshotId,ref:'c2',action:'check',value:true}).applied,true);assert.equal(f.check.checked,true);
 }finally{f.cleanup();}
});

test('DOM changes, replaced controls and cross-site form overrides cannot reuse a proposal',()=>{
 const f=form();try{
  for(const change of [()=>f.input.value='owner changed it',()=>f.doc.elements[0]=new f.Element('INPUT','text','Name'),()=>f.submit.formAction='https://elsewhere.example/submit']){
   const page=interactPage({op:'inspect'});change();assert.throws(()=>interactPage({op:'act',snapshotId:page.snapshotId,ref:'c3',action:'click'}),/Page changed/);
  }
  const page=interactPage({op:'inspect'});assert.throws(()=>interactPage({op:'act',snapshotId:page.snapshotId,ref:'c3',action:'click'}),/Cross-site/);assert.equal(f.submit.clicks,undefined);
 }finally{f.cleanup();}
});

test('sensitive labels are not exposed as interactive controls and login consumes snapshots',()=>{
 const f=form();try{
  f.doc.elements.push(new f.Element('INPUT','text','Credit card number'));
  let page=interactPage({op:'inspect'});assert.equal(page.controls.length,4);
  f.doc.blocked=true;assert.equal(interactPage({op:'inspect'}).blocked,true);
  f.doc.blocked=false;assert.throws(()=>interactPage({op:'act',snapshotId:page.snapshotId,ref:'c3',action:'click'}),/Stale/);
 }finally{f.cleanup();}
});

test('persisted errand performs only claimed exact actions, verifies a portal step and survives reopening',async()=>{
 const f=form(),dir=mkdtempSync('/tmp/narciso-errand-'),path=resolve(dir,'test.sqlite');let db=store(path);const restore=enable();
 try{
  const g=await startErrand(db,'owner','turn',1,{request});
  assert.equal(g.state,'ready');assert.equal(f.input.value,'');
  const proposal=prepareErrandAction(db,'owner','turn',g.id,'fill',{ref:'c0',value:'Raul'});
  assert.match(browserApprovalText(proposal),/Escribir «Name»/);assert.doesNotMatch(browserApprovalText(proposal),/snapshotId|actionId|G-/);
  await assert.rejects(executeErrandAction(db,'owner',proposal,{request}),/authorization/);assert.equal(f.input.value,'');
  const approved=claimApproval(db,'owner',proposal.code);
  await assert.rejects(executeErrandAction(db,'owner',{...approved,parameters:{...approved.parameters,control:'different'}},{request}),/authorization/);
  await executeErrandAction(db,'owner',approved,{request});assert.equal(f.input.value,'Raul');
  assert.equal((await verifyErrand(db,'owner',g.id,{request})).state,'ready');
  const submit=prepareErrandAction(db,'owner','turn',g.id,'click',{ref:'c3',expectedText:'Request received. Reference DEMO-42.'});
  await executeErrandAction(db,'owner',claimApproval(db,'owner',submit.code),{request});
  const confirmed=await verifyErrand(db,'owner',g.id,{request});assert.equal(confirmed.stepConfirmed,true);assert.equal(confirmed.evidence.kind,'page_confirmation');assert.notEqual(confirmed.state,'completed');assert.equal(f.submit.clicks,1);
  await assert.rejects(executeErrandAction(db,'owner',{...submit,parameters:submit.parameters},{request}),/authorization/);
  db.close();db=openStore(path);assert.equal(listErrands(db,'owner')[0].id,g.id);assert.equal(listErrands(db,'other').length,0);
  await assert.rejects(inspectErrand(db,'other',g.id,{request}),/does not belong/);
 }finally{restore();db.close();f.cleanup();rmSync(dir,{recursive:true,force:true});}
});

test('inspection supersedes outstanding approvals; feature-off and cancellation prevent execution',async()=>{
 const f=form(),db=store(),restore=enable();try{
  const g=await startErrand(db,'owner','turn',1,{request});
  let proposal=prepareErrandAction(db,'owner','turn',g.id,'click',{ref:'c3'});
  await inspectErrand(db,'owner',g.id,{request});assert.equal(claimApproval(db,'owner',proposal.code),null);
  proposal=prepareErrandAction(db,'owner','turn',g.id,'click',{ref:'c3'});const approved=claimApproval(db,'owner',proposal.code);
  process.env.NARCISO_BROWSER_INTERACTIVE='0';await assert.rejects(executeErrandAction(db,'owner',approved,{request}),/disabled/);
  process.env.NARCISO_BROWSER_INTERACTIVE='1';cancelErrand(db,'owner',g.id);
  await assert.rejects(executeErrandAction(db,'owner',approved,{request}),/authorization/);assert.equal(f.submit.clicks,undefined);
 }finally{restore();db.close();f.cleanup();}
});

test('lost response is never repeated; restart and login handoff preserve uncertainty',async()=>{
 const f=form(),db=store(),restore=enable();try{
  const g=await startErrand(db,'owner','turn',1,{request});const p=prepareErrandAction(db,'owner','turn',g.id,'click',{ref:'c3',expectedText:'Request received. Reference DEMO-42.'});
  const approved=claimApproval(db,'owner',p.code);
  await assert.rejects(executeErrandAction(db,'owner',approved,{request:async(c,op)=>{await request(c,op);throw Error('Lost response');}}),/Lost/);
  assert.equal(listErrands(db,'owner')[0].state,'needs_review');assert.equal(f.submit.clicks,1);
  assert.throws(()=>prepareErrandAction(db,'owner','turn',g.id,'click',{ref:'c3'}),/unresolved/);
  f.doc.blocked=true;assert.equal((await verifyErrand(db,'owner',g.id,{request})).state,'needs_review');
  f.doc.blocked=false;assert.equal((await verifyErrand(db,'owner',g.id,{request})).stepConfirmed,true);assert.equal(f.submit.clicks,1);
  db.prepare("UPDATE errands SET state='running' WHERE id=?").run(g.id);db.prepare("UPDATE errand_actions SET state='executing'").run();recoverErrands(db);
  assert.equal(listErrands(db,'owner')[0].state,'needs_review');assert.equal(db.prepare('SELECT state FROM errand_actions').get().state,'needs_review');
 }finally{restore();db.close();f.cleanup();}
});

test('field mismatch is uncertain, original site is bound, and financial labels hand off',async()=>{
 const f=form(),db=store(),restore=enable();try{
  const g=await startErrand(db,'owner','turn',1,{request});
  f.submit.labels=[{innerText:'Pay now'}];await inspectErrand(db,'owner',g.id,{request});assert.equal(prepareErrandAction(db,'owner','turn',g.id,'click',{ref:'c3'}).state,'awaiting_owner');assert.equal(f.submit.clicks,undefined);
  f.doc.blocked=true;assert.equal((await inspectErrand(db,'owner',g.id,{request})).state,'awaiting_owner');f.doc.blocked=false;
  globalThis.location.href='https://another.example/request';assert.equal((await inspectErrand(db,'owner',g.id,{request})).state,'awaiting_owner');
  globalThis.location.href='https://portal.example/request';await inspectErrand(db,'owner',g.id,{request});
  const p=prepareErrandAction(db,'owner','turn',g.id,'fill',{ref:'c0',value:'Raul'});
  await assert.rejects(executeErrandAction(db,'owner',claimApproval(db,'owner',p.code),{request:async()=>({attempted:true,applied:false})}),/field value/);assert.equal(listErrands(db,'owner')[0].state,'needs_review');
 }finally{restore();db.close();f.cleanup();}
});

test('MCP advertises direct scoped actions only with opt-in AND active owner delivery; no raw mutation tool',async()=>{
 const dir=mkdtempSync('/tmp/narciso-errand-mcp-'),db=store(resolve(dir,'narciso.sqlite'));
 try{
  for(const [flag,turn,expected,backend] of [['0','turn',false],['1','turn',true],['1','missing',false],['1','turn',false,'cua']]){
   const client=new Client({name:'test',version:'1'});
   try{
    await client.connect(new StdioClientTransport({command:process.execPath,args:[resolve('src/mcp.mjs')],env:{HOME:process.env.HOME,PATH:process.env.PATH,NARCISO_DATA_DIR:dir,NARCISO_CONVERSATION:'owner',NARCISO_TURN_ID:turn,NARCISO_BROWSER_INTERACTIVE:flag,...(backend?{NARCISO_BROWSER_BACKEND:backend}:{})}}));
    const {tools}=await client.listTools();if(backend==='cua')assert.ok(!tools.some(t=>t.name.startsWith('browser_')));assert.equal(tools.some(t=>t.name==='errand_act'),expected);assert.ok(!tools.some(t=>t.name==='prepare_browser_action'));assert.ok(!tools.some(t=>['browser_act','browser_click','browser_fill'].includes(t.name)));
   }finally{await client.close();}
  }
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});


test('host approval routing executes browser steps once without calling the model or leaking internal payloads',async()=>{
 const f=form(),dir=mkdtempSync('/tmp/narciso-errand-route-'),db=store(resolve(dir,'narciso.sqlite'));
 let calls=0;
 const server=createServer({allowHalfOpen:true},socket=>socket.on('data',data=>{
  const op=JSON.parse(data.toString());calls++;socket.end(JSON.stringify({result:op.op==='act'?{attempted:true,applied:true}:interactPage({op:'inspect'})})+'\n');
 }));
 try{
  const g=await startErrand(db,'owner','turn',1,{request});const p=prepareErrandAction(db,'owner','turn',g.id,'fill',{ref:'c0',value:'Raul'});
  server.listen(resolve(dir,'browser.sock'));await once(server,'listening');
  const code=`import {handle} from './src/assistant.mjs';import {openStore} from './src/store.mjs';const db=openStore();console.log(await handle(db,'owner',process.argv[1],process.argv[2]));db.close();`;
  const env={...process.env,NARCISO_DATA_DIR:dir,NARCISO_BROWSER_INTERACTIVE:'1',NARCISO_CLAUDE_BIN:'/nonexistent/never-call-model'};
  const first=await promisify(execFile)(process.execPath,['--input-type=module','-e',code,'approve '+p.code,'approved'],{env});
  assert.match(first.stdout,/completé «Name»/);assert.doesNotMatch(first.stdout,/snapshotId|actionId|G-|parameters/);assert.equal(calls,2);
  assert.equal(db.prepare('SELECT state FROM approvals WHERE code=?').get(p.code).state,'completed');
  const second=await promisify(execFile)(process.execPath,['--input-type=module','-e',code,'approve '+p.code,'duplicate'],{env});
  assert.match(second.stdout,/already used/);assert.equal(calls,2);
 }finally{await new Promise(r=>server.close(r));db.close();f.cleanup();rmSync(dir,{recursive:true,force:true});}
});


test('Chrome default formAction getter does not replace the actual form destination',()=>{
 const f=form();try{
  f.input.form.action='https://portal.example/receive';
  assert.equal(f.input.formAction,'https://portal.example/request'); // native getter fallback
  assert.equal(interactPage({op:'inspect'}).controls[0].formAction,'https://portal.example/receive');
  f.input.form.action='https://another.example/receive';
  const page=interactPage({op:'inspect'});
  assert.throws(()=>interactPage({op:'act',snapshotId:page.snapshotId,ref:'c0',action:'fill',value:'Demo'}),/Cross-site/);
  assert.equal(f.input.value,'');
  f.submit.formAction='https://portal.example/explicit-submit';
  assert.equal(interactPage({op:'inspect'}).controls[3].formAction,'https://portal.example/explicit-submit');
 }finally{f.cleanup();}
});


test('post-click settling waits through navigation and delayed confirmation without replaying submit',async()=>{
 const f=form(),db=store(),restore=enable();try{
  const g=await startErrand(db,'owner','turn',1,{request});
  const p=prepareErrandAction(db,'owner','turn',g.id,'click',{ref:'c3',expectedText:'Request received. Reference DEMO-42.'});
  await executeErrandAction(db,'owner',claimApproval(db,'owner',p.code),{request});
  let reads=0;const waits=[];
  const result=await settleErrandStep(db,'owner',g.id,{wait:async ms=>waits.push(ms),request:async(c,op)=>{
   assert.equal(op.op,'inspect');reads++;
   if(reads===1)throw new Error('Page is loading');
   const page=await request(c,op);return reads===2?{...page,text:'Loading result…'}:page;
  }});
  assert.equal(result.stepConfirmed,true);assert.equal(reads,3);assert.equal(waits.length,2);assert.equal(f.submit.clicks,1);
  assert.equal(browserStepReply(result,p.parameters),'El portal confirmó: «Request received. Reference DEMO-42.».');
 }finally{restore();db.close();f.cleanup();}
});

test('post-click settling stays bounded and never turns a missing result into success',async()=>{
 const f=form(),db=store(),restore=enable();try{
  const g=await startErrand(db,'owner','turn',1,{request});
  const p=prepareErrandAction(db,'owner','turn',g.id,'click',{ref:'c3',expectedText:'Different confirmation that never arrives'});
  await executeErrandAction(db,'owner',claimApproval(db,'owner',p.code),{request});let reads=0;
  const result=await settleErrandStep(db,'owner',g.id,{wait:async()=>{},request:async(c,op)=>{reads++;assert.equal(op.op,'inspect');return request(c,op);}});
  assert.equal(reads,5);assert.equal(result.state,'awaiting_verification');assert.equal(result.stepConfirmed,undefined);assert.equal(f.submit.clicks,1);
  assert.match(browserStepReply(result,p.parameters),/pendiente de verificación/);
 }finally{restore();db.close();f.cleanup();}
});


test('direct owner actions fill and submit sequentially without approvals; retry cannot repeat a click',async()=>{
 const f=form(),db=store(),restore=enable();try{
  const g=await startErrand(db,'owner','turn',1,{request});
  const fill={snapshotId:g.page.snapshotId,ref:'c0',value:'NARCISO-PRUEBA'};
  let result=await actErrand(db,'owner','turn',g.id,'fill',fill,{request});
  assert.equal(f.input.value,'NARCISO-PRUEBA');assert.equal(result.state,'ready');assert.equal(f.submit.clicks,undefined);
  assert.equal(db.prepare('SELECT count(*) n FROM approvals').get().n,0);
  assert.equal(JSON.parse(db.prepare('SELECT payload FROM errand_actions').get().payload).ownerRequest,'Complete the controlled request');
  assert.equal((await actErrand(db,'owner','turn',g.id,'fill',fill,{request})).replayed,false);
  assert.deepEqual(f.input.events,['input','change']);
  await assert.rejects(actErrand(db,'owner','turn',g.id,'fill',{...fill,value:'Different'},{request}),/already used/);
  const click={snapshotId:result.page.snapshotId,ref:'c3',expectedText:'Request received. Reference DEMO-42.'};
  result=await actErrand(db,'owner','turn',g.id,'click',click,{request});assert.equal(result.stepConfirmed,true);assert.equal(f.submit.clicks,1);
  await actErrand(db,'owner','turn',g.id,'click',click,{request});assert.equal(f.submit.clicks,1);
  assert.equal(db.prepare('SELECT count(*) n FROM approvals').get().n,0);
 }finally{restore();db.close();f.cleanup();}
});

test('direct actions require live owner binding, correct scope, enabled feature and fresh snapshot',async()=>{
 const f=form(),db=store(),restore=enable();try{
  const g=await startErrand(db,'owner','turn',1,{request});const fill={snapshotId:g.page.snapshotId,ref:'c0',value:'DEMO'};
  await assert.rejects(actErrand(db,'owner','forged',g.id,'fill',fill,{request}),/owner request/);
  acceptDelivery(db,'other-turn','other','hello');saveMessage(db,'other-turn','other','user','hello');db.prepare("UPDATE deliveries SET state='processing'").run();
  await assert.rejects(actErrand(db,'other','other-turn',g.id,'fill',fill,{request}),/does not belong/);
  process.env.NARCISO_BROWSER_INTERACTIVE='0';await assert.rejects(actErrand(db,'owner','turn',g.id,'fill',fill,{request}),/disabled/);process.env.NARCISO_BROWSER_INTERACTIVE='1';
  await assert.rejects(actErrand(db,'owner','turn',g.id,'fill',{...fill,snapshotId:'stale'},{request}),/Stale/);
  cancelErrand(db,'owner',g.id);await assert.rejects(actErrand(db,'owner','turn',g.id,'fill',fill,{request}),/ready/);assert.equal(f.input.value,'');
 }finally{restore();db.close();f.cleanup();}
});

test('direct lost response is durable and never replayed, including after recovery',async()=>{
 const f=form(),db=store(),restore=enable();try{
  const g=await startErrand(db,'owner','turn',1,{request});const click={snapshotId:g.page.snapshotId,ref:'c3',expectedText:'Request received. Reference DEMO-42.'};
  const lose=async(c,op)=>{const result=await request(c,op);if(op.op==='act')throw Error('Lost response');return result;};
  await assert.rejects(actErrand(db,'owner','turn',g.id,'click',click,{request:lose}),/Lost response/);assert.equal(f.submit.clicks,1);
  recoverErrands(db);const retry=await actErrand(db,'owner','turn',g.id,'click',click,{request:lose});assert.equal(retry.state,'needs_review');assert.equal(f.submit.clicks,1);
  assert.equal((await verifyErrand(db,'owner',g.id,{request})).stepConfirmed,true);assert.equal(f.submit.clicks,1);
 }finally{restore();db.close();f.cleanup();}
});


test('radios select within their group, checkboxes toggle idempotently and inspection exposes checked state',()=>{
 const f=form();try{
  const small=new f.Element('INPUT','radio','Small'),large=new f.Element('INPUT','radio','Large');small.name=large.name='size';large.checked=true;f.doc.elements.push(small,large);
  let page=interactPage({op:'inspect'});assert.equal(page.controls[4].checked,false);assert.equal(page.controls[5].checked,true);
  let result=interactPage({op:'act',snapshotId:page.snapshotId,ref:'c4',action:'check',value:true});assert.equal(result.applied,true);assert.equal(small.checked,true);assert.equal(large.checked,false);
  page=interactPage({op:'inspect'});interactPage({op:'act',snapshotId:page.snapshotId,ref:'c4',action:'check',value:true});assert.equal(small.clicks,1);
  page=interactPage({op:'inspect'});result=serializedInteractPage({op:'act',snapshotId:page.snapshotId,ref:'c4',action:'check',value:false});assert.equal(result.attempted,false);assert.match(result.error,/another radio/);
  page=interactPage({op:'inspect'});interactPage({op:'act',snapshotId:page.snapshotId,ref:'c2',action:'check',value:true});page=interactPage({op:'inspect'});assert.equal(page.controls[2].checked,true);
  interactPage({op:'act',snapshotId:page.snapshotId,ref:'c2',action:'check',value:false});assert.equal(f.check.checked,false);
 }finally{f.cleanup();}
});

test('a pre-action error can be corrected in the SAME errand; a lost checked-state response verifies without repeating',async()=>{
 const f=form(),db=store(),restore=enable();try{
  const small=new f.Element('INPUT','radio','Small');f.doc.elements.push(small);
  const g=await startErrand(db,'owner','turn',1,{request});
  await assert.rejects(actErrand(db,'owner','turn',g.id,'click',{snapshotId:g.page.snapshotId,ref:'c4'},{request}),/clickable/);
  assert.equal(listErrands(db,'owner')[0].state,'ready');assert.equal(db.prepare('SELECT state FROM errand_actions').get().state,'not_attempted');
  const page=(await inspectErrand(db,'owner',g.id,{request})).page;
  await assert.rejects(actErrand(db,'owner','turn',g.id,'check',{snapshotId:page.snapshotId,ref:'c4',value:true},{request:async(c,op)=>{const r=await request(c,op);if(op.op==='act')throw Error('Connection lost');return r;}}),/lost/);
  assert.equal(listErrands(db,'owner')[0].state,'needs_review');assert.equal(small.clicks,1);
  const verified=await verifyErrand(db,'owner',g.id,{request});assert.equal(verified.state,'ready');assert.equal(verified.evidence.kind,'checked_state');assert.equal(small.clicks,1);
  const checked=await actErrand(db,'owner','turn',g.id,'check',{snapshotId:verified.page.snapshotId,ref:'c2',value:true},{request});assert.equal(checked.state,'ready');assert.equal(f.check.checked,true);
 }finally{restore();db.close();f.cleanup();}
});
