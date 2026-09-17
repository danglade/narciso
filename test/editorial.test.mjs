import test from 'node:test';
import assert from 'node:assert/strict';
import {sumAmounts} from '../src/amounts.mjs';
import {summaryChunks} from '../src/photon-policy.mjs';
import {reviewScopeNote} from '../src/job-runner.mjs';

test('money totals use exact decimals and refuse repeated sources or ambiguous amounts',()=>{
  const items=[{source:'receipt-a',amount:'0.10'},{source:'receipt-b',amount:'0.20'},{source:'refund',amount:'-0.05'}];
  assert.equal(sumAmounts(items,'USD').total,'0.25');
  assert.equal(sumAmounts([{source:'large',amount:'999999999999.99'},{source:'cent',amount:'0.01'}],'USD').total,'1000000000000.00');
  assert.equal(sumAmounts([{source:'refund',amount:'-0.01'}],'USD').total,'-0.01');
  assert.throws(()=>sumAmounts([...items,items[0]],'USD'),/duplicate/);
  for(const amount of ['1,000','1e3','1.005','$3','NaN'])assert.throws(()=>sumAmounts([{source:'a',amount}],'USD'));
});

test('topic bubbles preserve all paragraphs, cap deliberate splits and keep emoji intact',()=>{
  const paragraphs=Array.from({length:8},(_,i)=>`Topic ${i} 👀`);
  const bubbles=summaryChunks(paragraphs.join('\n\n'));
  assert.equal(bubbles.length,6);assert.equal(bubbles.join('\n\n'),paragraphs.join('\n\n'));
  const long='👀'.repeat(4000);assert.equal(summaryChunks(long).join(''),long);
  assert.deepEqual(summaryChunks('68.'),['68.']);
});

test('plain-language review limits retain partial reads and truncation without diagnostic counters',()=>{
  const coverage={listed:9,overviewRead:9,bodiesRead:2,truncatedBodies:1,listingComplete:true,overviewComplete:true};
  const note=reviewScopeNote([coverage]);
  assert.match(note,/selección/);assert.match(note,/recortado/);assert.match(note,/Spam, Papelera ni adjuntos/);assert.doesNotMatch(note,/\d|Cobertura|completa/);
  assert.match(reviewScopeNote([{...coverage,overviewComplete:false}]),/incompleta/);
  assert.match(reviewScopeNote([{...coverage,bodiesRead:0,truncatedBodies:0}]),/solo en asuntos y resúmenes/);
});
