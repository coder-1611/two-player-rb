// V132: rooms idle for >2h are auto-deleted; fresh rooms survive. Loading the
// lobby runs sweepStaleRooms(), which deletes any room whose newest activity ts
// is older than ROOM_TTL_MS (2h). browser:false so we can seed Firebase BEFORE
// the page loads (the runner's normal flow opens the page before run()).
const FB_DB = 'https://realretrobowl2p-default-rtdb.firebaseio.com';
const put = (path, body) => fetch(FB_DB + path + '.json', { method: 'PUT', body: JSON.stringify(body) });
const get = (path) => fetch(FB_DB + path + '.json').then(r => r.json());
const del = (path) => fetch(FB_DB + path + '.json', { method: 'DELETE' }).catch(() => {});

module.exports = {
    name: 'rooms older than 2h are swept on load; fresh rooms survive (V132)',
    browser: false,
    async run({ H }) {
        await H.ensureServer();
        const THREE_H = 3 * 60 * 60 * 1000;
        const OLD = 'ZOLD', NEW = 'ZNEW';
        // Stale room: only activity is a join 3h ago. Fresh room: join just now.
        await put('/rooms/' + OLD + '/players/a', { ready: false, ts: Date.now() - THREE_H });
        await put('/rooms/' + NEW + '/players/a', { ready: false, ts: Date.now() });

        const browser = await H.launchBrowser();
        try {
            await H.openPage(browser, { match: false });   // loading runs the sweep
            await H.sleep(3000);                            // sweep is async after FB import
            const oldGone  = (await get('/rooms/' + OLD)) === null;
            const newAlive = (await get('/rooms/' + NEW)) !== null;
            return {
                pass: oldGone && newAlive,
                detail: 'staleRoomDeleted=' + oldGone + ' freshRoomKept=' + newAlive
            };
        } finally {
            await del('/rooms/' + OLD);
            await del('/rooms/' + NEW);
            await browser.close().catch(() => {});
        }
    }
};
