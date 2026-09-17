import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore,acceptDelivery} from '../src/store.mjs';
import {requestReaction,reactionPump} from '../src/reactions.mjs';
function setup(){const db=openStore(':memory:');acceptDelivery(db,'turn','owner','Revisa mi calendario');db.prepare("UPDATE deliveries SET state='processing' WHERE id='turn'").run();return db;}

test('reaction permission binds to active owner turn with one allowed emoji',()=>{
  const db=setup();
  assert.throws(()=>requestReaction(db,'stranger','turn','👍'));
  assert.throws(()=>requestReaction(db,'owner','other-turn','👍'));
  assert.throws(()=>requestReaction(db,'owner','turn','untrusted text'));
  assert.equal(requestReaction(db,'owner','turn','👍').requested,true);
  assert.equal(requestReaction(db,'owner','turn','🎉').requested,false);
  assert.equal(db.prepare('SELECT emoji FROM message_reactions').get().emoji,'👍');
  db.prepare("UPDATE deliveries SET state='sent' WHERE id='turn'").run();
  assert.throws(()=>requestReaction(db,'owner','turn','👍'));db.close();
});

test('reaction is native, sent during work and not duplicated when worker stops',async()=>{
  const db=setup();const sent=[];const events=[];
  requestReaction(db,'owner','turn','👀');
  const pump=reactionPump(db,'turn',{react:async emoji=>{sent.push(emoji);return {id:'tapback'};}},event=>events.push(event));
  await pump.stop();await pump.stop();
  assert.deepEqual(sent,['👀']);assert.deepEqual(events,['reaction_sent']);
  assert.equal(db.prepare("SELECT state FROM deliveries WHERE id='turn'").get().state,'processing');
  assert.equal(db.prepare('SELECT state FROM message_reactions').get().state,'sent');db.close();
});

test('late reaction request is drained; unsupported or timed-out reactions never retry or throw',async()=>{
  for(const react of [async()=>undefined,()=>new Promise(()=>{}),async()=>{throw new Error('transport');}]){
    const db=setup();const events=[];let calls=0;
    const pump=reactionPump(db,'turn',{react:()=>{calls++;return react();}},event=>events.push(event),{timeoutMs:5});
    requestReaction(db,'owner','turn','👍');
    await pump.stop();await pump.stop();
    assert.equal(calls,1);assert.deepEqual(events,['reaction_failed']);
    assert.equal(db.prepare('SELECT state FROM message_reactions').get().state,'needs_review');db.close();
  }
});
