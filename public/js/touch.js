import { BTN } from '/shared/constants.js';
import { W } from '/shared/weapons.js';
import { tr } from './i18n.js';

const STORAGE_KEY = 'nr-touch';
const STICK_MAX_R = 46; // px max visual deflection of thumbstick nub

const $ = (sel) => document.querySelector(sel);

function hasNativeTouch() {
  if (typeof window === 'undefined') return false;
  if (navigator.maxTouchPoints > 0) return true;
  if ('ontouchstart' in window) return true;
  return Boolean(window.matchMedia?.('(pointer: coarse)').matches);
}

function haptic(ms = 8) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* unsupported */
  }
}

export function createTouchControls({ input, game, sfx, isPlayable }) {
  let pref = 'auto'; // 'auto' | 'on' | 'off'
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'auto' || saved === 'on' || saved === 'off') pref = saved;
  } catch {
    /* storage blocked */
  }

  let detectedTouch = hasNativeTouch();

  const root = $('#touch-controls');
  const moveZone = $('#touch-move-zone');
  const moveBase = $('#touch-move-base');
  const moveNub = $('#touch-move-nub');
  const aimZone = $('#touch-aim-zone');
  const aimBase = $('#touch-aim-base');
  const aimNub = $('#touch-aim-nub');

  const jumpBtn = $('#touch-jump');
  const fireBtn = $('#touch-fire');
  const altBtn = $('#touch-alt');
  const meleeBtn = $('#touch-melee');
  const buildBtn = $('#touch-build');
  const styleBtn = $('#touch-style');
  const swapBtn = $('#touch-swap');
  const rotateBanner = $('#rotate-banner');
  const rotateDismiss = $('#btn-rotate-close');

  let rotateDismissed = false;

  // Active touch state per control
  let moveTouch = null; // { id, ox, oy, nx, ny }
  let aimTouch = null; // { id, ox, oy, nx, ny, startMs, tilted }
  let canvasTouchId = null;
  let stickFiring = false;

  const heldMap = new Map(); // flag -> Set<touchId | 'ptr'>
  const getSet = (flag) => {
    let s = heldMap.get(flag);
    if (!s) {
      s = new Set();
      heldMap.set(flag, s);
    }
    return s;
  };

  function isEnabled() {
    if (pref === 'on') return true;
    if (pref === 'off') return false;
    return detectedTouch;
  }

  function recomputeButtons() {
    let b = 0;

    if (moveTouch) {
      const { nx, ny } = moveTouch;
      if (nx < -0.16) b |= BTN.LEFT;
      else if (nx > 0.16) b |= BTN.RIGHT;
      if (Math.abs(nx) > 0.72) b |= BTN.SPRINT;
      if (ny < -0.54) b |= BTN.JUMP;
      else if (ny > 0.52) b |= BTN.DOWN;
    }

    const fireHeld = stickFiring || getSet(BTN.FIRE).size > 0 || canvasTouchId !== null;
    if (fireHeld) b |= BTN.FIRE;
    if (getSet(BTN.JUMP).size > 0) b |= BTN.JUMP;
    if (getSet(BTN.ALT).size > 0) b |= BTN.ALT;
    if (getSet(BTN.MELEE).size > 0) b |= BTN.MELEE;

    input.touchButtons = b;
    input.touchAutoPulseFire = stickFiring || getSet(BTN.FIRE).size > 0;
  }

  function resetTouches() {
    moveTouch = null;
    aimTouch = null;
    canvasTouchId = null;
    stickFiring = false;
    for (const s of heldMap.values()) s.clear();
    if (moveNub) moveNub.style.transform = 'translate(0px, 0px)';
    if (aimNub) aimNub.style.transform = 'translate(0px, 0px)';
    moveBase?.classList.remove('active', 'sprinting');
    aimBase?.classList.remove('active', 'firing');
    for (const el of [jumpBtn, fireBtn, altBtn, meleeBtn]) el?.classList.remove('pressed');
    input.touchButtons = 0;
    input.touchAutoPulseFire = false;
  }

  // ---------- Left Movement Stick ----------

  function updateMoveStick(clientX, clientY) {
    if (!moveTouch) return;
    const dx = clientX - moveTouch.ox;
    const dy = clientY - moveTouch.oy;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(STICK_MAX_R, dist);
    const ang = dist > 0.001 ? Math.atan2(dy, dx) : 0;
    const px = Math.cos(ang) * clamped;
    const py = Math.sin(ang) * clamped;
    const prevJump = moveTouch.ny < -0.54;
    moveTouch.nx = px / STICK_MAX_R;
    moveTouch.ny = py / STICK_MAX_R;
    if (!prevJump && moveTouch.ny < -0.54) {
      input.triggerTouchBtn(BTN.JUMP);
    }
    if (moveNub) moveNub.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px)`;
    moveBase?.classList.toggle('sprinting', Math.abs(moveTouch.nx) > 0.72);
    recomputeButtons();
  }

  moveZone?.addEventListener(
    'touchstart',
    (e) => {
      e.preventDefault();
      sfx.unlock();
      input.markTouch();
      if (moveTouch) return;
      const t = e.changedTouches[0];
      if (!t) return;
      const rect = moveBase.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      // Blend toward thumb start so near-misses feel effortless
      const ox = cx + Math.max(-22, Math.min(22, t.clientX - cx));
      const oy = cy + Math.max(-22, Math.min(22, t.clientY - cy));
      moveTouch = { id: t.identifier, ox, oy, nx: 0, ny: 0 };
      moveBase?.classList.add('active');
      updateMoveStick(t.clientX, t.clientY);
    },
    { passive: false },
  );

  // ---------- Right 360° Aim & Auto-Fire Twin-Stick ----------

  function updateAimStick(clientX, clientY) {
    if (!aimTouch) return;
    const dx = clientX - aimTouch.ox;
    const dy = clientY - aimTouch.oy;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(STICK_MAX_R, dist);
    const mag = clamped / STICK_MAX_R;
    const ang = dist > 0.001 ? Math.atan2(dy, dx) : input.touchAimAngle;
    const px = Math.cos(ang) * clamped;
    const py = Math.sin(ang) * clamped;
    aimTouch.nx = px / STICK_MAX_R;
    aimTouch.ny = py / STICK_MAX_R;
    if (aimNub) aimNub.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px)`;

    if (mag > 0.14) {
      aimTouch.tilted = true;
      input.setTouchAim(ang, mag);
    }
    const nowFiring = mag > 0.56;
    if (nowFiring && !stickFiring) {
      input.triggerTouchBtn(BTN.FIRE);
      haptic(6);
    }
    stickFiring = nowFiring;
    aimBase?.classList.toggle('firing', stickFiring);
    recomputeButtons();
  }

  aimZone?.addEventListener(
    'touchstart',
    (e) => {
      e.preventDefault();
      sfx.unlock();
      input.markTouch();
      if (aimTouch) return;
      const t = e.changedTouches[0];
      if (!t) return;
      const rect = aimBase.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const ox = cx + Math.max(-20, Math.min(20, t.clientX - cx));
      const oy = cy + Math.max(-20, Math.min(20, t.clientY - cy));
      aimTouch = { id: t.identifier, ox, oy, nx: 0, ny: 0, startMs: performance.now(), tilted: false };
      aimBase?.classList.add('active');
      updateAimStick(t.clientX, t.clientY);
    },
    { passive: false },
  );

  // Also support desktop pointer drag on sticks when user sets TOUCH CONTROLS: ON!
  function bindPointerStick(zone, onStart, onMove, onEnd) {
    let activePtr = null;
    zone?.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return;
      e.preventDefault();
      zone.setPointerCapture?.(e.pointerId);
      activePtr = e.pointerId;
      sfx.unlock();
      input.markTouch();
      onStart(e.clientX, e.clientY);
    });
    zone?.addEventListener('pointermove', (e) => {
      if (e.pointerId !== activePtr) return;
      input.markTouch();
      onMove(e.clientX, e.clientY);
    });
    const finish = (e) => {
      if (e.pointerId !== activePtr) return;
      activePtr = null;
      onEnd();
    };
    zone?.addEventListener('pointerup', finish);
    zone?.addEventListener('pointercancel', finish);
  }

  bindPointerStick(
    moveZone,
    (x, y) => {
      const rect = moveBase.getBoundingClientRect();
      moveTouch = { id: 'ptr', ox: rect.left + rect.width / 2, oy: rect.top + rect.height / 2, nx: 0, ny: 0 };
      moveBase?.classList.add('active');
      updateMoveStick(x, y);
    },
    updateMoveStick,
    () => {
      moveTouch = null;
      if (moveNub) moveNub.style.transform = 'translate(0px, 0px)';
      moveBase?.classList.remove('active', 'sprinting');
      recomputeButtons();
    },
  );

  bindPointerStick(
    aimZone,
    (x, y) => {
      const rect = aimBase.getBoundingClientRect();
      aimTouch = {
        id: 'ptr',
        ox: rect.left + rect.width / 2,
        oy: rect.top + rect.height / 2,
        nx: 0,
        ny: 0,
        startMs: performance.now(),
        tilted: false,
      };
      aimBase?.classList.add('active');
      updateAimStick(x, y);
    },
    updateAimStick,
    () => {
      if (aimTouch && aimTouch.tilted && !stickFiring && performance.now() - aimTouch.startMs < 240) {
        input.triggerTouchBtn(BTN.FIRE);
      }
      aimTouch = null;
      stickFiring = false;
      if (aimNub) aimNub.style.transform = 'translate(0px, 0px)';
      aimBase?.classList.remove('active', 'firing');
      recomputeButtons();
    },
  );

  // Global touchmove / touchend router for both sticks & direct canvas touch
  window.addEventListener(
    'touchmove',
    (e) => {
      for (const t of e.changedTouches) {
        if (moveTouch && t.identifier === moveTouch.id) {
          e.preventDefault();
          updateMoveStick(t.clientX, t.clientY);
        } else if (aimTouch && t.identifier === aimTouch.id) {
          e.preventDefault();
          updateAimStick(t.clientX, t.clientY);
        } else if (canvasTouchId !== null && t.identifier === canvasTouchId) {
          e.preventDefault();
          input.markTouch();
          input.touchAimLatched = false;
          input.track(t.clientX, t.clientY);
        }
      }
    },
    { passive: false },
  );

  const finishTouches = (e) => {
    for (const t of e.changedTouches) {
      if (moveTouch && t.identifier === moveTouch.id) {
        moveTouch = null;
        if (moveNub) moveNub.style.transform = 'translate(0px, 0px)';
        moveBase?.classList.remove('active', 'sprinting');
        recomputeButtons();
      }
      if (aimTouch && t.identifier === aimTouch.id) {
        if (aimTouch.tilted && !stickFiring && performance.now() - aimTouch.startMs < 240) {
          input.triggerTouchBtn(BTN.FIRE);
        }
        aimTouch = null;
        stickFiring = false;
        if (aimNub) aimNub.style.transform = 'translate(0px, 0px)';
        aimBase?.classList.remove('active', 'firing');
        recomputeButtons();
      }
      if (canvasTouchId !== null && t.identifier === canvasTouchId) {
        canvasTouchId = null;
        recomputeButtons();
      }
    }
  };
  window.addEventListener('touchend', finishTouches);
  window.addEventListener('touchcancel', finishTouches);

  // Direct tap/drag on `<canvas id="view">` for tablet tap-to-aim & tap-to-shoot!
  input.canvas.addEventListener(
    'touchstart',
    (e) => {
      if (!detectedTouch) {
        detectedTouch = true;
        syncVisibility();
      }
      if (!isPlayable()) return;
      const t = e.changedTouches[0];
      if (!t) return;
      e.preventDefault();
      sfx.unlock();
      input.markTouch();
      input.touchAimLatched = false;
      input.track(t.clientX, t.clientY);
      canvasTouchId = t.identifier;
      input.triggerTouchBtn(BTN.FIRE);
      recomputeButtons();
    },
    { passive: false },
  );

  // Auto-detect touch on any screen tap (e.g. tapping a menu card on a phone/tablet)
  window.addEventListener(
    'touchstart',
    () => {
      if (!detectedTouch) {
        detectedTouch = true;
        syncVisibility();
      }
    },
    { passive: true },
  );

  // ---------- Holdable Action Buttons (Jump/Jet, Fire, Alt, Melee) ----------

  function bindHoldButton(btn, flag) {
    if (!btn) return;
    const set = getSet(flag);
    btn.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        sfx.unlock();
        haptic(7);
        for (const t of e.changedTouches) set.add(t.identifier);
        btn.classList.add('pressed');
        input.triggerTouchBtn(flag);
        recomputeButtons();
      },
      { passive: false },
    );
    const release = (e) => {
      for (const t of e.changedTouches) set.delete(t.identifier);
      if (set.size === 0) btn.classList.remove('pressed');
      recomputeButtons();
    };
    btn.addEventListener('touchend', release);
    btn.addEventListener('touchcancel', release);

    // Pointer fallback when testing TOUCH CONTROLS: ON with mouse
    btn.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return;
      e.preventDefault();
      btn.setPointerCapture?.(e.pointerId);
      sfx.unlock();
      set.add('ptr');
      btn.classList.add('pressed');
      input.triggerTouchBtn(flag);
      recomputeButtons();
    });
    const releasePtr = (e) => {
      if (e.pointerType === 'touch') return;
      set.delete('ptr');
      if (set.size === 0) btn.classList.remove('pressed');
      recomputeButtons();
    };
    btn.addEventListener('pointerup', releasePtr);
    btn.addEventListener('pointercancel', releasePtr);
  }

  bindHoldButton(jumpBtn, BTN.JUMP);
  bindHoldButton(fireBtn, BTN.FIRE);
  bindHoldButton(altBtn, BTN.ALT);
  bindHoldButton(meleeBtn, BTN.MELEE);

  // ---------- Instant Tap Utility Buttons (Builder toggle, Builder Style, Weapon Swap) ----------

  function bindTapButton(btn, fn) {
    if (!btn) return;
    let lastTap = 0;
    const trigger = (e) => {
      e.preventDefault();
      const now = performance.now();
      if (now - lastTap < 80) return;
      lastTap = now;
      sfx.unlock();
      input.markTouch();
      haptic(8);
      fn();
    };
    btn.addEventListener('touchstart', trigger, { passive: false });
    btn.addEventListener('click', (e) => {
      if (performance.now() - input.lastTouchMs < 500) return;
      trigger(e);
    });
  }

  bindTapButton(buildBtn, () => {
    if (game.wantW === W.builder) input.weaponReq = { last: true };
    else input.weaponReq = { builder: true };
    syncBuilderBadge();
  });

  bindTapButton(styleBtn, () => {
    const r = input.buildReq || (input.buildReq = { style: 0 });
    r.style += 1;
  });

  bindTapButton(swapBtn, () => {
    input.weaponReq = { rel: 1 };
  });

  rotateDismiss?.addEventListener('click', () => {
    rotateDismissed = true;
    rotateBanner?.classList.add('hidden');
  });

  let lastTouchOn = null;
  let lastShowPad = null;
  let lastIsBuild = null;
  let lastShowRotate = null;

  function syncBuilderBadge() {
    const isBuild = game.wantW === W.builder;
    if (isBuild === lastIsBuild) return;
    lastIsBuild = isBuild;
    buildBtn?.classList.toggle('active', isBuild);
    styleBtn?.classList.toggle('hidden', !isBuild);
  }

  function syncVisibility() {
    const touchOn = isEnabled();
    const showPad = touchOn && isPlayable();
    if (touchOn !== lastTouchOn) {
      lastTouchOn = touchOn;
      document.body.classList.toggle('touch-device', touchOn);
    }
    if (showPad !== lastShowPad) {
      lastShowPad = showPad;
      document.body.classList.toggle('touch-playing', showPad);
      root?.classList.toggle('hidden', !showPad);
      if (!showPad) resetTouches();
    }

    const isPortraitPhone = touchOn && window.innerHeight > window.innerWidth && window.innerWidth < 680;
    const showRotate = Boolean(isPortraitPhone && !rotateDismissed && isPlayable());
    if (showRotate !== lastShowRotate) {
      lastShowRotate = showRotate;
      rotateBanner?.classList.toggle('hidden', !showRotate);
    }
    syncBuilderBadge();
  }

  window.addEventListener('resize', syncVisibility);
  window.addEventListener('orientationchange', syncVisibility);

  function cyclePref() {
    pref = pref === 'auto' ? 'on' : pref === 'on' ? 'off' : 'auto';
    try {
      localStorage.setItem(STORAGE_KEY, pref);
    } catch {
      /* storage blocked */
    }
    syncVisibility();
    return pref;
  }

  function prefLabel() {
    if (pref === 'auto') return tr('touchAuto');
    return pref === 'on' ? 'ON' : 'OFF';
  }

  async function toggleFullscreen() {
    try {
      const doc = document;
      const el = doc.documentElement;
      if (!doc.fullscreenElement && !doc.webkitFullscreenElement) {
        if (el.requestFullscreen) await el.requestFullscreen();
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
        await screen.orientation?.lock?.('landscape').catch(() => {});
      } else if (doc.exitFullscreen) {
        await doc.exitFullscreen();
      } else if (doc.webkitExitFullscreen) {
        doc.webkitExitFullscreen();
      }
    } catch {
      /* fullscreen blocked by iframe/browser policy */
    }
    syncVisibility();
  }

  return {
    isEnabled,
    getPref: () => pref,
    prefLabel,
    cyclePref,
    syncVisibility,
    syncBuilderBadge,
    toggleFullscreen,
    resetTouches,
  };
}
