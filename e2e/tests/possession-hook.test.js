// V121: s_change_possession (_1c1) must be hooked on BOTH the script registry
// AND the global name — the engine calls it by bare name internally (the INT
// turnover path), which the registry-only hook missed (interceptions kept
// possession with the thrower).
module.exports = {
    name: 'possession hook installed on global + registry (V121)',
    browser: true,
    match: true,
    async run({ page }) {
        const r = await page.evaluate(() => ({
            inMatch: (_ft._gt() === 17),
            globalHooked: !!(window._1c1 && window._1c1._p2p_hooked),
            bareResolvesHooked: (typeof _1c1 === 'function' && !!_1c1._p2p_hooked),
            registryHooked: (function () {
                try {
                    for (var i = 0; i < _Y._OU1.length; i++) {
                        if (_Y._OU1[i] === 'gml_Script_s_change_possession' || _Y._OU1[i] === 'gml_Script__1c1')
                            return !!_Y._PU1[i]._p2p_hooked;
                    }
                } catch (e) {}
                return false;
            })()
        }));
        const pass = r.inMatch && r.globalHooked && r.bareResolvesHooked && r.registryHooked;
        return { pass, detail: 'global=' + r.globalHooked + ' bare=' + r.bareResolvesHooked +
                               ' registry=' + r.registryHooked };
    }
};
