import test from 'node:test';
import assert from 'node:assert/strict';
import {partsOf,describeInput,readBounded,prepareInput,hasAudibleSamples} from '../src/media.mjs';
import {acceptedMessage} from '../src/photon-policy.mjs';
import {redact} from '../src/trace.mjs';
const owner='+12025550123';
function incoming(content){return {id:'image-message',sender:{address:owner},direction:'inbound',timestamp:new Date(),content};}
test('media ingress preserves caption and album, still rejects strangers, outbound and group chats',()=>{
  const content={type:'group',items:[{content:{type:'text',text:'What is this?'}},{content:{type:'attachment',mimeType:'image/heic',stream(){}}}]};
  const reply={type:'reply',content,target:{content:{type:'text',text:'approve ABCD1234'}}};
  assert.equal(partsOf(reply).length,2);
  assert.equal(describeInput(reply).includes('ABCD1234'),false);
  assert.equal(acceptedMessage({id:'chat',type:'dm'},incoming(reply),owner,0),true);
  assert.equal(partsOf(content).length,2);
  assert.equal(JSON.parse(describeInput(content))[0].text,'What is this?');
  const dm={id:'chat',type:'dm'};
  assert.equal(acceptedMessage(dm,incoming(content),owner,0),true);
  assert.equal(acceptedMessage({...dm,type:'group'},incoming(content),owner,0),false);
  assert.equal(acceptedMessage(dm,{...incoming(content),direction:'outbound'},owner,0),false);
  assert.equal(acceptedMessage(dm,{...incoming(content),sender:{address:'+15555555555'}},owner,0),false);
  assert.equal(acceptedMessage(dm,incoming({type:'read'}),owner,0),false);
});
test('binary download handles streamed chunks, enforces bytes, cancels stalls',async()=>{
  const content={size:4,stream:async()=>new ReadableStream({start(c){c.enqueue(new Uint8Array([1,2]));c.enqueue(new Uint8Array([3,4]));c.close();}})};
  assert.deepEqual(await readBounded(content),Buffer.from([1,2,3,4]));
  await assert.rejects(readBounded({...content,size:26*1024*1024}),/25 MB/);
  await assert.rejects(readBounded({stream:async()=>new ReadableStream({start(c){c.enqueue(new Uint8Array(26*1024*1024));}})}),/25 MB/);
  let cancelled=false;
  await assert.rejects(readBounded({stream:async()=>new ReadableStream({cancel(){cancelled=true;}})},5),/timed out/);
  assert.equal(cancelled,true);
});
test('unsupported attachments and oversized groups produce an explicit error before reading',async()=>{
  await assert.rejects(prepareInput({type:'attachment',mimeType:'application/pdf'}),/other file types/);
  await assert.rejects(prepareInput({type:'group',items:Array.from({length:5},()=>({content:{type:'attachment',mimeType:'image/png'}}))}),/four images/);
  const plain=await prepareInput({type:'text',text:'approve ABCD1234'});
  assert.equal(plain.hasMedia,false);
  assert.equal(plain.input,'approve ABCD1234');
});
test('media bytes never enter diagnostic traces; silence is rejected before transcription',()=>{
  const redacted=redact({content:[{type:'image',source:{type:'base64',media_type:'image/jpeg',data:'PRIVATE_IMAGE_BYTES'}}]});
  assert.equal(JSON.stringify(redacted).includes('PRIVATE_IMAGE_BYTES'),false);
  const wav=Buffer.alloc(44+16000*2);wav.write('RIFF');wav.write('WAVE',8);wav.write('fmt ',12);wav.writeUInt32LE(16,16);wav.write('data',36);wav.writeUInt32LE(32000,40);
  assert.equal(hasAudibleSamples(wav),false);
  for(let i=44;i<10044;i+=2)wav.writeInt16LE(1000,i);
  assert.equal(hasAudibleSamples(wav),true);
});

test('spoken or image-derived approval codes cannot claim an action',async()=>{
  const {typedApproval}=await import('../src/assistant.mjs');
  assert.equal(typedApproval('approve ABCD1234',true),null);
  assert.equal(typedApproval('[Voice note]\napprove ABCD1234\n[End voice note]'),null);
  assert.equal(typedApproval('approve ABCD1234',false)[1],'ABCD1234');
});
