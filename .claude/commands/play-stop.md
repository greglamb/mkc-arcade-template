---
description: Tear down a /play-watch debug session — kill mkc serve and play-watch.js, restore config.ts to DEBUG=false
allowed-tools: Bash
---

End the current debug session. Run:

```bash
pkill -f "play-watch.js" 2>/dev/null
pkill -f "mkc serve" 2>/dev/null
sleep 1
sed -i "" "s/export let DEBUG = true/export let DEBUG = false/" config.ts
```

Then verify `config.ts` shows `export let DEBUG = false` (the committed value, so any push stays silent on arcade.makecode.com), and confirm both processes are stopped.
