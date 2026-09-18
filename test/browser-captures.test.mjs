import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,statSync,existsSync} from 'node:fs';
import {openStore,acceptDelivery} from '../src/store.mjs';
import {queueCapture,sendCaptures,recoverCaptures,captureContext,pruneCaptures} from '../src/browser-captures.mjs';
import {createCancellation,cancellationCommand} from '../src/cancellation.mjs';
import {attachment,resolveContents} from 'spectrum-ts';
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jx1kAAAAASUVORK5CYII=';
function fixture(){const db=openStore(':memory:'),directory=mkdtempSync('/tmp/narciso-images-');return {db,directory,queue:(turnId='t')=>queueCapture(db,{conversation:'owner',turnId,windowId:4,pid:2,title:'test',image:{mimeType:'image/png',data:png},directory}),close(){db.close();rmSync(directory,{recursive:true,force:true});}}}
test('sends actual browser bytes with installed Spectrum attachment builder only once, keeps continuation metadata',async()=>{const f=fixture();try{
 f.queue();assert.throws(()=>f.queue(),/already queued/);const row=f.db.prepare('SELECT * FROM browser_captures').get();assert.equal(statSync(row.path).mode&0o777,0o600);
 let count=0;const send=async(bytes,mimeType)=>{count++;const [part]=await resolveContents([attachment(bytes,{mimeType,name:'browser.png'})]);assert.equal(part.type,'attachment');assert.equal(part.mimeType,'image/png');assert.deepEqual(await part.read(),Buffer.from(png,'base64'));};
 await sendCaptures(f.db,'owner','t',{check:()=>{},send});await sendCaptures(f.db,'owner','t',{check:()=>{},send});assert.equal(count,1);assert.equal(JSON.parse(captureContext(f.db,'owner')).state,'sent');
 f.db.prepare('UPDATE browser_captures SET created=0').run();pruneCaptures(f.db);assert.equal(existsSync(row.path),false);
}finally{f.close()}});
test('ambiguous send is never replayed on retry or restart',async()=>{const f=fixture();try{
 f.queue();let sends=0;const options={check:()=>{},send:async()=>{sends++;throw Error('lost response');}};
 await assert.rejects(sendCaptures(f.db,'owner','t',options));recoverCaptures(f.db);await sendCaptures(f.db,'owner','t',options);assert.equal(sends,1);assert.equal(JSON.parse(captureContext(f.db,'owner')).state,'needs_review');
}finally{f.close()}});
test('cancellation suppresses a queued screenshot and its resume context',async()=>{const f=fixture();try{
 f.queue();acceptDelivery(f.db,'stop','owner','stop');createCancellation(f.db).cancel('owner','stop',cancellationCommand({type:'text',text:'stop'}));
 await sendCaptures(f.db,'owner','t',{check:()=>{},send:async()=>assert.fail('Cancelled image sent')});assert.equal(captureContext(f.db,'owner'),'none');
}finally{f.close()}});
