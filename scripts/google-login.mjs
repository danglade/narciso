import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { google } from 'googleapis';
import { oauthClient, scopes, saveToken } from '../src/google.mjs';
import { email } from '../src/config.mjs';

// Validate the client before starting a listener.
oauthClient();
const state = randomBytes(32).toString('hex');
let auth; let finishing = false;
const server = http.createServer(async (req,res) => {
  const url = new URL(req.url,'http://127.0.0.1');
  if (url.pathname !== '/oauth/callback' || url.searchParams.get('state') !== state || finishing) {
    res.writeHead(400).end('Invalid OAuth callback.'); return;
  }
  if (url.searchParams.has('error') || !url.searchParams.get('code')) {
    res.writeHead(400).end('Google authorization was not completed.'); return;
  }
  finishing = true;
  try {
    const {tokens} = await auth.getToken(url.searchParams.get('code'));
    auth.setCredentials(tokens);
    const {data} = await google.oauth2({version:'v2',auth}).userinfo.get();
    if (!data.verified_email || data.email !== email) throw new Error('Wrong Google account.');
    if (!tokens.refresh_token) throw new Error('Google did not grant offline access.');
    saveToken({email:data.email,tokens});
    res.writeHead(200, {'Content-Type':'text/plain'}).end('Narciso is connected to your personal Google account. You can close this tab.');
    console.log('Personal Google connected.');
    clearTimeout(expiry); server.close();
  } catch {
    finishing = false;
    res.writeHead(400).end('Connection failed. Use the configured personal Gmail account and grant offline access. Retry the login command.');
  }
});
server.listen(0,'127.0.0.1',()=>{
  const redirect = `http://127.0.0.1:${server.address().port}/oauth/callback`;
  auth = oauthClient(redirect);
  const url = auth.generateAuthUrl({access_type:'offline',prompt:'consent',scope:scopes,state,login_hint:email});
  console.log('Complete Google consent in the browser on this Mac.');
  spawn('open',[url],{stdio:'ignore'});
});
const expiry = setTimeout(()=>{console.error('Google login timed out.');server.close();},10*60_000);
