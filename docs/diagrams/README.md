# Diagram sources

The architecture SVGs in `../architecture*.svg` are rendered from these Mermaid sources. Edit the `.mmd` files, regenerate the SVGs, commit both.

## Regenerate

```sh
# requires npx, node 22+, and a Chromium binary
npx -y -p @mermaid-js/mermaid-cli mmdc \
  -i docs/diagrams/architecture.mmd \
  -o docs/architecture.svg \
  -b transparent

npx -y -p @mermaid-js/mermaid-cli mmdc \
  -i docs/diagrams/architecture-trust.mmd \
  -o docs/architecture-trust.svg \
  -b transparent

npx -y -p @mermaid-js/mermaid-cli mmdc \
  -i docs/diagrams/architecture-release.mmd \
  -o docs/architecture-release.svg \
  -b transparent
```

If Chromium is not auto-discovered (common on Linux outside of Puppeteer's bundled install), pass a local puppeteer config:

```sh
cat > /tmp/puppeteer.json <<EOF
{ "executablePath": "/usr/bin/google-chrome",
  "args": ["--no-sandbox", "--disable-setuid-sandbox"] }
EOF

npx -y -p @mermaid-js/mermaid-cli mmdc -p /tmp/puppeteer.json \
  -i docs/diagrams/architecture.mmd -o docs/architecture.svg -b transparent
```

## Theme

Themes are pinned in each `.mmd` frontmatter (`theme: base`) with explicit color variables, not via the `-t` CLI flag (which only accepts the four built-in themes: `default`, `forest`, `dark`, `neutral`). The pinned colors match the AgentGov dark palette and stay readable on GitHub light + dark backgrounds.
