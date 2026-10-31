# CLAUDE.md — TowerWhisper

Context for Claude Code working in this repository. The full product spec is in
`docs/TowerWhisper-Tech-Spec.pdf`; this file is the short, binding version.

## What we are building

TowerWhisper is an AI co-pilot for an air traffic controller, built for a 24-hour
hackathon (Craiova Hackathon v2). The user speaks into a microphone as the controller
(push-to-talk). The app transcribes the instruction, parses it into structured data,
plays a simulated pilot readback, and raises alerts when:

- the readback does not match the instruction (`HEARBACK_MISMATCH`, `READBACK_INCOMPLETE`, `NO_RESPONSE`);
- the aircraft does not do what it was told (`WRONG_TURN`, `WRONG_VERTICAL`, `LEVEL_BUST`);
- there has been no communication with an aircraft for too long (`NO_CONTACT`: amber at 30 min, red at 60 min);
- (bonus) the instruction would create a conflict with another aircraft (`CONFLICT_PREDICTED`).

Traffic is **simulated** around Craiova airport (ICAO `LRCV`, runway 08/26, ILS on runway 26), not live data.
Runway, ILS, navaids and fixes are the real ones from AIP Romania (`apps/api/scenarios/lrcv-airspace.json`,
built by `scripts/airspace/build-airspace.mjs`); the spec PDF still says 09/27, the AIP wins.
A hidden demo panel (`/demo`, opened on a phone) injects pilot errors on demand so the
demo is repeatable in front of the jury.

**The single success criterion is a demo that works live, every time.** When in doubt,
choose the option that is simpler and more reliable on stage.

## Stack (do not add to it without asking)

- **Monorepo:** pnpm workspaces, TypeScript everywhere, Node.js 20.
- **Frontend `apps/web`:** Vue 3 (Composition API, `<script setup lang="ts">`), Vite, Pinia,
  plain CSS with custom properties as design tokens. Radar is a native Canvas 2D component.
  No UI kit, no Tailwind, no map library, no Nuxt.
- **Backend `apps/api`:** NestJS, Socket.IO (`@nestjs/websockets`, namespace `/live`),
  TypeORM + PostgreSQL 16.
- **Shared `packages/shared`:** all domain types and WebSocket event payloads. Both apps import
  from here; never redefine these types locally.
- **External APIs:** OpenAI Whisper (`whisper-1`) for STT, OpenAI TTS for the pilot voice,
  Claude API (Haiku) only as a fallback parser. All are optional at runtime (see "No-keys mode").
- **Run:** Docker Compose (`db`, `api`, `web` behind nginx on port 8080).

## Repository layout

```text
apps/web/                 Vue 3 SPA — routes "/" (controller) and "/demo" (demo panel)
  src/components/         RadarScope, CommsPanel, CommsEntry, InstructionChip, AlertCard,
                          AlertStack, FlightStrip, PttBar, DemoPanel, DemoTile, StatsOverlay
  src/stores/             useTrafficStore, useCommsStore, useAlertStore, useDemoStore
  src/composables/        useSocket, useMicrophone, useRadioVoice
  nginx.conf, Dockerfile
apps/api/
  src/session/            SessionModule (SessionService, ScenarioLoader)
  src/simulation/         SimulationModule (SimulationService, AircraftKinematics)
  src/voice/              VoiceModule (SttService, TtsService)
  src/parser/             ParserModule (PhraseNormalizer, RuleParser, LlmParser, CallsignResolver)
  src/pilot/              PilotModule (PilotService, ReadbackBuilder)
  src/safety/             SafetyModule (ReadbackChecker, ConformanceMonitor, CommsWatchdog, ClearanceProbe)
  src/demo/               DemoControlModule (FaultService)
  src/realtime/           RealtimeModule (RealtimeGateway)
  scenarios/              craiova-arrivals.json
  assets/tts-cache/       pre-generated pilot audio for the scripted demo phrases
  test/phrases.json       parser test set (input text -> expected Clearance)
packages/shared/src/      types.ts, events.ts, faults.ts
docker-compose.yml, .env.example, .dockerignore
```

## Commands

```bash
pnpm install
docker compose up -d db                 # Postgres only, for local dev
pnpm --filter shared build              # rebuild after changing shared types
pnpm --filter api start:dev             # NestJS on :3000
pnpm --filter web dev                   # Vite on :5173, proxies /api and /socket.io to :3000
pnpm --filter api test                  # Jest, including parser accuracy over test/phrases.json
pnpm -r lint && pnpm -r typecheck
docker compose up --build               # full stack on http://localhost:8080 (WEB_PORT)
./start.sh  |  start.cmd                # same, on the first free port from 8080, prints the links
```

Run `typecheck` and the relevant tests before saying a task is done.

## Architecture rules (non-negotiable)

1. **AI understands speech; it never makes safety decisions.** Readback checks, conformance
   checks and conflict prediction are deterministic TypeScript in `SafetyModule`. Never call
   an LLM or any network service from `src/safety/`.
2. **The backend is the source of truth.** Simulation, pilot behaviour, faults and alerts live
   in NestJS. The frontend only captures audio, renders state and sends commands.
3. **Rules first, LLM second.** `RuleParser` handles standard ICAO phraseology. `LlmParser` runs
   only when no rule matched, with a hard 2-second timeout, and its output must be validated
   against the `Clearance` type before use. Every `Clearance` records `parsePath: 'rules' | 'llm'`.
4. **The same parser handles controller instructions and pilot readbacks.**
5. **The pilot readback is built from templates (`ReadbackBuilder`), not generated freely**, so
   the demo is deterministic. Faults from `FaultService` alter the template output or the
   simulator targets; they never touch the safety checks.
6. **Every alert explains itself** in `message`, in plain English with the values, e.g.
   `ROT301 cleared 3000 ft, read back 5000 ft`. Put raw values in `details`.
7. **Conformance alerts require persistence:** a deviation must last 4 seconds (simulation time)
   before an alert is raised; alerts clear automatically (`alert:cleared`) when conformance returns.
8. **Contracts live in `packages/shared`.** REST routes and WebSocket events must match the spec
   tables. If you need a new field or event, add it to `shared` first and mention it in your summary.

## Accounts and sectors

- Accounts (`users` table, `src/auth/`): scrypt hashes and HMAC-signed bearer tokens (no extra
  dependency). Roles: `atc` (works one sector, transmits, resolves alerts) and `supervisor` (all
  sectors read-only, statistics, replay, account management). Every REST route needs a token
  unless marked `@Public()` (health, login, audio, radar tiles, sessions and `/demo/*`).
- Sectors (`src/sectors/sectors.ts`): Craiova, București, Timișoara, Cluj and Oradea Approach. Each
  runs its own `SectorRuntime` (simulation, safety checks, pilots, faults, weather, comms,
  recording) side by side. An ATC always acts on its own sector; a supervisor or the demo panel
  name one with the `X-Sector-Id` header and `sector:watch` on the socket (Craiova by default).
- Replay: radar frames every 2 s (`traffic_frames`), full comms payloads with PTT audio, alerts with
  who resolved them. The frontend shows a "desktop only" page below 1100 × 600, except on `/demo`.

## Key thresholds and constants

Keep these in one `constants.ts` per module, not inline:

- Simulation tick 250 ms; `traffic:update` broadcast at 4 Hz.
- Standard turn 3°/s; climb/descent 1500–2000 ft/min; speed change 2 kt/s.
- Pilot response delay ~1.5 s; execution delay 2–3 s; `NO_RESPONSE` after 8 s.
- `WRONG_TURN`: turn rate opposite to cleared direction beyond 0.5°/s.
- `WRONG_VERTICAL`: vertical speed opposite to target beyond 300 ft/min.
- `LEVEL_BUST`: within 300 ft of target with vertical speed still above 1000 ft/min;
  include estimated seconds to bust in the message.
- `NO_CONTACT`: amber at `COMMS_CAUTION_MIN` (default 30), red at `COMMS_WARNING_MIN` (default 60)
  without any transmission to or from the aircraft. The demo panel can switch to 15 s / 30 s.
- `CONFLICT_PREDICTED`: closest approach within 0–5 min, under 3 NM horizontal and under 1000 ft vertical.
- PTT recordings shorter than 300 ms are discarded.

## Comms Watchdog (time since last contact)

- Every `Aircraft` carries `lastContactAt` (simulation time) and `commsAgeS`, both set by the backend
  and sent in `traffic:update`. The frontend displays them; it never computes alerts from them.
- `lastContactAt` resets on any controller transmission addressed to the aircraft and on any pilot
  transmission from it, readback included. Selecting the aircraft or ACKing an alert does not reset it.
- `CommsWatchdog` runs every tick, uses simulation time (so it follows the demo time scale), raises
  `NO_CONTACT` as caution at the first limit, upgrades the same alert to warning at the second, and
  clears it on the next transmission. Message format: `No communication with DLH9TC for 61 min (limit 60 min)`.
- Limits live in `FaultConfig.commsLimits` (`cautionS`, `warningS`), seeded from env, changeable via
  `PUT /api/demo/faults`. Demo triggers: `POST /api/demo/triggers/age-comms` `{ callsign, ageS }` and
  `POST /api/demo/triggers/reset-comms` `{ callsign }`.
- UI: radar data block line 4 `LC mm:ss` (grey / amber / red) and the aircraft symbol takes the same
  colour; flight strip shows `LAST CALL mm:ss` and its edge takes the colour.

## ATC domain notes

- Callsigns: ICAO code in data (`ROT301`), telephony in speech (`TAROM 301`). Scenario aircraft:
  ROT301 (AT76), WZZ44 (A21N), ROT612 (B738), LOT2RP (E195), RYR8KQ (B38M), DLH9TC (CRJ9).
- Normalise ICAO number pronunciation before parsing: `niner`→9, `tree`→3, `fife`→5,
  `flight level six zero`→`FL060`, `runway two six`→`RWY26`.
- Altitudes below the transition level are in feet (`altitude 3000 feet`); above it, flight levels.
- Runway 26 means a true heading of about 269° (ILS 26 from the east, IF OZZET, IAFs TITEK / PEMOK / PANZU);
  keep example instructions geometrically plausible.
- `CallsignResolver` matches fuzzily (Levenshtein ≤ 2 on the name, digits exact) **only** against
  aircraft currently in the session; fall back to the aircraft selected on the radar.

## Frontend rules

- Main screen targets 1920×1080 on a projector: dark theme only, data in a monospace font,
  data text ≥ 14 px, alert reasons ≥ 16 px. Colour carries meaning only (cyan = selected/ATC,
  amber = caution, red = warning, green = confirmed readback). Alerts also need an icon and a label.
- Design tokens live in `apps/web/src/styles/tokens.css`; when a design from Claude Design is
  provided, take values from it into tokens instead of hard-coding colours in components.
- `RadarScope` must stay smooth at 60 fps with 8 aircraft: render on `requestAnimationFrame`,
  interpolate between 4 Hz server updates, and never trigger Vue reactivity per frame
  (read store state into plain objects).
- Use only relative URLs (`/api/...`, `io('/live')`) so the same build works behind nginx.
- The pilot voice must play through Web Audio (`useRadioVoice`: band-pass ~300–3000 Hz, light
  distortion, noise at the demo-panel level, squelch clicks). Browser `speechSynthesis` cannot be
  routed through Web Audio; use it only as an offline fallback.
- `getUserMedia` only works on `localhost` or HTTPS. The `/demo` panel must not need the microphone.

## No-keys mode

If `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` are missing, the app must still start and the full demo
must still work:

- PTT is replaced by a text input with the scripted phrases (`POST /api/transmissions/text`).
- Pilot audio comes from `assets/tts-cache`; if a phrase is not cached, show the readback as text only.
- `LlmParser` is disabled; unparsed phrases are marked as such.

Log once at startup which mode is active. Never crash on a missing key or a failed external call.

## Docker

- `api` must call `app.setGlobalPrefix('api')`, expose `GET /api/health`, and listen on `0.0.0.0:3000`.
- TypeORM uses `synchronize: true` (acceptable for the hackathon); no migrations.
- `.env` is optional (`required: false` in Compose). Never commit `.env` or real keys;
  keep `.env.example` up to date when adding a variable.
- After changing dependencies or Dockerfiles, confirm `docker compose up --build` still works.

## Working style

- Priority order for any work: MVP demo flow (speak → parse → readback → check → alerts → comms
  watchdog → demo panel)
  first, then polish, then bonus features (Clearance Probe, replay, OpenSky background, LLM pilot).
  Do not start a bonus feature while an MVP step is broken.
- Keep changes small and focused; do not refactor unrelated code.
- When adding a phrase pattern to `RuleParser`, add test cases to `test/phrases.json` in the same change.
- Prefer readable code over clever code; this will be explained to a jury.
- Do not add dependencies, services or external APIs without asking first.
