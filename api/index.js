const fs = require('fs');
const path = require('path');

const seedPath = path.join(process.cwd(), 'data', 'store.json');

function seedState() {
  const state = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  state.queue = [];
  state.activity = [
    {
      id: 'a_live_seed',
      message: 'Live workspace initialized',
      meta: {},
      at: new Date().toISOString()
    }
  ];
  return state;
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

function integrationStatus() {
  return {
    highLevelPrivateIntegrationToken: Boolean(process.env.HIGHLEVEL_PRIVATE_INTEGRATION_TOKEN),
    vapiPublicApiKey: Boolean(process.env.VAPI_PUBLIC_API_KEY),
    makeWebhookUrl: Boolean(process.env.MAKE_OUTREACH_WEBHOOK_URL),
    calendarWebhookUrl: Boolean(process.env.MAKE_CALENDAR_WEBHOOK_URL),
    onboardingWebhookUrl: Boolean(process.env.MAKE_ONBOARDING_WEBHOOK_URL),
    supabase: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
  };
}

function scrubSettings(body) {
  const clean = { ...body };
  delete clean.makeWebhookUrl;
  delete clean.calendarWebhookUrl;
  delete clean.ghlWebhookUrl;
  delete clean.vapiWebhookUrl;
  return clean;
}

function supabaseHeaders() {
  return {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation'
  };
}

async function readStore() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const state = seedState();
    state.integrationStatus = integrationStatus();
    return state;
  }
  const url = `${process.env.SUPABASE_URL}/rest/v1/agency_state?key=eq.main&select=value`;
  const response = await fetch(url, { headers: supabaseHeaders() });
  if (!response.ok) throw new Error(`Supabase read failed: ${response.status}`);
  const rows = await response.json();
  if (rows[0]?.value) {
    rows[0].value.integrationStatus = integrationStatus();
    return rows[0].value;
  }
  const state = seedState();
  await writeStore(state);
  state.integrationStatus = integrationStatus();
  return state;
}

async function writeStore(store) {
  delete store.integrationStatus;
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const url = `${process.env.SUPABASE_URL}/rest/v1/agency_state`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { ...supabaseHeaders(), Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({ key: 'main', value: store, updated_at: new Date().toISOString() })
  });
  if (!response.ok) throw new Error(`Supabase write failed: ${response.status} ${await response.text()}`);
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

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1_000_000) reject(new Error('Request too large'));
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

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

module.exports = async function handler(req, res) {
  try {
    const store = await readStore();
    const pathname = req.url.split('?')[0].replace(/^\/api/, '') || '/';

    if (req.method === 'GET' && pathname === '/state') {
      if (!store.daily.date) store.daily.date = todayDhaka();
      store.integrationStatus = integrationStatus();
      return send(res, 200, store);
    }

    if (req.method === 'POST' && pathname === '/settings') {
      const body = await readBody(req);
      store.settings = {
        ...store.settings,
        ...scrubSettings(body),
        approvalMode: body.approvalMode || 'Manual approval',
        makeWebhookUrl: '',
        calendarWebhookUrl: '',
        ghlWebhookUrl: '',
        vapiWebhookUrl: ''
      };
      log(store, 'Updated execution settings');
      await writeStore(store);
      store.integrationStatus = integrationStatus();
      return send(res, 200, store);
    }

    if (req.method === 'POST' && pathname === '/daily') {
      const body = await readBody(req);
      store.daily = { ...store.daily, ...body, date: todayDhaka() };
      log(store, 'Updated daily tracker', store.daily);
      await writeStore(store);
      return send(res, 200, store);
    }

    if (req.method === 'POST' && pathname === '/checklist/toggle') {
      const { index } = await readBody(req);
      if (!store.checklist[index]) return send(res, 400, { error: 'Invalid checklist index' });
      store.checklist[index].done = !store.checklist[index].done;
      log(store, `${store.checklist[index].done ? 'Completed' : 'Reopened'} checklist item`, { item: store.checklist[index].text });
      await writeStore(store);
      return send(res, 200, store);
    }

    if (req.method === 'POST' && pathname === '/sprint/toggle') {
      const { index } = await readBody(req);
      if (!store.sprint?.[index]) return send(res, 400, { error: 'Invalid sprint index' });
      store.sprint[index].done = !store.sprint[index].done;
      log(store, `${store.sprint[index].done ? 'Completed' : 'Reopened'} sprint task`, { item: store.sprint[index].text });
      await writeStore(store);
      return send(res, 200, store);
    }

    if (req.method === 'POST' && pathname === '/prospects') {
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
      await writeStore(store);
      return send(res, 200, store);
    }

    const prospectPatch = pathname.match(/^\/prospects\/([^/]+)$/);
    if (req.method === 'PATCH' && prospectPatch) {
      const body = await readBody(req);
      const prospect = store.prospects.find(item => item.id === prospectPatch[1]);
      if (!prospect) return send(res, 404, { error: 'Prospect not found' });
      Object.assign(prospect, body);
      prospect.score = scoreProspect(prospect);
      if (body.status === 'Contacted' && !prospect.nextFollowUp) prospect.nextFollowUp = addDays(todayDhaka(), 2);
      log(store, `Updated prospect: ${prospect.name}`, { status: prospect.status });
      await writeStore(store);
      return send(res, 200, store);
    }

    if (req.method === 'POST' && pathname === '/queue/clear') {
      const count = store.queue.length;
      store.queue = [];
      log(store, `Cleared ${count} queued outreach item(s)`);
      await writeStore(store);
      return send(res, 200, store);
    }

    if (req.method === 'POST' && pathname === '/queue/generate') {
      const body = await readBody(req);
      const limit = Number(body.limit || store.settings.dailyOutreachTarget || 20);
      const today = todayDhaka();
      const candidates = store.prospects
        .filter(item => item.status === 'New' || (item.status === 'Contacted' && (!item.nextFollowUp || item.nextFollowUp <= today)))
        .filter(item => !store.queue.some(q => q.prospectId === item.id && q.status === 'Queued'))
        .sort((a, b) => scoreProspect(b) - scoreProspect(a))
        .slice(0, limit);
      const items = candidates.map(prospect => {
        const followUp = prospect.status === 'Contacted';
        const kind = prospect.channel === 'Instagram' ? 'dm' : 'email';
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
      await writeStore(store);
      return send(res, 200, store);
    }

    const queueSend = pathname.match(/^\/queue\/([^/]+)\/send$/);
    if (req.method === 'POST' && queueSend) {
      const item = store.queue.find(q => q.id === queueSend[1]);
      if (!item) return send(res, 404, { error: 'Queue item not found' });
      const prospect = store.prospects.find(p => p.id === item.prospectId);
      let delivery = { skipped: true, reason: 'Manual approval mode' };
      if (store.settings.approvalMode === 'Webhook auto-send' && process.env.MAKE_OUTREACH_WEBHOOK_URL) {
        delivery = await callWebhook(process.env.MAKE_OUTREACH_WEBHOOK_URL, { type: 'outreach.send', item, prospect, settings: store.settings });
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
      await writeStore(store);
      return send(res, 200, store);
    }

    const workflow = pathname.match(/^\/prospects\/([^/]+)\/(book-call|invoice|onboard)$/);
    if (req.method === 'POST' && workflow) {
      const prospect = store.prospects.find(p => p.id === workflow[1]);
      if (!prospect) return send(res, 404, { error: 'Prospect not found' });
      const action = workflow[2];
      let delivery = { skipped: true, reason: 'Manual approval mode' };
      if (action === 'book-call') {
        prospect.status = 'Zoom Booked';
        store.daily.callsBooked = Number(store.daily.callsBooked || 0) + 1;
        if (store.settings.approvalMode === 'Webhook auto-send') {
          delivery = await callWebhook(process.env.MAKE_CALENDAR_WEBHOOK_URL, { type: 'calendar.book_call', prospect, settings: store.settings });
        }
        log(store, `Booked discovery call: ${prospect.name}`, delivery);
      }
      if (action === 'invoice') {
        prospect.status = 'Pre-Sold';
        log(store, `Prepared Deel invoice workflow: ${prospect.name}`, { ...delivery, paymentMethod: store.settings.paymentMethod });
      }
      if (action === 'onboard') {
        prospect.status = 'Active';
        if (store.settings.approvalMode === 'Webhook auto-send') {
          delivery = await callWebhook(process.env.MAKE_ONBOARDING_WEBHOOK_URL || process.env.MAKE_OUTREACH_WEBHOOK_URL, {
            type: 'onboarding.start',
            prospect,
            settings: store.settings,
            hasHighLevelToken: Boolean(process.env.HIGHLEVEL_PRIVATE_INTEGRATION_TOKEN),
            hasVapiKey: Boolean(process.env.VAPI_PUBLIC_API_KEY)
          });
        }
        log(store, `Started onboarding workflow: ${prospect.name}`, delivery);
      }
      prospect.score = scoreProspect(prospect);
      await writeStore(store);
      return send(res, 200, store);
    }

    if (req.method === 'POST' && pathname === '/automation/nightly-reset') {
      store.daily = { ...store.daily, date: todayDhaka(), sent: 0, callsBooked: 0 };
      log(store, 'Reset daily counters for a new BD day');
      await writeStore(store);
      return send(res, 200, store);
    }

    return send(res, 404, { error: 'Not found' });
  } catch (error) {
    return send(res, 500, { error: error.message });
  }
};
