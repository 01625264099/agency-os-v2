const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const publicDir = path.join(root, 'public');
const storePath = path.join(root, 'data', 'store.json');
const secretsPath = path.join(root, 'data', 'secrets.json');
const port = Number(process.env.PORT || 4173);

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

function readStore() {
  return JSON.parse(fs.readFileSync(storePath, 'utf8'));
}

function writeStore(store) {
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
}

function readSecrets() {
  try {
    return JSON.parse(fs.readFileSync(secretsPath, 'utf8'));
  } catch (error) {
    return {};
  }
}

function secretStatus() {
  const secrets = readSecrets();
  return {
    highLevelPrivateIntegrationToken: Boolean(secrets.highLevelPrivateIntegrationToken),
    vapiPublicApiKey: Boolean(secrets.vapiPublicApiKey),
    makeWebhookUrl: Boolean(secrets.makeWebhookUrl),
    calendarWebhookUrl: Boolean(secrets.calendarWebhookUrl),
    ghlWebhookUrl: Boolean(secrets.ghlWebhookUrl),
    vapiWebhookUrl: Boolean(secrets.vapiWebhookUrl)
  };
}

function secretUrl(name) {
  return readSecrets()[name] || '';
}

function scrubSettings(body) {
  const clean = { ...body };
  delete clean.makeWebhookUrl;
  delete clean.calendarWebhookUrl;
  delete clean.ghlWebhookUrl;
  delete clean.vapiWebhookUrl;
  return clean;
}

function send(res, status, payload, contentType = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
  if (Buffer.isBuffer(payload)) return res.end(payload);
  res.end(typeof payload === 'string' ? payload : JSON.stringify(payload));
}

function notFound(res) {
  send(res, 404, { error: 'Not found' });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error('Request too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function id(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function todayDhaka() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());
}

function addDays(dateText, days) {
  const date = dateText ? new Date(`${dateText}T00:00:00Z`) : new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function log(store, message, meta = {}) {
  store.activity.unshift({ id: id('a'), message, meta, at: new Date().toISOString() });
  store.activity = store.activity.slice(0, 80);
}

function scoreProspect(prospect) {
  let score = 35;
  const text = `${prospect.name} ${prospect.contact} ${prospect.notes} ${prospect.painSignal}`.toLowerCase();
  if (prospect.email || prospect.phone || prospect.website) score += 10;
  if (prospect.ownerName) score += 10;
  if (/med spa|spa|clinic|dental|dentist|wellness|aesthetic|beauty/.test(text)) score += 20;
  if (/missed|voicemail|busy|front desk|booked|paid|urgent/.test(text)) score += 20;
  if (prospect.status === 'Zoom Booked') score += 25;
  if (prospect.status === 'Pre-Sold' || prospect.status === 'Active') score += 35;
  return Math.min(100, score);
}

function nextAction(prospect) {
  if (prospect.status === 'New') return 'Send first personalized outreach';
  if (prospect.status === 'Contacted') return 'Send follow-up and ask for 10-minute demo';
  if (prospect.status === 'Zoom Booked') return 'Prepare ROI screen share and discovery questions';
  if (prospect.status === 'Pre-Sold') return 'Send onboarding checklist and start Vapi/GHL build';
  if (prospect.status === 'Active') return 'Monitor transcripts and ask for testimonial';
  return 'Review manually';
}

function buildMessage(prospect, settings, kind = 'email') {
  const city = prospect.contact || 'your city';
  const business = prospect.name || 'your clinic';
  const name = prospect.ownerName || prospect.name || 'there';
  const bookingLine = settings.bookingLink ? `\n\nHere is my booking link if easier: ${settings.bookingLink}` : '';
  if (kind === 'dm') {
    return `Hey ${name}, quick question - when ${business}'s front desk is busy, do missed calls go to voicemail? I build AI receptionists that answer overflow calls and book appointments automatically. Open to a 10-minute demo next week?${bookingLine}`;
  }
  return `Subject: Quick question about ${business}'s front desk\n\nHi ${name},\n\nI was looking at ${business} in ${city} and had a quick question.\n\nWhen your front desk is busy with a patient and the phone rings, does it go to voicemail?\n\nI build AI receptionists for ${settings.niche || 'local clinics'}. It answers overflow calls in a natural voice, answers FAQs, and books appointments directly onto your calendar.\n\nOpen to a 10-minute Zoom next week?${bookingLine}\n\nBest,\n${settings.ownerName || 'Fahim'}`;
}

function buildFollowUp(prospect, settings) {
  const name = prospect.ownerName || prospect.name || 'there';
  const business = prospect.name || 'your clinic';
  const bookingLine = settings.bookingLink ? `\n\nBooking link: ${settings.bookingLink}` : '';
  return `Hi ${name}, quick follow-up on my note about missed calls at ${business}.\n\nThe simple math is this: if even 2 callers book instead of going to voicemail, the AI receptionist usually pays for itself.\n\nWorth a 10-minute look this week?${bookingLine}\n\nBest,\n${settings.ownerName || 'Fahim'}`;
}

async function callWebhook(url, payload) {
  if (!url) return { skipped: true, reason: 'No webhook URL configured' };
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return { ok: response.ok, status: response.status, body: await response.text() };
}

async function handleApi(req, res, pathname) {
  const store = readStore();

  if (req.method === 'GET' && pathname === '/api/state') {
    if (!store.daily.date) store.daily.date = todayDhaka();
    store.integrationStatus = secretStatus();
    return send(res, 200, store);
  }

  if (req.method === 'POST' && pathname === '/api/settings') {
    const body = await readBody(req);
    store.settings = { ...store.settings, ...scrubSettings(body), makeWebhookUrl: '', calendarWebhookUrl: '', ghlWebhookUrl: '', vapiWebhookUrl: '' };
    log(store, 'Updated execution settings');
    writeStore(store);
    store.integrationStatus = secretStatus();
    return send(res, 200, store);
  }

  if (req.method === 'POST' && pathname === '/api/daily') {
    const body = await readBody(req);
    store.daily = { ...store.daily, ...body, date: todayDhaka() };
    log(store, 'Updated daily tracker', store.daily);
    writeStore(store);
    return send(res, 200, store);
  }

  if (req.method === 'POST' && pathname === '/api/checklist/toggle') {
    const { index } = await readBody(req);
    if (!store.checklist[index]) return send(res, 400, { error: 'Invalid checklist index' });
    store.checklist[index].done = !store.checklist[index].done;
    log(store, `${store.checklist[index].done ? 'Completed' : 'Reopened'} checklist item`, { item: store.checklist[index].text });
    writeStore(store);
    return send(res, 200, store);
  }

  if (req.method === 'POST' && pathname === '/api/sprint/toggle') {
    const { index } = await readBody(req);
    if (!store.sprint || !store.sprint[index]) return send(res, 400, { error: 'Invalid sprint index' });
    store.sprint[index].done = !store.sprint[index].done;
    log(store, `${store.sprint[index].done ? 'Completed' : 'Reopened'} sprint task`, { item: store.sprint[index].text });
    writeStore(store);
    store.integrationStatus = secretStatus();
    return send(res, 200, store);
  }

  if (req.method === 'POST' && pathname === '/api/prospects') {
    const body = await readBody(req);
    const prospect = {
      id: id('p'),
      name: String(body.name || '').trim(),
      contact: String(body.contact || '').trim(),
      email: String(body.email || '').trim(),
      phone: String(body.phone || '').trim(),
      website: String(body.website || '').trim(),
      ownerName: String(body.ownerName || '').trim(),
      channel: body.channel || 'Email',
      status: 'New',
      notes: String(body.notes || '').trim(),
      painSignal: String(body.painSignal || '').trim(),
      score: 0,
      attempts: 0,
      lastContacted: '',
      nextFollowUp: '',
      createdAt: new Date().toISOString()
    };
    if (!prospect.name) return send(res, 400, { error: 'Business name is required' });
    prospect.score = scoreProspect(prospect);
    store.prospects.unshift(prospect);
    log(store, `Added prospect: ${prospect.name}`);
    writeStore(store);
    return send(res, 200, store);
  }

  if (req.method === 'PATCH' && pathname.startsWith('/api/prospects/')) {
    const prospectId = pathname.split('/').pop();
    const body = await readBody(req);
    const prospect = store.prospects.find(item => item.id === prospectId);
    if (!prospect) return send(res, 404, { error: 'Prospect not found' });
    Object.assign(prospect, body);
    prospect.score = scoreProspect(prospect);
    if (body.status === 'Contacted' && !prospect.nextFollowUp) prospect.nextFollowUp = addDays(todayDhaka(), 2);
    log(store, `Updated prospect: ${prospect.name}`, { status: prospect.status });
    writeStore(store);
    return send(res, 200, store);
  }

  if (req.method === 'POST' && pathname === '/api/queue/generate') {
    const body = await readBody(req);
    const limit = Number(body.limit || store.settings.dailyOutreachTarget || 20);
    const today = todayDhaka();
    const candidates = store.prospects
      .filter(item => item.status === 'New' || (item.status === 'Contacted' && (!item.nextFollowUp || item.nextFollowUp <= today)))
      .filter(item => !store.queue.some(q => q.prospectId === item.id && q.status === 'Queued'))
      .sort((a, b) => scoreProspect(b) - scoreProspect(a))
      .slice(0, limit);
    const items = candidates.map(prospect => {
      const kind = prospect.channel === 'Instagram' ? 'dm' : 'email';
      const followUp = prospect.status === 'Contacted';
      return {
        id: id('q'),
        prospectId: prospect.id,
        prospectName: prospect.name,
        channel: prospect.channel || 'Email',
        status: 'Queued',
        action: followUp ? 'Follow-up' : 'First outreach',
        nextAction: nextAction(prospect),
        score: scoreProspect(prospect),
        message: followUp ? buildFollowUp(prospect, store.settings) : buildMessage(prospect, store.settings, kind),
        createdAt: new Date().toISOString(),
        sentAt: ''
      };
    });
    store.queue.unshift(...items);
    log(store, `Generated ${items.length} outreach queue item(s)`);
    writeStore(store);
    return send(res, 200, store);
  }

  if (req.method === 'POST' && pathname === '/api/queue/clear') {
    const count = store.queue.length;
    store.queue = [];
    log(store, `Cleared ${count} queued outreach item(s)`);
    writeStore(store);
    store.integrationStatus = secretStatus();
    return send(res, 200, store);
  }

  if (req.method === 'POST' && pathname.startsWith('/api/queue/') && pathname.endsWith('/send')) {
    const queueId = pathname.split('/')[3];
    const item = store.queue.find(q => q.id === queueId);
    if (!item) return send(res, 404, { error: 'Queue item not found' });
    const prospect = store.prospects.find(p => p.id === item.prospectId);
    let delivery = { skipped: true, reason: 'Manual send mode' };
    const outreachWebhook = secretUrl('makeWebhookUrl');
    if (store.settings.approvalMode === 'Webhook auto-send' && outreachWebhook) {
      delivery = await callWebhook(outreachWebhook, { type: 'outreach.send', item, prospect, settings: store.settings });
    }
    item.status = 'Sent';
    item.sentAt = new Date().toISOString();
    if (prospect) {
      prospect.status = 'Contacted';
      prospect.attempts = Number(prospect.attempts || 0) + 1;
      prospect.lastContacted = todayDhaka();
      prospect.nextFollowUp = addDays(prospect.lastContacted, prospect.attempts > 1 ? 4 : 2);
      prospect.score = scoreProspect(prospect);
    }
    store.daily.date = todayDhaka();
    store.daily.sent = Number(store.daily.sent || 0) + 1;
    log(store, `Marked outreach sent: ${item.prospectName}`, delivery);
    writeStore(store);
    return send(res, 200, store);
  }

  if (req.method === 'POST' && pathname.startsWith('/api/prospects/') && pathname.endsWith('/book-call')) {
    const prospectId = pathname.split('/')[3];
    const prospect = store.prospects.find(p => p.id === prospectId);
    if (!prospect) return send(res, 404, { error: 'Prospect not found' });
    prospect.status = 'Zoom Booked';
    prospect.score = scoreProspect(prospect);
    store.daily.callsBooked = Number(store.daily.callsBooked || 0) + 1;
    const delivery = store.settings.approvalMode === 'Webhook auto-send'
      ? await callWebhook(secretUrl('calendarWebhookUrl'), { type: 'calendar.book_call', prospect, settings: store.settings })
      : { skipped: true, reason: 'Manual approval mode' };
    log(store, `Booked discovery call: ${prospect.name}`, delivery);
    writeStore(store);
    return send(res, 200, store);
  }

  if (req.method === 'POST' && pathname.startsWith('/api/prospects/') && pathname.endsWith('/invoice')) {
    const prospectId = pathname.split('/')[3];
    const prospect = store.prospects.find(p => p.id === prospectId);
    if (!prospect) return send(res, 404, { error: 'Prospect not found' });
    prospect.status = 'Pre-Sold';
    prospect.score = scoreProspect(prospect);
    const delivery = store.settings.approvalMode === 'Webhook auto-send'
      ? await callWebhook(secretUrl('makeWebhookUrl'), { type: 'invoice.send', prospect, settings: store.settings })
      : { skipped: true, reason: 'Manual approval mode', invoiceLink: store.settings.invoiceLink };
    log(store, `Prepared invoice workflow: ${prospect.name}`, delivery);
    writeStore(store);
    return send(res, 200, store);
  }

  if (req.method === 'POST' && pathname.startsWith('/api/prospects/') && pathname.endsWith('/onboard')) {
    const prospectId = pathname.split('/')[3];
    const prospect = store.prospects.find(p => p.id === prospectId);
    if (!prospect) return send(res, 404, { error: 'Prospect not found' });
    prospect.status = 'Active';
    prospect.score = scoreProspect(prospect);
    const ghl = store.settings.approvalMode === 'Webhook auto-send'
      ? await callWebhook(secretUrl('ghlWebhookUrl'), { type: 'ghl.create_subaccount', prospect, settings: store.settings })
      : { skipped: true, reason: 'Manual approval mode' };
    const vapi = store.settings.approvalMode === 'Webhook auto-send'
      ? await callWebhook(secretUrl('vapiWebhookUrl'), { type: 'vapi.create_assistant', prospect, settings: store.settings })
      : { skipped: true, reason: 'Manual approval mode' };
    log(store, `Started onboarding workflow: ${prospect.name}`, { ghl, vapi });
    writeStore(store);
    return send(res, 200, store);
  }

  if (req.method === 'POST' && pathname === '/api/automation/nightly-reset') {
    store.daily = { ...store.daily, date: todayDhaka(), sent: 0, callsBooked: 0 };
    log(store, 'Reset daily counters for a new BD day');
    writeStore(store);
    return send(res, 200, store);
  }

  return notFound(res);
}

function serveStatic(req, res, pathname) {
  const safePath = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.normalize(path.join(publicDir, safePath));
  if (!filePath.startsWith(publicDir)) return notFound(res);
  fs.readFile(filePath, (error, data) => {
    if (error) return notFound(res);
    send(res, 200, data, mime[path.extname(filePath)] || 'application/octet-stream');
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url.pathname);
    return serveStatic(req, res, url.pathname);
  } catch (error) {
    send(res, 500, { error: error.message });
  }
});

server.listen(port, () => {
  console.log(`Agency OS v2 running at http://localhost:${port}`);
});
