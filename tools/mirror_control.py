#!/usr/bin/env python3
"""
mirror_control.py — drive the real iPhone through macOS "iPhone Mirroring".

Taps/drags posted here are RELAYED BY iPhone Mirroring as REAL, TRUSTED touches
on the phone — unlike Safari Web Inspector (JS-eval only) or in-page synthetic
events (which the Retro Bowl engine ignores). This is the one control path that
can actually snap/throw in the game.

Coordinates for tap/drag/swipe are WINDOW-RELATIVE POINTS: (0,0) = top-left of the
mirrored phone screen, (W,H) = bottom-right, where W,H are the window's point size
(not the retina pixel size of a screenshot). Use --info to print W,H.

Requires (one-time, in System Settings > Privacy & Security):
  - Screen Recording  -> the app running this (Claude Code / Terminal)
  - Accessibility      -> same app
iPhone Mirroring must be open and connected (phone unlocked at least once).

Usage:
  mirror_control.py info
  mirror_control.py shot [out.png]
  mirror_control.py tap X Y
  mirror_control.py drag X1 Y1 X2 Y2 [DURATION_S]
  mirror_control.py swipe up|down|left|right [FRACTION]
  mirror_control.py home | apps | spotlight     # ⌘1 / ⌘2 / ⌘3
  mirror_control.py key <keycode> [cmd,shift,...]
"""
import sys, time, subprocess, tempfile, os
import Quartz

APP = "iPhone Mirroring"


def window_info():
    """Return (id, x, y, w, h) for the iPhone Mirroring window."""
    wins = Quartz.CGWindowListCopyWindowInfo(
        Quartz.kCGWindowListOptionOnScreenOnly | Quartz.kCGWindowListExcludeDesktopElements,
        Quartz.kCGNullWindowID)
    for w in wins:
        if APP in w.get('kCGWindowOwnerName', ''):
            b = w['kCGWindowBounds']
            return (int(w['kCGWindowNumber']), float(b['X']), float(b['Y']), float(b['Width']), float(b['Height']))
    raise SystemExit("iPhone Mirroring window not found — is the app open & connected?")


def window_bounds():
    _, x, y, w, h = window_info()
    return (x, y, w, h)


def activate():
    subprocess.run(['open', '-a', APP])
    time.sleep(0.4)


def to_global(wx, wy):
    x, y, w, h = window_bounds()
    return (x + float(wx), y + float(wy))


def _post(ev):
    Quartz.CGEventPost(Quartz.kCGHIDEventTap, ev)


def move(gx, gy):
    _post(Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventMouseMoved, (gx, gy), Quartz.kCGMouseButtonLeft))


def tap(wx, wy, hold=0.06):
    activate()
    gx, gy = to_global(wx, wy)
    move(gx, gy); time.sleep(0.03)
    _post(Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventLeftMouseDown, (gx, gy), Quartz.kCGMouseButtonLeft))
    time.sleep(hold)
    _post(Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventLeftMouseUp, (gx, gy), Quartz.kCGMouseButtonLeft))


def drag(wx1, wy1, wx2, wy2, dur=0.25, steps=None):
    """Press at (x1,y1), move to (x2,y2) over dur seconds, release. This is a real
    swipe/drag on the phone — the engine snap/throw slingshot needs this."""
    activate()
    gx1, gy1 = to_global(wx1, wy1)
    gx2, gy2 = to_global(wx2, wy2)
    if steps is None:
        steps = max(6, int(dur / 0.012))
    move(gx1, gy1); time.sleep(0.02)
    _post(Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventLeftMouseDown, (gx1, gy1), Quartz.kCGMouseButtonLeft))
    time.sleep(0.02)
    for i in range(1, steps + 1):
        t = i / steps
        gx = gx1 + (gx2 - gx1) * t
        gy = gy1 + (gy2 - gy1) * t
        _post(Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventLeftMouseDragged, (gx, gy), Quartz.kCGMouseButtonLeft))
        time.sleep(dur / steps)
    _post(Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventLeftMouseUp, (gx2, gy2), Quartz.kCGMouseButtonLeft))


def swipe(direction, frac=0.5, dur=0.2):
    x, y, w, h = window_bounds()
    cx, cy = w / 2, h / 2
    d = {'up': (cx, cy + h * frac / 2, cx, cy - h * frac / 2),
         'down': (cx, cy - h * frac / 2, cx, cy + h * frac / 2),
         'left': (cx + w * frac / 2, cy, cx - w * frac / 2, cy),
         'right': (cx - w * frac / 2, cy, cx + w * frac / 2, cy)}[direction]
    drag(*d, dur=dur)


def shot(out=None):
    """Capture the iPhone Mirroring window BY ID — occlusion-proof, so it grabs the
    phone even when laptop windows sit on top of the mirror window."""
    wid, x, y, w, h = window_info()
    if out is None:
        out = tempfile.mktemp(suffix='.png')
    subprocess.run(['screencapture', '-x', '-o', f'-l{wid}', out])
    return out


def key(keycode, mods=None):
    """Post a keystroke to the (frontmost) iPhone Mirroring window."""
    activate()
    flags = 0
    for m in (mods or []):
        flags |= {'cmd': Quartz.kCGEventFlagMaskCommand, 'shift': Quartz.kCGEventFlagMaskShift,
                  'alt': Quartz.kCGEventFlagMaskAlternate, 'ctrl': Quartz.kCGEventFlagMaskControl}[m]
    for down in (True, False):
        ev = Quartz.CGEventCreateKeyboardEvent(None, keycode, down)
        if flags:
            Quartz.CGEventSetFlags(ev, flags)
        _post(ev)
        time.sleep(0.03)


def main():
    a = sys.argv[1:]
    if not a:
        print(__doc__); return
    cmd = a[0]
    if cmd == 'info':
        x, y, w, h = window_bounds()
        print(f"window pt: x={x} y={y} w={w} h={h}")
    elif cmd == 'shot':
        print(shot(a[1] if len(a) > 1 else None))
    elif cmd == 'tap':
        tap(float(a[1]), float(a[2]))
    elif cmd == 'drag':
        dur = float(a[5]) if len(a) > 5 else 0.25
        drag(float(a[1]), float(a[2]), float(a[3]), float(a[4]), dur=dur)
    elif cmd == 'swipe':
        swipe(a[1], float(a[2]) if len(a) > 2 else 0.5)
    elif cmd == 'home':
        key(18, ['cmd'])       # ⌘1
    elif cmd == 'apps':
        key(19, ['cmd'])       # ⌘2
    elif cmd == 'spotlight':
        key(20, ['cmd'])       # ⌘3
    elif cmd == 'key':
        key(int(a[1]), a[2].split(',') if len(a) > 2 else [])
    else:
        print("unknown:", cmd); print(__doc__)


if __name__ == '__main__':
    main()
