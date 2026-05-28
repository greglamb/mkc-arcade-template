# Static TypeScript (STS) Reference

MakeCode Arcade compiles a subset of TypeScript called **Static TypeScript (STS)** using its own compiler (originally based on TypeScript 2.6.1). Normal TypeScript intuition is wrong by default. This file documents what works, what doesn't, and the idiomatic replacements.

Primary source: https://makecode.com/language

## What works

- `let` / `const` (no `var`)
- Functions with lexical scoping and recursion
- Top-level code in any file — `console.log("Hello")` at file top is legal
- `if/else if/else`, `while`, `do … while`, `for(;;)`, `for...of`, `break`/`continue` (incl. labeled)
- `switch` on numbers, strings, or arbitrary types
- `debugger` for breakpoints
- Conditional (`? :`), lazy boolean operators, all arithmetic/bitwise operators
- Strings with subset of methods; template literals (`` `x is ${x}` ``)
- **Namespaces** — the only form of modularity STS supports
- Arrow functions; lambdas with any arity
- Classes (static + instance fields, methods, constructors, `new`); inheritance; interfaces; generic classes/methods/functions
- Array literals; enums; object literals; shorthand properties; computed property names
- Public/private constructor arg sugar; get/set accessors
- `typeof` expression; union/intersection types; `any`
- Destructuring (arrays and objects), with initializers
- Exceptions: `throw`, `try/catch`, `try/finally`
- Pseudo-async calls (see "Async" below)

## What does NOT work — banned features

| Feature | Replacement |
|---|---|
| `import` / `export` (file-scope) / `module.exports` | `namespace` blocks |
| `async function`, `await` | `pause(ms)`, `pauseUntil(cond)`, `control.runInParallel` |
| `yield`, `function*` (generators) | Manual iteration state |
| `Promise` constructor | Pseudo-async (see below) |
| `eval`, `with`, `arguments`, `.apply()` | None — restructure |
| `for...in` | `for...of` or index loops |
| Prototype-based inheritance, monkey-patching | Add fields to class declarations |
| `this` outside a class method | Restructure to be inside a class or pass explicitly |
| Function overloading | Union types or distinct names |
| User-defined tagged templates | Only 8 built-in tags allowed (see below) |
| `interface` with same name as a class | Rename one |
| Casts of non-class to class | Construct via `new` |
| `interface extends class` | Compose explicitly |
| Inheriting from built-in types | Wrap, don't extend |
| JSX | N/A |
| Regular expressions | Manual string scanning |
| Spread / rest at call sites | Explicit args |
| `enum`s as runtime arrays | N/A |
| `new` on non-class types | N/A |
| Using a built-in function as a value | Wrap in an arrow |
| `Map<K,V>` / `Set<T>` | `{ [k: string]: V }` or arrays + linear search |
| `Object.keys(classInstance)` | Only works on `{}` literals |
| Arrays of typed ints (`uint8[]` etc.) | Use `Buffer` or `number[]` |
| `var` | `let` / `const` |

## The 8 allowed tagged templates

These are the **only** custom-tagged template literals STS recognizes. Everything else is a compile error.

| Tag | Use |
|---|---|
| `` img`...` `` | Inline image/sprite literal |
| `` tilemap`name` `` | Reference a tilemap by resource name |
| `` hex`...` `` | Hex-encoded binary blob (low-level) |
| `` assets.image`name` `` | Reference an editor-created image asset |
| `` assets.tile`name` `` | Reference an editor-created tile |
| `` assets.tilemap`name` `` | Reference an editor-created tilemap |
| `` assets.animation`name` `` | Reference an editor-created animation |
| `` assets.song`name` `` | Reference an editor-created song |

See `references/assets.md` for syntax details.

## Async — looks sync, no `await`

Verbatim from https://makecode.com/async:

> *"PXT lets users call async functions, as if they were regular functions … `let parsed = JSON.parse(downloadData("https://example.com/"))` … Currently, to implement an async function, you first need to add `//% promise` attribute to the declaration."*

Rules for user code:

- **Never write** `async function` or `await` — compile error.
- **Never write** `new Promise(...)` — `Promise` is not exposed to user code.
- `pause(ms)` is the idiomatic blocking wait.
- `pauseUntil(condition)` blocks until a predicate becomes true.
- Functions that block the calling fiber cleanly: `game.askForString`, `game.splash`, `game.showLongText`, `music.playMelody(..., MelodyOptions.Once)`, `music.playSoundEffect(..., SoundExpressionPlayMode.UntilDone)`.

```typescript
// Pseudo-sync — runs other fibers during the pause, no await needed
game.splash("Get ready!")
pause(1000)
let name = game.askForString("Your name?")
info.setScore(0)

// Background loop on its own fiber
control.runInParallel(() => {
    while (true) {
        pause(2000)
        spawnEnemy()
    }
})
```

## Scoping gotchas — concrete examples

```typescript
// WRONG — function used before its outer-scope captures are defined
function foo1() {
    bar()              // ❌ bar called before x defined
    let x = 1
    function bar() {
        let y = x      // would be runtime error in plain JS too
    }
}

// RIGHT — define captured vars first
function foo2() {
    let x = 1
    function bar() {
        let y = x
    }
    bar()
}
```

## Numbers

- Tagged 31-bit signed integers, or boxed doubles for larger values.
- Bitwise ops truncate to int32.
- No `BigInt`.
- Integer overflow is silent when stored in typed fields (`uint8`, `int16`, etc.).

## Strings (verified working)

`.length`, `.charAt(i)`, `.charCodeAt(i)`, `.substr(start, len)`, `.indexOf(s)`, `.split(sep)`, `+` concatenation, template literals.

**Not supported**: anything regex-based (`.match`, `.replace(regex,…)`, `.matchAll`, `.replaceAll`, `.search`), `.normalize`, `.padStart`, `.padEnd`.

## Arrays (verified working)

`.push`, `.pop`, `.shift`, `.unshift`, `.indexOf`, `.removeAt(i)`, `.insertAt(i, v)`, `.length`, `.slice`, `.reverse`, `.sort`, `.forEach`, `.map`, `.filter`, `.some`, `.every`, `.reduce`, `.find`, `.findIndex`, `.concat`.

**Missing or risky**: `.flat`, `.flatMap`, `.includes` (use `.indexOf(x) >= 0`), `.at` (use `arr[arr.length - 1]`).

## "Looks valid, breaks in STS" — common cases

```typescript
// 1. import/export — banned at file scope
import { foo } from "./bar"            // ❌
export function foo() {}                // ❌

// ✅ Use namespace
namespace gameLogic {
    export function foo() {}
}

// 2. async/await — banned
async function load() { await pause(100) }    // ❌
// ✅ Just call blocking APIs directly
function load() { pause(100) }

// 3. Map/Set — not implemented
const m = new Map<string, number>()           // ❌
const s = new Set<number>()                   // ❌

// ✅ Plain object literal for string-keyed dict
const dict: { [k: string]: number } = {}
dict["score"] = 42
// ✅ Array for unique number set
const seen: number[] = []
if (seen.indexOf(x) < 0) seen.push(x)

// 4. for...in — banned
for (const k in obj) { … }                    // ❌
// ✅ Maintain a key list explicitly
const keys = ["alpha", "beta", "gamma"]
for (const k of keys) { use(dict[k]) }

// 5. Custom tagged templates — banned
function gql(strings: TemplateStringsArray) {…}
const q = gql`select 1`                       // ❌

// 6. Forward use of function before captured var
function f() {
    g()                                        // ❌
    let y = 1
    function g() { console.log(y) }
}

// 7. Same-name class+interface — banned
class Point {}
interface Point { z: number }                 // ❌

// 8. Spread at call site — unreliable
const arr = [1, 2, 3]
Math.max(...arr)                               // ❌
// ✅ Iterate
let max = arr[0]
for (const v of arr) if (v > max) max = v

// 9. Ad-hoc fields on a class instance — banned
class Enemy { health: number = 100 }
const e = new Enemy()
;(e as any).extra = 7                          // ❌ classes not extensible
// ✅ Add field to class declaration
```

## How to validate

Run `mkc build -j` after editing. If it compiles, the project will load in https://arcade.makecode.com/. The MakeCode compiler errors are usually clearer than `tsc` errors for STS violations.
