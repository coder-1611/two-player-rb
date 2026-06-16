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
| `two-player-live.test.js` | **two real pages** join one room over live Firebase + launch (V129) |
| `stale-final-guard.test.js` | stale `final` ignored, fresh one still ends the game (V131) |
| `room-ttl-sweep.test.js` | rooms idle >2h are swept on load; fresh rooms survive (V132) |
| `scenario-toolkit.test.js` | scenario director: set clock + force a turnover across devices (V133) |

## Two-player simulation (`two-player.js`)

`startTwoPlayerGame()` launches **two headless pages in one browser**, drives the
real lobby (type code → JOIN → READY on each), and waits for both to enter a live
match — coordinating over the actual Firebase RTDB exactly like two phones. Test
rooms use a `Z`-prefixed random code and are deleted on cleanup.

```js
const TP = require('../two-player');
const game = await TP.startTwoPlayerGame();   // { code, a, b, snapshot, waitFor, cleanup }
try {
    const A = await TP.snapshot(game.a.page);  // { role, inMatch, waiting, myUid, oppUid, quarter }
    const B = await TP.snapshot(game.b.page);
    // ... assert cross-device state (A.waiting !== B.waiting, teams mirror, etc.)
} finally {
    await game.cleanup();                      // closes pages + deletes the room
}
```

Gotcha that took a debugging pass: the GameMaker engine advances on
`requestAnimationFrame`, which Chrome **pauses for hidden tabs** — so the
first-opened page would freeze mid-launch (stuck at room 2) once the second tab
took focus. `openLobbyPage` fixes this with CDP `Emulation.setFocusEmulationEnabled`
so both tabs keep rendering. A two-player test sets `browser: false` (it owns its
own browser + both pages); the runner skips its single-page setup for it.

## Scenario testing (`scenario.js`)

`scenario.js` is a **director** layered on the two-player sim: it drives the live
engine on either bot page into a chosen state deterministically, so scenarios you
can't reliably wait for (end-of-quarter possession, turnovers, touchdowns, OT)
become one-liners. It reads/writes through the same `RB.engineState()` façade the
bridge uses and fires the **real** possession path (`_1c1`), so it exercises the
actual bridge pipeline, not a fake.

```js
const TP = require('../two-player');
const D  = require('../scenario');

const game = await TP.startTwoPlayerGame();
const off  = await D.offensePage(game);          // whichever bot has the ball
const def  = D.otherPage(game, off);

await D.pauseBoth(game);                          // freeze bots while setting up
await D.setClock(off, { q: 4, min: 0, sec: 3 }); // ← manually CHOOSE A TIME
await D.setScore(off, { user: 21, opp: 21 });    // tie → end-of-Q4 should go to OT
await D.forceTurnover(off);                       // hand the ball to the other device
await D.forceDriveEnd(off, 'TD');                 // end the drive as TD/FG/PUNT/INT/DOWNS
await D.addPoints(off, 'user', 6);               // deterministic score bump
const s = await D.state(def);                     // rich side-effect-free snapshot
await D.waitForState(def, x => !x.waiting, 14000);
await game.cleanup();
```

Key calls: `state` · `offensePage`/`otherPage` · `setClock`/`setScore`/`setBall` ·
`forceTurnover`/`forceDriveEnd(type)` (`INT|DOWNS|FUMBLE|TD|FG|PUNT`) · `addPoints` ·
`endOfQuarter` · `pauseBot`/`resumeBot`/`pauseBoth`/`resumeBoth` · `waitFor`/`waitForState`.

The autoplay bot honors `window._rb2p_botPaused` (set by `pauseBot`) so it won't
snap and undo a scenario mid-setup. See `tests/scenario-toolkit.test.js` for a
worked example.

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
- Most tests are **single-device** checks against the live engine. For genuine
  **cross-device** behavior there's now `two-player.js` (see below) — two real
  pages that join one room over the live Firebase RTDB and play. A real phone-to-
  phone playtest is still the final word on feel/latency, but the coordination
  (join, ready, launch, possession, sync) is now reproducible headlessly.
- See the `overtime-research` / `overtime-equal-possession` skills for the
  code map these tests correspond to.
