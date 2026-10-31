#!/usr/bin/env bash
# TowerWhisper: start the whole stack with Docker on the first free port, then say where it is.
#
#   ./start.sh               first free port from 8080 (or from WEB_PORT in .env)
#   ./start.sh 9000          first free port from 9000
#   ./start.sh 9000 --logs   then follow the logs (Ctrl+C stops following, not the app)
#
# Windows: start.ps1 / start.cmd. Stop with: docker compose down
set -u
cd "$(dirname "$0")"

PORT_TRIES=50
DOCKER_WAIT_S=180
APP_WAIT_S=240

cyan=$'\033[36m'; yellow=$'\033[33m'; red=$'\033[31m'; white=$'\033[97m'; grey=$'\033[90m'; off=$'\033[0m'
say() { printf '%s\n' "$*"; }
fail() { printf '\n  %sx %s%s\n\n' "$red" "$*" "$off"; exit 1; }

docker_up() { docker info >/dev/null 2>&1; }
# Something already listens on the port (any interface reachable on localhost).
port_busy() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

say ""
say "  ${cyan}TowerWhisper · starting the stack${off}"
say ""

# 1. Docker running (open Docker Desktop on macOS if it is installed but not up).
command -v docker >/dev/null 2>&1 || fail "Docker is not installed: https://www.docker.com/products/docker-desktop/"
if ! docker_up; then
  if [ "$(uname)" = "Darwin" ] && [ -d "/Applications/Docker.app" ]; then
    say "  · Docker is not running: starting Docker Desktop..."
    open -a Docker
  fi
  waited=0
  until docker_up; do
    [ "$waited" -ge "$DOCKER_WAIT_S" ] && fail "Docker did not start. Start it, wait until it is running, then run this again."
    sleep 3; waited=$((waited + 3))
  done
fi
say "  · Docker is running"

# 2. The port: the one the stack already uses, else the first free one.
current=$(docker compose port web 80 2>/dev/null | sed -n 's/.*:\([0-9][0-9]*\)$/\1/p' | head -n1)
if [ -n "$current" ]; then
  chosen=$current
  say "  · TowerWhisper already runs on port $chosen: keeping it"
else
  env_port=$(sed -n 's/^[[:space:]]*WEB_PORT[[:space:]]*=[[:space:]]*\([0-9][0-9]*\)[[:space:]]*$/\1/p' .env 2>/dev/null | head -n1)
  start=${1:-${env_port:-8080}}
  case "$start" in ''|*[!0-9]*) start=${env_port:-8080} ;; esac
  chosen=""
  for ((p = start; p < start + PORT_TRIES; p++)); do
    if port_busy "$p"; then say "  ${yellow}· port $p is taken, trying $((p + 1))${off}"; else chosen=$p; break; fi
  done
  [ -n "$chosen" ] || fail "No free port between $start and $((start + PORT_TRIES - 1))."
  say "  · using port $chosen"
fi

# 3. Build and start (the shell variable wins over .env).
export WEB_PORT=$chosen
say "  · building and starting the containers (the first build takes a few minutes)..."
say ""
docker compose up --build -d || fail "docker compose up failed: see the messages above."

# 4. Wait until the app answers through nginx.
url="http://localhost:$chosen"
waited=0
until health=$(curl -fsS --max-time 3 "$url/api/health" 2>/dev/null); do
  [ "$waited" -ge "$APP_WAIT_S" ] && fail "The app did not answer on $url. See: docker compose logs api web"
  sleep 2; waited=$((waited + 2))
done

# 5. Where to go.
lan=""
if [ "$(uname)" = "Darwin" ]; then lan=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
else lan=$(hostname -I 2>/dev/null | awk '{print $1}'); fi
demo="${lan:+http://$lan:$chosen/demo}"; demo=${demo:-$url/demo}
case "$health" in
  *local-whisper*) voice="local Whisper" ;;
  *'"openai"'*) voice="OpenAI Whisper" ;;
  *) voice="typed instructions (no speech-to-text configured)" ;;
esac

width=74
line=$(printf '─%.0s' $(seq 1 $((width - 2))))
row() { printf "  ${cyan}│${off}  %-25s${2}%-$((width - 29))s${off}${cyan}│${off}\n" "$1" "$3"; }
say ""
say "  ${cyan}┌${line}┐${off}"
printf "  ${cyan}│  %-$((width - 6))s  │${off}\n" "TOWERWHISPER IS UP AND RUNNING"
say "  ${cyan}├${line}┤${off}"
row "Controller / supervisor" "$white" "$url"
row "Demo panel (phone)" "$white" "$demo"
row "ATC login" "" "atc@towerwhisper.app / passpass"
row "Supervisor login" "" "supervisor@towerwhisper.app / passpass"
row "Voice" "" "${voice:0:45}"
say "  ${cyan}└${line}┘${off}"
say ""
say "  ${white}Open $url in Chrome or Edge (the microphone needs localhost or HTTPS).${off}"
say "  ${grey}Logs: docker compose logs -f      Stop: docker compose down${off}"
say ""

for arg in "$@"; do [ "$arg" = "--logs" ] && exec docker compose logs -f; done
exit 0
