# Hunt footage on your own computer (YouTube, Instagram and TikTok often block GitHub's machines).
#   .\hunt\run.ps1 grizzly-test                 search and download everything still missing
#   .\hunt\run.ps1 grizzly-test -Browser firefox  use your Firefox login (needed for Instagram)
#   .\hunt\run.ps1 grizzly-test -Redo b05-0,b07-1 throw away those shots and find new ones
# Needs: Python 3.10+, ffmpeg and git on PATH. Keys go in a .env file in the repo folder.
param(
  [Parameter(Mandatory = $true)][string]$Film,
  [string]$Browser = "",
  [string]$Redo = "",
  [switch]$NoVision,
  [switch]$NoPush
)
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

git pull --rebase
if (-not (Test-Path .venv)) { python -m venv .venv }
.\.venv\Scripts\python.exe -m pip install -q --upgrade pip
.\.venv\Scripts\python.exe -m pip install -q --upgrade -r hunt\requirements.txt

$a = @("hunt\hunt.py", "films\$Film")
if ($Browser) { $a += @("--browser", $Browser) }
if ($Redo) { $a += @("--redo", $Redo) }
if ($NoVision) { $a += "--no-vision" }
.\.venv\Scripts\python.exe @a

if (-not $NoPush) {
  git add "films/$Film"
  git commit -m "hunt: $Film" 2>$null
  git push
  Write-Host "`nPushed. GitHub is rendering now: open the Actions tab."
}
