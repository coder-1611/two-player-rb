---
name: bot-receiver-throwing
description: How to make an automated bot actually PLAY offense in the 2P Retro Bowl fork — snap, read receivers, predict their routes, and throw to the open one. Use whenever working on the autoplay/test bots, e2e/play-bots.js, "make the bots play/score", receiver targeting, the snap/throw mechanic, or why synthetic taps don't drive plays. Embeds the verified facts (trusted-input requirement, instance/field map, object names) and the receiver-prediction + throw methodology, plus the still-OPEN unknowns and the exact probes to resolve them.
---

# bot-receiver-throwing

How to drive a bot that genuinely plays offense in the 2P fork. Load this before any work on the playing bots (`e2e/play-bots.js`) or receiver-aimed throwing. Read the VERIFIED section as fact; the OPEN section lists what still needs probing and how.

> **The one hard truth:** the engine's snap/throw responds **only to TRUSTED input** (Node-side `page.mouse.down/move/up`). In-page synthetic `PointerEvent`/`MouseEvent` dispatches do **nothing** for snapping/throwing (they DO work for discrete button taps). So a playing bot must be driven from Node/puppeteer, not from an in-page `?bot=` script. Verified: a trusted drag moved the clock 2:00→1:57 (a real play ran); the identical synthetic drag left it at 2:00.

## VERIFIED facts (rely on these)

**Reading the field (safe).** Instances live in the array `_Sc2._GL2._oq2`. For each `inst`:
- object name = `inst._eE2._fE2`
- skip if `inst._HL2` is truthy (destroyed)
- instance id = `inst.id`
- position = `inst.x`, `inst.y` (ROOM coords)
- GM motion vars (the route "arrows"): `inst.hspeed`, `inst.vspeed`, `inst.direction`, `inst.speed`

**NEVER `for (k in inst)` / iterate all props.** Some properties are getters with side effects that throw (e.g. `_2K4` reads `_vX2` of null → TypeError). Read only the specific named fields above, each wrapped in its own `try`.

**Object names:**
- `obj_playerOF` — offensive players (QB + skill players). *(My first probe used `obj_player` and got [] — wrong name.)*
- `obj_playerDF` — defenders (used by the V120 spatial tackle observer).
- `obj_ball` — the ball.
- `obj_button` — on-screen buttons (kickoff / 4th-down / PAT / continue). Also match `/btn|button/`.

**Engine state** via `RB.engineState()`: `engineControllerState` (`kp`; **2 = active play**), `engineDriveFsmStage` (`vy`), `engineDriveDirection` (±1, drive orientation in room x), `engineActivePlayerInst` (controlled player id / carrier), quarter/clock/scores/possession (see the bridge field map in `index.html`).

**Field orientation.** Coords are ROOM units (large — ball seen near x≈1920). The view/camera **scrolls horizontally** following the ball, and Retro Bowl flips the field so the **offense always attacks toward screen-RIGHT**. Room↔screen share orientation (no rotation): downfield ≈ screen-right, lateral ≈ screen-vertical. So a throw *direction* in room space maps to the same *direction* on screen even before the exact scale is known.

**The play loop state machine** (offense device, `_rb2p_userIsWaitingForOpponent !== true`):
- pre-snap: `kp==2`, `obj_ball` present, clock FROZEN until you hike.
- a TRUSTED drag (press lower-center ≈ (0.50,0.62), drag, release) hikes the ball AND throws → the play runs (clock ticks).
- after the play, downs advance; at **4th down two `obj_button`s appear** and the game STALLS until one is clicked.

## Receiver-aimed throwing — the method

The user's insight: at the snap each `obj_playerOF` has a **start position and a route direction (the on-screen arrows)** → you can predict where each receiver will be and lead the throw. Plan:

1. **Snap** with a trusted press (`mouse.down` near the QB), hold briefly.
2. **Read receivers**: enumerate `obj_playerOF` (exclude the QB/carrier = `engineActivePlayerInst`). Capture each one's `x,y` and route vector (`hspeed,vspeed` — or `direction,speed`). The route vector IS the arrow.
3. **Predict** the catch point: `predX = x + hspeed*lead`, `predY = y + vspeed*lead` (tune `lead`).
4. **Pick the target**: maximize *(downfield gain in drive direction)* × *(separation from the nearest `obj_playerDF` at the predicted point)*. Skip a receiver whose predicted point has a defender within ~Npx (covered).
5. **Throw** by completing the trusted drag in the DIRECTION of the predicted catch point relative to the QB (downfield = screen-right; lateral = up/down). Release/length tunes distance.

### Throwing tips ("how to best throw")
- **Throw early-ish.** A late throw gets the QB sacked (the rush arrives ~1–2s after snap). Release ~400–700ms after the snap — late enough for routes to develop separation, early enough to beat pressure. Tune this window.
- **Lead the receiver** (aim at predicted point, not current).
- **Avoid coverage** — don't throw where a `obj_playerDF` is near the predicted catch point.
- **Prefer the deepest open man**, dump to a short open man if everyone downfield is covered.

## OPEN — must be probed/calibrated (don't assume)

1. **Room→screen transform.** The camera offset+scale that maps `inst.x/.y` (room) to canvas client pixels is not yet known. Needed if the throw requires aiming at the receiver's *screen point* (vs just a direction). Resolve: find the GameMaker view/camera, or calibrate by correlating a known instance's room pos to its on-screen pixel (screenshot + locate, or move a known object).
2. **Throw-input mapping.** Unknown whether the release point = the aim/target on screen, or it's a direction/power flick from the QB. Resolve empirically: from a fixed snap, vary the drag vector (direction & length) and observe which receiver/where the ball goes.
3. **4th-down button click.** Two `obj_button`s read at room/GUI ≈ (113,224) and (272,224). Clicking those mapped through BOTH the 760-px canvas space AND a 480×270 GUI space did **not** dismiss them — mapping still unresolved, so the bot stalls at 4th down. Resolve: confirm the GUI resolution / button anchor, or screenshot the 4th-down screen and read the real button pixels. (A human watching can just say where they are.)

## Where this lives

- `e2e/play-bots.js` — the Node-side **trusted-input** driver (open two windows, join/ready, play loop). This is where receiver-aimed throwing + the 4th-down click get implemented.
- `e2e/two-player.js` — two-page sim harness (CDP focus emulation so both tabs run).
- `e2e/scenario.js` — deterministic director (setClock/turnover/etc.) for scripted scenario tests.
- The in-page `?bot=a|b` script in `index.html` can join/ready and tap buttons, but **cannot play offense** (synthetic input) — do not rely on it for plays.

## Probes (re-run to fill the OPEN items)

- Offensive player positions + route velocity: enumerate `obj_playerOF` reading only `x,y,hspeed,vspeed,direction,speed` (each in a try) at pre-snap and ~250ms after a trusted `mouse.down` hike.
- Always run probes headless via the `e2e/` harness against `http://localhost:8790`, write output to a file in `e2e/` (the harness task tmpdir can fill up), and delete the test room from Firebase after.
