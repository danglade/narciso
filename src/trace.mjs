import { mkdirSync, chmodSync, openSync, writeSync, closeSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { local } from './config.mjs';

const MAX_TRACE_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_BYTES = 100 * 1024 * 1024;
const RETENTION_MS = 7 * 24 * 60 * 60_000;
const TRACE_NAME = /^\d{4}-\d{2}-\d{2}-[a-f0-9-]{36}\.jsonl$/;

export function redact(value, key = '') {
  if (value && typeof value==='object' && value.type==='base64') return {type:'base64',media_type:value.media_type,data:'[MEDIA OMITTED]'};
  if (/^(authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|password|cookie|project[_-]?secret|signature)$/i.test(key)) return '[REDACTED]';
  if (typeof value === 'string') return value
    .replace(/\bBearer\s+[^\s"<>]+/gi, 'Bearer [REDACTED]')
    .replace(/\bsk-(?:ant-)?[A-Za-z0-9_-]{12,}/g, '[REDACTED]')
    .replace(/\bya29\.[A-Za-z0-9_-]+/g, '[REDACTED]');
  if (Array.isArray(value)) return value.map(item => redact(item));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,redact(v,k)]));
  return value;
}

export function pruneTraces(directory, now = Date.now()) {
  const files = readdirSync(directory).filter(name => TRACE_NAME.test(name)).map(name => {
    const path = resolve(directory,name); const info = statSync(path);
    return {path,modified:info.mtimeMs,size:info.size};
  }).sort((a,b)=>b.modified-a.modified);
  let total=0;
  for (const file of files) {
    total+=file.size;
    // Don't remove traces belonging to active turns (bounded to 190 seconds).
    if (now-file.modified > 5*60_000 && (now-file.modified > RETENTION_MS || total > MAX_TOTAL_BYTES)) unlinkSync(file.path);
  }
}

export function createTrace(metadata, directory = resolve(local,'traces')) {
  mkdirSync(directory,{recursive:true,mode:0o700}); chmodSync(directory,0o700);
  pruneTraces(directory);
  const id=randomUUID();
  const path=resolve(directory,`${new Date().toISOString().slice(0,10)}-${id}.jsonl`);
  const fd=openSync(path,'wx',0o600);
  let size=0; let closed=false; let truncated=false;
  function append(kind,data) {
    if(closed || truncated)return;
    let line=JSON.stringify({time:new Date().toISOString(),kind,data:redact(data)})+'\n';
    if(size+Buffer.byteLength(line)>MAX_TRACE_BYTES) {
      line=JSON.stringify({time:new Date().toISOString(),kind:'trace_truncated'})+'\n';
      truncated=true;
    }
    writeSync(fd,line); size+=Buffer.byteLength(line);
  }
  append('turn_start',{traceId:id,...metadata});
  return { id,path,append,close(){if(!closed){closed=true;closeSync(fd);}} };
}
