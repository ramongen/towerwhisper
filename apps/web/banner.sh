#!/bin/sh
# Runs from the nginx image's /docker-entrypoint.d before nginx starts (the api is already
# healthy then: compose waits for it). Says where to open the app; TW_PUBLIC_PORT is the host
# port compose published (WEB_PORT). Shown by "docker compose up" and "docker compose logs web".
port="${TW_PUBLIC_PORT:-8080}"
case "$port" in *[!0-9]*) port=8080 ;; esac
url="http://localhost:$port"

line="════════════════════════════════════════════════════════════════════"
printf '\n'
printf '  ╔%s╗\n' "$line"
printf '  ║  %-66s║\n' "TOWERWHISPER IS UP AND RUNNING"
printf '  ╠%s╣\n' "$line"
printf '  ║  %-24s%-42s║\n' "Controller / supervisor" "$url"
printf '  ║  %-24s%-42s║\n' "Demo panel (phone)" "http://<this-laptop-ip>:$port/demo"
printf '  ║  %-24s%-42s║\n' "ATC login" "atc@towerwhisper.app / passpass"
printf '  ║  %-24s%-42s║\n' "Supervisor login" "supervisor@towerwhisper.app / passpass"
printf '  ╚%s╝\n' "$line"
printf '  Port taken? Start with ./start.sh (macOS, Linux) or start.cmd (Windows):\n'
printf '  they pick the first free port themselves.\n\n'
