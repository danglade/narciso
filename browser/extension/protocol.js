// Shared by Chrome and the native host. Only enumerated operations; never eval.
export const HOST = 'ai.narciso.browser';
export const MAX_FRAME = 256 * 1024;
export function publicUrl(input) {
  if (typeof input !== 'string' || input.length > 4096) throw new Error('Invalid URL');
  const u = new URL(input);
  const h = u.hostname.toLowerCase();
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password ||
      (u.port && !['80', '443'].includes(u.port)) || !h.includes('.') ||
      h.endsWith('.local') || h.endsWith('.localhost') || h.endsWith('.internal') ||
      /^[\d.]+$/.test(h) || h.includes(':')) throw new Error('Only public HTTP(S) pages are supported');
  if (/(?:^|[\/_.-])(logout|signout|delete|unsubscribe|remove|confirm-payment)(?:[\/_.-]|$)/i.test(u.pathname) ||
      [...u.searchParams.keys()].some(k => /^(?:code|token|access_token|id_token|password|secret|auth|session|signature)$/i.test(k)))
    throw new Error('This URL may contain a credential or perform an account action; open it yourself');
  return u.href;
}
export function validateRequest(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Error('Invalid browser request');
  const allowed = {status:[],search:['query'],open:['url'],read:['tabId','offset'],close:['tabId'],inspect:['tabId'],act:['tabId','snapshotId','ref','action','value']};
  if (!Object.hasOwn(allowed,p.op) || Object.keys(p).some(k => !['op','scope',...allowed[p.op]].includes(k))) throw new Error('Unsupported browser operation');
  if (typeof p.scope !== 'string' || !/^[a-f0-9]{64}$/.test(p.scope)) throw new Error('Missing browser scope');
  if (p.op === 'search' && (typeof p.query !== 'string' || !p.query.trim() || p.query.length > 1000)) throw new Error('Invalid search query');
  if (p.op === 'open') publicUrl(p.url);
  if (['read','close','inspect','act'].includes(p.op) && (!Number.isSafeInteger(p.tabId) || p.tabId < 1)) throw new Error('Invalid tab');
  if(p.op==='act'){
    if(typeof p.snapshotId!=='string'||!/^[a-f0-9-]{36}$/.test(p.snapshotId)||typeof p.ref!=='string'||!/^c\d{1,3}$/.test(p.ref))throw new Error('Invalid control reference');
    if(!['fill','select','check','click'].includes(p.action))throw new Error('Unsupported interaction');
    if(['fill','select'].includes(p.action)&&(typeof p.value!=='string'||p.value.length>2000))throw new Error('Invalid field value');
    if(p.action==='check'&&typeof p.value!=='boolean')throw new Error('Invalid check value');
    if(p.action==='click'&&p.value!==undefined)throw new Error('Click cannot include a value');
  }
  if (p.offset !== undefined && (!Number.isSafeInteger(p.offset) || p.offset < 0 || p.offset > 500000)) throw new Error('Invalid page offset');
  return p;
}
