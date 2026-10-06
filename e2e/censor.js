// e2e/censor.js — V485 (the owner: "censor the slur"): the slur filter (index.html SLUR-FILTER, run in Node by
// tools/highlights/censor.js). A player's name ended in the n-word run into a word; the comment filter (whole words)
// let it through. The words are built from pieces so this file reads clean.
//   C1  slurs are censored inside a word, in leetspeak, with dots between, spelled out; a name of only a slur is ''
//   C2  real names and the judge's lines are untouched (Nigel, Nigeria, niggling, raccoon, spicy, the day's players)
const C = require('../tools/highlights/censor.js');
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? ' — ' + d : ''))); };
const N = 'nig' + 'ger', NA = 'nig' + 'ga', F = 'fag' + 'got';
const hits = [['wisdom' + N, 'wisdom******'], ['N1GG3R', '******'], [NA.split('').join(' '), '* * * * *'], ['xX' + F + 'Xx', 'xX******Xx'],
              [F.split('').join('.'), '***********'], ['ni99a', '*****'], ['R3TARD', '******'], ['big ' + NA + 's', 'big ******']];
const bad = hits.filter(([a, b]) => C.censor(a) !== b || !C.hasSlur(a)).map(([a, b]) => C.censor(a) + ' (want ' + b + ')');
check('C1 slurs are censored: inside a word, leetspeak, dotted, spelled out; a name of only a slur is no name', !bad.length && C.censorName(N) === '', bad.join(' | '));
const clean = ['Nigel', 'Nigeria', 'a niggling injury', 'Montenegro', 'raccoon', 'spicy', 'Lani99', 'Mini69', 'Slimshady', 'Tony Sanchez', '44', 'Home Deebo',
               'Dart Vader', 'Eskindir Behailu', 'ssSitesENg', 'Brotrim', 'Touchity', 'bennett', 'Leaf against', 'a 4th-and-19',
               'Kelce shakes 5 diving defenders, stiff-arms and hurdles for 43', 'Bland picks off Stroud and returns it 79 yards for a pick-six'];
const moved = clean.filter(t => C.censor(t) !== t || C.hasSlur(t));
check('C2 real names and the judge\'s lines are untouched', !moved.length, moved.join(' | '));
console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail ? 1 : 0);
