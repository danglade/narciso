import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {openStore,acceptDelivery,saveMessage} from '../src/store.mjs';
import {startJob} from '../src/jobs.mjs';
import {saveEvidence} from '../src/evidence.mjs';

test('real background MCP surface cannot write, spawn tasks or change owner memory',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'narciso-worker-tools-'));const db=openStore(join(dir,'narciso.sqlite'));
 acceptDelivery(db,'origin','owner','Review');db.prepare("UPDATE deliveries SET state='processing'").run();saveMessage(db,'origin','owner','user','Review');const job=startJob(db,'owner','origin','Review','Read only');db.prepare("UPDATE jobs SET state='running'").run();
 const client=new Client({name:'test',version:'1'});const transport=new StdioClientTransport({command:process.execPath,args:[resolve('src/mcp.mjs')],env:{HOME:process.env.HOME,PATH:process.env.PATH,NARCISO_DATA_DIR:dir,NARCISO_CONVERSATION:'owner',NARCISO_TURN_ID:'worker-test',NARCISO_TASK_ID:job.id}});
 try{
  await client.connect(transport);const {tools}=await client.listTools();const names=tools.map(t=>t.name);
  for(const forbidden of ['task_start','task_cancel','task_update','memory_remember','gmail_search','react_to_owner_message'])assert.equal(names.includes(forbidden),false);
  assert.equal(names.some(n=>n.startsWith('prepare_')),false);assert.ok(names.includes('gmail_review_day'));assert.ok(names.includes('gmail_review_query'));assert.ok(names.includes('task_notify'));
  const a=saveEvidence(db,job.id,'receipt','body','Transaction A: USD 0.1');
  const b=saveEvidence(db,job.id,'receipt','body','Transaction B: USD 0.2');
  const total=await client.callTool({name:'sum_amounts',arguments:{currency:'USD',items:[{source:'A',amount:'0.1',evidenceId:a,quote:'Transaction A: USD 0.1'},{source:'B',amount:'0.2',evidenceId:b,quote:'Transaction B: USD 0.2'}]}});
  assert.equal(JSON.parse(total.content[0].text).total,'0.30');
  const notice=await client.callTool({name:'task_notify',arguments:{message:'Unverified raw message'}});
  assert.equal(JSON.parse(notice.content[0].text).queued,false);
  assert.equal(db.prepare('SELECT count(*) AS n FROM job_events').get().n,0);
  let refused=false;try{const r=await client.callTool({name:'prepare_gmail_archive',arguments:{messageId:'fake'}});refused=!!r.isError;}catch{refused=true;}assert.equal(refused,true);
 }finally{await client.close();db.close();rmSync(dir,{recursive:true,force:true});}
});
