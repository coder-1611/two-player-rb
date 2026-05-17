# two-player-rb — operating instructions for Claude

## Version label rule (PERMANENT)

Every commit from now on MUST bump a `V<N>` label rendered next to the
lobby's "ENTER A 4-CHAR ROOM CODE" prompt in `index.html`.

How to do it on each commit:

1. Before staging, run `git rev-list --count HEAD` to get the current
   commit count `N`.
2. The version for this commit is `V<N+1>` (the commit you're about
   to make IS the (N+1)-th one).
3. Edit the lobby prompt line in `index.html` so it reads:

       <p class="prompt">ENTER A 4-CHAR ROOM CODE — V<N+1></p>

4. Stage and commit normally.

If you forget, the label drifts and players can't tell which build
they're loading on `coder-1611.github.io/two-player-rb/`. The label
is the cache-bust truth indicator — they should be able to glance at
the lobby and confirm a fresh build is live.

No version-bumps from non-commit edits. The label tracks commits
1-for-1, NOT individual edits.

## Always commit + push rule (PERMANENT)

Every meaningful edit to `index.html` (or any source file in this
project) MUST be committed and pushed to GitHub `origin/main` in
the same turn it's written. Vercel auto-deploys from `origin/main`
and `coder-1611.github.io/two-player-rb/` builds from the same
ref, so local edits are invisible to the player until they're
pushed.

Concretely, after editing:

1. Bump the V-label per the version rule above.
2. `git add` the changed files (specific paths, not `-A`).
3. `git commit` with a short message describing the change.
4. `git push origin main`.
5. Confirm to the user with the new commit hash + a one-line
   note that Vercel will deploy within ~30 s.

Do NOT leave edits uncommitted across turns. If the user is
testing the deployed site, they need every iteration pushed —
otherwise they keep seeing the previous build (a recurring
frustration that wastes their time).

Exceptions: if the user explicitly says "don't commit yet" or
"hold off pushing", respect that. Otherwise the default is
commit + push.

## No engine-AI offense rule (PERMANENT)

In two-player Retro Bowl there is NEVER a simulated offense run by
the engine's AI on the opponent's side of the ball. NEVER. Both
offensive drives are played by humans on their own devices; the
opponent's screen is parked in WAIT while the human-on-offense
plays. The original Retro Bowl engine's AI-offense path (case 10
in the FSM, the `_Ib1` AI play-call branch) is GUTTED in this
build — it's a no-op.

Concrete consequences when wiring engine behavior:

1. **PAT after a touchdown** — the human who scored ALWAYS plays
   the PAT. No fallback dice roll, no auto-credit, no AI kicker.
   - On a normal TD by user X on user X's drive, the engine's
     natural PAT modal pops on X's screen and X plays it out.
     That's correct — leave it alone.
   - On a pick-6 (interception returned for TD), the team that
     scored is the DEFENDER, which is the opponent on the other
     device, not the user who threw the INT. The engine doesn't
     know it's 2P, so it tries to pop the PAT modal on the
     thrower's screen — that's WRONG. The bridge must:
       (a) suppress the engine's natural PAT modal on the
           thrower's device (the frame-tight suppressor inside
           `engineCommentaryScriptHook` does this), and
       (b) pop the engine-native PAT modal on the defender's
           device via `_wm(...)` with script IDs 100367 / 100369
           (`applyOpponentOutcome`'s PICK6 branch does this).
     The defender plays the PAT, the result rides back over
     Firebase as a `PAT_RESULT` outcome, and the thrower's
     scoreboard updates from the wire result.

2. **Drive simulation** — any code that "auto-runs" an opponent
   drive (e.g. picks a yardLine deterministically, awards points
   without a played-out scene, advances vyStage past 10 without a
   human input on the offense-controlling device) is FORBIDDEN.
   The only exception is the 30 s deadlock-fallback in the PICK6
   send branch, which forces A's next drive ONLY when the engine's
   own cascade has stalled — a true emergency, not a substitute
   for human input.

3. **PAT probabilities** — there must never be a `Math.random()`
   call deciding whether a PAT succeeds. The engine's played-out
   1-PT kick scene + 2-PT goal-line snap are the only outcome
   sources for extra points.

If a future change makes the bridge add points without a human
having played the scene that earned them, that's a regression of
this rule — fix it by routing the play to the correct device's
canvas instead.
