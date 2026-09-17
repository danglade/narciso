// Reactions are a small, independent side effect. They never authorize work,
// replace a reply, or get retried after an ambiguous transport result.
export const REACTION_EMOJIS=['👍','👀','❤️','😂','🎉','💪'];

export function requestReaction(db, conversation, deliveryId, emoji) {
  if(!REACTION_EMOJIS.includes(emoji))throw new Error('Unsupported reaction.');
  const delivery=db.prepare("SELECT id FROM deliveries WHERE id=? AND conversation=? AND state='processing'").get(deliveryId,conversation);
  if(!delivery)throw new Error('Unsupported reaction: no active owner iMessage.');
  const inserted=db.prepare("INSERT OR IGNORE INTO message_reactions(delivery_id,emoji,state,created) VALUES (?,?,'pending',?)").run(deliveryId,emoji,Date.now());
  return {requested:!!inserted.changes,emoji:db.prepare('SELECT emoji FROM message_reactions WHERE delivery_id=?').get(deliveryId).emoji};
}

export function reactionPump(db, deliveryId, message, report, {intervalMs=250,timeoutMs=3000}={}) {
  let timer;let stopped=false;let running=Promise.resolve();
  async function deliver() {
    const row=db.prepare("SELECT emoji FROM message_reactions WHERE delivery_id=? AND state='pending'").get(deliveryId);
    if(!row)return;
    if(!db.prepare("UPDATE message_reactions SET state='sending' WHERE delivery_id=? AND state='pending'").run(deliveryId).changes)return;
    let deadline;
    try {
      const sent=await Promise.race([
        Promise.resolve().then(()=>message.react(row.emoji)),
        new Promise((_,reject)=>{deadline=setTimeout(()=>reject(new Error('Reaction timeout')),timeoutMs);}),
      ]);
      // The SDK explicitly returns undefined for unsupported reactions.
      if(!sent)throw new Error('Reaction unsupported');
      db.prepare("UPDATE message_reactions SET state='sent' WHERE delivery_id=?").run(deliveryId);
      report('reaction_sent');
    }catch{
      db.prepare("UPDATE message_reactions SET state='needs_review' WHERE delivery_id=?").run(deliveryId);
      report('reaction_failed');
    }finally{clearTimeout(deadline);}
  }
  function tick(){
    running=deliver().catch(()=>report('reaction_failed')).finally(()=>{
      if(!stopped)timer=setTimeout(tick,intervalMs);
    });
  }
  tick();
  return {async stop(){
    stopped=true;clearTimeout(timer);await running;
    // Drain a request written just before Claude finished, without retrying
    // a row already claimed by the periodic worker.
    await deliver().catch(()=>report('reaction_failed'));
  }};
}
