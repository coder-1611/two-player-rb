// e2e/highlights-stub-judge.js — V458: a stand-in for the daily highlights' judge (tools/highlights/daily.js --judge-cmd):
// the five highest measured scores, written as top5.json. It tests the machinery, not the taste.
const fs = require('fs'), path = require('path');
const dir = process.argv[2];
const lines = fs.readFileSync(path.join(dir, 'plays.tsv'), 'utf8').split('\n').filter(l => l && !l.startsWith('#'));
const head = lines[0].split('\t'), rows = lines.slice(1).map(l => Object.fromEntries(l.split('\t').map((v, i) => [head[i], v])));
rows.sort((a, b) => Number(b.measured_score) - Number(a.measured_score));
const sheets = fs.existsSync(path.join(dir, 'sheets')) ? fs.readdirSync(path.join(dir, 'sheets')) : [];
fs.writeFileSync(path.join(dir, 'top5.json'), JSON.stringify({ picks: rows.slice(0, 5).map((r, i) => ({ rank: i + 1, id: r.id, headline: 'Stub pick ' + (i + 1) + ': ' + r.carrier, why: 'The stub judge took the measured score ' + r.measured_score + '.' })), notes: 'stub; sheets seen: ' + sheets.length }));
