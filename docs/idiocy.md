# idiocy.md — Why the ball teleports "for no reason"

A focused research note on the single incident captured in the console below, and
the structural reason it keeps happening. This is the **spurious-send** failure: a
device receives a possession-change outcome that does **not** correspond to any real
turnover, and obediently re-places the ball — producing a visible, unexplained yard
jump in the middle of an otherwise-fine drive.

It is a sibling of the pick-6 cascade (see [`PICK6_PLAYBOOK.md`](PICK6_PLAYBOOK.md))
and shares the same root organ: the global `_1c1` (`s_change_possession`) wrapper.

---

## 1. The incident (the exact log)

```
?v=mqxfm2jc:2710 [2P send] Object
?v=mqxfm2jc:2716 [2P receive] Object
?v=mqxfm2jc:5806 [2P apply v5] type=OTHER yardLineIn=2.6717246514586925 yardOut=3
retrobowl.js: state = BALL_AIM_DEADZONE
retrobowl.js: Direc = -151.56  / -151.56 PASSING PLAY
retrobowl.js: Incomplete
retrobowl.js: Down = 2
retrobowl.js: Scrimmage = 3
```

The ball ends up at **`Scrimmage = 3`** because an outcome of `type=OTHER` arrived
over Firebase and `applyOpponentOutcome` force-placed the drive at signed yard `+3`
(opponent's 47). The user did not turn the ball over. Nothing in their play earned a
new line of scrimmage. The ball simply moved.

**One number proves the whole case: `yardLineIn = 2.6717246514586925`.**

---

## 2. The single most important clue: the yard line is *fractional*

The engine's signed yard line `_6F` is only *settled* to a clean, play-ended value at
`BALL_DOWN` / `SACKED`. Between those events the ball is a moving physics object and
`_6F` is whatever the ball's position happens to be at that instant.

- A **real** turnover outcome carries a settled line: an integer-ish value the engine
  wrote when the play ended.
- `2.6717246514586925` is a ball **in motion** — a position sampled mid-flight,
  not a play-end.

So this outcome was **shipped from the other device at a moment when no play had
ended.** That is the entire bug in one observation. Everything below explains *how*
the bridge let that happen.

---

## 3. The send path that fired when it shouldn't have

The outcome originates in the global `_1c1` wrapper
([`index.html:2871`](../index.html#L2871)). After the engine's real `_1c1` runs, the
wrapper decides whether to ship a "user lost possession" outcome. Its **entire gate**
is:

```js
// index.html:2902  — user had the ball pre, doesn't post
if (!(pre.enginePossessingTeamIdx === pre.engineUserTeamIdx &&
      post.enginePossessingTeamIdx !== post.engineUserTeamIdx)) return;
// index.html:2905  — not already sending this drive
if (window._rb2p_userOutcomeSendInProgress) return;
// index.html:2909  — >2s since our last apply
if (Date.now() - (window._rb2p_lastOpponentOutcomeApplyMs || 0) < 2000) return;
// index.html:2912  — not in the post-pick-6 kickoff grace window
if (Date.now() < (window._rb2p_kickoffGraceUntil || 0)) { ...; return; }

var outcome = buildUserDriveEndOutcome(pre, post, prevVy);   // index.html:2918
```

Note what is **absent**: there is no check that a *real, finalized turnover* occurred.
The gate fires on **any** `_1c1` call where the possession index flips away from the
user — and `_1c1` is called **bare, ~18 times internally** by the engine, during
events that are *not* turnovers (kickoff sequencing, post-play detail cases, replay
plumbing). V121 wrapped the **global** `_1c1` precisely so plain INTs would be caught;
the cost is that every one of those ~18 internal flips now also enters this wrapper.

When one of those internal flips momentarily satisfies "user → not-user," and the 2s
cooldown / grace window both happen to be clear, the gate **passes on a non-turnover**.

---

## 4. Why the type is `OTHER` (and why that's the tell)

`buildUserDriveEndOutcome` classifies the event purely from `prevVy`
([`index.html:5421`](../index.html#L5421) → `inferUserDriveEndType`,
[`index.html:2749`](../index.html#L2749)):

```js
function inferUserDriveEndType(prevVy) {
    if (prevVy === 9 || prevVy === 16) return 'TD';
    if (prevVy === 8)                  return 'INT';
    if (prevVy === 12 || prevVy === 23) return 'PUNT';
    if (prevVy === 14)                 return 'FG';
    if (prevVy === 24)                 return 'HALF_END';
    if (prevVy === 1)                  return 'KICKOFF';
    return 'OTHER';                    // <-- the catch-all
}
```

`prevVy` is read from `pre.enginePriorFsmStage || pre.engineDriveFsmStage` — a value
that, during a bare internal `_1c1`, is an **active-play stage** (e.g. 2/3), not a
turnover stage. None of the real-turnover cases match, so it falls through to
**`OTHER`**.

`type === OTHER` is therefore not a kind of turnover — **it is the signature of a
`_1c1` that fired when nothing classifiable happened.** A correctly-detected INT/punt/
FG/TD never reaches `OTHER`. So in this codebase, *an `OTHER` outcome on the wire is
almost definitionally a false positive.* The fractional yard line in §2 is the second,
independent confirmation of the same thing.

Then `buildUserDriveEndOutcome` reads `post.engineYardLineSigned`
([`index.html:5433`](../index.html#L5433)) — the live, mid-motion `_6F` — yielding
`2.6717…`, and ships it.

---

## 5. Why the receiver obeys it (the teleport)

On the receiving device, `applyOpponentOutcome` has no dedicated handling for `OTHER`.
It is neither a kickoff, nor a punt, so it lands in the generic numeric branch
([`index.html:5791`](../index.html#L5791)):

```js
} else if (typeof outcome.yardLine === 'number') {
    yard = outcome.yardLine;          // treated as an already-mirrored turnover spot
}
...
yard = Math.round(yard);              // 2.6717… -> 3   (index.html:5805)
console.log('[2P apply v5] type=OTHER yardLineIn=2.6717… yardOut=3');
...
window._rb2p_forceUserOffenseDrive(yard);   // index.html:5812 — slams the ball to +3
```

`OTHER` is handled **exactly like a turnover**: the yard is taken as-is (the comment at
[`index.html:5792`](../index.html#L5792) assumes `_1c1` already mirrored it into the
receiver's frame), rounded, and `forceUserOffenseDrive` plants a fresh 1st-and-10 there.
`Scrimmage = 3` in the engine log is that planted line. The drive the user was already
running gets its line of scrimmage overwritten — the "jump for no reason."

---

## 6. Root cause (one sentence)

> The bridge treats **"the global `_1c1` flipped possession away from me"** as
> equivalent to **"I committed a real, finalized turnover,"** and the global `_1c1`
> fires on ~18 internal non-turnover events — so a non-turnover flip ships an
> `OTHER` outcome carrying a mid-motion fractional yard line, which the receiver
> faithfully applies as a new line of scrimmage.

The four existing guards (possession-flip, in-progress, 2s cooldown, pick-6 grace) are
all **timing / dedup** filters. **None of them validates that the event was a real
turnover.** They reduce the *frequency* of the false positive; they cannot eliminate
its *kind*.

---

## 7. The fix space — and what shipped (V170)

> **SHIPPED in V170: option (2) only.** Option (1) was investigated and
> **rejected**: the apply-side comment at [`index.html:5791`](../index.html#L5791)
> confirms the `OTHER` path legitimately carries **turnover-on-downs and missed-FG**
> turnovers (neither has a dedicated `prevVy` code, so both classify as `OTHER`).
> Refusing all `OTHER` would silently break possession sync on a 4th-down stop and a
> missed field goal — real, common events. Option (2) catches the exact incident
> without that risk: a downs/missed-FG turnover settles `_6F` to an **integer** line
> and still passes the gate, while the mid-motion `2.6717…` is suppressed.
> The guard lives just before [`index.html:2918`](../index.html#L2918).


Per the playbook, the durable fixes are **structural invariants**, not more timing
races. In rough order of strength:

1. **Refuse to send `OTHER` at all.** If `inferUserDriveEndType` returns `OTHER`, the
   event is by construction unclassifiable — i.e. not a known turnover. Drop it at the
   send gate in the `_1c1` wrapper (before [`index.html:2918`](../index.html#L2918)).
   This is the highest-leverage single line: it makes "OTHER on the wire" impossible,
   which §4 argues is *always* a false positive. Risk: if any *legitimate* turnover is
   currently riding on `OTHER` (it shouldn't be — INT/punt/FG/downs all have real
   `prevVy` codes), that path would stop syncing. Verify against live logs that no
   genuine turnover ever logs `type=OTHER` before shipping this.

2. **Require a settled yard line.** Reject the send if `post.engineYardLineSigned` is
   not integral (or if the FSM stage isn't a real play-end stage). A fractional `_6F`
   means the ball is still moving — there is no turnover to report yet. This catches
   the same incident from the *data* side and would also guard mislabeled-but-real
   types.

3. **Gate the global wrap during the engine's own internal sequences.** The pick-6
   path already does this with `_rb2p_kickoffGraceUntil`. The general version: have the
   wrapper pass straight through to the original `_1c1` (no send) unless we're at a
   confirmed user-driven play-end, the same philosophy the playbook recommends for
   "don't wrap a global engine call casually" (§4 of the playbook).

(1) and (2) are independent and cheap; shipping **both** gives belt-and-suspenders —
one filters on the *label*, the other on the *data*, and a real false positive has to
defeat both.

---

## 8. Pre-ship checklist (if/when fixing)

- [ ] Confirm from **live both-device logs** that no genuine turnover ever carries
      `type=OTHER`. (Grep both consoles for `[2P send]`/`[2P apply v5] type=OTHER`
      and correlate with the preceding engine `Down/Scrimmage`/`INTERCEPTED`/`Punt`
      lines.)
- [ ] Parse-check every inline `<script>` (`new Function(code)` sweep).
- [ ] `_rb2p_testPick6Live()` → 37/37 (the `_1c1` wrapper is shared with the cascade;
      make sure a send-gate change doesn't starve the pick-6 INT send).
- [ ] Two real devices: run a drive with an incomplete pass, a sack, and a punt, and
      confirm the *only* yard-line changes the receiver applies are real turnovers /
      kickoffs — no `apply v5 type=OTHER` lines at all.
- [ ] Bump `V<N>`, commit, push, smoke-test both deploy URLs.

---

## 9. The one-paragraph version

The ball "jumps for no reason" because the global `_1c1` wrapper can't tell a real
turnover from one of the ~18 internal non-turnover possession flips the engine makes.
When such a flip slips past the timing guards, the bridge classifies it as `OTHER`
(the catch-all for "no known turnover stage"), reads the ball's position **while it is
still in motion** (hence the fractional `2.6717…`), and ships it. The other device
applies `OTHER` like a turnover and slams a fresh 1st-and-10 onto that line — the
teleport. The two independent fingerprints are **`type=OTHER`** and a **fractional
`yardLineIn`**; either alone is enough to call it a spurious send. The cure is a
structural invariant — never send `OTHER`, and never send a non-settled yard line —
not another timing patch.
