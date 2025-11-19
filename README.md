# POCAS LARP Setting Generator

Local-first prototype for running a 10-year speculative rehearsal of collaborative tactics in Mexico City. The app rolls POCAS scenario axes, gathers participant “protocolitos,” evaluates them with a nearby LM Studio model, and keeps a running world + participant history to mirror the players’ physical session.

## Quick Start

```bash
npm install
npm start
```

Requirements:

- Node.js 18+
- LM Studio (or any OpenAI-compatible server) reachable at `http://127.0.0.1:1234/v1/chat/completions`
- A model loaded in LM Studio (we tested with `hermes-3-llama-3.1-8b`)

Optional environment overrides (defaults shown):

```bash
export PORT=3001
export HOST=0.0.0.0
export LM_STUDIO_URL=http://127.0.0.1:1234/v1/chat/completions
export LM_STUDIO_MODEL=hermes-3-llama-3.1-8b
export LM_TEMPERATURE=0.85
export LM_MAX_TOKENS=600
export MAX_SCENARIO_CHARS=1400
```

## Project Structure

```
├── package.json
├── public/           # Minimal frontend (index, styles, vanilla JS)
├── src/
│   ├── server.js     # HTTP server, API endpoints, LM orchestration
│   ├── axes.js       # Axis & difficulty helpers
│   ├── lmClient.js   # LM Studio fetch wrapper
│   └── promptLoader.js
├── prompts/
│   ├── participants/ # system + user prompts for participant creation
│   └── protocolitos/ # prompts for per-protocolito eval + phase summary
└── data/
    ├── game-state.json
    ├── world-history.jsonl
    ├── participants-history.jsonl
    └── protocolitos.json
```

### Persistent Files

- `data/game-state.json` – current phase index and last evaluation.
- `data/world-history.jsonl` – every scenario update emitted by LocalAI.
- `data/participants-history.jsonl` – participants, manual or generated.
- `data/protocolitos.json` – submitted protocolitos and all evaluations.

JSONL files append one JSON object per line for easy log-style review.

## Gameplay Loop

1. **Timeline** — Five phases representing 1 month, 5 months, 1.5 years, 3 years, 5 years (total ~10 years). A sticky header shows progress.
2. **Scenario Generation** — The frontend calls `POST /api/setting`. The server rolls the four axes (Government/Environment/Social/Capital) via `src/axes.js`, loads markdown prompts, and asks LM Studio for a seeded setting short enough to fit `MAX_SCENARIO_CHARS`.
3. **Participant Creation** — Players either fill in the form or click “Generate a character,” hitting `POST /api/participant` with `mode: manual|generate`. Each participant is stored with condition/workload/caretaking info for later capacity checks.
4. **Protocolitos** — Facilitators create small voluntary agreements by selecting any subset of participants and describing the protocol. Each record goes to `POST /api/protocolito` and is stored for the current phase.
5. **Advance Phase** — When ready, “Advance to next phase” triggers:
   - For every pending protocolito, the server calls LM Studio with prompts in `prompts/protocolitos/eval-*`. Each micro-call only knows about that protocolito, its participants, the scenario, and the pocos capacity snapshot. Results are parsed into status, verdict, capacity check, outcome, and effects.
   - Once all micro-evals finish, another LM call (`prompts/protocolitos/summary-*`) reads all the evaluations and emits a refreshed scenario/pocas summary/collective capabilities/phase reflection.
   - Records are merged into `protocolitos.json`, `world-history.jsonl`, and `participants-history.jsonl`. `game-state.json` increments the phase index and caches the latest evaluation bundle.
   - The frontend reloads `GET /api/state` to show the new scenario plus an expandable evaluation under each protocolito.

## API Overview

| Method | Path                 | Description                                      |
|--------|----------------------|--------------------------------------------------|
| GET    | `/`                  | Serves `public/index.html`                       |
| POST   | `/api/setting`       | Roll axes, fetch scenario from LM Studio         |
| POST   | `/api/participant`   | Create manual or generated participant           |
| GET    | `/api/participants`  | Most recent 100 participants                     |
| DELETE | `/api/participants`  | Clear participant history                        |
| POST   | `/api/protocolito`   | Record a protocolito for the current phase       |
| POST   | `/api/advance-phase` | Run per-protocolito + summary evaluations        |
| POST   | `/api/reset`         | Reset history, protocolitos, and game state      |
| GET    | `/api/state`         | Aggregate view (phases, scenario, participants…) |

Every endpoint returns JSON (`{ error: '...' }` on failure). Static assets (`public/`) are served by the same Node `http` server.

## Frontend Behavior

- Single-column layout with CSS utility classes for panels, buttons, and “neon” accents.
- Sticky timeline (with Reset button) always shows the five phases and current index.
- Scenario card displays the latest LM response with `white-space: pre-line` and a “Generating” state while awaiting the server.
- Participants panel:
  - “Add Participant” toggles the manual form or allows character generation via LM Studio.
  - Stored participants show pronouns, condition, workload, caretaking, and skills.
- Protocolitos panel:
  - New agreements require selecting at least one participant and entering text.
  - Each protocolito now shows an inline `<details>`/`<summary>` block containing the evaluation (status, design verdict, capacity, outcome, effects, narrative). Line breaks in LM output are preserved using `formatText()` (HTML-escaped + `<br>` conversion).
  - The bottom “Phase Evaluation” section lists all protocolitos from the most recent `/api/advance-phase`, along with the updated scenario/pocas summary/collective capabilities/phase reflection.

## Prompt Set

All prompts are plain markdown under `prompts/`. Highlights:

- `prompts/settings/*` – system + user prompt for scenario generation.
- `prompts/participants/*` – generate grounded participants (combined condition field).
- `prompts/protocolitos/eval-*` – per-protocolito micro-evaluation.
- `prompts/protocolitos/summary-*` – synthesize overall phase results.

Each prompt enforces natural-language formatting (no JSON), and the server parses the structured sections by regex. This avoids large context windows and repeated “invalid JSON” failures.

## Troubleshooting

- **Status stuck at “uncertain”** – ensure the LM model follows the `Status:` instruction (the parser now trims extra words, but unrecognized strings default to `uncertain`).
- **Truncated scenario** – set `MAX_SCENARIO_CHARS` (default 1400) or shorten prompts.
- **LocalAI connection issues** – confirm LM Studio is running, the model is loaded, and the endpoint (URL/model name) matches the environment variables.
- **Reset everything** – click “Reset Game” (or call `POST /api/reset`) to wipe world, participants, protocolitos, and start from Phase 1.

## Future Ideas

- Persist LM usage stats per call for better insight.
- Add authentication or multi-session support if running for multiple groups simultaneously.
- Export summaries as printable PDFs for facilitators.

Enjoy building and rehearsing your POCAS worlds! 🎭

