import test from 'node:test';
import assert from 'node:assert/strict';
import {createInboundBurst,combinedDelivery} from '../src/inbound-burst.mjs';
import {prepareInput} from '../src/media.mjs';
import {openStore,acceptDelivery} from '../src/store.mjs';
import {typedApproval} from '../src/assistant.mjs';
function harness(){
 let time=0,n=0;const timers=new Map(),emitted=[];
 const burst=createInboundBurst({emit:items=>emitted.push(items),now:()=>time,schedule:(fn,delay)=>{timers.set(++n,{fn,at:time+delay});return n;},cancel:id=>timers.delete(id)});
 const tick=ms=>{time+=ms;for(const [id,t] of [...timers])if(t.at<=time){timers.delete(id);t.fn();}};
 return {burst,tick,emitted};
}
const item=(id,text,conversation='owner')=>({deliveryId:id,space:{id:conversation},message:{content:{type:'text',text}}});
test('reproduces Photon URL then caption seven milliseconds apart as one request',async()=>{
 const h=harness(),db=openStore(':memory:');
 const first=item('url','https://httpbin.org/forms/post'),second=item('caption','Abre y prepara el nombre NARCISO-PRUEBA en Customer name.');
 for(const value of [first,second]){acceptDelivery(db,value.deliveryId,'owner',value.message.content.text);h.burst.push(value);h.tick(7);}
 assert.equal(db.prepare('SELECT count(*) AS n FROM deliveries').get().n,2); // both durable
 assert.equal(h.emitted.length,1);assert.equal(h.emitted[0].length,2);
 const combined=combinedDelivery(h.emitted[0]);assert.equal(combined.deliveryId,'caption');
 const prepared=await prepareInput(combined.content);
 assert.equal(prepared.input,'https://httpbin.org/forms/post\nAbre y prepara el nombre NARCISO-PRUEBA en Customer name.');assert.equal(prepared.hasMedia,false);
 h.tick(2000);assert.equal(h.emitted.length,1);db.close();
});
test('caption then URL also becomes one turn, while unrelated text stays separate',()=>{
 const h=harness();h.burst.push(item('a','Revisa este enlace'));h.tick(20);h.burst.push(item('b','https://example.com'));
 assert.equal(h.emitted.length,1);assert.equal(combinedDelivery(h.emitted[0]).deliveryId,'a');
 h.burst.push(item('c','Hola'));h.burst.push(item('d','Cuánto es 17 por 4'));h.tick(750);
 assert.deepEqual(h.emitted.map(g=>g.map(v=>v.deliveryId)),[['a','b'],['c'],['d']]);
});
test('approvals, attachments, quoted replies and different conversations never merge',async()=>{
 const h=harness();h.burst.push(item('a','https://example.com'));h.burst.push(item('b','approve ABCD1234'));
 assert.deepEqual(h.emitted.map(g=>g.map(v=>v.deliveryId)),[['a'],['b']]);
 assert.equal(typedApproval((await prepareInput(combinedDelivery(h.emitted[1]).content)).input)[1],'ABCD1234');
 h.burst.push(item('c','https://example.com'));h.burst.push({...item('d',''),message:{content:{type:'voice'}}});
 h.burst.push(item('e','https://example.com'));h.burst.push({...item('f',''),message:{content:{type:'reply',content:{type:'text',text:'go'}}}});
 h.burst.push(item('g','https://example.com','one'));h.burst.push(item('h','Do something','two'));h.tick(750);
 assert.ok(h.emitted.every(g=>g.length===1));
});
test('late captions, same-kind fragments, oversized pairs and shutdown stay bounded',()=>{
 const h=harness();h.burst.push(item('a','https://example.com'));h.tick(751);h.burst.push(item('b','Too late'));h.tick(750);
 h.burst.push(item('c','https://example.com'));h.burst.push(item('d','https://another.example.com'));h.tick(750);
 h.burst.push(item('e','https://example.com'));h.burst.push(item('f','x'.repeat(16000)));
 h.burst.flushAll();h.tick(3000);
 assert.equal(h.emitted.length,6);assert.ok(h.emitted.every(g=>g.length===1));
});
