// Presentation-only: the key, variant names, timing and grading rubric never
// enter this document. Preserve the model's complete response verbatim.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
const [source,destination]=process.argv.slice(2);
if(!source||!destination)throw new Error('Pass blind.json and destination HTML');
const cases=JSON.parse(readFileSync(source,'utf8'));
if(cases.length!==12||cases.some(c=>!c.A||!c.B))throw new Error('Incomplete ballot');
const safe=x=>JSON.stringify(x).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
const html=readFileSync(new URL('ballot.template.html',import.meta.url),'utf8').replace('__BLIND_CASES__',()=>safe(cases)).replace('__RUN_ID__',()=>safe(dirname(resolve(source)).split('/').at(-1)));
mkdirSync(dirname(resolve(destination)),{recursive:true});writeFileSync(destination,html,{mode:0o600});
console.log(resolve(destination));
