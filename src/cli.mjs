import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { openStore } from './store.mjs';
import { handle } from './assistant.mjs';
const db = openStore();
if (process.argv.length > 2) {
  try { console.log(await handle(db, 'desktop', process.argv.slice(2).join(' '))); }
  catch (e) { console.error(e.message); process.exitCode = 1; }
} else {
  const rl = createInterface({ input: stdin, output: stdout });
  console.log('Narciso — /exit to leave.');
  try {
    while (true) {
      const input = await rl.question('You: ');
      if (input.trim() === '/exit') break;
      if (!input.trim()) continue;
      try { console.log(`\nNarciso: ${await handle(db, 'desktop', input)}\n`); }
      catch (e) { console.error(e.message); }
    }
  } finally { rl.close(); }
}
db.close();
