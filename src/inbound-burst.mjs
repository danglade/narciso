// Photon can split an iMessage URL preview and its caption into separate text
// events. Pair only adjacent URL-only + plain-text fragments from the same DM.
// Receipts/persistence happen BEFORE this buffer; approvals never join a burst.
export function fragmentKind(content){
 if(content?.type!=='text'||typeof content.text!=='string')return null;
 const text=content.text.trim();
 if(!text||text.length>16000||/^approve\b/i.test(text))return null;
 return /^https?:\/\/\S+$/i.test(text)?'link':'caption';
}
export function createInboundBurst({emit,windowMs=750,now=Date.now,schedule=setTimeout,cancel=clearTimeout}){
 const pending=new Map();
 function flush(conversation){
  const item=pending.get(conversation);if(!item)return;
  pending.delete(conversation);cancel(item.timer);emit([item.value]);
 }
 return {
  push(value){
   const conversation=value.space.id,kind=fragmentKind(value.message.content),previous=pending.get(conversation);
   if(previous){
    const combinedLength=previous.value.message.content.text.length+(value.message.content?.text?.length||0)+2;
    if(kind&&kind!==previous.kind&&now()-previous.at<=windowMs&&combinedLength<=16000){
     pending.delete(conversation);cancel(previous.timer);emit([previous.value,value]);return;
    }
    flush(conversation);
   }
   if(!kind){emit([value]);return;}
   const item={value,kind,at:now()};pending.set(conversation,item);
   item.timer=schedule(()=>flush(conversation),windowMs);
  },
  discard(conversation){const item=pending.get(conversation);if(item){cancel(item.timer);pending.delete(conversation);}},
  flushAll(){for(const conversation of [...pending.keys()])flush(conversation);},
 };
}
export function combinedDelivery(items){
 // The caption owns reactions and tools. Original fragments stay in the inbox
 // audit store; their transport IDs must not create separate model turns.
 const primary=items.find(i=>fragmentKind(i.message.content)==='caption')||items[0];
 return {...primary,ids:items.map(i=>i.deliveryId),content:items.length===1?primary.message.content:{type:'group',items:items.map(i=>({content:i.message.content}))}};
}
