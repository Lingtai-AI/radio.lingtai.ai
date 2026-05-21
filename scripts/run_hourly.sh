#!/usr/bin/env bash
# Hourly driver for Lingtai Radio:
#   - acquire lock
#   - pull latest
#   - generate one track
#   - commit + push if there are changes
#
# Run from launchd / cron. Safe to run manually.

set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

REPO_DIR="/Users/huangzesen/work/GitHub/radio.lingtai.ai"
cd "$REPO_DIR"

LOG_DIR="$REPO_DIR/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/hourly.log"

LOCK_DIR="$REPO_DIR/.radio-lock"

timestamp() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }

log() {
  printf '[%s] %s\n' "$(timestamp)" "$*" >> "$LOG_FILE"
}

release_lock() {
  if [ -d "$LOCK_DIR" ]; then
    rmdir "$LOCK_DIR" 2>/dev/null || true
    log "lock released"
  fi
}
trap release_lock EXIT INT TERM

# Acquire lock (mkdir is atomic across processes).
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  log "another run holds the lock at $LOCK_DIR; exiting"
  exit 0
fi
log "lock acquired"

log "=== run_hourly start ==="

# Pull if a remote is configured.
if git remote get-url origin >/dev/null 2>&1; then
  log "git pull --rebase origin"
  if ! git pull --rebase >> "$LOG_FILE" 2>&1; then
    log "WARN: git pull --rebase failed; continuing"
  fi
else
  log "no origin remote configured; skipping pull"
fi

# Generate one track.
log "running generate_track.py"
set +e
python3 "$REPO_DIR/scripts/generate_track.py" >> "$LOG_FILE" 2>&1
GEN_STATUS=$?
set -e
log "generate_track.py exit=$GEN_STATUS"

# Stage everything we care about (only if present).
STAGE_PATHS=(
  CNAME
  index.html
  styles.css
  radio.js
  data/tracks.json
  assets/tracks
  notes
  logs/.gitkeep
  scripts
  README.md
)
for p in "${STAGE_PATHS[@]}"; do
  if [ -e "$p" ]; then
    git add "$p" >> "$LOG_FILE" 2>&1 || true
  fi
done

# Commit only if there are staged changes.
if ! git diff --cached --quiet; then
  COMMIT_TS="$(timestamp)"
  log "committing changes"
  git commit -m "radio: add hourly track $COMMIT_TS" >> "$LOG_FILE" 2>&1 || {
    log "WARN: git commit failed"
  }

  if git remote get-url origin >/dev/null 2>&1; then
    log "git push origin"
    if ! git push >> "$LOG_FILE" 2>&1; then
      log "WARN: git push failed"
    fi
  else
    log "no origin remote; skipping push"
  fi
else
  log "no staged changes; skipping commit"
fi

log "=== run_hourly done ==="
exit 0
