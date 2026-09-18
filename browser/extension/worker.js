import {HOST, publicUrl, validateRequest} from './protocol.js';
import {interactPage} from './interaction.js';

let port;
let queue = Promise.resolve();
async function badge(text, color) {
  await chrome.action.setBadgeText({text});
  await chrome.action.setBadgeBackgroundColor({color});
}
function connect() {
  if (port) return;
  const current = chrome.runtime.connectNative(HOST);
  port = current;
  current.onDisconnect.addListener(() => {
    void chrome.runtime.lastError;
    if (port === current) port = null;
    void badge('OFF', '#a33');
  });
  current.onMessage.addListener(message => {
    queue = queue.then(async () => {
      let response;
      try { response = {id:message.id,result:await execute(validateRequest(message.request))}; }
      catch (e) { response = {id:message.id,error:String(e.message).slice(0,500)}; }
      try { current.postMessage(response); } catch { /* host disconnected */ }
    }).catch(() => {});
  });
  current.postMessage({ready:true,version:2});
  void badge('ON', '#26734d');
}
chrome.runtime.onInstalled.addListener(connect);
chrome.runtime.onStartup.addListener(connect);
chrome.action.onClicked.addListener(connect);
chrome.alarms.create('reconnect', {periodInMinutes:1});
chrome.alarms.onAlarm.addListener(connect);
chrome.tabs.onRemoved.addListener(async id => chrome.storage.session.remove(String(id)));
connect();

async function ownedTab(id, scope) {
  const stored = (await chrome.storage.session.get(String(id)))[String(id)];
  if (stored !== scope) throw new Error('This tab does not belong to this conversation');
  const tab = await chrome.tabs.get(id);
  if (tab.incognito) throw new Error('Incognito is not supported');
  publicUrl(tab.url);
  return tab;
}
export async function execute(p) {
  p=validateRequest(p);
  if (p.op === 'status') return {connected:true,version:2,profile:'Chrome profile where Narciso extension is installed',capabilities:['search','open','read','close','inspect','act'],accountActions:'owner-request-scoped',interactionVersion:3};
  if(['inspect','act'].includes(p.op)){
    const tab=await ownedTab(p.tabId,p.scope);
    if(tab.status!=='complete')throw new Error('Page is loading; inspect again when ready');
    const results=await chrome.scripting.executeScript({target:{tabId:tab.id},world:'ISOLATED',func:interactPage,args:[p]});
    const page=results[0]?.result;if(!page)throw new Error('Page interaction returned no result');
    if(page.error)return {...page,tabId:tab.id};
    if(p.op==='inspect'){
      const after=await chrome.tabs.get(tab.id);
      if(after.url!==tab.url||page.url!==tab.url)throw new Error('Page changed while inspecting');
      page.controls=page.controls.filter(c=>{try{if(c.formAction)publicUrl(c.formAction);if(c.href)publicUrl(c.href);return !c.download;}catch{return false;}});
    }
    return {...page,tabId:tab.id,untrusted:true,capturedAt:new Date().toISOString()};
  }
  if (p.op === 'close') {
    await ownedTab(p.tabId,p.scope);
    await chrome.tabs.remove(p.tabId);
    return {closed:true};
  }
  let tab;
  if (p.op === 'open' || p.op === 'search') {
    // Always a new tab in THIS profile, never the owner's active tab.
    const url = p.op === 'search' ? 'https://www.google.com/search?q='+encodeURIComponent(p.query) : publicUrl(p.url);
    const managed = await chrome.storage.session.get(null);
    if (Object.keys(managed).length >= 20) throw new Error('Close some Narciso tabs before opening more (limit 20)');
    tab = await chrome.tabs.create({url,active:false});
    await chrome.storage.session.set({[String(tab.id)]:p.scope});
  } else tab = await ownedTab(p.tabId,p.scope);
  // Navigation/loading can fail; preserve the tab for an explicit retry or handoff.
  const deadline = Date.now()+18000;
  while (Date.now() < deadline) {
    tab = await chrome.tabs.get(tab.id);
    if (tab.status === 'complete') break;
    await new Promise(r => setTimeout(r,250));
  }
  if (tab.status !== 'complete') return {tabId:tab.id,blocked:true,reason:'Page is still loading; retry browser_read',untrusted:true};
  try { publicUrl(tab.url); }
  catch { return {tabId:tab.id,blocked:true,reason:'Redirected to an unsupported or sensitive address; inspect this tab yourself',untrusted:true}; }
  let page;
  try {
    const results = await chrome.scripting.executeScript({target:{tabId:tab.id},world:'ISOLATED',func:extractPage,args:[p.offset||0]});
    page = results[0]?.result;
  } catch {
    return {tabId:tab.id,url:tab.url,blocked:true,reason:'Chrome could not read this page. It may require a login, site permission or manual interaction.',untrusted:true};
  }
  // Discard if the owner or the page navigated during extraction.
  const after = await chrome.tabs.get(tab.id);
  if (!page || after.url !== tab.url || page.url !== tab.url) return {tabId:tab.id,blocked:true,reason:'Page changed during reading; retry',untrusted:true};
  const links = page.links.flatMap(link => {try{return [{title:link.title,url:publicUrl(link.url)}];}catch{return [];}});
  return {...page,links,tabId:tab.id,kind:p.op === 'search'?'search_results':'page',untrusted:true,capturedAt:new Date().toISOString()};
}

// Runs in Chrome's isolated world. Read rendered text only. Never expose input
// values, cookies, localStorage, hidden HTML or page JS to the model.
function extractPage(offset) {
  const all = (document.body?.innerText || '').slice(0,500000);
  const text = all.slice(offset,offset+22000);
  const candidates = [...document.querySelectorAll('a[href]')].filter(a => a.innerText.trim() && a.getClientRects().length && a.href.length<=1000);
  const links = candidates.slice(0,20).map(a=>({title:a.innerText.trim().slice(0,160),url:a.href}));
  const captcha = !!document.querySelector('iframe[src*="recaptcha"],iframe[src*="hcaptcha"],#challenge-running') || /verify you are human|unusual traffic|verifica que eres humano|checking your browser/i.test(all.slice(0,5000));
  const login = !!document.querySelector('input[type="password"]');
  return {url:location.href,title:document.title.slice(0,500),text,links,offset,nextOffset:offset+text.length<all.length?offset+text.length:null,
    truncated:offset>0 || offset+text.length<all.length || all.length===500000,blocked:captcha||login,
    ...(captcha||login?{reason:captcha?'Human verification required; complete it in this Chrome tab, then retry browser_read':'Sign-in required; sign in yourself in this Chrome tab, then retry browser_read'}:{})};
}
