// PIXEL BRAWL — foundation, tuning constants and audio.
// The ordered classic scripts share page-level bindings and still work from file://.
//
'use strict';

// ---------- 基础 ----------
const W = 480, H = 270, GROUND = 226;
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
ctx.imageSmoothingEnabled = false;

// ===== 物理与战斗调参（集中在此，数值与原版一致） =====
const PHYS = {
  gravity: 500,      // 重力加速度（px/s²）
  jumpV: -215,       // 跳跃初速度
  arenaL: 16,        // 场地左右边界（角色中心钳制范围）
  get arenaR() { return W - 16; },
  airJuggleV: -80,   // 空中被击时的上挑速度
};
const COMBAT = {
  guardChip: 0.28,       // 格挡承伤比例
  comboDecay: 0.09,      // 连段中每多一段的伤害衰减
  comboDecayMax: 0.5,    // 衰减上限
  meterOnHitGiven: 14,   // 命中对方获得的能量
  meterOnHitTaken: 5,    // 被命中获得的能量
  meterOnGuardGiven: 5,  // 对方格挡时攻击方获得的能量
  meterOnGuardTaken: 9,  // 格挡成功获得的能量
  meterRegen: 5,         // 能量自然回复（/秒）
  chipDrain: 28,         // 残血拖尾消退速度（/秒）
  atkBufFrames: 25,      // 攻击输入缓冲帧数
  hitStunTime: 0.32,     // 受击硬直时长（秒）
  specialCost: 35,       // 波动拳能量消耗
  pressRecency: 7,       // 键盘按下被识别为"刚按下"的帧窗口（6–8f 输入缓冲，大厂格斗标配）
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const irand = (a, b) => Math.floor(rand(a, b + 1));

// ---------- 打击手感（纯反馈层：不改伤害 / 帧数据 / 物理 / AI） ----------
// hitstop 帧数：大乱斗式 ⌊dmg×0.65+6⌋（6f 起，25f 封顶）；格挡取 60%。冻结双方，输入照常采集
function hitstopFor(dmg, guarded) {
  let f = Math.floor(dmg * 0.65 + 6);
  f = clamp(f, 6, 25);
  if (guarded) f = Math.max(4, Math.round(f * 0.6));
  return f / 60;
}
// trauma 震动：addTrauma 累加（上限 1），1.5/s 衰减，渲染偏移 = trauma² × 7px（横向为主）
function addTrauma(x) { G.trauma = Math.min(1, G.trauma + x); }
function traumaFor(dmg, guarded) {
  if (guarded) return 0.15;
  return clamp(0.18 + dmg * 0.014, 0.2, 0.7); // 轻 0.26 / 中 0.38 / 重 0.5+ / 超必杀 0.6+
}

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
let _noiseBuf = null;
function noiseBuf() {
  if (!_noiseBuf) {
    _noiseBuf = AC.createBuffer(1, AC.sampleRate * 0.3, AC.sampleRate);
    const d = _noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return _noiseBuf;
}
// 音高随机 ±2 半音（避免重复打击听觉疲劳）
const detune = () => Math.pow(2, rand(-2, 2) / 12);
// 分层打击音：瞬态（高频咬合）+ 本体（中频闷响）+ 低频（胸腔共鸣），重击加深
function sfxHit(tier) {
  try {
    if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
    const t = AC.currentTime, dt = detune();
    const heavy = tier === 'heavy', med = tier === 'medium';
    const vol = heavy ? 1 : (med ? 0.85 : 0.7);
    // 瞬态层：高频方波咬合
    const o1 = AC.createOscillator(), g1 = AC.createGain();
    o1.type = 'square'; o1.frequency.setValueAtTime((heavy ? 700 : 900) * dt, t);
    o1.frequency.exponentialRampToValueAtTime(180 * dt, t + .05);
    g1.gain.setValueAtTime(.10 * vol, t); g1.gain.exponentialRampToValueAtTime(.001, t + .06);
    o1.connect(g1); g1.connect(AC.destination); o1.start(t); o1.stop(t + .07);
    // 本体层：中频闷响
    const o2 = AC.createOscillator(), g2 = AC.createGain();
    o2.type = 'square'; o2.frequency.setValueAtTime((heavy ? 130 : 170) * dt, t);
    o2.frequency.exponentialRampToValueAtTime(55 * dt, t + (heavy ? .14 : .1));
    g2.gain.setValueAtTime(.16 * vol, t); g2.gain.exponentialRampToValueAtTime(.001, t + (heavy ? .16 : .12));
    o2.connect(g2); g2.connect(AC.destination); o2.start(t); o2.stop(t + (heavy ? .17 : .13));
    // 低频层：正弦胸腔共鸣（重击更深）
    const o3 = AC.createOscillator(), g3 = AC.createGain();
    o3.type = 'sine'; o3.frequency.setValueAtTime((heavy ? 90 : 75) * dt, t);
    o3.frequency.exponentialRampToValueAtTime(38 * dt, t + .16);
    g3.gain.setValueAtTime((heavy ? .20 : .12) * vol, t); g3.gain.exponentialRampToValueAtTime(.001, t + .18);
    o3.connect(g3); g3.connect(AC.destination); o3.start(t); o3.stop(t + .19);
  } catch(e) {}
}
// 挥空 whoosh：带通噪声下扫，出招启动时播放（比命中早 80–120ms）
function sfxWhoosh(big) {
  try {
    if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
    const t = AC.currentTime, dur = big ? .18 : .12;
    const src = AC.createBufferSource(); src.buffer = noiseBuf();
    const bp = AC.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(big ? 2600 : 3200, t);
    bp.frequency.exponentialRampToValueAtTime(500, t + dur);
    const g = AC.createGain();
    g.gain.setValueAtTime(.0001, t);
    g.gain.exponentialRampToValueAtTime(big ? .14 : .09, t + dur * .3);
    g.gain.exponentialRampToValueAtTime(.001, t + dur);
    src.connect(bp); bp.connect(g); g.connect(AC.destination);
    src.start(t); src.stop(t + dur + .02);
  } catch(e) {}
}
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

