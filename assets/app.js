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

const yearLabel = (y) => (y < 1000 ? `ca. ${y} n. Chr.` : y);

const normalize = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const topicLabel = (id) => topicById.get(id)?.label ?? id;

/* ---------- Icons (inline, stroke-based) ---------- */

const ICON_PATHS = {
  all: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5"/><path d="M8 7h6"/>',
  audiobook: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="5" height="7" rx="2"/><rect x="16" y="14" width="5" height="7" rx="2"/>',
  podcast: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/>',
  video: '<rect x="2" y="5" width="20" height="14" rx="4"/><path d="m10 9 5 3-5 3z"/>',
  article: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  star: '<path d="m12 2.8 2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  arrow: '<path d="M7 17 17 7M9 7h8v8"/>',
  link: '<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
};
const icon = (name, cls = "") => `<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" class="${cls}">${ICON_PATHS[name] ?? ""}</svg>`;

// Evenly spread hues so every topic gets its own recognisable dot colour.
const TOPIC_HUES = [16, 262, 145, 38, 200, 330, 225, 95];
const topicHue = (id) => TOPIC_HUES[data.topics.findIndex((t) => t.id === id) % TOPIC_HUES.length] ?? 0;

const TYPE_TEXT = {
  book: { one: "Buch", cta: "Buch ansehen", by: "von" },
  audiobook: { one: "Hörbuch", cta: "Hörbuch finden", by: "von" },
  podcast: { one: "Podcast", cta: "Podcast finden", by: "mit" },
  video: { one: "Video", cta: "Video ansehen", by: "von" },
  article: { one: "Artikel", cta: "Artikel lesen", by: "von" },
};
const typeOne = (id) => TYPE_TEXT[id]?.one ?? "";

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
  img.alt = "";
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

function stateToHash() {
  const p = new URLSearchParams();
  if (state.type !== "all") p.set("type", state.type);
  if (state.topics.size) p.set("t", [...state.topics].join(","));
  if (state.query) p.set("q", state.query);
  if (state.sort !== "rating") p.set("sort", state.sort);
  if (state.view !== "topics") p.set("view", state.view);
  return p.toString();
}

function writeHash() {
  listHash = stateToHash();
  history.replaceState(null, "", listHash ? `#${listHash}` : location.pathname + location.search);
}

/* ---------- Filtering ---------- */

const ofType = (item) => state.type === "all" || item.type === state.type;

function matches(item) {
  if (!ofType(item)) return false;
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

/* ---------- Building blocks ---------- */

function cover(item) {
  const isBookish = COVER_TYPES.has(item.type);
  return `<div class="cover cover--${item.type}" style="--h:${hue(item.id)}" data-cover-id="${item.id}">
    ${!isBookish ? icon(item.type, "cover__icon") : ""}
    ${item.type !== "book" ? `<span class="cover__badge">${icon(item.type)}</span>` : ""}
    <span class="cover__band"></span>
    <div>
      <div class="cover__title">${esc(item.title)}</div>
      <div class="cover__author">${esc(item.author)}</div>
    </div>
  </div>`;
}

const rating = (n) => `<span class="rating" aria-label="Bewertung ${n} von 5">${icon("star")}${n}.0</span>`;

function card(item) {
  return `<a class="book" href="#/${item.id}">
    ${cover(item)}
    <div>
      <h3 class="book__title">${esc(item.title)}</h3>
      <p class="book__author">${esc(item.author)}</p>
      <div class="book__meta">${rating(item.rating)}<span>·</span><span>${typeOne(item.type)}</span></div>
    </div>
  </a>`;
}

function shelf(title, items, { hue: h, topic } = {}) {
  return `<section class="shelf">
    <div class="shelf__head">
      <h2>${h !== undefined ? `<span class="dot" style="--h:${h}"></span>` : ""}${esc(title)}</h2>
      ${topic ? `<button type="button" class="link-btn" data-show-topic="${topic}">Alle ${items.length} anzeigen</button>` : ""}
    </div>
    <div class="shelf__row">${items.map(card).join("")}</div>
  </section>`;
}

/* ---------- List rendering ---------- */

function renderTypes() {
  $("#types").innerHTML = data.types
    .map((t) => {
      const n = data.items.filter((i) => t.id === "all" || i.type === t.id).length;
      return `<button type="button" role="tab" data-type="${t.id}" aria-selected="${state.type === t.id}">
        ${icon(t.id)}<span>${t.id === "all" ? "Entdecken" : esc(t.label)}</span><span class="n">${n}</span>
      </button>`;
    })
    .join("");
}

function renderTopics() {
  const pool = data.items.filter(ofType);
  $("#topics").innerHTML = data.topics
    .map((t) => {
      const n = pool.filter((i) => i.topics.includes(t.id)).length;
      if (!n) return "";
      return `<button type="button" class="topic" data-topic="${t.id}" aria-pressed="${state.topics.has(t.id)}">
        <span class="dot" style="--h:${topicHue(t.id)}"></span>${esc(t.label)}<span class="n">${n}</span>
      </button>`;
    })
    .join("");
}

function renderHero() {
  const hero = $("#hero");
  const pool = data.items.filter(ofType).filter((i) => i.rating === 5);
  if (state.query || state.topics.size || !pool.length) {
    hero.hidden = true;
    return;
  }
  // Rotates once per day through the top-rated picks.
  const day = Math.floor(Date.now() / 864e5);
  const item = pool[day % pool.length];
  hero.hidden = false;
  hero.className = "hero";
  hero.innerHTML = `
    <div>
      <span class="eyebrow">${icon("sparkle")} Empfehlung des Tages · ${typeOne(item.type)}</span>
      <h2>${esc(item.title)}</h2>
      <p class="hero__author">${esc(TYPE_TEXT[item.type]?.by ?? "von")} ${esc(item.author)}</p>
      <p class="hero__summary">${esc(item.summary)}</p>
      <div class="hero__actions">
        <a class="btn btn--primary" href="#/${item.id}">Mehr erfahren</a>
        ${rating(item.rating)}
      </div>
    </div>
    <a class="hero__cover" href="#/${item.id}" tabindex="-1" aria-hidden="true">${cover(item)}</a>`;
  hydrateCovers(hero);
}

function listTitle() {
  const type = state.type === "all" ? "Alle Empfehlungen" : typeById.get(state.type)?.label;
  if (state.query) return `Suche: „${state.query}“`;
  if (state.topics.size === 1) return `${type} · ${topicLabel([...state.topics][0])}`;
  return type;
}

function renderResults() {
  const list = data.items.filter(matches).sort(sorters[state.sort] ?? sorters.rating);
  $("#list-title").textContent = listTitle();
  $("#count").textContent = `${list.length} ${list.length === 1 ? "Empfehlung" : "Empfehlungen"}`;

  if (!list.length) {
    $("#results").innerHTML = `<div class="empty">
      <p>Keine Treffer für diese Auswahl.</p>
      <button type="button" class="btn" data-action="reset">Filter zurücksetzen</button>
    </div>`;
    return;
  }

  // Shelves only make sense while browsing broadly; a single topic or a search shows a grid.
  if (state.view === "grid" || state.topics.size === 1 || state.query) {
    $("#results").innerHTML = `<div class="grid">${list.map(card).join("")}</div>`;
  } else {
    $("#results").innerHTML = data.topics
      .filter((t) => !state.topics.size || state.topics.has(t.id))
      .map((t) => ({ t, items: list.filter((i) => i.topics.includes(t.id)) }))
      .filter((g) => g.items.length)
      .map(({ t, items }) => shelf(t.label, items, { hue: topicHue(t.id), topic: t.id }))
      .join("");
  }
  hydrateCovers($("#results"));
}

function renderRail() {
  const pool = data.items.filter(ofType);
  const top = [...pool].sort(sorters.rating).slice(0, 5);
  const counts = data.types
    .filter((t) => t.id !== "all")
    .map((t) => ({ t, n: data.items.filter((i) => i.type === t.id).length }));
  const max = Math.max(...counts.map((c) => c.n));
  $("#rail").innerHTML = `
    <div class="rail__card">
      <h2>Bestenliste</h2>
      <ol class="toplist">${top.map((i) => `<li><a href="#/${i.id}">
        ${cover(i)}
        <div><strong>${esc(i.title)}</strong><span>${esc(i.author)}</span></div>
      </a></li>`).join("")}</ol>
    </div>
    <div class="rail__card">
      <h2>In der Sammlung</h2>
      <div class="mix">${counts.map(({ t, n }) => `<div class="mix__row">
        <span>${esc(t.label)}</span><span class="mix__bar"><i style="width:${(n / max) * 100}%"></i></span><span>${n}</span>
      </div>`).join("")}</div>
    </div>`;
  hydrateCovers($("#rail"));
}

function renderList() {
  renderTypes();
  renderTopics();
  renderHero();
  renderResults();
  renderRail();
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
    .slice(0, 8)
    .map((x) => x.o);
}

function renderDetail(item) {
  const text = TYPE_TEXT[item.type] ?? TYPE_TEXT.book;
  const related = relatedItems(item);
  const more = sameTopicItems(item, new Set(related.map((r) => r.id)));
  const starsHtml = Array.from({ length: 5 }, (_, i) => icon("star", i < item.rating ? "" : "off")).join("");

  $("#page").innerHTML = `
    <section class="page__hero">
      <div class="page__cover">${cover(item)}</div>
      <div>
        <span class="type-pill">${icon(item.type)} ${typeOne(item.type)}</span>
        <h1>${esc(item.title)}</h1>
        ${item.subtitle ? `<p class="page__subtitle">${esc(item.subtitle)}</p>` : ""}
        <p class="page__author">${text.by} <strong>${esc(item.author)}</strong></p>
        <div class="page__rating" aria-label="Bewertung ${item.rating} von 5">${starsHtml}<b>${item.rating}.0</b></div>
        <dl class="facts">
          ${metaFacts(item).map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("")}
        </dl>
        <div class="tags">${item.topics.map((t) =>
          `<a class="tag" href="#t=${t}&view=grid"><span class="dot" style="--h:${topicHue(t)}"></span>${esc(topicLabel(t))}</a>`).join("")}</div>
        <div class="page__actions">
          <a class="btn btn--primary" href="${esc(itemLink(item))}" target="_blank" rel="noopener">${text.cta} ${icon("arrow")}</a>
          <button type="button" class="btn" data-action="share">${icon("link")} Link kopieren</button>
        </div>
      </div>
    </section>

    <div class="page__body">
      <section class="panel">
        <h2>Worum geht's?</h2>
        <p>${esc(item.summary)}</p>
      </section>
      ${item.takeaways?.length ? `<section class="panel">
        <h2>Kernaussagen</h2>
        <ul class="takeaways">${item.takeaways.map((t) => `<li>${icon("check")}<span>${esc(t)}</span></li>`).join("")}</ul>
      </section>` : ""}
    </div>

    ${related.length ? shelf("Passt dazu", related) : ""}
    ${more.length ? shelf("Mehr zum Thema", more) : ""}`;

  document.title = `${item.title} · Leseliste`;
  $("#back").href = `#${listHash}`;
  hydrateCovers($("#page"));
}

/* ---------- Routing ---------- */

function route() {
  const m = location.hash.match(/^#\/(.+)$/);
  const item = m && itemById.get(decodeURIComponent(m[1]));
  const detail = Boolean(item);
  const wasDetail = $("#list-view").hidden;

  if (detail) {
    if (!wasDetail) listScroll = scrollY;
    renderTypes();
    renderTopics();
    renderDetail(item);
    window.scrollTo(0, 0);
  } else {
    readHash();
    renderList();
    document.title = "Leseliste";
    if (wasDetail) requestAnimationFrame(() => window.scrollTo(0, listScroll));
  }
  $("#list-view").hidden = detail;
  $("#detail-view").hidden = !detail;
  $(".app").classList.toggle("is-detail", detail);
}

/* ---------- Events ---------- */

function goList() {
  // Filter controls live in the sidebar, which stays visible on detail pages.
  if (!$("#list-view").hidden) return renderList();
  location.hash = stateToHash() || "all";
}

function bind() {
  window.addEventListener("hashchange", route);

  $("#types").addEventListener("click", (e) => {
    const b = e.target.closest("[data-type]");
    if (!b) return;
    state.type = b.dataset.type;
    state.topics.clear();
    goList();
  });

  $("#topics").addEventListener("click", (e) => {
    const b = e.target.closest("[data-topic]");
    if (!b) return;
    const id = b.dataset.topic;
    state.topics.has(id) ? state.topics.delete(id) : state.topics.add(id);
    goList();
  });

  let t;
  $("#search").addEventListener("input", (e) => {
    clearTimeout(t);
    t = setTimeout(() => { state.query = e.target.value.trim(); goList(); }, 150);
  });

  $("#sort").addEventListener("change", (e) => { state.sort = e.target.value; renderList(); });

  document.querySelectorAll("[data-view]").forEach((b) =>
    b.addEventListener("click", () => { state.view = b.dataset.view; renderList(); })
  );

  $("#results").addEventListener("click", (e) => {
    const show = e.target.closest("[data-show-topic]");
    if (show) {
      state.topics = new Set([show.dataset.showTopic]);
      renderList();
      window.scrollTo({ top: $(".toolbar").offsetTop - 16, behavior: "smooth" });
      return;
    }
    if (!e.target.closest("[data-action=reset]")) return;
    state.query = "";
    state.topics.clear();
    renderList();
  });

  $("#page").addEventListener("click", async (e) => {
    const share = e.target.closest("[data-action=share]");
    if (!share) return;
    try { await navigator.clipboard.writeText(location.href); share.lastChild.textContent = " Kopiert"; }
    catch { share.lastChild.textContent = ` ${location.href}`; }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement.tagName !== "INPUT") {
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
    // Deploys stamp a version on the script URL; reuse it so data and code never mismatch in caches.
    const version = new URL(import.meta.url).searchParams.get("v") ?? "";
    const res = await fetch(`data/items.json?v=${version}`);
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
