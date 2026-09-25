const $ = (sel) => document.querySelector(sel);

const state = {
  type: "book",
  topics: new Set(),
  query: "",
  sort: "rating",
  view: "topics",
};

let data = { topics: [], types: [], items: [] };
const topicById = new Map();

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Stable hue per item, so each generated cover keeps its colour.
const hue = (str) => [...str].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

const stars = (n) => "★".repeat(n) + "☆".repeat(5 - n);

const yearLabel = (y) => (y < 1000 ? `ca. ${y} n. Chr.` : y);

const normalize = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/* ---------- URL state (filters are shareable via the hash) ---------- */

function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  if (p.get("type")) state.type = p.get("type");
  state.topics = new Set((p.get("t") || "").split(",").filter(Boolean));
  state.query = p.get("q") || "";
  if (p.get("sort")) state.sort = p.get("sort");
  if (p.get("view")) state.view = p.get("view");
}

function writeHash() {
  const p = new URLSearchParams();
  if (state.type !== "book") p.set("type", state.type);
  if (state.topics.size) p.set("t", [...state.topics].join(","));
  if (state.query) p.set("q", state.query);
  if (state.sort !== "rating") p.set("sort", state.sort);
  if (state.view !== "topics") p.set("view", state.view);
  const hash = p.toString();
  history.replaceState(null, "", hash ? `#${hash}` : location.pathname + location.search);
}

/* ---------- Filtering ---------- */

function matches(item) {
  if (item.type !== state.type) return false;
  if (state.topics.size && !item.topics.some((t) => state.topics.has(t))) return false;
  if (state.query) {
    const hay = normalize(
      [item.title, item.subtitle, item.author, item.summary, ...(item.takeaways || []),
        ...item.topics.map((t) => topicById.get(t)?.label)].join(" ")
    );
    return normalize(state.query).split(/\s+/).every((w) => hay.includes(w));
  }
  return true;
}

const sorters = {
  rating: (a, b) => b.rating - a.rating || a.title.localeCompare(b.title, "de"),
  title: (a, b) => a.title.localeCompare(b.title, "de"),
  "year-desc": (a, b) => b.year - a.year,
  "year-asc": (a, b) => a.year - b.year,
};

/* ---------- Rendering ---------- */

function renderTypes() {
  $("#types").innerHTML = data.types
    .map((t) => {
      const n = data.items.filter((i) => i.type === t.id).length;
      const soon = t.status === "soon";
      return `<button type="button" role="tab" data-type="${t.id}"
        aria-selected="${state.type === t.id}" ${soon ? "disabled" : ""}>
        ${esc(t.label)}
        <span class="badge ${soon ? "badge--soon" : ""}">${soon ? "bald" : n}</span>
      </button>`;
    })
    .join("");
}

function renderTopics() {
  const ofType = data.items.filter((i) => i.type === state.type);
  $("#topics").innerHTML = data.topics
    .map((t) => {
      const n = ofType.filter((i) => i.topics.includes(t.id)).length;
      if (!n) return "";
      return `<button type="button" class="chip" data-topic="${t.id}" aria-pressed="${state.topics.has(t.id)}">
        ${t.emoji} ${esc(t.label)}<span class="n">${n}</span>
      </button>`;
    })
    .join("");
}

function cover(item) {
  return `<div class="cover" style="--h:${hue(item.id)}">
    <div class="cover__title">${esc(item.title)}</div>
    <div class="cover__author">${esc(item.author)}</div>
  </div>`;
}

function card(item) {
  return `<button type="button" class="card" data-id="${item.id}" aria-label="${esc(item.title)} – Details öffnen">
    ${cover(item)}
    <div class="card__body">
      <span class="stars" aria-label="${item.rating} von 5">${stars(item.rating)}</span>
      <h3>${esc(item.title)}</h3>
      <p class="meta">${esc(item.author)} · ${yearLabel(item.year)}</p>
      <p class="summary">${esc(item.summary)}</p>
      <div class="tags">${item.topics.map((t) => `<span class="tag">${esc(topicById.get(t)?.label ?? t)}</span>`).join("")}</div>
    </div>
  </button>`;
}

function renderResults() {
  const list = data.items.filter(matches).sort(sorters[state.sort]);
  $("#count").textContent = `${list.length} ${list.length === 1 ? "Empfehlung" : "Empfehlungen"}`;

  if (!list.length) {
    $("#results").innerHTML = `<div class="empty">
      <p>Keine Treffer für diese Auswahl.</p>
      <button type="button" class="btn" data-action="reset">Filter zurücksetzen</button>
    </div>`;
    return;
  }

  if (state.view === "grid") {
    $("#results").innerHTML = `<div class="grid">${list.map(card).join("")}</div>`;
    return;
  }

  // Grouped by topic: an item appears under each of its (visible) topics.
  const groups = data.topics
    .filter((t) => !state.topics.size || state.topics.has(t.id))
    .map((t) => ({ topic: t, items: list.filter((i) => i.topics.includes(t.id)) }))
    .filter((g) => g.items.length);

  $("#results").innerHTML = groups
    .map(({ topic, items }) => `<section class="section" id="thema-${topic.id}">
      <h2>${topic.emoji} ${esc(topic.label)} <small>${items.length}</small></h2>
      <div class="grid">${items.map(card).join("")}</div>
    </section>`)
    .join("");
}

function render() {
  renderTypes();
  renderTopics();
  renderResults();
  document.querySelectorAll("[data-view]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.view === state.view));
  $("#sort").value = state.sort;
  if ($("#search").value !== state.query) $("#search").value = state.query;
  writeHash();
}

/* ---------- Detail dialog ---------- */

function openDetail(id) {
  const item = data.items.find((i) => i.id === id);
  if (!item) return;
  const q = encodeURIComponent(`${item.title} ${item.author}`);
  $("#detail-body").innerHTML = `
    <button type="button" class="detail__close" data-action="close" aria-label="Schließen">✕</button>
    ${cover(item)}
    <div class="detail__content">
      <h2 id="detail-title" hidden>${esc(item.title)}</h2>
      <div class="detail__meta">
        <span class="stars" aria-label="${item.rating} von 5">${stars(item.rating)}</span>
        ${item.subtitle ? `<span>${esc(item.subtitle)}</span>` : ""}
        <span>${yearLabel(item.year)}</span>
        ${item.pages ? `<span>${item.pages} Seiten</span>` : ""}
      </div>
      <p>${esc(item.summary)}</p>
      ${item.takeaways?.length ? `<h3>Kernaussagen</h3><ul>${item.takeaways.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
      <h3>Themen</h3>
      <div class="chips">${item.topics.map((t) => `<button type="button" class="chip" data-jump-topic="${t}">${topicById.get(t)?.emoji ?? ""} ${esc(topicById.get(t)?.label ?? t)}</button>`).join("")}</div>
      <div class="detail__actions">
        <a class="btn btn--primary" href="${item.link || `https://openlibrary.org/search?q=${q}`}" target="_blank" rel="noopener">Buch ansehen ↗</a>
        <button type="button" class="btn" data-action="share">Link kopieren</button>
      </div>
    </div>`;
  const dlg = $("#detail");
  dlg.dataset.id = id;
  if (!dlg.open) dlg.showModal();
}

/* ---------- Events ---------- */

function bind() {
  $("#types").addEventListener("click", (e) => {
    const b = e.target.closest("[data-type]");
    if (!b || b.disabled) return;
    state.type = b.dataset.type;
    state.topics.clear();
    render();
  });

  $("#topics").addEventListener("click", (e) => {
    const b = e.target.closest("[data-topic]");
    if (!b) return;
    const id = b.dataset.topic;
    state.topics.has(id) ? state.topics.delete(id) : state.topics.add(id);
    render();
  });

  let t;
  $("#search").addEventListener("input", (e) => {
    clearTimeout(t);
    t = setTimeout(() => { state.query = e.target.value.trim(); render(); }, 120);
  });

  $("#sort").addEventListener("change", (e) => { state.sort = e.target.value; render(); });

  document.querySelectorAll("[data-view]").forEach((b) =>
    b.addEventListener("click", () => { state.view = b.dataset.view; render(); })
  );

  $("#results").addEventListener("click", (e) => {
    if (e.target.closest("[data-action=reset]")) {
      Object.assign(state, { query: "" });
      state.topics.clear();
      render();
      return;
    }
    const c = e.target.closest(".card");
    if (c) openDetail(c.dataset.id);
  });

  const dlg = $("#detail");
  dlg.addEventListener("click", async (e) => {
    if (e.target === dlg || e.target.closest("[data-action=close]")) return dlg.close();
    const jump = e.target.closest("[data-jump-topic]");
    if (jump) {
      state.topics = new Set([jump.dataset.jumpTopic]);
      dlg.close();
      render();
      window.scrollTo({ top: $("#types").offsetTop - 12, behavior: "smooth" });
    }
    const share = e.target.closest("[data-action=share]");
    if (share) {
      const url = `${location.origin}${location.pathname}#book=${dlg.dataset.id}`;
      try { await navigator.clipboard.writeText(url); share.textContent = "Kopiert ✓"; }
      catch { share.textContent = url; }
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement.tagName !== "INPUT" && !dlg.open) {
      e.preventDefault();
      $("#search").focus();
    }
  });

  // Theme toggle: cycles system → dark → light. Remembered per browser.
  const root = document.documentElement;
  const applyTheme = (v) => (v ? root.setAttribute("data-theme", v) : root.removeAttribute("data-theme"));
  try { applyTheme(localStorage.getItem("theme")); } catch {}
  $("#theme-toggle").addEventListener("click", () => {
    const isDark = root.dataset.theme
      ? root.dataset.theme === "dark"
      : matchMedia("(prefers-color-scheme: dark)").matches;
    const next = isDark ? "light" : "dark";
    applyTheme(next);
    try { localStorage.setItem("theme", next); } catch {}
  });
}

async function init() {
  try {
    const res = await fetch("data/items.json");
    data = await res.json();
  } catch (err) {
    $("#results").innerHTML = `<div class="empty"><p>Daten konnten nicht geladen werden.</p></div>`;
    console.error(err);
    return;
  }
  data.topics.forEach((t) => topicById.set(t.id, t));

  const deepLink = new URLSearchParams(location.hash.slice(1)).get("book");
  if (!deepLink) readHash();
  bind();
  render();
  if (deepLink) openDetail(deepLink);
}

init();
