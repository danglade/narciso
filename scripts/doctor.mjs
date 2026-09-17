import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { local, owner, normalizePhone, email } from '../src/config.mjs';
import { claudeEnvironment, modelProfile } from '../src/claude.mjs';

let claude=false;
try {
  const status=JSON.parse(execFileSync('claude',['auth','status'],{encoding:'utf8',env:claudeEnvironment('doctor')}));
  claude=status.loggedIn && status.authMethod==='claude.ai';
}catch{}
let google=false;
try {google=JSON.parse(readFileSync(resolve(local,'google-token.json'),'utf8')).email===email;}catch{}
const status={claudeSubscriptionLogin:claude,chatModel:modelProfile(),taskModel:modelProfile(true),ownerPhoneValid:!!normalizePhone(owner),
  photonCredentialsPresent:!!(process.env.PHOTON_PROJECT_ID && process.env.PHOTON_PROJECT_SECRET),
  googleOAuthClientPresent:existsSync(resolve(local,'google-client.json')),googleTokenPresent:google,
  imageInputEnabled:existsSync('/usr/bin/sips'),
  audioTranscriptionReady:existsSync(process.env.NARCISO_FFMPEG_BIN||'/opt/homebrew/bin/ffmpeg') && existsSync(process.env.NARCISO_WHISPER_BIN||'/opt/homebrew/bin/whisper-cli') && existsSync(process.env.NARCISO_WHISPER_MODEL||resolve(local,'models/ggml-small.bin')),
  backgroundInvestigationsEnabled:true,evidencePublicationEnabled:true,browserConnected:false,scheduledFollowupsEnabled:false};
console.log(JSON.stringify(status,null,2));
if(!claude || !status.ownerPhoneValid)process.exitCode=1;
