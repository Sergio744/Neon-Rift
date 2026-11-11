import { PLAYER_COLORS } from '/shared/constants.js';
import { TEAM_COLORS } from '/shared/modes.js';
import { tr } from './i18n.js';

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
const BUBBLE_MS = 3400;
const LOG_LIMIT = 36;

const $ = (sel) => document.querySelector(sel);

export function createComms({ game, net, sfx, toast, getContext }) {
  // Per-slot active overhead speech bubbles read by ClientGame.render.
  const bubbles = new Map(); // slot -> { text, until }

  let chatOpen = false;
  let chatScope = 'all'; // 'all' | 'team'
  let unread = 0;

  // Local & remote media / WebRTC state
  let micOn = false;
  let camOn = false;
  let voiceScope = 'all'; // 'all' | 'team'
  let localStream = null;
  let audioCtx = null;
  const peers = new Map(); // slot -> { pc, makingOffer, ignoreOffer, stream, videoEl, audioEl, muted, analyser, data }
  let remoteStates = []; // server-broadcast media states per slot
  let localAnalyser = null;
  let localData = null;
  let meterTimer = null;

  const els = {
    hudChat: $('#btn-hud-chat'),
    hudMic: $('#btn-hud-mic'),
    hudCam: $('#btn-hud-cam'),
    hudVscope: $('#btn-hud-vscope'),
    unreadDot: $('#chat-unread'),
    panel: $('#chat-panel'),
    log: $('#chat-log'),
    form: $('#chat-form'),
    scopeBtn: $('#btn-chat-scope'),
    input: $('#chat-input'),
    quickRow: $('#chat-quick'),
    orderRow: $('#squad-orders'),
    holoCams: $('#holo-cams'),
  };

  function ctxInfo() {
    return getContext(); // { online, mode, room, coop, mySlot }
  }

  function hasTeamScope() {
    const c = ctxInfo();
    return (c.mode === 'room' && c.room?.mode === 'teams') || c.mode === 'coop';
  }

  function hasAlliedBots() {
    const c = ctxInfo();
    if (c.mode !== 'room' || !c.room?.bots) return false;
    if (c.room.mode === 'teams') {
      const myT = c.room.teams[c.mySlot];
      return c.room.bots.some((b, s) => b && c.room.teams[s] === myT);
    }
    return c.room.host === c.mySlot && c.room.bots.some(Boolean);
  }

  function slotColor(slot) {
    const c = ctxInfo();
    if (c.mode === 'room' && c.room?.mode === 'teams' && c.room.teams[slot] >= 0) {
      return TEAM_COLORS[c.room.teams[slot]];
    }
    return game.colors?.[slot] || PLAYER_COLORS[slot % PLAYER_COLORS.length];
  }

  function slotName(slot) {
    const c = ctxInfo();
    if (c.mode === 'room' && c.room?.names?.[slot]) return c.room.names[slot];
    if (c.mode === 'coop' && c.coop?.names?.[slot]) return c.coop.names[slot];
    return game.names?.[slot] || `P${slot + 1}`;
  }

  function updateHudButtons() {
    const c = ctxInfo();
    const on = c.online;
    els.hudChat?.classList.toggle('hidden', !on);
    els.hudMic?.classList.toggle('hidden', !on);
    els.hudCam?.classList.toggle('hidden', !on);
    const showVscope = on && c.mode === 'room' && c.room?.mode === 'teams' && (micOn || camOn);
    els.hudVscope?.classList.toggle('hidden', !showVscope);
    if (els.hudVscope) {
      els.hudVscope.textContent = voiceScope === 'team' ? tr('voiceTeam') : tr('voiceAll');
      els.hudVscope.classList.toggle('active-team', voiceScope === 'team');
    }
    els.hudMic?.classList.toggle('on', micOn);
    els.hudCam?.classList.toggle('on', camOn);
    els.panel?.classList.toggle('hidden', !on);
    els.orderRow?.classList.toggle('hidden', !on || !hasAlliedBots());
    if (!hasTeamScope() && chatScope === 'team') chatScope = 'all';
    updateScopeBadge();
    applyVoiceGating();
    renderHoloCams();
  }

  function updateScopeBadge() {
    if (!els.scopeBtn) return;
    if (!hasTeamScope()) chatScope = 'all';
    els.scopeBtn.textContent = chatScope === 'team' ? tr('scopeTeam') : tr('scopeAll');
    els.scopeBtn.classList.toggle('team', chatScope === 'team');
  }

  function openChat(forceScope) {
    const c = ctxInfo();
    if (!c.online) return;
    if (forceScope && (forceScope === 'all' || hasTeamScope())) chatScope = forceScope;
    updateScopeBadge();
    chatOpen = true;
    unread = 0;
    els.unreadDot?.classList.add('hidden');
    els.panel?.classList.add('open');
    els.form?.classList.remove('hidden');
    els.quickRow?.classList.remove('hidden');
    game.input.releaseAll();
    requestAnimationFrame(() => els.input?.focus());
  }

  function closeChat() {
    chatOpen = false;
    els.panel?.classList.remove('open');
    els.form?.classList.add('hidden');
    els.quickRow?.classList.add('hidden');
    els.input?.blur();
  }

  function sendChat(raw) {
    const text = String(raw ?? '').trim().slice(0, 140);
    if (!text) return;
    const scope = chatScope === 'team' && hasTeamScope() ? 'team' : 'all';
    net.send({ t: 'chat', text, scope });
  }

  function appendChatMsg({ slot, name, text, scope, bot }) {
    bubbles.set(slot, { text, until: performance.now() + BUBBLE_MS });
    if (!els.log) return;
    const row = document.createElement('div');
    row.className = `chat-line${scope === 'team' ? ' team-msg' : ''}${bot ? ' bot-msg' : ''}`;
    row.dataset.ts = String(Date.now());
    const badge = document.createElement('span');
    badge.className = 'chat-tag';
    badge.textContent = scope === 'team' ? `[${tr('scopeTeam')}] ` : '';
    const who = document.createElement('b');
    who.style.color = slotColor(slot);
    who.textContent = `${name}: `;
    const body = document.createElement('span');
    body.className = 'chat-txt';
    body.textContent = text;
    row.append(badge, who, body);
    els.log.appendChild(row);
    while (els.log.children.length > LOG_LIMIT) els.log.firstElementChild.remove();
    els.log.scrollTop = els.log.scrollHeight;

    // Fade softly after 9 seconds when chat drawer is closed (still visible when opened!)
    setTimeout(() => row.classList.add('aged'), 9000);

    if (!chatOpen && slot !== ctxInfo().mySlot) {
      unread++;
      els.unreadDot?.classList.remove('hidden');
      sfx.play('switch', sfx.earX);
    }
  }

  function bubbleFor(slot, now = performance.now()) {
    const b = bubbles.get(slot);
    if (!b) return null;
    if (now > b.until) {
      bubbles.delete(slot);
      return null;
    }
    const left = (b.until - now) / BUBBLE_MS;
    return { text: b.text, alpha: Math.min(1, left * 4.5) };
  }

  // ---------- WebRTC Live Voice & Holo-Cams ----------

  function ensureAudioCtx() {
    if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audioCtx = new Ctx();
    }
    if (audioCtx?.state === 'suspended') audioCtx.resume().catch(() => {});
    return audioCtx;
  }

  function makeAnalyser(stream) {
    try {
      if (!stream.getAudioTracks().length) return null;
      const ac = ensureAudioCtx();
      if (!ac) return null;
      const src = ac.createMediaStreamSource(stream);
      const an = ac.createAnalyser();
      an.fftSize = 256;
      src.connect(an);
      return { analyser: an, data: new Uint8Array(an.frequencyBinCount), src };
    } catch {
      return null;
    }
  }

  function startMeterLoop() {
    if (meterTimer) return;
    meterTimer = setInterval(() => {
      const checkLevel = (an, data) => {
        if (!an || !data) return false;
        an.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 2; i < 28; i++) sum += data[i];
        return sum / 26 > 22;
      };
      const meCard = els.holoCams?.querySelector(`[data-slot="${ctxInfo().mySlot}"]`);
      if (meCard) meCard.classList.toggle('speaking', micOn && checkLevel(localAnalyser, localData));
      for (const [slot, p] of peers) {
        const card = els.holoCams?.querySelector(`[data-slot="${slot}"]`);
        const remoteMic = Boolean(remoteStates[slot]?.mic);
        if (card) card.classList.toggle('speaking', remoteMic && !p.muted && checkLevel(p.analyser, p.data));
      }
    }, 120);
  }

  async function syncLocalMedia(wantMic, wantCam) {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        toast(tr('mediaUnsupported'));
        return;
      }
      if (!wantMic && !wantCam) {
        if (localStream) {
          for (const t of localStream.getTracks()) t.stop();
          localStream = null;
        }
        micOn = false;
        camOn = false;
        localAnalyser = null;
        localData = null;
        for (const [, p] of peers) {
          for (const sender of p.pc.getSenders()) {
            try {
              p.pc.removeTrack(sender);
            } catch {
              /* ignore */
            }
          }
        }
      } else {
        if (!localStream) localStream = new MediaStream();
        // Audio track
        if (wantMic && !localStream.getAudioTracks().length) {
          const aStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          });
          for (const t of aStream.getAudioTracks()) localStream.addTrack(t);
          const meter = makeAnalyser(localStream);
          localAnalyser = meter?.analyser || null;
          localData = meter?.data || null;
        } else if (!wantMic) {
          for (const t of localStream.getAudioTracks()) {
            t.stop();
            localStream.removeTrack(t);
          }
          localAnalyser = null;
        }
        // Video track
        if (wantCam && !localStream.getVideoTracks().length) {
          const vStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 160 }, height: { ideal: 160 }, frameRate: { ideal: 15, max: 20 } },
          });
          for (const t of vStream.getVideoTracks()) localStream.addTrack(t);
        } else if (!wantCam) {
          for (const t of localStream.getVideoTracks()) {
            t.stop();
            localStream.removeTrack(t);
          }
        }
        micOn = localStream.getAudioTracks().length > 0;
        camOn = localStream.getVideoTracks().length > 0;
        startMeterLoop();
        syncPeersWithRoom();
        for (const [, p] of peers) syncTracksToPeer(p);
      }
      net.send({ t: 'media', mic: micOn, cam: camOn, vscope: voiceScope });
      updateHudButtons();
    } catch {
      toast(wantCam && !camOn ? tr('camBlocked') : tr('micBlocked'));
      updateHudButtons();
    }
  }

  function syncTracksToPeer(p) {
    if (!localStream) return;
    const senders = p.pc.getSenders();
    for (const track of localStream.getTracks()) {
      const existing = senders.find((s) => s.track?.kind === track.kind);
      if (existing) existing.replaceTrack(track).catch(() => {});
      else p.pc.addTrack(track, localStream);
    }
    for (const s of senders) {
      if (s.track && !localStream.getTracks().includes(s.track)) {
        try {
          p.pc.removeTrack(s);
        } catch {
          /* ignore */
        }
      }
    }
  }

  function ensurePeer(slot) {
    if (peers.has(slot) || !window.RTCPeerConnection) return peers.get(slot);
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const stream = new MediaStream();
    const audioEl = new Audio();
    audioEl.autoplay = true;
    audioEl.playsInline = true;
    audioEl.srcObject = stream;

    const p = {
      slot,
      pc,
      stream,
      audioEl,
      muted: false,
      makingOffer: false,
      ignoreOffer: false,
      analyser: null,
      data: null,
    };
    peers.set(slot, p);

    if (localStream) syncTracksToPeer(p);

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) net.send({ t: 'rtc', to: slot, data: { candidate } });
    };

    pc.onnegotiationneeded = async () => {
      try {
        p.makingOffer = true;
        await pc.setLocalDescription();
        net.send({ t: 'rtc', to: slot, data: { description: pc.localDescription } });
      } catch {
        /* ignore */
      } finally {
        p.makingOffer = false;
      }
    };

    pc.ontrack = ({ track, streams }) => {
      const srcStream = streams?.[0] || stream;
      if (!stream.getTracks().includes(track)) stream.addTrack(track);
      if (audioEl.srcObject !== srcStream) audioEl.srcObject = srcStream;
      audioEl.play().catch(() => {});
      if (track.kind === 'audio') {
        const meter = makeAnalyser(srcStream);
        p.analyser = meter?.analyser || null;
        p.data = meter?.data || null;
        startMeterLoop();
      }
      applyVoiceGating();
      renderHoloCams();
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') pc.restartIce?.();
    };

    return p;
  }

  function closePeer(slot) {
    const p = peers.get(slot);
    if (!p) return;
    peers.delete(slot);
    try {
      p.audioEl.pause();
      p.audioEl.srcObject = null;
      p.pc.close();
    } catch {
      /* ignore */
    }
  }

  // Polite/impolite WebRTC perfect negotiation so two peers never deadlock on simultaneous offers!
  async function onRtc(msg) {
    const from = Number(msg.from);
    const data = msg.data;
    const mySlot = ctxInfo().mySlot;
    if (!Number.isInteger(from) || from === mySlot || !data) return;
    const p = ensurePeer(from);
    if (!p) return;
    const polite = mySlot > from;
    try {
      if (data.description) {
        const offerCollision = data.description.type === 'offer' && (p.makingOffer || p.pc.signalingState !== 'stable');
        p.ignoreOffer = !polite && offerCollision;
        if (p.ignoreOffer) return;
        await p.pc.setRemoteDescription(data.description);
        if (data.description.type === 'offer') {
          await p.pc.setLocalDescription();
          net.send({ t: 'rtc', to: from, data: { description: p.pc.localDescription } });
        }
      } else if (data.candidate) {
        try {
          await p.pc.addIceCandidate(data.candidate);
        } catch (err) {
          if (!p.ignoreOffer) throw err;
        }
      }
    } catch {
      /* ignore transient negotiation error */
    }
  }

  function syncPeersWithRoom() {
    const c = ctxInfo();
    if (!c.online) return;
    const names = c.mode === 'room' ? c.room?.names : c.coop?.names;
    const bots = c.mode === 'room' ? c.room?.bots : null;
    if (!names) return;

    const activeHumanSlots = new Set();
    names.forEach((nm, s) => {
      if (!nm || s === c.mySlot || bots?.[s]) return;
      activeHumanSlots.add(s);
      const remoteActive = Boolean(remoteStates[s]?.mic || remoteStates[s]?.cam);
      if (micOn || camOn || remoteActive) {
        const existed = peers.has(s);
        const p = ensurePeer(s);
        // Initiate connection deterministically if we have local media and lower slot (or newly activated)
        if (!existed && p && (micOn || camOn) && c.mySlot < s && p.pc.getSenders().length === 0) {
          syncTracksToPeer(p);
        }
      }
    });

    for (const s of [...peers.keys()]) {
      if (!activeHumanSlots.has(s)) closePeer(s);
    }
  }

  // Enforces Team-only vs Party-all voice during active Teams combat!
  function applyVoiceGating() {
    const c = ctxInfo();
    const inActiveTeams =
      c.mode === 'room' &&
      c.room?.mode === 'teams' &&
      (c.room.st === 'playing' || c.room.st === 'countdown');
    const myTeam = inActiveTeams ? c.room.teams[c.mySlot] : -1;

    for (const [slot, p] of peers) {
      const peerScope = remoteStates[slot]?.vscope || 'all';
      const sameTeam = inActiveTeams && c.room.teams[slot] === myTeam;
      const blockedByTeamRule = inActiveTeams && !sameTeam && (voiceScope === 'team' || peerScope === 'team');
      p.audioEl.muted = Boolean(p.muted || blockedByTeamRule);
    }
  }

  function renderHoloCams() {
    const box = els.holoCams;
    if (!box) return;
    const c = ctxInfo();
    if (!c.online) {
      box.classList.add('hidden');
      box.textContent = '';
      return;
    }

    const slotsToShow = [];
    if (micOn || camOn) slotsToShow.push(c.mySlot);
    remoteStates.forEach((st, s) => {
      if (s !== c.mySlot && st && (st.mic || st.cam)) slotsToShow.push(s);
    });

    box.classList.toggle('hidden', slotsToShow.length === 0);
    // Remove stale cards
    for (const child of [...box.children]) {
      const s = Number(child.dataset.slot);
      if (!slotsToShow.includes(s)) child.remove();
    }

    for (const s of slotsToShow) {
      const isMe = s === c.mySlot;
      const st = isMe ? { mic: micOn, cam: camOn } : remoteStates[s] || { mic: false, cam: false };
      const p = isMe ? null : peers.get(s);
      let card = box.querySelector(`[data-slot="${s}"]`);
      if (!card) {
        card = document.createElement('div');
        card.className = 'holo-card';
        card.dataset.slot = String(s);
        const mediaWrap = document.createElement('div');
        mediaWrap.className = 'holo-frame';
        const vid = document.createElement('video');
        vid.autoplay = true;
        vid.playsInline = true;
        vid.muted = true; // audio plays via p.audioEl so mute/gating is separate!
        const initials = document.createElement('div');
        initials.className = 'holo-initials';
        mediaWrap.append(vid, initials);
        const label = document.createElement('div');
        label.className = 'holo-name';
        card.append(mediaWrap, label);
        if (!isMe) {
          const muteBtn = document.createElement('button');
          muteBtn.type = 'button';
          muteBtn.className = 'holo-mute';
          muteBtn.title = 'Mute';
          muteBtn.addEventListener('click', (e) => {
            e.currentTarget.blur();
            const peer = peers.get(s);
            if (!peer) return;
            peer.muted = !peer.muted;
            applyVoiceGating();
            renderHoloCams();
          });
          card.appendChild(muteBtn);
        }
        box.appendChild(card);
      }

      card.style.setProperty('--c', slotColor(s));
      const vid = card.querySelector('video');
      const initials = card.querySelector('.holo-initials');
      const label = card.querySelector('.holo-name');
      const nm = slotName(s);
      label.textContent = isMe ? `${nm} (${tr('youShort')})` : nm;
      initials.textContent = nm.slice(0, 2);

      const stream = isMe ? localStream : p?.stream;
      const hasVideo = Boolean(st.cam && stream?.getVideoTracks().length);
      vid.classList.toggle('hidden', !hasVideo);
      initials.classList.toggle('hidden', hasVideo);
      if (hasVideo && vid.srcObject !== stream) {
        vid.srcObject = stream;
        vid.play().catch(() => {});
      }
      const muteBtn = card.querySelector('.holo-mute');
      if (muteBtn) {
        muteBtn.textContent = p?.muted ? '🔇' : '🔊';
        muteBtn.classList.toggle('muted', Boolean(p?.muted));
      }
    }
  }

  function resetAll() {
    closeChat();
    bubbles.clear();
    unread = 0;
    els.unreadDot?.classList.add('hidden');
    if (els.log) els.log.textContent = '';
    remoteStates = [];
    for (const s of [...peers.keys()]) closePeer(s);
    if (localStream) {
      for (const t of localStream.getTracks()) t.stop();
      localStream = null;
    }
    micOn = false;
    camOn = false;
    localAnalyser = null;
    localData = null;
    if (meterTimer) {
      clearInterval(meterTimer);
      meterTimer = null;
    }
    updateHudButtons();
  }

  // ---------- Event Wiring ----------

  els.hudChat?.addEventListener('click', (e) => {
    e.currentTarget.blur();
    if (chatOpen) closeChat();
    else openChat();
  });

  els.hudMic?.addEventListener('click', (e) => {
    e.currentTarget.blur();
    sfx.unlock();
    syncLocalMedia(!micOn, camOn);
  });

  els.hudCam?.addEventListener('click', (e) => {
    e.currentTarget.blur();
    sfx.unlock();
    syncLocalMedia(micOn, !camOn);
  });

  els.hudVscope?.addEventListener('click', (e) => {
    e.currentTarget.blur();
    voiceScope = voiceScope === 'all' ? 'team' : 'all';
    net.send({ t: 'media', mic: micOn, cam: camOn, vscope: voiceScope });
    updateHudButtons();
  });

  els.scopeBtn?.addEventListener('click', (e) => {
    e.currentTarget.blur();
    if (hasTeamScope()) {
      chatScope = chatScope === 'all' ? 'team' : 'all';
      updateScopeBadge();
    }
    els.input?.focus();
  });

  els.form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const val = els.input.value;
    els.input.value = '';
    if (val.trim()) sendChat(val);
    closeChat();
  });

  els.input?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeChat();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      if (hasTeamScope()) {
        chatScope = chatScope === 'all' ? 'team' : 'all';
        updateScopeBadge();
      }
    }
  });

  // Quick-chat reaction chips
  els.quickRow?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-quick]');
    if (!btn) return;
    btn.blur();
    sendChat(btn.textContent);
    closeChat();
  });

  // Squad bot tactical orders
  els.orderRow?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-order]');
    if (!btn) return;
    btn.blur();
    net.send({ t: 'order', cmd: btn.dataset.order });
  });

  // Global hotkeys: Enter opens chat; G cycles allied bot order
  const orderCycle = ['follow', 'attack', 'hold'];
  let orderIdx = 0;
  window.addEventListener('keydown', (e) => {
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const c = ctxInfo();
    if (!c.online) return;
    if (e.key === 'Enter' && !chatOpen) {
      e.preventDefault();
      openChat();
    } else if (e.code === 'KeyG' && !e.repeat && hasAlliedBots()) {
      const cmd = orderCycle[orderIdx++ % orderCycle.length];
      net.send({ t: 'order', cmd });
    }
  });

  net.on('chat', (msg) => appendChatMsg(msg));
  net.on('rtc', (msg) => onRtc(msg));
  net.on('media', (msg) => {
    remoteStates = Array.isArray(msg.states) ? msg.states : [];
    syncPeersWithRoom();
    applyVoiceGating();
    updateHudButtons();
  });

  return {
    bubbleFor,
    updateHudButtons,
    syncPeersWithRoom,
    resetAll,
    get isOpen() {
      return chatOpen;
    },
  };
}
