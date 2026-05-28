# MakeCode Arcade Dev Template

A starter template for building [MakeCode Arcade](https://arcade.makecode.com/) games **locally** — with Claude Code and/or VS Code — and round-tripping through the web editor via GitHub. It ships with a JavaScript-only lock (no Blocks tab to accidentally clobber `main.ts`), a local build/serve/debug loop, and the bundled `makecode-arcade` Claude skill.

The web simulator is the only deployment target — there's no hardware build.

## Local development

This template is set up to be edited locally and round-tripped through the web editor via GitHub. The project is locked to **JavaScript-only** editing (`languageRestriction` in `pxt.json`), so the Blocks tab is hidden and `main.ts` stays authoritative.

### Prerequisite: install the MakeCode CLI

The CLI is the npm package **`makecode`** — install it globally:

```bash
npm install -g makecode
mkc --version          # binary is exposed as both `mkc` and `makecode`
```

> ⚠️ Do **not** run `npm install -g mkc` — that's a *different, unrelated* package. The correct package is `makecode`.

Then, in a fresh clone:

```bash
mkc install            # populate pxt_modules/ (needed when pxt.json deps change)
mkc build -j           # compile gate — must exit 0
mkc serve              # local simulator at http://127.0.0.1:7001/
```

The included `Makefile` wraps these: `make build`, `make serve`, `make clean`.

### Optional: VS Code extension

The official **MakeCode Arcade** VS Code extension gives you IntelliSense, an in-editor simulator, and asset previews:

* [MakeCode Arcade — `ms-edu.pxt-vscode-web` on the VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=ms-edu.pxt-vscode-web)

It's already listed as a recommended extension in `mkc.code-workspace`, so VS Code will offer to install it when you open the workspace.

### What's included

* `.claude/skills/makecode-arcade/` — a Claude skill covering Static TypeScript pitfalls, asset handling, the CLI, the GitHub round-trip, and a Playwright test harness.
* `.claude/commands/play-watch.md` + `play-stop.md` — slash commands for a live debug session (you play in a browser, Claude tails game state).
* `config.ts` — a `config.DEBUG` toggle for gating diagnostic logging.
* `tests/` — a game-agnostic Playwright smoke test and watch harness.
* `CLAUDE.md` — project conventions for working in this repo with Claude Code.

## License

[MIT](LICENSE).

---

## Using this with the web editor

### Use as Extension

This repository can be added as an **extension** in MakeCode.

* open [https://arcade.makecode.com/](https://arcade.makecode.com/)
* click on **New Project**
* click on **Extensions** under the gearwheel menu
* search for **https://github.com/greglamb/mkc-arcade-dev-template** and import

### Edit this project

To edit this repository in MakeCode.

* open [https://arcade.makecode.com/](https://arcade.makecode.com/)
* click on **Import** then click on **Import URL**
* paste **https://github.com/greglamb/mkc-arcade-dev-template** and click import

#### Metadata (used for search, rendering)

* for PXT/arcade
<script src="https://makecode.com/gh-pages-embed.js"></script><script>makeCodeRender("{{ site.makecode.home_url }}", "{{ site.github.owner_name }}/{{ site.github.repository_name }}");</script>
