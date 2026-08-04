import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js';
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.105.0';

const ADMIN_ID = 'ead04f96-9b87-4b0a-b03a-c3a493d854ea';
const SUPABASE_URL = 'https://zbzhilbhkaizrxtdxpue.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpiemhpbGJoa2FpenJ4dGR4cHVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MzMxODIsImV4cCI6MjA5NDEwOTE4Mn0.Y4RxP1vOifP6T_Qj64JvpmUho1A1nSyJqy-lBc1EH4o';
const firebaseConfig = {
  apiKey: 'AIzaSyDS8OepeFWhgwLHOaJRIDWPL05choRBU8o',
  authDomain: 'furas-25a61.firebaseapp.com',
  projectId: 'furas-25a61',
  storageBucket: 'furas-25a61.firebasestorage.app',
  messagingSenderId: '898704100134',
  appId: '1:898704100134:android:77e6a6c901ff2993290fe7',
};

const firebaseAuth = getAuth(initializeApp(firebaseConfig));
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
const $ = id => document.getElementById(id);
const state = { jobs: [], signals: [], reports: [], riskFilter: 'all' };
let confirmation = null;
let recaptcha = null;

function cleanPhone(value) { return value.replace(/\D/g, '').slice(-10); }
function setBusy(button, busy, normal) { button.disabled = busy; button.textContent = busy ? 'Please wait…' : normal; }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[c])); }
function dateText(value) { return value ? new Date(value).toLocaleString([], { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' }) : '—'; }
function countBy(values) { return values.reduce((out, value) => { const key = value || 'Unknown'; out[key] = (out[key] || 0) + 1; return out; }, {}); }

async function signIntoSupabase(phone, firebaseUid) {
  const email = `${phone}@furas.app`;
  const password = `FurasPhone!${firebaseUid}`;
  let result = await supabase.auth.signInWithPassword({ email, password });
  if (result.error) {
    result = await supabase.auth.signInWithPassword({ email, password: `FurasPhone!${phone}` });
  }
  if (result.error) throw result.error;
  if (result.data.user?.id !== ADMIN_ID) {
    await supabase.auth.signOut();
    throw new Error('This account is not authorized for the admin workspace.');
  }
  return result.data.user;
}

function resetRecaptcha() {
  if (recaptcha) { recaptcha.clear(); recaptcha = null; }
  $('recaptcha-container').innerHTML = '';
}

$('phone-form').addEventListener('submit', async event => {
  event.preventDefault();
  const phone = cleanPhone($('phone').value);
  if (phone.length !== 10) { $('login-error').textContent = 'Enter a valid 10-digit US phone number.'; return; }
  $('login-error').textContent = '';
  setBusy($('send-code'), true, 'Send verification code');
  try {
    resetRecaptcha();
    recaptcha = new RecaptchaVerifier(firebaseAuth, 'recaptcha-container', { size: 'invisible' });
    confirmation = await signInWithPhoneNumber(firebaseAuth, `+1${phone}`, recaptcha);
    $('phone-display').textContent = `+1 ${phone.slice(0,3)}-${phone.slice(3,6)}-${phone.slice(6)}`;
    $('phone-form').classList.add('hidden');
    $('code-form').classList.remove('hidden');
    $('code').focus();
  } catch (error) {
    $('login-error').textContent = error?.message || 'Could not send the verification code.';
    resetRecaptcha();
  } finally { setBusy($('send-code'), false, 'Send verification code'); }
});

$('code-form').addEventListener('submit', async event => {
  event.preventDefault();
  const code = $('code').value.replace(/\D/g, '');
  if (!confirmation || code.length !== 6) { $('code-error').textContent = 'Enter the 6-digit code.'; return; }
  $('code-error').textContent = '';
  setBusy($('verify-code'), true, 'Verify and open dashboard');
  try {
    const firebaseResult = await confirmation.confirm(code);
    await signIntoSupabase(cleanPhone($('phone').value), firebaseResult.user.uid);
    await openDashboard();
  } catch (error) {
    $('code-error').textContent = error?.message || 'Verification failed.';
  } finally { setBusy($('verify-code'), false, 'Verify and open dashboard'); }
});

$('change-phone').addEventListener('click', () => { $('code-form').classList.add('hidden'); $('phone-form').classList.remove('hidden'); $('code').value = ''; confirmation = null; resetRecaptcha(); });
$('sign-out').addEventListener('click', async () => { await supabase.auth.signOut(); location.reload(); });
$('refresh').addEventListener('click', loadDashboard);

async function openDashboard() {
  $('login-view').classList.add('hidden');
  $('dashboard-view').classList.remove('hidden');
  await loadDashboard();
}

async function loadDashboard() {
  $('loading').classList.remove('hidden'); $('content').classList.add('hidden'); $('global-error').classList.add('hidden');
  try {
    const [screening, signals, reports] = await Promise.all([
      supabase.from('job_screening_results').select('job_id,status,provider,model,risk_level,categories,reasons,suggestions,insights,screened_at,updated_at,jobs(title,business_name,location,created_at)').order('updated_at',{ascending:false}).limit(1000),
      supabase.from('chat_safety_signals').select('id,conversation_id,sender_id,categories,risk_score,created_at').order('created_at',{ascending:false}).limit(2000),
      supabase.from('reports').select('id,job_id,conversation_id,reason,note,reporter_id,reported_user_id,dismissed,created_at').eq('dismissed',false).order('created_at',{ascending:false}).limit(1000),
    ]);
    const firstError = screening.error || signals.error || reports.error;
    if (firstError) throw firstError;
    state.jobs = screening.data || []; state.signals = signals.data || []; state.reports = reports.data || [];
    renderAll();
    $('updated-at').textContent = `Updated ${new Date().toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}`;
    $('content').classList.remove('hidden');
  } catch (error) {
    $('global-error').textContent = `Could not load the secured dashboard: ${error?.message || 'Unknown error'}`;
    $('global-error').classList.remove('hidden');
  } finally { $('loading').classList.add('hidden'); }
}

function recent(rows, days=7, key='created_at') { const cutoff=Date.now()-days*86400000; return rows.filter(row => new Date(row[key] || 0).getTime() >= cutoff); }
function barRows(counts, empty='No data yet') {
  const rows=Object.entries(counts).sort((a,b)=>b[1]-a[1]); if(!rows.length) return `<div class="empty">${empty}</div>`;
  const max=rows[0][1]; return rows.slice(0,10).map(([label,count])=>`<div class="bar-row"><span>${escapeHtml(label.replaceAll('_',' '))}</span><div class="track"><div class="fill" style="width:${Math.max(4,count/max*100)}%"></div></div><b>${count}</b></div>`).join('');
}
function queueRows(rows) {
  if(!rows.length) return '<div class="empty">Nothing currently needs review.</div>';
  return rows.map(row=>{ const job=row.jobs||{}; const reason=(row.reasons||[])[0]||(row.categories||[]).join(', ')||'Review requested'; return `<div class="queue-row"><span class="risk ${escapeHtml(row.risk_level)}">${escapeHtml(row.risk_level)}</span><div class="job"><strong>${escapeHtml(job.title||'Untitled job')}</strong><span class="muted">${escapeHtml(job.business_name||'Unknown business')} · ${escapeHtml(job.location||'No location')}</span></div><div class="reason">${escapeHtml(reason)}</div><a class="action" href="https://furasapp.com/jobs/${encodeURIComponent(row.job_id)}" target="_blank" rel="noopener">Open job</a></div>`; }).join('');
}
function renderAll() {
  const weekJobs=recent(state.jobs,7,'updated_at'), weekSignals=recent(state.signals), queue=state.jobs.filter(r=>r.status==='completed'&&['medium','high'].includes(r.risk_level));
  $('jobs-screened').textContent=weekJobs.filter(r=>r.status==='completed').length;
  $('screened-detail').textContent=`${weekJobs.filter(r=>r.status==='failed').length} failed · ${weekJobs.filter(r=>r.status==='pending').length} pending`;
  $('needs-review').textContent=queue.length;
  $('review-detail').textContent=`${queue.filter(r=>r.risk_level==='high').length} high · ${queue.filter(r=>r.risk_level==='medium').length} medium`;
  $('chat-signal-count').textContent=weekSignals.length; $('open-report-count').textContent=state.reports.length;
  $('queue-badge').textContent=queue.length; $('queue-badge').classList.toggle('hidden',!queue.length);
  $('priority-queue').innerHTML=queueRows(queue.slice(0,5)); $('full-queue').innerHTML=queueRows(queue.filter(r=>state.riskFilter==='all'||r.risk_level===state.riskFilter));
  const jobTypes=countBy(state.jobs.filter(r=>r.status==='completed').map(r=>r.insights?.job_title||r.jobs?.title));
  $('job-needs').innerHTML=barRows(jobTypes); $('job-type-insights').innerHTML=barRows(jobTypes);
  const cats=countBy(state.signals.flatMap(r=>r.categories||[])); $('chat-trends').innerHTML=barRows(cats,'No chat safety signals yet.');
  const missing={ 'Missing pay':state.jobs.filter(r=>r.insights?.has_pay===false).length,'Missing hours':state.jobs.filter(r=>r.insights?.has_hours===false).length,'Missing description':state.jobs.filter(r=>r.insights?.has_description===false).length };
  $('completeness').innerHTML=`<div class="bars">${barRows(missing)}</div>`;
  const opportunities=[]; if(missing['Missing pay']) opportunities.push(['Improve pay completion',`${missing['Missing pay']} screened listings did not include pay.`]); if(missing['Missing hours']) opportunities.push(['Improve schedule completion',`${missing['Missing hours']} screened listings did not include hours.`]); if(!opportunities.length) opportunities.push(['More data needed','Opportunities will appear as screening volume grows.']);
  $('opportunities').innerHTML=opportunities.map(([a,b])=>`<div class="insight"><strong>${a}</strong><p>${b}</p><span class="tag">Observed data</span></div>`).join('');
  const providers=countBy(state.jobs.map(r=>r.provider||'pending')); const statuses=countBy(state.jobs.map(r=>r.status));
  $('provider-health').innerHTML=`<div class="bars">${barRows(providers)}</div>`; $('status-health').innerHTML=`<div class="bars">${barRows(statuses)}</div>`;
  $('health-summary').innerHTML=`<div class="insight"><strong>${escapeHtml(Object.keys(providers).join(' · ')||'No screenings')}</strong><p>${state.jobs.length} total screening records · ${statuses.failed||0} failed</p></div><div class="insight"><strong>No automatic enforcement</strong><p>Results remain in observation mode for human evaluation.</p></div>`;
  $('reports-list').innerHTML=state.reports.length?state.reports.map(r=>`<div class="list-row"><strong>${escapeHtml(r.reason||'No reason supplied')}</strong><p>${escapeHtml(r.note||'No additional note')} · ${dateText(r.created_at)}</p><span class="tag">${r.conversation_id?'Conversation':'Job'}</span></div>`).join(''):'<div class="empty">No open reports.</div>';
}

function showView(name) { document.querySelectorAll('.panel-view').forEach(el=>el.classList.add('hidden')); $(`view-${name}`).classList.remove('hidden'); document.querySelectorAll('.nav-item').forEach(el=>el.classList.toggle('on',el.dataset.view===name)); const labels={overview:'Safety & Insights',queue:'Review Queue',insights:'Job Insights',chat:'Chat Trends',reports:'User Reports',health:'Screening Health'}; $('page-title').textContent=labels[name]; }
document.querySelectorAll('.nav-item').forEach(button=>button.addEventListener('click',()=>showView(button.dataset.view)));
document.querySelectorAll('[data-go]').forEach(button=>button.addEventListener('click',()=>showView(button.dataset.go)));
document.querySelectorAll('.filter').forEach(button=>button.addEventListener('click',()=>{state.riskFilter=button.dataset.risk;document.querySelectorAll('.filter').forEach(el=>el.classList.toggle('on',el===button));renderAll();}));

const { data:{ session } } = await supabase.auth.getSession();
if (session?.user?.id === ADMIN_ID) await openDashboard(); else if (session) await supabase.auth.signOut();
