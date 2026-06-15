// Pure-JS unit check of the equal-possession OT round decision (V109). No
// browser — mirrors _rb2p_otCheckRoundEnd: a round ends when both teams have
// finished the SAME number of possessions and one leads; a tie plays on. Walks
// the per-device possession counters through several scoring sequences.
module.exports = {
    name: 'OT round logic (equal-possession, pure JS)',
    browser: false,
    async run() {
        // Simulate the global possession sequence; R1 = coin-flip winner, first.
        function play(seq) {
            const score = { R1: 0, R2: 0 }, my = { R1: 0, R2: 0 }, opp = { R1: 0, R2: 0 };
            for (let i = 0; i < seq.length; i++) {
                const t = seq[i].team, other = t === 'R1' ? 'R2' : 'R1';
                score[t] += seq[i].pts;
                my[t]++; opp[other]++;                       // possession completed
                for (const d of ['R1', 'R2']) {              // both devices evaluate
                    if (my[d] === opp[d] && my[d] > 0 && score.R1 !== score.R2) {
                        return (score.R1 > score.R2 ? 'R1' : 'R2') + ' ' + score.R1 + '-' + score.R2;
                    }
                }
            }
            return 'continue';
        }
        const cases = [
            { seq: [{ team: 'R1', pts: 7 }, { team: 'R2', pts: 3 }], want: 'R1 7-3' },        // FG can't match a TD
            { seq: [{ team: 'R1', pts: 0 }, { team: 'R2', pts: 3 }], want: 'R2 0-3' },        // leader after equal poss wins
            { seq: [{ team: 'R1', pts: 7 }, { team: 'R2', pts: 7 }, { team: 'R1', pts: 3 }, { team: 'R2', pts: 0 }], want: 'R1 10-7' }, // tie → round 2
            { seq: [{ team: 'R1', pts: 8 }, { team: 'R2', pts: 7 }], want: 'R1 8-7' },        // PATs matter (2pt vs 1pt)
            { seq: [{ team: 'R1', pts: 7 }, { team: 'R2', pts: 7 }], want: 'continue' }       // tied round → keep going
        ];
        const fails = [];
        for (const c of cases) {
            const got = play(c.seq);
            if (got !== c.want) fails.push(JSON.stringify(c.seq) + ' want ' + c.want + ' got ' + got);
        }
        return { pass: fails.length === 0, detail: fails.length ? fails.join(' | ') : cases.length + ' sequences correct' };
    }
};
