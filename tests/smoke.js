// Game-agnostic Playwright smoke test for a MakeCode Arcade project.
//
// Prereqs: `mkc serve` running on http://127.0.0.1:7001/ and config.DEBUG
// = true (so main.ts emits `STATE ...` console logs). The Makefile's
// `serve` target flips DEBUG for you.
//
// What it asserts (generic — no game-specific logic):
//   - the simulator boots and the canvas appears
//   - no pageerror / console.error / HTTP-4xx during the run
//   - at least one `STATE ...` line was captured (proves DEBUG is on
//     and the game loop is running)
//
// Add game-specific assertions at the bottom once you know what your
// STATE lines contain.

const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

// Write artifacts OUTSIDE the project tree — mkc serve watches the whole
// project dir and reloads the simulator iframe on any write, detaching
// the frame mid-test.
const OUT = '/tmp/mkc-smoke'
const SHOTS = path.join(OUT, 'shots')
const STATE_LOG = path.join(OUT, 'state-log.json')
fs.mkdirSync(SHOTS, { recursive: true })

// Game logs arrive wrapped with an "l>" prefix and trailing newline
// (MakeCode forwards console.log through a serial-like channel).
const parseState = (text) => {
    const i = text.indexOf('STATE ')
    if (i < 0) return null
    const out = {}
    text.substring(i + 6).trim().split(/\s+/).forEach(kv => {
        const [k, v] = kv.split('=')
        out[k] = isNaN(Number(v)) ? v : Number(v)
    })
    return out
}

// Screenshot the canvas via toDataURL — bypasses Playwright's font/idle
// waits, which never settle while mkc serve's livereload socket is live.
const shoot = async (simFrame, name) => {
    try {
        const dataUrl = await simFrame.evaluate(() => {
            const c = document.querySelector('canvas')
            return c ? c.toDataURL('image/png') : null
        })
        if (!dataUrl) return console.warn('  (no canvas for', name, ')')
        const b64 = dataUrl.split(',', 2)[1]
        fs.writeFileSync(path.join(SHOTS, name), Buffer.from(b64, 'base64'))
    } catch (e) {
        console.warn(`  (shoot ${name} failed: ${e.message.split('\n')[0]})`)
    }
}

const states = []
const errors = []
const dumpStates = () => fs.writeFileSync(STATE_LOG, JSON.stringify(states, null, 2))

async function main() {
    const browser = await chromium.launch({ headless: true })
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } })
    // Silence the ~20k/sec mkc-serve protocol firehose before it hits CDP.
    await ctx.addInitScript(() => {
        const orig = console.log.bind(console)
        console.log = function () {
            const a0 = arguments[0]
            if (typeof a0 === 'string' && (a0.indexOf('STATE ') >= 0 || a0.indexOf('EVENT ') >= 0)) {
                orig.apply(console, arguments)
            }
        }
    })
    const page = await ctx.newPage()

    page.on('console', msg => {
        const s = parseState(msg.text())
        if (s) { s._t = Date.now(); states.push(s) }
    })
    page.on('pageerror', err => errors.push(`[pageerror] ${err.message}`))
    page.on('response', resp => { if (resp.status() >= 400) errors.push(`[http${resp.status()}] ${resp.url()}`) })

    console.log('navigate -> http://127.0.0.1:7001/')
    await page.goto('http://127.0.0.1:7001/', { waitUntil: 'load', timeout: 60000 })

    await page.waitForSelector('iframe#simframe', { timeout: 30000 })
    const simFrame = page.frame({ url: /sim\.html/ })
    if (!simFrame) throw new Error('simulator iframe not found')
    await simFrame.waitForSelector('canvas', { timeout: 30000 })

    // Focus the canvas via JS — locator.click/focus time out on the
    // sandboxed iframe canvas.
    await simFrame.evaluate(() => {
        const c = document.getElementById('game-screen') || document.querySelector('canvas')
        if (c) c.focus()
    })

    await page.waitForTimeout(1500)
    await shoot(simFrame, '01-loaded.png')

    // Let the game run a few seconds to accumulate STATE samples.
    await page.waitForTimeout(4000)
    await shoot(simFrame, '02-running.png')

    dumpStates()
    await browser.close()

    console.log('---')
    console.log(`captured ${states.length} STATE samples`)
    if (errors.length) {
        console.error(`FAIL: ${errors.length} error(s) during run:`)
        errors.slice(0, 10).forEach(e => console.error('  ' + e))
        process.exit(1)
    }
    if (states.length === 0) {
        console.error('FAIL: no STATE logs captured — is config.DEBUG = true and the game loop running?')
        process.exit(2)
    }
    console.log('PASS: booted clean, no errors, STATE loop running')
    // --- add game-specific assertions here ---
}

main().catch(err => { console.error(err); dumpStates(); process.exit(99) })
