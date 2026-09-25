# 📚 Leseliste

Kuratierte Empfehlungen – Bücher, Hörbücher, Podcasts, YouTube und Artikel – mit Kurzzusammenfassung, Kernaussagen und Gliederung nach Themen. Statische Seite auf GitHub Pages.

## Features (Prototyp)

- Tabs für alle Medientypen (Alle · Bücher · Hörbücher · Podcasts · YouTube · Artikel)
- Karten mit Cover, Bewertung, Kurzzusammenfassung
- **Detailseite** (`#/<id>`) mit großem Cover, Eckdaten, Kernaussagen, „Passt dazu“ und „Mehr zum Thema“
- Echte Buchcover über die [Open Library](https://openlibrary.org) (im Browser geladen und gecacht); ohne Treffer ein generiertes Cover
- Filter nach Themen (Mehrfachauswahl), Volltextsuche (`/` fokussiert die Suche), Sortierung
- Ansicht „Nach Themen“ (gegliedert) oder „Raster“
- Filterzustand steckt in der URL → teilbare Links
- Hell/Dunkel-Modus, mobil optimiert
- Kein Build-Schritt: reines HTML/CSS/JS

## Inhalte pflegen

Alles steht in [`data/items.json`](data/items.json). Neues Buch = neuer Eintrag in `items`:

```json
{
  "id": "eindeutige-id",
  "type": "book",
  "title": "Titel",
  "subtitle": "Untertitel (optional)",
  "author": "Autor:in",
  "year": 2024,
  "pages": 300,
  "topics": ["psychologie"],
  "rating": 4,
  "summary": "2–3 Sätze Zusammenfassung.",
  "takeaways": ["Kernaussage 1", "Kernaussage 2"],
  "link": "https://… (optional, sonst Suchlink)",
  "related": ["andere-id"],
  "coverSearch": { "title": "Originaltitel", "author": "Autor" },
  "cover": "https://… (optional, feste Cover-URL)"
}
```

Weitere optionale Felder:

- `lists` – in welcher Liste der Eintrag steht: `thomas` (Empfohlen von Thomas Härry) und/oder `michi` (Von Michi gehört). Die Listen sind unter `lists` oben in der Datei definiert.
- `series` und `seriesNo` – Reihe und Band, z. B. `"Ulldart"` / `4`. Bände werden in Reihenfolge sortiert, auf der Detailseite erscheint „Mehr aus der Reihe“.
- `platform` – z. B. `"Google Play Books"` (der Button verlinkt dann auf die Google-Play-Suche) oder `"Pocket Casts"`.
- `rating` ist optional. Einträge ohne Bewertung zeigen keine Sterne.

Für Nicht-Bücher gibt es zusätzlich `duration` (Minuten), `format` (z. B. „TED Talk“, „YouTube-Kanal“) und `source` (z. B. „Wait But Why“). `type` ist einer von `book`, `audiobook`, `podcast`, `video`, `article`.

- `related` verknüpft Einträge – die Verknüpfung wirkt in beide Richtungen.
- `coverSearch` hilft bei deutschen Titeln: gesucht wird nach dem Originaltitel.

Themen und Medientypen sind ebenfalls in der Datei definiert (`topics`, `types`).

## Lokal ansehen

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

## Veröffentlichen

1. Branch nach `main` mergen.
2. Im Repo unter **Settings → Pages → Build and deployment → Source** „GitHub Actions“ wählen.
3. Der Workflow `.github/workflows/pages.yml` deployt bei jedem Push auf `main`.

## Roadmap

- [x] Bücher mit Zusammenfassung, Themen, Filter, Suche
- [x] 🎧 Hörbücher · 🎙️ Podcasts · ▶️ YouTube · 📰 Artikel
- [x] Detailseite mit Cover
- [x] Verknüpfungen „Passt dazu“ (z. B. Buch ↔ Artikel ↔ Video)
- [x] Echte Buchcover via Open Library
- [ ] Vorschaubilder für YouTube (braucht feste Video-/Kanal-IDs)
- [ ] Hörbücher: Sprecher:in, Laufzeit, Plattform-Links
- [ ] Einzelne Podcast-Folgen statt nur ganzer Shows
- [x] Listen: „Empfohlen von Thomas Härry“ und „Von Michi gehört“
- [x] Reihen mit Bandnummer
- [ ] Eigene Bewertungen für Michis Hörbücher
- [ ] Englisch/Deutsch-Umschalter
