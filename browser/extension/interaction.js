// Serialized into Chrome's ISOLATED world; no page JS, selectors or scripts from
// model input. Node references remain private to the extension, not DOM attrs.
export function interactPage(request) {
 let attempted=false;
 try {
 const key='__narcisoInteractionV1';
 const visible=e=>e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden';
 const text=()=>document.body?.innerText||'';
 const blocked=()=>!!document.querySelector('input[type="password"],iframe[src*="recaptcha"],iframe[src*="hcaptcha"],#challenge-running')||/verify you are human|unusual traffic|verifica que eres humano|checking your browser/i.test(text().slice(0,5000));
 const sensitive=e=>/password|file|hidden/i.test(e.type||'')||/password|one-time-code|cc-|credit.?card|card.?number|cvv|cvc|security.?code|ssn|social.?security|otp|2fa|contrase[ñn]a/i.test([e.name,e.id,e.autocomplete,e.getAttribute('aria-label'),e.labels?.[0]?.innerText,e.placeholder].join(' '));
 const label=e=>(e.labels?.[0]?.innerText||e.getAttribute('aria-label')||e.innerText||e.placeholder||e.name||e.id||'Unnamed control').trim().slice(0,160);
 const nodes=()=>[...document.querySelectorAll('input,textarea,select,button,a[href],[role="button"]')].filter(e=>visible(e)&&!sensitive(e));
 // Chrome's formAction getter can resolve to the document URL even without
 // a formaction attribute. Only explicit submitter overrides take precedence.
 const formAction=e=>e.hasAttribute('formaction')?e.formAction:e.form?.action;
 const formMethod=e=>e.hasAttribute('formmethod')?e.formMethod:e.form?.method;
 const describe=e=>({tag:e.tagName.toLowerCase(),type:e.type||'',label:label(e),disabled:!!e.disabled,readOnly:!!e.readOnly,...(['checkbox','radio'].includes(e.type)?{checked:!!e.checked,actions:['check'],...(e.type==='radio'?{group:e.name||'',canUncheck:false}:{})}:{}),...(e.form?{formAction:formAction(e),formMethod:formMethod(e)}:{}),...(e.tagName==='A'?{href:e.href,download:e.hasAttribute('download')}:{ }),...(e.tagName==='SELECT'?{options:[...e.options].slice(0,100).map(o=>({label:o.label.slice(0,160),value:o.value.slice(0,2000),disabled:o.disabled}))}:{})});
 // Values are compared for freshness but never returned to the model.
 const signature=els=>JSON.stringify({url:location.href,text:text().slice(0,500000),controls:els.map(e=>[describe(e),e.value,e.checked,e.form?.action,e.form?.method])});
 if(blocked()){delete globalThis[key];return {url:location.href,blocked:true,reason:'Complete login or human verification in this Chrome tab, then inspect again',controls:[]};}
 if(request.op==='inspect'){
  const elements=nodes(),snapshotId=crypto.randomUUID();
  const controls=elements.slice(0,100).map((e,i)=>({ref:'c'+i,...describe(e)}));
  globalThis[key]={snapshotId,elements,signature:signature(elements)};
  return {snapshotId,url:location.href,title:document.title.slice(0,500),text:text().slice(0,22000),truncated:text().length>22000,controls,controlsTruncated:elements.length>100,blocked:false};
 }
 const saved=globalThis[key];
 if(!saved||saved.snapshotId!==request.snapshotId)throw new Error('Stale page snapshot; inspect and prepare again');
 const current=nodes();
 if(current.length!==saved.elements.length||current.some((e,i)=>e!==saved.elements[i])||signature(current)!==saved.signature){delete globalThis[key];throw new Error('Page changed; inspect and prepare again');}
 const index=Number(request.ref.slice(1)),element=saved.elements[index];
 if(index>=100||!element||!element.isConnected||!visible(element)||element.disabled||sensitive(element))throw new Error('Control unavailable');
 if(request.action==='fill'&&(!['INPUT','TEXTAREA'].includes(element.tagName)||element.readOnly||!['','text','email','tel','url','search','number','date','time','datetime-local','month','week','textarea'].includes(element.type)))throw new Error('This field cannot be filled');
 if(request.action==='select'&&(element.tagName!=='SELECT'||![...element.options].some(o=>o.value===request.value&&!o.disabled)))throw new Error('Unavailable selection');
 if(request.action==='check'&&(element.tagName!=='INPUT'||!['checkbox','radio'].includes(element.type)))throw new Error('Not a checkbox or radio');
 if(request.action==='check'&&element.type==='radio'&&request.value!==true)throw new Error('Select another radio in the group instead of unchecking it');
 if(element.form&&new URL(formAction(element),location.href).origin!==location.origin)throw new Error('Cross-site forms require owner handoff');
 if(request.action==='click'){
  if(!['BUTTON','A'].includes(element.tagName)&&!(element.tagName==='INPUT'&&['button','submit'].includes(element.type))&&element.getAttribute('role')!=='button')throw new Error('Not a clickable control');
  if(element.tagName==='A'){
   const u=new URL(element.href);if(u.origin!==location.origin||!['http:','https:'].includes(u.protocol)||element.hasAttribute('download'))throw new Error('Unsupported link');
  }
 }
 // Consume before mutation: an exception or lost response must not repeat it.
 delete globalThis[key];
 attempted=true;
 if(request.action==='click')element.click();
 else if(request.action==='check'){if(element.checked!==request.value)element.click();}
 else {
  const proto=element.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:element.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto,'value').set.call(element,request.value);
  element.dispatchEvent(new Event('input',{bubbles:true}));element.dispatchEvent(new Event('change',{bubbles:true}));
 }
 const applied=request.action==='click'?null:element.isConnected&&(request.action==='check'?element.checked===request.value:element.value===request.value);
 return {attempted:true,applied,action:request.action,label:label(element),url:location.href,requiresVerification:true,...(['checkbox','radio'].includes(element.type)?{checked:!!element.checked}:{})};
 }catch(error){return {error:String(error.message).slice(0,500),attempted};}
}
