# FREEZE-ANATOMY.md

### Why two-player Retro Bowl freezes **only** on mobile, **never** on desktop, why a refresh fixes it **only for a moment**, and why every "the game is healthy" check has been lying.

*Rewritten 2026-07-09, after finally getting onto the real phone over USB and
watching the freeze happen through Safari Web Inspector instead of through
counters. This document is deliberately about the **shape** of the problem, not
a changelog. If you read one section, read §2 — it is the whole answer.*

---

## 0. The three questions this file exists to answer

1. **Why does it work every single time on a laptop and never once on a phone?**
   Not "usually" — *always* vs *never*. That is not a bug that's "worse on
   mobile." A 100% / 0% split means desktop and mobile are running **different
   programs**, and the freeze lives in the part that only mobile runs.
2. **Why does refreshing fix it — but only temporarily?** If refresh cures it,
   the game logic is fine; something *accumulates* or *mis-initializes* and
   refresh resets it. What accumulates?
3. **Why does every "is the game running / is the match healthy" check say
   HEALTHY even while the GET READY screen (or the waiting cover) is plainly
   frozen on screen?** Because those checks measure the wrong thing. This is the
   single most expensive mistake in the entire saga.

---

## 1. The one-sentence answer

**Desktop runs a game engine that was built for a mouse. Mobile runs that same
engine wrapped in a large, added-on "make it work on a rotated touchscreen
inside iOS Safari" translation layer — and essentially every freeze lives in
that added layer or in the iOS behaviors that only exist on a phone. Desktop
cannot reproduce the freeze because desktop never executes the code, and never
enters the conditions, that freeze.**

Everything below is the elaboration of that sentence.

---

## 2. Desktop and mobile are not the same program (the central answer)

It is tempting to think of this as "one website, two screen sizes." It is not.
When you open the site on a phone, three things stack up that simply do not
exist on a laptop:

### Layer A — the engine (identical on both, and it is *fine*)
`retrobowl.js` is a GameMaker HTML5 export of a single-player game designed for
**mouse** input on an **un-rotated** canvas on a **desktop** browser that
**never gets suspended**. This layer is battle-tested by millions of desktop
players. It is not where the freeze is. When our counters say "the engine is in
the playing state, 22 players spawned, clock ready" — they are telling the truth
*about this layer*. Layer A is healthy. That is exactly why the counters keep
saying "healthy," and exactly why that reassurance is worthless (see §5).

### Layer B — the mobile translation layer (only exists on mobile, and it is where most bugs live)
To make a desktop mouse game playable on a phone, the project bolts on a large
amount of machinery that runs **only** when the page detects a touch device
(`html.rb-mobile`). None of this executes on desktop:

- **Forced landscape rotation.** The entire `<body>` is rotated 90°, sized in
  `dvh`/`dvw`, and cover-scaled to fill the screen. Desktop renders the plain,
  upright canvas and does none of this.
- **A coordinate remap.** Because the canvas is rotated and scaled, every touch
  has to be mathematically un-rotated and re-scaled before the engine sees it
  (`__rbRemapPointer`, `__rbVirt`, the `_tI2/_uI2/_No2` patches). Desktop mouse
  coordinates go straight through, untouched.
- **Touch-to-click synthesis.** The engine polls a mouse-button bitmask once per
  frame. A mouse press is held for many frames, so it always registers. A quick
  finger tap can begin and end *between two frames* and vanish — so mobile adds a
  latch to fake a press/release pair (`__rbTapLatch`). Desktop never needs it and
  never arms it.
- **DOM overlays over the canvas.** The "WAITING FOR OPPONENT" cover, the HUD
  chip, the version banner, safe-area insets — a stack of HTML elements that sit
  *on top of* the game surface. (This is where the pick-6 freeze lived — §4.2.)
- **Wake locks, visibility handling, compositor un-freezers, degenerate-resize
  guards** — all written specifically to fight iOS behaviors (Layer C).

Every one of these is real code that runs only on the phone. Every one is a
place a bug can live that a desktop test can never reach. The mobile build isn't
"the desktop build on a small screen" — it is the desktop build plus a second
program whose entire job is to lie to the engine convincingly enough that it
thinks it's still on a desktop.

### Layer C — iOS Safari itself (a hostile runtime that desktop browsers are not)
Even if Layer B were perfect, the *platform* underneath mobile is fundamentally
more hostile than a desktop browser, in ways the engine was never designed for:

- **It suspends your page.** iOS aggressively throttles or fully pauses a page's
  animation loop when the tab is backgrounded, the screen dims/locks, or the
  system is arbitrating a gesture. A desktop browser runs a focused tab's loop
  forever. On a phone, the engine's frame loop can simply **stop** — and a game
  loop that stops mid-possession is frozen until something restarts it.
- **It withholds touch events during gesture arbitration.** When your finger
  goes down, iOS spends a beat deciding "is this a tap, a scroll, a zoom, a
  system swipe?" During that beat it can *withhold* the move events from the
  page. A desktop mouse has no such ambiguity — a drag is a drag, delivered
  immediately.
- **It loses pointers.** A touch's `pointerup` can be dropped during a gesture
  steal; a mouse's button-up essentially never is.
- **It composits differently.** A WebGL canvas inside a CSS-rotated element is
  the exact configuration where the iOS compositor can freeze the displayed
  layer while the buffer keeps updating — "the engine is drawing but the screen
  is stale." Desktop compositing has no rotation and no such failure.
- **Its viewport lies.** `dvh` (dynamic viewport height) shifts as the Safari
  toolbar collapses/expands, with no resize event — silently changing the size
  of the rotated body under the fixed canvas. Desktop has a stable viewport.

Desktop browsers have **none** of Layer C. A focused desktop tab is a calm,
predictable, single-pointer, un-rotated, never-suspended environment. iOS Safari
is a twitchy, multi-pointer, rotated, frequently-suspended one.

### The synthesis
> **A desktop match runs Layer A alone, in a calm environment.
> A phone match runs Layer A + Layer B, inside the hostile Layer C.
> Every freeze we have ever chased has been in Layer B, or caused by Layer C.
> Desktop is immune by construction — it runs neither.**

That is why it is 100% on desktop and 0% on mobile. It was never the same fight.

---

## 3. Why "it works on my machine" was a trap for 60 versions

The person fixing this (me) tests on: a desktop browser, and a headless
"WebKit" automation harness on a Mac. Look at what those environments are:

- Desktop browser: Layer A only. Calm. **Cannot** reproduce.
- Headless WebKit on a Mac: it *is* the Safari engine, so it feels like a fair
  test — but it drives the game with a **real mouse** (via the automation
  protocol), on an **un-rotated** page, that is **never suspended**, with **no
  gesture arbitration** and **no touch**. It is Layer A + a *little* of Layer B,
  with **none** of Layer C and none of the touch half of Layer B.

So the harness passes every time. "37/37, all green." And it means nothing,
because the harness is testing the calm parts. The bug lives precisely in the
parts the harness cannot simulate: real touch, real rotation, real iOS
suspension, and — the kicker — **a real finger hitting a real DOM overlay** (§4.2),
which synthetic test events dispatched straight at the canvas sail right through.

The lesson, learned the hard and expensive way: **for this class of bug, a green
test is not evidence of anything.** The only valid instrument is the actual
phone, observed the way a finger observes it.

---

## 4. The freeze is not one bug — it is a *family*, and they all wear the same mask

Every distinct cause produces the same picture: a stuck GET READY / kickoff /
waiting screen that ignores your taps. That shared mask is why fixing one cause
looked like "it still doesn't work" — the next cause reproduced the identical
screen. The family, grouped by which layer they live in:

### 4.1 Layer B/C — input never reaches the engine
- **Sub-frame tap loss:** a quick finger tap falls between engine frames and is
  never seen. (Mouse presses span frames → desktop immune.)
- **Gesture arbitration:** iOS withholds the drag while deciding what the touch
  is. (No mouse ambiguity → desktop immune.)
- **Lost `pointerup` wedging a pointer slot:** the engine only reads input from
  slot 0; a dropped touch-up jams it. (Mouse-up is never dropped → desktop
  immune.)
- **Coordinate remap error:** a rotated/scaled touch maps to the wrong spot, so
  the tap "misses." (No remap on desktop → desktop immune.)

### 4.2 Layer B — a DOM overlay physically covers the game (the pick-6 PAT freeze)
This is the one that hid the longest, and it is the cleanest illustration of the
whole document. On a pick-6, the player who scored has to play the 2-point
conversion. But the bridge, at that moment, has flagged their device as
"waiting for opponent" — which draws a **full-screen, opaque `WAITING FOR
OPPONENT` cover on top of the canvas**. The conversion is right there underneath,
fully alive and playable. But **a real finger lands on the cover, not the game.**
The snap/throw never reaches the engine. It looks frozen. It is not frozen — it
is *buried*.

Why it survived ~50 iterations: every check either (a) fired **synthetic** touch
events **directly at the `<canvas>` element** — which bypass a DOM overlay
entirely and reach the engine, so "input works!" every time — or (b) read engine
counters, which reported a perfectly healthy scene. **Only a real finger, or a
hit-test at the tap point (`document.elementFromPoint(centerX, centerY)`),
reveals that the top-most element is the overlay and not the canvas.** On the
phone, that hit-test returned the overlay; hiding the overlay made it return the
canvas and exposed the playable scene.

Note carefully how this interacts with §2: the overlay is Layer B code, and the
reason a finger can't get past it while a *test* can is the exact
synthetic-vs-real gap that the desktop harness embodies.

### 4.3 Layer C — the page itself gets suspended
- Screen dims/locks or the tab backgrounds → the animation loop clamps to ~1 Hz
  or stops → the engine is frozen through a possession change and stays wedged
  even after the screen returns.
- A visible page can still be throttled during scroll-settle if a stray 1px of
  scrollable overflow exists (a `dvh` artifact). Desktop never suspends a focused
  tab.

### 4.4 Layer B — rendering alive but invisible
- The compositor freezes the rotated canvas layer while the engine keeps drawing:
  the state is healthy, the screen is a stale frame.
- A degenerate (0×0) resize during a toolbar transition writes a zero-size canvas.

Every item in §4 is either impossible on desktop (needs touch / rotation / iOS
suspension) or invisible to a desktop-style test (the overlay). That is the
whole "desktop can't replicate it" story, item by item.

---

## 5. Why "match healthy" keeps lying (your exact complaint)

You said it precisely: *the check says the match is healthy even when the GET
READY screen is sitting right there.* Here is why, and it is important.

Every "is the game running" check has measured **Layer A's internal state**:
- "Is the controller in the playing state?" (`kp == 2`) — yes.
- "Are 22 players spawned?" (`OF == 11, DF == 11`) — yes.
- "Is there a ball, is the drive stage advanced?" — yes.

All true. All meaningless. Because **the engine being in a healthy playing state
tells you nothing about whether the human can see it or touch it.** The engine
can be perfectly "playing" while:
- a `WAITING FOR OPPONENT` cover is opaque over the top of it (§4.2),
- the compositor is showing a stale frame (§4.4),
- iOS is withholding the drag that would start the play (§4.1),
- or the frame loop is suspended and the "healthy" reading is just the last value
  before it stopped (§4.3).

**"Healthy" was measured on the one layer that is never broken.** The broken
layers — the overlay stack, the input path, the compositor, the iOS scheduler —
were never in the measurement. Counters that read the engine will always say
"healthy," because the engine always *is* healthy. The engine is not the patient.

### What "is the game actually playable" has to mean instead
A correct check cannot ask the engine how it feels. It has to reproduce, as
closely as possible, **what a finger experiences**:

1. **Is the game the top-most thing at the point I would tap?** i.e.
   `document.elementFromPoint(tapX, tapY) === the canvas`. If the answer is an
   overlay, the human is blocked no matter how healthy the engine is. *This one
   check would have found the pick-6 freeze on day one.*
2. **Is the frame loop actually advancing right now?** Not "fps counter says 60"
   (that can be a stale value) — a real frame-to-frame delta that proves the loop
   ran between two reads.
3. **Does a real, trusted input produce a real state change?** Not a synthetic
   event dispatched at the canvas (which bypasses overlays and always "works"),
   but the actual input path a finger uses. If a real tap/drag doesn't move the
   ball, the game is frozen — regardless of `kp`.
4. **Is what's on the screen what the engine thinks is on the screen?** Compare a
   real screenshot to the engine's claimed state. If they disagree, believe the
   screenshot.

The through-line of all four: **stop asking the engine, start observing the
surface the user actually touches.** The engine is a reliable witness to the
wrong question.

---

## 6. Why a refresh fixes it — and only temporarily

A refresh works, every time, because it **throws away the entire accumulated
state of Layer B and Layer C and rebuilds it from scratch**, then re-syncs Layer
A's game state from Firebase (the "resume" flow). Concretely, one reload
simultaneously:

- **Rebuilds the DOM fresh** — the stuck `WAITING FOR OPPONENT` overlay is torn
  down and re-created, and on the clean re-entry it is (often) computed correctly
  or hidden, so the canvas is on top again.
- **Restarts the animation loop** — a suspended/clamped frame loop comes back at
  full speed; the "engine loop dead" wedge is gone.
- **Resets the input machinery** — fresh pointer slots (the jammed slot 0 is
  cleared), fresh tap-latch state, fresh gesture-arbitration state.
- **Recreates the WebGL/compositor layer** — a frozen composited layer is
  rebuilt; stale-frame freezes clear.
- **Re-runs layout from a clean viewport** — dvh/rotation math starts from a
  sane state instead of a drifted one.
- **Re-pulls game state from Firebase** — the resume flow restores score, clock,
  possession, and (for a pick-6) re-arms the PAT, so Layer A is consistent again.

In other words, refresh is a **hard reset of exactly the two layers where the
bugs live**, back to a clean initial condition that happens to be correct.

It is **temporary** because none of the *causes* are removed — only the current
symptom instance. The moment you keep playing on the phone, the same forces that
broke it the first time start acting again:

- the next possession flag glitch (or the next pick-6) re-shows the overlay,
- the next time the screen dims or a gesture is arbitrated, the loop is
  suspended again,
- the next quick tap falls sub-frame again,
- the next toolbar transition drifts the viewport again.

A refresh resets the drift to zero. Then the drift resumes. So the game is
playable again for a while — until the mobile layer accumulates its way back into
a broken state and you refresh again. **Refresh treats the mobile translation
layer's tendency to drift into a bad state; it does nothing about the tendency
itself.** (This is also why "just auto-refresh when it freezes" was rejected as a
fix: it is the disease's own symptom-reset, automated. It keeps the patient alive
without curing anything, and it hides which real fix is or isn't working.)

There is one more subtlety worth stating: **refresh works partly *because* it's
a clean start, and a clean start is exactly the calm, Layer-A-like condition that
desktop lives in permanently.** A refreshed phone is, for a few seconds, as close
to "a desktop" as a phone ever gets — before Layer C starts interfering again.
That symmetry is not a coincidence; it is the same fact seen from two sides.

---

## 7. The uncomfortable meta-lesson

For sixty-odd versions the loop was: form a theory from counters and a green
harness, ship a fix, watch it "not work" on the phone, repeat. It failed because
**the instrument and the reality were measuring different layers.** The counters
and the harness measured Layer A (always healthy) in a calm environment (never
the failure environment). The reality was a finger hitting Layer B inside Layer
C. They could never agree, and trusting the instrument over the screen cost
almost the entire project.

The fix, in the end, was not a cleverer theory. It was **looking at the actual
phone the way a finger looks at it** — a real screenshot, and a hit-test at the
place a thumb would land. The first time that was done, the bug that had hidden
for fifty iterations was visible in one reading.

So, to answer your three questions in one breath:

- **Why desktop always and mobile never:** they are different programs; the
  freeze lives only in the mobile-only translation layer and the mobile-only iOS
  platform, and desktop runs neither.
- **Why refresh helps only temporarily:** it hard-resets that mobile layer to a
  clean state, but the forces that drift it into a bad state resume the moment
  you keep playing.
- **Why "healthy" keeps lying:** it measures the one layer that is never sick.
  The right question isn't "is the engine playing?" — it's "at the point my thumb
  lands, is the game the thing I'm touching, is the loop actually moving, and does
  a real touch change anything?"

---

## 8. POSTSCRIPT (2026-07-10): the freeze was caught red-handed, and it is §4.3

Room JDVS, V283, real phones. During the freeze the diag stream showed, on BOTH
devices: engine state perfectly healthy (OF:11 DF:11 ball:1, drive set up,
btn:0 — the V283 corpse fix worked), the canvas buffer frozen on a STALE
"GET READY / Receive" frame drawn seconds earlier, `fps:0`, and the watchdog
logging `ENGINE LOOP DEAD — kicking _fi5` **80 times without ever reviving
it** — while heartbeats, timers, and the diag writer itself kept running the
whole time.

That is the definitive shape: **the engine's frame chain dies while the page's
JS stays alive.** The chain (`_Gi5` top → `setTimeout` → `window._di5(_fi5)`,
where `_di5` is native rAF) only re-arms *inside its own callback*, so one
undelivered rAF callback (iOS zombie-rAF) or one throw before the re-arm kills
it forever. The kicks failed silently because (a) `_fi5`'s loading-screen
block was unguarded, and (b) the watchdog's error log shared a throttle window
with its "kicking" log and was structurally unreachable.

**The fix (V284/V285), built on the freeze's own evidence:** timers were PROVEN
alive during every freeze — so frame delivery now rides on timers. Every
`window._di5` registration races native rAF against an 83 ms `setTimeout`
(exactly-once); a throwing frame is caught, logged to telemetry with
file:line, and re-armed (bounded, no frame storm); `_fi5`'s unguarded block is
guarded in `retrobowl.js` itself. Harness-proven: the exact device signature
(mid-match rAF death, formation on field) now survives at 23 fps; rAF dead
from boot still runs at 35 fps; persistent frame throws survive and recover;
the healthy path is unchanged at 60 fps.

**The loop can now only die if `setTimeout` itself dies — and the freeze's own
telemetry proves it doesn't.** Any new failure mode is no longer silent:
`FRAME THREW …@file:line`, `fi5err:…`, and `engine kick THREW` all stream to
Firebase.
