// Presentation only: preserve all content and URLs, never summarize facts here.
export function plainMessage(text) {
 return text.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,'$1 ($2)')
  .replace(/\*\*([^*\n]+)\*\*/g,'$1').replace(/__([^_\n]+)__/g,'$1')
  .replace(/`([^`\n]+)`/g,'$1').replace(/^#{1,6}\s+/gm,'')
  .replace(/^\s*[-*]\s+/gm,'• ').trim();
}

export function imessageBubbles(text,{maxChars=650}={}) {
 if(!Number.isInteger(maxChars)||maxChars<80)throw new Error('Invalid bubble length');
 const clean=plainMessage(text);if(!clean)return [];
 const chunks=[];
 for(const paragraph of clean.split(/\n\s*\n/)) {
  let rest=paragraph.trim();
  while(rest.length>maxChars){
   const prefix=rest.slice(0,maxChars+1);
   const sentence=[...prefix.matchAll(/[.!?](?:[”"»])?\s+/g)].at(-1);
   const cut=sentence&&sentence.index>maxChars/3?sentence.index+sentence[0].trimEnd().length:prefix.lastIndexOf(' ');
   // Never split an opaque URL/token in half merely to meet a cosmetic limit.
   if(cut<=0){const next=rest.indexOf(' ',maxChars);if(next<0)break;chunks.push(rest.slice(0,next));rest=rest.slice(next).trimStart();}
   else {chunks.push(rest.slice(0,cut).trimEnd());rest=rest.slice(cut).trimStart();}
  }
  if(rest)chunks.push(rest);
 }
 return chunks;
}
