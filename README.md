# Lingtai Radio

Hourly instrumental broadcasts from the Lingtai grotto — Bodhi, Guanyin,
Monkey King, and the long road west. Static GitHub Pages site served at
[radio.lingtai.ai](https://radio.lingtai.ai).

A launchd job fires every hour at minute 0, invokes the MiniMax `mmx` CLI
to generate one instrumental track, appends it to `data/tracks.json`,
writes a Markdown note, and pushes a commit. GitHub Pages serves the
resulting static site.

## Layout

```
CNAME                          radio.lingtai.ai
index.html  styles.css  radio.js
data/tracks.json               playlist consumed by radio.js
assets/tracks/<slug>.mp3       generated audio
notes/<slug>.md                per-broadcast prompt + command
scripts/generate_track.py      one-shot generator
scripts/run_hourly.sh          launchd entry point
deploy/com.lingtai.radio-hourly.plist.example
logs/hourly.log                appended each run
```

## Prerequisites

- macOS with `launchd`
- `git`, `python3`, `gh`
- MiniMax `mmx` CLI on `PATH`, already authenticated. This site defaults to `music-2.6`; override with `LINGTAI_RADIO_MUSIC_MODEL` if the plan changes.

## First-time setup

### 1. Create the GitHub repository and push

```sh
cd /Users/huangzesen/work/GitHub/radio.lingtai.ai
git add .
git commit -m "radio: initial scaffold"
gh repo create Lingtai-AI/radio.lingtai.ai --public --source=. --remote=origin --push
```

### 2. Enable GitHub Pages (main / root)

```sh
gh api -X POST repos/Lingtai-AI/radio.lingtai.ai/pages \
  -f 'source[branch]=main' \
  -f 'source[path]=/' \
  || gh api -X PUT repos/Lingtai-AI/radio.lingtai.ai/pages \
       -f 'source[branch]=main' \
       -f 'source[path]=/'
```

Set the custom domain (the `CNAME` file in the repo also does this on push):

```sh
gh api -X PUT repos/Lingtai-AI/radio.lingtai.ai/pages \
  -f 'cname=radio.lingtai.ai' \
  -F 'https_enforced=true'
```

### 3. DNS

In the `lingtai.ai` DNS zone, add a CNAME:

```
radio   CNAME   Lingtai-AI.github.io.
```

(Lowercase is fine; GitHub Pages resolves `<org>.github.io` for custom domains.)

### 4. Install the hourly launchd job

```sh
mkdir -p ~/Library/LaunchAgents ~/.lingtai-tui/cron
cp deploy/com.lingtai.radio-hourly.plist.example \
   ~/Library/LaunchAgents/com.lingtai.radio-hourly.plist

launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.lingtai.radio-hourly.plist
launchctl enable    gui/$(id -u)/com.lingtai.radio-hourly
```

To trigger one run immediately for testing:

```sh
launchctl kickstart -k gui/$(id -u)/com.lingtai.radio-hourly
# or directly:
bash scripts/run_hourly.sh
```

To stop it:

```sh
launchctl bootout gui/$(id -u)/com.lingtai.radio-hourly
```

## Logs

- `logs/hourly.log` — per-run log, committed-ignored (`.gitignore`).
- `~/.lingtai-tui/cron/radio-hourly.out.log` / `.err.log` — launchd stdout/stderr.

## Manual generation

```sh
python3 scripts/generate_track.py
```

This writes `assets/tracks/<slug>.mp3`, prepends a record to
`data/tracks.json`, and drops a note in `notes/<slug>.md`. It does not
commit; `run_hourly.sh` handles that.

## Notes

- The site is intentionally a plain static page — no build step, no
  framework. `radio.js` fetches `data/tracks.json` and renders the
  playlist.
- The lock directory `.radio-lock/` prevents overlapping runs and is
  always released, even on failure.
- `run_hourly.sh` only commits when there are staged changes, so a
  failed `mmx` call won't produce empty commits.
