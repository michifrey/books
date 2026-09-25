const $ = (sel) => document.querySelector(sel);

const state = {
  type: "all",
  topics: new Set(),
  query: "",
  sort: "rating",
  view: "topics",
};

let data = { topics: [], types: [], items: [] };
const topicById = new Map();
const typeById = new Map();
const itemById = new Map();
let listHash = "";
let listScroll = 0;

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Stable hue per item, so each generated cover keeps its colour.
const hue = (str) => [...str].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

const stars = (n) => "★".repeat(n) + "☆".repeat(5 - n);

const yearLabel = (y) => (y < 1000 ? `ca. ${y} n. Chr.` : y);

const normalize = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const topicLabel = (id) => topicById.get(id)?.label ?? id;

const TYPE_TEXT = {
  book: { cta: "Buch ansehen", by: "von" },
  audiobook: { cta: "Hörbuch finden", by: "von" },
  podcast: { cta: "Podcast finden", by: "mit" },
  video: { cta: "Video ansehen", by: "von" },
  article: { cta: "Artikel lesen", by: "von" },
};

function itemLink(item) {
  if (item.link) return item.link;
  const q = encodeURIComponent(`${item.title} ${item.author}`);
  switch (item.type) {
    case "book": return `https://openlibrary.org/search?q=${q}`;
    case "video": return `https://www.youtube.com/results?search_query=${q}`;
    default: return `https://duckduckgo.com/?q=${q}`;
  }
}

function metaFacts(item) {
  const facts = [];
  if (item.year) facts.push(["Jahr", yearLabel(item.year)]);
  if (item.pages) facts.push(["Umfang", `${item.pages} Seiten`]);
  if (item.duration) facts.push([item.type === "article" ? "Lesezeit" : "Dauer", `${item.duration} Min.`]);
  if (item.format) facts.push(["Format", item.format]);
  if (item.source) facts.push(["Quelle", item.source]);
  return facts;
}

/* ---------- Real covers via Open Library (fetched in the visitor's browser, cached) ---------- */

const coverCache = new Map();
const COVER_TYPES = new Set(["book", "audiobook"]);

function coverUrl(item) {
  if (item.cover) return Promise.resolve(item.cover);
  if (!COVER_TYPES.has(item.type)) return Promise.resolve(null);
  if (coverCache.has(item.id)) return coverCache.get(item.id);

  const key = `cover:v1:${item.id}`;
  const p = (async () => {
    try {
      const hit = localStorage.getItem(key);
      if (hit !== null) return hit || null;
    } catch {}
    const q = item.coverSearch ?? { title: item.title, author: item.author.split(",")[0] };
    const params = new URLSearchParams({ title: q.title, author: q.author, limit: "5", fields: "cover_i" });
    try {
      const res = await fetch(`https://openlibrary.org/search.json?${params}`);
      const json = await res.json();
      const id = json.docs?.find((d) => d.cover_i)?.cover_i;
      const url = id ? `https://covers.openlibrary.org/b/id/${id}-L.jpg` : "";
      try { localStorage.setItem(key, url); } catch {}
      return url || null;
    } catch {
      return null; // offline or blocked: keep the generated cover
    }
  })();
  coverCache.set(item.id, p);
  return p;
}

const coverObserver = "IntersectionObserver" in window
  ? new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        coverObserver.unobserve(e.target);
        hydrateCover(e.target);
      });
    }, { rootMargin: "300px" })
  : null;

async function hydrateCover(el) {
  const item = itemById.get(el.dataset.coverId);
  const url = item && (await coverUrl(item));
  if (!url || el.querySelector("img")) return;
  const img = new Image();
  img.alt = `Cover: ${item.title}`;
  img.className = "cover__img";
  img.decoding = "async";
  img.onload = () => el.classList.add("has-img");
  img.src = url;
  el.append(img);
}

function hydrateCovers(root) {
  root.querySelectorAll("[data-cover-id]").forEach((el) =>
    coverObserver ? coverObserver.observe(el) : hydrateCover(el)
  );
}

/* ---------- URL state ---------- */
// "#/<id>" is a detail page; anything else is the list with its filters.

function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  state.type = typeById.has(p.get("type")) ? p.get("type") : "all";
  state.topics = new Set((p.get("t") || "").split(",").filter((t) => topicById.has(t)));
  state.query = p.get("q") || "";
  state.sort = p.get("sort") || "rating";
  state.view = p.get("view") || "topics";
}

function writeHash() {
  const p = new URLSearchParams();
  if (state.type !== "all") p.set("type", state.type);
  if (state.topics.size) p.set("t", [...state.topics].join(","));
  if (state.query) p.set("q", state.query);
  if (state.sort !== "rating") p.set("sort", state.sort);
  if (state.view !== "topics") p.set("view", state.view);
  listHash = p.toString();
  history.replaceState(null, "", listHash ? `#${listHash}` : location.pathname + location.search);
}

/* ---------- Filtering ---------- */

function matches(item) {
  if (state.type !== "all" && item.type !== state.type) return false;
  if (state.topics.size && !item.topics.some((t) => state.topics.has(t))) return false;
  if (state.query) {
    const hay = normalize(
      [item.title, item.subtitle, item.author, item.summary, item.source, item.format,
        ...(item.takeaways || []), ...item.topics.map(topicLabel), typeById.get(item.type)?.label].join(" ")
    );
    return normalize(state.query).split(/\s+/).every((w) => hay.includes(w));
  }
  return true;
}

const sorters = {
  rating: (a, b) => b.rating - a.rating || a.title.localeCompare(b.title, "de"),
  title: (a, b) => a.title.localeCompare(b.title, "de"),
  "year-desc": (a, b) => (b.year ?? 0) - (a.year ?? 0),
  "year-asc": (a, b) => (a.year ?? 0) - (b.year ?? 0),
};

/* ---------- List rendering ---------- */

function renderTypes() {
  $("#types").innerHTML = data.types
    .map((t) => {
      const n = t.id === "all" ? data.items.length : data.items.filter((i) => i.type === t.id).length;
      const soon = t.status === "soon";
      return `<button type="button" role="tab" data-type="${t.id}"
        aria-selected="${state.type === t.id}" ${soon ? "disabled" : ""}>
        ${t.icon ? `<span aria-hidden="true">${t.icon}</span>` : ""}${esc(t.label)}
        <span class="badge ${soon ? "badge--soon" : ""}">${soon ? "bald" : n}</span>
      </button>`;
    })
    .join("");
}

function renderTopics() {
  const ofType = data.items.filter((i) => state.type === "all" || i.type === state.type);
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

function cover(item, variant = "") {
  const type = typeById.get(item.type);
  return `<div class="cover cover--${item.type} ${variant}" style="--h:${hue(item.id)}" data-cover-id="${item.id}">
    <span class="cover__type">${type?.icon ?? ""} ${esc(type?.label ?? "")}</span>
    <div class="cover__text">
      <div class="cover__title">${esc(item.title)}</div>
      <div class="cover__author">${esc(item.author)}</div>
    </div>
  </div>`;
}

function card(item) {
  return `<a class="card" href="#/${item.id}">
    ${cover(item)}
    <div class="card__body">
      <span class="stars" aria-label="${item.rating} von 5">${stars(item.rating)}</span>
      <h3>${esc(item.title)}</h3>
      <p class="meta">${esc(item.author)}${item.year ? ` · ${yearLabel(item.year)}` : ""}</p>
      <p class="summary">${esc(item.summary)}</p>
      <div class="tags">${item.topics.map((t) => `<span class="tag">${esc(topicLabel(t))}</span>`).join("")}</div>
    </div>
  </a>`;
}

function renderResults() {
  const list = data.items.filter(matches).sort(sorters[state.sort] ?? sorters.rating);
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
  } else {
    // Grouped by topic: an item appears under each of its (visible) topics.
    $("#results").innerHTML = data.topics
      .filter((t) => !state.topics.size || state.topics.has(t.id))
      .map((t) => ({ topic: t, items: list.filter((i) => i.topics.includes(t.id)) }))
      .filter((g) => g.items.length)
      .map(({ topic, items }) => `<section class="section" id="thema-${topic.id}">
        <h2>${topic.emoji} ${esc(topic.label)} <small>${items.length}</small></h2>
        <div class="grid">${items.map(card).join("")}</div>
      </section>`)
      .join("");
  }
  hydrateCovers($("#results"));
}

function renderList() {
  renderTypes();
  renderTopics();
  renderResults();
  document.querySelectorAll("[data-view]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.view === state.view));
  $("#sort").value = state.sort;
  if ($("#search").value !== state.query) $("#search").value = state.query;
  writeHash();
}

/* ---------- Detail page ---------- */

function relatedItems(item) {
  // Explicit links in both directions.
  const ids = new Set(item.related ?? []);
  data.items.forEach((o) => o.related?.includes(item.id) && ids.add(o.id));
  ids.delete(item.id);
  return [...ids].map((id) => itemById.get(id)).filter(Boolean);
}

function sameTopicItems(item, exclude) {
  return data.items
    .filter((o) => o.id !== item.id && !exclude.has(o.id))
    .map((o) => ({ o, overlap: o.topics.filter((t) => item.topics.includes(t)).length }))
    .filter((x) => x.overlap)
    .sort((a, b) => b.overlap - a.overlap || b.o.rating - a.o.rating)
    .slice(0, 4)
    .map((x) => x.o);
}

function renderDetail(item) {
  const type = typeById.get(item.type);
  const text = TYPE_TEXT[item.type] ?? TYPE_TEXT.book;
  const related = relatedItems(item);
  const more = sameTopicItems(item, new Set(related.map((r) => r.id)));

  $("#page").innerHTML = `
    <section class="page__hero">
      <div class="page__cover">${cover(item, "cover--large")}</div>
      <div class="page__intro">
        <span class="pill">${type?.icon ?? ""} ${esc(type?.label ?? "")}</span>
        <h1>${esc(item.title)}</h1>
        ${item.subtitle ? `<p class="page__subtitle">${esc(item.subtitle)}</p>` : ""}
        <p class="page__author">${text.by} <strong>${esc(item.author)}</strong></p>
        <p class="stars stars--lg" aria-label="Bewertung: ${item.rating} von 5">${stars(item.rating)}</p>
        <dl class="facts">
          ${metaFacts(item).map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("")}
        </dl>
        <div class="chips">${item.topics.map((t) =>
          `<a class="chip" href="#t=${t}">${topicById.get(t)?.emoji ?? ""} ${esc(topicLabel(t))}</a>`).join("")}</div>
        <div class="page__actions">
          <a class="btn btn--primary" href="${esc(itemLink(item))}" target="_blank" rel="noopener">${text.cta} ↗</a>
          <button type="button" class="btn" data-action="share">Link kopieren</button>
        </div>
      </div>
    </section>

    <section class="page__section">
      <h2>Worum geht's?</h2>
      <p class="page__summary">${esc(item.summary)}</p>
    </section>

    ${item.takeaways?.length ? `<section class="page__section">
      <h2>Kernaussagen</h2>
      <ol class="takeaways">${item.takeaways.map((t) => `<li>${esc(t)}</li>`).join("")}</ol>
    </section>` : ""}

    ${related.length ? `<section class="page__section">
      <h2>Passt dazu</h2>
      <div class="grid">${related.map(card).join("")}</div>
    </section>` : ""}

    ${more.length ? `<section class="page__section">
      <h2>Mehr zum Thema</h2>
      <div class="grid">${more.map(card).join("")}</div>
    </section>` : ""}`;

  document.title = `${item.title} – Leseliste`;
  $("#back").href = `#${listHash}`;
  hydrateCovers($("#page"));
}

/* ---------- Routing ---------- */

function route() {
  const m = location.hash.match(/^#\/(.+)$/);
  const item = m && itemById.get(decodeURIComponent(m[1]));
  const detail = Boolean(item);

  if (detail) {
    if (!$("#list-view").hidden) listScroll = scrollY;
    renderDetail(item);
    window.scrollTo(0, 0);
  } else {
    const wasDetail = $("#list-view").hidden;
    readHash();
    renderList();
    document.title = "Leseliste – Empfehlungen";
    if (wasDetail) requestAnimationFrame(() => window.scrollTo(0, listScroll));
  }
  $("#list-view").hidden = detail;
  $("#detail-view").hidden = !detail;
}

/* ---------- Events ---------- */

function bind() {
  window.addEventListener("hashchange", route);

  $("#types").addEventListener("click", (e) => {
    const b = e.target.closest("[data-type]");
    if (!b || b.disabled) return;
    state.type = b.dataset.type;
    state.topics.clear();
    renderList();
  });

  $("#topics").addEventListener("click", (e) => {
    const b = e.target.closest("[data-topic]");
    if (!b) return;
    const id = b.dataset.topic;
    state.topics.has(id) ? state.topics.delete(id) : state.topics.add(id);
    renderList();
  });

  let t;
  $("#search").addEventListener("input", (e) => {
    clearTimeout(t);
    t = setTimeout(() => { state.query = e.target.value.trim(); renderList(); }, 120);
  });

  $("#sort").addEventListener("change", (e) => { state.sort = e.target.value; renderList(); });

  document.querySelectorAll("[data-view]").forEach((b) =>
    b.addEventListener("click", () => { state.view = b.dataset.view; renderList(); })
  );

  $("#results").addEventListener("click", (e) => {
    if (!e.target.closest("[data-action=reset]")) return;
    state.query = "";
    state.topics.clear();
    renderList();
  });

  $("#page").addEventListener("click", async (e) => {
    const share = e.target.closest("[data-action=share]");
    if (!share) return;
    try { await navigator.clipboard.writeText(location.href); share.textContent = "Kopiert ✓"; }
    catch { share.textContent = location.href; }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement.tagName !== "INPUT" && !$("#list-view").hidden) {
      e.preventDefault();
      $("#search").focus();
    }
    if (e.key === "Escape" && !$("#detail-view").hidden) location.hash = listHash;
  });

  // Theme toggle: switches away from the current scheme. Remembered per browser.
  const root = document.documentElement;
  const applyTheme = (v) => (v ? root.setAttribute("data-theme", v) : root.removeAttribute("data-theme"));
  try { applyTheme(localStorage.getItem("theme")); } catch {}
  document.querySelectorAll("[data-theme-toggle]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const isDark = root.dataset.theme
        ? root.dataset.theme === "dark"
        : matchMedia("(prefers-color-scheme: dark)").matches;
      const next = isDark ? "light" : "dark";
      applyTheme(next);
      try { localStorage.setItem("theme", next); } catch {}
    })
  );
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
  data.types.forEach((t) => typeById.set(t.id, t));
  data.items.forEach((i) => itemById.set(i.id, i));

  bind();
  route();
}

init();
