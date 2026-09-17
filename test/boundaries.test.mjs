import test from 'node:test';
import assert from 'node:assert/strict';
import { openStore, prepare, claimApproval } from '../src/store.mjs';
import { acceptedMessage, chunks } from '../src/photon-policy.mjs';
import { validateChange, encodeMail } from '../src/google.mjs';
import { claudeEnvironment } from '../src/claude.mjs';

test('only a new inbound owner DM can trigger work',()=>{
  const space={id:'dm1',type:'dm'};
  const message={id:'m1',direction:'inbound',timestamp:new Date(2000),sender:{id:'+12025550123'},content:{type:'text',text:'hello'}};
  assert.equal(acceptedMessage(space,message,'+12025550123',1000),true);
  for(const change of [{direction:'outbound'},{sender:{id:'+12025550124'}},{timestamp:new Date(999)},{sender:undefined},{content:{type:'reaction'}}]){
    assert.equal(acceptedMessage(space,{...message,...change},'+12025550123',1000),false);
  }
  assert.equal(acceptedMessage({...space,type:'group'},message,'+12025550123',1000),false);
});
test('approval is bound to conversation, expires, and cannot execute twice',()=>{
  const db=openStore(':memory:');
  const p=prepare(db,'owner','gmail_archive',{messageId:'1'});
  assert.equal(claimApproval(db,'intruder',p.code),null);
  assert.equal(claimApproval(db,'owner',p.code,Date.now()+31*60_000),null);
  assert.equal(claimApproval(db,'owner',p.code).action,'gmail_archive');
  assert.equal(claimApproval(db,'owner',p.code),null);
  db.close();
});
test('Google mutations reject arbitrary fields, header injection and invalid event times',()=>{
  assert.throws(()=>validateChange('arbitrary_url',{url:'https://example.com'}));
  assert.throws(()=>encodeMail({to:['owner@example.com'],subject:'Hi\r\nBcc: other@example.com',body:'Hi'}));
  assert.throws(()=>validateChange('gmail_send',{to:['owner@example.com'],subject:'Hi',body:'Hi',bcc:['other@example.com']}));
  assert.throws(()=>validateChange('calendar_create',{calendarId:'primary',summary:'test',start:'2026-09-18T11:00:00Z',end:'2026-09-18T10:00:00Z'}));
  const mail=Buffer.from(encodeMail({to:['owner@example.com'],subject:'Hola',body:'¿Cómo estás?'}),'base64url').toString();
  assert.match(mail,/Content-Transfer-Encoding: base64/);
});
test('model environment excludes credentials and alternate billing routes',()=>{
  process.env.ANTHROPIC_API_KEY='synthetic-test-key';
  process.env.PHOTON_PROJECT_SECRET='synthetic-test-secret';
  process.env.CLAUDE_CODE_USE_BEDROCK='1';
  const env=claudeEnvironment('owner');
  assert.equal(env.ANTHROPIC_API_KEY,undefined);
  assert.equal(env.PHOTON_PROJECT_SECRET,undefined);
  assert.equal(env.CLAUDE_CODE_USE_BEDROCK,undefined);
  delete process.env.ANTHROPIC_API_KEY;delete process.env.PHOTON_PROJECT_SECRET;delete process.env.CLAUDE_CODE_USE_BEDROCK;
});
test('long messages are split without losing text or breaking emoji',()=>{
  const input='A'.repeat(3499)+'😀'+'B'.repeat(4000);
  const parts=chunks(input);
  assert.equal(parts.join(''),input);
  assert.ok(parts.every(p=>p.length<=3500));
  assert.ok(!/[\uD800-\uDBFF]$/.test(parts[0]));
});
