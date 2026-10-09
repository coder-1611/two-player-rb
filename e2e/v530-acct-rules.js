// e2e/v530-acct-rules.js — V530 ACCOUNTS: the database rules for acct/<id>, against the LIVE database, as two real
// anonymous players A and B.
//   R1  A writes and reads its own acct/<A> (the username, the name); B can neither read it nor write it; A can't write B's
//   R2  the merge halves: acct/<A>/into must be an id (20+ characters); acct/<A>/from/<old> must be a time (a number)
// Everything written here is removed at the end (the owner's admin token).
const fs = require('fs'), os = require('os'), path = require('path');
const DB = 'https://realretrobowl2p-default-rtdb.firebaseio.com/';
const KEY = 'AIzaSyDvaE6pbLsIerleUr2sLpiOs-jmP39ihk0';
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
async function anon() {
    const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + KEY, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }) });
    const j = await r.json(); if (!j.idToken) throw new Error('anonymous sign-in: ' + JSON.stringify(j).slice(0, 200));
    return { tok: j.idToken, uid: j.localId };
}
async function owner() {
    const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/configstore/firebase-tools.json'), 'utf8'));
    const body = new URLSearchParams({ client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com', client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
                                       refresh_token: cfg.tokens.refresh_token, grant_type: 'refresh_token' });
    return (await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body })).json()).access_token;
}
const req = async (who, method, p, v) => (await fetch(DB + p + '.json?auth=' + encodeURIComponent(who.tok), { method, body: v === undefined ? undefined : JSON.stringify(v) })).ok;
(async () => {
    console.log('=== V530 RULES: acct/<id> (live database) ===');
    const A = await anon(), B = await anon();
    try {
        const r1 = { own: await req(A, 'PATCH', 'acct/' + A.uid, { u: 'rulestest', nm: 'Rules Test', at: { '.sv': 'timestamp' } }), read: await req(A, 'GET', 'acct/' + A.uid),
                     bRead: await req(B, 'GET', 'acct/' + A.uid), bWrite: await req(B, 'PATCH', 'acct/' + A.uid, { nm: 'hacked' }), aWritesB: await req(A, 'PATCH', 'acct/' + B.uid, { nm: 'x' }),
                     shortU: await req(A, 'PATCH', 'acct/' + A.uid, { u: 'ab' }) };
        check('R1 A writes and reads its own account record; B can\'t read or write it; A can\'t write B\'s; a username is 3-16',
              r1.own && r1.read && !r1.bRead && !r1.bWrite && !r1.aWritesB && !r1.shortU, JSON.stringify(r1));
        const r2 = { intoOk: await req(A, 'PUT', 'acct/' + A.uid + '/into', B.uid), intoBad: await req(A, 'PUT', 'acct/' + A.uid + '/into', 'short'),
                     fromOk: await req(A, 'PUT', 'acct/' + A.uid + '/from/' + B.uid, { '.sv': 'timestamp' }), fromBad: await req(A, 'PUT', 'acct/' + A.uid + '/from/' + B.uid, 'yes'),
                     bFrom: await req(B, 'PUT', 'acct/' + A.uid + '/from/' + B.uid, { '.sv': 'timestamp' }) };
        check('R2 the merge halves: into = an id, from/<old> = a time; nobody writes another account\'s', r2.intoOk && !r2.intoBad && r2.fromOk && !r2.fromBad && !r2.bFrom, JSON.stringify(r2));
    } finally {
        const tok = await owner();
        for (const u of [A.uid, B.uid]) {
            await fetch(DB + 'acct/' + u + '.json?access_token=' + encodeURIComponent(tok), { method: 'DELETE' }).catch(() => {});
            await fetch('https://identitytoolkit.googleapis.com/v1/projects/realretrobowl2p/accounts:delete', { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'content-type': 'application/json' }, body: JSON.stringify({ localId: u }) }).catch(() => {});
        }
    }
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
