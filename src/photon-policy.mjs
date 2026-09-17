import { normalizePhone } from './config.mjs';

export function acceptedMessage(space, message, owner, activatedAt) {
  if (message.direction !== 'inbound' || space.type !== 'dm') return false;
  if (!normalizePhone(owner)) return false;
  if (normalizePhone(message.sender?.address || message.sender?.id) !== normalizePhone(owner)) return false;
  const timestamp = new Date(message.timestamp).getTime();
  if (!Number.isFinite(timestamp) || timestamp < activatedAt) return false;
  if (!message.id || !space.id) return false;
  let content=message.content;
  for(let i=0;i<4 && content?.type==='reply';i++)content=content.content;
  return (content?.type === 'text' && typeof content.text === 'string') || ['attachment','voice','group'].includes(content?.type);
}
export function chunks(text, max = 3500) {
  const result=[];
  while (text.length > max) {
    const boundary=text.lastIndexOf('\n',max);
    let cut=boundary>max/2 ? boundary : max;
    if (/[\uD800-\uDBFF]/.test(text[cut-1])) cut--;
    result.push(text.slice(0,cut)); text=text.slice(cut);
  }
  if(text) result.push(text);
  return result;
}
