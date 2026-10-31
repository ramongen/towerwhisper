#!/usr/bin/env bash
# TowerWhisper: start the whole stack with Docker on the first free port, then say where it is.
#
#   ./start.sh               first free port from 8080 (or from WEB_PORT in .env)
#   ./start.sh 9000          first free port from 9000
#   ./start.sh 9000 --logs   then follow the logs (Ctrl+C stops following, not the app)
#   ./start.sh --cpu         speech-to-text on the CPU even when there is a GPU
#
# Speech-to-text (local Whisper) runs on the NVIDIA GPU when Docker can use one, else on the
# CPU: nothing to set in .env. Windows: start.ps1 / start.cmd. Stop with: docker compose down
set -u
cd "$(dirname "$0")"

PORT_TRIES=50
DOCKER_WAIT_S=180
APP_WAIT_S=240
# How long to wait for Whisper's model before printing the links anyway (s).
WHISPER_WAIT_S=60

port_arg=""; logs=0; force_cpu=0
for arg in "$@"; do
  case "$arg" in
    --logs) logs=1 ;;
    --cpu) force_cpu=1 ;;
    *[!0-9]*|'') ;;
    *) port_arg=$arg ;;
  esac
done

cyan=$'\033[36m'; yellow=$'\033[33m'; red=$'\033[31m'; white=$'\033[97m'; grey=$'\033[90m'; off=$'\033[0m'
say() { printf '%s\n' "$*"; }
fail() { printf '\n  %sx %s%s\n\n' "$red" "$*" "$off"; exit 1; }

docker_up() { docker info >/dev/null 2>&1; }
# A value from .env, or the default when it is missing or empty.
env_value() {
  local v
  v=$(grep -E "^[[:space:]]*$1[[:space:]]*=" .env 2>/dev/null | head -n1 | cut -d= -f2- | tr -d '[:space:]')
  printf '%s' "${v:-$2}"
}
# An NVIDIA driver on this machine, and Docker able to hand the GPU to a container.
gpu_usable() {
  command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi -L >/dev/null 2>&1 || return 1
  say "  · NVIDIA driver found: checking that Docker can use the GPU..."
  docker run --rm --gpus all alpine:3.20 true >/dev/null 2>&1
}
whisper_ready() { docker "${compose[@]}" logs whisper 2>/dev/null | grep -q 'Application startup complete'; }
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

# Speech-to-text: Whisper on the GPU when Docker can use one, else on the CPU.
gpu=0
[ "$force_cpu" = 1 ] || { gpu_usable && gpu=1; }
compose=(compose -f docker-compose.yml)
if [ "$gpu" = 1 ]; then
  compose+=(-f docker-compose.gpu.yml)
  say "  · NVIDIA GPU available to Docker: speech-to-text on the GPU"
else
  say "  · no GPU available to Docker: speech-to-text on the CPU"
fi

# 2. The port: the one the stack already uses, else the first free one.
current=$(docker compose port web 80 2>/dev/null | sed -n 's/.*:\([0-9][0-9]*\)$/\1/p' | head -n1)
if [ -n "$current" ]; then
  chosen=$current
  say "  · TowerWhisper already runs on port $chosen: keeping it"
else
  env_port=$(sed -n 's/^[[:space:]]*WEB_PORT[[:space:]]*=[[:space:]]*\([0-9][0-9]*\)[[:space:]]*$/\1/p' .env 2>/dev/null | head -n1)
  start=${port_arg:-${env_port:-8080}}
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
if ! docker "${compose[@]}" up --build -d; then
  [ "$gpu" = 1 ] || fail "docker compose up failed: see the messages above."
  # The GPU looked usable but the container could not get it: same stack, Whisper on the CPU.
  say ""
  say "  ${yellow}· Whisper could not start on the GPU: starting it on the CPU instead${off}"
  gpu=0
  compose=(compose -f docker-compose.yml)
  docker "${compose[@]}" up --build -d || fail "docker compose up failed: see the messages above."
fi

# 4. Wait until the app answers through nginx.
url="http://localhost:$chosen"
waited=0
until health=$(curl -fsS --max-time 3 "$url/api/health" 2>/dev/null); do
  [ "$waited" -ge "$APP_WAIT_S" ] && fail "The app did not answer on $url. See: docker compose logs api web"
  sleep 2; waited=$((waited + 2))
done

# Whisper loads its model on start (the first start downloads it): give it a little time.
waited=0
until whisper_ready || [ "$waited" -ge "$WHISPER_WAIT_S" ]; do sleep 3; waited=$((waited + 3)); done
whisper_ready && state="ready" || state="loading model..."

# 5. Where to go.
lan=""
if [ "$(uname)" = "Darwin" ]; then lan=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
else lan=$(hostname -I 2>/dev/null | awk '{print $1}'); fi
demo="${lan:+http://$lan:$chosen/demo}"; demo=${demo:-$url/demo}
case "$health" in
  *local-whisper*)
    if [ "$gpu" = 1 ]; then voice="Whisper on GPU ($(env_value WHISPER_MODEL large-v3)) · $state"
    else voice="Whisper on CPU ($(env_value WHISPER_CPU_MODEL small.en)) · $state"; fi ;;
  *'"openai"'*) voice="OpenAI Whisper" ;;
  *) voice="typed instructions (no speech-to-text)" ;;
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
if [[ "$health" == *local-whisper* && "$state" != ready ]]; then
  say "  ${yellow}Whisper is still loading its model (the first start downloads it): push-to-talk works in${off}"
  say "  ${yellow}a few minutes; typing works now. Progress: docker compose logs -f whisper${off}"
fi
say "  ${grey}Logs: docker compose logs -f      Stop: docker compose down${off}"
say ""

[ "$logs" = 1 ] && exec docker compose logs -f
exit 0
