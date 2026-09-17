import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore} from '../src/store.mjs';
import {dayBounds,startReview,listReviewPage,reviewCoverage,reviewOverviews,reviewBodies} from '../src/mail-review.mjs';
test('daily Gmail boundaries follow local daylight-saving changes',()=>{
 const spring=dayBounds('2026-03-08','America/New_York');assert.equal(spring.before-spring.after,23*3600);
 const fall=dayBounds('2026-11-01','America/New_York');assert.equal(fall.before-fall.after,25*3600);
 assert.throws(()=>dayBounds('2026-02-31'));assert.equal(new Date(dayBounds('2026-09-17','America/New_York').after*1000).toISOString(),'2026-09-17T04:00:00.000Z');
});
test('review counts actual unique IDs across pages, not the provider estimate',async()=>{
 const db=openStore(':memory:');const client={users:{messages:{list:async p=>({data:p.pageToken?{messages:[{id:'b'},{id:'c'}],resultSizeEstimate:201}:{messages:[{id:'a'},{id:'b'}],nextPageToken:'next',resultSizeEstimate:201}})}}};
 const first=await startReview(db,'owner','task','2026-09-17',client);assert.equal(first.listed,2);assert.equal(first.listingComplete,false);
 const last=await listReviewPage(db,'owner','task',first.reviewId,client);assert.equal(last.listed,3);assert.equal(last.listingComplete,true);assert.equal(last.overviewComplete,false);
 assert.equal((await startReview(db,'owner','task','2026-09-17',client)).reviewId,first.reviewId);
 await assert.rejects(listReviewPage(db,'other','task',first.reviewId,client));db.close();
});
test('overviews and bodies are tracked separately; failures and truncation remain visible',async()=>{
 const db=openStore(':memory:');let fail=true;const client={users:{messages:{list:async()=>({data:{messages:[{id:'a'},{id:'b'}]}}),get:async p=>{
  if(p.id==='b'&&fail)throw new Error('not available');return {data:{id:p.id,snippet:'preview',payload:{headers:[{name:'Subject',value:'Subject'}],mimeType:'text/plain',body:{data:Buffer.from('x'.repeat(7000)).toString('base64url')}}}};
 }}}};
 const review=await startReview(db,'owner','task','2026-09-17',client);
 await reviewOverviews(db,'owner','task',review.reviewId,0,client);assert.equal(reviewCoverage(db,review.reviewId).overviewRead,1);
 fail=false;await reviewOverviews(db,'owner','task',review.reviewId,0,client);assert.equal(reviewCoverage(db,review.reviewId).overviewComplete,true);
 const bodies=await reviewBodies(db,'owner','task',review.reviewId,['a','a'],client);assert.equal(bodies.items.length,1);assert.equal(bodies.coverage.bodiesRead,1);assert.equal(bodies.coverage.truncatedBodies,1);assert.equal(bodies.items[0].attachmentsRead,false);
 await assert.rejects(reviewBodies(db,'owner','task',review.reviewId,['outside'],client));db.close();
});
