// e2e/v524-social-rules.js — V524 (the owner: "add a challenge system, where you can directly challenge someone, but they
// have to be on the rankings page. On it should show when last online. There should also be a dm feature where you can
// message someone, and it is stored forever, like insta"): the database rules behind it, against the LIVE database, as
// three real anonymous players A, B and C (each addressed, like the board, by the first 8 characters of its device id).
//   S1  last online: A writes its own on/<A> (a server time) and nobody else's; anyone signed in reads it
//   S2  a message: A writes into the A-B conversation; B reads it; C can neither read nor write it
//   S3  stored forever: no one edits or deletes a message (not even its sender), and no one sends as someone else; a
//       message is 1-500 characters
//   S4  the inbox: A updates B's line for A (the preview) and its own; only B reads B's inbox; C writes no one's
//   S5  a challenge: A challenges B (ch/<B>/<A>); B lists its challenges and answers; A reads its own; C does neither;
//       no one challenges themselves
//   S6  BLOCK: B blocks A — A can no longer message B, touch B's inbox, or challenge B; only B sets B's blocks; A can see
//       it is blocked; UNBLOCK lets A message again
//   S7  the link: a page's database connection signs in as its own anonymous account (D), while the RANKINGS know the
//       player by the page's REST account (A). Until A writes sid/<A> = D's uid, D can't act as A; only A can write that
//       link; then D sets A's last online, sends as A and reads A's conversation and inbox
// Everything written here is removed at the end (the owner's admin token — the rules bind players, not the owner).
const fs = require('fs'), os = require('os'), path = require('path');
const DB = 'https://realretrobowl2p-default-rtdb.firebaseio.com/';
const KEY = 'AIzaSyDvaE6pbLsIerleUr2sLpiOs-jmP39ihk0';   // the page's public web key
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
const TS = { '.sv': 'timestamp' };

async function anon() {
    const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + KEY, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }) });
    const j = await r.json(); if (!j.idToken) throw new Error('anonymous sign-in: ' + JSON.stringify(j).slice(0, 200));
    return { tok: j.idToken, uid: j.localId, p: j.localId.slice(0, 8) };
}
async function owner() {
    const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/configstore/firebase-tools.json'), 'utf8'));
    const body = new URLSearchParams({ client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com', client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
                                       refresh_token: cfg.tokens.refresh_token, grant_type: 'refresh_token' });
    return (await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body })).json()).access_token;
}
// → true when the database allowed it
async function req(who, method, p, v) {
    const r = await fetch(DB + p + '.json?auth=' + encodeURIComponent(who.tok), { method, body: v === undefined ? undefined : JSON.stringify(v) });
    return r.ok;
}
const put = (w, p, v) => req(w, 'PUT', p, v), patch = (w, p, v) => req(w, 'PATCH', p, v), del = (w, p) => req(w, 'DELETE', p), get = (w, p) => req(w, 'GET', p);
async function val(who, p) { const r = await fetch(DB + p + '.json?auth=' + encodeURIComponent(who.tok)); return r.ok ? r.json() : undefined; }

(async () => {
    console.log('=== V524 RULES: LAST ONLINE, CHALLENGES, MESSAGES (live database) ===');
    const A = await anon(), B = await anon(), C = await anon(), D = await anon();
    const [x, y] = [A.p, B.p].sort(), T = 'dm/t/' + x + '/' + y;
    const gone = ['sid/' + A.p, 'on/' + A.p, 'on/' + B.p, 'on/' + C.p, T, 'dm/i/' + A.p, 'dm/i/' + B.p, 'dm/i/' + C.p, 'dm/b/' + B.p, 'ch/' + B.p, 'ch/' + A.p];
    try {
        // S1
        const s1 = { own: await put(A, 'on/' + A.p, TS), other: await put(A, 'on/' + B.p, TS), read: await get(C, 'on/' + A.p), num: typeof (await val(B, 'on/' + A.p)) === 'number',
                     notNum: await put(A, 'on/' + A.p, 'now') };
        check('S1 last online: A writes its own (a server time) but not B\'s, and not a non-number; anyone signed in reads it',
              s1.own && !s1.other && s1.read && s1.num && !s1.notNum, JSON.stringify(s1));
        // S2
        const m1 = { f: A.p, x: 'rules test hello', at: TS };
        const s2 = { send: await put(A, T + '/m1', m1), bRead: !!((await val(B, T)) || {}).m1, cRead: await get(C, T), cWrite: await put(C, T + '/m2', { f: C.p, x: 'hi', at: TS }),
                     cWriteAsA: await put(C, T + '/m3', { f: A.p, x: 'hi', at: TS }) };
        check('S2 A messages B: B reads the conversation; C can neither read it nor write into it (not even pretending to be A)',
              s2.send && s2.bRead && !s2.cRead && !s2.cWrite && !s2.cWriteAsA, JSON.stringify(s2));
        // S3
        const s3 = { edit: await put(A, T + '/m1/x', 'changed'), editAll: await put(A, T + '/m1', { f: A.p, x: 'changed', at: TS }), del: await del(A, T + '/m1'), delB: await del(B, T + '/m1'),
                     spoof: await put(A, T + '/m4', { f: B.p, x: 'as B', at: TS }), long: await put(A, T + '/m5', { f: A.p, x: 'z'.repeat(501), at: TS }),
                     empty: await put(A, T + '/m6', { f: A.p, x: '', at: TS }), max: await put(A, T + '/m7', { f: A.p, x: 'z'.repeat(500), at: TS }) };
        const still = (await val(B, T)) || {};
        check('S3 stored forever: no edit, no delete (by either side), no message as someone else, 1-500 characters (500 is fine)',
              !s3.edit && !s3.editAll && !s3.del && !s3.delB && !s3.spoof && !s3.long && !s3.empty && s3.max && still.m1 && still.m1.x === 'rules test hello', JSON.stringify(s3));
        // S4
        const s4 = { bLine: await patch(A, 'dm/i/' + B.p + '/' + A.p, { n: 'RulesA', x: 'rules test hello', at: TS, f: A.p }), aLine: await patch(A, 'dm/i/' + A.p + '/' + B.p, { n: 'RulesB', x: 'rules test hello', at: TS, f: A.p, s: TS }),
                     bReads: !!((await val(B, 'dm/i/' + B.p)) || {})[A.p], cReads: await get(C, 'dm/i/' + B.p), aReadsB: await get(A, 'dm/i/' + B.p),
                     cWrites: await patch(C, 'dm/i/' + B.p + '/' + A.p, { x: 'spam' }), cWritesOwnForB: await patch(C, 'dm/i/' + B.p + '/' + C.p, { n: 'C', x: 'hi', at: TS, f: C.p }) };
        check('S4 the inbox: A sets B\'s line for A and its own; only B reads B\'s inbox; C can\'t touch the A line (its own line in B\'s inbox, as a sender, is allowed)',
              s4.bLine && s4.aLine && s4.bReads && !s4.cReads && !s4.aReadsB && !s4.cWrites && s4.cWritesOwnForB, JSON.stringify(s4));
        // S5
        const s5 = { send: await put(A, 'ch/' + B.p + '/' + A.p, { n: 'RulesA', r: 1000, at: TS, st: 'open' }), bList: !!((await val(B, 'ch/' + B.p)) || {})[A.p], aOwn: await get(A, 'ch/' + B.p + '/' + A.p),
                     aList: await get(A, 'ch/' + B.p), cRead: await get(C, 'ch/' + B.p + '/' + A.p), cWrite: await patch(C, 'ch/' + B.p + '/' + A.p, { st: 'no' }),
                     answer: await patch(B, 'ch/' + B.p + '/' + A.p, { st: 'yes', code: 'Z999' }), self: await put(A, 'ch/' + A.p + '/' + A.p, { n: 'me', at: TS, st: 'open' }) };
        check('S5 a challenge: A challenges B; B lists and answers it; A reads only its own; C can\'t read or answer it; no one challenges themselves',
              s5.send && s5.bList && s5.aOwn && !s5.aList && !s5.cRead && !s5.cWrite && s5.answer && !s5.self, JSON.stringify(s5));
        // S6
        const s6 = { block: await put(B, 'dm/b/' + B.p + '/' + A.p, true), cBlocks: await put(C, 'dm/b/' + B.p + '/' + C.p, true), aSees: (await val(A, 'dm/b/' + B.p + '/' + A.p)) === true,
                     aMsg: await put(A, T + '/m8', { f: A.p, x: 'blocked?', at: TS }), aLine: await patch(A, 'dm/i/' + B.p + '/' + A.p, { x: 'blocked?' }),
                     aCh: await put(A, 'ch/' + B.p + '/' + A.p, { n: 'RulesA', at: TS, st: 'open' }), bMsg: await put(B, T + '/m9', { f: B.p, x: 'B can still write', at: TS }) };
        s6.unblock = await del(B, 'dm/b/' + B.p + '/' + A.p);
        s6.aAgain = await put(A, T + '/m10', { f: A.p, x: 'after unblock', at: TS });
        check('S6 BLOCK: B blocks A — A can\'t message B, write B\'s inbox or challenge B; only B sets B\'s blocks; A sees it; UNBLOCK lets A message again',
              s6.block && !s6.cBlocks && s6.aSees && !s6.aMsg && !s6.aLine && !s6.aCh && s6.bMsg && s6.unblock && s6.aAgain, JSON.stringify(s6));
        // S7
        const s7 = { before: await put(D, 'on/' + A.p, TS), cLinks: await put(C, 'sid/' + A.p, C.uid), dLinks: await put(D, 'sid/' + A.p, D.uid), link: await put(A, 'sid/' + A.p, D.uid) };
        Object.assign(s7, { on: await put(D, 'on/' + A.p, TS), send: await put(D, T + '/m11', { f: A.p, x: 'from the connection', at: TS }), read: await get(D, T), inbox: await get(D, 'dm/i/' + A.p),
                            notOthers: await put(D, 'on/' + B.p, TS), sendAsB: await put(D, T + '/m12', { f: B.p, x: 'as B', at: TS }) });
        check('S7 the link: D can\'t act as A until A writes sid/<A> = D (C and D can\'t write it); then D sets A\'s last online, sends as A, reads A\'s conversation and inbox — and still not B\'s',
              !s7.before && !s7.cLinks && !s7.dLinks && s7.link && s7.on && s7.send && s7.read && s7.inbox && !s7.notOthers && !s7.sendAsB, JSON.stringify(s7));
    } finally {
        const tok = await owner();
        for (const p of gone) await fetch(DB + p + '.json?access_token=' + encodeURIComponent(tok), { method: 'DELETE' }).catch(() => {});
    }
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
