#!/usr/bin/env bash
# Render the captioned demo video at 1080p, fully headlessly.
#
# Pipeline:
#   title card  +  scripts/demo.sh (DEMO_CAPTIONS=1, recorded in a sized PTY so
#   the terminal fills a 1080p frame)  ->  asciinema cast  ->  agg GIF (large font)
#   ->  ffmpeg 1920x1080 terminal segment  +  viewer still  +  outro card
#   ->  concat  ->  videos/agentgov-demo-captioned.mp4
#
# The recording size is forced via a pseudo-terminal (asciinema otherwise locks
# to 80x24 when there is no controlling TTY, which is why earlier cuts looked
# small and letterboxed). Tune COLS/ROWS/FONT below to trade text size against
# how much output fits before it scrolls.
#
# Requires: asciinema, agg, ffmpeg, fontconfig, python3, node (nvm).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
OUT="videos/agentgov-demo-captioned.mp4"
mkdir -p videos

export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
command -v asciinema >/dev/null || { echo "need asciinema: pip install --user asciinema"; exit 1; }
command -v agg       >/dev/null || { echo "need agg: cargo install --git https://github.com/asciinema/agg"; exit 1; }
command -v ffmpeg    >/dev/null || { echo "need ffmpeg"; exit 1; }
command -v python3   >/dev/null || { echo "need python3"; exit 1; }

SANS="$(fc-match -f '%{file}' 'DejaVu Sans:bold')"
COLS=108
ROWS=26
FONT=32

# ── 1. Record the captioned demo inside a PTY sized COLS x ROWS ───────────────
cat > "$WORK/run.sh" <<EOF
#!/usr/bin/env bash
source ~/.nvm/nvm.sh >/dev/null 2>&1; nvm use default >/dev/null 2>&1
cd "$ROOT"
rm -rf outputs; mkdir -p outputs
[ -f dist/cli.js ] || npm run build >/dev/null
export DEMO_CAPTIONS=1 DEMO_PACE=3 DEMO_FRESH=0 CAPTION_HOLD=5
exec bash scripts/demo.sh
EOF
chmod +x "$WORK/run.sh"

python3 - "$WORK/run.sh" "$WORK/demo.cast" "$COLS" "$ROWS" <<'PY'
import os, pty, sys, struct, fcntl, termios, select
runsh, out, cols, rows = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
pid, fd = pty.fork()
if pid == 0:
    fcntl.ioctl(0, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))
    os.execvp("asciinema", ["asciinema", "rec", "--overwrite", "-c", "bash " + runsh, out])
else:
    while True:
        try:
            r, _, _ = select.select([fd], [], [], 1)
            if fd in r and not os.read(fd, 65536):
                break
        except OSError:
            break
    os.waitpid(pid, 0)
PY

# ── 2. cast -> GIF (large font for a crisp 1080p downscale) ───────────────────
agg --font-family "Fira Mono" --font-size "$FONT" "$WORK/demo.cast" "$WORK/term.gif"

# Sample the terminal background so padding/cards are seamless (no letterbox seam).
BG_HEX="$(ffmpeg -v error -i "$WORK/term.gif" -frames:v 1 -vf "crop=8:8:0:0,scale=1:1" -f rawvideo -pix_fmt rgb24 - | od -An -tx1 | tr -d ' \n')"
BG="0x${BG_HEX:0:6}"
echo "terminal background: $BG"

# ── 3. GIF -> 1080p terminal segment ─────────────────────────────────────────
ffmpeg -y -i "$WORK/term.gif" \
  -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=$BG,format=yuv420p" \
  -r 30 -c:v libx264 -crf 18 -pix_fmt yuv420p "$WORK/seg_term.mp4"

# ── 4. Title card ────────────────────────────────────────────────────────────
printf 'AgentGov' > "$WORK/t1.txt"
printf 'Trust and Release Governance for Copilot Studio' > "$WORK/t2.txt"
printf 'Microsoft Agent Academy   Special Ops' > "$WORK/t3.txt"
ffmpeg -y -f lavfi -i "color=c=$BG:s=1920x1080:d=4.5" \
  -vf "drawtext=fontfile='$SANS':textfile=$WORK/t1.txt:fontcolor=white:fontsize=150:x=(w-text_w)/2:y=350,drawtext=fontfile='$SANS':textfile=$WORK/t2.txt:fontcolor=0x7cc7ff:fontsize=46:x=(w-text_w)/2:y=545,drawtext=fontfile='$SANS':textfile=$WORK/t3.txt:fontcolor=0x9aa7b4:fontsize=34:x=(w-text_w)/2:y=625,format=yuv420p" \
  -r 30 -c:v libx264 -crf 18 -pix_fmt yuv420p "$WORK/seg_title.mp4"

# ── 5. Viewer still (with caption bar) ───────────────────────────────────────
printf 'Verdict Inspector  -  every decision signed, browsable, exportable' > "$WORK/cv.txt"
ffmpeg -y -loop 1 -i docs/viewer-screenshot.png -t 6 \
  -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=$BG,drawbox=y=ih-110:w=iw:h=110:color=$BG@0.92:t=fill,drawtext=fontfile='$SANS':textfile=$WORK/cv.txt:fontcolor=white:fontsize=36:x=(w-text_w)/2:y=h-72,format=yuv420p" \
  -r 30 -c:v libx264 -crf 18 -pix_fmt yuv420p "$WORK/seg_viewer.mp4"

# ── 6. Outro card ────────────────────────────────────────────────────────────
printf 'AgentGov' > "$WORK/o1.txt"
printf 'Open source   MCP server + CLI   14 tools   signed audit trail' > "$WORK/o2.txt"
printf 'github.com/oneKn8/agentgov' > "$WORK/o3.txt"
ffmpeg -y -f lavfi -i "color=c=$BG:s=1920x1080:d=5" \
  -vf "drawtext=fontfile='$SANS':textfile=$WORK/o1.txt:fontcolor=white:fontsize=140:x=(w-text_w)/2:y=360,drawtext=fontfile='$SANS':textfile=$WORK/o2.txt:fontcolor=0x9aa7b4:fontsize=38:x=(w-text_w)/2:y=545,drawtext=fontfile='$SANS':textfile=$WORK/o3.txt:fontcolor=0x7cc7ff:fontsize=46:x=(w-text_w)/2:y=620,format=yuv420p" \
  -r 30 -c:v libx264 -crf 18 -pix_fmt yuv420p "$WORK/seg_outro.mp4"

# ── 7. Concat title -> terminal -> viewer -> outro ───────────────────────────
ffmpeg -y -i "$WORK/seg_title.mp4" -i "$WORK/seg_term.mp4" -i "$WORK/seg_viewer.mp4" -i "$WORK/seg_outro.mp4" \
  -filter_complex "[0:v][1:v][2:v][3:v]concat=n=4:v=1:a=0[v]" -map "[v]" \
  -r 30 -pix_fmt yuv420p -c:v libx264 -crf 18 -movflags +faststart "$OUT"

echo "Rendered $OUT"
ffprobe -v error -show_entries format=duration:stream=width,height -of default=noprint_wrappers=1 "$OUT"
