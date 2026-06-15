# e2e — headless end-to-end tests for two-player-rb

The **permanent** test environment. It drives the *real* GameMaker engine
(`retrobowl.js`) + the 2P bridge (`index.html`) in headless Chrome and asserts
behavior — so the OT / possession / defense-stat fixes that can only be checked
against the live engine are reproducible instead of one-off `/tmp` scripts.

## Setup (one time)
```
cd e2e
npm install          # installs puppeteer-core (uses your system Google Chrome)
```
Requires Google Chrome installed. The default path is the macOS location; set
`CHROME_PATH=/path/to/chrome` to override.

## Run
```
node run.js                 # all tests
node run.js turnover ot     # only tests whose name/file matches an arg
node run.js --stop-server   # stop the background static server it started
```
The runner starts a static server (port 8790, serving this project) if one
isn't already up, launches one headless browser, and runs each test in a fresh
page. A full run is ~1–2 min (most of it is the engine boot per page).

## What's covered
| test file | what it guards (version) |
|---|---|
| `load.test.js` | engine parses, bridge present, no non-benign page errors |
| `ot-round-logic.test.js` | equal-possession round decision — pure JS, instant (V109) |
| `possession-hook.test.js` | `_1c1` hooked on global **and** registry (V121) |
| `turnover-transfer.test.js` | bare-`_1c1` turnover sends INT + parks thrower (V121) |
| `ot-kickoff.test.js` | OT kickoff gives the receiver a live drive (V110/V112) |
| `ot-game-over-block.test.js` | engine `_1d1` swallowed during OT (V116) |
| `ot-period-pin.test.js` | OT pins quarter=5, keeps the clock alive (V117) |
| `defense-stats.test.js` | starring + spatial tackle credit + collect (V120) |
| `ultramax-difficulty.test.js` | ULTRAMAX returns the raw entered aggression (V126) |
| `qtr-keep-no-stale-resume.test.js` | turnover voids the stale quarter-resume capture (V128) |

## Writing a test
Add `e2e/tests/<name>.test.js` exporting:
```js
module.exports = {
  name: 'human-readable name',
  browser: true,   // false → pure JS, no browser (ctx has only { H })
  match: true,     // true → ctx.page is already driven into a live match
  oppUid: 11,      // optional opponent team uid for the match
  async run(ctx) {  // ctx = { page, errors, H }
    const v = await ctx.page.evaluate(() => /* read engine/bridge state */);
    return { pass: <bool>, detail: '<one-line summary>' };  // throw or pass:false = fail
  }
};
```
`H` (the harness) exposes `sleep`, `openPage`, `enterMatch`, engine boot timings,
and the server helpers. Engine state is read via the page-global `RB.engineState()`
and the instance list `_Sc2._GL2._oq2`.

## Notes
- **Not part of the deploy.** Static files only; `index.html` never references
  `e2e/`. `node_modules/` is gitignored.
- The `_GL2` console error during boot is a known benign load-race (an early
  interval reads `_Sc2._GL2` before the engine assigns it) — the harness filters
  it so it doesn't fail tests.
- These are **single-device** checks against the live engine. Genuinely
  cross-device behavior (two browsers syncing over Firebase) still needs a real
  2-device playtest — but every fix that *can* be pinned to one device's engine
  state lives here.
- See the `overtime-research` / `overtime-equal-possession` skills for the
  code map these tests correspond to.
