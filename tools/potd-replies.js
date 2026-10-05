#!/usr/bin/env node
// tools/potd-replies.js — V465: the messages a play of the day's maker sent the creator from the CONGRATS box (they ride
// the bug-report path, complaints/, with the choice "PLAY OF THE DAY reply {date}"), and the day's comments.
//
//   node tools/potd-replies.js            every reply, newest first, and today's play of the day with its comments
//   node tools/potd-replies.js 2026-10-04 that day's comments
'use strict';
const path = require('path');
const DB = 'https://realretrobowl2p-default-rtdb.firebaseio.com/';
(async () => {
    const tok = await require(path.join(__dirname, 'fb-auth.js')).token();
    const get = async p => { const r = await fetch(DB + p + '.json?auth=' + tok, { cache: 'no-store' }); return r.ok ? r.json() : null; };
    const day = process.argv[2] || null;
    if (!day) {
        const c = await get('complaints') || {};
        const replies = Object.values(c).filter(x => x && Array.isArray(x.choices) && x.choices.some(ch => /^PLAY OF THE DAY reply/.test(ch))).sort((a, b) => b.ts - a.ts);
        console.log('Replies to the creator: ' + replies.length);
        for (const r of replies) console.log('  ' + new Date(r.ts).toLocaleString() + '  ' + (r.name || '?') + ' (' + r.choices.find(ch => /^PLAY OF THE DAY/.test(ch)).replace('PLAY OF THE DAY reply ', 'for ') + '): ' + r.text);
    }
    const potd = await (await fetch(DB + 'embedcode/potd.json')).json();
    const d = day || (potd && potd.date);
    if (potd && (!day || day === potd.date)) console.log('\nPlay of the day ' + potd.date + ': ' + potd.headline + ' — ' + potd.side + ' · ' + potd.name);
    const cm = d ? await get('rooms/~potd/c/' + d) : null;
    const list = Object.values(cm || {}).sort((a, b) => a.ts - b.ts);
    console.log('Comments on ' + d + ': ' + list.length);
    for (const x of list) console.log('  ' + new Date(x.ts).toLocaleTimeString() + '  ' + (x.uid && potd && x.uid === potd.uid ? '★ ' : '') + (x.name || '?') + ': ' + x.text);
    process.exit(0);
})().catch(e => { console.error('FATAL', e.message); process.exit(2); });
