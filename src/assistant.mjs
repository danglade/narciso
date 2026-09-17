import { requestReaction } from './reactions.mjs';
import { imageBlocks } from './media.mjs';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { history, saveMessage, claimApproval } from './store.mjs';
import { respond } from './claude.mjs';
import { executeChange } from './google.mjs';

export function typedApproval(input, hasMedia=false) {
  return hasMedia ? null : /^approve ([A-F0-9]{8})$/i.exec(input.trim());
}

export async function handle(db, conversation, input, id = randomUUID(), media = {}) {
  if (!input.trim() || input.length > 16_000) throw new Error('Send a message between 1 and 16,000 characters.');
  saveMessage(db, id, conversation, 'user', input);
  const approval = typedApproval(input,media.hasMedia);
  let answer;
  if (approval) {
    const action = claimApproval(db, conversation, approval[1].toUpperCase());
    if (!action) answer = 'That approval is missing, expired, or already used. Ask me to prepare the change again.';
    else {
      try {
        try {requestReaction(db,conversation,id,'👍');}catch{}
        const result = await executeChange(action.action, action.parameters);
        db.prepare("UPDATE approvals SET state='completed' WHERE code=?").run(action.code);
        answer = `Confirmed: ${action.action}.\n${JSON.stringify(result)}`;
      } catch {
        db.prepare("UPDATE approvals SET state='needs_review' WHERE code=?").run(action.code);
        answer = 'I couldn’t confirm that change completed. I won’t retry it automatically; we need to check the account first.';
      }
    }
  } else {
    db.exec('CREATE TABLE IF NOT EXISTS media_images (delivery TEXT, conversation TEXT, path TEXT PRIMARY KEY, created INTEGER)');
    for(const path of media.images||[])db.prepare('INSERT OR IGNORE INTO media_images VALUES (?,?,?,?)').run(id,conversation,path,Date.now());
    const recent=db.prepare('SELECT delivery,path FROM media_images WHERE conversation=? AND created>? ORDER BY created DESC, rowid DESC LIMIT 4').all(conversation,Date.now()-7*86400000).filter(row=>existsSync(row.path)).reverse();
    const messages=history(db,conversation);
    const messageIds=new Set(messages.map(message=>message.id));
    const blocks=recent.filter(row=>messageIds.has(row.delivery)).flatMap(row=>[{type:'text',text:`Image belonging to conversation message ${row.delivery}:`},...imageBlocks([row.path])]);
    answer = await respond(conversation, messages, id, blocks);
    const pending = db.prepare("SELECT a.* FROM approvals a JOIN approval_origins o ON o.code=a.code WHERE a.conversation=? AND o.turn_id=? AND a.state='pending'")
      .all(conversation, id);
    // Include the actual queued payload; a model summary cannot conceal or
    // change what an approval will execute.
    for (const p of pending) answer += `\n\nPrepared change (${p.action}):\n${p.parameters}\nReply: approve ${p.code}\nExpires in 30 minutes.`;
  }
  saveMessage(db, `${id}:reply`, conversation, 'assistant', answer);
  return answer;
}
