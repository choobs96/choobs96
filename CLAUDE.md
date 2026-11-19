# CLAUDE.md

## Design work
- Design skill plugins are enabled in `.claude/settings.json` (frontend-design, theme-factory, canvas-design, pptx, ui-ux-pro-max, …).
- Tools deliberately **not** installed (Stitch, shadcn/ui, Tailwind, Magic UI, Lucide, Astryx, DESIGN.md, Figma/Penpot/21st MCPs, rembg, Leonardo, Excalidraw, tldraw, agent-browser) are listed with install commands and caveats in `.claude/design-tools.md`. Read it whenever a task needs one of them, and install only what that task needs.
- Every design request: check the result with Playwright screenshots at 1440px and 390px wide and fix anything broken before presenting it.
