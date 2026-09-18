import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {openStore,acceptDelivery,saveMessage} from '../src/store.mjs';
import {createCuaController,lockChrome,desktopState} from '../src/cua.mjs';
import {claudeEnvironment} from '../src/claude.mjs';
function fixture(visual=false){
 const dir=mkdtempSync('/tmp/narciso-cua-test-'),db=openStore(':memory:');
 acceptDelivery(db,'turn','owner','Fill the requested form');saveMessage(db,'turn','owner','user','Fill the requested form');db.prepare("UPDATE deliveries SET state='processing'").run();
 const env={...process.env};process.env.NARCISO_BROWSER_BACKEND='cua';process.env.NARCISO_BROWSER_INTERACTIVE='1';delete process.env.NARCISO_TASK_ID;
 let count=0;const calls=[];const driver={
 listTools:async()=>({tools:['click','hotkey','type_text'].map(name=>({name,description:name,inputSchema:{type:'object',properties:{pid:{type:'integer'},window_id:{type:'integer'},session:{type:'string'},element_token:{type:'string'},x:{type:'number'},y:{type:'number'},keys:{type:'array'},text:{type:'string'},delivery_mode:{type:'string'}}}}))}),
 callTool:async({name,arguments:a})=>{calls.push({name,a});const value=name==='bring_to_front'?{exact_window_effect:{verified:true}}:name==='list_apps'?{apps:[{running:true,bundle_id:'com.google.Chrome',pid:7},{running:true,bundle_id:'Terminal',pid:9}]}:name==='list_windows'?{windows:[{pid:7,window_id:10,title:'Test Chrome',layer:0,is_on_screen:true,bounds:{width:1200,height:900}},{pid:7,window_id:12,title:'',layer:0,bounds:{width:1200,height:900}},{pid:9,window_id:11,layer:0,bounds:{width:1200,height:900}}]}:name==='get_window_state'?{pid:7,window_id:10,snapshot_id:'s'+(++count),screenshot_width:1280,screenshot_height:900,elements:[{element_token:'s'+count+':0',element_index:0}]}:{effect:'unverifiable'};return {structuredContent:value,content:[{type:'text',text:JSON.stringify(value)},...(name==='get_window_state'&&a.include_screenshot?[{type:'image',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jx1kAAAAASUVORK5CYII=',mimeType:'image/png'}]:[])]};}}
 const c=createCuaController(db,'owner','turn',{driver,visual,assertDesktop:()=>{if(driver.locked)throw Error('MAC_LOCKED')},captureDirectory:dir+'/captures',lockPath:dir+'/lock'});
 return {dir,db,c,driver,calls,cleanup(){c.release();db.close();for(const k of Object.keys(process.env))if(!(k in env))delete process.env[k];Object.assign(process.env,env);rmSync(dir,{recursive:true,force:true});}};
}
test('CUA binds only Chrome and consumes fresh observations; does not treat delivered as verified',async()=>{const f=fixture();try{
 await assert.rejects(f.c.run('click',{element_token:'s1:0'}),/Observe/);
 await assert.rejects(f.c.run('observe',{windowId:11}),/Chrome window/);
 await f.c.run('observe');
 await assert.rejects(f.c.run('click',{pid:9,element_token:'s1:0'}),/Unsupported/);
 await assert.rejects(f.c.run('click',{x:1300,y:20}),/inside/);
 await assert.rejects(f.c.run('click',{element_token:'stale:0'}),/Stale/);
 await f.c.run('click',{element_token:'s1:0'});
 assert.deepEqual(f.calls.at(-1).a.pid,7);assert.equal(f.calls.at(-1).a.window_id,10);
 await assert.rejects(f.c.run('click',{element_token:'s1:0'}),/Observe/);
 const log=f.db.prepare('SELECT * FROM cua_actions').get();assert.equal(log.state,'returned');assert.equal(log.owner_request,'Fill the requested form');assert.match(log.result,/unverifiable/);
 await f.c.run('observe');await f.c.run('type_text',{text:'synthetic',x:30,y:30});assert.equal(f.calls.at(-1).a.delivery_mode,'foreground');
 await f.c.run('observe',{screenshot:false});await assert.rejects(f.c.run('click',{x:12,y:34}),/screenshot/);
}finally{f.cleanup()}});
test('CUA gates authority, tools and transport targets; subscription env excludes paid credentials',async()=>{const f=fixture();try{
 const ts=await f.c.listTools();assert.ok(!ts.find(t=>t.name==='click').inputSchema.properties.pid);
 await f.c.run('observe');await assert.rejects(f.c.run('hotkey',{keys:['cmd','option','j']}),/outside/);
 await assert.rejects(f.c.run('type_text',{text:'javascript:alert(1)'}),/Executable/);
 process.env.ANTHROPIC_API_KEY='not-real';assert.equal(claudeEnvironment('owner','turn').ANTHROPIC_API_KEY,undefined);assert.equal(claudeEnvironment('owner','turn').NARCISO_BROWSER_BACKEND,'cua');assert.equal(claudeEnvironment('owner','turn','task').NARCISO_BROWSER_BACKEND,undefined);
 process.env.NARCISO_TASK_ID='task';await assert.rejects(f.c.run('observe'),/not enabled/);delete process.env.NARCISO_TASK_ID;
 f.db.prepare("UPDATE deliveries SET state='completed'").run();await assert.rejects(f.c.run('observe'),/authenticated/);
}finally{f.cleanup()}});
test('CUA records uncertain calls without replay and releases exclusive control',async()=>{const f=fixture();try{
 await f.c.run('observe');assert.throws(()=>lockChrome(f.dir+'/lock'),/busy/);
 const call=f.driver.callTool;let attempts=0;f.driver.callTool=async a=>{if(a.name==='click'){attempts++;throw Error('transport lost after send')}return call(a)};
 await assert.rejects(f.c.run('click',{element_token:'s1:0'}),/transport lost/);assert.equal(attempts,1);assert.equal(f.db.prepare('SELECT state FROM cua_actions').get().state,'uncertain');
 const r=await f.c.run('observe');assert.match(r.content.at(-1).text,/uncertain/);f.c.release();const release=lockChrome(f.dir+'/lock');release();
}finally{f.cleanup()}});

test('locked session blocks input before the driver receives an action',async()=>{const f=fixture();try{
 await f.c.run('observe');const count=f.calls.length;f.driver.locked=true;await assert.rejects(f.c.run('click',{element_token:'s1:0'}),/MAC_LOCKED/);assert.equal(f.calls.length,count);
 const user={kCGSSessionUserIDKey:501,kCGSSessionOnConsoleKey:true,kCGSessionLoginDoneKey:true};
 assert.equal(desktopState({IOConsoleUsers:[{...user,CGSSessionScreenIsLocked:true}]},501),'locked');
 assert.equal(desktopState({IOConsoleUsers:[user]},501),'ready');assert.equal(desktopState({IOConsoleUsers:[user]},502),'no-active-session');
}finally{f.cleanup()}});

test('focused Chrome behind an auxiliary window stays observable; ghost windows are not targets',async()=>{const f=fixture();try{
 const call=f.driver.callTool;
 f.driver.callTool=async q=>{
  if(q.name==='bring_to_front')return {isError:true,structuredContent:{code:'bring_to_front_exact_window_unverified',process_activated:true,exact_window_effect:{focused:true,frontmost_ordinary:false,verified:false}},content:[]};
  const r=await call(q);if(q.name==='get_window_state')Object.assign(r.structuredContent,{pid:7,window_id:10,background_input:{exact_window:{status:'matched'}}});return r;
 };
 assert.equal(JSON.parse((await f.c.run('windows')).content[0].text).windows.length,1);
 await assert.rejects(f.c.run('observe',{windowId:12}),/Chrome window/);
 const r=await f.c.run('observe');assert.equal(JSON.parse(r.content.at(-1).text).desktopState,'ready');
 await f.c.run('click',{element_token:'s1:0'});assert.equal(f.calls.at(-1).a.window_id,10);
}finally{f.cleanup()}});
test('partial focus never permits an unfocused, wrong or inaccessible Chrome surface',async()=>{
 for(const mode of ['unfocused','wrong-window','degraded','denied']){const f=fixture();try{
  const call=f.driver.callTool;f.driver.callTool=async q=>{
   if(q.name==='bring_to_front')return {isError:true,structuredContent:{code:mode==='denied'?'permission_denied':'bring_to_front_exact_window_unverified',process_activated:true,exact_window_effect:{focused:mode!=='unfocused',verified:false}},content:[]};
   const r=await call(q);if(q.name==='get_window_state')Object.assign(r.structuredContent,{pid:7,window_id:mode==='wrong-window'?999:10,degraded:mode==='degraded',background_input:{exact_window:{status:'matched'}}});return r;
  };
  await assert.rejects(f.c.run('observe'),mode==='denied'?/permission_denied/:/CHROME_FOCUS_UNAVAILABLE/);
  await assert.rejects(f.c.run('click',{x:10,y:10}),/Observe/);
 }finally{f.cleanup()}}
});

test('visual mode skips page AX, rejects semantic/background input and enforces foreground',async()=>{const f=fixture(true);try{
 const ts=await f.c.listTools(),click=ts.find(t=>t.name==='click');
 assert.equal(click.inputSchema.properties.element_token,undefined);assert.equal(click.inputSchema.properties.delivery_mode,undefined);
 await assert.rejects(f.c.run('observe',{screenshot:false}),/requires a screenshot/);
 await assert.rejects(f.c.run('observe',{query:'code'}),/does not query/);
 await f.c.run('observe');assert.equal(f.calls.at(-1).a.include_accessibility_tree,false);
 await assert.rejects(f.c.run('click',{element_token:'s1:0'}),/Unsupported/);
 await assert.rejects(f.c.run('click',{x:20,y:20,delivery_mode:'background'}),/Unsupported/);
 await assert.rejects(f.c.run('set_value',{value:'test'}),/Unsupported/);
 await f.c.run('click',{x:20,y:20});assert.equal(f.calls.at(-1).a.delivery_mode,'foreground');
 await assert.rejects(f.c.run('click',{x:20,y:20}),/Observe/);
 await f.c.run('observe');await f.c.run('type_text',{text:'synthetic'});assert.equal(f.calls.at(-1).a.delivery_mode,'foreground');
 process.env.NARCISO_CUA_MODE='visual';assert.equal(claudeEnvironment('owner','turn').NARCISO_CUA_MODE,'visual');assert.equal(claudeEnvironment('owner','turn','task').NARCISO_CUA_MODE,undefined);
}finally{f.cleanup()}});
test('visual mode requires exact screenshot ownership even after partial focus',async()=>{
 for(const wrong of [false,true]){const f=fixture(true);try{
 const call=f.driver.callTool;f.driver.callTool=async q=>{
 if(q.name==='bring_to_front')return {isError:true,structuredContent:{code:'bring_to_front_exact_window_unverified',process_activated:true,exact_window_effect:{focused:true,verified:false}},content:[]};
 const r=await call(q);if(q.name==='get_window_state'){r.structuredContent.window_id=wrong?999:10;delete r.structuredContent.background_input;}return r;
 };
 if(wrong){await assert.rejects(f.c.run('observe'),/CHROME_CAPTURE_UNAVAILABLE/);await assert.rejects(f.c.run('click',{x:10,y:10}),/Observe/);}
 else{await f.c.run('observe');await f.c.run('click',{x:10,y:10});assert.equal(f.calls.at(-1).a.delivery_mode,'foreground');}
 }finally{f.cleanup()}}
});

test('cancellation during asynchronous target check prevents dispatch of the next click',async()=>{const f=fixture(true);try{
 await f.c.run('observe');const call=f.driver.callTool;
 f.driver.callTool=async q=>{const r=await call(q);if(q.name==='list_windows')f.db.prepare("UPDATE deliveries SET state='cancelled' WHERE id='turn'").run();return r;};
 await assert.rejects(f.c.run('click',{x:10,y:10}),/active authenticated owner/);
 assert.equal(f.calls.filter(c=>c.name==='click').length,0);
 assert.equal(f.db.prepare('SELECT count(*) n FROM cua_actions').get().n,0);
}finally{f.cleanup()}});

test('owner screenshot captures only bound browser, pauses actions and reuses binding next turn',async()=>{const f=fixture(true);try{
 await assert.rejects(f.c.run('screenshot_for_owner'),/Observe/);
 await f.c.run('observe');const result=await f.c.run('screenshot_for_owner');
 assert.ok(result.content.some(c=>c.type==='image'));const row=f.db.prepare('SELECT * FROM browser_captures').get();assert.equal(row.window_id,10);assert.equal(row.pid,7);assert.equal(row.state,'pending');assert.equal(row.pause,1);
 assert.ok(f.calls.filter(c=>c.name==='get_window_state').every(c=>c.a.pid===7&&c.a.window_id===10));
 await f.c.run('observe');await assert.rejects(f.c.run('click',{x:30,y:30}),/wait for the next owner/);
 f.c.release();acceptDelivery(f.db,'next','owner','Continue with this form');saveMessage(f.db,'next','owner','user','Continue with this form');f.db.prepare("UPDATE deliveries SET state='processing' WHERE id='next'").run();
 const c=createCuaController(f.db,'owner','next',{driver:f.driver,assertDesktop:()=>{},visual:true,captureDirectory:f.dir+'/captures',lockPath:f.dir+'/lock'});
 try{await c.run('observe');await c.run('click',{x:30,y:30});assert.equal(f.calls.at(-1).a.window_id,10);}finally{c.release()}
}finally{f.cleanup()}});
test('screenshot rejects wrong-window capture and cancellation during capture',async()=>{
 for(const mode of ['wrong-window','cancelled']){const f=fixture(true);try{
  await f.c.run('observe');const call=f.driver.callTool;f.driver.callTool=async q=>{const r=await call(q);if(q.name==='get_window_state'){if(mode==='wrong-window')r.structuredContent.window_id=11;else f.db.prepare("UPDATE deliveries SET state='cancelled'").run();}return r;};
  await assert.rejects(f.c.run('screenshot_for_owner'));
  assert.equal(f.db.prepare('SELECT count(*) n FROM browser_captures').get().n,0);
 }finally{f.cleanup()}}
});
