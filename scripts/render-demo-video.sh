#!/usr/bin/env bash
# Render the captions-only demo video, fully headlessly.
#
# Pipeline:
#   scripts/demo.sh (DEMO_CAPTIONS=1)  ->  asciinema cast  ->  agg GIF
#   ->  ffmpeg 720p terminal segment  +  viewer still segment  ->  concat
#   ->  videos/agentgov-demo-captioned.mp4
#
# Re-run after editing the caption text in scripts/demo.sh to regenerate.
# To record a voiceover cut instead, run scripts/demo.sh directly with
# DEMO_CAPTIONS=0 and narrate over it (see docs/demo-script.md).
#
# Requires: asciinema (pip install --user asciinema), agg (cargo install
# --git https://github.com/asciinema/agg), ffmpeg, fontconfig, node (nvm).
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

SANS="$(fc-match -f '%{file}' 'DejaVu Sans:bold')"

# 1. Record the captioned demo. Clean open: pre-clean outputs/ and pass
#    DEMO_FRESH=0 so no housekeeping line lands on the first frame.
cat > "$WORK/run.sh" <<EOF
#!/usr/bin/env bash
source ~/.nvm/nvm.sh >/dev/null 2>&1; nvm use default >/dev/null 2>&1
cd "$ROOT"
rm -rf outputs; mkdir -p outputs
[ -f dist/cli.js ] || npm run build >/dev/null
export DEMO_CAPTIONS=1 DEMO_PACE=1 DEMO_FRESH=0 CAPTION_HOLD=5
exec bash scripts/demo.sh
EOF
chmod +x "$WORK/run.sh"
asciinema rec --overwrite -c "bash $WORK/run.sh" "$WORK/demo.cast"

# 2. cast -> GIF (Fira Mono, dark theme by default)
agg --font-family "Fira Mono" --font-size 20 "$WORK/demo.cast" "$WORK/term.gif"

# 3. GIF -> normalized 720p terminal segment
ffmpeg -y -i "$WORK/term.gif" \
  -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0x0f1822,format=yuv420p" \
  -r 30 -c:v libx264 "$WORK/seg_term.mp4"

# 4. Viewer still segment (6s) with a caption bar
printf 'Verdict Inspector: every decision signed, browsable, exportable' > "$WORK/cap.txt"
ffmpeg -y -loop 1 -i docs/viewer-screenshot.png -t 6 \
  -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0x0f1822,drawbox=y=ih-96:w=iw:h=96:color=0x0f1822@0.9:t=fill,drawtext=fontfile='$SANS':textfile=$WORK/cap.txt:fontcolor=white:fontsize=30:x=(w-text_w)/2:y=h-64,format=yuv420p" \
  -r 30 -c:v libx264 "$WORK/seg_viewer.mp4"

# 5. Concat -> final
ffmpeg -y -i "$WORK/seg_term.mp4" -i "$WORK/seg_viewer.mp4" \
  -filter_complex "[0:v][1:v]concat=n=2:v=1:a=0[v]" -map "[v]" \
  -r 30 -pix_fmt yuv420p -c:v libx264 -movflags +faststart "$OUT"

echo "Rendered $OUT"
ffprobe -v error -show_entries format=duration:stream=width,height -of default=noprint_wrappers=1 "$OUT"
