import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { chmodSync } from 'node:fs';
import { resolve } from 'node:path';
import { local } from './config.mjs';
import { initJobs } from './jobs.mjs';
import { initEvidence } from './evidence.mjs';

export function openStore(path = resolve(local, 'narciso.sqlite')) {
  const db = new DatabaseSync(path);
  if (path !== ':memory:') chmodSync(path, 0o600);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY, conversation TEXT NOT NULL, role TEXT NOT NULL,
      body TEXT NOT NULL, created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS deliveries (
      id TEXT PRIMARY KEY, conversation TEXT NOT NULL, state TEXT NOT NULL,
      response TEXT, created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS approvals (
      code TEXT PRIMARY KEY, conversation TEXT NOT NULL, action TEXT NOT NULL,
      parameters TEXT NOT NULL, state TEXT NOT NULL, created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY, fact TEXT NOT NULL, source TEXT NOT NULL,
      created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS message_reactions (
      delivery_id TEXT PRIMARY KEY, emoji TEXT NOT NULL, state TEXT NOT NULL,
      created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS inbound_requests (
      delivery_id TEXT PRIMARY KEY, body TEXT NOT NULL);
  `);
  // Preserve accepted input before issuing a read receipt, without placing a
  // queued future message into the current model turn's conversation history.
  // Keep the original deliveries shape compatible with the previous release.
  if(db.prepare('PRAGMA table_info(deliveries)').all().some(column=>column.name==='request')) {
    db.exec(`INSERT OR IGNORE INTO inbound_requests SELECT id, request FROM deliveries WHERE request IS NOT NULL;
      ALTER TABLE deliveries DROP COLUMN request;`);
  }
  initJobs(db);
  initEvidence(db);
  return db;
}
export function acceptDelivery(db, id, conversation, body) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const inserted=db.prepare('INSERT OR IGNORE INTO deliveries(id,conversation,state,response,created) VALUES (?,?,?,?,?)')
      .run(id,conversation,'queued',null,Date.now());
    if(inserted.changes)db.prepare('INSERT INTO inbound_requests VALUES (?,?)').run(id,body);
    db.exec('COMMIT');return Boolean(inserted.changes);
  }catch(error){db.exec('ROLLBACK');throw error;}
}
export function history(db, conversation) {
  const messages = db.prepare(`SELECT id, role, body FROM
    (SELECT rowid, id, role, body FROM messages WHERE conversation=? ORDER BY rowid DESC LIMIT 24)
    ORDER BY rowid`).all(conversation);
  let length=0;
  return messages.reverse().filter(message=>{
    length+=message.body.length;
    return length<=60000;
  }).reverse();
}
export function saveMessage(db, id, conversation, role, body) {
  db.prepare('INSERT OR IGNORE INTO messages VALUES (?, ?, ?, ?, ?)')
    .run(id, conversation, role, body, Date.now());
}
export function prepare(db, conversation, action, parameters, turnId) {
  const code = randomBytes(4).toString('hex').toUpperCase();
  db.prepare('INSERT INTO approvals VALUES (?, ?, ?, ?, ?, ?)')
    .run(code, conversation, action, JSON.stringify(parameters), 'pending', Date.now());
  if(turnId)db.prepare('INSERT INTO approval_origins VALUES (?,?)').run(code,turnId);
  return { code, action, parameters, instruction: `approve ${code}`, expiresIn: '30 minutes' };
}
export function claimApproval(db, conversation, code, now = Date.now()) {
  const row = db.prepare('SELECT * FROM approvals WHERE code=? AND conversation=?')
    .get(code, conversation);
  if (!row || row.state !== 'pending' || now - row.created > 30 * 60_000) return null;
  const claimed = db.prepare("UPDATE approvals SET state='executing' WHERE code=? AND state='pending'")
    .run(code);
  return claimed.changes ? { ...row, parameters: JSON.parse(row.parameters) } : null;
}
