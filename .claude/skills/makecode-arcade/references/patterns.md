# Game Patterns

Idiomatic MakeCode Arcade patterns, all verified against the API reference at https://arcade.makecode.com/reference.

## Sprite kinds

Declare all custom kinds in one namespace block, exactly once each:

```typescript
namespace SpriteKind {
    export const Coin = SpriteKind.create()
    export const Enemy = SpriteKind.create()
    export const Projectile = SpriteKind.create()
}
```

`SpriteKind.create()` returns a fresh int each call. Calling it twice for "the same kind" creates two distinct ids and overlap handlers won't fire as expected.

Pre-defined kinds: `Player`, `Food`, `Enemy`, `Projectile`. Use them when their semantics fit.

## Collisions and overlaps

```typescript
// Sprite-sprite overlap
sprites.onOverlap(SpriteKind.Player, SpriteKind.Coin, (player, coin) => {
    coin.destroy()
    info.changeScoreBy(1)
})

// Sprite-tile overlap (tilemap)
scene.onOverlapTile(SpriteKind.Player, assets.tile`door`, (sprite, location) => {
    game.gameOver(true)
})

// Sprite hits a wall tile
scene.onHitWall(SpriteKind.Enemy, (enemy, location) => {
    enemy.vx = -enemy.vx
})

// Sprite lifecycle
sprites.onDestroyed(SpriteKind.Player, sprite => game.gameOver(false))
sprites.onCreated(SpriteKind.Coin, c => c.setFlag(SpriteFlag.AutoDestroy, true))
```

### SpriteFlag values

`Ghost`, `GhostThroughWalls`, `GhostThroughSprites`, `GhostThroughTiles`, `Invisible`, `AutoDestroy`, `StayInScreen`, `BounceOnWall`, `RelativeToCamera`, `HitboxOverlaps`.

## Game loop variants

Three top-level scheduling primitives, each with different semantics:

| Construct | When it runs | Scene-bound? | Use for |
|---|---|---|---|
| `game.onUpdate(handler)` | Each frame, inline in the scene loop | ✅ | Per-frame logic (input polling, AI, custom physics) |
| `game.onUpdateInterval(ms, handler)` | Every `ms` ms, in the scene loop | ✅ | Periodic spawns, timers, autosave |
| `forever(handler)` | Handler runs, awaits return, repeats. Independent fiber. | ✅ but async | Long background tasks that can yield via `pause` |
| `control.runInParallel(handler)` | One-shot, independent fiber | ❌ | Fire-and-forget background work |
| `game.onPaint(handler)` | Each frame, under sprites | ✅ | Custom drawing below sprites |
| `game.onShade(handler)` | Each frame, over sprites and HUD | ✅ | Screen-wide post-processing |

From https://arcade.makecode.com/developer/game-loop:

> *"forever loops will run only when the Scene they are created in is active, but will continue independently while running; this means that they could occur more or less than once per frame."*

Rendering order each frame: background → tilemap → `onPaint` → sprites → HUD → `onShade`.

## State machine — menu / play / game over

Idiomatic pattern using `game.pushScene`/`popScene` for clean state separation:

```typescript
enum GameState { Menu, Playing, GameOver }
let state: GameState = GameState.Menu

function enterMenu() {
    game.pushScene()
    scene.setBackgroundColor(8)
    game.splash("My Game", "Press A to start")
    controller.A.onEvent(ControllerButtonEvent.Pressed, () => transition(GameState.Playing))
}

function enterPlaying() {
    game.popScene()                  // discard menu scene
    game.pushScene()                 // fresh scene for gameplay
    tiles.setCurrentTilemap(tilemap`level1`)
    let player = sprites.create(assets.image`hero`, SpriteKind.Player)
    tiles.placeOnRandomTile(player, assets.tile`spawn`)
    controller.moveSprite(player, 100, 100)
    scene.cameraFollowSprite(player)
    info.setScore(0)
    info.setLife(3)
    info.onLifeZero(() => transition(GameState.GameOver))
}

function transition(next: GameState) {
    state = next
    if (state == GameState.Menu) enterMenu()
    else if (state == GameState.Playing) enterPlaying()
    else if (state == GameState.GameOver) game.gameOver(false)
}

transition(GameState.Menu)
```

Scene-bound handlers (`controller.A.onEvent`, `sprites.onOverlap`, `game.onUpdate`, etc.) are discarded when their scene is popped. Module-scope variables persist.

For a packaged version of this pattern as Blocks, see https://github.com/riknoll/arcade-state-transitions.

## Scene / level switching

```typescript
let currentLevel = 1

function loadLevel(n: number) {
    if (n == 1) tiles.setCurrentTilemap(tilemap`level1`)
    else if (n == 2) tiles.setCurrentTilemap(tilemap`level2`)
    else game.gameOver(true)
    tiles.placeOnRandomTile(player, assets.tile`spawn`)
}

scene.onOverlapTile(SpriteKind.Player, assets.tile`door`, (sprite, location) => {
    currentLevel++
    loadLevel(currentLevel)
})
```

## Controller input

```typescript
controller.moveSprite(player, 100, 100)             // vx max, vy max

controller.A.onEvent(ControllerButtonEvent.Pressed,  () => fire())
controller.A.onEvent(ControllerButtonEvent.Repeated, () => fire())
controller.A.onEvent(ControllerButtonEvent.Released, () => stopCharging())
controller.A.repeatInterval = 200                   // ms between Repeated events
controller.A.repeatDelay    = 500

if (controller.B.isPressed()) { … }

let dx = controller.dx()                            // -1, 0, or 1
let dy = controller.dy(60)                          // scaled by 60 px/sec

controller.anyButton.onEvent(ControllerButtonEvent.Pressed, h)

// Multiplayer
controller.player2.moveSprite(player2, 80, 80)
controller.player2.onEvent(ControllerEvent.Connected, () => game.splash("P2 in!"))
```

## Lives, score, HUD

```typescript
info.setScore(0)
info.setLife(3)
info.changeScoreBy(1)
info.changeLifeBy(-1)
let s = info.score()
let h = info.highScore()

info.startCountdown(60)                             // seconds; on-screen timer
info.stopCountdown()
info.onLifeZero(() => game.gameOver(false))         // override default behavior
info.onCountdownEnd(() => game.gameOver(false))
info.onScore(100, () => game.splash("100!"))        // milestone callback

// Multiplayer HUD
info.player2.setLife(3)
info.player2.changeScoreBy(1)
info.player2.onLifeZero(() => game.over())
```

## Tilemap navigation

```typescript
tiles.setCurrentTilemap(tilemap`maze`)
let player = sprites.create(assets.image`hero`, SpriteKind.Player)
tiles.placeOnRandomTile(player, assets.tile`floor`)
controller.moveSprite(player, 80, 80)
scene.cameraFollowSprite(player)

scene.onOverlapTile(SpriteKind.Player, assets.tile`spikes`, (s, loc) => info.changeLifeBy(-1))
scene.onHitWall(SpriteKind.Player, (s, loc) => scene.cameraShake(2, 200))

// Tile-location helpers
if (player.isHittingTile(CollisionDirection.Bottom)) {
    // on ground
}
let neighbor = player.tilemapLocation().getNeighboringLocation(CollisionDirection.Right)
// neighbor has: .column .row .x .y .left .right .top .bottom
```

## Projectiles

```typescript
let bullet = sprites.createProjectile(
    img`. 1 .\n1 1 1\n. 1 .`,
    0, -120,
    SpriteKind.Projectile,
    player                                          // parent — auto-destroyed when off-screen
)

let enemyShot = sprites.createProjectileFromSide(
    assets.image`fireball`, 50, 0                   // vx, vy; spawns from random screen edge
)
```

## Particle effects

```typescript
player.startEffect(effects.confetti, 500)           // sprite-attached, ms duration
effects.confetti.startScreenEffect()                // full-screen
effects.confetti.endScreenEffect()
sprite.destroy(effects.fire, 200)                   // destruction effect
```

Built-ins: `confetti`, `fire`, `bubbles`, `coolRadial`, `disintegrate`, `halo`, `spray`, `trail`, `warmRadial`, `clouds`, `hearts`, `smiles`, `rings`, `slash`, `splatter`, `star`.

## Camera

```typescript
scene.cameraFollowSprite(player)
scene.centerCameraAt(80, 60)
scene.cameraShake(4, 500)                           // amplitude, duration ms
```

## Persistent state across scenes

There is no save system in the web simulator. Use top-level namespace variables — they survive `pushScene`/`popScene`:

```typescript
namespace gameState {
    export let level = 1
    export let coinsCollected = 0
    export let upgrades: string[] = []
}

// Use anywhere
gameState.coinsCollected++
if (gameState.upgrades.indexOf("double-jump") >= 0) { … }
```

Hardware-only `settings.writeNumber(...)` from the `settings` extension persists across power cycles — out of scope for web-sim work.

## Music / SFX patterns

```typescript
// Background music — loops until something else plays
music.play(music.createSong(assets.song`bgm`), music.PlaybackMode.LoopingInBackground)

// SFX — fire and forget
music.play(music.tonePlayable(440, 250), music.PlaybackMode.InBackground)

// SFX — blocking (good for cutscenes)
music.play(music.stringPlayable("C D E F G", 120), music.PlaybackMode.UntilDone)

// Custom waveform
let zap = music.createSoundEffect(WaveShape.Square, 5000, 200, 255, 0, 250,
                                  SoundExpressionEffect.None, InterpolationCurve.Linear)
music.playSoundEffect(zap, SoundExpressionPlayMode.UntilDone)

music.stopAllSounds()
music.setVolume(128)                                // 0..255
```

Audio limit: 3 channels. Many SFX simultaneously may drop.

## Common composition: side-scroller starter

```typescript
namespace SpriteKind {
    export const Coin = SpriteKind.create()
    export const Enemy = SpriteKind.create()
}

tiles.setCurrentTilemap(tilemap`level1`)
let player = sprites.create(img`
    . . f f f f . .
    . f 1 1 1 1 f .
    . f 1 5 5 1 f .
    . f 1 1 1 1 f .
    . . f f f f . .
`, SpriteKind.Player)
player.ay = 500                                     // gravity
tiles.placeOnRandomTile(player, assets.tile`spawn`)
controller.moveSprite(player, 80, 0)
scene.cameraFollowSprite(player)
info.setLife(3)

controller.A.onEvent(ControllerButtonEvent.Pressed, () => {
    if (player.isHittingTile(CollisionDirection.Bottom)) {
        player.vy = -200
    }
})

sprites.onOverlap(SpriteKind.Player, SpriteKind.Coin, (p, c) => {
    c.destroy(effects.coolRadial, 200)
    info.changeScoreBy(1)
})

sprites.onOverlap(SpriteKind.Player, SpriteKind.Enemy, (p, e) => {
    info.changeLifeBy(-1)
    scene.cameraShake(4, 200)
})

game.onUpdateInterval(2000, () => {
    let enemy = sprites.create(assets.image`enemy`, SpriteKind.Enemy)
    tiles.placeOnRandomTile(enemy, assets.tile`spawn`)
    enemy.vx = -40
})

info.onLifeZero(() => game.gameOver(false))
```
