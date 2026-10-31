# TowerWhisper

[![CI](https://github.com/ramongen/towerwhisper/actions/workflows/ci.yml/badge.svg)](https://github.com/ramongen/towerwhisper/actions/workflows/ci.yml)

**An AI co-pilot for air traffic controllers.** Built in 48 hours at Craiova Hackathon v2.

The controller speaks into the microphone (push-to-talk). TowerWhisper transcribes the instruction,
parses it into a structured clearance, plays a simulated pilot readback over a radio-filtered voice,
and raises an alert when:

- the pilot reads back something different from what was said;
- the aircraft does not do what it was told (wrong turn, wrong vertical, level bust);
- nobody has talked to an aircraft for too long.

Traffic is simulated around Craiova airport (LRCV, runway 08/26, ILS on 26, real fixes and navaids
from AIP Romania). AI is used only to understand speech; every safety check is deterministic
TypeScript.

---

## Quick start

> **You need:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) and Git.
> No API keys, no Node, nothing else.

```bash
git clone https://github.com/ramongen/towerwhisper.git
cd towerwhisper
```

Then start everything with one command:

| OS            | Command                         |
| ------------- | ------------------------------- |
| macOS / Linux | `./start.sh`                    |
| Windows       | `start.cmd` (or `.\start.ps1`)  |

When it is ready, the script prints three things:

| What               | Where                              |
| ------------------ | ---------------------------------- |
| Controller console | `http://localhost:<port>`          |
| Demo panel (phone) | `http://<laptop-ip>:<port>/demo`   |
| Login accounts     | see [Accounts](#accounts) below    |

Open the console, click one of the accounts on the login page, and you are in.

**Stop:** `docker compose down`

### What the start script does for you

- starts Docker Desktop if it is not running;
- picks the first free port from 8080 (and keeps the same one on later runs);
- checks for an NVIDIA GPU and runs local Whisper on it, otherwise on the CPU;
- builds and starts the whole stack, waits until it answers, then prints the links.

| Option                       | Effect                                      |
| ---------------------------- | ------------------------------------------- |
| `--logs` / `-Logs`           | follow the logs after start                 |
| `--cpu` / `-Cpu`             | force speech-to-text on the CPU             |

> **First start takes a few minutes:** Docker builds the images and downloads the Whisper model
> (about 0.5 GB on CPU, 3 GB on GPU). Until the model is loaded, typed instructions already work
> and the script tells you so.

### Without the script

```bash
docker compose up --build
```

This runs on `WEB_PORT` from `.env` (8080 by default). The web container prints the same links in
its log, but it cannot move to another port if 8080 is taken (Oracle XE, for example, uses it).

### Good to know

- **The microphone works only on `localhost` or HTTPS.** Use the console on the laptop running
  Docker; the `/demo` panel on the phone does not need the microphone.
- **Phones and screens under 1100 × 600** get a "desktop only" page; `/demo` is the exception.
- **No keys at all?** The demo still works. Push-to-talk uses local Whisper; with
  `WHISPER_URL=off` and no `OPENAI_API_KEY` the app switches to **no-keys mode** (a text input with
  the scripted phrases, pilot voice from `apps/api/assets/tts-cache`, no LLM parser). The top bar
  shows the active source (`STT WHISPER LOCAL`, `STT WHISPER API`, `TEXT MODE`) and
  `GET /api/health` reports the mode.

---

## Accounts

The first start creates these accounts. The login page offers them in one click.

| Email                         | Password   | Role       | Lands on                                        |
| ----------------------------- | ---------- | ---------- | ----------------------------------------------- |
| `atc@towerwhisper.app`        | `passpass` | ATC        | Craiova Approach position (radar, PTT)          |
| `supervisor@towerwhisper.app` | `passpass` | Supervisor | dashboard: every sector, statistics, replay     |

One controller per other sector is also created, same password: `atc.bucuresti@`,
`atc.timisoara@`, `atc.cluj@` and `atc.oradea@towerwhisper.app`.

---

## Try it in two minutes

1. Sign in as `atc@towerwhisper.app`.
2. Hold **Space** and say: _"TAROM 301, descend altitude 4000 feet, turn left heading 080"_.
3. The transcript and the parsed chips appear. About 1.5 s later the pilot reads back over the
   radio and you see **READBACK OK** (or an alert).
4. Open `/demo` on your phone, arm a fault, and transmit again.

### Fault keys

The same faults are available on the controller screen with the keyboard:

| Key | Fault                                               | Expected alert        |
| --- | --------------------------------------------------- | --------------------- |
| 1–5 | wrong altitude / heading / turn / runway / callsign | `HEARBACK_MISMATCH`   |
| 6   | incomplete readback                                 | `READBACK_INCOMPLETE` |
| 7   | no response                                         | `NO_RESPONSE` at 8 s  |
| 8   | turn wrong way                                      | `WRONG_TURN`          |
| 9   | level bust                                          | `LEVEL_BUST`          |

Other keys: **D** demo drawer, **S** results overlay, **R** reset scenario.

The demo panel can also age the comms timers (`NO_CONTACT` amber / red, 30/60 min or 15/30 s),
spawn a conflicting BLUE AIR 12 (`CONFLICT_PREDICTED`), step on the next readback, and set radio
noise and time speed. It lists every sector's session with who is signed in, so you pick the one
to drive.

A new alert pops up with **CLOSE** and **SELECT** aircraft. In the alert panel, **RESOLVE** (with a
confirmation) moves it to the **HISTORY** tab, kept until a scenario reset.

### Landing an aircraft

Runway 26, ILS from the east. Vector an arrival onto the localizer:

> _"WIZZ 44, descend altitude 4000 feet, turn left heading 240, cleared ILS approach runway two six"_

It slows down on final and, about 8 NM out, asks _"request landing clearance"_. Answer
_"WIZZ 44, cleared to land runway two six"_ and it lands and leaves the scope. Without a clearance
it goes around at 1.5 NM. Aircraft without vectors fly their filed route to TITEK / PEMOK / PANZU
and hold at OZZET.

### On the radar

- Three backgrounds (top centre): **CONTOURS**, **TERRAIN** (relief with spot heights in feet) and
  **WX RADAR** (live precipitation in weather-radar colours).
- Click an aircraft for its type, weights, flight plan, runway compatibility and a heading rose.
- Middle-drag pans, the wheel zooms.

---

## Features

### Sectors

Five ROMATSA approach sectors run side by side, each with its own live session (traffic, comms,
alerts, demo faults, recording):

| Sector     | Airport | Notes                                                    |
| ---------- | ------- | -------------------------------------------------------- |
| Craiova    | LRCV    | hand-made demo scenario, AIP data                        |
| București  | LROP    | parallel runways 08L/26R and 08R/26L                     |
| Timișoara  | LRTR    | generated arrivals                                       |
| Cluj       | LRCL    | generated arrivals                                       |
| Oradea     | LROD    | generated arrivals, simulated entry points               |

The four extra sectors get six generated arrivals each along the airport's real STAR points from
AIP ENR 4.4, joining the ILS by themselves about 4 minutes apart. Their runways come from published
aerodrome data (approximate); the CF/LB/RB approach points are simulated. Oradea lies beyond our
ENR 4.4 extract (130 NM around Craiova), so its entry points (ODSOU, ODSEA, ...) are simulated too.
A controller goes straight to the sector set on their account.

### Supervisor dashboard

- **Overview:** a live card per sector (controller signed in, aircraft, active alerts, session
  statistics) with **Watch live** and **Replay**. Below it, statistics over 1 h / 24 h / 7 d / 30 d:
  alerts raised and resolved, mean and median time to resolve, alert rate per hour, alerts by
  severity, type, outcome and sector, controllers, latest alerts.
- **Watch live:** the sector's own screen, read-only (radar, aircraft details, weather, comms with
  the pilot voice, alerts). Another sector is one click away.
- **Replay:** any recorded session on a timeline: radar (every 2 s, interpolated), transcripts,
  pilot voice and the controller's own PTT recordings, alerts as they were. 1–16×, scrub, or
  ← / → (voices play at 1× and 2×).
- **Alerts:** every alert ever raised, with search and filters (sector, type, severity, outcome,
  period). **Replay** on any alert opens its session 20 s before it, with the aircraft selected.
- **Accounts:** create, change role, set an ATC's sector (an open screen moves at once), set a
  password, delete.

**Demo history.** So the dashboard has data from the first start, the API records about 20 short
past sessions per sector (București, Timișoara, Cluj, Oradea) over the last 30 days. They are not
fake rows: each one runs the real simulation, pilots, faults and safety checks headless, with a
scripted controller who calls every arrival and reacts to alerts. It takes about half a minute in
the background after startup and is redone when older than 6 h. Craiova keeps only what is really
done in it.

### Local speech-to-text

The `whisper` container (faster-whisper) is part of the stack, so push-to-talk works with no API
key. PTT audio never leaves the laptop; the OpenAI API is only a fallback when a key is set.

|                | GPU (NVIDIA)              | CPU                       |
| -------------- | ------------------------- | ------------------------- |
| Model          | `large-v3`, float16, CUDA | `small.en`, int8          |
| Speed          | fast                      | 2–3 s per call            |
| Image          | 13 GB download, ~30 GB    | ~3 GB download, ~8 GB     |
| Model download | ~3 GB                     | ~0.5 GB                   |

The start scripts use the GPU only when the image is already there or Docker has ~45 GB free; they
download it with retries and fall back to the CPU if anything fails. If Docker stops during the
start (a full disk does that), they wait, retry and report the free space. GPU by hand:

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up --build
```

---

## Development

Requires Node 20 and pnpm 9 (`npm i -g pnpm@9` or `corepack enable`).

```bash
pnpm install
docker compose up -d db             # Postgres only
pnpm --filter shared build          # rebuild after changing shared types
pnpm --filter api start:dev         # NestJS on :3000
pnpm --filter web dev               # Vite on :5173, proxies /api and /socket.io to :3000
```

Checks: `pnpm -r typecheck`, `pnpm -r lint`, `pnpm --filter api test`.

Pilot audio for the scripted phrases can be generated once into `apps/api/assets/tts-cache` (then
committed) so no-keys mode has a voice:

```bash
OPENAI_API_KEY=sk-... pnpm --filter api tts:cache
```

### Repository layout

```text
apps/web/          Vue 3 SPA: /login, /atc controller position, /supervisor dashboard
                   (live view, replay, accounts), /demo demo panel
apps/api/          NestJS: auth, sectors (one runtime per sector, recording), simulation, voice,
                   parser, pilot, safety, demo, realtime, supervisor, transmissions;
                   scenarios/, test/phrases.json
packages/shared/   domain types, WebSocket events, REST bodies, FaultConfig
```

See `CLAUDE.md` for the project rules and `docs/TowerWhisper-Tech-Spec.pdf` for the full spec.

---

## Team

| Person | Role                 | Owns                                                                              |
| ------ | -------------------- | --------------------------------------------------------------------------------- |
| A      | Voice and parser     | `SttService`, normaliser, rules, `phrases.json`, `CallsignResolver`, `LlmParser`  |
| B      | Simulator and safety | `SimulationService`, Craiova scenario, gateway, `PilotService`, safety checks, DB |
| C      | Main frontend        | `RadarScope`, layout, stores, comms panel, alerts, flight strips, PTT bar         |
| D      | Demo, audio, pitch   | `useRadioVoice`, `TtsService`, `DemoPanel`, `/demo` route, Docker, integration    |
