/* SafePath admin dashboard - plain JS, no build step.
   All authorisation is enforced by the backend (/api/admin/** needs role=admin AND
   a @safepath.com email); the checks here are only for a friendlier UI. */
(() => {
  'use strict';

  const TOKEN_KEY = 'safepath_admin_token';
  const STAFF_DOMAIN = '@safepath.com';
  const STATUS = { pending: 'Pending', in_progress: 'In progress', resolved: 'Resolved', rejected: 'Rejected' };
  const STATUS_COLOR = { pending: '#d9930d', in_progress: '#2d8cff', resolved: '#16a36a', rejected: '#8a94a6' };
  const PRIO_COLOR = { low: '#8a94a6', medium: '#d4a800', high: '#ee7a1a', critical: '#e5392b' };
  const PRIORITIES = ['low', 'medium', 'high', 'critical'];

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------------------------------------------------------------- state
  const S = {
    token: null, me: null, staff: [], zones: [],
    filters: { status: 'active', priority: '', assignee: '', zone: '', q: '', from: '', to: '', sort: 'created', dir: 'desc', page: 0, size: 25 },
    selected: new Set(), pageData: null, openId: null, maps: [], mapFocus: null, refreshTimer: null,
  };

  const store = {
    get() { try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; } },
    set(v) { try { v ? sessionStorage.setItem(TOKEN_KEY, v) : sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } },
  };

  // ---------------------------------------------------------------- helpers
  function toast(msg, isError) {
    const el = document.createElement('div');
    el.className = 'toast' + (isError ? ' error' : '');
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), isError ? 6000 : 3200);
  }

  async function api(path, { method = 'GET', body, raw = false } = {}) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (S.token) headers.Authorization = 'Bearer ' + S.token;
    let res;
    try {
      res = await fetch('/api' + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    } catch {
      throw new Error('Cannot reach the server');
    }
    if (res.status === 401 && path !== '/auth/login') {
      logout('Your session has expired. Please sign in again.');
      throw new Error('Session expired');
    }
    if (!res.ok) {
      let msg = res.status === 403 ? 'You do not have permission to do that' : 'Request failed (' + res.status + ')';
      try { const j = await res.json(); msg = j.message || j.error || msg; } catch { /* no body */ }
      throw new Error(msg);
    }
    if (res.status === 204) return null;
    return raw ? res : res.json();
  }

  const qs = (obj) => {
    const p = new URLSearchParams();
    Object.entries(obj).forEach(([k, v]) => { if (v !== '' && v != null) p.set(k, v); });
    return p.toString();
  };

  const parseDate = (iso) => (iso ? new Date(iso) : null);
  const fmtDateTime = (iso) => {
    const d = parseDate(iso);
    return d && !isNaN(d) ? d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
  };
  const fmtDate = (iso) => {
    const d = parseDate(iso);
    return d && !isNaN(d) ? d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '-';
  };
  function rel(iso) {
    const d = parseDate(iso);
    if (!d || isNaN(d)) return '-';
    const mins = Math.round((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    if (mins < 60 * 24) return Math.round(mins / 60) + 'h ago';
    return Math.round(mins / 1440) + 'd ago';
  }
  const fmtAge = (h) => (h < 1 ? '<1h' : h < 48 ? Math.round(h) + 'h' : Math.round(h / 24) + 'd');
  const fmtHours = (h) => (h == null ? '-' : h < 48 ? h.toFixed(1) + ' h' : (h / 24).toFixed(1) + ' d');
  const pct = (v) => (v == null ? '-' : (v * 100).toFixed(0) + '%');
  const chip = (s) => `<span class="chip ${esc(s)}">${esc(STATUS[s] || s)}</span>`;
  const prio = (p) => `<span class="prio ${esc(p)}">${esc(p ? p[0].toUpperCase() + p.slice(1) : '-')}</span>`;
  const isOpen = (s) => s === 'pending' || s === 'in_progress';

  function askDialog({ title, text = '', input = false, required = false, placeholder = '', okLabel = 'OK', danger = false, value = '' }) {
    return new Promise((resolve) => {
      const dlg = $('#dialog');
      $('#dialog-title').textContent = title;
      $('#dialog-text').textContent = text;
      const ta = $('#dialog-input');
      ta.hidden = !input; ta.value = value; ta.placeholder = placeholder;
      const err = $('#dialog-error'); err.hidden = true;
      const ok = $('#dialog-ok'); ok.textContent = okLabel; ok.className = 'btn ' + (danger ? 'danger' : 'primary');
      let done = false;
      const finish = (v) => { if (done) return; done = true; cleanup(); if (dlg.open) dlg.close(); resolve(v); };
      const onSubmit = (e) => {
        e.preventDefault();
        if (input && required && !ta.value.trim()) { err.textContent = 'This field is required'; err.hidden = false; ta.focus(); return; }
        finish(input ? ta.value.trim() : true);
      };
      const onCancel = () => finish(null);
      const cleanup = () => { $('#dialog-form').removeEventListener('submit', onSubmit); $('#dialog-cancel').removeEventListener('click', onCancel); dlg.removeEventListener('cancel', onCancel); };
      $('#dialog-form').addEventListener('submit', onSubmit);
      $('#dialog-cancel').addEventListener('click', onCancel);
      dlg.addEventListener('cancel', onCancel);
      dlg.showModal();
      if (input) ta.focus();
    });
  }

  function destroyMaps() { S.maps.forEach((m) => { try { m.remove(); } catch { /* ignore */ } }); S.maps = []; }
  function newMap(el, center, zoom) {
    if (!window.L) { el.innerHTML = '<div class="empty">Map library failed to load</div>'; return null; }
    const m = L.map(el, { scrollWheelZoom: true }).setView(center, zoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(m);
    S.maps.push(m);
    return m;
  }

  // ---------------------------------------------------------------- auth
  function showLogin(message) {
    $('#app').hidden = true; $('#login-screen').hidden = false;
    const err = $('#login-error');
    if (message) { err.textContent = message; err.hidden = false; } else err.hidden = true;
  }

  function logout(message) {
    S.token = null; S.me = null; store.set(null);
    clearInterval(S.refreshTimer);
    closeDrawer(true); destroyMaps();
    showLogin(message);
  }

  async function onLogin(e) {
    e.preventDefault();
    const email = $('#login-email').value.trim();
    const password = $('#login-password').value;
    const err = $('#login-error'); err.hidden = true;
    const btn = $('#login-form button[type=submit]'); btn.disabled = true;
    try {
      const data = await api('/auth/login', { method: 'POST', body: { email, password } });
      if (data.role !== 'admin' || !String(data.email || '').toLowerCase().endsWith(STAFF_DOMAIN)) {
        throw new Error('This account does not have admin access.');
      }
      S.token = data.token; store.set(data.token);
      await boot();
    } catch (ex) {
      S.token = null; store.set(null);
      err.textContent = ex.message; err.className = 'form-error'; err.hidden = false;
    } finally { btn.disabled = false; $('#login-password').value = ''; }
  }

  async function boot() {
    try {
      S.me = await api('/admin/me');
    } catch (ex) {
      if (S.token) logout('Admin access required. Please sign in with your @safepath.com account.');
      return;
    }
    $('#login-screen').hidden = true; $('#app').hidden = false;
    $('#me-box').innerHTML = `<b>${esc(S.me.name)}</b><span class="muted">${esc(S.me.email)}</span>`;
    await Promise.all([loadStaff(), loadZones()]).catch(() => {});
    window.addEventListener('hashchange', route);
    route();
    clearInterval(S.refreshTimer);
    S.refreshTimer = setInterval(() => { refreshCounts(); if (currentView() === 'overview') renderOverview(true); }, 60000);
  }

  const loadStaff = async () => { S.staff = await api('/admin/staff'); };
  const loadZones = async () => { S.zones = await api('/admin/zones'); };
  async function refreshCounts() {
    try {
      const r = await api('/admin/reports?' + qs({ status: 'active', size: 1 }));
      $('#nav-active').textContent = r.total || '';
      $('#last-updated').textContent = 'Updated ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch { /* ignore */ }
  }

  // ---------------------------------------------------------------- routing
  const currentView = () => (location.hash.replace(/^#\/?/, '').split(/[/?]/)[0] || 'overview');

  function route() {
    if (!S.me) return;
    const parts = location.hash.replace(/^#\/?/, '').split('/');
    const view = parts[0] || 'overview';
    const titles = { overview: 'Overview', reports: 'Reports', map: 'Map', areas: 'Areas', team: 'Team' };
    const v = titles[view] ? view : 'overview';
    $('#page-title').textContent = titles[v];
    $$('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.view === v));
    destroyMaps();
    refreshCounts();
    ({ overview: renderOverview, reports: renderReports, map: renderMap, areas: renderAreas, team: renderTeam }[v])();
    if (v === 'reports' && parts[1]) openReport(parts[1]); else if (S.openId && v !== 'reports') closeDrawer(true);
  }

  const go = (hash) => { if (location.hash === hash) route(); else location.hash = hash; };

  // ---------------------------------------------------------------- overview
  async function renderOverview(silent) {
    const view = $('#view');
    if (!silent) view.innerHTML = '<div class="empty">Loading…</div>';
    let st;
    try { st = await api('/admin/stats'); } catch (ex) { if (!silent) view.innerHTML = `<div class="empty">${esc(ex.message)}</div>`; return; }
    if (currentView() !== 'overview') return;
    const active = (st.byStatus.pending || 0) + (st.byStatus.in_progress || 0);

    const kpi = (label, value, sub, extra = '', attr = '') =>
      `<div class="card kpi ${extra}" ${attr}><div class="label">${label}</div><div class="value">${value}</div><div class="sub">${sub || ''}</div></div>`;

    view.innerHTML = `
      <div class="grid kpis">
        ${kpi('Active', active, `${st.byStatus.pending || 0} pending · ${st.byStatus.in_progress || 0} in progress`, 'link', 'data-go="#/reports"')}
        ${kpi('Unassigned', st.unassignedActive, 'active, nobody on it', st.unassignedActive ? 'alert link' : 'link', 'data-go="#/reports" data-filter="unassigned"')}
        ${kpi('Overdue', st.overdueActive, 'open for more than 7 days', st.overdueActive ? 'alert' : '')}
        ${kpi('Resolved', st.byStatus.resolved || 0, `${st.byStatus.rejected || 0} rejected`)}
        ${kpi('Avg. time to resolve', fmtHours(st.avgResolutionHours), 'from report to resolved')}
        ${kpi('All reports', st.total, 'ever submitted')}
      </div>

      <div class="grid two">
        <div class="card"><div class="card-head"><h2>Last 30 days</h2></div>${trendChart(st.daily)}</div>
        <div class="card"><div class="card-head"><h2>Active reports by priority</h2></div>${priorityBlock(st.activeByPriority)}</div>
      </div>

      <div class="card">
        <div class="card-head"><h2>Needs attention</h2><span class="muted small">critical, overdue, or high priority and unassigned</span></div>
        ${st.needsAttention.length ? attentionTable(st.needsAttention) : '<div class="empty">Nothing urgent right now.</div>'}
      </div>

      <div class="grid two">
        <div class="card"><div class="card-head"><h2>Top hotspots</h2><a href="#/areas">All areas</a></div>${hotspotRows(st.topHotspots)}</div>
        <div class="card"><div class="card-head"><h2>Tracked zones</h2><a href="#/areas">Manage</a></div>${zoneRows(st.topZones)}</div>
      </div>

      <div class="card"><div class="card-head"><h2>Recent activity</h2></div>${activityFeed(st.recentActivity)}</div>`;

    $$('[data-go]', view).forEach((el) => el.addEventListener('click', () => {
      if (el.dataset.filter === 'unassigned') Object.assign(S.filters, { status: 'active', assignee: 'unassigned', page: 0 });
      else Object.assign(S.filters, { status: 'active', assignee: '', page: 0 });
      go(el.dataset.go);
    }));
    $$('[data-open]', view).forEach((el) => el.addEventListener('click', () => go('#/reports/' + el.dataset.open)));
    $$('[data-map]', view).forEach((el) => el.addEventListener('click', () => { S.mapFocus = { lat: +el.dataset.lat, lon: +el.dataset.lon }; go('#/map'); }));
    $$('[data-zone]', view).forEach((el) => el.addEventListener('click', () => { Object.assign(S.filters, { status: 'active', zone: el.dataset.zone, assignee: '', page: 0 }); go('#/reports'); }));
  }

  function trendChart(daily) {
    const W = 600, H = 170, pad = 22, n = daily.length || 1;
    const max = Math.max(1, ...daily.map((d) => Math.max(d.created, d.resolved)));
    const step = (W - 10) / n, bw = Math.max(3, step / 2 - 1.5);
    const y = (v) => H - pad - (v / max) * (H - pad - 8);
    const bars = daily.map((d, i) => {
      const x = 5 + i * step;
      return `<g><title>${esc(fmtDate(d.date))}: ${d.created} new, ${d.resolved} resolved</title>
        <rect x="${x.toFixed(1)}" y="${y(d.created)}" width="${bw.toFixed(1)}" height="${(H - pad - y(d.created)).toFixed(1)}" rx="1.5" fill="#2d8cff"/>
        <rect x="${(x + bw + 1).toFixed(1)}" y="${y(d.resolved)}" width="${bw.toFixed(1)}" height="${(H - pad - y(d.resolved)).toFixed(1)}" rx="1.5" fill="#16a36a"/></g>`;
    }).join('');
    const label = (i, anchor) => daily[i] ? `<text x="${5 + i * step}" y="${H - 6}" font-size="10" fill="currentColor" opacity=".6" text-anchor="${anchor}">${esc(fmtDate(daily[i].date))}</text>` : '';
    return `<svg class="bars" viewBox="0 0 ${W} ${H}" role="img" aria-label="Reports created and resolved per day">
      <line x1="0" x2="${W}" y1="${H - pad}" y2="${H - pad}" stroke="currentColor" opacity=".2"/>
      <text x="0" y="10" font-size="10" fill="currentColor" opacity=".6">${max}</text>
      ${bars}${label(0, 'start')}${label(Math.floor(n / 2), 'middle')}${label(n - 1, 'end')}</svg>
      <div class="legend"><span><i style="background:#2d8cff"></i>New</span><span><i style="background:#16a36a"></i>Resolved</span></div>`;
  }

  function priorityBlock(map) {
    const total = PRIORITIES.reduce((a, p) => a + (map[p] || 0), 0);
    if (!total) return '<div class="empty">No active reports.</div>';
    const seg = PRIORITIES.slice().reverse().map((p) => map[p] ? `<span title="${p}: ${map[p]}" style="width:${(map[p] / total) * 100}%;background:${PRIO_COLOR[p]}"></span>` : '').join('');
    const rows = PRIORITIES.slice().reverse().map((p) =>
      `<div class="row"><span><span class="dot" style="background:${PRIO_COLOR[p]}"></span>${p[0].toUpperCase() + p.slice(1)}</span><b>${map[p] || 0}</b></div>`).join('');
    return `<div class="stackbar">${seg}</div><div class="rows">${rows}</div>`;
  }

  function attentionTable(items) {
    return `<div class="table-wrap" style="box-shadow:none"><table><thead><tr><th>Report</th><th>Priority</th><th>Status</th><th>Area</th><th>Assignee</th><th>Age</th></tr></thead><tbody>
      ${items.map((r) => `<tr class="clickable" data-open="${esc(r.id)}">
        <td class="title"><b>${esc(r.name)}</b><span>${esc(r.description)}</span></td>
        <td>${prio(r.priority)}</td><td>${chip(r.status)}</td><td>${esc(r.zoneName || '-')}</td>
        <td>${esc(r.assignedToName || 'Unassigned')}</td>
        <td class="nowrap">${fmtAge(r.ageHours)}${r.overdue ? '<span class="tag-overdue">OVERDUE</span>' : ''}</td></tr>`).join('')}
      </tbody></table></div>`;
  }

  function hotspotRows(list) {
    if (!list.length) return '<div class="empty">No open reports.</div>';
    return `<div class="rows">${list.map((h) => `<div class="row link" data-map data-lat="${h.latitude}" data-lon="${h.longitude}">
      <span><b>${h.active} open</b> · ${h.total} total${h.criticalActive ? ` · <span class="prio critical">${h.criticalActive} critical</span>` : ''}<br>
      <span class="muted small">${esc(h.zoneName || h.label)} · oldest ${fmtAge(h.oldestActiveAgeHours)}</span></span><span class="muted">Map ›</span></div>`).join('')}</div>`;
  }

  function zoneRows(list) {
    if (!list.length) return '<div class="empty">No zones yet. Create one on the <a href="#/areas">Areas</a> page.</div>';
    return `<div class="rows">${list.map((z) => `<div class="row link" data-zone="${esc(z.id)}">
      <span><b>${esc(z.name)}</b><br><span class="muted small">${z.resolved} resolved · ${z.total} total</span></span>
      <span><b>${z.active}</b> <span class="muted small">open</span></span></div>`).join('')}</div>`;
  }

  function activityText(a) {
    const who = esc(a.byName || 'Someone');
    switch (a.action) {
      case 'submitted': return `${who} submitted a report`;
      case 'status_changed': return `${who} set it to <b>${esc(STATUS[a.toStatus] || a.toStatus)}</b>`;
      case 'assigned': return `${who}: ${esc(a.note || 'assigned')}`;
      case 'unassigned': return `${who} unassigned it`;
      case 'priority_changed': return `${who} changed priority (${esc(a.note || '')})`;
      case 'note': return `${who} added a note`;
      default: return `${who}: ${esc(a.action)}`;
    }
  }

  function activityFeed(list) {
    if (!list.length) return '<div class="empty">No activity yet.</div>';
    return `<div class="feed">${list.map((a) => `<div class="feed-item" data-open="${esc(a.reportId)}">
      <div><b>${esc(a.reportName || 'Report')}</b> <span class="muted small">${esc(rel(a.at))}</span></div>
      <div>${activityText(a)}</div>${a.note && a.action !== 'assigned' && a.action !== 'priority_changed' ? `<div class="muted small">“${esc(a.note)}”</div>` : ''}</div>`).join('')}</div>`;
  }

  // ---------------------------------------------------------------- reports
  const selectOptions = (items, selected, firstLabel) =>
    `<option value="">${firstLabel}</option>` + items.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(selected) ? 'selected' : ''}>${esc(l)}</option>`).join('');

  async function renderReports() {
    const f = S.filters;
    $('#view').innerHTML = `
      <div class="toolbar">
        <input id="f-q" type="search" placeholder="Search name, description, reporter, phone, area…" value="${esc(f.q)}">
        <select id="f-priority">${selectOptions(PRIORITIES.map((p) => [p, p[0].toUpperCase() + p.slice(1)]), f.priority, 'Any priority')}</select>
        <select id="f-assignee">
          <option value="">Anyone</option>
          <option value="me" ${f.assignee === 'me' ? 'selected' : ''}>Assigned to me</option>
          <option value="unassigned" ${f.assignee === 'unassigned' ? 'selected' : ''}>Unassigned</option>
          ${S.staff.filter((s) => s.id !== S.me.id).map((s) => `<option value="${esc(s.id)}" ${f.assignee === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
        </select>
        <select id="f-zone">
          <option value="">Any area</option>
          ${S.zones.map((z) => `<option value="${esc(z.id)}" ${f.zone === z.id ? 'selected' : ''}>${esc(z.name)}</option>`).join('')}
          <option value="none" ${f.zone === 'none' ? 'selected' : ''}>Outside all zones</option>
        </select>
        <label class="small" style="display:flex;align-items:center;gap:6px;font-weight:600">From <input id="f-from" type="date" value="${esc(f.from)}"></label>
        <label class="small" style="display:flex;align-items:center;gap:6px;font-weight:600">To <input id="f-to" type="date" value="${esc(f.to)}"></label>
        <select id="f-sort">
          ${[['created|desc', 'Newest first'], ['created|asc', 'Oldest first'], ['priority|desc', 'Highest priority'], ['confidence|desc', 'Highest confidence'], ['age|desc', 'Longest open']]
            .map(([v, l]) => `<option value="${v}" ${v === f.sort + '|' + f.dir ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
        <button id="f-reset" class="btn">Reset</button>
        <button id="f-export" class="btn">Export CSV</button>
      </div>
      <div id="status-tabs" class="tabs"></div>
      <div id="bulkbar" class="bulkbar" hidden></div>
      <div id="report-table"><div class="empty">Loading…</div></div>
      <div id="pager" class="pager"></div>`;

    const reload = () => { f.page = 0; loadReports(); };
    let t;
    $('#f-q').addEventListener('input', (e) => { f.q = e.target.value; clearTimeout(t); t = setTimeout(reload, 300); });
    [['f-priority', 'priority'], ['f-assignee', 'assignee'], ['f-zone', 'zone'], ['f-from', 'from'], ['f-to', 'to']].forEach(([id, key]) =>
      $('#' + id).addEventListener('change', (e) => { f[key] = e.target.value; reload(); }));
    $('#f-sort').addEventListener('change', (e) => { [f.sort, f.dir] = e.target.value.split('|'); reload(); });
    $('#f-reset').addEventListener('click', () => { Object.assign(f, { status: 'active', priority: '', assignee: '', zone: '', q: '', from: '', to: '', sort: 'created', dir: 'desc', page: 0 }); renderReports(); });
    $('#f-export').addEventListener('click', exportCsv);
    await loadReports();
  }

  async function loadReports() {
    const f = S.filters;
    try {
      S.pageData = await api('/admin/reports?' + qs({ status: f.status === 'all' ? '' : f.status, priority: f.priority, assignee: f.assignee, zone: f.zone, q: f.q, from: f.from, to: f.to, sort: f.sort, dir: f.dir, page: f.page, size: f.size }));
    } catch (ex) { $('#report-table').innerHTML = `<div class="empty">${esc(ex.message)}</div>`; return; }
    if (currentView() !== 'reports') return;
    paintTabs(); paintTable(); paintBulk();
  }

  function paintTabs() {
    const c = S.pageData.statusCounts, all = Object.values(c).reduce((a, b) => a + b, 0);
    const tabs = [['active', 'Active', (c.pending || 0) + (c.in_progress || 0)], ['pending', 'Pending', c.pending || 0], ['in_progress', 'In progress', c.in_progress || 0], ['resolved', 'Resolved', c.resolved || 0], ['rejected', 'Rejected', c.rejected || 0], ['all', 'All', all]];
    $('#status-tabs').innerHTML = tabs.map(([k, l, n]) => `<button class="tab ${S.filters.status === k ? 'active' : ''}" data-status="${k}">${l}<span class="n">${n}</span></button>`).join('');
    $$('#status-tabs .tab').forEach((b) => b.addEventListener('click', () => { S.filters.status = b.dataset.status; S.filters.page = 0; S.selected.clear(); loadReports(); }));
  }

  function paintTable() {
    const { items, total, page, size } = S.pageData;
    if (!items.length) { $('#report-table').innerHTML = '<div class="table-wrap"><div class="empty">No reports match these filters.</div></div>'; $('#pager').innerHTML = ''; return; }
    const allChecked = items.every((r) => S.selected.has(r.id));
    $('#report-table').innerHTML = `<div class="table-wrap"><table><thead><tr>
      <th style="width:34px"><input type="checkbox" id="chk-all" ${allChecked ? 'checked' : ''} aria-label="Select all on this page"></th>
      <th></th><th>Report</th><th>Reporter</th><th>Priority</th><th>Status</th><th>Area</th><th>Detections</th><th>Assignee</th><th>Age</th></tr></thead><tbody>
      ${items.map((r) => `<tr class="clickable" data-id="${esc(r.id)}">
        <td><input type="checkbox" class="chk" data-id="${esc(r.id)}" ${S.selected.has(r.id) ? 'checked' : ''} aria-label="Select report"></td>
        <td>${r.photo ? `<img class="thumb" loading="lazy" src="${esc(r.photo)}" alt="">` : '<div class="thumb"></div>'}</td>
        <td class="title"><b>${esc(r.name)}</b><span>${esc(r.description)}</span></td>
        <td>${esc(r.reporterName)}${r.reporterPhone ? `<div class="muted" style="font-size:12px">${esc(r.reporterPhone)}</div>` : ''}</td><td>${prio(r.priority)}</td><td>${chip(r.status)}</td>
        <td>${esc(r.zoneName || '-')}</td>
        <td class="nowrap">${r.detectionCount ?? 0}× · ${pct(r.maxConfidence)}</td>
        <td>${esc(r.assignedToName || '-')}</td>
        <td class="nowrap">${fmtAge(r.ageHours)}${r.overdue ? '<span class="tag-overdue">OVERDUE</span>' : ''}</td></tr>`).join('')}
      </tbody></table></div>`;

    $$('#report-table tbody tr').forEach((tr) => tr.addEventListener('click', (e) => {
      if (e.target.closest('input')) return;
      go('#/reports/' + tr.dataset.id);
    }));
    $$('#report-table .chk').forEach((c) => c.addEventListener('change', () => { c.checked ? S.selected.add(c.dataset.id) : S.selected.delete(c.dataset.id); paintBulk(); $('#chk-all').checked = items.every((r) => S.selected.has(r.id)); }));
    $('#chk-all').addEventListener('change', (e) => { items.forEach((r) => (e.target.checked ? S.selected.add(r.id) : S.selected.delete(r.id))); $$('#report-table .chk').forEach((c) => (c.checked = e.target.checked)); paintBulk(); });

    const pages = Math.max(1, Math.ceil(total / size));
    $('#pager').innerHTML = `<span class="muted">${total} report${total === 1 ? '' : 's'}</span>
      <button class="btn sm" id="pg-prev" ${page <= 0 ? 'disabled' : ''}>‹ Prev</button><span>Page ${page + 1} of ${pages}</span>
      <button class="btn sm" id="pg-next" ${page + 1 >= pages ? 'disabled' : ''}>Next ›</button>`;
    $('#pg-prev').addEventListener('click', () => { S.filters.page--; loadReports(); });
    $('#pg-next').addEventListener('click', () => { S.filters.page++; loadReports(); });
  }

  function paintBulk() {
    const bar = $('#bulkbar'); if (!bar) return;
    const n = S.selected.size;
    bar.hidden = n === 0;
    if (!n) return;
    bar.innerHTML = `<b>${n} selected</b>
      <button class="btn sm" data-bulk="assign">Assign to me</button>
      <button class="btn sm" data-bulk="in_progress">Mark in progress</button>
      <button class="btn sm" data-bulk="resolved">Resolve…</button>
      <button class="btn sm danger" data-bulk="rejected">Reject…</button>
      <button class="btn sm ghost" data-bulk="clear">Clear</button>`;
    $$('[data-bulk]', bar).forEach((b) => b.addEventListener('click', () => bulkAction(b.dataset.bulk)));
  }

  async function bulkAction(action) {
    if (action === 'clear') { S.selected.clear(); paintTable(); paintBulk(); return; }
    let note = '';
    if (action === 'resolved') { note = await askDialog({ title: 'Resolve selected reports', text: 'Optional note shown to the reporters (e.g. “Repaired on 14 Oct”).', input: true, okLabel: 'Resolve' }); if (note === null) return; }
    if (action === 'rejected') { note = await askDialog({ title: 'Reject selected reports', text: 'Reporters will see this reason.', input: true, required: true, okLabel: 'Reject', danger: true }); if (note === null) return; }
    try {
      const r = await api('/admin/reports/bulk', { method: 'POST', body: { ids: Array.from(S.selected), action, note, assigneeId: action === 'assign' ? S.me.id : null } });
      const failed = Object.keys(r.failed).length;
      toast(`Updated ${r.updated} report${r.updated === 1 ? '' : 's'}` + (failed ? `, ${failed} skipped: ${Object.values(r.failed)[0]}` : ''), failed > 0 && r.updated === 0);
      S.selected.clear();
      await Promise.all([loadReports(), refreshCounts(), loadStaff()]);
    } catch (ex) { toast(ex.message, true); }
  }

  async function exportCsv() {
    const f = S.filters;
    try {
      const res = await api('/admin/reports/export?' + qs({ status: f.status === 'all' ? '' : f.status, priority: f.priority, assignee: f.assignee, zone: f.zone, q: f.q, from: f.from, to: f.to }), { raw: true });
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'safepath-reports-' + new Date().toISOString().slice(0, 10) + '.csv';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (ex) { toast(ex.message, true); }
  }

  // ---------------------------------------------------------------- drawer
  function closeDrawer(silent) {
    S.openId = null;
    $('#drawer').hidden = true; $('#drawer-backdrop').hidden = true;
    S.maps = S.maps.filter((m) => { if (m._isDrawer) { try { m.remove(); } catch { /* ignore */ } return false; } return true; });
    if (!silent && currentView() === 'reports' && location.hash !== '#/reports') history.replaceState(null, '', '#/reports');
  }

  async function openReport(id) {
    S.openId = id;
    const d = $('#drawer');
    d.hidden = false; $('#drawer-backdrop').hidden = false;
    d.innerHTML = '<div class="empty">Loading…</div>';
    try { paintDrawer(await api('/admin/reports/' + encodeURIComponent(id))); }
    catch (ex) { d.innerHTML = `<div class="drawer-head"><h2>Report</h2><button class="btn sm" id="dr-close">Close</button></div><div class="empty">${esc(ex.message)}</div>`; $('#dr-close').addEventListener('click', () => closeDrawer()); }
  }

  function eventText(e) {
    switch (e.action) {
      case 'submitted': return 'Report submitted';
      case 'status_changed': return `${esc(STATUS[e.fromStatus] || e.fromStatus)} → <b>${esc(STATUS[e.toStatus] || e.toStatus)}</b>`;
      case 'assigned': return esc(e.note || 'Assigned');
      case 'unassigned': return 'Unassigned';
      case 'priority_changed': return `Priority ${esc(e.note || '')}`;
      case 'note': return 'Internal note';
      default: return esc(e.action);
    }
  }

  function paintDrawer(r) {
    const d = $('#drawer');
    const hist = (r.history || []).slice().reverse();
    const loc = r.location || {};
    const gmaps = `https://www.google.com/maps?q=${loc.latitude},${loc.longitude}`;
    const meAssigned = r.assignedToId === S.me.id;

    const actions = {
      pending: `<button class="btn primary" data-act="take">${meAssigned ? 'Start work' : 'Take it & start'}</button><button class="btn" data-act="resolve">Mark resolved</button><button class="btn danger" data-act="reject">Reject</button>`,
      in_progress: `<button class="btn primary" data-act="resolve">Mark resolved</button><button class="btn danger" data-act="reject">Reject</button><button class="btn" data-act="pending">Back to pending</button>`,
      resolved: `<button class="btn" data-act="reopen">Reopen</button>`,
      rejected: `<button class="btn" data-act="pending">Reopen as pending</button>`,
    }[r.status] || '';

    d.innerHTML = `
      <div class="drawer-head">
        <div><h2 style="font-size:18px">${esc(r.name)}</h2>
          <div style="margin-top:6px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">${chip(r.status)} ${prio(r.priority)} ${r.overdue ? '<span class="tag-overdue">OVERDUE</span>' : ''}<span class="muted small mono">#${esc(r.id)}</span></div></div>
        <button class="btn sm" id="dr-close" aria-label="Close">Close ✕</button>
      </div>
      ${r.photo ? `<a href="${esc(r.photo)}" target="_blank" rel="noopener"><img class="drawer-photo" src="${esc(r.photo)}" alt="Photo of the pothole"></a>` : ''}
      <p style="margin:0;overflow-wrap:anywhere">${esc(r.description) || '<span class="muted">No description</span>'}</p>
      ${r.status === 'resolved' && r.resolutionNote ? `<div class="warn-box" style="background:var(--s-resolved-bg);color:var(--s-resolved)"><b>Resolution:</b> ${esc(r.resolutionNote)}</div>` : ''}
      ${r.status === 'rejected' && r.rejectionReason ? `<div class="warn-box" style="background:var(--s-rejected-bg);color:var(--s-rejected)"><b>Rejected:</b> ${esc(r.rejectionReason)}</div>` : ''}
      ${r.nearby && r.nearby.length ? `<div class="warn-box">Possible duplicate: ${r.nearby.map((n) => `<a data-nearby="${esc(n.id)}">${esc(n.name)}</a> (${esc(STATUS[n.status] || n.status)}, ${n.distanceMeters} m)`).join(', ')}</div>` : ''}

      <div class="actions">${actions}</div>

      <div class="card" style="box-shadow:none">
        <dl class="kv">
          <dt>Priority</dt><dd><select id="dr-priority">${PRIORITIES.map((p) => `<option value="${p}" ${p === r.priority ? 'selected' : ''}>${p[0].toUpperCase() + p.slice(1)}</option>`).join('')}</select></dd>
          <dt>Assigned to</dt><dd><select id="dr-assignee"><option value="">Unassigned</option>${S.staff.map((s) => `<option value="${esc(s.id)}" ${s.id === r.assignedToId ? 'selected' : ''}>${esc(s.name)}${s.id === S.me.id ? ' (me)' : ''}</option>`).join('')}</select></dd>
          <dt>Reporter</dt><dd>${esc(r.reporterName)}${r.reporterEmail ? `<br><span class="muted">${esc(r.reporterEmail)}</span>` : ''}${r.reporterPhone ? `<br><a href="tel:${esc(r.reporterPhone)}">${esc(r.reporterPhone)}</a>` : '<br><span class="muted">No phone on file</span>'}</dd>
          <dt>Reported</dt><dd>${esc(fmtDateTime(r.createdAt))} <span class="muted">(${esc(rel(r.createdAt))})</span></dd>
          ${r.resolvedAt ? `<dt>Closed</dt><dd>${esc(fmtDateTime(r.resolvedAt))}${r.resolvedByName ? ' by ' + esc(r.resolvedByName) : ''}</dd>` : ''}
          <dt>Area</dt><dd>${esc(r.zoneName || 'Outside tracked zones')}</dd>
          <dt>Location</dt><dd class="mono">${esc(loc.latitude)}, ${esc(loc.longitude)} · <a href="${esc(gmaps)}" target="_blank" rel="noopener">Google Maps</a></dd>
          <dt>Detection</dt><dd>${r.detectionCount ?? 0} pothole${r.detectionCount === 1 ? '' : 's'} · highest ${pct(r.maxConfidence)} · average ${pct(r.avgConfidence)}</dd>
        </dl>
        ${r.detections && r.detections.length ? `<div class="pill-list" style="margin-top:10px">${r.detections.map((x, i) => `<span class="pill">#${i + 1} ${pct(x.confidenceScore)}</span>`).join('')}</div>` : ''}
      </div>

      <div id="dr-map" class="map-box sm"></div>

      <div>
        <h3 style="margin-bottom:8px">Add internal note</h3>
        <textarea id="dr-note" rows="2" maxlength="1000" placeholder="Visible to staff only"></textarea>
        <div style="margin-top:6px"><button class="btn sm" id="dr-note-btn">Add note</button></div>
      </div>

      <div><h3 style="margin-bottom:10px">Timeline</h3>
        <ul class="timeline">${hist.map((e) => `<li><div><b>${esc(e.byName || 'System')}</b> <span class="muted small" title="${esc(fmtDateTime(e.at))}">${esc(rel(e.at))}</span></div>
          <div>${eventText(e)}</div>${e.note && e.action !== 'assigned' && e.action !== 'priority_changed' ? `<div class="t-note">${esc(e.note)}</div>` : ''}</li>`).join('') || '<li class="muted">No history</li>'}</ul></div>

      <div><button class="btn danger sm" id="dr-delete">Delete report permanently</button></div>`;

    // events
    $('#dr-close').addEventListener('click', () => closeDrawer());
    $$('[data-nearby]', d).forEach((a) => a.addEventListener('click', () => go('#/reports/' + a.dataset.nearby)));
    $$('[data-act]', d).forEach((b) => b.addEventListener('click', () => drawerAction(r, b.dataset.act)));
    $('#dr-priority').addEventListener('change', (e) => mutate(`/admin/reports/${r.id}/priority`, { priority: e.target.value }, 'Priority updated'));
    $('#dr-assignee').addEventListener('change', (e) => mutate(`/admin/reports/${r.id}/assign`, { assigneeId: e.target.value || null }, 'Assignment updated'));
    $('#dr-note-btn').addEventListener('click', () => { const t = $('#dr-note').value.trim(); if (t) mutate(`/admin/reports/${r.id}/notes`, { text: t }, 'Note added'); });
    $('#dr-delete').addEventListener('click', async () => {
      const ok = await askDialog({ title: 'Delete this report?', text: 'This permanently removes the report and its history. Consider rejecting it instead so the reporter gets an explanation.', okLabel: 'Delete', danger: true });
      if (!ok) return;
      try { await api('/admin/reports/' + r.id, { method: 'DELETE' }); toast('Report deleted'); closeDrawer(); afterChange(); } catch (ex) { toast(ex.message, true); }
    });

    // mini map
    if (loc.latitude != null && window.L) {
      const m = newMap($('#dr-map'), [loc.latitude, loc.longitude], 17);
      if (m) {
        m._isDrawer = true;
        L.circleMarker([loc.latitude, loc.longitude], { radius: 9, color: '#fff', weight: 2, fillColor: STATUS_COLOR[r.status], fillOpacity: 1 }).addTo(m);
        setTimeout(() => m.invalidateSize(), 50);
      }
    } else $('#dr-map').remove();
  }

  async function mutate(path, body, okMsg) {
    try {
      const r = await api(path, { method: 'POST', body });
      toast(okMsg);
      S.maps.filter((m) => m._isDrawer).forEach((m) => { try { m.remove(); } catch { /* ignore */ } });
      S.maps = S.maps.filter((m) => !m._isDrawer);
      paintDrawer(r);
      afterChange();
    } catch (ex) { toast(ex.message, true); openReport(S.openId); }
  }

  async function drawerAction(r, act) {
    if (act === 'take') {
      if (r.assignedToId !== S.me.id) await mutate(`/admin/reports/${r.id}/assign`, { assigneeId: S.me.id }, 'Assigned to you · in progress');
      else await mutate(`/admin/reports/${r.id}/status`, { status: 'in_progress' }, 'Marked in progress');
    } else if (act === 'resolve') {
      const note = await askDialog({ title: 'Mark as resolved', text: 'Optional note shown to the person who reported it (e.g. “Filled and levelled on 14 Oct”).', input: true, okLabel: 'Resolve' });
      if (note !== null) await mutate(`/admin/reports/${r.id}/status`, { status: 'resolved', note }, 'Marked resolved');
    } else if (act === 'reject') {
      const note = await askDialog({ title: 'Reject this report', text: 'The reporter will see this reason (e.g. “Duplicate”, “Not a pothole”, “Outside our area”).', input: true, required: true, okLabel: 'Reject', danger: true });
      if (note !== null) await mutate(`/admin/reports/${r.id}/status`, { status: 'rejected', note }, 'Report rejected');
    } else if (act === 'pending') {
      await mutate(`/admin/reports/${r.id}/status`, { status: 'pending' }, 'Moved back to pending');
    } else if (act === 'reopen') {
      const note = await askDialog({ title: 'Reopen this report', text: 'Why is it being reopened?', input: true, okLabel: 'Reopen' });
      if (note !== null) await mutate(`/admin/reports/${r.id}/status`, { status: 'in_progress', note }, 'Report reopened');
    }
  }

  function afterChange() {
    refreshCounts(); loadStaff().catch(() => {});
    if (currentView() === 'reports') loadReports();
    if (currentView() === 'overview') renderOverview(true);
  }

  // ---------------------------------------------------------------- map
  async function fetchAllReports() {
    let page = 0, out = [], total = 0;
    do {
      const r = await api('/admin/reports?' + qs({ status: 'all', size: 200, page, sort: 'created', dir: 'desc' }));
      out = out.concat(r.items); total = r.total; page++;
    } while (out.length < total && page < 50);
    return out;
  }

  async function renderMap() {
    const view = $('#view');
    view.innerHTML = '<div class="empty">Loading map…</div>';
    let reports, zones, hotspots;
    try { [reports, zones, hotspots] = await Promise.all([fetchAllReports(), api('/admin/zones'), api('/admin/hotspots')]); }
    catch (ex) { view.innerHTML = `<div class="empty">${esc(ex.message)}</div>`; return; }
    if (currentView() !== 'map') return;
    S.zones = zones;

    const show = { pending: true, in_progress: true, resolved: false, rejected: false, zones: true, hotspots: true };
    view.innerHTML = `<div class="map-legend">
      ${Object.keys(STATUS).map((k) => `<label><input type="checkbox" data-s="${k}" ${show[k] ? 'checked' : ''}><span class="dot" style="background:${STATUS_COLOR[k]};margin:0"></span>${STATUS[k]}</label>`).join('')}
      <label><input type="checkbox" data-s="zones" checked> Zones</label>
      <label><input type="checkbox" data-s="hotspots" checked> Hotspots</label>
      <span class="muted small" id="map-count"></span></div>
      <div id="big-map" class="map-box"></div>`;

    const pts = reports.filter((r) => r.location && r.location.latitude != null);
    const focus = S.mapFocus; S.mapFocus = null;
    const m = newMap($('#big-map'), focus ? [focus.lat, focus.lon] : [20.59, 78.96], focus ? 17 : 5);
    if (!m) return;
    const markers = L.layerGroup().addTo(m), zoneLayer = L.layerGroup().addTo(m), hotLayer = L.layerGroup().addTo(m);

    const draw = () => {
      markers.clearLayers(); zoneLayer.clearLayers(); hotLayer.clearLayers();
      let n = 0;
      pts.filter((r) => show[r.status]).forEach((r) => {
        n++;
        L.circleMarker([r.location.latitude, r.location.longitude], { radius: 6 + PRIORITIES.indexOf(r.priority) * 1.5, color: PRIO_COLOR[r.priority] || '#888', weight: 2, fillColor: STATUS_COLOR[r.status], fillOpacity: .9 })
          .bindTooltip(`${esc(r.name)}<br>${esc(STATUS[r.status])} · ${esc(r.priority)}`)
          .on('click', () => go('#/reports/' + r.id)).addTo(markers);
      });
      if (show.zones) zones.forEach((z) => L.circle([z.latitude, z.longitude], { radius: z.radiusMeters, color: '#2d8cff', weight: 1.5, fillOpacity: .06 }).bindTooltip(`${esc(z.name)}: ${z.active} open`).addTo(zoneLayer));
      if (show.hotspots) hotspots.filter((h) => h.active >= 2).forEach((h) => L.circle([h.latitude, h.longitude], { radius: 120 + h.active * 40, color: '#e5392b', weight: 1, fillColor: '#e5392b', fillOpacity: .12, interactive: false }).addTo(hotLayer));
      $('#map-count').textContent = n + ' report' + (n === 1 ? '' : 's') + ' shown';
    };
    $$('.map-legend input', view).forEach((c) => c.addEventListener('change', () => { show[c.dataset.s] = c.checked; draw(); }));
    draw();
    if (!focus) {
      const visible = pts.filter((r) => show[r.status]);
      if (visible.length) m.fitBounds(L.latLngBounds(visible.map((r) => [r.location.latitude, r.location.longitude])), { padding: [40, 40], maxZoom: 16 });
    }
  }

  // ---------------------------------------------------------------- areas
  async function renderAreas() {
    const view = $('#view');
    view.innerHTML = '<div class="empty">Loading…</div>';
    let zones, hotspots;
    try { [zones, hotspots] = await Promise.all([api('/admin/zones'), api('/admin/hotspots')]); }
    catch (ex) { view.innerHTML = `<div class="empty">${esc(ex.message)}</div>`; return; }
    if (currentView() !== 'areas') return;
    S.zones = zones;

    view.innerHTML = `
      <div class="card">
        <div class="card-head"><h2>Tracked zones</h2><span class="muted small">Named areas you want to keep an eye on. Reports inside a zone are counted automatically.</span></div>
        ${zones.length ? `<div class="table-wrap" style="box-shadow:none"><table><thead><tr><th>Zone</th><th>Open</th><th>Critical</th><th>Resolved</th><th>Rejected</th><th>Total</th><th>Avg. open age</th><th>Radius</th><th></th></tr></thead><tbody>
          ${zones.map((z) => `<tr><td><b>${esc(z.name)}</b><br><span class="muted small">by ${esc(z.createdByName || '-')}</span></td>
            <td><b>${z.active}</b></td><td>${z.criticalActive ? `<span class="prio critical">${z.criticalActive}</span>` : '0'}</td>
            <td>${z.resolved}</td><td>${z.rejected}</td><td>${z.total}</td><td>${fmtAge(z.avgActiveAgeHours)}</td><td>${Math.round(z.radiusMeters)} m</td>
            <td class="nowrap right"><button class="btn sm" data-zrep="${esc(z.id)}">Reports</button> <button class="btn sm" data-zmap="${esc(z.id)}">Map</button> <button class="btn sm danger" data-zdel="${esc(z.id)}" data-zname="${esc(z.name)}">Delete</button></td></tr>`).join('')}
        </tbody></table></div>` : '<div class="empty">No zones yet - add your first one below.</div>'}
      </div>

      <div class="card">
        <div class="card-head"><h2>Add a zone</h2><span class="muted small">Click the map to set the centre.</span></div>
        <form id="zone-form" class="form-grid">
          <label>Name<input id="z-name" required maxlength="80" placeholder="e.g. Sector 14 market"></label>
          <label>Latitude<input id="z-lat" type="number" step="any" required></label>
          <label>Longitude<input id="z-lon" type="number" step="any" required></label>
          <label>Radius (m)<input id="z-rad" type="number" min="50" max="20000" value="500" required></label>
          <button class="btn primary" type="submit">Add zone</button>
        </form>
        <div id="zone-error" class="form-error" hidden style="margin-top:10px"></div>
        <div id="zone-map" class="map-box sm" style="margin-top:12px"></div>
      </div>

      <div class="card">
        <div class="card-head"><h2>Hotspots</h2><span class="muted small">Clusters of reports within roughly 500 m, busiest first.</span></div>
        ${hotspots.length ? `<div class="table-wrap" style="box-shadow:none"><table><thead><tr><th>Location</th><th>Open</th><th>Critical</th><th>Resolved</th><th>Total</th><th>Oldest open</th><th>Zone</th><th></th></tr></thead><tbody>
          ${hotspots.slice(0, 15).map((h) => `<tr><td class="mono">${esc(h.label)}</td><td><b>${h.active}</b></td><td>${h.criticalActive || 0}</td><td>${h.resolved}</td><td>${h.total}</td><td>${h.active ? fmtAge(h.oldestActiveAgeHours) : '-'}</td>
            <td>${esc(h.zoneName || '-')}</td><td class="nowrap right"><button class="btn sm" data-hmap data-lat="${h.latitude}" data-lon="${h.longitude}">Map</button>
            ${h.zoneName ? '' : `<button class="btn sm" data-hzone data-lat="${h.latitude}" data-lon="${h.longitude}">Make zone</button>`}</td></tr>`).join('')}
        </tbody></table></div>` : '<div class="empty">No reports yet.</div>'}
      </div>`;

    const setPoint = (lat, lon) => { $('#z-lat').value = (+lat).toFixed(5); $('#z-lon').value = (+lon).toFixed(5); drawPreview(); };
    let preview;
    const zm = newMap($('#zone-map'), zones[0] ? [zones[0].latitude, zones[0].longitude] : [20.59, 78.96], zones[0] ? 13 : 5);
    const drawPreview = () => {
      if (!zm) return; if (preview) preview.remove();
      const lat = parseFloat($('#z-lat').value), lon = parseFloat($('#z-lon').value), rad = parseFloat($('#z-rad').value) || 500;
      if (isFinite(lat) && isFinite(lon)) preview = L.circle([lat, lon], { radius: rad, color: '#e5392b', weight: 2, fillOpacity: .12 }).addTo(zm);
    };
    if (zm) {
      zones.forEach((z) => L.circle([z.latitude, z.longitude], { radius: z.radiusMeters, color: '#2d8cff', weight: 1.5, fillOpacity: .06 }).bindTooltip(esc(z.name)).addTo(zm));
      zm.on('click', (e) => setPoint(e.latlng.lat, e.latlng.lng));
      setTimeout(() => zm.invalidateSize(), 50);
    }
    ['z-lat', 'z-lon', 'z-rad'].forEach((id) => $('#' + id).addEventListener('input', drawPreview));

    $('#zone-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#zone-error'); err.hidden = true;
      try {
        await api('/admin/zones', { method: 'POST', body: { name: $('#z-name').value.trim(), latitude: parseFloat($('#z-lat').value), longitude: parseFloat($('#z-lon').value), radiusMeters: parseFloat($('#z-rad').value) } });
        toast('Zone added'); await loadZones(); renderAreas();
      } catch (ex) { err.textContent = ex.message; err.hidden = false; }
    });
    $$('[data-zrep]', view).forEach((b) => b.addEventListener('click', () => { Object.assign(S.filters, { status: 'active', zone: b.dataset.zrep, assignee: '', page: 0 }); go('#/reports'); }));
    $$('[data-zmap]', view).forEach((b) => b.addEventListener('click', () => { const z = zones.find((x) => x.id === b.dataset.zmap); S.mapFocus = { lat: z.latitude, lon: z.longitude }; go('#/map'); }));
    $$('[data-hmap]', view).forEach((b) => b.addEventListener('click', () => { S.mapFocus = { lat: +b.dataset.lat, lon: +b.dataset.lon }; go('#/map'); }));
    $$('[data-hzone]', view).forEach((b) => b.addEventListener('click', () => { setPoint(b.dataset.lat, b.dataset.lon); if (zm) zm.setView([+b.dataset.lat, +b.dataset.lon], 15); $('#z-name').focus(); $('#zone-form').scrollIntoView({ behavior: 'smooth' }); }));
    $$('[data-zdel]', view).forEach((b) => b.addEventListener('click', async () => {
      const ok = await askDialog({ title: 'Delete zone “' + b.dataset.zname + '”?', text: 'Reports are not affected - only the zone label is removed.', okLabel: 'Delete', danger: true });
      if (!ok) return;
      try { await api('/admin/zones/' + b.dataset.zdel, { method: 'DELETE' }); toast('Zone deleted'); await loadZones(); renderAreas(); } catch (ex) { toast(ex.message, true); }
    }));
  }

  // ---------------------------------------------------------------- team
  async function renderTeam() {
    const view = $('#view');
    try { await loadStaff(); } catch (ex) { view.innerHTML = `<div class="empty">${esc(ex.message)}</div>`; return; }
    if (currentView() !== 'team') return;

    view.innerHTML = `
      <div class="card">
        <div class="card-head"><h2>Staff</h2><span class="muted small">Only ${esc(STAFF_DOMAIN)} accounts can be admins.</span></div>
        <div class="table-wrap" style="box-shadow:none"><table><thead><tr><th>Name</th><th>Email</th><th>Active assigned</th><th></th></tr></thead><tbody>
          ${S.staff.map((s) => `<tr><td><b>${esc(s.name)}</b>${s.id === S.me.id ? ' <span class="muted">(you)</span>' : ''}</td><td>${esc(s.email)}</td><td>${s.activeAssigned}</td>
            <td class="right"><button class="btn sm" data-sf="${esc(s.id)}">View their queue</button></td></tr>`).join('')}
        </tbody></table></div>
      </div>
      <div class="grid two">
        <div class="card"><div class="card-head"><h2>Invite a colleague</h2></div>
          <form id="staff-form" class="grid" style="gap:10px">
            <label>Full name<input id="st-name" required maxlength="80"></label>
            <label>Work email<input id="st-email" type="email" required placeholder="name${esc(STAFF_DOMAIN)}"></label>
            <label>Temporary password<input id="st-pass" type="password" minlength="8" required autocomplete="new-password"></label>
            <div id="st-error" class="form-error" hidden></div>
            <button class="btn primary" type="submit">Create admin account</button>
          </form></div>
        <div class="card"><div class="card-head"><h2>Change my password</h2></div>
          <form id="pw-form" class="grid" style="gap:10px">
            <label>Current password<input id="pw-cur" type="password" required autocomplete="current-password"></label>
            <label>New password (min. 8 characters)<input id="pw-new" type="password" minlength="8" required autocomplete="new-password"></label>
            <div id="pw-error" class="form-error" hidden></div>
            <button class="btn primary" type="submit">Update password</button>
          </form></div>
      </div>`;

    $$('[data-sf]', view).forEach((b) => b.addEventListener('click', () => { Object.assign(S.filters, { status: 'active', assignee: b.dataset.sf === S.me.id ? 'me' : b.dataset.sf, zone: '', page: 0 }); go('#/reports'); }));
    $('#staff-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#st-error'); err.hidden = true;
      try {
        await api('/admin/staff', { method: 'POST', body: { name: $('#st-name').value.trim(), email: $('#st-email').value.trim(), password: $('#st-pass').value } });
        toast('Account created - share the temporary password securely'); renderTeam();
      } catch (ex) { err.textContent = ex.message; err.hidden = false; }
    });
    $('#pw-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#pw-error'); err.hidden = true;
      try {
        await api('/admin/me/password', { method: 'POST', body: { currentPassword: $('#pw-cur').value, newPassword: $('#pw-new').value } });
        $('#pw-cur').value = ''; $('#pw-new').value = ''; toast('Password updated');
      } catch (ex) { err.textContent = ex.message; err.hidden = false; }
    });
  }

  // ---------------------------------------------------------------- init
  $('#login-form').addEventListener('submit', onLogin);

  // ---- forgot password (emailed 6-digit code) ----
  const reset = { step: 1 };
  const showReset = (on) => {
    $('#login-form').hidden = on; $('#reset-form').hidden = !on;
    if (on) { reset.step = 1; $('#reset-step2').hidden = true; $('#reset-submit').textContent = 'Send code'; $('#reset-msg').hidden = true; $('#reset-email').readOnly = false; $('#reset-email').value = $('#login-email').value; }
  };
  $('#to-reset').addEventListener('click', () => showReset(true));
  $('#to-login').addEventListener('click', () => showReset(false));
  $('#reset-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#reset-msg'); const btn = $('#reset-submit');
    const say = (text, ok) => { msg.textContent = text; msg.className = ok ? 'form-ok' : 'form-error'; msg.hidden = false; };
    msg.hidden = true; btn.disabled = true;
    try {
      const email = $('#reset-email').value.trim().toLowerCase();
      if (reset.step === 1) {
        await api('/auth/forgot-password', { method: 'POST', body: { email } });
        reset.step = 2; $('#reset-step2').hidden = false; $('#reset-email').readOnly = true;
        $('#reset-submit').textContent = 'Change password';
        say('If that email is registered, a code is on its way. It is valid for 15 minutes.', true);
        $('#reset-code').focus();
      } else {
        await api('/auth/reset-password', { method: 'POST', body: { email, code: $('#reset-code').value.trim(), newPassword: $('#reset-password').value } });
        showReset(false);
        $('#login-email').value = email;
        const err = $('#login-error'); err.textContent = 'Password changed. Sign in with your new password.'; err.className = 'form-ok'; err.hidden = false;
        $('#reset-code').value = ''; $('#reset-password').value = '';
      }
    } catch (ex) { say(ex.message, false); }
    finally { btn.disabled = false; }
  });
  $('#btn-logout').addEventListener('click', () => logout());
  $('#btn-refresh').addEventListener('click', () => { loadStaff().catch(() => {}); loadZones().catch(() => {}); route(); });
  $('#drawer-backdrop').addEventListener('click', () => closeDrawer());
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#drawer').hidden && !$('#dialog').open) closeDrawer(); });

  S.token = store.get();
  if (S.token) boot(); else showLogin();
})();
