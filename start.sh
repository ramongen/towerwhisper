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
# Free space Docker's disk needs for the GPU Whisper image (13 GB download, ~30 GB unpacked),
# and below which a failure is probably the disk (GB).
GPU_IMAGE_NEEDS_GB=45
LOW_DISK_GB=10
PULL_ATTEMPTS=3

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
# Docker up, opening Docker Desktop on macOS when it is installed but not running.
wait_docker() {
  docker_up && return 0
  if [ "$(uname)" = "Darwin" ] && [ -d "/Applications/Docker.app" ] && ! pgrep -x Docker >/dev/null; then
    say "  · Docker is not running: starting Docker Desktop..."
    open -a Docker
  fi
  local waited=0 free
  until docker_up; do
    if [ "$waited" -ge "$DOCKER_WAIT_S" ]; then
      free=$(docker_disk_free_gb)
      if [ -n "$free" ] && [ "$free" -lt "$LOW_DISK_GB" ]; then
        fail "Docker is not answering. Its disk has only $free GB free: free some space, restart Docker, then run this again."
      fi
      fail "Docker is not answering. Start it, wait until it is running, then run this again."
    fi
    sleep 3; waited=$((waited + 3))
  done
}
# Free GB where Docker keeps its data (Linux: its data root; Docker Desktop: the home disk).
docker_disk_free_gb() {
  local dir
  dir=$(docker info --format '{{.DockerRootDir}}' 2>/dev/null)
  [ -d "$dir" ] || dir=$HOME
  df -Pk "$dir" 2>/dev/null | awk 'NR == 2 { print int($4 / 1048576) }'
}
# The image the whisper service runs with these compose arguments.
whisper_image() { docker "$@" config 2>/dev/null | awk '/^  whisper:/ { w = 1 } w && /^    image:/ { print $2; exit }'; }
image_present() { docker image inspect "$1" >/dev/null 2>&1; }
# docker pull with retries: an interrupted download resumes from the layers it already has,
# and a Docker that went down meanwhile is waited for.
pull_image() {
  local attempt free
  for ((attempt = 1; attempt <= PULL_ATTEMPTS; attempt++)); do
    docker pull "$1" && return 0
    docker_up || { say "  ${yellow}· Docker stopped during the download: waiting for it to come back...${off}"; wait_docker; }
    free=$(docker_disk_free_gb)
    if [ -n "$free" ] && [ "$free" -lt "$LOW_DISK_GB" ]; then
      say "  ${yellow}· Docker's disk has only $free GB free: not retrying${off}"; return 1
    fi
    [ "$attempt" -lt "$PULL_ATTEMPTS" ] && say "  ${yellow}· download interrupted, retrying ($((attempt + 1))/$PULL_ATTEMPTS)...${off}"
  done
  return 1
}
whisper_ready() { docker "${compose[@]}" logs whisper 2>/dev/null | grep -q 'Application startup complete'; }
# Something already listens on the port (any interface reachable on localhost).
port_busy() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

say ""
say "  ${cyan}TowerWhisper · starting the stack${off}"
say ""

# 1. Docker running (open Docker Desktop on macOS if it is installed but not up).
command -v docker >/dev/null 2>&1 || fail "Docker is not installed: https://www.docker.com/products/docker-desktop/"
wait_docker
say "  · Docker is running"

# Speech-to-text: Whisper on the GPU when Docker can use one, else on the CPU. The GPU image
# is big (13 GB to download, ~30 GB unpacked): it is only used when it is already there or
# fits on Docker's disk, and it is downloaded on its own, with retries, before anything starts.
cpu_args=(compose -f docker-compose.yml)
gpu_args=(compose -f docker-compose.yml -f docker-compose.gpu.yml)
gpu=0; gpu_found=0
[ "$force_cpu" = 1 ] || { gpu_usable && gpu_found=1; }
if [ "$gpu_found" = 1 ]; then
  gpu_image=$(whisper_image "${gpu_args[@]}")
  free=$(docker_disk_free_gb)
  if image_present "$gpu_image"; then
    gpu=1
  elif [ -n "$free" ] && [ "$free" -lt "$GPU_IMAGE_NEEDS_GB" ]; then
    say "  ${yellow}· NVIDIA GPU found, but the GPU Whisper image needs ~$GPU_IMAGE_NEEDS_GB GB free on Docker's disk${off}"
    say "  ${yellow}  (it has $free GB): speech-to-text on the CPU this time${off}"
  else
    say "  · NVIDIA GPU available to Docker: downloading the GPU Whisper image (13 GB, only once)..."
    if pull_image "$gpu_image"; then gpu=1
    else say "  ${yellow}· the GPU Whisper image could not be downloaded: speech-to-text on the CPU${off}"; fi
  fi
fi
if [ "$gpu" = 1 ]; then
  compose=("${gpu_args[@]}")
  say "  · speech-to-text on the GPU"
else
  compose=("${cpu_args[@]}")
  if [ "$force_cpu" = 1 ]; then say "  · speech-to-text on the CPU (--cpu)"
  elif [ "$gpu_found" = 1 ]; then say "  · speech-to-text on the CPU"
  else say "  · no GPU available to Docker: speech-to-text on the CPU"; fi
  cpu_image=$(whisper_image "${cpu_args[@]}")
  if [ -n "$cpu_image" ] && ! image_present "$cpu_image"; then
    say "  · downloading the Whisper image (about 3 GB, only once)..."
    pull_image "$cpu_image" || say "  ${yellow}· the Whisper image could not be downloaded now; docker compose will try again${off}"
  fi
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
up_ok=1
docker "${compose[@]}" up --build -d || up_ok=0
if [ "$up_ok" = 0 ] && ! docker_up; then
  # Docker itself went down (out of disk space, typically): bring it back and try once more.
  say ""
  say "  ${yellow}· Docker stopped while starting the stack: waiting for it to come back...${off}"
  wait_docker
  up_ok=1; docker "${compose[@]}" up --build -d || up_ok=0
fi
if [ "$up_ok" = 0 ] && [ "$gpu" = 1 ]; then
  # The GPU looked usable but the container could not get it: same stack, Whisper on the CPU.
  say ""
  say "  ${yellow}· Whisper could not start on the GPU: starting it on the CPU instead${off}"
  gpu=0
  compose=("${cpu_args[@]}")
  up_ok=1; docker "${compose[@]}" up --build -d || up_ok=0
fi
if [ "$up_ok" = 0 ]; then
  free=$(docker_disk_free_gb)
  if [ -n "$free" ] && [ "$free" -lt "$LOW_DISK_GB" ]; then
    fail "docker compose up failed: see the messages above. Docker's disk has only $free GB free: free some space first."
  fi
  fail "docker compose up failed: see the messages above."
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
    if [ "$gpu" = 1 ]; then voice="Whisper on GPU ($(env_value WHISPER_MODEL large-v3)), $state"
    else voice="Whisper on CPU ($(env_value WHISPER_CPU_MODEL small.en)), $state"; fi ;;
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
