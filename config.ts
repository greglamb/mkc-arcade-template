// Build-time toggle for dev-only instrumentation in main.ts.
//
// `make serve` flips DEBUG to true for the duration of the local
// session, then restores false on exit (Ctrl+C / normal exit). This
// file is always committed with DEBUG = false so arcade.makecode.com
// runs silently.
//
// If a hard kill ever leaves it stuck on true, run `make dev-reset`.
namespace config {
    export let DEBUG = false
}
