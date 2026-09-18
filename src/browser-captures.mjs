import {mkdirSync,writeFileSync,readFileSync,unlinkSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {local} from './config.mjs';
export function initCaptures(db){db.exec(`CREATE TABLE IF NOT EXISTS browser_captures(id TEXT PRIMARY KEY,conversation TEXT NOT NULL,turn_id TEXT NOT NULL,window_id INTEGER NOT NULL,pid INTEGER NOT NULL,title TEXT NOT NULL,path TEXT NOT NULL,mime TEXT NOT NULL,pause INTEGER NOT NULL,state TEXT NOT NULL,created INTEGER NOT NULL)`);}
export function queueCapture(db,{conversation,turnId,windowId,pid,title,image,pause=true,directory=resolve(local,'browser-captures')}){
 initCaptures(db);
 const existing=db.prepare('SELECT id FROM browser_captures WHERE turn_id=? AND conversation=?').get(turnId,conversation);if(existing)throw Error('A browser screenshot is already queued for this reply');
 const data=Buffer.from(image.data||'','base64'),mime=image.mimeType;
 if(!['image/png','image/jpeg'].includes(mime)||!data.length||data.length>8*1024*1024)throw Error('Unsupported browser screenshot');
 if(mime==='image/png'&&!data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||mime==='image/jpeg'&&(data[0]!==255||data[1]!==216))throw Error('Invalid browser image bytes');
 const id=randomUUID();mkdirSync(directory,{recursive:true,mode:0o700});const path=resolve(directory,id+(mime==='image/png'?'.png':'.jpg'));
 writeFileSync(path,data,{mode:0o600,flag:'wx'});
 try{db.prepare('INSERT INTO browser_captures VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id,conversation,turnId,windowId,pid,title,path,mime,Number(pause),'pending',Date.now());}catch(e){unlinkSync(path);throw e;}
 return id;
}
export function recoverCaptures(db){initCaptures(db);db.prepare("UPDATE browser_captures SET state='needs_review' WHERE state IN ('pending','sending')").run();pruneCaptures(db);}
export function pruneCaptures(db){for(const row of db.prepare('SELECT id,path FROM browser_captures WHERE created<?').all(Date.now()-7*86400000)){try{unlinkSync(row.path);}catch(e){if(e.code!=='ENOENT')continue;}db.prepare('DELETE FROM browser_captures WHERE id=?').run(row.id);}}
export async function sendCaptures(db,conversation,turnId,{send,check}){
 initCaptures(db);
 for(const row of db.prepare("SELECT * FROM browser_captures WHERE conversation=? AND turn_id=? AND state='pending'").all(conversation,turnId)){
  check();if(!db.prepare("UPDATE browser_captures SET state='sending' WHERE id=? AND state='pending'").run(row.id).changes)continue;
  try{const bytes=readFileSync(row.path);check();await send(bytes,row.mime);check();db.prepare("UPDATE browser_captures SET state='sent' WHERE id=? AND state='sending'").run(row.id);}
  catch(e){db.prepare("UPDATE browser_captures SET state='needs_review' WHERE id=? AND state='sending'").run(row.id);throw e;}
 }
 pruneCaptures(db);
}
export function captureContext(db,conversation){initCaptures(db);const row=db.prepare("SELECT window_id,pid,title,pause,state FROM browser_captures WHERE conversation=? AND state!='cancelled' ORDER BY created DESC,rowid DESC LIMIT 1").get(conversation);return row?JSON.stringify(row):'none';}
