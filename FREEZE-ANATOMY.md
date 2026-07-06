# The Anatomy of the Freeze

### Why two-player Retro Bowl froze every single time — on every phone, every browser, every build — worked exactly once, and then stopped working again

*Compiled at V264/V265, 2026-07-06. Companion documents: `get-ready.md` (the V224–V236
staging saga), `PAT.md` / the `pick-six-research` skill (the PAT state machine),
`progress.md` (the V1–V206 development log). Telemetry sessions referenced by room
code are readable at `https://realretrobowl2p-default-rtdb.firebaseio.com/diag/{room_role_session}.json`.*

---

## 0. The one-paragraph answer

There was never **one** freeze. There were at least **fifteen independent defects on
five different layers** — engine input, rendering/layout, iOS process scheduling,
the Firebase match protocol, and deployment — and every single one of them rendered
as the *same two screens*: a dead **GET READY** staging panel or a dead **1-or-2-point
conversion** modal. That is because those two screens are the only interactive
gates in the whole match flow: every drive begins behind a staging panel and every
pick-6 passes through a PAT modal. *Anything* that breaks — a lost tap, a stalled
frame loop, a suppressed page, a stale record, a mismatched build — parks the game
on whichever gate was showing. The freezes looked identical, so every fix that
removed one cause was immediately "disproved" by the next cause producing the same
picture. The game worked "one random time" (room **QWHY**) because that one session
happened to dodge every remaining cause at once; it "stopped working" again because
re-entering the same room code resurrected a stale record from the finished match
**and** the idle phone auto-locked — two *different* causes, same frozen screen.

The rest of this document walks every layer, every cause, the exact evidence that
identified it, the fix, and its verification status.

---

## 1. Why every failure looked the same (the diagnostic trap)

The match flow has exactly two interactive chokepoints:

```
join → READY → [GET READY staging] → drive → … → TD/INT …
                                        └─ pick-6 → [PAT modal] → kickoff → next drive
```

Both chokepoints wait for **exactly one human input** delivered through the
GameMaker engine's own UI (a staging button / tap-to-continue, or a modal button).
Nothing else on screen moves while they wait. So the observable failure set
collapses to two pictures:

1. **"GET READY is there and nothing responds"** — seen if: the engine's frame loop
   is dead (it can't process the tap), the tap never reaches the engine (input-layer
   bugs), the button on screen is a corpse (spawn/suppression bugs), the canvas is a
   stale compositor frame (render bugs), or the match-start handshake never ran
   (protocol/state bugs). *Five layers, one picture.*

2. **"The PAT modal is up and freezes when/before I choose"** — seen if: the modal's
   buttons never receive the click (input bugs), the modal is stacked/stale
   (protocol bugs), the post-click cascade breaks on either device (state-machine
   bugs), or the other phone is suppressed and never answers (OS bugs).

This is why the bug "failed every single time, on every phone, browser, model,
software": the *population* of failures was heterogeneous, but the *symptom* was a
constant. Every time one real cause was fixed, the next cause reproduced the same
screen, making it look like the fix "didn't work." The breakthrough in method —
more important than any single fix — was the on-device black box (V233/V238): a
reload-surviving 11-line log + 700ms state header + canvas snapshot streamed to
Firebase every 5s. Every cause below was convicted by that telemetry, not by
reproduction guesses.

---

## 2. Layer 1 — Engine input: the taps that never existed

### 2.1 THE master input defect: sub-frame tap loss (fixed V259, device-confirmed)

GameMaker's HTML5 runner does not consume click *events*. Its per-step input update
(`_ZN4`) **polls** a mouse-button bitmask (`_bp2`) once per engine frame and
edge-detects against the previous frame. A touch whose `pointerdown` and `pointerup`
both land **between two engine steps** produces no edge — the tap never existed as
far as the engine is concerned. Position and hover still track (those are written at
event time), which produced the maddening signature: *the gui-mouse follows your
finger, the button highlights, and nothing ever clicks.*

Two populations fall into that window:

- **Headless/synthetic taps** (3–5ms) — which is why `pw-pat-click`'s taps failed in
  the WebKit env and were wrongly dismissed as an "env quirk". The env had actually
  reproduced the real bug perfectly.
- **Real iOS taps while the engine isn't stepping** — iOS pauses a page's rAF during
  touch gesture arbitration and while a page is being suppressed (Layer 3). A
  stationary finger generates no `touchmove` (the V256 arbitration-ender never
  fires), so on a suppressed-ish page *every clean tap* fell between steps.

**Why laptops never froze:** mouse clicks are held for many frames — desktops always
produce an edge. This single asymmetry explains most of "works on my laptop, dies on
every phone."

**Fix (V259):** a 2-step latch. Touch pointer-downs arm `__rbTapLatch = 2`; `_ZN4`
forces the sampled bitmask's button-1 bit for exactly one step, then releases —
synthesizing the press→release pair. Mouse never arms it (desktop byte-identical).
**Evidence of fix:** env — release edge latches for a 5ms tap (`pw-input.js`), the
re-popped PAT modal answers one frame after a real touch tap (`pw-deaf.js`); device —
room **TX8A** completed the entire pick-6 → refresh → modal tap → 2PT snap →
`PAT resolved +2` → kickoff chain. **This was also the true root cause of the
original GET READY saga** — user-confirmed after QWHY: the staging screen's
tap-to-continue reads the same polled bitmask. Every earlier GET READY "fix"
(V224–V246: compositors, layouts, corpse purges) treated real-but-secondary defects;
the screen was never frozen, it was *deaf*.

### 2.2 The modal-button mapping offset (insured V260, root cause open)

Device sessions (QWHY, 5/5 taps across two modals) showed taps mapping 15–25 GUI
units outside the drawn button — the V259-latched click path fired, but *missed*.
The engine GUI space is 480×270; the diag's `tap → gui` log line uses a different
853×480 viewport-basis approximation, which cost hours of confusion comparing
numbers across bases. Suspects for the offset (safe-area inset shift, `pageX` vs
client rects under `viewport-fit=cover`, visual-viewport transitions) are logged
but unproven. **Fix:** rather than wait for the exact constant, V260 extended the
battle-tested DOM tap-bridge (which is why kickoff buttons always worked — V233/V234
call `_Ky` directly) to **all** engine popup buttons: nearest-button match with a
40-unit pad, 350ms grace so the engine's own path wins when it works (`modal btn:
engine handled tap` in TX8A shows the grace working), then direct `_li(btn,btn,_0G)`
fire. The offset can no longer eat gameplay; its root cause remains a cosmetic TODO.

### 2.3 Stuck pointer slots (fixed V250)

`_hp2` allocates pointer slots by pointerId and only writes click state from slot 0.
A lost `pointerup` (iOS drops them during gestures) wedged slot 0 forever; all later
touches landed in slot 1+ — engine deaf until refresh, while DOM listeners saw every
tap. Real latent bug, fixed with a slot purge on every primary touch-down — but it
was *not* the user's bug (their gui-mouse tracked, which stuck slots would prevent).

### 2.4 Corpse/ghost staging buttons (V234/V236/V240 + V260)

The engine re-shows destroyed staging buttons every frame from a stale instance id;
WebKit keeps corpses in pools longer than Chromium (never reproducible in Chrome).
Waiting-side suppression + heartbeat healing (park corpse at −2000, `_g2=0`, de-ghost
on tap) removed the "tappable dead Kick Off button" family. The de-ghost log line
(`tap on corpse btn — de-ghosted`) still fires as a no-op notice when users tap
staging remnants — noise, not a defect.

---

## 3. Layer 2 — Rendering & layout: the game that was alive but invisible

### 3.1 Degenerate-resize poisoning (fixed V249; env-reproduced 3× deterministically)

iOS delivers `resize` events with 0×0/degenerate dimensions during lock/app-switch/
toolbar transitions. `layout()` consumed them: canvas CSS written to 0px, `__rbVirt`
zeroed → frozen last composited frame + NaN tap mapping (telemetry: gui-mouse pinned
at 0,24) while the engine ran healthily underneath. Fixed by refusing degenerate
dims (retry loop), engine-side `_tI2/_uI2` clamps, and heartbeat healing of a
collapsed buffer/rect. Repro: `e2e/webkit/pw-hang4.js`.

### 3.2 Compositor layer detach (V246)

A WebGL canvas inside a CSS-rotated `<body>` is exactly the setup where the iOS
compositor freezes the canvas layer after the heavy match-room switch: engine 60fps,
canvas snapshot correct, *screen* stale. Mitigated by forcing the canvas onto its own
compositor layer (`will-change`, identity 3D transform) + a heartbeat un-freezer.

### 3.3 The 1px dvh overflow (fixed V262)

The rotated body was sized `100dvh × 100dvw`. On iOS 18.x, dvh lags toolbar
transitions, leaving the page ~1px scrollable. A scrollable page + toolbar state =
Safari parking in scroll-settle, **suspending rAF on a fully visible page** — and
the V260 "heal scroll to 0 every 700ms" made it worse by feeding the settle loop
(QJIX: `scroll healed 0,1 x2` repeating, fps:0, no `vis: HIDDEN` in the visible
window). Fixed: `layout()` sizes the rotated body in real pixels each pass;
`overflow:hidden` + `overscroll-behavior:none`; the healer only fights >2px at most
once per 10s. *Note: later evidence (KRXI, §4.2) showed the QJIX "no vis:HIDDEN"
reading was partially a ring-roll artifact — the 1px overflow was real and worth
killing, but auto-lock was the dominant killer all along.*

### 3.4 Home-indicator gesture zone (V256)

In rotated-portrait mode the logical LEFT edge is the phone's physical BOTTOM — the
system gesture zone — right where the PAT kick meter lands. The system swipe cannot
be disabled; content is inset by the measured `env(safe-area-inset-bottom)` and a
canceled first `touchmove` ends gesture arbitration outright.

---

## 4. Layer 3 — iOS process scheduling: the phone that kills idle pages

This layer is the answer to "why did it fail on every *phone* but never the laptop,"
and to "why did QWHY work once."

### 4.1 The observed death signature

On the failing (always the *waiting/untouched*) phone, telemetry showed a strict
progression: rAF → 0 (fps:0) and timers clamped to ~1Hz (engine steps 1–2/s, the
50ms watchdog firing once per second — `kicks` climbing by ~6 per 6s log line), then
~20s later **total** silence — even the 5s telemetry writes stop. The page is beyond
self-help at that point: no interval, no rAF, no reload can run until iOS lifts the
suppression. Meanwhile the *touched* phone in the same match logs taps and holds at
a healthy ~60 frames/s throughout (BLFY_a: `hold 14724ms 884f`).

### 4.2 The cause: screen auto-lock during the untouched wait (V261 → V264)

The user was adamant lock/switching "was never a problem" — and honestly believed
it, because nobody notices a phone auto-locking on a side table. Three forensic
generations were needed:

- **V261** added `visibilitychange` logging + an in-match wake lock. Early readings
  ("fps:0 but no `vis: HIDDEN` line") appeared to *exonerate* visibility and sent
  the investigation to the 1px-scroll theory (§3.3) and the idle-suppression/audio
  theory (V263).
- **V263** added a silent WebAudio keep-alive (unlocked on first touch, re-resumed
  every 3s) and an early self-reload when the opening is provably wedged.
- **KRXI (V263 on device)** settled it: the keep-alive was *running* on the dying
  phone (didn't help — negative result, theory retired), AUTO-RECOVER fired
  correctly but its reload came up suspended and never rejoined — **because the
  page was hidden**: `vis: HIDDEN` had been logged **2 seconds before match entry**.
  The earlier "no vis:HIDDEN" evidence was the 11-line ring having scrolled the
  line off. The phone **auto-locks during the untouched lobby/READY wait**, before
  the in-match-only V261 wake lock ever armed. The A-side log confirmed the
  pattern: hidden 91s → visible → `wake lock ON` → alive for the whole match.

**This is the one lead, resolved:** *the touched phone never idles 30 seconds, so it
never auto-locks.* QWHY-1 worked because the pick-6 experiment had the user handling
phone B continuously through match start. Every other 18.7-pair game left the
waiting phone untouched through the join → READY → staging window — auto-lock →
engine dead through the match-start handshake → wedged at `vy:0` forever, even
after unlock (the handshake had sailed). The iOS-26 pair (TYQS/TWDJ) survived
because its lock timing/settings differ — per-*phone*, not per-OS-family, which is
why the failure seemed to strike "every phone, model, software" with no pattern.

**Fix (V264, the parallel instance's commit):** wake lock held from page load on
mobile (the phone *cannot* auto-lock from join onward); AUTO-RECOVER fires only
while visible (hidden reloads burn tries); **HEAL-ON-UNLOCK** — on visibility
return, if a room is joined and the match is wedged at the opening (0-0, vy=0,
>12s) or the page never re-entered a match >20s after boot, reload into the proven
resume flow (30s cooldown, max 5); header shows `vis:V/H`.

### 4.3 Why "refreshing fixes everything"

A reload resets every wedge class at once: fresh rAF chain (un-sticks WKWebView
scroll/suppression states), fresh pointer slots, fresh popup pools, fresh layout,
and — through `tryRestore` — a state re-sync from Firebase. That's why the user's
manual refresh had a 100% cure rate, and why the endgame safety nets (V262–V264
AUTO-RECOVER / VIS-RECOVER) are *automated, strictly-gated refreshes* rather than
in-place heroics: they only fire on a provably wedged opening (0-0, vy=0, ball=0,
loop-dead evidence), never mid-game (the V243 lesson: a mid-match auto-reload once
desynced both devices into permanent WAIT).

---

## 5. Layer 4 — The match protocol: pick-6, the hardest path in the game

A pick-6 is the protocol's worst case: the *defender* (the other device) scores,
so the engine's assumptions invert on both phones simultaneously. The full case
history (V247–V257) in one table:

| Defect | Mechanism | Fix |
|---|---|---|
| Waiting-side killers ate the scorer's PAT UI | heartbeat staging-kill/banner-sweep ran while flagged "waiting" | V247 `scorerPlayingPat()` exemptions |
| INT receiver refresh → stuck on WAIT | turnover record consumed only by thrower | V248 receiver ACK (`applied`/`appliedBy`) |
| Pick-6 refresh → blank field, no modal | no duty record if reload landed pre-modal | V251 synthetic duty from the un-applied turnover |
| Re-popped modal invisible/stacked | re-pop raced its own attempts | V252/V253 verify-visible loop + hard-kill-before-pop + stand-down-on-answer |
| Freeze fixed-time after choosing | thrower's device got PAT_RESULT while already driving → double drive-force | V254 `alreadyDriving` gate |
| Resumed PAT = mannequin scene | drive FSM stage 0 / `_Nb1` unarmed on a resumed room | V255 FSM arming + sticky-flag spawn-gate |
| Thrower stranded after PAT | one-shot kickoff force lost to a race | V257 post-PAT retry loop |
| PAT never marked resolved | guardian resolution invisible on device | V260 `pat:P/R/-` header + guardian events into the surviving ring |

Everything in this table is now covered by the 37-check engine-level suite
(`e2e/repro-pat-loop.js`, must stay 37/37) **plus** the real-flow WebKit suite
(`pw-pat-click.js` answers the modal with *real taps* — mandatory since the
hBfn-shortcut suite masked the input bugs for weeks) — and the chain is
device-confirmed end-to-end (TX8A).

### 5.1 Room-code reuse contamination (the user's "I used the same game code") — V265

`startMatch()` (a fresh both-ready start) has cleared stale room records since
V61/V131/V187/V217: `final`, `ot`, `turnover`, `patDuty`. **But `tryRestore` runs
first** whenever `sessionStorage` still holds the room — and its `patDuty` TTL was
**10 minutes**. Re-entering QWHY ~6 minutes after the first match, the stale
"you owe a PAT" record from the *finished* game hijacked the session:
`patDutyMine → inProgress → resumeMatch()` — the phone resumed into the **previous
match's pick-6** (QWHY_b_uqu6x re-popped a stale conversion modal at a nonsense
clock) while the other phone was starting a fresh game. Two phones in two different
universes; both wedge. The user reused the code hoping to retrieve the console —
reasonable, and it produced this exact poisoning. **Fix (V265):** duty/turnover
resumes require either a fresh `live/{role}` heartbeat (<25s) or a young record
(<3 min); an abandoned-room detection clears stale `patDuty`/`turnover` before
falling through to the lobby; and the opponent-heartbeat record (`hb/{role}`,
§5.2) makes staleness decidable.

### 5.2 The opponent you cannot see (V265)

Every prior defect was invisible to the *other* player: A sits in WAIT forever with
no idea B's phone is asleep. V265 adds `rooms/{code}/hb/{role}` (5s heartbeat,
piggybacked on the telemetry tick) and a waiting-side banner when the opponent's
heartbeat goes stale >20s: *"OPPONENT'S PHONE LOOKS ASLEEP — have them tap/unlock
their screen."* No auto-action (V243 lesson), pure information — converting the
"infinite silent WAIT" into a 20-second diagnosis a human can act on.

---

## 6. Layer 5 — Deployment: playing two different games

GitHub Pages deployments activate **late** (the deploy action's status-poll times
out → "Run failed" emails while the deploy lands minutes later; reruns reuse stale
artifacts). Pages could lag Vercel by builds, so two players on different URLs ran
**mismatched bridge versions** — "impossible" 2P breaks with no local cause. V258
added the version handshake: each client writes `rooms/{code}/ver/{role}` and shows
a red banner on mismatch. (The deploy emails themselves are the poll timeout, not
real failures — 87/100 runs succeed, and even "failed" ones usually activate.)

---

## 7. Why QWHY worked — the complete causal account

Room QWHY-1 (V259, iOS-18.7 pair) threaded *every* needle at once:

1. **V259's tap latch was live** — the first build where engine buttons could hear
   clean taps at all. Match start's tap-gate worked "like on a laptop"
   (user-confirmed: the actual breakthrough).
2. **The waiting phone was being handled continuously** (the pick-6 experiment kept
   the user's hands on B) — it never idled 30s, never auto-locked, so the Layer-3
   killer never fired. Its 64 loop-kicks show the watchdog *repeatedly reviving*
   brief suppressions that touches kept ending.
3. **The room was fresh** — no stale `patDuty`/`turnover` to hijack the start.
4. Both phones loaded the same build (post-V258 handshake window).

And why it "stopped working" immediately after: the rematch **reused the room code**
(§5.1 — stale-duty hijack put the phones in different universes) and subsequent
games left the waiting phone **untouched** (§4.2 — auto-lock through the handshake).
Two independent, invisible causes; the same two frozen screens; the appearance of
"random luck." It was never random — it was a conjunction of five layers, and QWHY
was the one session where all five aligned.

---

## 8. Current status & the residual-risk register

**Fixed and device-confirmed:** sub-frame tap loss / GET READY deafness (V259;
QWHY-1 + user confirmation), the full pick-6 PAT chain (V247–V257, V260; TX8A),
modal-button insurance (V260; TX8A "engine handled tap" grace path), version
handshake (V258).

**Fixed and env-verified, device confirmation pending:** wake-lock-from-load +
heal-on-unlock (V264 — decisive test: leave the waiting 18.7 phone completely
untouched through match start), pixel-body/no-scroll (V262), auto-recover gates
(V262–V264), room-reuse contamination + opponent-stall banner (V265).

**Known-benign noise:** `REJ Decoding failed` (WebKit `decodeAudioData` — engine
audio asset, no gameplay effect), `tap on corpse btn — de-ghosted` (no-op healing
notice), Pages "Run failed" emails (poll timeout).

**Open questions (non-blocking):** the exact constant behind the modal mapping
offset (§2.2 — insured around); whether any iOS suppression mode exists that
defeats a page-load wake lock (if so, HEAL-ON-UNLOCK still recovers on the next
touch); kick-meter behavior under a hypothetical mid-hold suppression (V257 hold
telemetry so far shows healthy 60fps holds).

**Standing invariants for future work:** every commit bumps the V-label and pushes;
no engine-AI offense, ever; the verification ladder (37/37 suite → real-2P WebKit →
device telemetry) before any "fixed" claim; and the prime lesson of this saga —
**when the env and the device show the same symptom, believe the env; when they
differ, believe the device's black box, and check whether the ring rolled.**
