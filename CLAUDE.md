# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

This repo has two components:
- **`card-gen/`** — generates a printable card PDF from `data/cards.json` using fpdf2 (Python)
- **`game/`** — browser-playable implementation of the game (TypeScript + Vite)

## Commands

Primary interface via `just` (requires [just](https://github.com/casey/just)):

```bash
just setup      # install all dependencies (uv sync + npm install)
just dev        # dev server at http://localhost:5173
just test       # run vitest (single run)
just test-watch # run vitest in watch mode
just pdf        # generate card PDF (card-gen/cards.pdf)
just md         # generate card list Markdown (docs/cards.md)
just build      # production build
just deploy     # build + firebase deploy
```

### Card generator (run from `card-gen/`)

```bash
cd card-gen && uv run generate_cards.py             # output: card-gen/cards.pdf
cd card-gen && uv run generate_cards.py output/my_cards.pdf
```

**Font requirement (Linux/WSL):** Japanese text rendering requires Noto CJK fonts.

```bash
sudo apt install fonts-noto-cjk
```

### Browser game (run from `game/`)

```bash
cd game && npm run dev      # dev server at http://localhost:5173
cd game && npm run test:run # run vitest (single run)
```

## Architecture

```
eoj-reboot/
├── data/
│   ├── cards.json          # card data source
│   ├── cards.schema.json   # JSON schema for cards.json
│   └── rulebook.md         # machine-readable rule summary
├── card-gen/
│   ├── generate_cards.py   # PDF renderer (CardPDF subclass)
│   └── generate_card_md.py # generates docs/cards.md
└── game/
    ├── src/
    │   ├── data/cards.ts   # imports data/cards.json
    │   ├── engine/         # game logic (see below)
    │   ├── ui/             # browser UI screens (see below)
    │   └── firebase/       # Firebase auth/firestore wrappers
    └── tests/
```

- **`card-gen/generate_cards.py`** — the entire PDF renderer, implemented as a single `CardPDF(FPDF)` subclass
- **`data/cards.json`** — the data source; must conform to `data/cards.schema.json`

### Engine modules (`game/src/engine/`)

| File | Responsibility |
|---|---|
| `types.ts` | Shared types: `GameState`, `Board`, `CharInstance`, `CellIndex`, etc. |
| `effectSpecs.ts` | Card effect declarations: `EFFECT_SPECS`, `ULT_SPECS`, `ITEM_SPECS` |
| `board.ts` | Board geometry, cell targeting (`resolveSelectCells`) |
| `combat.ts` | Attack resolution (damage, counter, blind-spot) |
| `effects.ts` | Summon / on_attack effect application |
| `pendingEffects.ts` | UI-deferred effect application (post target-selection) |
| `ults.ts` | Ult effect application |
| `items.ts` | Item effect application |
| `gamestate.ts` | State initialisation (`createCharInstance`, HP bonuses) |
| `turn.ts` | Turn lifecycle: start phase, draw step, cleanup |
| `draft.ts` | Draft phase logic |
| `cost.ts` | Cost calculation and reduction |
| `victory.ts` | Victory condition evaluation |

### UI modules (`game/src/ui/`)

| File | Responsibility |
|---|---|
| `app.ts` | Global state management, screen routing |
| `game.ts` | Game screen renderer and event handlers |
| `draft.ts` | Draft screen |
| `lobby.ts` | Online lobby screen |
| `login.ts` | Firebase login screen |
| `over.ts` | Game-over screen |

### Key design principle

**Card-specific effect data belongs exclusively in `engine/effectSpecs.ts`.**
`EFFECT_SPECS`, `ULT_SPECS`, and `ITEM_SPECS` are the single source of truth for what each card does. UI code in `ui/game.ts` must **not** hard-code card IDs — it derives targeting and flow from spec data via `resolveSelectCells()` and `getFirstSelectTarget()`. When adding or changing a card's effect, edit only `effectSpecs.ts` (and `items.ts` / `effects.ts` / `ults.ts` for implementation).

### Data model (`data/cards.json`)

Top-level keys:
- `keyword_effects` — `{keyword: short_description}` dict used to render keyword lines on cards
- `characters` — array of `Character` objects (rendered with attack/weakness grids)
- `items` — array of `Item` objects (rendered with a simpler layout)

**Character ID pattern:** `^[a-z_]+_v2_[0-9]{2}$` (e.g. `aggro_v2_01`)

**`attack_cells`** is one of:
- `"all"` — 全域 (area-of-effect magic), rendered as a single labeled cell
- `null` — cannot attack
- `[[row, col], ...]` — relative coordinates; row positive = forward, col positive = right

**`weakness_cells`** defaults to `[[-1, 0]]` (directly behind) when omitted.

Valid factions: `aggro`, `tank`, `control`, `synergy`, `snipe`, `trick`  
Valid attributes: `拳`, `念`, `光`, `闇`, `虚`  
Valid keywords: `先制`, `防護`, `不動`, `カバー`, `要塞`, `回避`, `貫通`

### Card rendering flow

`card-gen/generate_cards.py` draws each card via `draw_card()` (characters) or `draw_item_card()` (items):

1. **Header** — attribute circle, name, faction, cost, reactivation cost
2. **Graphic** — gray placeholder rectangle
3. **Lower half** — stats line, keywords, effect text, ult block, attack/weakness grids, VP box

Text overflow is handled by `_multi_cell_j()` which uses kinsoku (行頭・行末禁則) line-breaking. Warnings are printed to stderr when text is clipped or a name is too wide.

Grid geometry anchors to the card bottom; the attack grid height varies by the number of rows needed (`_attack_rows()`), while the weakness grid is always 3 rows.

## Development practices

### Testing policy (TDD)

**Test-Driven Development を原則とする。**

- エンジン層（`game/src/engine/`）の変更は必ずテストを先に書いてから実装する
- バグ修正の場合: 再現するテストを先に追加 → 修正 → テストがパス することを確認
- 機能追加の場合: 期待動作を記述したテストを先に追加 → 実装
- UI層（`game/src/ui/`）は DOM/state 依存のためエンジン側テストで代替できる範囲をカバーする

テスト実行: `just test` または `cd game && npm run test:run`

## Game reference

`data/rulebook.md` — machine-readable rule summary for the game engine  
`docs/EOJR_Rulebook.md` — complete official rulebook  
`docs/cards.md` — full card list with stats and effects (generated by `just md`)
