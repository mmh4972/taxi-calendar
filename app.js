// 洗腎叫車月曆：資料存在 Firebase Firestore，手機和電腦同步（沒網路時先存在手機，連上後自動補傳）
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, onSnapshot, setDoc, deleteDoc,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js?v=5';

const STATUS = [
  { id: '', label: '還沒約', mark: '未約', cls: 's-none' },
  { id: 'booked', label: '已預約', mark: '已約', cls: 's-booked' },
  { id: 'ok', label: '成功', mark: '成功', cls: 's-ok' },
  { id: 'skip', label: '不用車', mark: '免', cls: 's-skip' },
];
const WD_NAMES = ['日', '一', '二', '三', '四', '五', '六'];
const $ = (id) => document.getElementById(id);

let days = {};                         // { '2026-10-31': { go, note, dial } }
let cfg = { dialWeekdays: [2, 4, 6] }; // 週二、四、六
let view = firstOfMonth(new Date());
let openKey = null;
let db = null;
let unsubs = [];

function firstOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function keyOf(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function dateOf(key) { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); }
function todayKey() { return keyOf(new Date()); }

// 這天是否要洗腎：個別設定優先，否則看每週洗腎日
function isDial(key) {
  const r = days[key];
  if (r && typeof r.dial === 'boolean') return r.dial;
  return cfg.dialWeekdays.includes(dateOf(key).getDay());
}
function rec(key) { return days[key] || {}; }
function statusOf(id) { return STATUS.find((s) => s.id === (id || '')) || STATUS[0]; }

function render() {
  const y = view.getFullYear(), m = view.getMonth();
  $('title').textContent = y + ' 年 ' + (m + 1) + ' 月';
  const grid = $('grid');
  grid.innerHTML = '';
  // 前後補上相鄰月份的日子，湊滿整週（週一為第一欄）；這些日子也能點，但不算進本月統計
  const lead = (view.getDay() + 6) % 7;
  const last = new Date(y, m + 1, 0).getDate();
  const total = Math.ceil((lead + last) / 7) * 7;
  grid.style.setProperty('--rows', total / 7);

  const tk = todayKey();
  const count = { none: 0, booked: 0, ok: 0 };
  for (let i = 0; i < total; i++) {
    const key = keyOf(new Date(y, m, i - lead + 1));
    const inMonth = i >= lead && i < lead + last;
    const r = rec(key);
    const cell = document.createElement('button');
    cell.className = 'cell' + (key === tk ? ' today' : '') + (key < tk ? ' past' : '') + (inMonth ? '' : ' other');
    cell.innerHTML = '<span class="num">' + Number(key.slice(8)) + '</span>';
    if (isDial(key)) {
      const s = statusOf(r.go);
      cell.insertAdjacentHTML('beforeend', '<span class="trip ' + s.cls + '">' + s.mark + '</span>');
      if (inMonth && key >= tk) {
        if (s.id === '') count.none++;
        else if (s.id === 'booked') count.booked++;
        else if (s.id === 'ok') count.ok++;
      }
    }
    if (r.note) cell.insertAdjacentHTML('beforeend', '<span class="note-mark">📝 ' + escapeHtml(r.note) + '</span>');
    cell.addEventListener('click', () => openDay(key));
    grid.appendChild(cell);
  }

  const now = new Date();
  const notFuture = y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth());
  const scope = notFuture ? '本月今天起' : '這個月';
  if (count.none + count.booked + count.ok === 0) {
    $('summary').textContent = scope + '沒有需要叫車的日子。';
  } else {
    $('summary').innerHTML = scope + '：<b class="red">' + count.none + '</b> 天還沒約、<b class="yellow">' +
      count.booked + '</b> 天等結果、<b class="green">' + count.ok + '</b> 天已成功';
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---- 雲端 ----
function setSync(text, bad) { $('sync').textContent = text; $('sync').classList.toggle('bad', !!bad); }
function syncState(meta) {
  if (meta.hasPendingWrites) setSync(navigator.onLine ? '儲存中…' : '沒有網路，已先存在這台裝置，連上網路後會自動上傳');
  else if (meta.fromCache) setSync('沒有網路，顯示的是上次的資料');
  else setSync('已同步，手機和電腦都看得到');
}
function writeError(e) {
  setSync('儲存失敗（' + (e.code || e.message) + '），請確認帳號有權限', true);
}

function listen() {
  unsubs.push(onSnapshot(collection(db, 'days'), { includeMetadataChanges: true }, (snap) => {
    const next = {};
    snap.forEach((d) => { next[d.id] = d.data(); });
    days = next;
    render();
    if (openKey) fillDay();
    syncState(snap.metadata);
  }, (e) => setSync('讀取失敗（' + e.code + '）：這個帳號可能沒有權限', true)));
  unsubs.push(onSnapshot(doc(db, 'config', 'main'), (snap) => {
    const d = snap.data();
    if (d && Array.isArray(d.dialWeekdays)) cfg = { dialWeekdays: d.dialWeekdays.slice() };
    render();
  }, () => {}));
}

function saveDay(key, r) {
  if (Object.keys(r).length) days[key] = r; else delete days[key];
  render();
  const ref = doc(db, 'days', key);
  (Object.keys(r).length ? setDoc(ref, r) : deleteDoc(ref)).catch(writeError);
}

// ---- 單日視窗 ----
function openDay(key) {
  openKey = key;
  const d = dateOf(key);
  $('dayTitle').textContent = (d.getMonth() + 1) + '/' + d.getDate() + '（' + WD_NAMES[d.getDay()] + '）';
  $('note').value = rec(key).note || '';
  fillDay();
  show('daySheet');
}
function fillDay() {
  const r = rec(openKey);
  const dial = isDial(openKey);
  $('dialToggle').checked = dial;
  const box = document.querySelector('#daySheet .choices');
  box.innerHTML = '';
  for (const s of STATUS) {
    const b = document.createElement('button');
    b.className = 'choice ' + s.cls + (dial && (r.go || '') === s.id ? ' sel' : '');
    b.textContent = s.label;
    b.addEventListener('click', () => {
      const patch = { go: s.id };
      if (!isDial(openKey)) patch.dial = true; // 非洗腎日點了狀態，就當作這天要用車
      update(patch);
      fillDay();
    });
    box.appendChild(b);
  }
  box.style.opacity = dial ? 1 : .4;
}
function update(patch) {
  const r = Object.assign({}, rec(openKey), patch);
  for (const k of Object.keys(r)) if (r[k] === '' || r[k] === undefined) delete r[k];
  // 洗腎與否跟每週設定相同時就不另外記
  if (r.dial === cfg.dialWeekdays.includes(dateOf(openKey).getDay())) delete r.dial;
  saveDay(openKey, r);
}
$('dialToggle').addEventListener('change', (e) => { update({ dial: e.target.checked }); fillDay(); });
// 備註打完停一下才存，不要每個字都上傳
let noteTimer = null;
function flushNote() {
  if (noteTimer === null || !openKey) return;
  clearTimeout(noteTimer);
  noteTimer = null;
  update({ note: $('note').value.trim() });
}
$('note').addEventListener('input', () => { clearTimeout(noteTimer); noteTimer = setTimeout(flushNote, 700); });
$('note').addEventListener('blur', flushNote);

// ---- 設定 ----
function openSettings() {
  const box = $('wdPick');
  box.innerHTML = '';
  for (const wd of [1, 2, 3, 4, 5, 6, 0]) {
    const lab = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = cfg.dialWeekdays.includes(wd);
    cb.addEventListener('change', () => {
      cfg.dialWeekdays = cfg.dialWeekdays.filter((x) => x !== wd);
      if (cb.checked) cfg.dialWeekdays.push(wd);
      render();
      setDoc(doc(db, 'config', 'main'), { dialWeekdays: cfg.dialWeekdays.slice() }).catch(writeError);
    });
    lab.append(WD_NAMES[wd], cb);
    box.appendChild(lab);
  }
  $('ver').textContent = '版本 ' + window.APP_VERSION;
  show('setSheet');
}

// ---- 視窗開關與導覽 ----
function show(id) {
  $('backdrop').classList.add('show');
  $(id).classList.add('show');
}
function hide() {
  flushNote();
  $('backdrop').classList.remove('show');
  document.querySelectorAll('.sheet').forEach((s) => s.classList.remove('show'));
  openKey = null;
}
$('backdrop').addEventListener('click', hide);
document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', hide));
$('prev').addEventListener('click', () => { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); render(); });
$('next').addEventListener('click', () => { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); render(); });
$('todayBtn').addEventListener('click', () => { view = firstOfMonth(new Date()); render(); });
$('settingsBtn').addEventListener('click', openSettings);

// 左右滑動換月
let sx = null;
$('grid').addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
$('grid').addEventListener('touchend', (e) => {
  if (sx === null) return;
  const dx = e.changedTouches[0].clientX - sx;
  sx = null;
  if (Math.abs(dx) > 60) $(dx < 0 ? 'next' : 'prev').click();
});

// ---- 登入 ----
if (!firebaseConfig.apiKey) {
  $('login').hidden = false;
  $('loginErr').textContent = '還沒填 Firebase 設定（firebase-config.js）';
  $('loginBtn').disabled = true;
} else {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });

  onAuthStateChanged(auth, (user) => {
    unsubs.forEach((u) => u());
    unsubs = [];
    days = {};
    $('login').hidden = !!user;
    $('app').hidden = !user;
    if (user) {
      $('who').textContent = user.email;
      render();
      listen();
    }
  });

  $('login').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('loginErr').textContent = '';
    $('loginBtn').disabled = true;
    try {
      await signInWithEmailAndPassword(auth, $('email').value.trim(), $('password').value);
    } catch (err) {
      const msg = {
        'auth/invalid-credential': 'Email 或密碼不對',
        'auth/invalid-email': 'Email 格式不對',
        'auth/too-many-requests': '試太多次了，請稍後再試',
        'auth/network-request-failed': '沒有網路，請連上網路再登入',
      }[err.code];
      $('loginErr').textContent = msg || ('登入失敗（' + err.code + '）');
    }
    $('loginBtn').disabled = false;
  });
  $('logoutBtn').addEventListener('click', () => { hide(); signOut(auth); });
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js');
