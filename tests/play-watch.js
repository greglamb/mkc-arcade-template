// Launch a visible Chromium pointed at the local simulator so the
// user can play. Stream filtered STATE / EVENT console output to
// /tmp/mkc-live.log so the agent can read it on request.
//
// Game-agnostic: this script keys only on the line prefixes "STATE "
// and "EVENT ". Whatever your main.ts logs behind `if (config.DEBUG)`
// with those prefixes shows up here verbatim — no per-game changes.
//
// Stop by killing this process (Ctrl+C in the shell that started it,
// or `pkill -f play-watch.js`).

const { chromium } = require('playwright')
const fs = require('fs')

const LOG = '/tmp/mkc-live.log'
// Truncate at startup so each session starts clean
fs.writeFileSync(LOG, `# play-watch session started ${new Date().toISOString()}\n`)
const out = fs.createWriteStream(LOG, { flags: 'a' })

const stamp = () => new Date().toISOString().substring(11, 23)

;(async () => {
    const browser = await chromium.launch({
        headless: false,
        args: ['--window-size=900,800'],
    })
    const ctx = await browser.newContext({ viewport: null })

    // Silence the mkc-serve protocol firehose (~20k console.logs/sec):
    // filter to our prefixes at the page level before they cross to CDP.
    await ctx.addInitScript(() => {
        const orig = console.log.bind(console)
        console.log = function () {
            const a = arguments[0]
            if (typeof a === 'string' && (a.indexOf('STATE ') >= 0 || a.indexOf('EVENT ') >= 0)) {
                orig.apply(console, arguments)
            }
        }
    })

    const page = await ctx.newPage()
    page.on('console', msg => {
        const t = msg.text()
        // Game logs arrive wrapped with an "l>" prefix; match by substring.
        const i = Math.max(t.indexOf('STATE '), t.indexOf('EVENT '))
        if (i < 0) {
            // Also surface anything that looks like a console error/warn
            const type = msg.type()
            if (type === 'error' || type === 'warning') {
                const line = `${stamp()} [${type}] ${t.substring(0, 240)}\n`
                out.write(line); process.stdout.write(line)
            }
            return
        }
        const line = `${stamp()} ${t.substring(i).trim()}\n`
        out.write(line)
        process.stdout.write(line)
    })
    page.on('pageerror', err => {
        const line = `${stamp()} [pageerror] ${err.message}\n`
        out.write(line); process.stdout.write(line)
    })
    page.on('requestfailed', req => {
        const line = `${stamp()} [reqfail] ${req.url()} ${req.failure() ? req.failure().errorText : ''}\n`
        out.write(line); process.stdout.write(line)
    })
    page.on('response', resp => {
        if (resp.status() >= 400) {
            const line = `${stamp()} [http${resp.status()}] ${resp.url()}\n`
            out.write(line); process.stdout.write(line)
        }
    })

    await page.goto('http://127.0.0.1:7001/', { waitUntil: 'load', timeout: 60000 })

    const banner = `# browser ready at http://127.0.0.1:7001/ — play freely; logs go to ${LOG}\n`
    out.write(banner); process.stdout.write(banner)

    // Cleanup on Ctrl+C / kill
    const shutdown = async () => {
        try { await browser.close() } catch (e) {}
        out.end(`# session ended ${new Date().toISOString()}\n`)
        process.exit(0)
    }
    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)

    // Park; the browser stays open until killed
    await new Promise(() => {})
})()
