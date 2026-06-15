// The page loads, the GameMaker engine parses (the retrobowl.js bridge patches
// didn't break it), and the 2P bridge (window.RB) is present — with no
// non-benign page errors during boot.
module.exports = {
    name: 'load (engine parses, bridge present)',
    browser: true,
    match: false,
    async run({ page, errors }) {
        const r = await page.evaluate(() => ({
            engine: (typeof _Ib1 === 'function' && typeof _Yi === 'function'),
            bridge: (typeof RB !== 'undefined')
        }));
        const pass = r.engine && r.bridge && errors.length === 0;
        return { pass, detail: 'engine=' + r.engine + ' bridge=' + r.bridge +
                               ' pageErrors=' + errors.length };
    }
};
