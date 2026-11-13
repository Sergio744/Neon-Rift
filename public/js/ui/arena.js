import { TEAM_COLORS, TEAM_NAMES } from '/shared/modes.js';
import { RULE_DEFS, TIME_LIMITS, formatClock } from '/shared/rules.js';
import { tr } from '../i18n.js';
import { settingRow } from './controls.js';
import { mapDisplayName, sizeTag } from './room.js';

const $ = (sel) => document.querySelector(sel);

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function createArenaUi({ game, net, maps, sfx, onCopy }) {
  let draftMap = 'neon';
  let draftGoal = 5;
  let draftTimer = 120;
  let draftRules = {};
  const myAllies = new Set();
  let folded = false;
  let dismissedSosId = null;
  let myActorId = null;
  let latestMsg = null;
  let cfgDirtyUntil = 0;

  const box = $('#arena-box');
  const foldBtn = $('#btn-arena-fold');
  const copyBtn = $('#btn-arena-copy');
  const addAiBtn = $('#btn-arena-addai');
  const aiDuelBtn = $('#btn-arena-aiduel');
  const topActions = $('#arena-top-actions');
  const challengeAlert = $('#challenge-alert');
  const sosAlert = $('#sos-alert');
  const sosHudBtn = $('#btn-hud-sos');
  const specBar = $('#spec-bar');
  const specStopBtn = $('#btn-spec-stop');
  const specTargetLabel = $('#spec-target-name');

  const focusCanvas = () => {
    $('#view')?.focus({ preventScroll: true });
  };

  const setFolded = (on) => {
    folded = on;
    box?.classList.toggle('folded', on);
    if (foldBtn) {
      foldBtn.textContent = on ? tr('show') : tr('hide');
      foldBtn.setAttribute('aria-expanded', String(!on));
    }
  };

  foldBtn?.addEventListener('click', (e) => {
    e.currentTarget.blur();
    setFolded(!folded);
    focusCanvas();
  });
  copyBtn?.addEventListener('click', (e) => {
    onCopy?.(e);
    e.currentTarget.blur();
    focusCanvas();
  });
  addAiBtn?.addEventListener('click', (e) => {
    e.currentTarget.blur();
    sfx.unlock();
    net.send({ t: 'arena_add_ai' });
    focusCanvas();
  });
  aiDuelBtn?.addEventListener('click', (e) => {
    e.currentTarget.blur();
    sfx.unlock();
    net.send({
      t: 'arena_ai_duel',
      map: draftMap,
      goal: draftGoal,
      timeLimit: draftTimer,
      rules: draftRules,
    });
    focusCanvas();
  });
  sosHudBtn?.addEventListener('click', (e) => {
    e.currentTarget.blur();
    sfx.unlock();
    net.send({ t: 'sos' });
    focusCanvas();
  });

  $('#btn-spec-prev')?.addEventListener('click', (e) => {
    e.currentTarget.blur();
    game.cycleSpecTarget(-1);
    updateSpecLabel();
    focusCanvas();
  });
  $('#btn-spec-next')?.addEventListener('click', (e) => {
    e.currentTarget.blur();
    game.cycleSpecTarget(1);
    updateSpecLabel();
    focusCanvas();
  });
  specStopBtn?.addEventListener('click', (e) => {
    e.currentTarget.blur();
    sfx.unlock();
    net.send({ t: 'arena_stop' });
    focusCanvas();
  });

  // Hotkey Y triggers SOS backup call when fighting; Left/Right or A/D/[ ] cycles spectator cameras!
  window.addEventListener('keydown', (e) => {
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (!latestMsg) return;
    if (e.code === 'KeyY' && !e.repeat && latestMsg.st === 'playing' && !game.spectating) {
      net.send({ t: 'sos' });
    } else if (
      game.spectating &&
      !e.repeat &&
      (e.code === 'BracketLeft' || e.code === 'ArrowLeft' || e.code === 'KeyA')
    ) {
      game.cycleSpecTarget(-1);
      updateSpecLabel();
    } else if (
      game.spectating &&
      !e.repeat &&
      (e.code === 'BracketRight' || e.code === 'ArrowRight' || e.code === 'KeyD')
    ) {
      game.cycleSpecTarget(1);
      updateSpecLabel();
    }
  });

  function setActorId(id) {
    myActorId = id;
  }

  function updateSpecLabel() {
    if (!specTargetLabel) return;
    const t = game.specTarget;
    if (t < 0 || !latestMsg?.names?.[t]) {
      specTargetLabel.textContent = tr('specAuto');
    } else {
      specTargetLabel.textContent = latestMsg.names[t];
    }
  }

  function updateScoreboard(msg) {
    const sb = $('#scoreboard');
    const sides = [sb.querySelector('.s0'), sb.querySelector('.s1')];
    const fill = (side, label, score, color, me) => {
      side.querySelector('.nm').textContent = label;
      side.querySelector('.sc').textContent = String(score);
      side.style.setProperty('--c', color);
      side.classList.toggle('me', me);
    };

    if (msg.st === 'idle') {
      fill(sides[0], tr('arenaHubTitle'), msg.roster.length, TEAM_COLORS[0], false);
      fill(sides[1], tr('arenaAiCount'), msg.roster.filter((r) => r.kind === 'ai').length, TEAM_COLORS[1], false);
      $('#goal-text').textContent = tr('openRing');
    } else {
      const myTeam = game.slot >= 0 ? msg.teams[game.slot] : -1;
      for (const t of [0, 1]) {
        const namesOnSide = msg.names.filter((n, s) => n && msg.teams[s] === t);
        const label = namesOnSide.length === 1 ? namesOnSide[0] : `${TEAM_NAMES[t]} (${namesOnSide.length})`;
        fill(sides[t], label, msg.teamScores[t], TEAM_COLORS[t], t === myTeam);
      }
      $('#goal-text').textContent = `${tr('firstTo')} ${msg.goal}`;
    }

    const m = maps().find((x) => x.id === msg.map);
    $('#map-text').textContent = m ? mapDisplayName(m) : msg.map;

    const timerEl = $('#timer-text');
    if (timerEl) {
      const showTimer = msg.st === 'playing' && (msg.timeLimit > 0 || msg.suddenDeath);
      timerEl.classList.toggle('hidden', !showTimer);
      if (showTimer) {
        timerEl.textContent = msg.suddenDeath ? tr('suddenDeath') : formatClock(msg.matchTimer || 0);
        timerEl.classList.toggle('urgent', Boolean(msg.suddenDeath || (msg.matchTimer > 0 && msg.matchTimer <= 15)));
      }
    }

    const rulesBar = $('#active-rules-bar');
    if (rulesBar) {
      const effectiveRules = msg.st === 'idle' && Object.keys(draftRules).some((k) => draftRules[k]) ? draftRules : msg.rules;
      const activeIds = RULE_DEFS.filter((d) => effectiveRules?.[d.id]);
      rulesBar.classList.toggle('hidden', activeIds.length === 0);
      rulesBar.textContent = '';
      for (const r of activeIds) rulesBar.appendChild(el('span', 'rule-pill', tr(`rule_${r.id}`)));
    }
  }

  function pushIdleCfg() {
    cfgDirtyUntil = performance.now() + 600;
    net.send({
      t: 'arena_cfg',
      map: draftMap,
      goal: draftGoal,
      timeLimit: draftTimer,
      rules: draftRules,
    });
  }

  function renderHub(msg) {
    const fromServer = msg !== latestMsg;
    latestMsg = msg;
    if (!box) return;
    if (fromServer && msg.st === 'idle' && performance.now() >= cfgDirtyUntil) {
      if (msg.map) draftMap = msg.map;
      if (msg.goal) draftGoal = msg.goal;
      if (msg.timeLimit !== undefined) draftTimer = msg.timeLimit;
      if (msg.rules) draftRules = { ...msg.rules };
    }
    const prevScroll = box.scrollTop;
    box.classList.remove('hidden');

    // Auto-fold hub when a match starts (whether fighting OR spectating!) so the screen is wide open!
    if (msg.st === 'countdown' && !folded) {
      setFolded(true);
    } else if (msg.st === 'idle' && folded && !msg.challenge) {
      setFolded(false);
    }

    $('#arena-code').textContent = msg.code;
    $('#arena-count').textContent = `${msg.roster.length}/12`;
    updateScoreboard(msg);

    topActions?.classList.toggle('hidden', msg.st !== 'idle');

    // Fighter SOS button + Spectator camera bar
    const fightingNow = msg.st === 'playing' && !game.spectating && game.slot >= 0;
    sosHudBtn?.classList.toggle('hidden', !fightingNow);
    if (sosHudBtn && fightingNow) {
      const locked = Boolean(msg.rules?.noSos);
      sosHudBtn.disabled = locked || Boolean(msg.sos);
      sosHudBtn.querySelector('span').textContent = locked ? tr('sosLocked') : tr('sosBtn');
    }

    const inSpectatorView = game.spectating && msg.st !== 'idle';
    specBar?.classList.toggle('hidden', !inSpectatorView);
    if (inSpectatorView) {
      updateSpecLabel();
      const anyHumanFighting = msg.roster.some((r) => r.kind === 'human' && r.fighting);
      specStopBtn?.classList.toggle('hidden', anyHumanFighting);
    }

    // Prune invalid allies
    const rosterIds = new Set(msg.roster.map((r) => r.id));
    for (const id of [...myAllies]) {
      if (!rosterIds.has(id) || id === myActorId) myAllies.delete(id);
    }

    // Roster list with Challenge & Squad-Ally controls (always keep challenge buttons visible for humans in idle!)
    const rosterEl = $('#arena-roster');
    rosterEl.textContent = '';
    const canChallenge = msg.st === 'idle' && (!msg.challenge || msg.challenge.fromId !== myActorId);

    for (const actor of msg.roster) {
      const isMe = actor.id === myActorId;
      const row = el('div', `ar-row${isMe ? ' me' : ''}${actor.fighting ? ' fighting' : ''}`);
      const badge = el('small', `ar-badge ${actor.kind === 'ai' ? 'ai' : 'hu'}`, actor.kind === 'ai' ? 'AI' : 'P');
      const nm = el('b', 'ar-name', actor.name);
      const rec = el('span', 'ar-rec dim', `${actor.wins}W-${actor.losses}L`);
      row.append(badge, nm, rec);

      if (!isMe && canChallenge) {
        const isAlly = myAllies.has(actor.id);
        const allyBtn = el(
          'button',
          `btn small ar-ally${isAlly ? ' on active' : ''}`,
          isAlly ? `✓ ${tr('allyPicked')}` : tr('allyToggle'),
        );
        allyBtn.type = 'button';
        allyBtn.setAttribute('aria-pressed', String(isAlly));
        allyBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          sfx.play('switch');
          if (myAllies.has(actor.id)) myAllies.delete(actor.id);
          else {
            if (myAllies.size >= 2) myAllies.clear();
            myAllies.add(actor.id);
          }
          renderHub(latestMsg);
        });

        const chBtn = el('button', 'btn small primary ar-ch', tr('challengeBtn'));
        chBtn.type = 'button';
        chBtn.addEventListener('click', () => {
          sfx.unlock();
          const allies0 = [...myAllies].filter((id) => id !== actor.id);
          // Auto-pair equal number of available AI/idle opponents if user brings allies!
          const poolOthers = msg.roster
            .map((r) => r.id)
            .filter((id) => id !== myActorId && id !== actor.id && !allies0.includes(id));
          const allies1 = poolOthers.slice(0, allies0.length);
          net.send({
            t: 'challenge',
            targetId: actor.id,
            allies0,
            allies1,
            map: draftMap,
            goal: draftGoal,
            timeLimit: draftTimer,
            rules: draftRules,
          });
          focusCanvas();
        });
        row.append(allyBtn, chBtn);
        if (actor.kind === 'ai') {
          const rm = el('button', 'pl-act rm', '×');
          rm.type = 'button';
          rm.addEventListener('click', (e) => {
            e.currentTarget.blur();
            net.send({ t: 'arena_rm_ai', id: actor.id });
            focusCanvas();
          });
          row.appendChild(rm);
        }
      }
      rosterEl.appendChild(row);
    }

    // Challenge draft settings (visible in idle ring)
    const cfgBox = $('#arena-cfg');
    cfgBox.classList.toggle('hidden', msg.st !== 'idle');
    if (msg.st === 'idle') {
      const mapItems = maps().map((m) => ({ id: m.id, name: mapDisplayName(m), tag: sizeTag(m) }));
      if (!mapItems.some((m) => m.id === draftMap) && mapItems[0]) draftMap = mapItems[0].id;
      settingRow($('#ar-maps'), tr('mapLabel'), mapItems, draftMap, (id) => {
        sfx.play('switch');
        draftMap = id;
        pushIdleCfg();
        renderHub(latestMsg);
      });
      const goals = [3, 5, 10].map((g) => ({ id: g, name: String(g) }));
      settingRow($('#ar-goal'), tr('pointsToWin'), goals, draftGoal, (g) => {
        sfx.play('switch');
        draftGoal = g;
        pushIdleCfg();
        renderHub(latestMsg);
      });
      const timers = TIME_LIMITS.map((s) => ({ id: s, name: s === 0 ? tr('unlimitedTime') : formatClock(s) }));
      settingRow($('#ar-timer'), tr('timerLabel'), timers, draftTimer, (t) => {
        sfx.play('switch');
        draftTimer = t;
        pushIdleCfg();
        renderHub(latestMsg);
      });
      const rulesEl = $('#ar-rules');
      rulesEl.textContent = '';
      rulesEl.className = 'setting';
      rulesEl.appendChild(el('span', 'setting-label', tr('rulesLabel')));
      const list = el('div', 'chips');
      for (const r of RULE_DEFS) {
        const on = Boolean(draftRules[r.id]);
        const b = el('button', `chip${on ? ' on active' : ''}`, `${on ? '✓ ' : ''}${tr(`rule_${r.id}`)}`);
        b.type = 'button';
        b.setAttribute('aria-pressed', String(on));
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          sfx.play('switch');
          draftRules = { ...draftRules, [r.id]: !on };
          if (!draftRules[r.id]) delete draftRules[r.id];
          pushIdleCfg();
          renderHub(latestMsg);
        });
        list.appendChild(b);
      }
      rulesEl.appendChild(list);
    }

    // Pending challenge banner
    renderChallengeAlert(msg.challenge);
    // Active SOS reinforcement banner for spectators!
    renderSosAlert(msg.sos);
    box.scrollTop = prevScroll;
  }

  function renderChallengeAlert(ch) {
    if (!challengeAlert) return;
    challengeAlert.classList.toggle('hidden', !ch);
    challengeAlert.textContent = '';
    if (!ch) return;

    const isTarget = ch.targetId === myActorId;
    const isSender = ch.fromId === myActorId;
    const head = el(
      'div',
      'ca-title',
      isTarget
        ? `⚔ ${ch.fromName} ${tr('challengesYou')}`
        : `⚔ ${ch.fromName} ${tr('challengesOther')} ${ch.targetName}`,
    );
    const metaParts = [
      `${tr('mapLabel')}: ${ch.map.toUpperCase()}`,
      `${tr('firstTo')} ${ch.goal}`,
      ch.timeLimit > 0 ? `⏱ ${formatClock(ch.timeLimit)}` : `⏱ ${tr('unlimitedTime')}`,
    ];
    const activeRuleNames = RULE_DEFS.filter((d) => ch.rules?.[d.id]).map((d) => tr(`rule_${d.id}`));
    if (activeRuleNames.length) metaParts.push(activeRuleNames.join(' · '));
    const meta = el('div', 'ca-meta dim', metaParts.join('  |  '));
    challengeAlert.append(head, meta);

    if (isTarget || isSender) {
      const btns = el('div', 'ca-btns');
      if (isTarget) {
        const yes = el('button', 'btn small primary', tr('acceptChallenge'));
        yes.type = 'button';
        yes.addEventListener('click', () => {
          sfx.unlock();
          net.send({ t: 'challenge_reply', accept: true });
          focusCanvas();
        });
        const no = el('button', 'btn small', tr('declineChallenge'));
        no.type = 'button';
        no.addEventListener('click', () => {
          net.send({ t: 'challenge_reply', accept: false });
          focusCanvas();
        });
        btns.append(yes, no);
      } else {
        const cancel = el('button', 'btn small', tr('cancelChallenge'));
        cancel.type = 'button';
        cancel.addEventListener('click', () => net.send({ t: 'challenge_reply', accept: false }));
        btns.appendChild(cancel);
      }
      challengeAlert.appendChild(btns);
    }
  }

  function renderSosAlert(sos) {
    if (!sosAlert) return;
    const shouldShow =
      Boolean(sos) &&
      sos.id !== dismissedSosId &&
      latestMsg?.st === 'playing' &&
      game.spectating;
    sosAlert.classList.toggle('hidden', !shouldShow);
    sosAlert.textContent = '';
    if (!shouldShow) return;

    const title = el('div', 'ca-title sos-pulse', `🆘 ${sos.callerName} ${tr('sosAsking')}`);
    const btns = el('div', 'ca-btns');
    const joinBtn = el('button', 'btn small primary', tr('sosJoinBtn'));
    joinBtn.type = 'button';
    joinBtn.addEventListener('click', () => {
      sfx.unlock();
      dismissedSosId = sos.id;
      net.send({ t: 'sos_reply', accept: true });
      sosAlert.classList.add('hidden');
    });
    const ignoreBtn = el('button', 'btn small', tr('sosIgnoreBtn'));
    ignoreBtn.type = 'button';
    ignoreBtn.addEventListener('click', () => {
      dismissedSosId = sos.id;
      net.send({ t: 'sos_reply', accept: false });
      sosAlert.classList.add('hidden');
    });
    btns.append(joinBtn, ignoreBtn);
    sosAlert.append(title, btns);
  }

  function hideAll() {
    latestMsg = null;
    myActorId = null;
    myAllies.clear();
    box?.classList.add('hidden');
    challengeAlert?.classList.add('hidden');
    sosAlert?.classList.add('hidden');
    sosHudBtn?.classList.add('hidden');
    specBar?.classList.add('hidden');
    $('#timer-text')?.classList.add('hidden');
    $('#active-rules-bar')?.classList.add('hidden');
  }

  return {
    setActorId,
    renderHub,
    hideAll,
    refreshLang: () => {
      if (latestMsg) renderHub(latestMsg);
    },
  };
}
