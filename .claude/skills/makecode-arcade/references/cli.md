# MakeCode CLI Reference

The CLI is the **npm package `makecode`** (binary aliased as both `makecode` and `mkc`), from https://github.com/microsoft/pxt-mkc.

## Critical: do not install the wrong package

The npm registry contains a *different, unrelated* package literally named `mkc`. **Do not install it.** Verbatim from the pxt-mkc README:

> *"Do not install the npm `mkc` package, it is another package."*

Correct:
```bash
npm install -g makecode
mkc --version          # works
makecode --version     # also works
```

Wrong:
```bash
npm install -g mkc     # ❌ installs an unrelated tool
```

## Subcommands

| Command | What it does |
|---|---|
| `mkc init <template> [extensions...]` | Initialize an empty folder. Arcade: `mkc init arcade`. `mkc help init` lists templates. Optional extras become deps. |
| `mkc install` | Download extension sources into `pxt_modules/` so the local TypeScript IDE can resolve them. Run after any `pxt.json` dependency change. |
| `mkc build` (or bare `mkc`) | Build the current project (native by default — irrelevant for web sim). |
| `mkc build -j` / `mkc -j` | **Build JavaScript. Use this for Arcade web-sim workflows.** |
| `mkc build -w` / `mkc -w` | Watch source files and rebuild on change. |
| `mkc build -f <flags>` | Compile-flag pass-through (`-f size`, `-f asmdebug`, `-f profile`, `-f rawELF`; comma-separated). |
| `mkc build --update` | Force re-check of editor cache (mkc otherwise checks once per day). |
| `mkc serve [--port N] [--force-local]` | Watch-build + localhost server with simulator. Defaults to http://127.0.0.1:7001. `--force-local` honors a local `loader.js`. |
| `mkc clean` | Erase `built/` and the mkc-cache packages. |
| `mkc search <query>` | Search GitHub for MakeCode extensions. |
| `mkc add <github-url-or-name>` | Add a dependency. Example: `mkc add https://github.com/microsoft/arcade-text`. |
| `mkc bump [--major\|--minor\|--patch] [--version-file f.ts] [--stage]` | Version bump + git tag + push. |
| `mkc download <share-url>` | Download a shared MakeCode project to local files. |
| `mkc -c <config>` / `mkc --config-path <config>` | Use an alternate `mkc.json`. |

The `mkc --hw <variant>` and `mkc build -d` flags are for hardware deployment — out of scope for web-sim workflows.

## `mkc.json` config file

`mkc init arcade` creates an `mkc.json` automatically with the target pinned to the editor version it downloaded. So you'll see one in every fresh project; it's not strictly required, but it's the norm.

A minimal scaffolded version:
```json
{
    "targetWebsite": "https://arcade.makecode.com/",
    "minEditorVersion": "1.13.10"
}
```

Extend when:
- Pinning to `https://arcade.makecode.com/beta` for testing new editor features.
- Linking a locally-developed extension via `links`.
- Overriding a `pxt.json` key without committing the change.

Example:
```json
{
    "targetWebsite": "https://arcade.makecode.com/",
    "links": {
        "my-extension": "../my-extension-repo"
    },
    "overrides": {
        "testDependencies": {}
    },
    "include": ["../common-mkc.json"]
}
```

Fields:
- **`targetWebsite`** — pin the compiler. Default `https://arcade.makecode.com/`. Use `/beta` for early access.
- **`links`** — override a dep with a local path for parallel dev.
- **`overrides`** — patch `pxt.json` keys without editing the file.
- **`include`** — merge other `mkc.json` files; later keys override earlier; current file always wins.

## The older `pxt` CLI

`pxt` (https://makecode.com/cli) is the legacy CLI used primarily for developing MakeCode editor targets, not user games. **Do not mix `pxt` and `mkc` in the same project.** Use `mkc` exclusively for Arcade games.

## Build artifacts (after `mkc build -j`)

Output lands in `built/`:
- `built/binary.js` — the compiled game (CPS-transformed JS the simulator loads).
- `built/SimulatorTest.html`, `built/board.html`, etc. — scaffolding for running locally.
- `built/binary.hex` — UF2/HEX for hardware (irrelevant for web sim).

`built/` should be in `.gitignore`.

## First-build sanity check

For a fresh clone or a fresh `mkc init arcade`:

```bash
mkc install            # populate pxt_modules/
mkc build -j           # should exit 0; takes 3-10 seconds first time
mkc serve              # opens http://127.0.0.1:7001 with the simulator
```

If `mkc build -j` fails, the web editor at https://arcade.makecode.com/ will fail the same way — fix locally before pushing.

## `mkc serve` operational quirks

Two behaviors bite anyone scripting against the local server (e.g. Playwright — see `testing.md`):

1. **The file watcher covers the entire project directory, recursively.** *Any* file write under the project root — including test scripts, log files, or screenshots — triggers a rebuild and reloads the simulator iframe. That reload detaches in-flight automation frames mid-test. **Always write test artifacts outside the project tree** (e.g. `/tmp/…`), never into the repo.

2. **`mkc serve` can wedge after a restart.** It sometimes builds `binary.js` to disk (visible at `built/binary.js`) but never serves it at `/binary.js`; the simulator loader then polls 404s forever and the page hangs on the loading spinner. Symptom check:
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:7001/binary.js   # 404 despite the file existing
   ```
   Fix is a cold restart that wipes `built/`:
   ```bash
   pkill -f "mkc serve"; rm -rf built/; mkc serve
   ```

## Troubleshooting

| Symptom | Diagnosis |
|---|---|
| `mkc: command not found` | `npm install -g makecode` (NOT `mkc`). |
| "Cannot find name X" in editor | Run `mkc install` to refresh `pxt_modules/`. |
| Build succeeds locally but fails in web editor | Check `targetWebsite` in `mkc.json` — may be pinned to `/beta` while the web editor is on stable. |
| Build references a missing file | The file isn't in `pxt.json` `files[]`. Add it. |
| Stale extension version | `mkc install --update` or delete `pxt_modules/` and re-run `mkc install`. |
| `mkc serve` won't start | Port 7001 in use; use `mkc serve --port 7002`. |
| `mkc serve` page stuck on spinner; `/binary.js` 404s though file exists | Wedged server. `pkill -f "mkc serve"; rm -rf built/; mkc serve`. |
| Automation frame detaches mid-test | A file write inside the project root triggered a reload. Write artifacts to `/tmp/`, not the repo. |
