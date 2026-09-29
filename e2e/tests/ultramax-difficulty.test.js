// V137 rule (this test was written for V126 and still expected the raw typed value): the
// engine's hardest defense is aggression -5 EXACTLY — values below -5 shrink the pursuit
// timers and make defense WEAKER. So ULTRAMAX returns the typed value clamped to a -5 floor,
// 'max' returns exactly -5 (no opponent nudge), and the presets keep the nudged model.
module.exports = {
    name: 'ULTRAMAX is the typed aggression clamped to the -5 floor; max is exactly -5 (V137)',
    browser: true,
    match: false,
    async run({ page }) {
        const r = await page.evaluate(() => {
            const fn = window._rb2p_computeDefenseAggression;
            if (typeof fn !== 'function') return { err: 'computeDefenseAggression missing' };
            const save = { d: localStorage.getItem('rb2p_difficulty'), u: localStorage.getItem('rb2p_ultramax_value') };
            localStorage.setItem('rb2p_difficulty', 'ultramax');
            localStorage.setItem('rb2p_ultramax_value', '-30'); const below = fn();
            localStorage.setItem('rb2p_ultramax_value', '-2.5'); const above = fn();
            localStorage.setItem('rb2p_difficulty', 'max'); const max = fn();
            localStorage.setItem('rb2p_difficulty', 'easy'); const easy = fn();
            if (save.d === null) localStorage.removeItem('rb2p_difficulty'); else localStorage.setItem('rb2p_difficulty', save.d);
            if (save.u === null) localStorage.removeItem('rb2p_ultramax_value'); else localStorage.setItem('rb2p_ultramax_value', save.u);
            return { below, above, max, easy };
        });
        const ok = !r.err && r.below === -5 && r.above === -2.5 && r.max === -5 && typeof r.easy === 'number' && r.easy > -5;
        return { pass: ok, detail: r.err || JSON.stringify(r) };
    }
};
