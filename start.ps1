# TowerWhisper: start the whole stack with Docker on the first free port, then say where it is.
#
#   .\start.ps1              first free port from 8080 (or from WEB_PORT in .env)
#   .\start.ps1 -Port 9000   first free port from 9000
#   .\start.ps1 -Logs        then follow the logs (Ctrl+C stops following, not the app)
#
# From cmd.exe or a double-click: start.cmd. Stop with: docker compose down
param(
  [int]$Port = 0,
  [switch]$Logs
)

# Native commands report through exit codes; with 'Stop', Windows PowerShell 5.1 would turn
# their stderr (e.g. 'docker compose port' while nothing runs) into a crash.
$ErrorActionPreference = 'Continue'
Set-Location -Path $PSScriptRoot
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$PortTries = 50
$DockerWaitS = 180
$AppWaitS = 240

function Say([string]$text, [string]$color = 'Gray') { Write-Host $text -ForegroundColor $color }
function Fail([string]$text) { Say ''; Say "  x $text" 'Red'; Say ''; exit 1 }

function Test-Docker {
  docker info --format '{{.ServerVersion}}' *> $null
  return $LASTEXITCODE -eq 0
}

# A port is free when we can listen on it on every interface, as Docker will.
function Test-PortFree([int]$p) {
  foreach ($address in @([System.Net.IPAddress]::Any, [System.Net.IPAddress]::IPv6Any)) {
    $listener = $null
    try {
      $listener = [System.Net.Sockets.TcpListener]::new($address, $p)
      $listener.Start()
    } catch {
      if ($address -eq [System.Net.IPAddress]::Any) { return $false }
      # IPv6: taken (or reserved) means busy, as Docker binds [::] too; no IPv6 at all is fine.
      $code = $_.Exception.InnerException.SocketErrorCode
      if ($code -notin 'AddressFamilyNotSupported', 'ProtocolNotSupported') { return $false }
    } finally {
      if ($listener) { $listener.Stop() }
    }
  }
  return $true
}

function Get-EnvPort {
  if (-not (Test-Path '.env')) { return 0 }
  $line = Get-Content '.env' | Where-Object { $_ -match '^\s*WEB_PORT\s*=\s*(\d+)\s*$' } | Select-Object -First 1
  if ($line -and $line -match '(\d+)') { return [int]$Matches[1] }
  return 0
}

function Get-LanIp {
  try {
    $ip = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
      Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' -and $_.PrefixOrigin -in 'Dhcp', 'Manual' -and $_.InterfaceAlias -notmatch 'vEthernet|WSL|Docker|VirtualBox|VMware|Loopback' } |
      Sort-Object -Property { $_.PrefixOrigin -ne 'Dhcp' } |
      Select-Object -First 1
    if ($ip) { return $ip.IPAddress }
  } catch {}
  return $null
}

Say ''
Say '  TowerWhisper · starting the stack' 'Cyan'
Say ''

# 1. Docker running (start Docker Desktop if it is installed but not up).
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Fail 'Docker is not installed: get Docker Desktop from https://www.docker.com/products/docker-desktop/'
}
if (-not (Test-Docker)) {
  $desktop = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
  if (Test-Path $desktop) {
    Say '  · Docker is not running: starting Docker Desktop...'
    Start-Process $desktop
  }
  $waited = 0
  while (-not (Test-Docker)) {
    if ($waited -ge $DockerWaitS) { Fail 'Docker did not start. Open Docker Desktop, wait for "Engine running", then run this again.' }
    Start-Sleep -Seconds 3
    $waited += 3
  }
}
Say '  · Docker is running'

# 2. The port: the one the stack already uses, else the first free one.
$current = docker compose port web 80 2> $null
if ($LASTEXITCODE -eq 0 -and $current -match ':(\d+)\s*$') {
  $chosen = [int]$Matches[1]
  Say "  · TowerWhisper already runs on port ${chosen}: keeping it"
} else {
  $start = if ($Port -gt 0) { $Port } elseif ((Get-EnvPort) -gt 0) { Get-EnvPort } else { 8080 }
  $chosen = 0
  for ($p = $start; $p -lt $start + $PortTries; $p++) {
    if (Test-PortFree $p) { $chosen = $p; break }
    Say "  · port $p is taken, trying $($p + 1)" 'DarkYellow'
  }
  if ($chosen -eq 0) { Fail "No free port between $start and $($start + $PortTries - 1)." }
  Say "  · using port $chosen"
}

# 3. Build and start (the shell variable wins over .env).
$env:WEB_PORT = "$chosen"
Say '  · building and starting the containers (the first build takes a few minutes)...'
Say ''
docker compose up --build -d
if ($LASTEXITCODE -ne 0) { Fail 'docker compose up failed: see the messages above.' }

# 4. Wait until the app answers through nginx.
$url = "http://localhost:$chosen"
$health = $null
$waited = 0
while (-not $health) {
  try { $health = Invoke-RestMethod -Uri "$url/api/health" -TimeoutSec 3 } catch { $health = $null }
  if ($health) { break }
  if ($waited -ge $AppWaitS) { Fail "The app did not answer on $url. See: docker compose logs api web" }
  Start-Sleep -Seconds 2
  $waited += 2
}

# 5. Where to go.
$lan = Get-LanIp
$voice = switch ($health.stt) { 'local-whisper' { 'local Whisper' } 'openai' { 'OpenAI Whisper' } default { 'typed instructions (no speech-to-text configured)' } }
$rows = @(
  @('Controller / supervisor', $url),
  @('Demo panel (phone)', $(if ($lan) { "http://${lan}:$chosen/demo" } else { "$url/demo" })),
  @('ATC login', 'atc@towerwhisper.app / passpass'),
  @('Supervisor login', 'supervisor@towerwhisper.app / passpass'),
  @('Voice', $voice)
)
$width = 74
$line = '─' * ($width - 2)
Say ''
Say "  ┌$line┐" 'Cyan'
Say ("  │  " + 'TOWERWHISPER IS UP AND RUNNING'.PadRight($width - 6) + "  │") 'Cyan'
Say "  ├$line┤" 'Cyan'
foreach ($r in $rows) {
  Write-Host '  │  ' -ForegroundColor Cyan -NoNewline
  Write-Host ($r[0].PadRight(25)) -ForegroundColor Gray -NoNewline
  $value = $r[1]
  if ($value.Length -gt $width - 29) { $value = $value.Substring(0, $width - 32) + '...' }
  Write-Host ($value.PadRight($width - 29)) -ForegroundColor $(if ($r[1] -like 'http*') { 'White' } else { 'Gray' }) -NoNewline
  Write-Host '│' -ForegroundColor Cyan
}
Say "  └$line┘" 'Cyan'
Say ''
Say "  Open $url in Chrome or Edge (the microphone needs localhost or HTTPS)." 'White'
Say '  Logs: docker compose logs -f      Stop: docker compose down' 'DarkGray'
Say ''

if ($Logs) { docker compose logs -f }
