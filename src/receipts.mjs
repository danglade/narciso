export async function acknowledgeRead(message, report, timeoutMs = 3000) {
  let deadline;
  try {
    if(typeof message.read!=='function')throw new Error('Read receipts unavailable.');
    await Promise.race([
      Promise.resolve().then(()=>message.read()),
      new Promise((_,reject)=>{deadline=setTimeout(()=>reject(new Error('Read receipt timed out.')),timeoutMs);}),
    ]);
    report('read_receipt_sent');
    return true;
  } catch {
    // A receipt failure is recorded but must not lose the accepted request.
    report('read_receipt_failed');
    return false;
  } finally {clearTimeout(deadline);}
}

export function serialQueue() {
  let tail=Promise.resolve();
  return {add(work){const next=tail.then(work);tail=next.catch(()=>{});return next;},idle(){return tail;}};
}
