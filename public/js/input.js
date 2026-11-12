import { BTN } from '/shared/constants.js';

// Keys use `e.code` (physical position) so ZQSD on AZERTY works like WASD.
const MAP = {
  KeyA: BTN.LEFT,
  ArrowLeft: BTN.LEFT,
  KeyD: BTN.RIGHT,
  ArrowRight: BTN.RIGHT,
  KeyW: BTN.JUMP,
  ArrowUp: BTN.JUMP,
  Space: BTN.JUMP,
  KeyS: BTN.DOWN,
  ArrowDown: BTN.DOWN,
  KeyG: BTN.ALT,
  KeyE: BTN.ALT,
  ShiftLeft: BTN.SPRINT,
  ShiftRight: BTN.SPRINT,
  KeyF: BTN.MELEE,
};

// Hotbar keys in unlock order: 1-9, 0, -, =, [, ] (physical positions, so AZERTY works too).
const BAR = { Minus: 10, Equal: 11, Digit0: 9, Numpad0: 9, BracketLeft: 12, BracketRight: 13 };

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouseBtn = 0;
    this.mx = 400;
    this.my = 225;
    // { bar: numbered hotbar slot }, { builder: true }, { abs: weapon }, { last: true } or { rel: +1/-1 }
    this.weaponReq = null;
    // Builder choice changes: { piece: +1/-1 } (R, Shift+R) or { style: +1 } (T).
    this.buildReq = null;
    // Buttons pressed since the last tick: a click or tap released before the tick still counts once.
    this.tapped = 0;
    this.touchButtons = 0;
    this.touchAutoPulseFire = false;
    this.touchAimLatched = false;
    this.touchAimAngle = 0;
    this.touchAimDist = 0.65;
    this.lastTouchMs = 0;
    this.handlers = {};
    this.enabled = true;

    const typing = (e) => {
      const t = e.target;
      return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
    };

    window.addEventListener('keydown', (e) => {
      if (typing(e)) return;
      if (e.code === 'Escape') {
        this.emit('pause');
        e.preventDefault();
        return;
      }
      if (e.code === 'KeyM' && !e.repeat) this.emit('mute');
      if (e.code === 'KeyH' && !e.repeat) this.emit('help');
      // TAB keeps moving focus in menus and on the results screen; in play it holds the scoreboard.
      if (e.code === 'Tab' && this.enabled) {
        e.preventDefault();
        if (!e.repeat) this.emit('board', true);
      }
      const d = /^(Digit|Numpad)([1-9])$/.exec(e.code);
      if (d) this.weaponReq = { bar: Number(d[2]) - 1 };
      else if (BAR[e.code] !== undefined) this.weaponReq = { bar: BAR[e.code] };
      if (e.code === 'KeyQ' && !e.repeat) this.weaponReq = { last: true };
      if (e.code === 'KeyB' && !e.repeat) this.weaponReq = { builder: true };
      // Presses add up so several taps inside one tick are all applied.
      if (e.code === 'KeyT' && !e.repeat) {
        const r = this.buildReq || (this.buildReq = { style: 0 });
        r.style += e.shiftKey ? -1 : 1;
      }
      if (MAP[e.code] !== undefined) {
        this.keys.add(e.code);
        this.tapped |= MAP[e.code];
        if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'Tab') this.emit('board', false);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseBtn = 0;
      this.tapped = 0;
      this.emit('board', false);
    });

    canvas.addEventListener('mousedown', (e) => {
      if (performance.now() - this.lastTouchMs < 600) return;
      e.preventDefault();
      this.touchAimLatched = false;
      this.emit('gesture');
      if (e.button === 0) this.mouseBtn |= BTN.FIRE;
      if (e.button === 2) this.mouseBtn |= BTN.ALT;
      if (e.button === 1) this.mouseBtn |= BTN.MELEE;
      this.tapped |= this.mouseBtn;
    });
    window.addEventListener('mouseup', (e) => {
      if (performance.now() - this.lastTouchMs < 600) return;
      if (e.button === 0) this.mouseBtn &= ~BTN.FIRE;
      if (e.button === 2) this.mouseBtn &= ~BTN.ALT;
      if (e.button === 1) this.mouseBtn &= ~BTN.MELEE;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (performance.now() - this.lastTouchMs < 600) return;
      this.touchAimLatched = false;
      this.track(e.clientX, e.clientY);
    });
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (Math.abs(e.deltaY) < 4) return;
        this.weaponReq = { rel: e.deltaY > 0 ? 1 : -1 };
      },
      { passive: false },
    );
    window.addEventListener('keydown', () => this.emit('gesture'), { once: false });
  }

  track(cx, cy) {
    const r = this.canvas.getBoundingClientRect();
    if (!r.width) return;
    this.mx = ((cx - r.left) / r.width) * this.canvas.width;
    this.my = ((cy - r.top) / r.height) * this.canvas.height;
  }

  on(name, fn) {
    this.handlers[name] = fn;
  }

  emit(name, arg) {
    const fn = this.handlers[name];
    if (fn) fn(arg);
  }

  buttons() {
    const tapped = this.tapped;
    this.tapped = 0;
    if (!this.enabled) return 0;
    let b = this.mouseBtn | this.touchButtons | tapped;
    for (const k of this.keys) b |= MAP[k] || 0;
    return b;
  }

  releaseAll() {
    this.keys.clear();
    this.mouseBtn = 0;
    this.touchButtons = 0;
    this.touchAutoPulseFire = false;
  }

  markTouch() {
    this.lastTouchMs = performance.now();
    this.emit('gesture');
  }

  triggerTouchBtn(flag) {
    this.markTouch();
    this.tapped |= flag;
  }

  setTouchAim(angle, distNorm = 0.65) {
    this.markTouch();
    this.touchAimLatched = true;
    this.touchAimAngle = angle;
    this.touchAimDist = Math.max(0.15, Math.min(1, distNorm));
  }

  syncTouchCrosshair(shoulderScreenX, shoulderScreenY) {
    if (!this.touchAimLatched) return;
    const radius = 24 + this.touchAimDist * 96;
    this.mx = Math.max(6, Math.min(this.canvas.width - 6, shoulderScreenX + Math.cos(this.touchAimAngle) * radius));
    this.my = Math.max(6, Math.min(this.canvas.height - 6, shoulderScreenY + Math.sin(this.touchAimAngle) * radius));
  }

  // Aim target in world pixels (the backbuffer is half the world resolution).
  aimWorld() {
    return { x: this.mx * 2, y: this.my * 2 };
  }

  takeBuildRequest() {
    const r = this.buildReq;
    this.buildReq = null;
    return r;
  }

  takeWeaponRequest() {
    const r = this.weaponReq;
    this.weaponReq = null;
    return r;
  }
}
