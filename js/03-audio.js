// ===== 像素乱斗 PIXEL BRAWL · 音频（chipTune BGM + WebAudio 音效合成）=====
'use strict';

// ---------- 背景音乐（chipTune 音序器） ----------
// 旋律/低音用半音索引表达：C4=0, D4=2, E4=4, F4=5, G4=7, A4=9, B4=11, C5=12…；-1=休止
const BGM = {
  menu: {
    bpm: 92,
    mel:  [0,4,7,4, 9,7,4,2, 0,4,7,11, 9,7,4,-1, 0,4,7,4, 9,12,11,9, 7,9,7,4, 2,-1,-1,-1],
    bass: [0,-3,-1,-1, 0,-3,-1,-1, 0,-3,-1,-1, 7,-1,9,-1, 0,-3,-1,-1, 0,-3,-1,-1, 5,-1,4,-1, 2,-1,-1,-1]
  },
  battle: {
    bpm: 140,
    mel:  [0,0,3,5, 7,5,3,0, 7,7,8,7, 5,3,5,7, 10,10,12,10, 9,7,5,3, 5,5,7,8, 9,8,7,5],
    bass: [0,-1,-1,-1, 0,-1,-1,-1, 5,-1,-1,-1, 3,-1,-1,-1, 0,-1,-1,-1, 0,-1,-1,-1, 5,-1,4,-1, 3,-1,2,-1]
  },
  boss: {
    bpm: 168,
    mel:  [0,0,3,4, 7,7,10,12, 7,7,8,7, 5,3,5,0, 0,0,3,4, 7,7,10,12, 14,12,10,7, 10,9,7,5],
    bass: [0,-1,-1,-1, 0,-1,-1,-1, 7,-1,-1,-1, 5,-1,-1,-1, 12,-1,-1,-1, 10,-1,-1,-1, 5,-1,4,-1, 3,-1,2,-1]
  }
};
const BGM_STATE = { timer: null, step: 0, nextT: 0, song: null, on: false };
function freqOf(semi) { return Math.pow(2, semi / 12) * 261.63; }
function bgmNote(semi, t, dur, type, vol) {
  if (!AC) return;
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.value = freqOf(semi);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(AC.destination);
  o.start(t); o.stop(t + dur + 0.02);
}
function bgmTick() {
  if (!BGM_STATE.on || !BGM_STATE.song || !AC) return;
  const s = BGM[BGM_STATE.song], spb = 60 / s.bpm / 4;
  while (BGM_STATE.nextT < AC.currentTime + 0.15) {
    const m = s.mel[BGM_STATE.step % s.mel.length];
    const b = s.bass[BGM_STATE.step % s.bass.length];
    if (m >= 0) bgmNote(m, BGM_STATE.nextT, spb * 0.92, 'square', 0.045);
    if (b >= 0) bgmNote(m + b, BGM_STATE.nextT, spb * 0.92, 'triangle', 0.07);
    BGM_STATE.nextT += spb; BGM_STATE.step++;
  }
}
function startBGM(song) {
  try {
    if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === 'suspended') AC.resume();
  } catch (e) { return; }
  BGM_STATE.song = song; BGM_STATE.step = 0; BGM_STATE.nextT = AC.currentTime + 0.05;
  BGM_STATE.on = true;
  if (!BGM_STATE.timer) BGM_STATE.timer = setInterval(bgmTick, 30);
}
function stopBGM() {
  BGM_STATE.on = false;
  if (BGM_STATE.timer) { clearInterval(BGM_STATE.timer); BGM_STATE.timer = null; }
}

// ---------- 音效（WebAudio 极简合成） ----------
let AC = null;
function sfx(kind) {
  try {
    if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
    const t = AC.currentTime;
    const o = AC.createOscillator(), g = AC.createGain();
    o.connect(g); g.connect(AC.destination);
    if (kind === 'hit')      { o.type='square';   o.frequency.setValueAtTime(160,t); o.frequency.exponentialRampToValueAtTime(60,t+.1); g.gain.setValueAtTime(.15,t); g.gain.exponentialRampToValueAtTime(.001,t+.12); o.start(t); o.stop(t+.13); }
    else if (kind === 'kick'){ o.type='square';   o.frequency.setValueAtTime(110,t); o.frequency.exponentialRampToValueAtTime(40,t+.14); g.gain.setValueAtTime(.18,t); g.gain.exponentialRampToValueAtTime(.001,t+.16); o.start(t); o.stop(t+.17); }
    else if (kind === 'shot'){ o.type='sine';     o.frequency.setValueAtTime(300,t); o.frequency.exponentialRampToValueAtTime(900,t+.18); g.gain.setValueAtTime(.12,t); g.gain.exponentialRampToValueAtTime(.001,t+.2); o.start(t); o.stop(t+.21); }
    else if (kind === 'jump'){ o.type='sine';     o.frequency.setValueAtTime(220,t); o.frequency.exponentialRampToValueAtTime(440,t+.1); g.gain.setValueAtTime(.08,t); g.gain.exponentialRampToValueAtTime(.001,t+.12); o.start(t); o.stop(t+.13); }
    else if (kind === 'block'){ o.type='triangle';o.frequency.setValueAtTime(520,t); o.frequency.exponentialRampToValueAtTime(740,t+.06); g.gain.setValueAtTime(.10,t); g.gain.exponentialRampToValueAtTime(.001,t+.09); o.start(t); o.stop(t+.1); }
    else if (kind === 'super'){ o.type='sawtooth'; o.frequency.setValueAtTime(180,t); o.frequency.exponentialRampToValueAtTime(820,t+.4); g.gain.setValueAtTime(.16,t); g.gain.exponentialRampToValueAtTime(.001,t+.45); o.start(t); o.stop(t+.46); }
    else if (kind === 'win')  { o.type='square';   o.frequency.setValueAtTime(440,t); o.frequency.setValueAtTime(660,t+.09); o.frequency.setValueAtTime(880,t+.18); g.gain.setValueAtTime(.12,t); g.gain.exponentialRampToValueAtTime(.001,t+.3); o.start(t); o.stop(t+.31); }
    else if (kind === 'ko')  { o.type='sawtooth'; o.frequency.setValueAtTime(400,t); o.frequency.exponentialRampToValueAtTime(50,t+.5); g.gain.setValueAtTime(.2,t); g.gain.exponentialRampToValueAtTime(.001,t+.55); o.start(t); o.stop(t+.56); }
  } catch(e) {}
}

// 静音开关（音乐 + 音效）
function toggleMute() {
  const btn = document.getElementById('btn-mute');
  if (!btn) return;
  const isMuted = btn.dataset.muted === '1';
  if (!isMuted) { stopBGM(); AC && AC.suspend(); }
  else { if (G.state === 'title') startBGM('menu'); else if (G.state !== 'result') { startBGM(G.training ? 'menu' : 'battle'); AC && AC.resume(); } }
  btn.dataset.muted = isMuted ? '0' : '1';
  btn.textContent = isMuted ? '♪' : '×';
}
