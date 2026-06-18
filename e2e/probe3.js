// Pull offensive player positions + route vectors from the LIVE instances.
// Uses the proven two-player harness so we reliably get into a match, then reads
// obj_playerOF (.x/.y + GM motion vars) at pre-snap and just after a trusted hike.
const H = require('./harness');
const TP = require('./two-player');

(async () => {
    await H.ensureServer();
    const game = await TP.startTwoPlayerGame({ code: 'ZPB3' });
    try {
        // find the offense page (reliably in-match via the harness)
        let off = null;
        for (let i = 0; i < 30; i++) {
            const a = await TP.snapshot(game.a.page), b = await TP.snapshot(game.b.page);
            if (a.inMatch && b.inMatch) { off = a.waiting ? game.b.page : game.a.page; break; }
            await H.sleep(600);
        }
        if (!off) { console.log('no in-match offense'); return; }
        await H.sleep(1500);

        const dump = (lbl) => off.evaluate((lbl) => {
            const inst = (_Sc2 && _Sc2._GL2 && _Sc2._GL2._oq2) || [];
            const safe = (o, k) => { try { const v = o[k]; return typeof v === 'number' ? Math.round(v * 100) / 100 : undefined; } catch (e) { return undefined; } };
            const grab = (name) => { const r = []; for (const x of inst) { if (x && !x._HL2 && x._eE2 && x._eE2._fE2 === name) r.push({ id: x.id, x: safe(x, 'x'), y: safe(x, 'y'), hsp: safe(x, 'hspeed'), vsp: safe(x, 'vspeed'), dir: safe(x, 'direction'), spd: safe(x, 'speed') }); } return r; };
            const s = RB.engineState() || {};
            // legacy GM view (camera): view_xview=_IE4, yview=_JE4, wview=_KE4, hview=_LE4
            const rd = (n) => { try { return (typeof window[n] !== 'undefined' ? window[n] : eval(n)); } catch (e) { return undefined; } };
            const vx = rd('_IE4'), vy = rd('_JE4'), vw = rd('_KE4'), vh = rd('_LE4');
            const view = { x: vx && vx[0], y: vy && vy[0], w: vw && vw[0], h: vh && vh[0] };
            const ball = grab('obj_ball')[0];
            let ballScreen = null;
            if (ball && view.w) ballScreen = { fx: Math.round((ball.x - view.x) / view.w * 1000) / 1000, fy: Math.round((ball.y - view.y) / view.h * 1000) / 1000 };
            return { lbl, inMatch: (() => { try { return RB.isEngineInMatchRoom(); } catch (e) { return false; } })(),
                     driveDir: s.engineDriveDirection, carrier: s.engineActivePlayerInst, kp: s.engineControllerState,
                     view, ballScreen, ofCount: grab('obj_playerOF').length, of: grab('obj_playerOF'), ball: grab('obj_ball') };
        }, lbl);

        console.log('PRE-SNAP:', JSON.stringify(await dump('pre')));
        const box = await off.evaluate(() => { const c = document.getElementById('canvas'); const r = c.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; });
        await off.mouse.move(box.l + box.w * 0.5, box.t + box.h * 0.62);
        await off.mouse.down();
        await H.sleep(300);
        console.log('JUST-SNAPPED:', JSON.stringify(await dump('snap')));
        await H.sleep(400);
        console.log('MID-PLAY:', JSON.stringify(await dump('mid')));
        await off.mouse.move(box.l + box.w * 0.55, box.t + box.h * 0.35, { steps: 4 });
        await off.mouse.up();
    } finally {
        await game.cleanup();
    }
})().catch(e => { console.error('ERR', e); process.exit(1); });
