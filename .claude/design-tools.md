# Design tooling: installed vs. on-demand

Source: Ray Fu, "20 GitHub Repos for Your AI Design Studio" (raycfu.com, Nov 2026).
Install commands are from that guide, except the shadcn and Lucide ones, which are the standard commands from those projects. Check each repo's README before running, since they can change.

## Installed (project scope, declared in `.claude/settings.json`)

| Plugin | Skills |
|---|---|
| `example-skills@anthropic-agent-skills` | frontend-design, canvas-design, theme-factory, webapp-testing, web-artifacts-builder, algorithmic-art, brand-guidelines, … |
| `document-skills@anthropic-agent-skills` | pptx, docx, xlsx, pdf |
| `ui-ux-pro-max@ui-ux-pro-max-skill` | ui-ux-pro-max, design-system, brand, ui-styling, slides, banner-design, design |

## On demand: install only when a task needs it

### Skills
- **Stitch Skills** (`google-labs-code/stitch-skills`): text-to-UI screen ideas. Needs a Google Stitch account.
  `npx plugins add google-labs-code/stitch-skills --scope project --target claude-code`

### Libraries: add inside the website project being built, not here
- **shadcn/ui** (`shadcn-ui/ui`): copy-in components you can edit. `npx shadcn@latest init`
- **Tailwind CSS** (`tailwindlabs/tailwindcss`): utility classes; most of the other tools assume it.
- **Magic UI** (`magicuidesign/magicui`): animated components. Use one or two per page at most.
- **Lucide** (`lucide-icons/lucide`): the only icon set to use. `npm i lucide-react`
- **Astryx** (`meta/astryx`): Meta's design system. Still beta, so tell the client before using it.

### Format
- **DESIGN.md** (`google-labs-code/design.md`): one file per brand with colours, fonts and spacing plus the reasons for them. Write it, don't install it.

### MCP servers: each needs the user's own account or token
- **21st Magic MCP** (`21st-dev/magic-mcp`): searches 10k+ React/Tailwind components. Needs a 21st account; old API keys were reset.
  `npx @21st-dev/cli@latest init --client claude`
- **Figma Context MCP** (`GLips/Figma-Context-MCP`): reads real layouts from Figma links. Needs a Figma personal access token. Ask for it with the credential tool; never paste it in chat or commit it.
  `claude mcp add figma -- npx -y figma-developer-mcp --figma-api-key=YOUR-KEY --stdio`
- **Penpot** (`penpot/penpot`): open-source Figma alternative with an official MCP server in the repo.

### Standalone tools
- **rembg** (`danielgatis/rembg`): local background removal. Downloads a model on first run.
  `pip install "rembg[cpu,cli]"` then `rembg i in.png out.png` (`rembg p in_dir out_dir` for a folder)
- **Leonardo** (`adobe/leonardo`): builds a palette from a target contrast ratio.
- **Excalidraw** (`excalidraw/excalidraw`): hand-drawn wireframes to agree a layout before building.
- **tldraw** (`tldraw/tldraw`): embeddable canvas. Needs a licence key in production.
- **agent-browser** (`vercel-labs/agent-browser`): only needed on a local machine. Cloud sessions already have Playwright/Chromium plus the `webapp-testing` skill.
  `npm install -g agent-browser && agent-browser install`

## Network note
Cloud sessions run with limited network. If an install fails to resolve a host, add that exact host to the environment's allowed domains.
