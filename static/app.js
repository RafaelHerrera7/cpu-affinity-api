let NUM_CORES = 16;
function allCoresMask() { return (1n << BigInt(NUM_CORES)) - 1n; }
const API     = 'http://localhost:8080';

const tbody       = document.getElementById('tbody');
const filter      = document.getElementById('filter');
const dot         = document.getElementById('dot');
const statusT     = document.getElementById('status-text');
const countEl     = document.getElementById('count');
const updEl       = document.getElementById('updated');

let processes      = [];
let selected       = null;
let selectedGroup  = null;
let newProfileMask = 0n;
let configs        = [];
let assignments    = {};
let filterMode     = 'free';
let expandedGroups = new Set();
let sortCol        = null;
let sortDir        = 'asc';
let selectOpen     = false;

// ── profiles API ─────────────────────────────────────────────────
async function refreshAssignments() {
  try {
    const res = await fetch(`${API}/assignments`);
    assignments = await res.json();
  } catch { assignments = {}; }
}

async function saveAssignment(processName, profileName) {
  assignments[processName] = profileName;
  await fetch(`${API}/assignments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: processName, profile: profileName })
  });
}

async function refreshConfigs() {
  try {
    const res = await fetch(`${API}/profiles`);
    configs = await res.json();
  } catch { configs = []; }
  renderConfigPanel();
  render();
}

async function apiSaveProfile(name, mask) {
  await fetch(`${API}/profiles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mask: Number(mask) })
  });
  await refreshConfigs();
}

async function apiDeleteProfile(name) {
  await fetch(`${API}/profiles/${encodeURIComponent(name)}`, { method: 'DELETE' });
  await refreshConfigs();
}

function applyConfig(mask) {
  if (selected)      { selected.mask = BigInt(mask);     syncEditorDOM(`editor-${selected.pid}`, selected); }
  if (selectedGroup) { selectedGroup.mask = BigInt(mask); syncEditorDOM(groupEditorId(selectedGroup.name), selectedGroup); }
}

function renderConfigPanel() {
  const chips = document.getElementById('config-chips');
  if (!configs.length) {
    chips.innerHTML = '<span class="no-configs">Sin perfiles — haz clic en "+ Nuevo" para crear uno</span>';
    return;
  }
  chips.innerHTML = configs.map(c => `
    <span class="config-chip">
      <span onclick="applyConfig(${c.mask})" title="mask: ${c.mask}">${c.name}</span>
      <button class="chip-del" onclick="apiDeleteProfile('${c.name.replace(/'/g,"\\'")}')">×</button>
    </span>`
  ).join('');
}

// ── new profile panel ────────────────────────────────────────────
function toggleNewProfileForm() {
  const panel = document.getElementById('new-profile-panel');
  const visible = panel.style.display !== 'none';
  panel.style.display = visible ? 'none' : '';
  if (!visible) document.getElementById('np-name').focus();
}

function renderNewProfileCores() {
  const container = document.getElementById('np-cores');
  if (!container) return;
  container.innerHTML = Array.from({ length: NUM_CORES }, (_, i) => {
    const on = (newProfileMask & (1n << BigInt(i))) !== 0n;
    return `<button class="np-core ${on?'on':''}" onclick="toggleNewCore(${i})">${i}</button>`;
  }).join('');
  const mv = document.getElementById('np-mask-val');
  if (mv) mv.textContent = `mask: ${newProfileMask}`;
}

function toggleNewCore(i) {
  newProfileMask ^= (1n << BigInt(i));
  renderNewProfileCores();
}

function setNewProfileMask(m) {
  newProfileMask = BigInt(m);
  renderNewProfileCores();
}

async function createProfileFromTop() {
  const input = document.getElementById('np-name');
  const name  = input?.value?.trim();
  if (!name) { input?.focus(); return; }
  await apiSaveProfile(name, newProfileMask);
  input.value = '';
  newProfileMask = 0n;
  renderNewProfileCores();
  document.getElementById('new-profile-panel').style.display = 'none';
}

// ── apply profile from row ────────────────────────────────────────
async function applyProfileToProcess(selectEl, pid) {
  const mask        = parseInt(selectEl.value);
  const profileName = selectEl.options[selectEl.selectedIndex]?.text;
  if (!mask && mask !== 0) return;
  const proc = processes.find(p => p.PID === pid);
  if (proc && profileName) saveAssignment(proc.Name, profileName);
  await fetch(`${API}/processes/${pid}/affinity`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mask })
  });
  render();
}

async function applyProfileToGroup(selectEl, name, pids) {
  const mask        = parseInt(selectEl.value);
  const profileName = selectEl.options[selectEl.selectedIndex]?.text;
  if (!mask && mask !== 0) return;
  if (profileName) saveAssignment(name, profileName);
  await Promise.all(pids.map(pid =>
    fetch(`${API}/processes/${pid}/affinity`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mask })
    })
  ));
  render();
}

// ── helpers ──────────────────────────────────────────────────────
function groupEditorId(name) {
  return `group-editor-${name.replace(/[^a-zA-Z0-9]/g,'_')}`;
}

function setStatus(state, text) {
  dot.className = 'dot ' + state;
  statusT.textContent = text;
}

// ── sort ────────────────────────────────────────────────────────
function setSort(col) {
  if (sortCol === col) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
  else { sortCol = col; sortDir = 'asc'; }
  updateSortHeaders();
  render();
}

function updateSortHeaders() {
  ['pid','name','ppid','cpu'].forEach(col => {
    const th = document.getElementById(`th-${col}`);
    if (!th) return;
    th.classList.toggle('sorted', col === sortCol);
    const existing = th.querySelector('.sort-icon');
    if (existing) existing.remove();
    if (col === sortCol) {
      const icon = document.createElement('span');
      icon.className = 'sort-icon';
      icon.textContent = sortDir === 'asc' ? '▲' : '▼';
      th.appendChild(icon);
    }
  });
}

function sortedGroups(groups) {
  if (!sortCol) return groups;
  const entries = [...groups.entries()];
  entries.sort(([na, pa], [nb, pb]) => {
    let a, b;
    if      (sortCol === 'name') { a = na.toLowerCase(); b = nb.toLowerCase(); }
    else if (sortCol === 'pid')  { a = Math.min(...pa.map(p => p.PID));  b = Math.min(...pb.map(p => p.PID)); }
    else if (sortCol === 'ppid') { a = pa[0]?.PPID || 0; b = pb[0]?.PPID || 0; }
    else if (sortCol === 'cpu')  { a = pa.reduce((s,p) => s+p.CPU,0); b = pb.reduce((s,p) => s+p.CPU,0); }
    return a < b ? (sortDir==='asc'?-1:1) : a > b ? (sortDir==='asc'?1:-1) : 0;
  });
  return new Map(entries);
}

function sortedProcs(procs) {
  if (!sortCol) return procs;
  return [...procs].sort((a, b) => {
    let va, vb;
    if      (sortCol === 'name') { va = a.Name.toLowerCase(); vb = b.Name.toLowerCase(); }
    else if (sortCol === 'pid')  { va = a.PID;  vb = b.PID; }
    else if (sortCol === 'ppid') { va = a.PPID; vb = b.PPID; }
    else if (sortCol === 'cpu')  { va = a.CPU;  vb = b.CPU; }
    return va < vb ? (sortDir==='asc'?-1:1) : va > vb ? (sortDir==='asc'?1:-1) : 0;
  });
}

// ── filter mode ─────────────────────────────────────────────────
function setFilterMode(mode) {
  filterMode = mode;
  ['all','free','restricted'].forEach(m => {
    document.getElementById(`fb-${m}`).classList.toggle('active', m === mode);
  });
  render();
}

// ── expand/collapse ──────────────────────────────────────────────
function toggleGroup(name) {
  expandedGroups.has(name) ? expandedGroups.delete(name) : expandedGroups.add(name);
  render();
}

// ── individual affinity ──────────────────────────────────────────
async function openAffinity(pid) {
  if (selected?.pid === pid) { selected = null; render(); return; }
  const res  = await fetch(`${API}/processes/${pid}/affinity`);
  const data = await res.json();
  selected = { pid, mask: BigInt(data.mask) };
  render();
}

function toggleCore(i) {
  selected.mask ^= (1n << BigInt(i));
  syncEditorDOM(`editor-${selected.pid}`, selected);
}

async function saveAffinity() {
  const row = document.getElementById(`editor-${selected.pid}`);
  const btn = row.querySelector('.save-btn');
  btn.disabled = true; btn.textContent = 'Guardando...';
  await fetch(`${API}/processes/${selected.pid}/affinity`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mask: Number(selected.mask) })
  });
  selected = null;
  render();
}

// ── group affinity ───────────────────────────────────────────────
async function openGroupAffinity(name, pids) {
  if (selectedGroup?.name === name) { selectedGroup = null; render(); return; }
  expandedGroups.add(name);
  const res  = await fetch(`${API}/processes/${pids[0]}/affinity`);
  const data = await res.json();
  selectedGroup = { name, mask: BigInt(data.mask) };
  render();
}

function toggleGroupCore(i) {
  selectedGroup.mask ^= (1n << BigInt(i));
  syncEditorDOM(groupEditorId(selectedGroup.name), selectedGroup);
}

async function saveGroupAffinity(pids) {
  const id  = groupEditorId(selectedGroup.name);
  const btn = document.querySelector(`#${id} .save-btn`);
  btn.disabled = true; btn.textContent = 'Guardando...';
  await Promise.all(pids.map(pid =>
    fetch(`${API}/processes/${pid}/affinity`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mask: Number(selectedGroup.mask) })
    })
  ));
  selectedGroup = null;
  render();
}

// ── save-as inside editor ────────────────────────────────────────
async function commitSaveAs(inputId, mask) {
  const input = document.getElementById(inputId);
  const name  = input?.value?.trim();
  if (!name) return;
  if (input) input.value = '';
  await apiSaveProfile(name, mask);
}

// ── editor DOM sync ──────────────────────────────────────────────
function syncEditorDOM(id, state) {
  const row = document.getElementById(id);
  if (!row) return;
  row.querySelector('.mask-val').textContent = `mask: ${state.mask}`;
  row.querySelectorAll('.core').forEach((btn, i) => {
    btn.classList.toggle('on', (state.mask & (1n << BigInt(i))) !== 0n);
  });
  row.querySelector('.save-btn').disabled = state.mask === 0n;
}

function buildEditorRow(id, state, onToggle, onAll, onNone, onSave, extraClass) {
  const cores = Array.from({ length: NUM_CORES }, (_, i) => {
    const on = (state.mask & (1n << BigInt(i))) !== 0n;
    return `<button class="core ${on?'on':''}" onclick="${onToggle}(${i})">${i}</button>`;
  }).join('');

  const presetHTML = configs.length ? `
    <div class="preset-row">
      <span class="preset-label">Perfiles:</span>
      ${configs.map(c => `<span class="preset-chip" onclick="applyConfig(${c.mask})" title="mask: ${c.mask}">${c.name}</span>`).join('')}
    </div>` : '';

  return `
    <tr class="editor-row ${extraClass||''}" id="${id}">
      <td colspan="5">
        <div class="editor">
          <div class="editor-top">
            <span class="editor-label">CPU Cores</span>
            <div class="cores">${cores}</div>
            <div class="editor-actions">
              <button class="link-btn" onclick="${onAll}">Todos</button>
              <button class="link-btn" onclick="${onNone}">Ninguno</button>
              <span class="mask-val">mask: ${state.mask}</span>
              <button class="save-btn" onclick="${onSave}" ${state.mask===0n?'disabled':''}>Guardar</button>
            </div>
          </div>
          ${presetHTML}
        </div>
      </td>
    </tr>`;
}

// ── render ───────────────────────────────────────────────────────
function render() {
  const savedInputs = {};
  document.querySelectorAll('.save-as-input').forEach(inp => {
    if (inp.value) savedInputs[inp.id] = inp.value;
  });

  const q = filter.value.toLowerCase();

  let filtered = q
    ? processes.filter(p => p.Name.toLowerCase().includes(q) || String(p.PID).includes(q))
    : processes;

  if (filterMode === 'free')       filtered = filtered.filter(p => !p.Restricted);
  if (filterMode === 'restricted') filtered = filtered.filter(p =>  p.Restricted);

  const groups = new Map();
  for (const p of filtered) {
    if (!groups.has(p.Name)) groups.set(p.Name, []);
    groups.get(p.Name).push(p);
  }

  const sortedGroupsMap = sortedGroups(groups);

  const profileSelectHTML = (onchangeFn, selectedName = '') => configs.length ? `
    <select class="profile-select" onchange="${onchangeFn}">
      <option value="">Perfil...</option>
      ${configs.map(c => `<option value="${c.mask}"${c.name === selectedName ? ' selected' : ''}>${c.name}</option>`).join('')}
    </select>` : '';

  let html = '';

  for (const [name, procs] of sortedGroupsMap) {
    const open     = expandedGroups.has(name);
    const grpSel   = selectedGroup?.name === name;
    const esc      = name.replace(/'/g, "\\'");
    const freePids = procs.filter(p => !p.Restricted).map(p => p.PID);
    const editorId = groupEditorId(name);

    const groupCPU = procs.reduce((s, p) => s + (p.CPU || 0), 0);
    const groupCPUClass = groupCPU >= 20 ? 'cpu-high' : groupCPU >= 5 ? 'cpu-mid' : 'cpu-low';

    html += `
      <tr class="group-row ${grpSel?'group-selected':''}" onclick="toggleGroup('${esc}')">
        <td colspan="3">
          <span class="chevron ${open?'open':''}">▶</span>
          <span class="group-name">${name}</span>
          <span class="group-count">${procs.length}</span>
        </td>
        <td class="cpu ${groupCPUClass}">${groupCPU.toFixed(3)}%</td>
        <td onclick="event.stopPropagation()">
          ${freePids.length ? `<div class="row-actions">
            ${profileSelectHTML(`applyProfileToGroup(this,'${esc}',[${freePids}])`, assignments[name])}
            <button class="affinity-btn" onclick="openGroupAffinity('${esc}',[${freePids}])">${grpSel?'Cerrar':'Affinity'}</button>
          </div>` : ''}
        </td>
      </tr>`;

    if (open && grpSel) {
      html += buildEditorRow(
        editorId, selectedGroup, 'toggleGroupCore',
        `selectedGroup.mask=allCoresMask();syncEditorDOM('${editorId}',selectedGroup)`,
        `selectedGroup.mask=1n;syncEditorDOM('${editorId}',selectedGroup)`,
        `saveGroupAffinity([${freePids}])`,
        'group-editor-row'
      );
    }

    if (open) {
      for (const p of sortedProcs(procs)) {
        const isSel  = selected?.pid === p.PID;
        const procId = `editor-${p.PID}`;
        const cpuClass = p.CPU >= 20 ? 'cpu-high' : p.CPU >= 5 ? 'cpu-mid' : 'cpu-low';
        html += `
          <tr class="child-row ${isSel?'selected':''} ${p.Restricted?'restricted':''}">
            <td class="pid">${p.PID}</td>
            <td class="name">${p.Name}</td>
            <td class="ppid">${p.PPID}</td>
            <td class="cpu ${cpuClass}">${p.CPU.toFixed(3)}%</td>
            <td><div class="row-actions">
              ${p.Restricted
                ? `${configs.length ? `<select class="profile-select" disabled><option>Perfil...</option></select>` : ''}
                   <button class="affinity-btn" disabled>Affinity</button>`
                : `${profileSelectHTML(`applyProfileToProcess(this,${p.PID})`, assignments[p.Name])}
                   <button class="affinity-btn" onclick="openAffinity(${p.PID})">${isSel?'Cerrar':'Affinity'}</button>`
              }
            </div></td>
          </tr>`;

        if (isSel) {
          html += buildEditorRow(
            procId, selected, 'toggleCore',
            `selected.mask=allCoresMask();syncEditorDOM('${procId}',selected)`,
            `selected.mask=1n;syncEditorDOM('${procId}',selected)`,
            'saveAffinity()'
          );
        }
      }
    }
  }

  tbody.innerHTML = html;

  Object.entries(savedInputs).forEach(([id, val]) => {
    const inp = document.getElementById(id);
    if (inp) inp.value = val;
  });

  countEl.textContent = `${filtered.length} procesos · ${groups.size} grupos`;
  updEl.textContent   = 'Actualizado ' + new Date().toLocaleTimeString();
}

// ── websocket ────────────────────────────────────────────────────
function connect() {
  setStatus('connecting', 'Conectando...');
  const ws = new WebSocket('ws://localhost:8080/ws/processes');
  ws.onopen    = () => setStatus('connected', 'En vivo');
  ws.onmessage = e => { processes = JSON.parse(e.data); if (!selectOpen) render(); };
  ws.onclose   = () => { setStatus('error', 'Desconectado — reintentando...'); setTimeout(connect, 2000); };
  ws.onerror   = () => ws.close();
}

// ── init ─────────────────────────────────────────────────────────
filter.addEventListener('input', render);
tbody.addEventListener('focusin',  e => { if (e.target.classList.contains('profile-select')) selectOpen = true; });
tbody.addEventListener('focusout', e => { if (e.target.classList.contains('profile-select')) { selectOpen = false; render(); } });
renderNewProfileCores();
(async () => {
  const old = localStorage.getItem('affinity-configs');
  if (old) {
    try {
      const cfgs = JSON.parse(old);
      for (const c of cfgs) {
        await fetch(`${API}/profiles`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(c)
        });
      }
      localStorage.removeItem('affinity-configs');
    } catch {}
  }
  try {
    const sys = await fetch(`${API}/system`);
    const { cores } = await sys.json();
    NUM_CORES = cores;
  } catch {}
  await Promise.all([refreshConfigs(), refreshAssignments()]);
  connect();
})();
