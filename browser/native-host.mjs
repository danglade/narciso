import {createServer,connect} from 'node:net';
import {chmodSync,unlinkSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {local} from '../src/config.mjs';
import {MAX_FRAME,validateRequest} from './extension/protocol.js';

const path=resolve(local,'browser.sock');
process.umask(0o077);
let ready=false;let incoming=Buffer.alloc(0);const pending=new Map();
function send(value) {
  const body=Buffer.from(JSON.stringify(value));
  if(body.length>MAX_FRAME)throw new Error('Frame too large');
  const prefix=Buffer.alloc(4);prefix.writeUInt32LE(body.length);
  process.stdout.write(Buffer.concat([prefix,body]));
}
process.stdin.on('data',chunk=>{
  incoming=Buffer.concat([incoming,chunk]);
  while(incoming.length>=4){
    const length=incoming.readUInt32LE();
    if(length>MAX_FRAME)process.exit(1);
    if(incoming.length<length+4)break;
    let response;try{response=JSON.parse(incoming.subarray(4,length+4));}catch{process.exit(1);}
    incoming=incoming.subarray(length+4);
    if(response.ready===true){ready=true;continue;}
    const client=pending.get(response.id);if(!client)continue;
    pending.delete(response.id);client.end(JSON.stringify(response)+'\n');
  }
});
const server=createServer({allowHalfOpen:true},socket=>{
  let text='';let handled=false;let id;
  const timer=setTimeout(()=>socket.destroy(),24000);
  socket.on('close',()=>{clearTimeout(timer);if(id)pending.delete(id);});
  socket.on('error',()=>{});
  socket.on('data',chunk=>{
    if(handled)return;
    text+=chunk.toString('utf8');
    if(Buffer.byteLength(text)>8192){handled=true;socket.end(JSON.stringify({error:'Request too large'})+'\n');return;}
    if(!text.includes('\n'))return;
    handled=true;
    try{
      const request=validateRequest(JSON.parse(text.slice(0,text.indexOf('\n'))));
      if(!ready)throw new Error('Chrome extension is connecting; retry');
      // Fail busy rather than queue unbounded work whose caller has timed out.
      if(pending.size)throw new Error('Chrome is busy with another read; retry shortly');
      id=randomUUID();pending.set(id,socket);send({id,request});
    }catch(e){socket.end(JSON.stringify({error:e.message})+'\n');}
  });
});
// A second Chrome profile must not steal the first profile's connection.
const probe=connect(path);
probe.on('connect',()=>{probe.destroy();process.exit(1);});
probe.on('error',error=>{
  if(!['ENOENT','ECONNREFUSED'].includes(error.code))process.exit(1);
  try{unlinkSync(path);}catch{}
  server.listen(path,()=>chmodSync(path,0o600));
});
server.on('error',()=>process.exit(1));
function stop(){for(const s of pending.values())s.destroy();server.close();process.exit(0);}
process.stdin.on('end',stop);
process.on('SIGTERM',stop);
