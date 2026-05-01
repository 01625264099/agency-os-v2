let state = null;

const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  state = data;
  render();
  return data;
}

async function apiMaybe(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  if (!response.ok) return null;
  const data = await response.json();
  state = data;
  render();
  return data;
}

function money(value) {
  return '$' + Number(value || 0).toLocaleString();
}

function updateClocks() {
  const now = new Date();
  $('#bdTime').textContent = now.toLocaleTimeString('en-US', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit', hour12: false });
  $('#nyTime').textContent = now.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false });
}

function renderOverview() {
  const daily = state.daily;
  const settings = state.settings;
  $('#mSent').textContent = daily.sent || 0;
  $('#mSentTarget').textContent = `/ ${settings.dailyOutreachTarget || 20} daily target`;
  $('#mCalls').textContent = daily.callsBooked || 0;
  $('#mClients').textContent = daily.activeClients || 0;
  $('#mRevenue').textContent = money((daily.activeClients || 0) * (settings.price || 499));
  $('#dailySent').value = daily.sent || 0;
  $('#dailyCalls').value = daily.callsBooked || 0;
  $('#dailyClients').value = daily.activeClients || 0;

  const done = state.checklist.filter(item => item.done).length;
  const pct = Math.round((done / state.checklist.length) * 100);
  $('#progressText').textContent = `${pct}% complete`;
  $('#progressFill').style.width = `${pct}%`;
  $('#checklistList').innerHTML = state.checklist.map((item, index) => `
    <div class="check-item ${item.done ? 'done' : ''}" data-check="${index}">
      <span class="checkmark"></span>
      <div>
        <div class="check-title">${escapeHtml(item.text)}</div>
        <div class="phase">${escapeHtml(item.phase)}</div>
      </div>
    </div>
  `).join('');

  $('#activityList').innerHTML = state.activity.length ? state.activity.map(item => `
    <div class="activity-row">
      <strong>${escapeHtml(item.message)}</strong>
      <p>${new Date(item.at).toLocaleString()}</p>
    </div>
  `).join('') : '<p>No activity yet.</p>';
}

function renderSprint() {
  const sprint = state.sprint || [];
  const done = sprint.filter(item => item.done).length;
  $('#sProspects').textContent = 100;
  $('#sDaily').textContent = state.settings.dailyOutreachTarget || 20;
  $('#sCalls').textContent = Math.max(3, Number(state.daily.callsBooked || 0));
  $('#sCash').textContent = money(state.settings.price || 499);
  $('#sprintList').innerHTML = sprint.length ? sprint.map((item, index) => `
    <div class="check-item ${item.done ? 'done' : ''}" data-sprint="${index}">
      <span class="checkmark"></span>
      <div>
        <div class="check-title">${escapeHtml(item.text)}</div>
        <div class="phase">${escapeHtml(item.phase)}</div>
      </div>
    </div>
  `).join('') : '<p>No sprint tasks configured.</p>';
}

function renderProspects() {
  const query = $('#search')?.value?.toLowerCase() || '';
  const status = $('#statusFilter')?.value || '';
  const prospects = state.prospects.filter(item => {
    const haystack = `${item.name} ${item.contact} ${item.email} ${item.notes}`.toLowerCase();
    return (!query || haystack.includes(query)) && (!status || item.status === status);
  });
  $('#prospectsBody').innerHTML = prospects.map(item => `
    <tr>
      <td><strong>${escapeHtml(item.name)}</strong><br><small>${escapeHtml(item.ownerName || '')}</small></td>
      <td>${escapeHtml(item.contact || '')}<br><small>${escapeHtml(item.email || item.phone || item.website || '')}</small></td>
      <td><span class="score">${Number(item.score || prospectScore(item))}</span></td>
      <td>${escapeHtml(item.channel || 'Email')}</td>
      <td>
        <select data-status="${item.id}">
          ${['New', 'Contacted', 'Zoom Booked', 'Pre-Sold', 'Active'].map(status => `<option ${item.status === status ? 'selected' : ''}>${status}</option>`).join('')}
        </select>
        <div><small>Follow up: ${escapeHtml(item.nextFollowUp || 'not set')}</small></div>
      </td>
      <td>
        <strong>${escapeHtml(nextAction(item))}</strong>
        <div class="row-actions">
          <button class="small" data-book="${item.id}">Book Call</button>
          <button class="small" data-invoice="${item.id}">Invoice</button>
          <button class="small" data-onboard="${item.id}">Onboard</button>
        </div>
      </td>
      <td><textarea data-notes="${item.id}">${escapeHtml(item.notes || item.painSignal || '')}</textarea></td>
    </tr>
  `).join('');
}

function renderQueue() {
  $('#queueList').innerHTML = state.queue.length ? state.queue.map(item => `
    <article class="queue-card">
      <header>
        <div>
        <strong>${escapeHtml(item.prospectName)}</strong>
          <div class="phase">${escapeHtml(item.action || queueAction(item))} · Score ${Number(item.score || queueScore(item))}</div>
        </div>
        <span class="status ${item.status === 'Sent' ? 'sent' : ''}">${escapeHtml(item.status)}</span>
      </header>
      <textarea data-message="${item.id}">${escapeHtml(item.message)}</textarea>
      <div class="queue-actions">
        <button class="small ghost" data-copy="${item.id}">Copy</button>
        <button class="small" data-send="${item.id}" ${item.status === 'Sent' ? 'disabled' : ''}>Mark Sent</button>
      </div>
    </article>
  `).join('') : '<p>No queue yet. Generate today’s queue from new prospects.</p>';
}

function renderSettings() {
  $('#ownerName').value = state.settings.ownerName || '';
  $('#agencyName').value = state.settings.agencyName || '';
  $('#niche').value = state.settings.niche || '';
  $('#senderEmail').value = state.settings.senderEmail || '';
  $('#bookingLink').value = state.settings.bookingLink || '';
  $('#zoomBookingLink').value = state.settings.zoomBookingLink || '';
  $('#invoiceLink').value = state.settings.invoiceLink || '';
  $('#paymentMethod').value = state.settings.paymentMethod || '';
  $('#invoiceInstructions').value = state.settings.invoiceInstructions || '';
  $('#price').value = state.settings.price || 499;
  $('#target').value = state.settings.dailyOutreachTarget || 20;
  $('#approvalMode').value = state.settings.approvalMode || 'Manual approval';
  $('#targetCities').value = state.settings.targetCities || '';
  $('#leadSourceUrl').value = state.settings.leadSourceUrl || '';
  $('#webhook').value = '';
  $('#calendarWebhook').value = '';
  $('#ghlWebhook').value = '';
  $('#vapiWebhook').value = '';
  const integrations = state.integrationStatus || {};
  $('#secretStatus').innerHTML = `
    <span class="${integrations.highLevelPrivateIntegrationToken ? 'ok' : ''}">HighLevel token: ${integrations.highLevelPrivateIntegrationToken ? 'configured' : 'missing'}</span>
    <span class="${integrations.vapiPublicApiKey ? 'ok' : ''}">Vapi key: ${integrations.vapiPublicApiKey ? 'configured' : 'missing'}</span>
    <span class="${integrations.makeWebhookUrl ? 'ok' : ''}">Outreach webhook: ${integrations.makeWebhookUrl ? 'configured' : 'server-only'}</span>
    <span class="${integrations.calendarWebhookUrl ? 'ok' : ''}">Calendar webhook: ${integrations.calendarWebhookUrl ? 'configured' : 'server-only'}</span>
  `;
}

function renderAssets() {
  const settings = state.settings;
  const price = money(settings.price || 499);
  const booking = settings.bookingLink || settings.zoomBookingLink || '[booking link]';
  const zoom = settings.zoomBookingLink || settings.bookingLink || '[Zoom link]';
  const sender = settings.senderEmail || 'fahimsaif99@gmail.com';
  const name = settings.ownerName || 'Fahim';
  const niche = settings.niche || 'local clinics';

  const deel = `Hi [Client Name],\n\nGreat speaking with you. As discussed, I will set up the AI receptionist for [Clinic Name] at ${price}/month.\n\nI will send the Deel invoice/contract now. Once payment is confirmed, I will start the build and send you the onboarding checklist.\n\nThe build plan is simple:\n1. Connect your calendar and call-forwarding workflow.\n2. Build the AI receptionist with your FAQs, hours, and booking rules.\n3. Test the assistant before launch.\n4. Monitor transcripts during the first week.\n\nBest,\n${name}\n${sender}`;

  const onboarding = `Hi [Client Name],\n\nPayment is confirmed. I am starting the AI receptionist build for [Clinic Name].\n\nPlease send:\n- Business name, address, phone number, and website\n- Services you want the AI to answer questions about\n- Opening hours\n- Pricing guardrails or pricing FAQs\n- Calendar/booking process\n- Common questions callers ask\n- What the AI should do when it cannot answer\n\nI will send the first test call for review before launch.\n\nBest,\n${name}`;

  const close = `Based on what you shared, the issue is not just missed calls. It is missed booking opportunities.\n\nThe AI receptionist answers when the front desk is busy, handles basic questions, and books directly into your calendar. At ${price}/month, it only needs to recover a couple of bookings to pay for itself.\n\nI am taking on a small number of ${niche} this week so I can build and monitor the setup closely.\n\nIf you want to move forward, I will send the Deel invoice now. Once it is paid, I start the build.\n\nBooking link if we need a follow-up: ${booking}\nZoom scheduler: ${zoom}`;

  $('#deelMessage').value = deel;
  $('#onboardingMessage').value = onboarding;
  $('#closeScript').value = close;
}

function renderRoi() {
  const ticket = Number($('#ticket')?.value || 300);
  const missed = Number($('#missed')?.value || 40);
  const rate = Number($('#rate')?.value || 15);
  const price = Number(state?.settings?.price || 499);
  const newRevenue = Math.round(missed * (rate / 100)) * ticket;
  $('#roiOutput').textContent = `${money(newRevenue - price)} net upside`;
}

function render() {
  if (!state) return;
  renderOverview();
  renderSprint();
  renderProspects();
  renderQueue();
  renderSettings();
  renderAssets();
  renderRoi();
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  })[char]);
}

function prospectScore(prospect) {
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
  if (prospect.status === 'New') return 'Send first outreach';
  if (prospect.status === 'Contacted') return 'Follow up when due';
  if (prospect.status === 'Zoom Booked') return 'Run ROI discovery call';
  if (prospect.status === 'Pre-Sold') return 'Collect onboarding info';
  if (prospect.status === 'Active') return 'Monitor and request testimonial';
  return 'Review';
}

function queueProspect(item) {
  return state.prospects.find(prospect => prospect.id === item.prospectId) || {};
}

function queueAction(item) {
  const prospect = queueProspect(item);
  return prospect.status === 'Contacted' ? 'Follow-up' : 'First outreach';
}

function queueScore(item) {
  return prospectScore(queueProspect(item));
}

async function workflow(prospectId, endpoint, fallback) {
  const result = await apiMaybe(`/api/prospects/${prospectId}/${endpoint}`, { method: 'POST' });
  if (result) return;
  await fallback();
}

async function patchProspect(prospectId, body) {
  return api(`/api/prospects/${prospectId}`, { method: 'PATCH', body });
}

function downloadCsv() {
  const rows = [['Business', 'Contact', 'EmailOrHandle', 'Channel', 'Status', 'Notes']];
  state.prospects.forEach(p => rows.push([p.name, p.contact, p.email, p.channel, p.status, p.notes]));
  const csv = rows.map(row => row.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'agency-os-prospects.csv';
  link.click();
  URL.revokeObjectURL(url);
}

document.addEventListener('click', async event => {
  const nav = event.target.closest('.nav');
  if (nav) {
    $$('.nav').forEach(item => item.classList.remove('active'));
    $$('.view').forEach(item => item.classList.remove('active'));
    nav.classList.add('active');
    $('#' + nav.dataset.view).classList.add('active');
  }

  const check = event.target.closest('[data-check]');
  if (check) await api('/api/checklist/toggle', { method: 'POST', body: { index: Number(check.dataset.check) } });

  const sprint = event.target.closest('[data-sprint]');
  if (sprint) await api('/api/sprint/toggle', { method: 'POST', body: { index: Number(sprint.dataset.sprint) } });

  const copy = event.target.closest('[data-copy]');
  if (copy) {
    const text = $(`[data-message="${copy.dataset.copy}"]`).value;
    await navigator.clipboard.writeText(text);
    copy.textContent = 'Copied';
    setTimeout(() => copy.textContent = 'Copy', 1200);
  }

  const send = event.target.closest('[data-send]');
  if (send) await api(`/api/queue/${send.dataset.send}/send`, { method: 'POST' });

  const asset = event.target.closest('[data-copy-asset]');
  if (asset) {
    const field = $('#' + asset.dataset.copyAsset);
    await navigator.clipboard.writeText(field.value);
    asset.textContent = 'Copied';
    setTimeout(() => asset.textContent = 'Copy', 1200);
  }

  const book = event.target.closest('[data-book]');
  if (book) await workflow(book.dataset.book, 'book-call', async () => {
    await patchProspect(book.dataset.book, { status: 'Zoom Booked' });
    await api('/api/daily', { method: 'POST', body: { ...state.daily, callsBooked: Number(state.daily.callsBooked || 0) + 1 } });
  });

  const invoice = event.target.closest('[data-invoice]');
  if (invoice) await workflow(invoice.dataset.invoice, 'invoice', () => patchProspect(invoice.dataset.invoice, { status: 'Pre-Sold' }));

  const onboard = event.target.closest('[data-onboard]');
  if (onboard) await workflow(onboard.dataset.onboard, 'onboard', () => patchProspect(onboard.dataset.onboard, { status: 'Active' }));
});

document.addEventListener('change', async event => {
  const status = event.target.closest('[data-status]');
  if (status) await api(`/api/prospects/${status.dataset.status}`, { method: 'PATCH', body: { status: status.value } });

  const notes = event.target.closest('[data-notes]');
  if (notes) await api(`/api/prospects/${notes.dataset.notes}`, { method: 'PATCH', body: { notes: notes.value } });
});

$('#saveDaily').addEventListener('click', () => api('/api/daily', {
  method: 'POST',
  body: {
    sent: Number($('#dailySent').value || 0),
    callsBooked: Number($('#dailyCalls').value || 0),
    activeClients: Number($('#dailyClients').value || 0)
  }
}));

$('#resetDay').addEventListener('click', () => api('/api/automation/nightly-reset', { method: 'POST' }));
$('#generateQueue').addEventListener('click', () => api('/api/queue/generate', { method: 'POST', body: { limit: state.settings.dailyOutreachTarget } }));
$('#generateSprintQueue').addEventListener('click', () => api('/api/queue/generate', { method: 'POST', body: { limit: state.settings.dailyOutreachTarget } }));
$('#exportCsv').addEventListener('click', downloadCsv);
$('#search').addEventListener('input', renderProspects);
$('#statusFilter').addEventListener('change', renderProspects);
['ticket', 'missed', 'rate'].forEach(id => $('#' + id).addEventListener('input', renderRoi));

$('#addProspect').addEventListener('click', async () => {
  const extra = {
    ownerName: $('#pOwner').value,
    phone: $('#pPhone').value,
    website: $('#pWebsite').value,
    painSignal: $('#pPain').value
  };
  const name = $('#pName').value;
  await api('/api/prospects', {
    method: 'POST',
    body: {
      name,
      ownerName: extra.ownerName,
      contact: $('#pContact').value,
      email: $('#pEmail').value,
      phone: extra.phone,
      website: extra.website,
      painSignal: extra.painSignal,
      channel: $('#pChannel').value
    }
  });
  const added = state.prospects.find(item => item.name === name);
  if (added && (!added.ownerName || !added.painSignal || !added.phone || !added.website)) {
    await patchProspect(added.id, { ...extra, score: prospectScore({ ...added, ...extra }) });
  }
  $('#pName').value = '';
  $('#pOwner').value = '';
  $('#pContact').value = '';
  $('#pEmail').value = '';
  $('#pPhone').value = '';
  $('#pWebsite').value = '';
  $('#pPain').value = '';
});

$('#saveSettings').addEventListener('click', () => api('/api/settings', {
  method: 'POST',
  body: {
    ownerName: $('#ownerName').value,
    agencyName: $('#agencyName').value,
    niche: $('#niche').value,
    senderEmail: $('#senderEmail').value,
    bookingLink: $('#bookingLink').value,
    zoomBookingLink: $('#zoomBookingLink').value,
    invoiceLink: $('#invoiceLink').value,
    paymentMethod: $('#paymentMethod').value,
    invoiceInstructions: $('#invoiceInstructions').value,
    price: Number($('#price').value || 499),
    dailyOutreachTarget: Number($('#target').value || 20),
    approvalMode: $('#approvalMode').value,
    targetCities: $('#targetCities').value,
    leadSourceUrl: $('#leadSourceUrl').value,
    makeWebhookUrl: $('#webhook').value,
    calendarWebhookUrl: $('#calendarWebhook').value,
    ghlWebhookUrl: $('#ghlWebhook').value,
    vapiWebhookUrl: $('#vapiWebhook').value
  }
}));

setInterval(updateClocks, 1000);
updateClocks();
api('/api/state', { method: 'GET' });
