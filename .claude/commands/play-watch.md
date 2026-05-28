---
description: Start a debug session — user plays the game in a visible Chromium, Claude tails game state from /tmp/mkc-live.log
allowed-tools: Bash, Read
---

The user wants to play the game while you watch the debug output. Set up the session by running these steps in order. After each background process is started, do not poll on a timer — wait for the explicit readiness signal via the `until …; do sleep 1; done` loops shown.

**1. Kill any stale processes from a previous session**
```bash
pkill -f "mkc serve" 2>/dev/null
pkill -f "play-watch.js" 2>/dev/null
```

**2. Cold-clean `built/`**
`mkc serve` sometimes gets into a state where it builds `binary.js` to disk but never serves it at `/binary.js` (the simulator loader polls 404s). Wiping `built/` forces a clean rebuild that's served correctly.
```bash
rm -rf built/
```

**3. Flip the dev flag**
```bash
sed -i "" "s/export let DEBUG = false/export let DEBUG = true/" config.ts
```
This makes `main.ts` emit its `STATE` / `EVENT` console.log lines through the `if (config.DEBUG)` gates. (This project's convention: gate all diagnostic logging behind `config.DEBUG`, prefixed `STATE ` and/or `EVENT `.)

**4. Start `mkc serve` in the background**
Use the Bash tool with `run_in_background: true`:
```bash
mkc serve > /tmp/mkc-serve.log 2>&1
```

**5. Wait for the server to bind**
```bash
until curl -sf http://127.0.0.1:7001/ > /dev/null 2>&1; do sleep 1; done
```

**6. Start `tests/play-watch.js` in the background**
Again with `run_in_background: true`:
```bash
cd tests && node play-watch.js
```
This script launches a visible Playwright Chromium pointed at the simulator, installs a `console.log` filter (the parent page would otherwise fire ~20k MakeCode protocol messages/sec and saturate Node↔CDP), and streams filtered `STATE`/`EVENT` lines to `/tmp/mkc-live.log` (overwritten at start). It is game-agnostic — it forwards whatever your `main.ts` logs with those prefixes.

**7. Wait for the "browser ready" marker**
```bash
until grep -q "browser ready" /tmp/mkc-live.log 2>/dev/null; do sleep 1; done
```

**8. Tell the user it's ready**
Briefly: the Chromium window is open; arrows = D-pad, Z = A button, X = B button; they can ask anything about game state during the session and you'll read the log.

## During the session

When the user asks something about game state, `Read` or `Bash`-`tail`/`grep` `/tmp/mkc-live.log`. Each line is `HH:MM:SS.mmm` followed by whatever `main.ts` emitted — the `STATE ...` / `EVENT ...` lines this project logs. Read them verbatim; the exact fields are defined by this game's `console.log` calls (see `main.ts`).

Do **not** poll the log on a timer or `ScheduleWakeup`. Only read it on user demand.

## Teardown

When the user says "stop" / "done" / "I closed the browser" / similar, or invokes `/play-stop`, run:
```bash
pkill -f "play-watch.js" 2>/dev/null
pkill -f "mkc serve" 2>/dev/null
sleep 1
sed -i "" "s/export let DEBUG = true/export let DEBUG = false/" config.ts
```

Confirm `config.ts` is back to `export let DEBUG = false` (committed value) so any subsequent push to GitHub stays silent on arcade.makecode.com.
