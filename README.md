# 📚 Leseliste

Kuratierte Buchempfehlungen mit Kurzzusammenfassung, Kernaussagen und Gliederung nach Themen – als statische Seite auf GitHub Pages.

## Features (Prototyp)

- Buchkarten mit generiertem Cover, Bewertung, Kurzzusammenfassung
- Detailansicht mit Kernaussagen und Link zum Buch
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
  "link": "https://… (optional, sonst Open-Library-Suche)"
}
```

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
- [ ] 🎧 Hörbücher (Sprecher:in, Laufzeit, Plattform-Links)
- [ ] 🎙️ Podcasts (einzelne Folgen oder ganze Shows)
- [ ] ▶️ YouTube-Videos (mit Vorschaubild, Dauer)
- [ ] 📰 Artikel im Netz (Quelle, Lesezeit)
- [ ] Verknüpfungen: „Passt dazu“ – z. B. Buch ↔ Podcast-Folge mit dem Autor
- [ ] Status-Tags („Gelesen“, „Will ich lesen“) und Merkliste
- [ ] Echte Cover (z. B. via Open Library Covers API)
- [ ] Englisch/Deutsch-Umschalter

Die Medientypen sind im Datenmodell bereits angelegt (`type`-Feld). Für einen neuen Typ reicht es, in `types` den `status` auf `"live"` zu setzen und Einträge mit dem passenden `type` hinzuzufügen.
