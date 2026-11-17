#!/usr/bin/env bash
# Mac/Linux version of run.ps1:  ./hunt/run.sh grizzly-test [--browser firefox] [--redo b05-0]
set -e
cd "$(dirname "$0")/.."
film="$1"; shift
git pull --rebase
[ -d .venv ] || python3 -m venv .venv
.venv/bin/pip install -q --upgrade -r hunt/requirements.txt
.venv/bin/python hunt/hunt.py "films/$film" "$@"
git add "films/$film"; git commit -m "hunt: $film" || true; git push
