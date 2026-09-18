import {connect} from 'node:net';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {local} from './config.mjs';
import {validateRequest,MAX_FRAME} from '../browser/extension/protocol.js';

export const browserSocket = resolve(local,'browser.sock');
export class BrowserError extends Error {}
export function browserScope(conversation) {return createHash('sha256').update(conversation).digest('hex');}
export function browserRequest(conversation, operation, {socketPath=browserSocket,timeout=25000}={}) {
  let request;
  try {request=validateRequest({...operation,scope:browserScope(conversation)});}
  catch(e){throw new BrowserError(e.message);}
  return new Promise((resolveResult,reject) => {
    const socket = connect(socketPath);
    let buffer = '';let done = false;
    const finish = (error,result) => {if(done)return;done=true;clearTimeout(timer);socket.destroy();error?reject(error):resolveResult(result);};
    const timer = setTimeout(()=>finish(new BrowserError('Chrome did not respond in time. Keep the Narciso extension connected and retry.')),timeout);
    socket.on('connect',()=>socket.end(JSON.stringify(request)+'\n'));
    socket.on('error',()=>finish(new BrowserError('Local Chrome is not connected. Open Chrome with the Narciso extension enabled.')));
    socket.on('data',chunk=>{
      buffer+=chunk.toString('utf8');
      if(Buffer.byteLength(buffer)>MAX_FRAME)return finish(new BrowserError('Browser response was too large'));
      if(!buffer.includes('\n'))return;
      try {const response=JSON.parse(buffer.slice(0,buffer.indexOf('\n')));const failure=response.error||(response.result?.error);
       const error=failure?new BrowserError(failure):null;
       if(error&&response.result?.attempted===false)error.attempted=false;
       finish(error,response.result);}
      catch {finish(new BrowserError('Invalid response from local Chrome'));}
    });
    socket.on('close',()=>{if(!done)finish(new BrowserError('Chrome connection closed before replying'));});
  });
}
export async function browserStatus() {
  try {return await browserRequest('doctor',{op:'status'},{timeout:2000});}
  catch {return {connected:false,capabilities:[]};}
}
