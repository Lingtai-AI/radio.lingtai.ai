#!/usr/bin/env python3
"""Generate one Lingtai Radio track via the MiniMax `mmx` CLI.

Picks a prompt based on the current hour and a rotating cast of motifs
(Lingtai, Bodhi, Guanyin, Monkey King), invokes `mmx music generate`,
appends a record to data/tracks.json, and writes a Markdown note.
"""

from __future__ import annotations

import datetime as dt
import json
import os
import random
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
TRACKS_DIR = REPO_ROOT / "assets" / "tracks"
NOTES_DIR = REPO_ROOT / "notes"
DATA_FILE = REPO_ROOT / "data" / "tracks.json"

MOTIFS = {
    "lingtai": [
        "moonlight pooling on the Lingtai grotto's stone steps",
        "incense smoke drifting through the Lingtai cave at dawn",
        "the patriarch's bell ringing once across the Lingtai valley",
        "wind in the pines above the Lingtai grotto",
    ],
    "bodhi": [
        "Subhuti the Bodhi patriarch tracing a single character in sand",
        "a quiet sermon under the bodhi tree, the leaves listening",
        "the patriarch's brushwork on rice paper, slow and certain",
        "moonlit meditation in the cave of slanted moon and three stars",
    ],
    "guanyin": [
        "Guanyin's willow branch sprinkling sweet dew over the southern sea",
        "Guanyin standing on a lotus, looking down at a far shore",
        "the bottle of pure water tilting, a single drop falling",
        "Guanyin's compassion carried on a soft sea wind",
    ],
    "monkey_king": [
        "Sun Wukong leaping between cloud and mountain, somersault clouds trailing",
        "the Monkey King at rest on Flower-Fruit Mountain, ten thousand monkeys quiet",
        "the iron staff humming, ready, but lowered",
        "the Monkey King studying his own shadow at the edge of a cliff",
    ],
}

HOURLY_MOODS = [
    # 0..23 — one mood per hour of the day, loose Buddhist/Journey-to-the-West color
    "midnight stillness, deep gongs, distant water dripping",            # 00
    "the hour of the rat, sparse koto and breath",                       # 01
    "ink wash before dawn, low strings",                                 # 02
    "the hour of the tiger, monastery courtyard waking",                 # 03
    "first light over pine ridges, hesitant flute",                      # 04
    "morning bell, slow temple chant texture (instrumental)",            # 05
    "sunrise over the western road, hopeful guzheng",                    # 06
    "tea steaming on a stone table, gentle pipa",                        # 07
    "pilgrims set out, walking rhythm, light percussion",                # 08
    "midmorning sun on yellow earth, warm strings",                      # 09
    "wind crossing the desert, sparse erhu",                             # 10
    "noon meditation, suspended chords, almost still",                   # 11
    "midday heat shimmer, soft drone and bamboo flute",                  # 12
    "afternoon clouds gathering, layered xiao and koto",                 # 13
    "shadows lengthening on monastery walls, contemplative",             # 14
    "tea ceremony at the hour of the monkey, playful pipa",              # 15
    "sun low over distant peaks, golden brass-like swells",              # 16
    "evening bell across the valley, reverberant",                       # 17
    "lanterns lit one by one, gentle plucked strings",                   # 18
    "night meditation, deep drone, slow breath",                         # 19
    "stars over the grotto, sparse celesta-like textures",               # 20
    "the hour of the dog, distant temple chime",                         # 21
    "late night writing by oil lamp, ink and paper",                     # 22
    "approaching midnight, returning to stillness",                      # 23
]


def pick_prompt(now_local: dt.datetime) -> str:
    hour = now_local.hour
    mood = HOURLY_MOODS[hour % 24]

    # Rotate primary motif by hour so each hour favors a different figure,
    # then jitter so we don't get the same secondary line twice in a row.
    motif_keys = list(MOTIFS.keys())
    primary_key = motif_keys[hour % len(motif_keys)]
    secondary_key = motif_keys[(hour + 1 + random.randint(0, 2)) % len(motif_keys)]

    primary = random.choice(MOTIFS[primary_key])
    secondary = random.choice(MOTIFS[secondary_key])

    style_tags = [
        "instrumental",
        "cinematic",
        "east asian classical fusion",
        "guzheng, pipa, erhu, bamboo flute, soft pads",
        "contemplative",
        "no vocals",
    ]
    random.shuffle(style_tags)

    return (
        f"{mood}; {primary}; with a hint of {secondary}; "
        f"{', '.join(style_tags[:4])}."
    )


def load_tracks() -> list[dict]:
    if not DATA_FILE.exists():
        return []
    try:
        with DATA_FILE.open("r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            return data
        return []
    except (json.JSONDecodeError, OSError):
        return []


def save_tracks(tracks: list[dict]) -> None:
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    with DATA_FILE.open("w", encoding="utf-8") as f:
        json.dump(tracks, f, ensure_ascii=False, indent=2)
        f.write("\n")


def write_note(
    slug: str,
    title: str,
    timestamp: str,
    prompt: str,
    command: list[str],
    out_file: Path,
) -> Path:
    NOTES_DIR.mkdir(parents=True, exist_ok=True)
    note_path = NOTES_DIR / f"{slug}.md"
    cmd_str = " ".join(_shell_quote(c) for c in command)
    rel_out = out_file.relative_to(REPO_ROOT)
    body = (
        f"# {title}\n\n"
        f"- **Slug:** `{slug}`\n"
        f"- **Generated:** {timestamp}\n"
        f"- **Output:** `{rel_out}`\n\n"
        f"## Prompt\n\n"
        f"> {prompt}\n\n"
        f"## Command\n\n"
        f"```sh\n{cmd_str}\n```\n"
    )
    note_path.write_text(body, encoding="utf-8")
    return note_path


def _shell_quote(s: str) -> str:
    if not s:
        return "''"
    safe = all(ch.isalnum() or ch in "@%+=:,./-_" for ch in s)
    if safe:
        return s
    return "'" + s.replace("'", "'\\''") + "'"


def main() -> int:
    now_utc = dt.datetime.now(dt.timezone.utc)
    now_local = dt.datetime.now()
    slug = now_local.strftime("%Y%m%d-%H%M%S")
    timestamp = now_utc.isoformat(timespec="seconds")

    prompt = pick_prompt(now_local)

    TRACKS_DIR.mkdir(parents=True, exist_ok=True)
    out_file = TRACKS_DIR / f"{slug}.mp3"

    command = [
        "mmx",
        "music",
        "generate",
        "--model",
        "music-2.6-free",
        "--prompt",
        prompt,
        "--instrumental",
        "--out",
        str(out_file),
        "--non-interactive",
        "--no-color",
        "--timeout",
        "900",
    ]

    print(f"[generate_track] slug={slug}")
    print(f"[generate_track] prompt={prompt}")
    print(f"[generate_track] command={' '.join(_shell_quote(c) for c in command)}")

    try:
        proc = subprocess.run(
            command,
            cwd=str(REPO_ROOT),
            check=False,
            text=True,
            capture_output=True,
            timeout=960,
        )
    except FileNotFoundError:
        print("[generate_track] ERROR: `mmx` CLI not found on PATH", file=sys.stderr)
        return 127
    except subprocess.TimeoutExpired:
        print("[generate_track] ERROR: mmx timed out", file=sys.stderr)
        return 124

    if proc.stdout:
        print(proc.stdout)
    if proc.stderr:
        print(proc.stderr, file=sys.stderr)

    if proc.returncode != 0:
        print(
            f"[generate_track] mmx exited with status {proc.returncode}",
            file=sys.stderr,
        )
        return proc.returncode

    if not out_file.exists():
        print(
            f"[generate_track] ERROR: expected output not found at {out_file}",
            file=sys.stderr,
        )
        return 1

    title = now_local.strftime("Lingtai Broadcast — %Y-%m-%d %H:%M")
    rel_out = out_file.relative_to(REPO_ROOT).as_posix()

    record = {
        "id": slug,
        "title": title,
        "created_at": timestamp,
        "prompt": prompt,
        "file": rel_out,
        "duration": None,
    }

    tracks = load_tracks()
    tracks.insert(0, record)
    save_tracks(tracks)

    write_note(
        slug=slug,
        title=title,
        timestamp=timestamp,
        prompt=prompt,
        command=command,
        out_file=out_file,
    )

    print(f"[generate_track] OK -> {rel_out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
