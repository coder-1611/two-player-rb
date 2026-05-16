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
