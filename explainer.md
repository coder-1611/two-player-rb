# explainer.md — Why two-player Retro Bowl freezes on mobile, and how it gets solved

*Living document. Written 2026-07-09 after ~65 versions of attempts (V214–V278).
The first two-thirds is the honest post-mortem of everything tried and why it
failed; the last third is the real-device methodology and the fix. This file is
updated as the on-device investigation converges.*

---

## 1. The problem, stated plainly

There are two devices. Each runs the same web page: an `index.html` "bridge"
wrapped around `retrobowl.js`, a **minified GameMaker HTML5 export** of Retro
Bowl. The bridge turns the single-player engine into a 2-player game over
Firebase: each human plays their own offense while the opponent's screen waits.

On a laptop, it is flawless. On phones, a match **freezes on the "GET READY /
Kick Off / Receive" screen** — the staging screen shown at the start of a
possession, right before you take control. The game sits there. Tapping does
nothing. The only escape has historically been a manual page refresh, and even
that has stopped working reliably.

The maddening part, and the reason this has consumed dozens of iterations:

> **Every distinct cause produced the exact same screen.** GET READY is the one
> visual gate every drive passes through, so *anything* that goes wrong at the
> start of a possession — a lost input, a dead render, a suppressed page, a
> stale record, a half-spawned scene — parks the game on GET READY. Fixing one
> real cause just let the next real cause reproduce the identical picture, which
> read, over and over, as "your fix didn't work."

This is not one bug. It is a *family* of bugs that share a symptom. That is why
a linear "find the bug, fix the bug" approach has failed ~65 times: there was
never a single bug to find.

---

## 2. Why this class of problem is uniquely hard to debug

Three compounding factors:

**(a) The symptom is a funnel, not a fingerprint.** In most debugging, the error
message narrows the cause. Here the "error" — a frozen GET READY — is where
*all* start-of-possession failures converge. The symptom carries almost no
information about which of a dozen mechanisms produced it.

**(b) The environment cannot be reproduced off-device.** The freeze is specific
to **iOS Safari / WebKit on real phones**. Every headless test harness — Chrome,
even Playwright's WebKit with CPU throttling at 90% — starts the drive cleanly
and reaches a full 22-player formation every single time. So the one tool that
normally closes a bug (a reproducing test) is unavailable. "Green harness" has
meant nothing for this bug class, a lesson learned so many times it is written
into the project's CLAUDE.md as a permanent rule.

**(c) The engine is a 4.5 MB minified black box.** `retrobowl.js` is a GameMaker
export with mangled identifiers (`_Sc2`, `_7z`, `_eb1`, `_T51`). Every fact
about how it works had to be reverse-engineered from the minified source by
tracing single-letter functions. A wrong reading of one function sends the whole
investigation down a false path — which happened repeatedly.

The combination is brutal: a symptom that hides its cause, no reproduction, and
an opaquenard engine. The only reliable source of truth is **the real device**,
and until now the investigation leaned on *inferred* device state (telemetry
counters) rather than *observed* device state (screenshots + live JS). That gap
is the through-line of every failed fix.

---

## 3. The instrumentation that made any progress possible

Because the bug only lives on the phone, the project built an on-device black
box (V233/V238 and after):

- A reload-surviving on-screen **diagnostic log** (last ~11 events) plus a state
  header refreshed every 700 ms: controller state (`kp`), drive stage (`vy`),
  ball/player counts, FPS, engine tick rate, WebGL status, visibility (`vis`),
  and more.
- **Telemetry streaming** to Firebase every 5 s during a match, keyed
  `room_role_session`, including a downscaled JPEG **canvas readback** (`shot`).
  This is how the investigation "sees" the phone remotely: pull
  `diag/{key}.json`, decode the `shot`, read the state line.
- A **tap-screenshot burst** (V277): on every tap, the deployed app captures the
  real canvas *at the tap* and *700 ms later*, with the full field census, and
  streams it to `taps/{key}.json`. This finally showed the click-response.

This instrumentation is genuinely good and is the reason the story has a
diagnosable ending. But it has a subtle, fatal limitation described in §7.

---

## 4. The iteration history, grouped by theory (V214–V278)

The mobile work began at **V214** (the "mobile overhaul": forced landscape,
full-screen canvas). Everything before it — the desktop experience through
**V213** — was clean, which is why desktop is now frozen at V213 (see §9). Here
is the honest catalogue of theories, each of which was real, was fixed, and was
then "disproved" by the next cause producing the same GET READY screen.

### Layer 1 — Engine input (taps that never registered)
- **Sub-frame tap loss (V259).** GameMaker polls its mouse-button bitmask once
  per engine step and edge-detects. A touch whose down+up both land between two
  steps produces no edge — the tap never existed to the engine. Position and
  hover still track, so the finger "worked" but nothing clicked. Fixed with a
  2-step latch. This *was* the true root cause of the original GET READY hang
  (the staging button reads the same bitmask), and the user confirmed GET READY
  finally worked "like on a laptop" once — the room known as QWHY.
- **Stuck pointer slots (V250).** A lost `pointerup` wedged input slot 0 forever
  on touch; real but not the user's bug.
- **Modal-button mapping offset (V260).** Device taps mapped 15–25 GUI units off
  the drawn button; insured with a DOM tap-bridge.

### Layer 2 — Rendering / layout (game alive but invisible)
- **Degenerate-resize poisoning (V249).** iOS delivers 0×0 resize events during
  lock/toolbar transitions; the layout consumed them and wrote a 0-px canvas.
- **Compositor layer detach (V246).** A WebGL canvas inside a CSS-rotated body
  can freeze on its compositor layer while the engine runs — snapshot ≠ screen.
- **The 1-px dvh overflow (V262).** `100dvh` lags the iOS toolbar, leaving the
  page 1 px scrollable, which parked Safari in a scroll-settle that suspended
  rAF on a *visible* page.

### Layer 3 — iOS process scheduling (the phone kills idle pages)
- **Auto-lock during the untouched wait (V261→V264).** The waiting phone's rAF
  hit 0 and timers clamped to ~1 Hz for minutes. This looked like the answer for
  a while: wake-lock-from-load, heal-on-unlock, silent-audio keep-alive. But the
  user reported Low Power Mode made no difference and the LPM banner was a false
  positive (V271 removed it). This layer was a **distraction** — real on some
  phones, but never the core.

### Layer 4 — The match protocol (pick-6, the hardest path)
- A long series (V247–V257, V266–V267) hardened the pick-6 PAT chain: waiting-
  side UI suppression exceptions, INT/PAT_RESULT receiver ACKs, re-pop loops,
  lost-outcome insurance, phantom-score guards, room-reuse contamination. All
  real, all fixed, all verified by a 37/37 in-engine suite plus WebKit tests.

### Layer 5 — Deployment
- **Version skew (V258).** GitHub Pages activates late; two players could run
  mismatched builds. A version handshake banner was added.

### The staging-recovery arc (V271–V278) — where the model kept breaking
This is the important part, because it is where the investigation *thought* it
was closing in and kept being wrong:

- **V271/V272:** "The drive never spawned; the kickoff sweeper stopped retrying
  because a ball-on-the-tee looked like a live drive." Fixed detection to key on
  the offensive formation (`obj_playerOF ≥ 5`). Added a heartbeat recovery.
- **V273–V275:** Detection rebuilt around the 22 sprites; corpse-tap made to
  force the spawn. Desktop frozen at V213.
- **V276:** "Press Kick Off": the button's handler sets a `_7z` proceed-flag on
  the controllers; replicate it without the dead button.
- **V278:** The dead kickoff button is deactivated so it can't intercept taps.

Every one of these shipped green tests and was reported as the fix. Every one
failed on the phone. The reason is §7.

---

## 5. The ground truth, from the tap-screenshots (room UQCE, V277)

This is the first *observed* (not inferred) device data, and it demolished most
of the standing theory. On every one of 8 taps, the real device reported:

```
OF=11  DF=11  ball=1  koPaint=0  koGhost=1  kp=2  vy=2  z7=1   (identical, all 8 taps)
```

Decoded:
- **`OF=11 DF=11`** — the full 22-player formation *is* on the field. Spawning
  was never the problem.
- **`kp=2`** — an in-engine probe confirmed `kp==2` is the **normal playing
  state**; the harness runs healthy there. So the engine underneath is not in a
  broken state by this measure.
- **`z7=1`** — the "press Kick Off" proceed-flag *was* set. It did nothing.
- **`koPaint=0, koGhost=1`** — the kickoff button is a **corpse** (destroyed),
  parked off-screen, yet the screen still shows "GET READY / Receive".
- **Zero state change across 8 taps over ~8 seconds** — the taps do absolutely
  nothing. The scene is inert.

Two hard conclusions from observed data: (1) setting the proceed-flag genuinely
does nothing at `kp==2`; (2) the "Receive/GET READY" visual is **not** the
parked button instance — it is drawn by something else that is stuck.

Also learned from a direct engine probe: object type 71 is `obj_controller`,
type 77 is `obj_ball`, and `_T51(n)` is not a timer — it **counts alive
instances of object type n**. So the controller line `_T51(77)==0` means "when
no balls are alive," i.e. the between-plays reset, not a blocker.

---

## 6. What the online research adds

Retro Bowl added **playable kickoff returns** in a 2024 update. The receiving
team fields the kick and runs it back (swipe up/down to juke, sprint, dive).
That means the "GET READY / Receive" screen at the start of a possession is very
likely the **kickoff-return staging**: the engine is waiting for the human to
field and return the kick, and the "Receive" control is what starts it.

This reframes the corpse-button theory in an important way. In this build the
bridge *bypasses* the kickoff by force-spawning the offense directly
(`forceUserOffenseDrive`). If the engine version integrates a kickoff-return
sequence, force-spawning the offense while the controller is still in the
kickoff-return state produces exactly the observed hybrid: 22 sprites on the
field (from the force) underneath a kickoff-return staging overlay that the
engine still believes it is in, with the "Receive" control dead (the force
destroyed it) so the return can never be fielded, so the possession never
truly begins.

In other words: the freeze may be the collision between the bridge's
"skip the kickoff, spawn the offense" shortcut and an engine that has a
first-class kickoff-return phase the shortcut doesn't cleanly exit.

Sources:
- [Kickoff | Retro Bowl Wiki](https://retro-bowl.fandom.com/wiki/Kickoff)
- [Retro Bowl update adds kickoff returns — Operation Sports](https://www.operationsports.com/retro-bowl-update-adds-kickoff-returns-replay-controls-updated-team-strengths-more-patch-notes/)

---

## 7. The methodological failure that cost 50 iterations

Every fix from V271 onward was validated against **inferred** state — instance
counts and flags read by the bridge's own JavaScript — and against a harness
that cannot reproduce the bug. Not once, until V277's tap-screenshots, did the
loop look at **what is actually on the phone's screen** and **run code live on
the phone** to test a hypothesis before shipping it.

That is the whole problem. The bridge's own counters said "22 players, kp==2,
healthy," so fix after fix was built to satisfy those counters — while the
actual screen stayed frozen on GET READY. The counters and the screen disagreed,
and the investigation trusted the counters.

The correct tool has existed the entire time and was only reached now: **Safari
Web Inspector over USB**, which allows:
1. A **real screenshot** of the phone (or a live canvas readback from the real
   page), examined directly — not a number that stands in for it.
2. **Arbitrary JavaScript executed on the live, stuck page** — so a candidate
   fix can be *tried on the frozen game itself* and its effect observed, in
   seconds, before anything is shipped.

This turns the debugging loop from "guess → ship → wait for the user → guess
again" (hours per cycle, ~65 cycles) into "hypothesize → run on the real frozen
page → observe screenshot → confirm or reject" (seconds per cycle).

---

## 8. The plan that actually closes this

Executed via `tools/phone_inspect.py` (pymobiledevice3 Web Inspector), against
the user's real, frozen game:

1. **Observe.** Screenshot the frozen phone. Confirm the exact overlay
   ("GET READY", "Receive", "Kick Off") and read the true controller state
   directly on the device — every `obj_controller`'s internal state, every
   `obj_btn_kickoff` (alive/dead, position, active), the camera/view, and what
   object is actually drawing the "Receive/GET READY" text.
2. **Bisect the freeze with live JS.** On the frozen page, try each candidate
   un-stick and screenshot the result:
   - fire the kickoff-return / receive control's real handler,
   - drive the controller's FSM out of the kickoff-return phase into the play,
   - fully destroy/deactivate the drawing object,
   - as a control, call the exact sequence the working manual refresh performs.
   Whichever makes the real screen become a playable field is the fix.
3. **Generalize.** Turn that verified action into a bridge change that fires
   automatically at the stuck moment (tightly gated so it can never disturb a
   healthy drive or the waiting side), keeping the No-Engine-AI-Offense rule.
4. **Prove.** Reproduce the full flow on the phone via Web Inspector and capture
   a screenshot sequence: stuck → fix fires → playable field → a played down.
   Only screenshots of the real device count as "fixed."

The prior "reload into resume" backstop remains as a safety net, but the goal is
to make the play *start*, not to paper over it with an auto-refresh.

---

## 9. Desktop is deliberately unaffected

Per the user's instruction, **desktop is frozen at V213** — the last build
before the V214 mobile overhaul that began this saga. A guarded redirect at the
top of `index.html` sends any desktop browser to a self-hosted exact copy
(`v213.html`) that reuses the current engine (all engine changes since V213 are
gated to mobile-only globals, so desktop is byte-identical) and shows the old
"V213" label. Mobile stays on the current build and receives every fix. This is
verified end-to-end in a real browser.

---

## 10. Status

- **Solved:** the desktop revert (verified). The pick-6 protocol chain (37/37 +
  WebKit). The engine-input root cause of the *original* GET READY hang (V259,
  user-confirmed once). The instrumentation to see the phone remotely.
- **In progress (the remaining freeze):** the start-of-possession
  kickoff-return / corpse-control collision described in §6. Being closed now
  via live Safari Web Inspector on the real device — the first time the loop can
  test a fix on the actual frozen game and confirm with a screenshot rather than
  a counter. This section will be finalized with the confirmed fix and the
  before/after device screenshots.

*The single most important lesson, paid for in ~50 iterations: when the
instrument and the screen disagree, believe the screen. Test on the real thing.*
