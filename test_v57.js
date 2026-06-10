// test_v57.js — discrete-event simulation of the V57 pick-6 flow.
//
// WHY THIS EXISTS (and why test_detection.js was retired as authority):
// test_detection.js passed 73/73 for V56 while V56 failed in real play,
// because its engine model assumed _t11 (down number / PAT-pending marker)
// stays 6 until the post-PAT kickoff _1c1. The real engine resets it FIRST:
// s_action_result's epilogue (retrobowl.js:56012-56014) runs
// `n._kp = 1, n._7z = 1, (arg !== 9) && (n._t11 = 1)` on EVERY response
// except the modal-popping TD path (which early-returns at :55949).
//
// This sim's engine model is transcribed from the decompiled source read on
// 2026-06-10, with line citations:
//   - _hB / s_action_result cases 0,1,2,4,5 + epilogue ... retrobowl.js:55923-56015
//     * case 0 (arg 1, TD): _t11<6 → +6 to Sb1[_UD], pop PAT modal,
//       _t11=6, EARLY RETURN. _t11>=6 → +2 to Sb1[_UD], _Vy=1. (:55941-55955)
//     * case 1 (arg 2, TD-type): _t11>=6 → +2 to Sb1[_0z], _Vy=1.
//       _t11<6 → _1c1() THEN +6 to Sb1[_UD-after-flip] (the wrong-team
//       landmine), _Vy=10. (:55958-55971)
//     * case 2 (args 3/4): _t11>=6 → "Missed 2pt", _Vy=1. (:55973-55978)
//     * case 4 (arg 6, made kick): +1 to Sb1[_0z], _Vy=1. (:55984-55992)
//     * case 5 (arg 7, missed kick): _Z21 → _Vy=1. (:55994-55998)
//   - _1c1 / s_change_possession: _t11=1, _UD flips, _2c1=_Vy, _Vy=2,
//     drives++ ........................................ retrobowl.js:56446-56460
//   - _Zb1 / s_kick_off: _t11=1 then _1c1() ........... retrobowl.js:56407-56430
//   - _Ik1 / s_end_replay: _kp=2 then _hB(_Bk1) ....... retrobowl.js (s_end_replay)
//
// The bridge side is a faithful transcription of the V57 logic in index.html.
// THE AUTHORITATIVE TEST remains the in-browser `_rb2p_testPick6Live()`,
// which drives the real engine. This sim exists to hammer the SEQUENCING
// (races, latencies, clobbers) thousands of times, which the browser can't.
//
// Run: node test_v57.js [iterations] [seed]

'use strict';

var ITER = parseInt(process.argv[2] || '300', 10);
var SEED = parseInt(process.argv[3] || '1234', 10);

// --- seeded RNG (mulberry32) ---
function rng(seed) {
    var a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        var t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// --- discrete-event scheduler (virtual ms) ---
function Sim() {
    this.now = 0;
    this.q = [];          // {t, fn, id}
    this.nextId = 1;
    this.log = [];
}
Sim.prototype.at = function (t, fn) {
    var id = this.nextId++;
    this.q.push({ t: t, fn: fn, id: id, dead: false });
    return id;
};
Sim.prototype.after = function (dt, fn) { return this.at(this.now + dt, fn); };
Sim.prototype.cancel = function (id) {
    for (var i = 0; i < this.q.length; i++) if (this.q[i].id === id) this.q[i].dead = true;
};
Sim.prototype.every = function (dt, fn) {
    var sim = this;
    var rearm = function () {
        fn();
        sim.after(dt, rearm);
    };
    sim.after(dt, rearm);
};
Sim.prototype.run = function (until) {
    while (true) {
        var best = -1;
        for (var i = 0; i < this.q.length; i++) {
            var e = this.q[i];
            if (e.dead) continue;
            if (best < 0 || e.t < this.q[best].t) best = i;
        }
        if (best < 0) break;
        var ev = this.q[best];
        if (ev.t > until) break;
        this.q.splice(best, 1);
        this.now = ev.t;
        if (!ev.dead) ev.fn();
    }
    this.now = until;
};
Sim.prototype.note = function (msg) { this.log.push(this.now + 'ms ' + msg); };

// --- one device: engine (verified model) + V57 bridge ---
function Device(sim, name, bus) {
    var self = this;
    this.sim = sim; this.name = name; this.bus = bus;

    // engine state (one match object). _0z = 0 on every device (local user).
    this.e = {
        Sb1: [0, 0],     // scoreboard: [user, opp] in this device's frame
        z0: 0, UD: 0,    // user team idx / possessing team idx
        t11: 1, l61: 10, // down ("6" = PAT-pending), yards to go
        Vy: 2, _2c1: 2,  // FSM stage / prior stage
        kp: 2, Wy: 1,    // controller state / quarter
        drives: 0
    };
    this.modalUp = false;
    this.modalPops = 0;

    // bridge flags (V57)
    this.w = {
        cascade: false, thrower: false, raisedMs: 0,
        waiting: false, sending: false, lastApplyMs: -99999,
        patPending: false, patResolved: false, patStartMs: 0,
        patUser0: 0, patOpp0: 0, patResolvedMs: 0, patResultSentMs: 0,
        oppAtDriveStart: 0, baseline: 0,
        heldTimer: null, heldOutcome: null, heldStartMs: 0,
        ak1Ms: 0, ak1Scorer: undefined,
        driveRestarts: 0, intApplied: 0, pick6Applied: 0, patResultApplied: 0,
        wrongTeamRepairs: 0, reasserts: 0
    };
    this.w.baseline = this.opp();

    // thrower-mode popup killer (rAF ≈ 16ms; modeled at 50ms — pessimistic)
    sim.every(50, function () {
        if (self.w.cascade && self.w.thrower && self.modalUp) {
            self.modalUp = false;
            sim.note(name + ' killer: thrower-mode killed PAT modal');
        }
    });

    // score-jump watcher (100ms) — V57 (unchanged from V56 except no suppressor)
    sim.every(100, function () {
        var cur = self.opp();
        if (cur < self.w.baseline) { self.w.baseline = cur; return; }
        var jump = cur - self.w.baseline;
        if (jump === 0) return;
        self.w.baseline = cur;
        if (jump < 6) return;
        var ourDrive = (!self.w.waiting) || self.w.sending;
        if (!ourDrive) return;
        self.enterCascade('score-watcher(+' + jump + ')');
    });

    // PAT guardian (100ms) — V57
    sim.every(100, function () {
        if (!self.w.patPending && !self.w.patResolved) return;
        if (!self.w.cascade) { self.w.patPending = self.w.patResolved = false; return; }
        if (self.w.patPending) {
            if (sim.now - self.w.patStartMs > 120000) {
                self.w.patPending = false; self.w.patResolved = true; self.w.patResolvedMs = 0;
                return;
            }
            var ud = self.user() - self.w.patUser0;
            var od = self.opp() - self.w.patOpp0;
            if (od >= 6) {
                self.setOpp(self.w.patOpp0);
                self.e.UD = self.e.z0; self.e.t11 = 6; self.e.l61 = 2;
                self.w.baseline = self.opp();
                self.w.wrongTeamRepairs++;
                sim.note(name + ' GUARD: wrong-team +' + od + ' repaired');
                return;
            }
            if (ud === 1 || ud === 2) {
                self.w.patPending = false; self.w.patResolved = true;
                self.w.patResolvedMs = sim.now; self.patPoints = ud;
                sim.note(name + ' GUARD: PAT resolved +' + ud);
                return;
            }
            if ((self.e.Vy === 1 || self.e.Vy === 22) && ud === 0) {
                self.w.patPending = false; self.w.patResolved = true;
                self.w.patResolvedMs = sim.now; self.patPoints = 0;
                sim.note(name + ' GUARD: PAT resolved (miss)');
                return;
            }
            if (self.e.t11 !== 6) {
                self.e.t11 = 6; self.e.l61 = 2;
                self.w.reasserts++;
                sim.note(name + ' GUARD: _t11 clobber re-asserted');
            }
            return;
        }
        // resolved, waiting for kickoff _1c1 send
        if (sim.now - self.w.patResolvedMs > 5000) {
            self.sendPatResult('synthetic');
        }
    });
}
Device.prototype.user = function () { return this.e.Sb1[this.e.z0]; };
Device.prototype.opp  = function () { return this.e.Sb1[1 - this.e.z0]; };
Device.prototype.setUser = function (v) { this.e.Sb1[this.e.z0] = v; };
Device.prototype.setOpp  = function (v) { this.e.Sb1[1 - this.e.z0] = v; };

// --- engine: _1c1 (s_change_possession) wrapped by the bridge hook ---
Device.prototype.engine1c1 = function () {
    var pre = { UD: this.e.UD, z0: this.e.z0, t11: this.e.t11, _2c1: this.e._2c1, Vy: this.e.Vy };
    // real _1c1 body (retrobowl.js:56446-56460)
    this.e.t11 = 1; this.e.l61 = 10;
    this.e._2c1 = this.e.Vy;
    this.e.UD = 1 - this.e.UD;
    this.e.Vy = 2;
    this.e.drives++;
    // bridge hook
    this.hookAfter1c1(pre);
};
Device.prototype.hookAfter1c1 = function (pre) {
    var sim = this.sim, w = this.w, self = this;
    if (this.applying) return;
    if (!(pre.UD === pre.z0 && this.e.UD !== this.e.z0)) return;
    if (w.sending) return;
    if (sim.now - w.lastApplyMs < 2000) return;
    var prevVy = pre._2c1 || pre.Vy;
    var type = (prevVy === 9 || prevVy === 16) ? 'TD'
             : (prevVy === 8) ? 'INT'
             : (prevVy === 1) ? 'KICKOFF' : 'OTHER';
    var outcome = { type: type, scoreUser: this.user(), scoreOpp: this.opp() };
    // pick-6 in-hook detection (ak1 + heuristic)
    var ak1Recent = w.ak1Ms && (sim.now - w.ak1Ms) < 8000;
    var ak1Opp = w.ak1Scorer !== undefined && w.ak1Scorer !== pre.z0;
    var oppDelta = this.opp() - w.oppAtDriveStart;
    if ((ak1Recent && ak1Opp) || (type === 'INT' && oppDelta >= 6)) {
        this.enterCascade('1c1-hook');
        return;
    }
    // V57 PAT_RESULT re-type (with misroute discriminator)
    if (w.cascade && (w.patPending || w.patResolved || pre.t11 === 6)) {
        var patDelta = this.user() - w.patUser0;
        var isPostPat = w.patResolved || patDelta === 1 || patDelta === 2 || pre.Vy === 1;
        if (!isPostPat) {
            sim.note(this.name + ' swallowed misroute _1c1');
            return;
        }
        this.sendPatResult('1c1-hook');
        return;
    }
    w.sending = true; w.waiting = true;
    if (type === 'INT' || type === 'OTHER') {
        // held send with V57 replay-in-flight extension
        w.heldOutcome = outcome; w.heldStartMs = sim.now;
        var fire = function () {
            w.heldTimer = null;
            if (!w.heldOutcome) return;
            var ak1Opp2 = w.ak1Scorer !== undefined && w.ak1Scorer !== self.e.z0;
            if (w.ak1Ms && ak1Opp2 && (sim.now - w.heldStartMs) < 12000) {
                w.heldTimer = sim.after(1000, fire);
                return;
            }
            var o = w.heldOutcome; w.heldOutcome = null;
            self.bus.send(self, o);
        };
        w.heldTimer = sim.after(4000, fire);
    } else {
        this.bus.send(this, outcome);
    }
};
Device.prototype.sendPatResult = function (via) {
    var w = this.w;
    this.bus.send(this, { type: 'PAT_RESULT', scoreUser: this.user(), scoreOpp: this.opp() });
    w.patResultSentMs = this.sim.now;
    w.patPending = w.patResolved = false;
    w.cascade = w.thrower = false;
    w.sending = true; w.waiting = true;
    this.sim.note(this.name + ' sent PAT_RESULT via ' + via +
                  ' (' + this.user() + '/' + this.opp() + ')');
};

// --- engine: s_action_result (_hB), verified transcription ---
Device.prototype.engineActionResult = function (arg) {
    var e = this.e, sim = this.sim;
    var early = false;
    if (arg === 1) {            // case 0: TD
        if (e.t11 < 6) {
            e.Sb1[e.UD] += 6;
            this.modalUp = true; this.modalPops++;
            sim.note(this.name + ' engine: +6 to idx' + e.UD + ', PAT modal popped, _t11=6');
            e.t11 = 6;
            early = true;       // retrobowl.js:55949 `return ... void (n._t11 = 6)`
        } else {
            e.Sb1[e.UD] += 2; e.Vy = 1;
        }
    } else if (arg === 2) {     // case 1: TD-type (2-pt snap success path)
        if (e.t11 >= 6) {
            e.Sb1[e.z0] += 2; e.Vy = 1;
        } else {
            this.engine1c1();   // THE LANDMINE: flips UD first...
            e.Sb1[e.UD] += 6;   // ...then credits the FLIPPED side (wrong team)
            e.Vy = 10;
            sim.note(this.name + ' engine: FRESH-TD misroute! +6 to idx' + e.UD);
            // _Vy=10 → TD cascade → replay → _Ik1 → _hB(1) (modal re-pop)
            var self = this;
            sim.after(800, function () { self.engineActionResult(1); });
        }
    } else if (arg === 3 || arg === 4) {  // case 2: 2-pt miss
        if (e.t11 >= 6) { e.Vy = 1; }
        else { e.Vy = 22; }
    } else if (arg === 6) {     // case 4: made kick
        e.Sb1[e.z0] += 1; e.Vy = 1;
    } else if (arg === 7) {     // case 5: missed PAT kick
        e.Vy = 1;
    }
    if (!early && arg !== 9) {  // epilogue retrobowl.js:56012-56014
        e.kp = 1; e.t11 = 1;
    }
    // FSM: _Vy==1 → kickoff (_Zb1 → _1c1) on the next commentary beat
    if (e.Vy === 1) {
        var dev = this;
        sim.after(300, function () {
            if (dev.e.Vy !== 1) return;
            if (dev.fsmStuck) { sim.note(dev.name + ' FSM stuck (injected)'); return; }
            dev.e.t11 = 1;          // _Zb1 retrobowl.js:56415
            dev.engine1c1();
        });
    }
};

// --- V57 enterPickSixCascade (transcription) ---
Device.prototype.enterCascade = function (source) {
    var w = this.w, sim = this.sim, self = this;
    if (w.cascade) return;
    if (w.heldTimer) { sim.cancel(w.heldTimer); w.heldTimer = null; w.heldOutcome = null; }
    w.ak1Ms = 0; w.ak1Scorer = undefined;
    w.thrower = true; w.cascade = true; w.raisedMs = sim.now;
    w.sending = true; w.waiting = true;
    sim.note(this.name + ' cascade entered via ' + source);
    var deadline = sim.now + 8000;
    var poll = function () {
        if (!w.cascade) return;
        var landed = (self.opp() - w.oppAtDriveStart) >= 6;
        if (!landed && sim.now <= deadline) { sim.after(100, poll); return; }
        self.e.t11 = 1; self.e.l61 = 10; self.e.UD = 1 - self.e.z0;  // park
        self.bus.send(self, {
            type: 'PICK6', needsPAT: true, pick6Plus6Missing: !landed,
            scoreUser: self.user(), scoreOpp: self.opp()
        });
        sim.note(self.name + ' PICK6 sent (landed=' + landed + ')');
    };
    sim.after(100, poll);
    // 75s fallback
    sim.after(75000, function () {
        if (!w.cascade) return;
        w.cascade = w.thrower = false;
        w.lastApplyMs = sim.now; w.sending = false; w.waiting = false;
        w.driveRestarts++; w.oppAtDriveStart = self.opp();
        sim.note(self.name + ' 75s fallback drive');
    });
};

// --- V57 applyOpponentOutcome (transcription of the relevant branches) ---
Device.prototype.applyOutcome = function (o) {
    var w = this.w, sim = this.sim, e = this.e;
    if (w.heldTimer) { sim.cancel(w.heldTimer); w.heldTimer = null; w.heldOutcome = null; }
    if (o.type === 'PAT_RESULT') {
        var wasCascade = w.cascade;
        this.setOpp(o.scoreUser); this.setUser(o.scoreOpp);
        w.baseline = this.opp();
        w.cascade = w.thrower = w.patPending = w.patResolved = false;
        w.waiting = false; w.sending = false; w.lastApplyMs = sim.now;
        w.patResultApplied++;
        if (wasCascade) {
            w.driveRestarts++;
            e.UD = e.z0; e.t11 = 1; e.l61 = 10; e.Vy = 2; e.kp = 2;
            w.oppAtDriveStart = this.opp();
        }
        sim.note(this.name + ' PAT_RESULT applied (' + this.user() + '/' + this.opp() + ')');
        return;
    }
    if (o.type === 'PICK6') {
        this.setOpp(o.scoreUser);
        this.setUser(o.scoreOpp + (o.pick6Plus6Missing ? 6 : 0));
        w.baseline = this.opp();
        w.thrower = false; w.waiting = true; w.sending = false;
        w.lastApplyMs = sim.now;
        w.cascade = true; w.raisedMs = sim.now;
        e.UD = e.z0; e.t11 = 6; e.l61 = 2; e.kp = 2;
        this.modalUp = true; this.modalPops++;
        w.patPending = true; w.patResolved = false; w.patStartMs = sim.now;
        w.patUser0 = this.user(); w.patOpp0 = this.opp();
        w.pick6Applied++;
        sim.note(this.name + ' PICK6 applied — PAT modal up (' + this.user() + '/' + this.opp() + ')');
        return;
    }
    // generic (INT/OTHER/TD/KICKOFF)
    if (w.cascade) {
        w.cascade = w.thrower = w.patPending = w.patResolved = false;
        sim.note(this.name + ' OFF-SCRIPT generic ' + o.type + ' during cascade');
    }
    w.waiting = false; w.sending = false; w.lastApplyMs = sim.now;
    if (o.type === 'INT') this.w.intApplied++;
    this.setOpp(o.scoreUser); this.setUser(o.scoreOpp);
    w.baseline = this.opp();
    this.applying = true;
    e.UD = e.z0; e.t11 = 1; e.l61 = 10; e.Vy = 2; e.kp = 2;
    this.applying = false;
    w.driveRestarts++;
    w.oppAtDriveStart = this.opp();
};

// --- run one randomized scenario ---
function runScenario(rand, idx) {
    var sim = new Sim();
    var bus = {
        send: function (from, o) {
            var to = from === A ? B : A;
            var latency = 50 + Math.floor(rand() * 450);
            sim.after(latency, function () { to.applyOutcome(o); });
        }
    };
    var A = new Device(sim, 'A', bus);   // thrower (on offense)
    var B = new Device(sim, 'B', bus);   // scorer (defender, waiting)
    B.w.waiting = true;
    A.w.oppAtDriveStart = 0;

    var replayDelay = 300 + Math.floor(rand() * 8700);   // 0.3–9 s to the +6
    var thinkTime   = 1000 + Math.floor(rand() * 7000);  // B reads the modal
    var playDur     = 2000 + Math.floor(rand() * 8000);  // B plays the scene
    var choiceRoll  = rand();
    var choice = choiceRoll < 0.4 ? '1pt' : choiceRoll < 0.8 ? '2pt' : 'miss';
    var injectClobber = rand() < 0.5;
    var injectStuckFsm = rand() < 0.05;

    // t=0: A throws the pick — engine INT possession flip (case 15 fires
    // _1c1 BEFORE the TD credit; prior stage stale ⇒ 'OTHER'/'INT')
    sim.at(0, function () {
        A.e._2c1 = (rand() < 0.5) ? 8 : 2;   // stale prior stage varies
        A.e.UD = 0; A.e.z0 = 0;
        A.engine1c1();
    });
    // _Ak1 (replay start) shortly after
    sim.at(200, function () {
        A.w.ak1Ms = sim.now;
        A.w.ak1Scorer = A.e.UD;   // possessing team = the defender now
    });
    // replay end → _Ik1 → _hB(1): +6, modal, _t11=6 (suppressor INERT in V57)
    sim.at(200 + replayDelay, function () { A.engineActionResult(1); });

    // B: when the modal appears, think, click, play, result
    var bClicked = false;
    sim.every(100, function () {
        if (!B.modalUp || bClicked || !B.w.patPending) return;
        bClicked = true;
        sim.after(thinkTime, function () {
            B.modalUp = false;   // button click closes popups (_Lr)
            if (injectClobber) {
                // Half the clobbers land at a random mid-PAT moment (the
                // guardian's 100ms reassert should win). The other half land
                // INSIDE the guardian's blind window — 30ms before the play
                // result — so the engine's fresh-TD misroute actually
                // executes and the repair path must recover.
                var blindWindow = rand() < 0.5;
                var when = blindWindow
                    ? Math.max(playDur - 30, 1)
                    : Math.floor(rand() * Math.max(playDur - 200, 1));
                sim.after(when, function () {
                    if (B.w.patPending) {
                        B.e.t11 = 1;
                        sim.note('B CLOBBER injected (_t11=1' +
                                 (blindWindow ? ', blind window' : '') + ')');
                    }
                });
            }
            if (injectStuckFsm) B.fsmStuck = true;
            sim.after(playDur, function () {
                if (choice === '1pt') B.engineActionResult(6);
                else if (choice === '2pt') B.engineActionResult(2);
                else B.engineActionResult(choice === 'miss' && rand() < 0.5 ? 7 : 3);
            });
            // if the fresh-TD loop re-popped the modal, play it again once
            sim.every(500, function () {
                if (B.modalUp && B.w.patPending) {
                    B.modalUp = false;
                    sim.after(1000, function () { B.engineActionResult(2); });
                }
            });
        });
    });

    sim.run(120000);

    // --- verdicts ---
    var pat = (choice === 'miss') ? 0 : (choice === '1pt' ? 1 : 2);
    var expScorer = 6 + pat;
    var fails = [];
    if (B.user() !== expScorer) fails.push('B(user/scorer)=' + B.user() + ' exp ' + expScorer);
    if (B.opp()  !== 0)         fails.push('B(opp/thrower)=' + B.opp() + ' exp 0');
    if (A.opp()  !== expScorer) fails.push('A(opp/scorer)=' + A.opp() + ' exp ' + expScorer);
    if (A.user() !== 0)         fails.push('A(user/thrower)=' + A.user() + ' exp 0');
    if (A.w.patResultApplied !== 1) fails.push('A patResultApplied=' + A.w.patResultApplied);
    if (A.w.driveRestarts !== 1)    fails.push('A driveRestarts=' + A.w.driveRestarts);
    if (B.w.intApplied !== 0)       fails.push('B got stale INT (hold extension failed)');
    if (B.w.pick6Applied !== 1)     fails.push('B pick6Applied=' + B.w.pick6Applied);
    var maxModals = injectClobber ? 2 : 1;
    if (B.modalPops > maxModals)    fails.push('B modalPops=' + B.modalPops + ' max ' + maxModals);
    if (A.w.cascade || B.w.cascade) fails.push('cascade flag leaked');
    if (B.w.patPending || B.w.patResolved) fails.push('pat flags leaked');

    return {
        idx: idx, pass: fails.length === 0, fails: fails,
        params: { replayDelay: replayDelay, thinkTime: thinkTime, playDur: playDur,
                  choice: choice, clobber: injectClobber, stuckFsm: injectStuckFsm },
        stats: {
            reasserts: B.w.reasserts,
            repairs: B.w.wrongTeamRepairs,
            modalRepop: B.modalPops > 1,
            holdExtended: sim.log.some(function (l) { return l.indexOf('FRESH-TD') !== -1; }),
            syntheticSend: sim.log.some(function (l) { return l.indexOf('synthetic') !== -1; }),
            longReplay: replayDelay > 4000
        },
        log: sim.log
    };
}

// --- main ---
var rand = rng(SEED);
var passed = 0, failures = [];
var agg = { reasserts: 0, repairs: 0, modalRepop: 0, freshTdHit: 0, syntheticSend: 0, longReplay: 0 };
for (var i = 1; i <= ITER; i++) {
    var r = runScenario(rand, i);
    if (r.pass) passed++;
    else failures.push(r);
    if (r.stats.reasserts) agg.reasserts++;
    if (r.stats.repairs) agg.repairs++;
    if (r.stats.modalRepop) agg.modalRepop++;
    if (r.stats.holdExtended) agg.freshTdHit++;
    if (r.stats.syntheticSend) agg.syntheticSend++;
    if (r.stats.longReplay) agg.longReplay++;
}
console.log('V57 sim: ' + passed + '/' + ITER + ' passed (seed ' + SEED + ')');
console.log('  danger paths exercised: guardian-reasserts=' + agg.reasserts +
            ' wrong-team-repairs=' + agg.repairs +
            ' modal-repops=' + agg.modalRepop +
            ' fresh-TD-misroutes=' + agg.freshTdHit +
            ' synthetic-PAT_RESULT-sends=' + agg.syntheticSend +
            ' replay>4s(stale-INT-risk)=' + agg.longReplay);
if (failures.length) {
    console.log('--- first 3 failures ---');
    failures.slice(0, 3).forEach(function (f) {
        console.log('#' + f.idx, JSON.stringify(f.params));
        f.fails.forEach(function (x) { console.log('   ❌', x); });
        f.log.forEach(function (l) { console.log('   ', l); });
    });
    process.exit(1);
}
