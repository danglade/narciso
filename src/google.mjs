import { google } from 'googleapis';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { local, email } from './config.mjs';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';

// googleapis enables retries by default. A transport failure can occur after
// a server has committed a mutation; leave reconciliation to the host instead.
google.options({ retry: false });

const tokenFile = resolve(local, 'google-token.json');
export const scopes = [
  'openid', 'email',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/spreadsheets',
];
export function saveToken(data) {
  const temporary = `${tokenFile}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(data), { mode: 0o600 });
  renameSync(temporary, tokenFile);
}
export function oauthClient(redirect) {
  const config = JSON.parse(readFileSync(resolve(local, 'google-client.json'), 'utf8')).installed;
  if (!config?.client_id || !config?.client_secret) throw new Error('A Google OAuth Desktop app client is required.');
  return new google.auth.OAuth2(config.client_id, config.client_secret, redirect);
}
export async function authorizedClient() {
  let saved;
  try { saved = JSON.parse(readFileSync(tokenFile, 'utf8')); }
  catch { throw new Error('Personal Google is not connected. Complete npm run google:login locally.'); }
  if (saved.email !== email) throw new Error('Google account does not match Narciso’s configured personal account.');
  const auth = oauthClient();
  auth.setCredentials(saved.tokens);
  auth.on('tokens', tokens => { saved.tokens = { ...saved.tokens, ...tokens }; saveToken(saved); });
  return auth;
}

const id = z.string().min(1).max(300);
const query = z.string().max(1000);
const text = z.string().min(1).max(12000);
const recipient = z.string().email().max(254);
const mail = z.object({ to: z.array(recipient).min(1).max(10),
  subject: z.string().min(1).max(300).refine(s => !/[\r\n]/.test(s)), body: text }).strict();
const event = z.object({ calendarId: id, summary: z.string().min(1).max(500),
  start: z.string().datetime({ offset: true }), end: z.string().datetime({ offset: true }),
  description: z.string().max(5000).optional() }).strict()
  .refine(p => new Date(p.end) > new Date(p.start), 'End must follow start.');
export const readSchemas = {
  gmail_search: z.object({ query, limit: z.number().int().min(1).max(20).default(10) }).strict(),
  gmail_read: z.object({ messageId: id }).strict(),
  calendar_list: z.object({}).strict(),
  calendar_events: z.object({ calendarId: id.default('primary'), timeMin: z.string().datetime({offset:true}), timeMax: z.string().datetime({offset:true}) }).strict(),
  tasks_lists: z.object({}).strict(),
  tasks_list: z.object({ tasklistId: id }).strict(),
  drive_search: z.object({ query, limit: z.number().int().min(1).max(30).default(10) }).strict(),
  docs_read: z.object({ documentId: id }).strict(),
  sheets_read: z.object({ spreadsheetId: id, range: z.string().min(1).max(200) }).strict(),
};
export const changeSchemas = {
  gmail_draft: mail,
  gmail_send: mail,
  gmail_archive: z.object({ messageId: id }).strict(),
  calendar_create: event,
  tasks_create: z.object({ tasklistId: id, title: z.string().min(1).max(1000), notes: z.string().max(5000).optional(), due: z.string().datetime({offset:true}).optional() }).strict(),
  tasks_complete: z.object({ tasklistId: id, taskId: id }).strict(),
  docs_create: z.object({ title: z.string().min(1).max(300) }).strict(),
  docs_append: z.object({ documentId: id, text }).strict(),
  sheets_create: z.object({ title: z.string().min(1).max(300) }).strict(),
  sheets_write: z.object({ spreadsheetId: id, range: z.string().min(1).max(200), values: z.array(z.array(z.union([z.string().max(2000), z.number(), z.boolean()])).max(30)).min(1).max(100) }).strict(),
};

export function validateChange(action, p) {
  if (!Object.hasOwn(changeSchemas, action)) throw new Error('Unsupported Google change.');
  return changeSchemas[action].parse(p);
}
export function encodeMail(p) {
  p = mail.parse(p);
  const subject = `=?UTF-8?B?${Buffer.from(p.subject).toString('base64')}?=`;
  return Buffer.from(`To: ${p.to.join(', ')}\r\nSubject: ${subject}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from(p.body).toString('base64')}`).toString('base64url');
}
export async function readGoogle(action, parameters) {
  if (!Object.hasOwn(readSchemas, action)) throw new Error('Unsupported Google query.');
  const p = readSchemas[action].parse(parameters);
  const auth = await authorizedClient();
  const gmail = google.gmail({ version: 'v1', auth });
  let result;
  switch (action) {
    case 'gmail_search': result = await gmail.users.messages.list({ userId: 'me', q: p.query, maxResults: p.limit }); break;
    case 'gmail_read': result = await gmail.users.messages.get({ userId: 'me', id: p.messageId, format: 'full' }); break;
    case 'calendar_list': result = await google.calendar({version:'v3', auth}).calendarList.list({maxResults:100}); break;
    case 'calendar_events': result = await google.calendar({version:'v3', auth}).events.list({ ...p, singleEvents:true, orderBy:'startTime', maxResults:100 }); break;
    case 'tasks_lists': result = await google.tasks({version:'v1', auth}).tasklists.list({maxResults:100}); break;
    case 'tasks_list': result = await google.tasks({version:'v1', auth}).tasks.list({tasklist:p.tasklistId, maxResults:100, showCompleted:false}); break;
    case 'drive_search': result = await google.drive({version:'v3', auth}).files.list({ q:p.query, pageSize:p.limit, fields:'nextPageToken,files(id,name,mimeType,webViewLink,modifiedTime)', spaces:'drive' }); break;
    case 'docs_read': result = await google.docs({version:'v1',auth}).documents.get({documentId:p.documentId, includeTabsContent:true}); break;
    case 'sheets_read': result = await google.sheets({version:'v4',auth}).spreadsheets.values.get(p); break;
  }
  if (action === 'gmail_read') {
    const decode = part => ({ mimeType: part.mimeType,
      text: part.body?.data ? Buffer.from(part.body.data,'base64url').toString('utf8') : undefined,
      parts: part.parts?.map(decode) });
    return { id: result.data.id, threadId:result.data.threadId, snippet:result.data.snippet,
      headers:result.data.payload?.headers, content:decode(result.data.payload || {}) };
  }
  return result.data;
}

export async function executeChange(action, parameters) {
  const p = validateChange(action, parameters);
  const auth = await authorizedClient();
  const gmail = google.gmail({version:'v1',auth});
  let result;
  // No generic URL or arbitrary method escape hatch. Mutations run only after
  // the host claims a matching, unexpired owner approval.
  switch (action) {
    case 'gmail_draft': result = await gmail.users.drafts.create({userId:'me',requestBody:{message:{raw:encodeMail(p)}}}); break;
    case 'gmail_send': result = await gmail.users.messages.send({userId:'me',requestBody:{raw:encodeMail(p)}}); break;
    case 'gmail_archive': result = await gmail.users.messages.modify({userId:'me',id:p.messageId,requestBody:{removeLabelIds:['INBOX']}}); break;
    case 'calendar_create': result = await google.calendar({version:'v3',auth}).events.insert({calendarId:p.calendarId,requestBody:{summary:p.summary,description:p.description,start:{dateTime:p.start},end:{dateTime:p.end}}}); break;
    case 'tasks_create': result = await google.tasks({version:'v1',auth}).tasks.insert({tasklist:p.tasklistId,requestBody:{title:p.title,notes:p.notes,due:p.due}}); break;
    case 'tasks_complete': result = await google.tasks({version:'v1',auth}).tasks.patch({tasklist:p.tasklistId,task:p.taskId,requestBody:{status:'completed'}}); break;
    case 'docs_create': result = await google.docs({version:'v1',auth}).documents.create({requestBody:{title:p.title}}); break;
    case 'docs_append': result = await google.docs({version:'v1',auth}).documents.batchUpdate({documentId:p.documentId,requestBody:{requests:[{insertText:{endOfSegmentLocation:{},text:p.text}}]}}); break;
    case 'sheets_create': result = await google.sheets({version:'v4',auth}).spreadsheets.create({requestBody:{properties:{title:p.title}}}); break;
    case 'sheets_write': result = await google.sheets({version:'v4',auth}).spreadsheets.values.update({spreadsheetId:p.spreadsheetId,range:p.range,valueInputOption:'RAW',requestBody:{values:p.values}}); break;
  }
  const data = result.data;
  return { id: data.id || data.documentId || data.spreadsheetId || data.message?.id,
    url:data.htmlLink || data.spreadsheetUrl, updatedRange:data.updatedRange, status: 'Google API confirmed' };
}
