import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync, rmSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { replyStream, extractReply } from '../src/reply-stream.mjs';
import { acknowledgeRead, serialQueue } from '../src/receipts.mjs';
import { createTrace, redact, pruneTraces } from '../src/trace.mjs';
import { openStore, acceptDelivery, history } from '../src/store.mjs';

test('acceptance persists input before processing and keeps queued messages out of model history',()=>{
  const db=openStore(':memory:');
  assert.equal(acceptDelivery(db,'m1','owner','First request'),true);
  assert.equal(acceptDelivery(db,'m2','owner','Second request'),true);
  assert.equal(acceptDelivery(db,'m1','owner','Replay'),false);
  assert.equal(db.prepare('SELECT body FROM inbound_requests WHERE delivery_id=?').get('m1').body,'First request');
  assert.deepEqual(history(db,'owner'),[]);
  assert.equal(db.prepare('SELECT state FROM deliveries WHERE id=?').get('m1').state,'queued');
  db.close();
});

test('thinking, tool events, and unstructured commentary cannot become the reply',()=>{
  const events=[]; const stream=replyStream(event=>events.push(event));
  const wire=[
    {type:'assistant',message:{content:[{type:'thinking',thinking:'PRIVATE_THOUGHTS'}]}},
    {type:'assistant',message:{content:[{type:'text',text:'INTERNAL_TOOL_NARRATION'}]}},
    {type:'user',message:{content:[{type:'tool_result',content:'PRIVATE_TOOL_RESULT'}]}},
    {type:'result',subtype:'success',result:'LEAKED_NARRATION',structured_output:{reply:'Listo. 🙂'}},
  ].map(e=>JSON.stringify(e)).join('\n');
  const bytes=Buffer.from(wire);
  // Split at every byte, including in the middle of the UTF-8 emoji.
  for(const byte of bytes)stream.push(Buffer.from([byte]));
  assert.equal(stream.finish(),'Listo. 🙂');
  assert.equal(events.length,4);
  assert.equal(events[0].message.content[0].thinking,'PRIVATE_THOUGHTS');
});
test('missing, ambiguous, failed, or marked reasoning output fails closed',()=>{
  for(const event of [
    {type:'result',subtype:'success',result:'Unstructured answer'},
    {type:'result',subtype:'error',structured_output:{reply:'No'}},
    {type:'result',subtype:'success',structured_output:{reply:'Hello',reasoning:'secret'}},
    {type:'result',subtype:'success',structured_output:{reply:'<thinking>private</thinking>Hello'}},
  ])assert.throws(()=>extractReply(event));
  const stream=replyStream(()=>{});
  const result=JSON.stringify({type:'result',subtype:'success',structured_output:{reply:'Hello'}})+'\n';
  stream.push(Buffer.from(result+result));
  assert.throws(()=>stream.finish());
});
test('receipt for a queued message is sent while the previous turn is still working',async()=>{
  const order=[]; const queue=serialQueue(); let finishFirst;
  const pending=new Promise(resolve=>{finishFirst=resolve;});
  queue.add(async()=>{order.push('first_started');await pending;order.push('first_done');});
  await Promise.resolve();
  const acknowledged=acknowledgeRead({read:async()=>{order.push('second_read');}},()=>{});
  const second=queue.add(async()=>{await acknowledged;order.push('second_started');});
  await acknowledged;
  assert.deepEqual(order,['first_started','second_read']);
  finishFirst();await second;
  assert.deepEqual(order,['first_started','second_read','first_done','second_started']);
});
test('receipt failures and timeouts are observable without discarding the job',async()=>{
  const events=[];
  assert.equal(await acknowledgeRead({read:async()=>{throw new Error('transport');}},e=>events.push(e)),false);
  assert.equal(await acknowledgeRead({read:()=>new Promise(()=>{})},e=>events.push(e),5),false);
  assert.deepEqual(events,['read_receipt_failed','read_receipt_failed']);
});
test('private local traces retain diagnostic events, redact credentials, and expire old files',()=>{
  const directory=mkdtempSync(resolve(tmpdir(),'narciso-traces-'));
  try {
    const trace=createTrace({turnId:'test'},directory);
    trace.append('claude_event',{thinking:'diagnostic fixture',access_token:'secret',text:'Bearer abc123'});
    trace.close();
    const content=readFileSync(trace.path,'utf8');
    assert.match(content,/diagnostic fixture/);assert.doesNotMatch(content,/secret|abc123/);
    assert.equal(statSync(trace.path).mode&0o777,0o600);
    assert.equal(statSync(directory).mode&0o777,0o700);
    const old=resolve(directory,'2026-01-01-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jsonl');
    writeFileSync(old,'old');utimesSync(old,new Date(0),new Date(0));
    pruneTraces(directory);
    assert.throws(()=>statSync(old));
    assert.ok(statSync(trace.path));
    assert.equal(redact({nested:{client_secret:'secret'}}).nested.client_secret,'[REDACTED]');
  }finally{rmSync(directory,{recursive:true,force:true});}
});
