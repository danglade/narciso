import {randomUUID} from 'node:crypto';
import {google} from 'googleapis';
import {authorizedClient} from './google.mjs';
import {timezone} from './config.mjs';
export function initReviews(db){db.exec(`
 CREATE TABLE IF NOT EXISTS mail_reviews(id TEXT PRIMARY KEY,conversation TEXT NOT NULL,task_id TEXT NOT NULL,query TEXT NOT NULL,next_token TEXT,state TEXT NOT NULL,created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS mail_review_items(review_id TEXT NOT NULL,message_id TEXT NOT NULL,overview INTEGER NOT NULL DEFAULT 0,body_read INTEGER NOT NULL DEFAULT 0,body_truncated INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(review_id,message_id));
`);}
export function dayBounds(date,zone=timezone){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw new Error('Unsupported date');
 const format=new Intl.DateTimeFormat('en-US',{timeZone:zone,timeZoneName:'longOffset'});
 function midnight(d){const base=Date.parse(d+'T00:00:00Z');let candidate=base;
  for(let i=0;i<4;i++){const offset=format.formatToParts(new Date(candidate)).find(p=>p.type==='timeZoneName').value;const m=/GMT([+-])(\d{2}):(\d{2})/.exec(offset);const delta=m?(m[1]==='-'?-1:1)*(Number(m[2])*60+Number(m[3]))*60000:0;const next=base-delta;if(next===candidate)return candidate/1000;candidate=next;}throw new Error('Unsupported timezone boundary');}
 const next=new Date(Date.parse(date+'T00:00:00Z')+86400000).toISOString().slice(0,10);
 return {after:midnight(date),before:midnight(next),timezone:zone};
}
export function reviewCoverage(db,id){const review=db.prepare('SELECT * FROM mail_reviews WHERE id=?').get(id);if(!review)throw new Error('Unsupported review');
 const counts=db.prepare('SELECT count(*) AS listed,coalesce(sum(overview),0) AS overviewRead,coalesce(sum(body_read),0) AS bodiesRead,coalesce(sum(body_truncated),0) AS truncatedBodies FROM mail_review_items WHERE review_id=?').get(id);
 return {reviewId:id,query:review.query,listingComplete:review.state==='listed',...counts,overviewComplete:review.state==='listed'&&counts.overviewRead===counts.listed,scope:'Matching Gmail messages; includes archived/custom-label mail, excludes Spam and Trash. A digest is one message, not all items it mentions.',note:'Listed, overview inspected, and body fetched are different coverage levels. Never call an estimate or overview a full-content review.'};
}
export function allCoverage(db,taskId){initReviews(db);return db.prepare('SELECT id FROM mail_reviews WHERE task_id=?').all(taskId).map(r=>reviewCoverage(db,r.id));}
function ownReview(db,conversation,taskId,id){const r=db.prepare('SELECT * FROM mail_reviews WHERE id=? AND conversation=? AND task_id=?').get(id,conversation,taskId);if(!r)throw new Error('Unsupported review: wrong task');return r;}
async function api(){return google.gmail({version:'v1',auth:await authorizedClient()});}
export async function startReview(db,conversation,taskId,date,client){
 const bounds=dayBounds(date);return startQueryReview(db,conversation,taskId,`after:${bounds.after} before:${bounds.before}`,client);
}
export async function startQueryReview(db,conversation,taskId,query,client){
 initReviews(db);
 const old=db.prepare('SELECT id FROM mail_reviews WHERE task_id=? AND query=?').get(taskId,query);if(old)return reviewCoverage(db,old.id);
 const id=randomUUID();db.prepare("INSERT INTO mail_reviews VALUES (?,?,?,?,NULL,'listing',?)").run(id,conversation,taskId,query,Date.now());
 return listReviewPage(db,conversation,taskId,id,client);
}
export async function listReviewPage(db,conversation,taskId,id,client){
 const r=ownReview(db,conversation,taskId,id);if(r.state==='listed')return reviewCoverage(db,id);
 const gmail=client||await api();const {data}=await gmail.users.messages.list({userId:'me',q:r.query,maxResults:500,pageToken:r.next_token||undefined,includeSpamTrash:false},{timeout:30000});
 const ids=[...new Set((data.messages||[]).map(m=>m.id))];
 db.exec('BEGIN IMMEDIATE');try{
  for(const messageId of ids)db.prepare('INSERT OR IGNORE INTO mail_review_items(review_id,message_id) VALUES (?,?)').run(id,messageId);
  if(data.nextPageToken&&data.nextPageToken===r.next_token)throw new Error('Gmail pagination did not advance');
  db.prepare('UPDATE mail_reviews SET next_token=?,state=? WHERE id=?').run(data.nextPageToken||null,data.nextPageToken?'listing':'listed',id);db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e;}
 const coverage=reviewCoverage(db,id);return {...coverage,nextStep:coverage.listingComplete?'Inspect overviews, then read relevant message bodies.':'Call gmail_review_list_next to finish listing. The total is not final.'};
}
function headers(data){const h=data.payload?.headers||[];return Object.fromEntries(['From','Subject','Date'].map(name=>[name,h.find(x=>x.name.toLowerCase()===name.toLowerCase())?.value?.slice(0,400)||'']));}
export async function reviewOverviews(db,conversation,taskId,id,offset=0,client){
 ownReview(db,conversation,taskId,id);const gmail=client||await api();
 const rows=db.prepare('SELECT message_id FROM mail_review_items WHERE review_id=? ORDER BY rowid LIMIT 25 OFFSET ?').all(id,offset);
 const items=[];
 // Small batches keep responses valid and bounded; failed reads remain pending.
 for(let i=0;i<rows.length;i+=5){const group=await Promise.all(rows.slice(i,i+5).map(async row=>{
  try{const {data}=await gmail.users.messages.get({userId:'me',id:row.message_id,format:'metadata',metadataHeaders:['From','Subject','Date']},{timeout:30000});db.prepare('UPDATE mail_review_items SET overview=1 WHERE review_id=? AND message_id=?').run(id,row.message_id);return {id:row.message_id,...headers(data),snippet:(data.snippet||'').slice(0,600),labels:data.labelIds||[]};}
  catch{return {id:row.message_id,error:'Message overview unavailable; not counted as inspected.'};}
 }));items.push(...group);}
 const coverage=reviewCoverage(db,id);return {items,nextOffset:offset+rows.length,hasMore:offset+rows.length<coverage.listed,coverage};
}
export async function reviewBodies(db,conversation,taskId,id,messageIds,client){
 ownReview(db,conversation,taskId,id);const gmail=client||await api();const items=[];
 for(const messageId of [...new Set(messageIds)]){
  if(!db.prepare('SELECT message_id FROM mail_review_items WHERE review_id=? AND message_id=?').get(id,messageId))throw new Error('Unsupported message: outside review snapshot');
  try{const {data}=await gmail.users.messages.get({userId:'me',id:messageId,format:'full'},{timeout:30000});
   const texts=[];function walk(p){if(p?.body?.data&&['text/plain','text/html'].includes(p.mimeType))texts.push({mimeType:p.mimeType,text:Buffer.from(p.body.data,'base64url').toString('utf8')});for(const child of p?.parts||[])walk(child);}walk(data.payload);
   const plain=texts.filter(t=>t.mimeType==='text/plain');const body=(plain.length?plain:texts).map(t=>t.text).join('\n');const truncated=body.length>6000;
   db.prepare('UPDATE mail_review_items SET body_read=1,body_truncated=? WHERE review_id=? AND message_id=?').run(truncated?1:0,id,messageId);
   items.push({id:messageId,...headers(data),body:body.slice(0,6000),bodyTruncated:truncated,attachmentsRead:false,link:`https://mail.google.com/mail/u/0/#all/${messageId}`});
  }catch(error){if(error.message.startsWith('Unsupported'))throw error;items.push({id:messageId,error:'Body unavailable; not counted as read.'});}
 }
 return {items,coverage:reviewCoverage(db,id)};
}

export function pendingReviewActions(db,taskId){
 initReviews(db);
 return db.prepare('SELECT id,state FROM mail_reviews WHERE task_id=?').all(taskId).flatMap(review=>{
  if(review.state!=='listed')return [{tool:'gmail_review_list_next',arguments:{reviewId:review.id}}];
  const first=db.prepare('SELECT rowid FROM mail_review_items WHERE review_id=? AND overview=0 ORDER BY rowid LIMIT 1').get(review.id);
  if(!first)return [];
  const offset=db.prepare('SELECT count(*) AS n FROM mail_review_items WHERE review_id=? AND rowid<?').get(review.id,first.rowid).n;
  return [{tool:'gmail_review_overviews',arguments:{reviewId:review.id,offset}}];
 });
}
