import { StringDecoder } from 'node:string_decoder';

export const replySchema = {
  type:'object', properties:{reply:{type:'string',minLength:1,maxLength:20000,
    description:'The finished reply for the owner. No internal reasoning, scratchpad, tool narration, or diagnostic output.'}},
  required:['reply'],additionalProperties:false,
};

export function extractReply(event) {
  const output=event?.structured_output;
  if(event?.type!=='result' || event.is_error || event.subtype!=='success' ||
      !output || typeof output!=='object' || Array.isArray(output) ||
      Object.keys(output).length!==1 || typeof output.reply!=='string' ||
      !output.reply.trim() || output.reply.length>20000 ||
      /<\/?(?:thinking|analysis|scratchpad|reasoning)(?:\s|>)/i.test(output.reply)) {
    throw new Error('Claude Code did not provide a valid final reply.');
  }
  return output.reply.trim();
}

// Stream events are diagnostics only. Never assemble user messages from text
// deltas, assistant commentary, thinking blocks, or the unstructured result.
export function replyStream(onEvent) {
  const decoder=new StringDecoder('utf8');
  let pending=''; let bytes=0; let result; let resultCount=0;
  function lines(chunk) {
    pending+=chunk;
    let boundary;
    while((boundary=pending.indexOf('\n'))!==-1) {
      const line=pending.slice(0,boundary); pending=pending.slice(boundary+1);
      if(!line.trim())continue;
      const event=JSON.parse(line);
      onEvent(event);
      if(event.type==='result'){result=event;resultCount++;}
    }
  }
  return {
    push(chunk) {
      bytes+=Buffer.byteLength(chunk);
      if(bytes>8*1024*1024)throw new Error('Claude Code exceeded the response limit.');
      lines(decoder.write(chunk));
    },
    finish() {
      lines(decoder.end());
      if(pending.trim())lines('\n');
      if(resultCount!==1)throw new Error('Claude Code returned an incomplete or ambiguous result.');
      return extractReply(result);
    },
  };
}
