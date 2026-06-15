// V126: ULTRAMAX difficulty — the user enters a RAW engineDefenseAggression
// number that is applied verbatim (no opponent-D nudge). This asserts the
// public computeDefenseAggression() returns exactly the stored ultramax value
// when the pref is 'ultramax', and falls back to the preset model otherwise.
module.exports = {
    name: 'ULTRAMAX returns the raw entered aggression (V126)',
    browser: true,
    match: false,
    async run({ page }) {
        const r = await page.evaluate(() => {
            const fn = window._rb2p_computeDefenseAggression;
            if (typeof fn !== 'function') return { err: 'computeDefenseAggression missing' };
            // ULTRAMAX: raw value, verbatim.
            localStorage.setItem('rb2p_difficulty', 'ultramax');
            localStorage.setItem('rb2p_ultramax_value', '-30');
            const ultra = fn();
            // A preset must still go through the rating-nudged model (not the raw path).
            localStorage.setItem('rb2p_difficulty', 'max');
            const presetMax = fn();
            return { ultra, presetMax };
        });
        const ultraOk  = (r.ultra === -30);              // exactly what was typed
        const presetOk = (typeof r.presetMax === 'number' && r.presetMax !== -30); // nudged model, not the raw value
        return {
            pass: !r.err && ultraOk && presetOk,
            detail: r.err || ('ultramax(-30)=' + r.ultra + ' presetMax=' + r.presetMax)
        };
    }
};
