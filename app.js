// 洗腎叫車月曆：資料存在手機 localStorage
const KEY = 'taxi-calendar-v1';
const STATUS = [
  { id: '', label: '還沒約', mark: '未約', cls: 's-none' },
  { id: 'booked', label: '已預約', mark: '已約', cls: 's-booked' },
  { id: 'ok', label: '成功', mark: '成功', cls: 's-ok' },
  { id: 'skip', label: '不用車', mark: '免', cls: 's-skip' },
];
const WD_NAMES = ['日', '一', '二', '三', '四', '五', '六'];

let data = load();
let view = firstOfMonth(new Date());
let openKey = null;

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && d.days) return d;
  } catch (e) {}
  return { dialWeekdays: [2, 4, 6], days: {} }; // 週二、四、六
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { alert('儲存失敗：' + e.message); }
}

function firstOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function keyOf(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function dateOf(key) { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); }
function todayKey() { return keyOf(new Date()); }

// 這天是否要洗腎：個別設定優先，否則看每週洗腎日
function isDial(key) {
  const rec = data.days[key];
  if (rec && typeof rec.dial === 'boolean') return rec.dial;
  return data.dialWeekdays.includes(dateOf(key).getDay());
}
function rec(key) { return data.days[key] || {}; }
function statusOf(id) { return STATUS.find((s) => s.id === (id || '')) || STATUS[0]; }

function render() {
  const y = view.getFullYear(), m = view.getMonth();
  document.getElementById('title').textContent = y + ' 年 ' + (m + 1) + ' 月';
  const grid = document.getElementById('grid');
  grid.innerHTML = '';
  const lead = (view.getDay() + 6) % 7; // 週一為第一欄
  for (let i = 0; i < lead; i++) grid.appendChild(Object.assign(document.createElement('div'), { className: 'cell empty' }));

  const tk = todayKey();
  const days = new Date(y, m + 1, 0).getDate();
  const count = { none: 0, booked: 0, ok: 0 };
  for (let d = 1; d <= days; d++) {
    const key = keyOf(new Date(y, m, d));
    const r = rec(key);
    const cell = document.createElement('button');
    cell.className = 'cell' + (key === tk ? ' today' : '') + (key < tk ? ' past' : '');
    cell.innerHTML = '<span class="num">' + d + '</span>';
    if (isDial(key)) {
      const s = statusOf(r.go);
      cell.insertAdjacentHTML('beforeend', '<span class="trip ' + s.cls + '">' + s.mark + '</span>');
      if (key >= tk) {
        if (s.id === '') count.none++;
        else if (s.id === 'booked') count.booked++;
        else if (s.id === 'ok') count.ok++;
      }
    }
    if (r.note) cell.insertAdjacentHTML('beforeend', '<span class="note-mark">📝 ' + escapeHtml(r.note) + '</span>');
    cell.addEventListener('click', () => openDay(key));
    grid.appendChild(cell);
  }

  const sum = document.getElementById('summary');
  const isCurrentOrPast = y < new Date().getFullYear() || (y === new Date().getFullYear() && m <= new Date().getMonth());
  const scope = isCurrentOrPast ? '本月今天起' : '這個月';
  if (count.none + count.booked + count.ok === 0) {
    sum.textContent = scope + '沒有需要叫車的日子。';
  } else {
    sum.innerHTML = scope + '：<b class="red">' + count.none + '</b> 天還沒約、<b class="yellow">' +
      count.booked + '</b> 天等結果、<b class="green">' + count.ok + '</b> 天已成功';
  }
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---- 單日視窗 ----
function openDay(key) {
  openKey = key;
  const d = dateOf(key);
  document.getElementById('dayTitle').textContent = (d.getMonth() + 1) + '/' + d.getDate() + '（' + WD_NAMES[d.getDay()] + '）';
  document.getElementById('note').value = rec(key).note || '';
  fillDay();
  show('daySheet');
}
function fillDay() {
  const r = rec(openKey);
  const dial = isDial(openKey);
  document.getElementById('dialToggle').checked = dial;
  document.querySelectorAll('#daySheet .choices').forEach((box) => {
    const trip = box.dataset.trip;
    box.innerHTML = '';
    for (const s of STATUS) {
      const b = document.createElement('button');
      b.className = 'choice ' + s.cls + (dial && (r[trip] || '') === s.id ? ' sel' : '');
      b.textContent = s.label;
      b.addEventListener('click', () => setTrip(trip, s.id));
      box.appendChild(b);
    }
    box.style.opacity = dial ? 1 : .4;
  });
}
function update(patch) {
  const r = Object.assign({}, rec(openKey), patch);
  for (const k of Object.keys(r)) if (r[k] === '' || r[k] === undefined) delete r[k];
  // 洗腎與否跟每週設定相同時就不另外記
  if (r.dial === data.dialWeekdays.includes(dateOf(openKey).getDay())) delete r.dial;
  if (Object.keys(r).length) data.days[openKey] = r; else delete data.days[openKey];
  save();
  render();
}
function setTrip(trip, id) {
  const patch = { [trip]: id };
  if (!isDial(openKey)) patch.dial = true; // 非洗腎日點了狀態，就當作這天要用車
  update(patch);
  fillDay();
}
document.getElementById('dialToggle').addEventListener('change', (e) => { update({ dial: e.target.checked }); fillDay(); });
document.getElementById('note').addEventListener('input', (e) => update({ note: e.target.value.trim() }));

// ---- 設定與備份 ----
function openSettings() {
  const box = document.getElementById('wdPick');
  box.innerHTML = '';
  for (const wd of [1, 2, 3, 4, 5, 6, 0]) {
    const lab = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = data.dialWeekdays.includes(wd);
    cb.addEventListener('change', () => {
      data.dialWeekdays = data.dialWeekdays.filter((x) => x !== wd);
      if (cb.checked) data.dialWeekdays.push(wd);
      save();
      render();
    });
    lab.append(WD_NAMES[wd], cb);
    box.appendChild(lab);
  }
  document.getElementById('ver').textContent = '版本 ' + window.APP_VERSION;
  show('setSheet');
}
document.getElementById('exportBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '洗腎叫車備份-' + todayKey() + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});
document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
document.getElementById('importFile').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!d.days || !Array.isArray(d.dialWeekdays)) throw new Error('格式不對');
    if (!confirm('匯入會取代目前手機裡的資料（' + Object.keys(d.days).length + ' 天的紀錄），確定嗎？')) return;
    data = d;
    save();
    render();
    openSettings();
    alert('匯入完成');
  } catch (err) {
    alert('匯入失敗：' + err.message);
  }
  e.target.value = '';
});

// ---- 視窗開關與導覽 ----
function show(id) {
  document.getElementById('backdrop').classList.add('show');
  document.getElementById(id).classList.add('show');
}
function hide() {
  document.getElementById('backdrop').classList.remove('show');
  document.querySelectorAll('.sheet').forEach((s) => s.classList.remove('show'));
  openKey = null;
}
document.getElementById('backdrop').addEventListener('click', hide);
document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', hide));
document.getElementById('prev').addEventListener('click', () => { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); render(); });
document.getElementById('next').addEventListener('click', () => { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); render(); });
document.getElementById('todayBtn').addEventListener('click', () => { view = firstOfMonth(new Date()); render(); });
document.getElementById('settingsBtn').addEventListener('click', openSettings);

// 左右滑動換月
let sx = null;
document.getElementById('grid').addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
document.getElementById('grid').addEventListener('touchend', (e) => {
  if (sx === null) return;
  const dx = e.changedTouches[0].clientX - sx;
  sx = null;
  if (Math.abs(dx) > 60) document.getElementById(dx < 0 ? 'next' : 'prev').click();
});

render();

if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js');
