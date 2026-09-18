import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {ListToolsRequestSchema,CallToolRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import {openStore} from './store.mjs';
import {connectDriver,createCuaController} from './cua.mjs';
const db=openStore(),conversation=process.env.NARCISO_CONVERSATION,turnId=process.env.NARCISO_TURN_ID;
if(!conversation||!turnId||process.env.NARCISO_TASK_ID||process.env.NARCISO_BROWSER_BACKEND!=='cua'||process.env.NARCISO_BROWSER_INTERACTIVE!=='1')throw Error('Missing owner turn');
const driver=await connectDriver();const controller=createCuaController(db,conversation,turnId,{driver});
const server=new Server({name:'narciso-cua',version:'0.1.0'},{capabilities:{tools:{}}});
server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:await controller.listTools()}));
server.setRequestHandler(CallToolRequestSchema,async r=>{try{return await controller.run(r.params.name,r.params.arguments);}catch(e){return {isError:true,content:[{type:'text',text:JSON.stringify({error:e.message,instruction:'Only MAC_LOCKED confirms a locked Mac; focus errors do not. Describe the observed blocker without guessing its cause. Inspect before any recovery; do not replay uncertain actions or use another tool to bypass a refusal.'})}]};}});
let closing=false;async function close(){if(closing)return;closing=true;try{await driver.close();}finally{controller.release();db.close();process.exit();}}
process.on('SIGTERM',close);process.on('SIGINT',close);process.stdin.on('end',close);process.on('exit',()=>controller.release());
await server.connect(new StdioServerTransport());
