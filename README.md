# The Chronicle of Thalorien

Local-first D&D campaign companion: imports four player-facing Markdown documents, keeps every fact tied to its
source line, flags inconsistencies, and shows the world on an interactive map with exploration and strategic modes.

```
npm install
npm run dev      # open http://localhost:5173 and click "Sync from disk"
npm test
```

Source documents are read from `source-files/` or `.source-files/` (or `CHRONICLE_SOURCE_DIR`). Only
`character-sheet.md`, `journal.md`, `campaign-chronicle.md` and `rulings-and-house-rules.md` are ever read; they are
never modified. Data is stored in the browser (IndexedDB).

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — data model and technical decisions
- [docs/HANDOFF.md](docs/HANDOFF.md) — what is implemented, integration contracts, remaining work
