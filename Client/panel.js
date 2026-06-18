const state = {
  requests: [],
  filtered: [],
  selected: null,
  recording: true,
  filterMethod: "ALL",
  filterType: "All",
  filterSearch: "",
  activeTab: "overview",
  ws: null,
  wsRetryTimer: null,
  counter: 0,
};

const WS_URL = "ws://localhost:9119";
const WS_RETRY_MS = 3000;

const $ = (id) => document.getElementById(id);
const requestsList  = $("requests-list");
const emptyState    = $("empty-state");
const detailPanel   = $("detail-panel");
const detailTitle   = $("detail-title");
const wsLabel       = $("ws-label");
const wsDot         = $("ws-dot");
const requestCount  = $("request-count");
const statTotal     = $("stat-total");
const statTime      = $("stat-time");
const statSize      = $("stat-size");
const statErrors    = $("stat-errors");
const statErrCount  = $("stat-err-count");

function connectWS() {
  if (state.ws && state.ws.readyState <= 1) return;

  setWsStatus("connecting");
  const ws = new WebSocket(WS_URL);
  state.ws = ws;

  ws.onopen = () => {
    setWsStatus("connected");
    clearTimeout(state.wsRetryTimer);
  };

  ws.onmessage = (evt) => {
    try {
      const msg = JSON.parse(evt.data);
      if (msg.type === "request" && state.recording) {
        addRequest(msg.data);
      }
    } catch (e) {}
  };

  ws.onclose = () => {
    setWsStatus("disconnected");
    state.wsRetryTimer = setTimeout(connectWS, WS_RETRY_MS);
  };

  ws.onerror = () => {
    ws.close();
  };
}

function setWsStatus(status) {
  wsDot.className = "";
  if (status === "connected") {
    wsDot.classList.add("connected");
    wsLabel.textContent = "Connected";
  } else if (status === "connecting") {
    wsDot.classList.add("connecting");
    wsLabel.textContent = "Connecting…";
  } else {
    wsLabel.textContent = "Disconnected";
  }
}

function addRequest(data) {
  state.counter++;
  data._index = state.counter;
  data._size  = estimateSize(data.responseBody);
  state.requests.push(data);
  applyFilters();
  updateStatusBar();
}

function applyFilters() {
  const { filterMethod, filterType, filterSearch } = state;
  state.filtered = state.requests.filter((r) => {
    const method = String(r.method || "");
    const url = String(r.url || "");
    if (filterMethod !== "ALL" && method !== filterMethod) return false;
    if (filterType !== "All" && r.type !== filterType) return false;
    if (filterSearch) {
      const q = filterSearch.toLowerCase();
      if (!url.toLowerCase().includes(q) &&
          !method.toLowerCase().includes(q)) return false;
    }
    return true;
  });
  renderList();
}

function renderList() {
  const rows = requestsList.querySelectorAll(".request-row");
  rows.forEach((r) => r.remove());

  if (state.filtered.length === 0) {
    emptyState.style.display = "flex";
    requestCount.textContent = "0 requests";
    return;
  }

  emptyState.style.display = "none";
  requestCount.textContent = `${state.filtered.length} request${state.filtered.length !== 1 ? "s" : ""}`;

  const frag = document.createDocumentFragment();
  state.filtered.forEach((req) => {
    const row = buildRow(req);
    frag.appendChild(row);
  });
  requestsList.appendChild(frag);

  if (state.selected) {
    const sel = findRowById(state.selected.id);
    if (sel) sel.classList.add("selected");
  }
}

function buildRow(req) {
  const row = document.createElement("div");
  row.className = "request-row" + (isError(req) ? " error" : "");
  row.dataset.id = String(req.id || "");
  if (state.selected && state.selected.id === req.id) row.classList.add("selected");

  const statusClass = getStatusClass(req.status);
  const method = String(req.method || "");
  const type = String(req.type || "");
  const methodClass = `method-${method.toLowerCase().replace(/[^a-z0-9_-]/g, "")}`;
  const urlShort    = shortUrl(req.url);
  const sizeStr     = formatSize(req._size);
  const timeStr     = req.duration ? `${req.duration}ms` : "—";

  appendCell(row, "td td-index", req._index);
  appendCell(row, `td td-method ${methodClass}`, method);
  appendCell(row, `td td-status ${statusClass}`, req.status || "—");
  appendCell(row, "td td-url", urlShort, String(req.url || ""));
  appendCell(row, "td td-type", type);
  appendCell(row, "td td-initiator", "server");
  appendCell(row, "td td-size", sizeStr);
  appendCell(row, "td td-time", timeStr);

  row.addEventListener("click", () => selectRequest(req));
  return row;
}

function appendCell(row, className, text, title) {
  const cell = document.createElement("div");
  cell.className = className;
  cell.textContent = String(text ?? "");
  if (title) cell.title = title;
  row.appendChild(cell);
}

function selectRequest(req) {
  const prev = requestsList.querySelector(".request-row.selected");
  if (prev) prev.classList.remove("selected");

  state.selected = req;
  const cur = findRowById(req.id);
  if (cur) cur.classList.add("selected");

  showDetail(req);
}

function showDetail(req) {
  detailPanel.classList.add("visible");
  detailTitle.textContent = shortUrl(req.url);

  renderDetailTab(state.activeTab, req);
}

function renderDetailTab(tab, req) {
  req = req || state.selected;
  if (!req) return;

  document.querySelectorAll(".tab-content").forEach((t) => t.classList.remove("active"));
  document.querySelectorAll(".detail-tab").forEach((t) => t.classList.remove("active"));

  const tabEl = document.querySelector(`.detail-tab[data-tab="${tab}"]`);
  const contentEl = $(`tab-${tab}`);
  if (tabEl) tabEl.classList.add("active");
  if (contentEl) contentEl.classList.add("active");

  switch (tab) {
    case "overview":     renderOverview(req, contentEl); break;
    case "req-headers":  renderHeaders(req.requestHeaders, contentEl, "Request Headers"); break;
    case "res-headers":  renderHeaders(req.responseHeaders, contentEl, "Response Headers"); break;
    case "payload":      renderPayload(req, contentEl); break;
    case "response":     renderResponse(req, contentEl); break;
  }
}

function renderOverview(req, el) {
  const statusClass = getStatusClass(req.status);
  el.innerHTML = "";

  const section = makeSection("General");
  const rows = [
    ["Request URL",    req.url],
    ["Request Method", req.method],
    ["Status Code",    req.status ? `${req.status} ${req.statusText || ""}` : "—"],
    ["Type",           req.type],
    ["Duration",       req.duration ? `${req.duration}ms` : "—"],
    ["Timestamp",      req.timestamp],
    ["Size",           formatSize(req._size)],
  ];
  rows.forEach(([k, v]) => {
    const isStatus = k === "Status Code";
    const valClass = isStatus ? statusClass : "";
    section.body.appendChild(makeKV(k, v, valClass));
  });
  el.appendChild(section.el);
}

function renderHeaders(headers, el, title) {
  el.innerHTML = "";
  if (!headers || Object.keys(headers).length === 0) {
    el.innerHTML = `<div style="padding:12px;color:var(--text-dim);font-size:11px;">No headers</div>`;
    return;
  }
  const section = makeSection(title);
  Object.entries(headers).forEach(([k, v]) => {
    section.body.appendChild(makeKV(k, String(v)));
  });
  el.appendChild(section.el);
}

function renderPayload(req, el) {
  el.innerHTML = "";
  if (!req.requestBody) {
    el.innerHTML = `<div style="padding:12px;color:var(--text-dim);font-size:11px;">No request payload</div>`;
    return;
  }
  const section = makeSection("Request Body");
  const pre = document.createElement("div");
  pre.className = "json-viewer";
  pre.innerHTML = syntaxHighlight(req.requestBody);
  section.body.appendChild(pre);
  section.body.appendChild(makeCopyBtn(req.requestBody));
  el.appendChild(section.el);
}

function renderResponse(req, el) {
  el.innerHTML = "";
  if (req.responseBody === null || req.responseBody === undefined || req.responseBody === "") {
    el.innerHTML = `<div style="padding:12px;color:var(--text-dim);font-size:11px;">No response body</div>`;
    return;
  }
  const section = makeSection("Response Body");
  const pre = document.createElement("div");
  pre.className = "json-viewer";
  pre.innerHTML = syntaxHighlight(req.responseBody);
  section.body.appendChild(pre);
  section.body.appendChild(makeCopyBtn(req.responseBody));
  el.appendChild(section.el);
}

function makeSection(title) {
  const el = document.createElement("div");
  el.className = "section";

  const header = document.createElement("div");
  header.className = "section-header";
  header.innerHTML = `<span class="section-arrow">▼</span> ${title}`;
  header.addEventListener("click", () => el.classList.toggle("collapsed"));

  const body = document.createElement("div");
  body.className = "section-body";

  el.appendChild(header);
  el.appendChild(body);
  return { el, body };
}

function makeKV(key, value, valClass = "") {
  const row = document.createElement("div");
  row.className = "kv-row";
  row.innerHTML = `
    <div class="kv-key">${escHtml(key)}:</div>
    <div class="kv-value ${valClass}">${escHtml(String(value ?? ""))}</div>
  `;
  return row;
}

function makeCopyBtn(data) {
  const btn = document.createElement("button");
  btn.className = "copy-btn";
  btn.textContent = "⎘ Copy";
  btn.addEventListener("click", () => {
    const text = typeof data === "object" ? JSON.stringify(data, null, 2) : String(data);
    navigator.clipboard.writeText(text).then(() => {
      btn.textContent = "✓ Copied";
      setTimeout(() => { btn.textContent = "⎘ Copy"; }, 1500);
    });
  });
  return btn;
}

function syntaxHighlight(obj) {
  let str;
  try {
    str = typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
  } catch {
    return escHtml(String(obj));
  }
  return escHtml(str).replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = "json-number";
      if (/^"/.test(match)) {
        cls = /:$/.test(match) ? "json-key" : "json-string";
      } else if (/true|false/.test(match)) {
        cls = "json-bool";
      } else if (/null/.test(match)) {
        cls = "json-null";
      }
      return `<span class="${cls}">${match}</span>`;
    }
  );
}

function updateStatusBar() {
  const total    = state.requests.length;
  const totalMs  = state.requests.reduce((s, r) => s + (r.duration || 0), 0);
  const totalB   = state.requests.reduce((s, r) => s + (r._size || 0), 0);
  const errors   = state.requests.filter(isError).length;

  statTotal.textContent    = total;
  statTime.textContent     = `${totalMs}ms`;
  statSize.textContent     = formatSize(totalB);

  if (errors > 0) {
    statErrors.style.display = "";
    statErrCount.textContent = errors;
  } else {
    statErrors.style.display = "none";
  }
}

function getStatusClass(status) {
  if (!status) return "status-0";
  if (status >= 500) return "status-5xx";
  if (status >= 400) return "status-4xx";
  if (status >= 300) return "status-3xx";
  return "status-2xx";
}

function isError(req) {
  return !req.status || req.status >= 400;
}

function shortUrl(url) {
  try {
    const u = new URL(String(url || ""));
    return u.pathname + (u.search || "");
  } catch {
    return String(url || "");
  }
}

function findRowById(id) {
  const idString = String(id || "");
  return Array.from(requestsList.querySelectorAll(".request-row"))
    .find((row) => row.dataset.id === idString);
}

function estimateSize(body) {
  if (!body) return 0;
  try {
    const str = typeof body === "string" ? body : JSON.stringify(body);
    return new Blob([str]).size;
  } catch { return 0; }
}

function formatSize(bytes) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

$("btn-record").addEventListener("click", () => {
  state.recording = !state.recording;
  $("btn-record").classList.toggle("active", state.recording);
  $("btn-record").title = state.recording ? "Recording" : "Paused";
});

$("btn-clear").addEventListener("click", () => {
  state.requests = [];
  state.filtered = [];
  state.selected = null;
  state.counter  = 0;
  detailPanel.classList.remove("visible");
  renderList();
  updateStatusBar();
});

$("search-input").addEventListener("input", (e) => {
  state.filterSearch = e.target.value.trim();
  applyFilters();
});

document.querySelectorAll(".method-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".method-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.filterMethod = btn.dataset.method;
    applyFilters();
  });
});

document.querySelectorAll(".type-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".type-chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    state.filterType = chip.dataset.type;
    applyFilters();
  });
});

document.querySelectorAll(".detail-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    state.activeTab = tab.dataset.tab;
    renderDetailTab(state.activeTab);
  });
});

$("detail-close").addEventListener("click", () => {
  detailPanel.classList.remove("visible");
  const sel = requestsList.querySelector(".request-row.selected");
  if (sel) sel.classList.remove("selected");
  state.selected = null;
});

(function initResize() {
  const handle = $("resize-handle");
  const panel  = $("detail-panel");
  let dragging = false;
  let startX, startW;

  handle.addEventListener("mousedown", (e) => {
    dragging = true;
    startX = e.clientX;
    startW = panel.offsetWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  });

  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const delta = startX - e.clientX;
    const newW  = Math.max(280, Math.min(window.innerWidth * 0.7, startW + delta));
    panel.style.width = newW + "px";
  });

  document.addEventListener("mouseup", () => {
    dragging = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  });
})();

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    detailPanel.classList.remove("visible");
    state.selected = null;
  }
});

connectWS();
