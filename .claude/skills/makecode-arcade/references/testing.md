# Testing Strategy

**Bottom line: automated testing of MakeCode Arcade games is limited.** The main verification tool is manually playing in the simulator. There are three things you *can* do automatically; this file documents them and is honest about what doesn't work.

## What does NOT exist

- Jest/Mocha integration in the MakeCode runtime.
- A built-in `assert()` in the standard library.
- A DOM/jsdom-style harness for the in-browser simulator.
- A canonical headless playthrough tool that scripts inputs and snapshots the screen.

## Tier 1: `mkc build -j` as a compile gate (always do this)

The most valuable automated check is "does the project still compile under MakeCode's compiler?" Run after every change:

```bash
mkc build -j
```

A passing build verifies:
- `pxt.json` is valid.
- Every file in `files[]` exists and parses.
- All referenced extensions resolve.
- Every line of code type-checks under STS — which catches the largest class of mistakes Claude is likely to make (banned features, missing namespaces, typos in API names).

### CI workflow (GitHub Actions)

Add to `.github/workflows/build.yml`:

```yaml
name: Build
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm install -g makecode
      - run: mkc install
      - run: mkc build -j
```

12 lines, prevents the worst class of regressions. Every push gets the gate.

## Tier 2: Unit-testing pure logic via Node + Jest

Logic functions that don't touch the Arcade runtime (sprites, scene, controller, music, info, tiles) can be unit-tested with regular Node and Jest. The trick is a conditional `module.exports` shim that's invisible to MakeCode.

### Layout

```
project/
├── main.ts                ← imports nothing; references gameLogic via namespace
├── game-logic.ts          ← pure functions; NO Arcade API calls
├── pxt.json               ← lists main.ts and game-logic.ts in files[]
└── tests/
    ├── package.json       ← devDeps: jest, ts-jest, @types/jest
    ├── tsconfig.json
    └── game-logic.test.ts
```

### `game-logic.ts` — the testable file

```typescript
namespace gameLogic {
    export function scoreFor(coins: number): number {
        return coins * 10
    }
    export function clamp(x: number, lo: number, hi: number): number {
        return x < lo ? lo : (x > hi ? hi : x)
    }
}

// Invisible to MakeCode (module is undefined there); enables Node `require()`.
declare const module: any
if (typeof module !== "undefined") {
    module.exports = { gameLogic }
}
```

The `if` branch never executes in MakeCode because `module` is undefined; in Node it exports the namespace as a CommonJS module.

### `tests/game-logic.test.ts`

```typescript
const { gameLogic } = require("../game-logic")

test("scoreFor multiplies by 10", () => {
    expect(gameLogic.scoreFor(5)).toBe(50)
    expect(gameLogic.scoreFor(0)).toBe(0)
})

test("clamp respects bounds", () => {
    expect(gameLogic.clamp(10, 0, 5)).toBe(5)
    expect(gameLogic.clamp(-3, 0, 5)).toBe(0)
    expect(gameLogic.clamp(2, 0, 5)).toBe(2)
})
```

### `tests/package.json`

```json
{
    "name": "tests",
    "private": true,
    "scripts": {
        "test": "jest"
    },
    "devDependencies": {
        "@types/jest": "^29.5.0",
        "jest": "^29.7.0",
        "ts-jest": "^29.1.0",
        "typescript": "^5.3.0"
    },
    "jest": {
        "preset": "ts-jest",
        "testEnvironment": "node",
        "rootDir": ".."
    }
}
```

### Caveats

- Only test **pure functions**. Anything calling Arcade builtins needs heavy mocking.
- Keep the testable logic in dedicated `.ts` files (e.g. `game-logic.ts`, `level-data.ts`). Don't try to test `main.ts` directly.
- Add `tests/` to `.gitignore` if you don't want to commit `node_modules` (the test directory itself can be committed but `tests/node_modules/` should not).
- The conditional `module.exports` shim is **the** workaround. MakeCode's compiler accepts the dead-code `if` branch because `declare const module: any` makes the type system happy and the runtime never reaches it.

## Tier 3: MakeCode's own `test.ts` mechanism

From https://arcade.makecode.com/github/test-extension and the `pxt.json` `testFiles` field:

> *"To test TypeScript APIs regularly, you don't need to have a separate test project … you include a `test.ts` file in the extension itself which contains the tests. This file is only used when you run the extension directly, not when you add the extension to a project."*

So `test.ts` runs **as the entry point** when you open the *repo itself* in the editor. The "test" is literally a MakeCode program that runs.

Typical pattern:

```typescript
// test.ts
namespace tests {
    let failures = 0
    function assertEq<T>(actual: T, expected: T, label: string) {
        if (actual !== expected) {
            console.log(`FAIL ${label}: got ${actual}, want ${expected}`)
            failures++
        }
    }

    assertEq(gameLogic.scoreFor(0), 0, "scoreFor(0)")
    assertEq(gameLogic.scoreFor(5), 50, "scoreFor(5)")
    assertEq(gameLogic.clamp(10, 0, 5), 5, "clamp upper")

    game.splash(failures == 0 ? "ALL PASS" : `${failures} FAILED`)
}
```

Limitations:
- Runs in the simulator, not in CI. To automate, you'd scrape `console.log` output from the compiled `built/binary.js` — non-trivial.
- Only runs when the project is opened *as an extension*, not when integrated into another project.

## Tier 4: scripted simulator harness via Playwright + `mkc serve`

There is no *official* headless harness, but you can build a reliable project-local one against `mkc serve`. The pattern: gate diagnostic `console.log`s behind a build-time flag in `main.ts`, run a Playwright browser pointed at `http://127.0.0.1:7001/`, and stream the matching log lines to a file the agent reads on demand. Two uses: a one-shot **smoke test** (boot, assert no errors, snapshot) and a live **watch session** (user plays, agent answers state questions from the log).

### Instrumentation pattern (build-time debug flag)

Keep a one-line toggle in its own file so it's trivial to flip and always commits as `false`:

```typescript
// config.ts  (add "config.ts" to pxt.json files[])
namespace config {
    export let DEBUG = false   // STS rejects `export const` here (TS9267); `let` is the workaround
}
```

In `main.ts`, gate diagnostics behind it and emit **prefixed, content-agnostic lines** — the harness keys on the prefix, never the fields, so the same harness works for any game:

```typescript
if (config.DEBUG) {
    game.onUpdateInterval(500, () => {
        console.log(`STATE px=${player.x} py=${player.y} lives=${info.life()} score=${info.score()}`)
    })
}
```

A `make serve` target (or the agent) flips `DEBUG` to `true` for the local session and restores `false` on exit, so pushes to GitHub stay silent in the web editor.

### The five hard-won Playwright gotchas

These are non-obvious and each one wasted real time:

1. **The simulator parent page firehoses ~20k `console.log`s/sec** (every postMessage protocol event). A raw `page.on('console')` listener saturates the Node↔CDP IPC and pegs CPU. Install a `console.log` override via `ctx.addInitScript` that filters to your prefixes *before* the call crosses CDP:
   ```js
   await ctx.addInitScript(() => {
       const orig = console.log.bind(console)
       console.log = function () {
           const a = arguments[0]
           if (typeof a === 'string' && (a.indexOf('STATE ') >= 0 || a.indexOf('EVENT ') >= 0)) {
               orig.apply(console, arguments)
           }
       }
   })
   ```
2. **Game logs arrive wrapped with an `l>` prefix and a trailing newline** (MakeCode's serial-channel forwarding). Match with `text.indexOf('STATE ')`, not `startsWith`.
3. **`page.screenshot()` hangs** waiting for fonts/idle, because `mkc serve`'s livereload websocket keeps the page perpetually non-idle. Grab pixels with `canvas.toDataURL()` inside `page.evaluate()` and write the base64 to disk yourself.
4. **`locator.click()` / `.focus()` on the canvas time out** on Playwright's actionability checks (sandboxed iframe). Bypass: `simFrame.evaluate(() => document.getElementById('game-screen').focus())`.
5. **The canvas lives in an iframe** at `http://127.0.0.1:7001/sim.html`. Reach it via `page.frame({ url: /sim\.html/ })` (or `waitForSelector('iframe#simframe').then(h => h.contentFrame())`).

Plus the `mkc serve` quirks from `cli.md`: write the log file to `/tmp/` (never inside the repo, or the watcher reloads the iframe), and cold-restart with `rm -rf built/` if the server wedges.

### When to use it

- **Smoke test** in CI-ish form: boot the page, fail if any `pageerror`/`[error]`/HTTP-4xx appears in the first few seconds, snapshot via `toDataURL`. Cheap regression guard beyond `mkc build -j`.
- **Watch session**: visible (`headless: false`) browser the user plays while the agent tails the log to answer "how many lives left?" etc. Read the log **on demand only** — never poll on a timer.

## What about a fully automated playthrough?

Scripting *inputs* (not just observing) is possible — focus the canvas per gotcha 4 and dispatch key events — but brittle: timing-dependent, no stable selectors for game state beyond what you `console.log`. Treat full input-driven playthrough automation as a side project; the watch-session + instrumentation pattern above covers most real needs.

## Recommended testing strategy

1. **Always**: `mkc build -j` in CI as a compile gate. Catches ~80% of likely Claude mistakes.
2. **When useful**: Extract pure logic to dedicated `.ts` files and test with Jest via the `module.exports` shim. Aim for tests on math, state machines, level data, scoring tables.
3. **For interactive verification**: Load the project in https://arcade.makecode.com/ (or local `mkc serve`) and play manually. Use `game.consoleOverlay.setVisible(true)` + `console.log` to debug.
4. **For repeatable observation**: the Tier 4 Playwright harness — smoke test for regressions, watch session for live state questions.

## Debug helpers

```typescript
// Show console output overlay in the simulator
game.consoleOverlay.setVisible(true)

console.log(`player at ${player.x},${player.y}`)
console.log("enemy count: " + enemyCount)

// Pause execution for a debugger breakpoint
debugger
```

## Anti-patterns

- ❌ Trying to mock the Arcade runtime to test gameplay end-to-end in Node — not worth it.
- ❌ Asserting on simulator screenshots — pixel-comparison is brittle and tooling is unsupported.
- ❌ Skipping `mkc build -j` because "the code looks fine" — the STS compiler will flag things `tsc` accepts.
