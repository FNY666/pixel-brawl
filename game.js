// ===== 像素乱斗 PIXEL BRAWL =====
// 单文件街机格斗（无构建步骤：直接用浏览器打开 index.html 或部署到 GitHub Pages 即可运行）。
// 刻意保持单文件而非 ES module——file:// 协议下 module 脚本会被 CORS 拦截。
//
// 章节速览：
//   基础（含 PHYS/COMBAT 调参）→ 背景音乐 → 音效 → 键盘输入 → 触屏输入 →
//   招式表/角色/AI 参数 → Fighter（物理/战斗/AI）→ 特效 → 全局状态与流程 →
//   场景 → 角色绘制 → HUD → 主循环 → UI 接线/启动（含 debug/autotest 自检）
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

// ---------- 输入 ----------
const input = { left:false, right:false, jump:false, block:false, punch:false, kick:false, special:false };
const input2 = { left:false, right:false, jump:false, block:false, punch:false, kick:false, special:false };
// 帧号按下记录：keydown 记当前帧号，update 据此判断"刚按下"（防快速连按丢键）
// 1P/2P 各用一张表：共用一张会导致同帧内双方同时出拳时后捕获者丢失输入
let GFRAME = 0;
const freshPressMap = () => ({ punch: -999, kick: -999, special: -999,
  left: -999, right: -999, jump: -999, block: -999 });
const pressFrame1 = freshPressMap();   // 1P（键盘 ASDW+JKL）
const pressFrame2 = freshPressMap();   // 2P（键盘 方向键+456）
// 1P：ASDW + J/K/L；2P：方向键 + 4/5/6
const KEYMAP = {
  a:'left', d:'right', w:'jump', s:'block',
  j:'punch', k:'kick', l:'special'
};
const KEYMAP2 = {
  arrowleft:'left', arrowright:'right', arrowup:'jump', arrowdown:'block',
  '4':'punch', '5':'kick', '6':'special'
};
function dispatchKey(e, isDown) {
  const k = e.key.toLowerCase();
  if (KEYMAP[k]) { input[KEYMAP[k]] = isDown; if (isDown) pressFrame1[KEYMAP[k]] = GFRAME; e.preventDefault(); }
  if (KEYMAP2[k]) { input2[KEYMAP2[k]] = isDown; if (isDown) pressFrame2[KEYMAP2[k]] = GFRAME; e.preventDefault(); }
}
// 键盘：移动/攻击映射 + 全局快捷键（P 暂停 / R 训练复位 / M 静音）
addEventListener('keydown', e => {
  dispatchKey(e, true);
  const k = e.key.toLowerCase();
  if (k === 'p' && G.state !== 'title' && G.state !== 'result') { togglePause(); e.preventDefault(); }
  else if (k === 'r' && G.training && G.state !== 'paused') { resetTrainingPosition(); e.preventDefault(); }
  else if (k === 'm') { toggleMute(); e.preventDefault(); }
});
addEventListener('keyup', e => { dispatchKey(e, false); });

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

// ===== 触屏输入：容器级事件委托（1P/2P 共用）=====
// - 多点独立跟踪（每根手指/指针独立）
// - 滑动联动：按住方向键滑到攻击键 → 边移动边出招（多点不可用的兜底）
function bindKeys(containerSel, keySel, target) {
  const touchEl = document.querySelector(containerSel);
  if (!touchEl) return;
  const keys = () => Array.from(touchEl.querySelectorAll(keySel));

  const hitKey = (x, y) => {
    for (const el of keys()) {
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return el.dataset.k;
    }
    return null;
  };

  // 活动指针：id -> { cur: 当前键, pressed: 按过的一组键 }
  const active = new Map();

  function press(id, k) {
    if (!k) return;
    if (active.has(id)) {
      const p = active.get(id);
      if (p.cur === k) {
        // 同 id 再次按下：视为新触点（iOS 快速连点偶发丢 pointerup，防卡键）
        for (const kk of p.pressed) target[kk] = false;
        active.delete(id);
      } else {
        target[k] = true; p.pressed.add(k); p.cur = k;
        return;
      }
    }
    target[k] = true;
    active.set(id, { cur: k, pressed: new Set([k]) });
  }
  function moveTo(id, k) {
    const p = active.get(id);
    if (!p || !k || k === p.cur) return;
    // 滑入新键：按下并保持此前所有键（滑动联动：左→拳 = 边移动边出拳）
    target[k] = true; p.pressed.add(k); p.cur = k;
  }
  function release(id) {
    const p = active.get(id);
    if (!p) return;
    for (const k of p.pressed) target[k] = false;
    active.delete(id);
  }

  // —— 轨道1：Pointer Events（iOS13+ / 现代内核，天然多指针）——
  if (window.PointerEvent) {
    touchEl.addEventListener('pointerdown', e => {
      e.preventDefault();
      press(e.pointerId, hitKey(e.clientX, e.clientY));
    }, { passive: false });
    touchEl.addEventListener('pointermove', e => {
      moveTo(e.pointerId, hitKey(e.clientX, e.clientY));
    }, { passive: true });
    touchEl.addEventListener('pointerup', e => { release(e.pointerId); });
    touchEl.addEventListener('pointercancel', e => { release(e.pointerId); });
  }

  // —— 轨道2：Touch Events（iOS Safari 始终绑定：WebKit 以 touch 序列识别双击/双指手势，
  //    双轨幂等绑定保证两条路径都能驱动输入；相同触摸在双轨各触发一次，置位/清位幂等无害）——
  if (window.TouchEvent) {
    const touchesToIds = new Map();   // identifier -> 自增 id（与 pointerId 域隔离，互不冲突）
    let nextId = 1000;
    const idOf = (t) => {
      if (!touchesToIds.has(t.identifier)) touchesToIds.set(t.identifier, nextId++);
      return touchesToIds.get(t.identifier);
    };
    touchEl.addEventListener('touchstart', e => {
      e.preventDefault();
      for (const t of e.changedTouches) press(idOf(t), hitKey(t.clientX, t.clientY));
    }, { passive: false });
    touchEl.addEventListener('touchmove', e => {
      for (const t of e.changedTouches) moveTo(idOf(t), hitKey(t.clientX, t.clientY));
    }, { passive: true });
    const end = (e) => {
      for (const t of e.changedTouches) { release(idOf(t)); touchesToIds.delete(t.identifier); }
    };
    touchEl.addEventListener('touchend', end);
    touchEl.addEventListener('touchcancel', end);
  }
}

// 触摸手势拦截：只在玩法表面（画布 / 触屏按键层）阻止 Safari 双击缩放/双指手势/长按菜单，
// 保证第二个手指与快速连打不被吞掉。菜单面板（#title / #result 等）必须放行——
// iOS 上对 touchstart 调用 preventDefault 会阻止 click 事件合成，拦截全文档会导致按钮点不了。
if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
  const inGameSurface = (e) => !!(e.target && e.target.closest && e.target.closest('#touch, #cv'));
  document.addEventListener('touchstart', e => { if (inGameSurface(e)) e.preventDefault(); }, { passive: false, capture: true });
  document.addEventListener('touchmove',  e => { if (inGameSurface(e)) e.preventDefault(); }, { passive: false, capture: true });
}
bindKeys('#touch', '.tk', input);   // 1P：下半区
bindKeys('#touch', '.tk2', input2); // 2P：上半区
// 触屏层仅在真正的触屏设备显示（防桌面 Chrome 误判）
const IS_TOUCH = matchMedia('(pointer: coarse)').matches;
function showTouch() { if (IS_TOUCH) document.getElementById('touch').classList.remove('hidden'); }
function hideTouch() { document.getElementById('touch').classList.add('hidden'); }

// ---------- 招式表 ----------
const ATTACKS = {
  // cancelFrom：命中帧后可被其他攻击取消（参考街霸引擎的可中断窗口）
  punch:   { dmg:6,  total:.28, activeFrom:.06, activeTo:.14, reach:26, h:14,  kb:70,  cd:.30, oy:-26, combo:true, cancelFrom:.14 },
  punch2:  { dmg:7,  total:.24, activeFrom:.04, activeTo:.10, reach:30, h:14,  kb:90,  cd:.02, oy:-28, combo:true, cancelFrom:.10 },
  kick3:   { dmg:12, total:.36, activeFrom:.10, activeTo:.20, reach:34, h:16,  kb:150, cd:.02, oy:-14, last:true, cancelFrom:.20 },
  kick:    { dmg:10, total:.40, activeFrom:.12, activeTo:.24, reach:32, h:16,  kb:120, cd:.55, oy:-16, cancelFrom:.24 },
  airpunch:{ dmg:8,  total:.30, activeFrom:.06, activeTo:.14, reach:28, h:14,  kb:90,  cd:.02, oy:-26, air:true },
  special: { dmg:14, total:.50, activeFrom:.22, activeTo:.30, cd:2.2, projectile:true },
  super:   { dmg:30, total:.70, activeFrom:.25, activeTo:.35, cd:3.0, projectile:true, super:true }
};
const COMBO_NEXT = { punch: 'punch2', punch2: 'kick3' };

// ---------- 连段挑战（训练模式教学关卡） ----------
const TRIALS = [
  { seq: ['punch', 'punch2', 'kick3'], name: '三段连击（快速连按 J）' },
  { seq: ['punch', 'kick'],            name: '拳→脚取消（J·K）' },
  { seq: ['punch', 'super'],           name: '拳→超必杀（满能量 J·L）' }
];
function endsWithSeq(arr, seq) {
  if (arr.length < seq.length) return false;
  for (let i = 0; i < seq.length; i++) {
    if (arr[arr.length - seq.length + i] !== seq[i]) return false;
  }
  return true;
}
function initTrials() {
  G.trials = TRIALS.map(t => ({ seq: t.seq, name: t.name, done: false }));
  renderTrialPanel();
}
function updateTrials() {
  if (!G.trials || !G.p1 || G.trials.every(t => t.done)) return;
  const log = G.p1.atkLog;
  let changed = false;
  for (const t of G.trials) {
    if (!t.done && endsWithSeq(log, t.seq)) { t.done = true; changed = true; sfx('win'); }
  }
  if (changed) {
    renderTrialPanel();
    if (G.trials.every(t => t.done) && !G.trialsAllDone) {
      G.trialsAllDone = true;
      document.getElementById('trial-status').textContent = '全部达成！';
    }
  }
}
function renderTrialPanel() {
  const list = document.getElementById('trial-list');
  if (!list) return;
  list.innerHTML = '';
  for (const t of G.trials) {
    const row = document.createElement('div');
    row.className = 'trial-row' + (t.done ? ' done' : '');
    row.innerHTML = '<span class="trial-mark">' + (t.done ? '✓' : '·') + '</span><span class="trial-name">' + t.name + '</span>';
    list.appendChild(row);
  }
  const st = document.getElementById('trial-status');
  if (st) st.textContent = G.trials.filter(t => t.done).length + ' / ' + G.trials.length;
}
        
// 可用角色参数表（胜负手差异：速度/血量/伤害倍率）
const CHARACTERS = {
  fighter: { name:'小烈', hp:100, speed:105, dmg:1.00, desc:'均衡 · 速度型' },
  blob:    { name:'阿蓝', hp:125, speed:88,  dmg:1.25, desc:'重装 · 血厚攻高' },
  ninja:   { name:'影',   hp:88,  speed:124, dmg:0.92, desc:'迅捷 · 空中连段' }
};

// 角色配色（小烈/影共用武道服绘制，按 palette 上色；阿蓝为固定蓝色圆胖）
const PALS = {
  fighter: { gi:'#ff8b2e', gi_d:'#d86a18', skin:'#ffcf9e', hair:'#22222a', belt:'#3a6ad8', accent:'#ffd83a', scarf:null },
  ninja:   { gi:'#2b2b3e', gi_d:'#15151f', skin:'#e8c9a8', hair:'#0e0e16', belt:'#d23a5a', accent:'#5ccfff', scarf:'#d23a5a' }
};

// AI 难度参数（反应间隔 / 格挡概率 / 后撤倾向）
const DIFFICULTY = {
  easy:   { react: [0.28, 0.55], guard: 0.18, retreat: 0.45 },
  normal: { react: [0.15, 0.40], guard: 0.42, retreat: 0.60 },
  hard:   { react: [0.07, 0.22], guard: 0.60, retreat: 0.72 }
};

// AI 行为性格（概率分布，读取时逐项累计成阈值）
const AI_PERSONAS = {
  rush:    { jump: .20, punch: .45, kick: .15, special: .08, retreat: .10, guard: .26, approach: .72 },
  guard:   { jump: .06, punch: .22, kick: .08, special: .10, retreat: .42, guard: .64, approach: .34 },
  balance: { jump: .12, punch: .30, kick: .14, special: .10, retreat: .26, guard: .44, approach: .56 },
  bossRush:{ jump: .24, punch: .50, kick: .18, special: .10, retreat: .06, guard: .30, approach: .78 }
};

// ---------- 战士 ----------
class Fighter {
  constructor(opts) {
    const cfg = CHARACTERS[opts.type] || CHARACTERS.fighter;
    const setHp = ('hp' in opts) ? opts.hp : 100;
    Object.assign(this, {
      x: 0, y: GROUND, vx: 0, vy: 0, facing: 1,
      type: 'blob', name: '???',
      hp: setHp, maxHp: setHp, chipHp: setHp,
      dmg: cfg.dmg, speed: cfg.speed,
      state: 'idle',        // idle|walk|jump|attack|hit|block|ko|win
      stateT: 0,
      attack: null,         // 当前招式名
      hitDone: false,       // 本次攻击是否已命中
      cd: { punch:0, kick:0, special:0 },
      meter: 50, maxMeter: 100,
      blocking: false,
      flash: 0,
      isAI: false,
      aiTimer: 0, aiMove: 0, aiAct: null,
      aiScale: 1,        // 街机模式逐层强化系数
      persona: 'balance',  // rush | guard | balance（AI 行为性格）
      combo: 0, comboDmg: 0,
      walkPhase: 0,
      aiGuard: 0,
      buf: { punch: 0, kick: 0, special: 0 },
      prev: { punch: false, kick: false, special: false },
      atkLog: [],               // 连段挑战用：最近攻击名序列
      press: pressFrame1        // 本玩家的键盘按下帧表（1P/2P 独立，避免互相消费）
    }, opts);
  }

  get onGround() { return this.y >= GROUND - 0.5; }
  get hurtbox() {
    const w = this.type === 'blob' ? 30 : 22;
    return { x: this.x - w/2, y: this.y - (this.type==='blob'?46:48), w: w, h: this.type==='blob'?46:48 };
  }

  // 攻击输入捕获：两种信号源都进缓冲（快速连按不丢）
  //  - 键盘：keydown 是异步事件，用帧号判定"刚按下"
  //  - AI/触屏：输入是同步布尔量，用上升沿判定（原版此处只认键盘，导致 AI/触屏永远发不出招式）
  captureAttackInput(inp) {
    const pf = this.press;
    for (const k of ['punch', 'kick', 'special']) {
      const cur = !!inp[k];
      const keyed = cur && GFRAME - pf[k] <= COMBAT.pressRecency;
      const rising = cur && !this.prev[k];
      if (keyed || rising) this.buf[k] = COMBAT.atkBufFrames;
      if (keyed) pf[k] = -999;   // 消费本次键盘按下
      this.prev[k] = cur;
    }
  }

  startAttack(name) {
    const a = ATTACKS[name];
    if (!a) return false;

    // 连招链：连续输入 punch 推进到下一段（punch → punch2 → kick3）
    if (this.state === 'attack' && name === 'punch' && this.attack && ATTACKS[this.attack].combo) {
      const next = COMBO_NEXT[this.attack];
      if (next) {
        // 启动下一段：继承首次输入的进攻意志，重置攻击状态
        this.attack = next; this.stateT = 0; this.hitDone = false;
        sfxWhoosh(/kick/.test(next));
        this.atkLog.push(next);
        if (this.atkLog.length > 8) this.atkLog.shift();
        return true;
      }
    }
    if (this.cd[name] > 0 || this.state === 'attack' || this.state === 'hit' || this.state === 'ko') return false;

    // 空中攻击
    if (name === 'punch' && !this.onGround) name = 'airpunch';

    // 超必杀：能量满时波动拳升级
    let isSuper = false;
    if (name === 'special' && this.meter >= 100) { name = 'super'; isSuper = true; }

    if (name === 'special' && this.meter < COMBAT.specialCost) return false;
    this.blocking = false;
    this.state = 'attack'; this.stateT = 0;
    this.attack = name; this.hitDone = false;
    if (!a.projectile) sfxWhoosh(name === 'kick'); // 挥空 whoosh（比命中早 80–120ms）
    this.atkLog.push(name);
    if (this.atkLog.length > 8) this.atkLog.shift();
    this.cd[name] = ATTACKS[name].cd;
    if (name === 'special' || name === 'super') {
      this.meter -= (isSuper ? 100 : COMBAT.specialCost);
      sfx(isSuper ? 'super' : 'shot');
      if (isSuper) { goldenFlash(); G.slowmo = 0.32; }
    }
    return true;
  }

  takeHit(dmg, dir, kb, attacker, atkName) {
    if (this.state === 'ko') return;
    const foeInFront = Math.sign(attacker.x - this.x) === this.facing;
    const guarded = this.blocking && this.onGround && foeInFront && this.state !== 'attack';
    // 连段伤害衰减（真实格斗手感：同一连段越往后单发越轻）
    const scale = guarded ? 1 : (1 - Math.min(COMBAT.comboDecayMax, Math.max(0, attacker.combo - 1) * COMBAT.comboDecay));
    const finalDmg = guarded ? Math.max(1, Math.ceil(dmg * COMBAT.guardChip)) : Math.max(1, Math.round(dmg * scale));
    this.hp = Math.max(0, this.hp - finalDmg);
    attacker.meter = clamp(attacker.meter + (guarded ? COMBAT.meterOnGuardGiven : COMBAT.meterOnHitGiven), 0, attacker.maxMeter);
    this.meter = clamp(this.meter + (guarded ? COMBAT.meterOnGuardTaken : COMBAT.meterOnHitTaken), 0, this.maxMeter);

    if (guarded) {
      this.state = 'block'; this.stateT = 0;
      this.vx = dir * kb * 0.18;
      this.flash = .08;
      G.hitStop = hitstopFor(dmg, true); addTrauma(traumaFor(dmg, true));
      spawnSparks(this.x, this.y - 30, dir, true);
      sfx('block');
      if (this.hp <= 0) {
        this.blocking = false;
        this.state = 'ko'; this.stateT = 0;
        this.vx = dir * 80; this.vy = -90;
        onKO(attacker, this);
      }
      return;
    }

    this.blocking = false;
    this.state = 'hit'; this.stateT = 0;
    this.attack = null; this.hitDone = true;
    this.vx = dir * kb;
    if (!this.onGround) this.vy = PHYS.airJuggleV;
    this.flash = .12;
    attacker.combo++;
    attacker.comboDmg += finalDmg;
    G.hitStop = hitstopFor(finalDmg, false); addTrauma(traumaFor(finalDmg, false));
    spawnSparks(this.x, this.y - 30, dir);
    spawnImpact(this.x, this.y - 30, dir, finalDmg >= 12);
    if (atkName && /kick/.test(atkName)) spawnArc(this.x, this.y - 30, dir); // 踢技方向性弧光
    spawnDmg(this.x, this.y - 46, finalDmg, finalDmg >= 12 ? '#ff9d2e' : '#ffe95c');
    sfxHit(finalDmg >= 12 ? 'heavy' : (finalDmg >= 8 ? 'medium' : 'light'));
    if (finalDmg >= 12) {
      G.zoomPunch = Math.max(G.zoomPunch, 0.18);   // 重击 180ms 轻微推镜
      G.impactFlash = Math.max(G.impactFlash, 2);  // 2 帧冲击闪光
      if (this.onGround) spawnDust(this.x, GROUND, 5);
    }
    if (this.hp <= 0) {
      this.state = 'ko'; this.stateT = 0;
      this.vx = dir * 160; this.vy = -140;
      onKO(attacker, this);
    }
  }

  update(dt, foe, inp) {
    // 冷却与能量自然恢复
    for (const k in this.cd) this.cd[k] = Math.max(0, this.cd[k] - dt);
    this.meter = clamp(this.meter + dt * COMBAT.meterRegen, 0, this.maxMeter);
    this.flash = Math.max(0, this.flash - dt);
    if (this.chipHp > this.hp) this.chipHp = Math.max(this.hp, this.chipHp - dt * COMBAT.chipDrain); // 残血拖尾

    // 胜利姿势：动作展示，不受输入影响
    if (this.state === 'win') {
      this.stateT += dt;
      return;
    }

    // KO 倒地
    if (this.state === 'ko') {
      this.vy += PHYS.gravity * dt;
      this.x += this.vx * dt; this.y += this.vy * dt;
      if (this.y > GROUND) { if (this.vy > 200) spawnDust(this.x, GROUND, 6); this.y = GROUND; this.vy = 0; this.vx *= .8; }
      this.x = clamp(this.x, PHYS.arenaL, PHYS.arenaR);
      return;
    }

    // 受击硬直
    if (this.state === 'hit') {
      this.captureAttackInput(inp);
      this.stateT += dt;
      this.vy += PHYS.gravity * dt;
      this.x += this.vx * dt; this.y += this.vy * dt;
      if (this.y > GROUND) { this.y = GROUND; this.vy = 0; }
      this.vx *= Math.pow(.02, dt);
      this.x = clamp(this.x, PHYS.arenaL, PHYS.arenaR);
      if (this.stateT > COMBAT.hitStunTime && this.onGround) { this.state = 'idle'; this.stateT = 0; }
      return;
    }

    // 格挡：仅地面可用，按住期间持续减伤
    if (this.state === 'block') {
      this.stateT += dt;
      this.blocking = !!inp.block && this.onGround;
      this.vy += PHYS.gravity * dt;
      this.x += this.vx * dt; this.y += this.vy * dt;
      if (this.y > GROUND) { this.y = GROUND; this.vy = 0; }
      this.vx *= Math.pow(.01, dt);
      this.x = clamp(this.x, PHYS.arenaL, PHYS.arenaR);
      if (!this.blocking) { this.state = 'idle'; this.stateT = 0; }
      return;
    }

    // 攻击进行中
    if (this.state === 'attack') {
      this.stateT += dt;
      const a = ATTACKS[this.attack];

      // —— 可取消窗口（街霸引擎取消语义）：activeTo 之后可按其他攻击/波动取消 ——
      if (a.cancelFrom !== undefined && this.stateT >= a.cancelFrom) {
        // 边沿检测：键盘用帧号判定，AI/触屏用上升沿
        const edge = (k, v) => {
          const cur = !!v;
          const keyed = cur && GFRAME - this.press[k] <= COMBAT.pressRecency;
          const rising = cur && !this.prev[k];
          this.prev[k] = cur;
          if (keyed) this.press[k] = -999;   // 消费本次按下（取消路径）
          return keyed || rising;
        };
        const kickP = edge('kick', inp.kick) && this.cd.kick <= 0;
        const specialP = edge('special', inp.special) && this.meter >= COMBAT.specialCost;
        const punchP = edge('punch', inp.punch);
        if (kickP) { this.attack = 'kick'; this.stateT = 0; this.hitDone = false; this.cd.kick = ATTACKS.kick.cd; sfx('block'); this.atkLog.push('kick'); }
        else if (specialP) {
          const sup = this.meter >= 100;
          this.attack = sup ? 'super' : 'special'; this.stateT = 0; this.hitDone = false;
          this.cd.special = ATTACKS[this.attack].cd;
          this.meter -= sup ? 100 : COMBAT.specialCost;
          sfx(sup ? 'super' : 'shot');
          if (sup) { goldenFlash(); G.slowmo = 0.32; }
          this.atkLog.push(this.attack);
        }
        else if (punchP && this.attack === 'punch') {   // 拳→拳→上踢 连段链
          const next = COMBO_NEXT.punch;
          if (next) { this.attack = next; this.stateT = 0; this.hitDone = false; this.atkLog.push(next); }
        }
        else if (punchP && this.attack === 'punch2') {  // 第二段接终结踢
          this.attack = 'kick3'; this.stateT = 0; this.hitDone = false; this.atkLog.push('kick3');
        }
        else if (punchP && ATTACKS[this.attack].combo !== true && this.attack !== 'kick' && this.attack !== 'airpunch') {
          this.attack = 'punch'; this.stateT = 0; this.hitDone = false; this.atkLog.push('punch'); // 其他攻击可用拳重置
        }
      } else {
        // 未到取消窗口：提前按下先进缓冲，帧期结束自动出手
        this.captureAttackInput(inp);
      }

      if (!this.hitDone && this.stateT >= a.activeFrom && this.stateT <= a.activeTo) {
        if (a.projectile) {
          if (!this.hitDone) {
            this.hitDone = true;
            const superShot = !!a.super;
            G.projectiles.push({ x: this.x + this.facing*20, y: this.y - 26,
              vx: this.facing * (superShot ? 320 : 220),
              dmg: Math.round(a.dmg * this.dmg), owner: this, life: 1.6,
              r: superShot ? 13 : 7, super: superShot,
              skin: this.type === 'ninja' ? 'shuriken' : (superShot ? 'gold' : 'orb') });
            if (superShot) { addTrauma(0.5); G.zoomPunch = Math.max(G.zoomPunch, 0.22); }
          }
        } else {
          const hx = this.x + this.facing * a.reach;
          const hb = { x: Math.min(hx, this.x), y: this.y + a.oy - a.h/2, w: Math.abs(hx - this.x), h: a.h };
          const fb = foe.hurtbox;
          if (hb.x < fb.x + fb.w && hb.x + hb.w > fb.x && hb.y < fb.y + fb.h && hb.y + hb.h > fb.y) {
            this.hitDone = true;
            const dmg = Math.round(a.dmg * this.dmg);
            foe.takeHit(dmg, this.facing, a.kb, this, this.attack);
            if (a.last && foe.state !== 'ko') { foe.vy = -90; foe.vx = this.facing * 110; } // 终结踢上挑
          }
        }
      }
      if (this.stateT >= a.total) { this.state = this.onGround ? 'idle' : 'jump'; this.stateT = 0; this.attack = null; }
      // 攻击时轻微前移
      if (this.onGround) this.vx *= Math.pow(.01, dt);
      this.x = clamp(this.x + this.vx * dt, PHYS.arenaL, PHYS.arenaR);
      return;
    }

    // ---- 常规控制（玩家输入 或 AI 虚拟输入）----
    let move = 0;
    if (inp.left) move -= 1;
    if (inp.right) move += 1;

    if (inp.block && this.onGround) {
      this.blocking = true;
      this.state = 'block'; this.stateT = 0;
      this.vx = 0;
      return;
    }
    this.blocking = false;
    if (inp.jump && this.onGround) { this.vy = PHYS.jumpV; sfx('jump'); }

    // 攻击输入：边沿捕获 + 缓冲消费（可行动立即出手，不可行则暂存）
    this.captureAttackInput(inp);
    for (const k of ['punch', 'kick', 'special']) {
      if (this.buf[k] > 0) {
        if (this.startAttack(k)) { this.buf[k] = 0; return; }  // 攻击建立，本帧结束（防后续覆盖 state）
        this.buf[k]--;
      }
    }

    this.vy += PHYS.gravity * dt;
    this.x += move * this.speed * dt;
    this.y += this.vy * dt;
    if (this.y > GROUND) { if (this.vy > 170) spawnDust(this.x, GROUND, 6); this.y = GROUND; this.vy = 0; }
    if (move !== 0 && this.onGround) { this.state = 'walk'; this.walkPhase += dt * 10; }
    else if (this.onGround) this.state = 'idle';
    else this.state = 'jump';

    // 面向对手
    if (foe && this.state !== 'attack') this.facing = foe.x >= this.x ? 1 : -1;
    this.x = clamp(this.x, PHYS.arenaL, PHYS.arenaR);

    // 身体碰撞推挤
    if (foe) {
      const dx = this.x - foe.x;
      if (Math.abs(dx) < 22 && Math.abs(this.y - foe.y) < 40 && dx !== 0) {
        const push = (22 - Math.abs(dx)) / 2 * Math.sign(dx);
        this.x = clamp(this.x + push, PHYS.arenaL, PHYS.arenaR);
      }
    }
  }

  // ---------- AI ----------
  aiInput(dt, foe) {
    const out = { left:false, right:false, jump:false, block:false, punch:false, kick:false, special:false };
    if (this.state === 'ko' || foe.state === 'ko') return out;
    if (this.aiGuard > 0) {
      this.aiGuard -= dt;
      out.block = true;
      return out;
    }
    this.aiTimer -= dt;
    const diff = DIFFICULTY[G.difficulty] || DIFFICULTY.normal;
    const per = AI_PERSONAS[this.persona] || AI_PERSONAS.balance;
    const dist = Math.abs(foe.x - this.x);
    if (this.aiTimer <= 0) {
      this.aiTimer = rand(diff.react[0], diff.react[1]) / this.aiScale;
      this.aiMove = 0; this.aiAct = null;
      const r = Math.random();
      // 行为概率：性格权重累积成阈值（approach / jump / special / retreat）
      // 距离分三档：远 >110（接近/发波/跳）· 中 46–110（接近/跳/波/后撤）· 近 <46（拳/脚/格挡/后撤）
      const seek = per.approach, sp = seek + per.special, jp = sp + per.jump;
      if (dist > 110) {
        if (r < seek) this.aiMove = Math.sign(foe.x - this.x);
        else if (r < sp) this.aiAct = 'special';
        else if (r < jp) { this.aiMove = Math.sign(foe.x - this.x); this.aiAct = 'jump'; }
      } else if (dist > 46) {
        const rp = jp + per.retreat;
        if (r < seek * .85) this.aiMove = Math.sign(foe.x - this.x);
        else if (r < sp + per.jump * .5) this.aiAct = 'jump';
        else if (r < jp + per.special * .4) this.aiAct = 'special';
        else if (r < rp) this.aiMove = -Math.sign(foe.x - this.x); // 后撤
      } else {
        const gScale = Math.min(.8, per.guard + (this.aiScale - 1) * .18); // 性格+街机层数决定格挡概率
        const pp = per.punch, kp = pp + per.kick, rp = kp + per.retreat;
        if (foe.state === 'attack' && r < gScale) this.aiGuard = rand(.18, .42);
        else if (r < pp) this.aiAct = 'punch';
        else if (r < kp) this.aiAct = 'kick';
        else if (r < rp) this.aiMove = -Math.sign(foe.x - this.x);
        else if (r < rp + per.jump) this.aiAct = 'jump';
      }
    }
    if (this.aiMove === 1) out.right = true;
    if (this.aiMove === -1) out.left = true;
    if (this.aiAct === 'jump') { out.jump = true; this.aiAct = null; }
    if (this.aiAct === 'punch') { out.punch = true; this.aiAct = null; }
    if (this.aiAct === 'kick') { out.kick = true; this.aiAct = null; }
    if (this.aiAct === 'special') { out.special = true; this.aiAct = null; }
    return out;
  }
}

// ---------- 特效 ----------
let particles = [];
function spawnSparks(x, y, dir, guarded = false) {
  const n = guarded ? 8 : 12;
  for (let i = 0; i < n; i++) {
    particles.push({ kind:'spark', x, y, vx: dir * rand(40,180) + rand(-50,50), vy: rand(-150,50),
      life: rand(.18,.38), t: 0, c: guarded ? (Math.random() < .5 ? '#b8f6ff' : '#5ccfff') : (Math.random() < .5 ? '#ffe95c' : '#ff8b2e'), s: irand(2,4) });
  }
}
// 四角冲击星（日式格斗打击感）
function spawnImpact(x, y, dir, big) {
  particles.push({ kind:'star', x, y, dir, life: big ? 0.22 : 0.16, t: 0, s: big ? 16 : 11, c: '#fff4c8', rot: 0 });
  particles.push({ kind:'star', x, y, dir: dir * 0.2, life: big ? 0.18 : 0.13, t: 0, s: big ? 11 : 8, c: '#ff9d2e', rot: Math.PI / 4 });
  if (big) spawnShock(x, y);
}
function spawnShock(x, y) {
  particles.push({ kind:'ring', x, y, life: 0.3, t: 0, r0: 4, r1: 30, c: 'rgba(255,220,120,.9)', vx: 0, vy: 0 });
}
// 踢技方向性弧光（BlazBlue 式）：沿出招方向展开的短弧
function spawnArc(x, y, dir) {
  particles.push({ kind:'arc', x, y, dir, life: 0.16, t: 0, r: 24, c: '#dff3ff' });
}
// 落地 / 重击扬尘
function spawnDust(x, y, n) {
  for (let i = 0; i < n; i++) {
    particles.push({ kind:'dust', x: x + rand(-10, 10), y: y + rand(-3, 1),
      vx: rand(-70, 70), vy: rand(-60, -10),
      life: rand(.3, .55), t: 0, c: 'rgba(200,180,150,.7)', s: irand(2, 4) });
  }
}
function spawnDmg(x, y, val, color) {
  G.dmgNums.push({ x, y, val, life: 0.8, t: 0, c: color || '#fff4c8', vy: -34 });
}
// 四角星绘制
function drawStar(x, y, s, rot, c) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.fillStyle = c;
  ctx.beginPath();
  ctx.moveTo(0, -s); ctx.lineTo(s * .28, -s * .28); ctx.lineTo(s, 0); ctx.lineTo(s * .28, s * .28);
  ctx.lineTo(0, s); ctx.lineTo(-s * .28, s * .28); ctx.lineTo(-s, 0); ctx.lineTo(-s * .28, -s * .28);
  ctx.closePath(); ctx.fill(); ctx.restore();
}

// 超必杀命中爆发
function spawnSuperBurst(x, y) {
  const colors = ['#ffe95c', '#ffd83a', '#fff8d0', '#ff9d2e'];
  for (let i = 0; i < 26; i++) {
    particles.push({ x: x + rand(-6,6), y: y + rand(-6,6),
      vx: rand(-190,190), vy: rand(-190,60),
      life: rand(.25,.5), t: 0,
      c: colors[irand(0, colors.length-1)], s: irand(3,6) });
  }
  addTrauma(0.6); G.zoomPunch = Math.max(G.zoomPunch, 0.22); G.impactFlash = Math.max(G.impactFlash, 3);
}

// 超必杀释放金光（keyframes 样式只注入一次，避免每次释放都追加重复 <style>）
function goldenFlash() {
  if (!document.getElementById('gold-style')) {
    const st = document.createElement('style');
    st.id = 'gold-style';
    st.textContent = '@keyframes goldfade{from{opacity:1}to{opacity:0}}';
    document.head.appendChild(st);
  }
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;z-index:30;pointer-events:none;' +
    'background:radial-gradient(ellipse at center,rgba(255,240,150,.85),rgba(255,180,40,.35) 45%,transparent 75%);' +
    'animation:goldfade .5s ease-out forwards;';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 520);
}

// ---------- 全局游戏状态 ----------
const G = {
  state: 'title',       // title|vs|intro|fight|ko|timeup|training-ko|paused|result
  pausedFrom: null,
  training: false,
  mode: 'vsai',         // vsai | pvp | train | arcade
  scene: 'day',
  vsTimer: 0,
  playerType: 'fighter',
  difficulty: 'normal',
  time: 60,
  koTimer: 0,
  introT: 0,
  winner: null,         // 当前回合胜者
  matchWinner: null,
  round: 1,
  wins: { p1: 0, p2: 0 },
  roundCause: '',
  trauma: 0,        // 震动能量 0–1（trauma² 衰减，横向为主）
  zoomPunch: 0,     // 重击推镜计时（秒）
  impactFlash: 0,   // 冲击闪光（帧）
  hitStop: 0,
  projectiles: [],
  comboShow: 0, comboSide: 1, comboT: 0,
  slowmo: 1,            // 慢动作速度系数（1=正常，<1 电影感）
  dmgNums: [],          // 浮动伤害数字
  perfect: false,       // 本回合是否满血取胜
  p1: null, p2: null
};

const NO_INPUT = Object.freeze({ left:false, right:false, jump:false, block:false, punch:false, kick:false, special:false });
function clearInput() { for (const k in input) input[k] = false; for (const k in input2) input2[k] = false; }
function show2P() { if (IS_TOUCH) document.getElementById('tc-2p').classList.remove('hidden'); }
function hide2P() { document.getElementById('tc-2p').classList.add('hidden'); }

function startMatch(mode) {
  G.mode = mode || 'vsai';       // vsai | pvp | train | arcade
  G.training = (G.mode === 'train');
  if (G.mode === 'pvp') show2P(); else hide2P();
  if (G.mode === 'arcade') {
    G.arcade = {
      stage: 1,
      score: 0,
      boss: false,
      best: parseInt(localStorage.getItem('pixelbrawl_best') || '0', 10) || 0
    };
  }
  startBGM(G.mode === 'train' ? 'menu' : 'battle');
  G.round = 1;
  G.wins = { p1: 0, p2: 0 };
  G.matchWinner = null;
  startRound();
}

function startTraining() {
  startMatch('train');
  initTrials();
  G.trialsAllDone = false;
  document.getElementById('trial-panel').classList.remove('hidden');
}

function startRound() {
  const p1c = CHARACTERS[G.playerType];
  let p2Type = G.playerType === 'fighter' ? 'blob' : 'fighter';
  let aiScale = 1, hpBoost = 0, persona = 'balance';
  if (G.mode === 'arcade') {
    // 街机：人格逐层分配（平衡→侵略→龟壳→侵略→Boss），逐层强化
    const personaOrder = ['balance', 'rush', 'guard', 'rush', 'bossRush'];
    const stage = G.arcade.stage;
    G.arcade.boss = stage === 5;
    p2Type = (stage % 2 === 1) ? (G.playerType === 'fighter' ? 'blob' : 'fighter')
                               : (G.playerType === 'fighter' ? 'fighter' : 'blob');
    aiScale = G.arcade.boss ? 1.95 : (1 + (stage - 1) * 0.22);
    hpBoost = Math.min(80, (stage - 1) * 12);
    persona = personaOrder[Math.min(4, stage - 1)];
    if (G.arcade.boss) startBGM('boss');
    else startBGM('battle');
  }
  const p2c = CHARACTERS[p2Type];
  G.p1 = new Fighter({ x: 140, facing: 1, type: G.playerType, name: p1c.name, hp: p1c.hp, isAI: false, press: pressFrame1 });
  G.p2 = new Fighter({ x: 340, facing: -1, type: p2Type, name: p2c.name, hp: p2c.hp + hpBoost, isAI: true, aiScale, persona, press: pressFrame2 });
  G.projectiles = []; particles = [];
  G.time = G.training ? Infinity : 60;
  G.winner = null; G.roundCause = '';
  G.pausedFrom = null;
  G.trauma = 0; G.zoomPunch = 0; G.impactFlash = 0; G.hitStop = 0; G.comboShow = 0; G.comboT = 0;
  G.slowmo = 1; G.dmgNums = []; G.perfect = false;
  G.introT = 0;
  G.scene = pickScene();
  G.vsTimer = 0;
  G.trialsAllDone = false;
  if (G.training && G.trials) initTrials();   // 每轮复位连段挑战
  G.state = G.training ? 'fight' : ((G.mode === 'vsai' || G.mode === 'arcade') ? 'vs' : 'intro');
  if (!G.training) document.getElementById('trial-panel').classList.add('hidden');
  clearInput();
  document.getElementById('result').classList.add('hidden');
  document.getElementById('pause').classList.add('hidden');
  showTouch();
  document.getElementById('btn-pause').classList.remove('hidden');
}

function resetTrainingPosition() {
  if (!G.training) return;
  startRound();
}

function togglePause() {
  if (G.state === 'paused') {
    G.state = G.pausedFrom || (G.training ? 'fight' : 'intro');
    G.pausedFrom = null;
    document.getElementById('pause').classList.add('hidden');
    showTouch();
    if (G.mode === 'pvp') show2P();
    document.getElementById('btn-pause').classList.remove('hidden');
    if (AC && AC.state === 'suspended') AC.resume();
    return;
  }
  if (G.state === 'fight' || G.state === 'intro') {
    G.pausedFrom = G.state;
    G.state = 'paused';
    clearInput();
    hideTouch();
    document.getElementById('pause').classList.remove('hidden');
    document.getElementById('btn-pause').classList.add('hidden');
    if (AC && AC.state === 'running') AC.suspend();
  }
}

function quitToTitle() {
  G.state = 'title';
  G.training = false;
  G.pausedFrom = null;
  clearInput();
  document.getElementById('pause').classList.add('hidden');
  document.getElementById('btn-pause').classList.add('hidden');
  document.getElementById('trial-panel').classList.add('hidden');
  hideTouch();
  hide2P();
  document.getElementById('result').classList.add('hidden');
  document.getElementById('title').classList.remove('hidden');
  startBGM('menu');
}

function finishRound(winner, cause) {
  if (G.state !== 'fight') return;
  G.winner = winner;
  if (winner) { winner.state = 'win'; winner.stateT = 0; sfx('win'); }
  if (G.training) {
    G.roundCause = cause;
    G.koTimer = 0;
    G.state = 'training-ko';
    sfx('ko'); addTrauma(0.7); G.zoomPunch = 0.3; G.impactFlash = 4;
    return;
  }
  G.roundCause = cause;
  G.koTimer = 0;
  if (winner === G.p1) G.wins.p1++;
  if (winner === G.p2) G.wins.p2++;
  if (cause === 'ko') {
    G.state = 'ko';
    sfx('ko'); addTrauma(0.7); G.zoomPunch = 0.3; G.impactFlash = 4; G.slowmo = 0.3;
    if (winner && winner.hp >= winner.maxHp - 0.5) G.perfect = true; // 满血取胜
  } else {
    G.state = 'timeup';
    addTrauma(0.3);
  }
}

function onKO(winner, loser) {
  finishRound(winner, 'ko');
}

function advanceAfterRound() {
  if (G.training) {
    resetTrainingPosition();
    return;
  }
  if (G.mode === 'arcade') {
    if (!G.winner) { startRound(); return; }            // 平局重赛
    if (G.winner === G.p2) {                   // 挑战失败
      G.matchWinner = G.p2;
      endMatch();
      return;
    }
    G.arcade.score += 1000 + Math.round(G.p1.hp) * 10;
    if (G.arcade.stage >= 5) {                 // 通关
      G.arcade.score += 5000;
      G.matchWinner = G.p1;
      endMatch();
      return;
    }
    G.arcade.stage++;
    G.p1.hp = G.p1.maxHp;                      // 每战回满
    startRound();
    return;
  }
  if (G.wins.p1 >= 2 || G.wins.p2 >= 2) {
    G.matchWinner = G.wins.p1 >= 2 ? G.p1 : G.p2;
    endMatch();
    return;
  }
  // 时间耗尽且血量相等：本回合重赛，不消耗赛点
  if (!G.winner) {
    startRound();
    return;
  }
  G.round++;
  startRound();
}

function endMatch() {
  G.state = 'result';
  document.getElementById('btn-pause').classList.add('hidden');
  hideTouch();
  hide2P();
  stopBGM();
  const rt = document.getElementById('result-text');
  const rd = document.getElementById('result-detail');
  const winner = G.matchWinner;
  if (!winner) {
    rt.textContent = 'DRAW';
    rd.textContent = '平局 — 本局重赛！';
  } else if (G.mode === 'arcade') {
    const cleared = G.matchWinner === G.p1;          // 通关看胜者，不看舞台编号
    if (cleared) G.arcade.score += Math.round(G.p1.hp) * 2;
    if (G.arcade.score > G.arcade.best) {
      G.arcade.best = G.arcade.score;
      try { localStorage.setItem('pixelbrawl_best', String(G.arcade.best)); } catch (e) {}
    }
    const pct = Math.round(G.p1.hp / G.p1.maxHp * 100);
    const grade = pct >= 90 ? 'S' : (pct >= 70 ? 'A' : (pct >= 45 ? 'B' : 'C'));
    rt.textContent = cleared ? 'CLEAR!' : 'GAME OVER';
    const bestTxt = G.arcade.score >= G.arcade.best && G.arcade.score > 0 ? ' · 新纪录!' : '';
    rd.textContent = (cleared ? '街机通关！' : '到达第 ' + Math.max(1, G.arcade.stage) + ' 战') +
      (cleared ? ' · 评级 ' + grade + ' · 幸存 ' + pct + '%' : '') +
      ' · 得分 ' + G.arcade.score + bestTxt + ' · 最佳 ' + G.arcade.best;
  } else if (G.mode === 'pvp') {
    rt.textContent = 'MATCH WIN';
    rd.textContent = (winner === G.p1 ? '1P 获胜！' : '2P 获胜！') + ' · 比分 ' + G.wins.p1 + ' : ' + G.wins.p2;
  } else {
    rt.textContent = 'MATCH WIN';
    rd.textContent = (winner === G.p1 ? '你赢了！' : '阿蓝 获胜') + ' · 比分 ' + G.wins.p1 + ' : ' + G.wins.p2;
  }
  document.getElementById('result').classList.remove('hidden');
}

// ---------- 场景系统（5 套配色主题，街机按阶段切换） ----------
const SCENES = {
  day:     { sky:['#5a7ea6','#a8b89a','#c9b98a'], hill1:'#7d8a6a', hill2:'#96a37e', tree:'#4a7a3a', trunk:'#6b4a2a', ground:'#8a9a5a', ground2:'#7a8a4a', fence:'#8a6a42' },
  evening: { sky:['#3a4a6a','#c98a5a','#e8b07a'], hill1:'#5a6a5a', hill2:'#7a8a6a', tree:'#3a5a3a', trunk:'#5a3a2a', ground:'#9a8a5a', ground2:'#7a6a4a', fence:'#6a5a3a' },
  night:   { sky:['#0a0a2a','#1a1a3a','#0a1224'], hill1:'#2a3a4a', hill2:'#3a4a5a', tree:'#1a3a2a', trunk:'#3a2a1a', ground:'#3a4a3a', ground2:'#2a3a2a', fence:'#4a3a2a', stars:true },
  dojo:    { sky:['#3a2a1a','#5a4a2a','#7a6a3a'], hill1:'#4a3a2a', hill2:'#5a4a2a', tree:'#2a4a2a', trunk:'#4a2a1a', ground:'#6a5a3a', ground2:'#5a4a2a', fence:'#5a3a2a' },
  starry:  { sky:['#0a0a1a','#1a0a2a','#0a0a1a'], hill1:'#2a2a3a', hill2:'#3a2a3a', tree:'#1a2a1a', trunk:'#2a1a1a', ground:'#2a2a3a', ground2:'#1a1a2a', fence:'#3a2a2a', stars:true }
};
const ARCADE_SCENE_ORDER = ['day', 'evening', 'night', 'dojo', 'starry'];

// 动态背景元素（时间驱动，营造视差与生命感）
const _rng = (() => { let s = 99173; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
const CLOUDS = Array.from({ length: 5 }, () => ({ x: _rng() * W, y: 16 + _rng() * 42, w: 34 + _rng() * 46, s: 3 + _rng() * 7 }));
const STARS  = Array.from({ length: 72 }, () => ({ x: _rng() * W, y: _rng() * 118, p: _rng() * 6.28, sp: 1 + _rng() * 2.4 }));
const FIREFL = Array.from({ length: 14 }, () => ({ x: 20 + _rng() * (W - 40), y: 120 + _rng() * 90, p: _rng() * 6.28, sp: .6 + _rng() * 1.1, r: 1 + _rng() * 1.4 }));

// 场景上方的动态层：日月光晕 / 飘云 / 闪烁星 / 萤火 / 摆动的旗
// 前景草叶（浅视差纵深，低成本氛围）
function drawForegroundFX() {
  ctx.fillStyle = 'rgba(18,32,18,.9)';
  for (let i = 0; i < 12; i++) {
    const bx = ((i * 113 + 37) % (W + 30)) - 15;
    const sway = Math.sin(gameTime * 1.6 + i * 1.7) * 2;
    const h = 7 + (i * 5) % 8;
    ctx.fillRect(bx + sway, H - h, 3, h);
    ctx.fillRect(bx + sway + 4, H - h + 3, 2, h - 3);
  }
}

function drawDynamicBG(t) {
  const sc = SCENES[G.scene] || SCENES.day;
  const night = !!sc.stars;
  // 日 / 月光晕
  if (night) {
    const mx = G.scene === 'starry' ? 400 : 96, my = G.scene === 'starry' ? 30 : 40;
    const g = ctx.createRadialGradient(mx, my, 2, mx, my, 30);
    g.addColorStop(0, 'rgba(235,238,255,.95)'); g.addColorStop(.5, 'rgba(200,210,255,.35)'); g.addColorStop(1, 'rgba(200,210,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(mx, my, 30, 0, 7); ctx.fill();
    ctx.fillStyle = '#f3f5ff'; ctx.fillRect(mx - 9, my - 9, 18, 18);
    ctx.fillStyle = sc.sky[0]; ctx.fillRect(mx - 9, my - 9, 7, 18); ctx.fillRect(mx - 9, my - 9, 18, 6);
  } else {
    const sx = G.scene === 'dojo' ? 400 : 70, sy = G.scene === 'dojo' ? 36 : 34;
    const sg = ctx.createRadialGradient(sx, sy, 3, sx, sy, 46);
    const warm = G.scene === 'evening' ? 'rgba(255,180,90,' : 'rgba(255,240,180,';
    sg.addColorStop(0, warm + '.95)'); sg.addColorStop(.4, warm + '.40)'); sg.addColorStop(1, warm + '0)');
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sx, sy, 46, 0, 7); ctx.fill();
    ctx.fillStyle = G.scene === 'evening' ? '#ffd28a' : '#fff4c8'; ctx.fillRect(sx - 8, sy - 8, 16, 16);
  }
  // 飘云（白昼/黄昏），视差慢移
  if (!night) {
    ctx.fillStyle = 'rgba(255,255,255,.42)';
    for (const c of CLOUDS) {
      const x = ((c.x + t * c.s) % (W + 120)) - 60;
      ctx.fillRect(x, c.y, c.w, 7); ctx.fillRect(x + 8, c.y - 4, c.w - 16, 5);
      ctx.fillRect(x + c.w * .3, c.y + 6, c.w * .5, 4);
    }
  }
  // 闪烁星
  if (night) {
    for (const s of STARS) {
      const a = .35 + .55 * (0.5 + 0.5 * Math.sin(t * s.sp + s.p));
      ctx.fillStyle = 'rgba(232,236,255,' + a.toFixed(3) + ')';
      ctx.fillRect(s.x | 0, s.y | 0, 2, 2);
    }
  }
  // 萤火（道场/星空氛围）
  if (G.scene === 'dojo' || G.scene === 'starry') {
    for (const f of FIREFL) {
      const a = .25 + .55 * (0.5 + 0.5 * Math.sin(t * f.sp + f.p));
      ctx.fillStyle = (G.scene === 'dojo' ? 'rgba(255,200,120,' : 'rgba(150,220,255,') + a.toFixed(3) + ')';
      ctx.fillRect((f.x + Math.sin(t * .5 + f.p) * 6) | 0, (f.y + Math.cos(t * .4 + f.p) * 5) | 0, f.r | 0, f.r | 0);
    }
  }
  // 栅栏上的小旗随风摆动
  const fw = Math.sin(t * 3) * 2;
  ctx.fillStyle = '#c23a2a';
  ctx.beginPath();
  ctx.moveTo(W - 30, 196); ctx.lineTo(W - 14 + fw, 200); ctx.lineTo(W - 30, 206); ctx.fill();
}
function pickScene() {
  if (G.mode === 'arcade') return ARCADE_SCENE_ORDER[Math.min(4, G.arcade.stage - 1)];
  return 'day';
}
  // 场景画布缓存（每个主题预渲染一次）
const bgCanvasMap = {};
function buildBG(sceneKey) {
  const sc = SCENES[sceneKey] || SCENES.day;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const b = c.getContext('2d');
  // 天空
  const sky = b.createLinearGradient(0, 0, 0, GROUND);
  sky.addColorStop(0, sc.sky[0]); sky.addColorStop(.6, sc.sky[1]); sky.addColorStop(1, sc.sky[2]);
  b.fillStyle = sky; b.fillRect(0, 0, W, GROUND);
  // 远山
  b.fillStyle = sc.hill1;
  b.beginPath(); b.moveTo(0, GROUND);
  for (let x = 0; x <= W; x += 40) b.lineTo(x, 150 - Math.abs(Math.sin(x*.013))*60);
  b.lineTo(W, GROUND); b.fill();
  b.fillStyle = sc.hill2;
  b.beginPath(); b.moveTo(0, GROUND);
  for (let x = 0; x <= W; x += 30) b.lineTo(x, 185 - Math.abs(Math.sin(x*.02+2))*35);
  b.lineTo(W, GROUND); b.fill();
  // 树
  function tree(x, y, s) {
    b.fillStyle = sc.trunk; b.fillRect(x-2*s, y-14*s, 4*s, 14*s);
    b.fillStyle = sc.tree;
    b.fillRect(x-10*s, y-24*s, 20*s, 10*s);
    b.fillRect(x-7*s, y-30*s, 14*s, 7*s);
  }
  tree(70, 200, 1.6); tree(410, 205, 2.1); tree(250, 198, 1.2);
  // 星光（夜场景）
  if (sc.stars) {
    let seed = 12345;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    b.fillStyle = '#e8e8ff';
    for (let i = 0; i < 60; i++) b.fillRect(Math.floor(rnd()*W), Math.floor(rnd()*120), 2, 2);
  }
  // 地面
  b.fillStyle = sc.ground; b.fillRect(0, GROUND, W, H-GROUND);
  b.fillStyle = sc.ground2;
  for (let x = 0; x < W; x += 8) b.fillRect(x, GROUND + ((x*7)%3)*2, 5, 2);
  b.fillRect(0, GROUND+10, W, 2);
  // 栅栏
  b.fillStyle = sc.fence;
  for (let x = 10; x < W; x += 26) b.fillRect(x, 196, 3, 14);
  b.fillRect(0, 199, W, 2); b.fillRect(0, 205, W, 2);
  return c;
}
function sceneCanvas() {
  const k = G.scene || 'day';
  if (!bgCanvasMap[k]) bgCanvasMap[k] = buildBG(k);
  return bgCanvasMap[k];
}

// ---------- 像素小人绘制 ----------
function px(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }

function drawFighter(f, time) {
  ctx.save();
  ctx.translate(Math.round(f.x), Math.round(f.y));
  ctx.scale(f.facing, 1);
  if (f.flash > 0) ctx.globalAlpha = .5 + Math.sin(time*60)*.4;

  const t = time;
  const bob = f.state === 'idle' ? Math.round(Math.sin(t*4)*1) : 0;
  const S = f.type;

  if (S === 'blob') drawBlob(f, t, bob);
  else drawMartial(f, t, bob);

  if (f.state === 'win') {
    // 胜利姿势：双臂上举（按角色配色）
    const bounce = Math.round(Math.sin(time * 8) * 1) - 4;
    if (f.type === 'blob') {
      px(-12, -58 + bounce, 5, 24, '#3a8ad8'); px(-14, -60 + bounce, 8, 8, '#f4f4f0');
      px(7, -58 + bounce, 5, 24, '#3a8ad8');  px(6, -60 + bounce, 8, 8, '#f4f4f0');
    } else {
      const P = PALS[f.type] || PALS.fighter;
      px(-11, -56 + bounce, 5, 22, P.gi); px(-13, -58 + bounce, 8, 8, P.skin);
      px(7, -56 + bounce, 5, 22, P.gi);  px(6, -58 + bounce, 8, 8, P.skin);
    }
  }

  if (f.blocking || f.state === 'block') {
    // 受击方向的像素护盾
    px(9, -47, 3, 32, 'rgba(130,235,255,.75)');
    px(12, -43, 2, 24, 'rgba(220,255,255,.9)');
  }

  ctx.restore();
}

function drawBlob(f, t, bob) {
  const ko = f.state === 'ko';
  ctx.save();
  if (ko) { ctx.rotate(-Math.PI/2 * Math.min(1, f.stateT*3)); ctx.translate(0, -8); }
  const B = '#3a8ad8', BD = '#2a6aa8', WHT = '#f4f4f0', SK = '#ffcf9e';
  const wobble = f.state === 'walk' ? Math.sin(f.walkPhase)*2 : 0;

  // 脚
  px(-12 + wobble, -4, 10, 5, WHT);
  px(2 - wobble, -4, 10, 5, WHT);
  // 身体（圆胖）
  px(-14, -40+bob, 28, 36, B);
  px(-12, -42+bob, 24, 3, B);
  px(-14, -12, 28, 4, BD);
  // 白肚皮
  px(-8, -26+bob, 16, 20, WHT);
  px(-4, -18+bob, 8, 5, '#e8e8e0');  // 口袋
  // 红项圈
  px(-13, -42+bob, 26, 4, '#d8382a');
  px(9, -40+bob, 4, 4, '#ffe95c');   // 铃铛
  // 头部区域
  px(-13, -58+bob, 26, 18, B);
  // 眼睛
  const eyeY = -54+bob;
  if (f.state === 'hit' || f.state === 'ko') {
    px(-10, eyeY, 6, 2, '#222'); px(-1, eyeY, 6, 2, '#222'); // >< 眼
  } else {
    px(-10, eyeY-3, 8, 9, WHT); px(2, eyeY-3, 8, 9, WHT);
    px(-7, eyeY, 3, 5, '#222'); px(5, eyeY, 3, 5, '#222');
  }
  // 鼻子+胡须
  px(-2, eyeY+8, 5, 4, '#d8382a');
  px(-16, eyeY+7, 8, 1, '#333'); px(-16, eyeY+10, 8, 1, '#333');
  px(9, eyeY+7, 8, 1, '#333');  px(9, eyeY+10, 8, 1, '#333');
  // 嘴
  if (f.state === 'attack' && f.attack === 'special') {
    px(-4, eyeY+13, 9, 6, '#8a3a30'); // 张嘴发射
  } else {
    px(-4, eyeY+13, 9, 2, '#8a3a30');
  }

  // 手臂
  if (f.state === 'attack' && (f.attack === 'punch' || f.attack === 'special')) {
    const ext = f.stateT > .05 ? 1 : 0;
    px(10, -34+bob, 14*ext+6, 6, B);
    px(20+8*ext, -35+bob, 7, 8, WHT); // 拳头
  } else {
    px(-18, -34+bob, 6, 14, B); px(12, -34+bob, 6, 14, B);
    px(-19, -22+bob, 7, 6, WHT); px(12, -22+bob, 7, 6, WHT);
  }
  // 踢腿
  if (f.state === 'attack' && f.attack === 'kick' && f.stateT > .1) {
    px(8, -18, 18, 7, B); px(24, -19, 8, 8, WHT);
  }
  ctx.restore();
}

// 小烈：橙色武道服刺猬头
function drawMartial(f, t, bob) {
  const ko = f.state === 'ko';
  ctx.save();
  if (ko) { ctx.rotate(-Math.PI/2 * Math.min(1, f.stateT*3)); ctx.translate(0, -8); }
  const P = PALS[f.type] || PALS.fighter;
  const SK = P.skin, HAIR = P.hair, GI = P.gi, GI_D = P.gi_d, BLUE = P.belt, ACC = P.accent;

  const legSpread = f.state === 'walk' ? Math.sin(f.walkPhase)*3 : 0;
  // 腿
  px(-8 + legSpread, -14, 6, 14, GI);
  px(2 - legSpread, -14, 6, 14, GI);
  px(-9 + legSpread, -3, 8, 3, '#4a3020'); // 鞋
  px(1 - legSpread, -3, 8, 3, '#4a3020');
  // 躯干
  px(-9, -34+bob, 18, 21, GI);
  px(-9, -20+bob, 18, 3, BLUE);  // 腰带
  px(-9, -34+bob, 18, 4, GI_D);  // 领口阴影
  px(-2, -34+bob, 4, 14, BLUE);  // 内衬
  // 头
  px(-8, -50+bob, 16, 16, SK);
  // 刺猬头
  px(-9, -56+bob, 18, 8, HAIR);
  px(-11, -53+bob, 3, 5, HAIR);
  px(8, -53+bob, 3, 5, HAIR);
  px(-5, -58+bob, 4, 4, HAIR); px(1, -58+bob, 4, 4, HAIR);
  // 头带 + 飘动围巾（影专属）
  if (P.scarf) {
    px(-8, -52+bob, 16, 3, P.accent);
    const fl = Math.sin(t*9 + f.facing)*2;
    px(-9, -36+bob, 9, 4, P.scarf);
    px(-12, -34+bob, 4, 9+fl, P.scarf);
    px(-13, -25+bob+fl, 4, 7, P.scarf);
  }
  // 眉眼
  if (f.state === 'hit' || f.state === 'ko') {
    px(-6, -44+bob, 5, 2, '#222'); px(1, -44+bob, 5, 2, '#222');
  } else if (f.state === 'attack') {
    px(-6, -46+bob, 12, 2, '#a03020'); // 皱眉
    px(-6, -43+bob, 4, 3, '#222'); px(2, -43+bob, 4, 3, '#222');
  } else {
    px(-6, -44+bob, 4, 4, '#222'); px(2, -44+bob, 4, 4, '#222');
  }
  // 嘴
  px(-2, -38+bob, 5, 2, '#a05a40');

  // 手臂
  if (f.state === 'attack' && f.attack === 'punch') {
    const ext = f.stateT > ATTACKS.punch.activeFrom ? 1 : 0;
    px(6, -30+bob, 12+10*ext, 5, GI);
    px(17+10*ext, -31+bob, 6, 6, SK);
  } else if (f.state === 'attack' && f.attack === 'special') {
    // 双手推波
    px(6, -30+bob, 12, 5, GI);
    px(16, -32+bob, 6, 8, SK);
    px(6, -26+bob, 12, 5, GI);
    px(16, -26+bob, 6, 6, SK);
  } else {
    px(-13, -32+bob, 5, 13, GI); px(9, -32+bob, 5, 13, GI);
    px(-14, -20+bob, 6, 5, SK); px(9, -20+bob, 6, 5, SK);
  }
  // 踢腿
  if (f.state === 'attack' && f.attack === 'kick' && f.stateT > ATTACKS.kick.activeFrom) {
    px(2, -18, 22, 6, GI); px(22, -20, 7, 7, '#4a3020');
  }
  ctx.restore();
}

// ---------- HUD ----------
function drawBigPortrait(cx, cy, type) {
  px(cx - 34, cy - 40, 68, 84, '#1a2a44');
  px(cx - 30, cy - 36, 60, 76, '#101c34');
  px(cx - 28, cy - 52, 56, 16, '#22335a');
  ctx.save();
  ctx.translate(cx - 26, cy - 30);
  ctx.scale(2, 2);
  drawPortrait(0, 0, type);
  ctx.restore();
}

function drawVS() {
  ctx.fillStyle = 'rgba(6, 8, 20, .68)'; ctx.fillRect(0, 0, W, H);
  // 双方姓名牌
  ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillStyle = '#fff';
  ctx.fillText(G.p1.name, W * 0.18, 132);
  ctx.fillText(G.p2.name, W * 0.82, 132);
  // 居中 VS 字样（脉动）
  const pulse = 1 + Math.sin(G.vsTimer * 10) * 0.05;
  ctx.save();
  ctx.translate(W / 2, 92); ctx.scale(pulse, pulse);
  ctx.font = 'bold 34px monospace';
  ctx.strokeStyle = '#5c0d00'; ctx.lineWidth = 7;
  ctx.strokeText('VS', 0, 0);
  ctx.fillStyle = '#ffe95c'; ctx.fillText('VS', 0, 0);
  ctx.restore();
  if (G.mode === 'arcade') {
    ctx.font = 'bold 10px monospace'; ctx.fillStyle = G.arcade.boss ? '#ff4b2e' : '#9fd4ff';
    ctx.fillText(G.arcade.boss ? 'FINAL BOSS' : 'STAGE ' + G.arcade.stage + ' / 5', W / 2, 128);
  }
  ctx.font = 'bold 8px monospace'; ctx.fillStyle = '#6a7d92';
  ctx.fillText('按任意键跳过', W / 2, 158);
}

function drawPortrait(x, y, type) {
  ctx.save();
  ctx.translate(x, y);
  if (type === 'blob') {
    px(0,0,26,26,'#2a3a55');
    px(3,3,20,20,'#3a8ad8');
    px(6,8,6,7,'#f4f4f0'); px(14,8,6,7,'#f4f4f0');
    px(8,10,3,4,'#222'); px(16,10,3,4,'#222');
    px(11,17,5,3,'#d8382a');
  } else if (type === 'ninja') {
    px(0,0,26,26,'#2a2a3a');
    px(3,6,20,17,'#e8c9a8');
    px(3,3,20,8,'#0e0e16');
    px(6,12,5,4,'#222'); px(15,12,5,4,'#222');
    px(10,19,6,2,'#a05a40');
    px(3,5,20,2,'#d23a5a'); // 头带
  } else {
    px(0,0,26,26,'#2a3a55');
    px(3,6,20,17,'#ffcf9e');
    px(3,3,20,7,'#22222a');
    px(6,12,5,4,'#222'); px(15,12,5,4,'#222');
    px(10,19,6,2,'#a05a40');
  }
  ctx.restore();
}

function drawHUD() {
  const p1 = G.p1, p2 = G.p2;
  // 血条底（带残血拖尾）
  function bar(x, w, pct, chip, flip) {
    px(x, 8, w, 10, '#1a1a22');
    px(x+1, 9, w-2, 8, '#3a1a10');
    const fw = Math.max(0, Math.round((w-2) * pct));
    const fc = Math.max(fw, Math.round((w-2) * chip));
    const col = pct > .5 ? '#5ad83a' : (pct > .25 ? '#ffd83a' : '#ff4b2e');
    if (flip) {
      px(x+1+(w-2-fc), 9, fc, 8, '#e8d8c8');   // 残血（白）
      px(x+1+(w-2-fw), 9, fw, 8, col);          // 当前血量
    } else {
      px(x+1, 9, fc, 8, '#e8d8c8');
      px(x+1, 9, fw, 8, col);
    }
    px(x+1, 9, fw, 2, 'rgba(255,255,255,.35)'); // 顶部高光
    px(x, 8, w, 2, 'rgba(255,255,255,.25)');
  }
  bar(34, 170, p1.hp / p1.maxHp, p1.chipHp / p1.maxHp, false);
  bar(W-34-170, 170, p2.hp / p2.maxHp, p2.chipHp / p2.maxHp, true);
  // 头像框
  drawPortrait(4, 4, p1.type);
  ctx.save(); ctx.translate(W-30, 0); ctx.scale(-1,1); drawPortrait(0, 4, p2.type); ctx.restore();
  // 名字
  ctx.font = '8px monospace'; ctx.textBaseline = 'top';
  ctx.fillStyle = '#fff'; ctx.textAlign = 'left';
  ctx.fillText(G.mode === 'pvp' ? '1P ' + p1.name : p1.name, 36, 20);
  ctx.textAlign = 'right';
  ctx.fillText((G.mode === 'pvp' ? '2P ' : '') + p2.name, W-36, 20);
  // 能量条与赛点
  function meter(x, w, pct, flip) {
    px(x, 30, w, 4, '#15223a');
    const fw = Math.round((w - 2) * pct);
    const full = pct >= 1;
    px(flip ? x + w - 1 - fw : x + 1, 31, fw, 2, full ? '#ffe95c' : (pct >= .35 ? '#5ccfff' : '#6a70a8'));
    if (full) { px(x, 29, w, 6, 'rgba(255,233,92,.28)'); }
  }
  meter(34, 170, p1.meter / p1.maxMeter, false);
  meter(W-34-170, 170, p2.meter / p2.maxMeter, true);
  if (p1.meter >= p1.maxMeter) {
    ctx.font = 'bold 7px monospace'; ctx.textAlign = 'left'; ctx.fillStyle = '#ffe95c';
    ctx.fillText('MAX!', 36, 36);
  }
  if (p2.meter >= p2.maxMeter) {
    ctx.font = 'bold 7px monospace'; ctx.textAlign = 'right'; ctx.fillStyle = '#ffe95c';
    ctx.fillText('MAX!', W - 36, 36);
  }
  ctx.font = 'bold 8px monospace'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffe95c'; ctx.textAlign = 'left';
  ctx.fillText('●'.repeat(G.wins.p1) + '○'.repeat(2 - G.wins.p1), 36, 40);
  ctx.textAlign = 'right';
  ctx.fillText('●'.repeat(G.wins.p2) + '○'.repeat(2 - G.wins.p2), W - 36, 40);

  // 中央计时（菱形）
  const tleft = Number.isFinite(G.time) ? Math.ceil(G.time) : null;
  ctx.save();
  ctx.translate(W/2, 16); ctx.rotate(Math.PI/4);
  px(-11, -11, 22, 22, '#2a3a55'); px(-9, -9, 18, 18, '#f4f4f0');
  ctx.restore();
  ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = tleft !== null && tleft <= 10 ? '#ff4b2e' : '#222';
  ctx.fillText(tleft === null ? '∞' : String(tleft).padStart(2,'0'), W/2, 17);
  if (G.training) {
    ctx.font = 'bold 7px monospace'; ctx.fillStyle = '#5ccfff';
    ctx.fillText('TRAINING', W / 2, 51);
  }
  // 连击显示（弹跳缩放 + 高连变红）
  if (G.comboShow >= 2 && G.comboT > 0) {
    const right = G.comboSide === 1;
    const cx = right ? W - 40 : 40;
    const txt = G.comboShow + ' HIT' + ' · ' + (right ? G.p1.comboDmg : G.p2.comboDmg) + ' DMG';
    const sx = cx + (right ? -1 : 1) * Math.max(0, 4 - G.comboT * 20);
    const pop = Math.max(0, G.comboT - 0.8) / 0.4;
    ctx.save();
    ctx.translate(sx, 44);
    ctx.scale(1 + pop * 0.5, 1 + pop * 0.5);
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = right ? 'right' : 'left';
    ctx.fillStyle = G.comboShow >= 6 ? '#ff6b2e' : '#ffe95c';
    ctx.strokeStyle = '#8a2a10'; ctx.lineWidth = 3;
    ctx.strokeText(txt, 0, 0);
    ctx.fillText(txt, 0, 0);
    ctx.restore();
  }
}

// ---------- 主循环 ----------
let lastT = 0, gameTime = 0;

function frame(now) {
  GFRAME++;
  const rawDt = Math.min(.05, (now - lastT) / 1000 || 0);
  lastT = now;
  gameTime += rawDt;

  if (G.state === 'title') { drawTitleBG(); return; }
  if (G.state === 'result') { render(rawDt); return; }
  if (G.state === 'paused') { render(0); return; }

  let dt = rawDt;
  if (G.hitStop > 0) { G.hitStop -= rawDt; dt = 0; } // 命中停帧
  if (G.slowmo < 1) G.slowmo = Math.min(1, G.slowmo + rawDt * 0.85); // 慢动作回升（KO 仪式感约 0.9s）
  if (G.slowmo < 1 && dt > 0) dt *= G.slowmo;

  if (G.state === 'vs') {
    G.vsTimer += rawDt;
    G.p1.update(dt, G.p2, NO_INPUT);
    G.p2.update(dt, G.p1, NO_INPUT);
    const skip = Object.values(input).some(v => v);
    if (G.vsTimer >= 1.6 || (skip && G.vsTimer > 0.25)) { G.state = 'intro'; G.introT = 0; }
  } else if (G.state === 'intro') {
    G.introT += rawDt;
    if (G.introT >= 1.35) G.state = 'fight';
    G.p1.update(dt, G.p2, NO_INPUT);
    G.p2.update(dt, G.p1, NO_INPUT);
  } else if (G.state === 'fight') {
    G.time -= dt;
    if (G.time <= 0) {
      G.time = 0;
      const winner = G.p1.hp === G.p2.hp ? null : (G.p1.hp > G.p2.hp ? G.p1 : G.p2);
      finishRound(winner, 'timeup');
    } else {
      G.p1.update(dt, G.p2, input);
      G.p2.update(dt, G.p1, G.training ? NO_INPUT : (G.mode === 'pvp' ? input2 : G.p2.aiInput(dt, G.p1)));
      if (G.training) updateTrials();
    }
  } else if (G.state === 'ko' || G.state === 'training-ko' || G.state === 'timeup') {
    G.koTimer += rawDt;
    G.p1.update(dt, G.p2, NO_INPUT);
    G.p2.update(dt, G.p1, NO_INPUT);
    const settleTime = G.state === 'ko' ? 2.2 : (G.state === 'training-ko' ? 1.1 : 1.35);
    if (G.koTimer > settleTime) advanceAfterRound();
  }

  // 飞行道具
  for (const p of G.projectiles) {
    p.x += p.vx * dt; p.life -= dt;
    const foe = p.owner === G.p1 ? G.p2 : G.p1;
    const fb = foe.hurtbox;
    if (foe.state !== 'ko' && p.x + p.r > fb.x && p.x - p.r < fb.x + fb.w && p.y + p.r > fb.y && p.y - p.r < fb.y + fb.h) {
      if (p.super) spawnSuperBurst(fb.x + fb.w/2, fb.y + fb.h/2);
      foe.takeHit(p.dmg, Math.sign(p.vx), 130, p.owner);
      p.life = 0;
    }
  }
  G.projectiles = G.projectiles.filter(p => p.life > 0 && p.x > -20 && p.x < W + 20);

  // 粒子（随慢动作一起减速，强化电影感）
  for (const pt of particles) { pt.t += dt; pt.x += (pt.vx || 0) * dt; pt.y += (pt.vy || 0) * dt;
    if (pt.kind === 'dust') { pt.vx *= Math.pow(.05, dt); pt.vy *= Math.pow(.2, dt); } // 尘土悬浮减速
    else pt.vy += 300 * dt; }
  particles = particles.filter(pt => pt.t < pt.life);
  // 浮动伤害数字
  for (const d of G.dmgNums) { d.t += dt; d.y += d.vy * dt; d.vy += 70 * dt; }
  G.dmgNums = G.dmgNums.filter(d => d.t < d.life);

  // 连击显示计时
  const lastCombo = Math.max(G.p1.combo, G.p2.combo);
  if (lastCombo >= 2) {
    if (lastCombo !== G.comboShow) { G.comboShow = lastCombo; G.comboT = 1.2; G.comboSide = G.p1.combo >= G.p2.combo ? 1 : 2; }
  }
  G.comboT -= rawDt;
  if (G.comboT <= 0) { G.comboShow = 0; G.p1.combo = 0; G.p2.combo = 0; G.p1.comboDmg = 0; G.p2.comboDmg = 0; }

  G.trauma = Math.max(0, G.trauma - rawDt * 1.5);
  G.zoomPunch = Math.max(0, G.zoomPunch - rawDt);
  G.impactFlash = Math.max(0, G.impactFlash - 1);
  render(rawDt);
}

function drawTitleBG() {
  ctx.drawImage(sceneCanvas(), 0, 0);
  drawDynamicBG(gameTime);
  ctx.fillStyle = 'rgba(0,0,0,.34)'; ctx.fillRect(0,0,W,H);
  drawScreenFX();
}

function render(dt) {
  ctx.save();
  // trauma² 震动：平滑正弦噪声替代逐帧纯随机，横向为主（方向性）
  const tr2 = G.trauma * G.trauma;
  if (tr2 > 0.0004) {
    const mag = tr2 * 7; // 480×270 下最大约 7px
    ctx.translate(Math.sin(gameTime * 91.7) * mag, Math.cos(gameTime * 113.3) * mag * 0.55);
  }
  // 重击推镜：1.03–1.06×，ease-out 回正
  if (G.zoomPunch > 0) {
    const zp = Math.min(1, G.zoomPunch / 0.3);
    const zs = 1 + 0.06 * zp * zp;
    ctx.translate(W / 2, H / 2); ctx.scale(zs, zs); ctx.translate(-W / 2, -H / 2);
  }

  ctx.drawImage(sceneCanvas(), 0, 0);
  drawDynamicBG(gameTime);

  if (G.p1 && G.p2) {
    // 影子
    for (const f of [G.p1, G.p2]) {
      const sw = f.onGround ? 26 : 18;
      ctx.fillStyle = 'rgba(0,0,0,.3)';
      ctx.beginPath(); ctx.ellipse(f.x, GROUND+3, sw, 4, 0, 0, 7); ctx.fill();
    }
    // 后画的在上
    drawFighter(G.p2, gameTime);
    drawFighter(G.p1, gameTime);
    // 飞行道具（波动拳 / 超必杀金波 / 手里剑）
    for (const p of G.projectiles) {
      const r = p.r;
      if (p.super) {
        px(p.x - r, p.y - r - 1, r*2, r*2, '#ffd83a');
        px(p.x - r+2, p.y - r+1, r*2-4, r*2-4, '#ffe95c');
        px(p.x - r+4, p.y - r+3, (r*2-8), (r*2-8), '#fff8d0');
        // 金色拖尾
        ctx.fillStyle = 'rgba(255,220,80,.55)';
        ctx.fillRect(p.x - Math.sign(p.vx)*r*2 - r*1.5, p.y - 5, r*3, 10);
        ctx.fillRect(p.x - Math.sign(p.vx)*r*3 - r*2, p.y - 3, r*3, 6);
      } else if (p.skin === 'shuriken') {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(gameTime * 18); ctx.fillStyle = '#dfe8ff';
        for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI/2); ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(-2,-r-2); ctx.lineTo(2,-r-2); ctx.closePath(); ctx.fill(); }
        px(-2, -2, 4, 4, '#5ccfff'); ctx.restore();
      } else {
        px(p.x - r, p.y - r, r*2, r*2, '#7ad8ff');
        px(p.x - r+2, p.y - r+2, r*2-4, r*2-4, '#c8ecff');
        px(p.x - r+4, p.y - r+4, r, r, '#ffffff');
        // 拖尾
        px(p.x - Math.sign(p.vx)*r*2 - r/2, p.y - 3, r, 6, 'rgba(122,216,255,.4)');
      }
    }
    // 粒子（分类渲染：火花 / 冲击星 / 冲击波）
    for (const pt of particles) {
      const k = 1 - pt.t / pt.life;
      ctx.globalAlpha = k;
      if (pt.kind === 'ring') {
        const r = pt.r0 + (pt.r1 - pt.r0) * (pt.t / pt.life);
        ctx.strokeStyle = pt.c; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(pt.x, pt.y, r, 0, 7); ctx.stroke();
      } else if (pt.kind === 'star') {
        const s = pt.s * (0.6 + 0.4 * (pt.t / pt.life));
        drawStar(pt.x, pt.y, s, pt.rot || 0, pt.c);
      } else if (pt.kind === 'arc') {
        // 踢技方向性弧光：沿出招方向的短弧，加色发光
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = pt.c; ctx.lineWidth = 3;
        ctx.beginPath();
        if (pt.dir > 0) ctx.arc(pt.x, pt.y, pt.r, -1.1, 1.1);
        else ctx.arc(pt.x, pt.y, pt.r, Math.PI - 1.1, Math.PI + 1.1);
        ctx.stroke(); ctx.restore();
      } else {
        px(pt.x, pt.y, pt.s, pt.s, pt.c);
      }
      ctx.globalAlpha = 1;
    }
    drawHUD();
    // 浮动伤害数字
    for (const d of G.dmgNums) {
      ctx.globalAlpha = Math.min(1, d.life * 2);
      const fs = 10 + Math.min(8, d.val / 5);
      ctx.font = 'bold ' + fs.toFixed(0) + 'px monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = d.c; ctx.strokeStyle = 'rgba(0,0,0,.65)'; ctx.lineWidth = 3;
      ctx.strokeText(d.val, d.x, d.y); ctx.fillText(d.val, d.x, d.y);
    }
    ctx.globalAlpha = 1;
    // 冲击闪光（重击 / 超必杀 1–4f 全屏提亮）
    if (G.impactFlash > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,244,200,' + (0.30 * Math.min(1, G.impactFlash / 2)).toFixed(3) + ')';
      ctx.fillRect(-8, -8, W + 16, H + 16); // 覆盖震动/推镜位移边缘
      ctx.restore();
    }
    drawForegroundFX();
  }

  // 回合标识与倒计时提示
  ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillStyle = '#fff';
  ctx.fillText('ROUND ' + G.round + (G.mode === 'arcade' ? ' · STAGE ' + G.arcade.stage + (G.arcade.boss ? ' FINAL' : '/5') : ''), W / 2, 32);
  if (G.mode === 'arcade' && G.state !== 'intro') {
    ctx.fillStyle = '#9fd4ff';
    ctx.fillText('SCORE ' + G.arcade.score + ' · BEST ' + G.arcade.best, W / 2, 44);
  }
  if (G.state === 'intro') {
    const introText = G.introT < .7 ? 'READY' : 'FIGHT!';
    ctx.font = 'bold 24px monospace';
    ctx.strokeStyle = '#5c0d00'; ctx.lineWidth = 4; ctx.strokeText(introText, W / 2, 85);
    ctx.fillStyle = G.introT < .7 ? '#ffe95c' : '#ff6b2e';
    ctx.fillText(introText, W / 2, 85);
  }
  if (G.state === 'timeup') {
    ctx.font = 'bold 20px monospace'; ctx.strokeStyle = '#24344a'; ctx.lineWidth = 4;
    ctx.strokeText('TIME UP', W / 2, 90); ctx.fillStyle = '#fff'; ctx.fillText('TIME UP', W / 2, 90);
  }

  // VS 对决面板
  if (G.state === 'vs') { drawBigPortrait(W * 0.18, 60, G.p1.type); drawBigPortrait(W * 0.82, 60, G.p2.type); drawVS(); }

  // KO 大字
  if (G.state === 'ko' || G.state === 'training-ko') {
    const scale = Math.min(1, G.koTimer * 4);
    ctx.save();
    ctx.translate(W/2, H/2 - 20);
    ctx.scale(scale, scale);
    ctx.font = 'bold 56px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#5c0d00'; ctx.lineWidth = 8; ctx.strokeText('K.O.', 0, 0);
    ctx.fillStyle = '#ff4b2e'; ctx.fillText('K.O.', 0, 0);
    if (G.perfect) {
      ctx.font = 'bold 18px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.strokeStyle = '#5c0d00'; ctx.lineWidth = 4;
      ctx.strokeText('PERFECT', 0, -42); ctx.fillStyle = '#ffe95c'; ctx.fillText('PERFECT', 0, -42);
    }
    ctx.restore();
  }

  ctx.restore();
  drawScreenFX();
}

// CRT 后期：扫描线 + 暗角 + 边缘暖光（复古街机质感）
function drawScreenFX() {
  ctx.globalAlpha = 0.10; ctx.fillStyle = '#000';
  for (let y = 0; y < H; y += 2) ctx.fillRect(0, y, W, 1);
  ctx.globalAlpha = 1;
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.78);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.36)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,150,60,0.05)'; ctx.fillRect(0, 0, W, 3);
}

// ---------- 启动 ----------
document.getElementById('btn-start').addEventListener('click', () => {
  document.getElementById('title').classList.add('hidden');
  startMatch('vsai');
});
document.getElementById('btn-pvp').addEventListener('click', () => {
  document.getElementById('title').classList.add('hidden');
  startMatch('pvp');
});
document.getElementById('btn-arcade').addEventListener('click', () => {
  document.getElementById('title').classList.add('hidden');
  startMatch('arcade');
});
document.getElementById('btn-training').addEventListener('click', () => {
  document.getElementById('title').classList.add('hidden');
  startTraining();
});
document.getElementById('btn-rematch').addEventListener('click', () => {
  if (G.mode === 'train') startTraining();
  else startMatch(G.mode);
});
document.getElementById('btn-pause').addEventListener('click', togglePause);
document.getElementById('btn-mute').addEventListener('click', toggleMute);
document.getElementById('btn-resume').addEventListener('click', togglePause);
document.getElementById('btn-restart').addEventListener('click', () => {
  if (G.training) startTraining();
  else startRound();
});
document.getElementById('btn-quit').addEventListener('click', quitToTitle);

// 角色选择
function selectCharacter(type) {
  G.playerType = type;
  document.getElementById('char-fighter').classList.toggle('selected', type === 'fighter');
  document.getElementById('char-blob').classList.toggle('selected', type === 'blob');
  document.getElementById('char-ninja').classList.toggle('selected', type === 'ninja');
}
document.getElementById('char-fighter').addEventListener('click', () => selectCharacter('fighter'));
document.getElementById('char-blob').addEventListener('click', () => selectCharacter('blob'));
document.getElementById('char-ninja').addEventListener('click', () => selectCharacter('ninja'));

// 难度选择
function selectDifficulty(level) {
  G.difficulty = level;
  ['easy','normal','hard'].forEach(k =>
    document.getElementById('diff-'+k).classList.toggle('selected', k === level));
}
document.getElementById('diff-easy').addEventListener('click', () => selectDifficulty('easy'));
document.getElementById('diff-normal').addEventListener('click', () => selectDifficulty('normal'));
document.getElementById('diff-hard').addEventListener('click', () => selectDifficulty('hard'));

// 循环启动：rAF 若不触发（部分 WebView 会挂起）自动降级 setInterval
(function startLoop() {
  let rafOk = false;
  try {
    requestAnimationFrame(() => { rafOk = true; });
  } catch(e) {}
  setTimeout(() => {
    if (rafOk) {
      const loop = now => { frame(now); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
      console.log('loop: rAF');
    } else {
      let vt = performance.now();
      setInterval(() => { vt += 1000 / 30; frame(vt); }, 1000 / 30);
      console.log('loop: setInterval fallback');
    }
  }, 350);
})();

// 仅在显式 debug 查询参数下暴露测试句柄
if (location.search.includes('debug=1')) {
  window.G = G; window.input = input; window.Fighter = Fighter;
  // 输入监视器：实时显示 1P/2P 各键的识别状态（帮助定位按键问题）
  const mon = document.getElementById('inp-monitor');
  if (mon) {
    mon.classList.remove('hidden');
    const K = [['left','◀'],['right','▶'],['jump','跳'],['block','防'],['punch','拳'],['kick','脚'],['special','波']];
    mon.innerHTML = '<span>1P</span>' + K.map(k => '<b id="im-' + k[0] + '">' + k[1] + '</b>').join(' ') +
      '<br><span>2P</span>' + K.map(k => '<b id="im2-' + k[0] + '">' + k[1] + '</b>').join(' ');
    const els = {}, els2 = {};
    K.forEach(k => { els[k[0]] = document.getElementById('im-' + k[0]); els2[k[0]] = document.getElementById('im2-' + k[0]); });
    setInterval(() => {
      K.forEach(k => { els[k[0]].className = input[k[0]] ? 'on' : ''; els2[k[0]].className = input2[k[0]] ? 'on' : ''; });
    }, 80);
  }
}

// ===== 内置自检：autotest=1 时自动跑双人断言，结果写入 document.title =====
if (location.search.includes('autotest=1')) {
  window.G = G; window.input = input; window.input2 = input2;
  (async function autoTest() {
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const log = [];
    const mark = (name, ok, extra) => log.push((ok ? 'PASS' : 'FAIL') + ' ' + name + (extra ? ' ' + extra : ''));
    window.onerror = (m, s, l, c) => { log.push('ERR ' + m + '@' + l + ':' + c); };
    try {
      let rafN = 0;
      const probe = () => { rafN++; requestAnimationFrame(probe); };
      requestAnimationFrame(probe);
      await wait(1000);
      mark('headless_fps', rafN >= 30, 'rAF=' + rafN + '/1s');
      await wait(400);
      document.getElementById('btn-pvp').click();
      await wait(400);
      mark('pvp_mode', G.mode === 'pvp', 'mode=' + G.mode);
      await wait(3200); // intro 1.35s 后 fight
      mark('fight_start', G.state === 'fight', 'state=' + G.state);

      // 2P 键盘：← 持续 700ms
      const x0 = Math.round(G.p2.x);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      await wait(700);
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowLeft', bubbles: true }));
      mark('p2_move_left', G.p2.x < x0 - 3, x0 + '->' + Math.round(G.p2.x));

      // 2P 键盘：4=拳（断言攻击真实建立：state==='attack'）
      G.p2.state = 'idle'; G.p2.attack = null; G.p2.cd.punch = 0; G.p2.buf = { punch: 0, kick: 0, special: 0 }; G.p2.prev = { punch: false, kick: false, special: false };
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '4', bubbles: true }));
      await wait(90);
      mark('p2_punch_key', G.p2.state === 'attack' && G.p2.attack === 'punch', 'atk=' + G.p2.attack + ' st=' + G.p2.state);
      window.dispatchEvent(new KeyboardEvent('keyup', { key: '4', bubbles: true }));
      await wait(260);
      mark('p2_punch_done', G.p2.state !== 'attack', 'st=' + G.p2.state);

      // 1P 键盘：A 移动 + J 拳 联动（断言攻击真实建立）
      G.p1.state = 'idle'; G.p1.attack = null; G.p1.cd.punch = 0; G.p1.buf = { punch: 0, kick: 0, special: 0 }; G.p1.prev = { punch: false, kick: false, special: false };
      const p1x = Math.round(G.p1.x);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', bubbles: true }));
      await wait(100);
      const p1React = { attack: G.p1.attack, state: G.p1.state };
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'j', bubbles: true }));
      await wait(250);
      mark('p1_move_punch', p1React.state === 'attack' && p1React.attack === 'punch', 'atk=' + p1React.attack + ' st=' + p1React.state);

      // —— BGM 音序器断言 ——
      mark('bgm_playing', BGM_STATE.on === true, 'song=' + BGM_STATE.song);
      const step0 = BGM_STATE.step;
      await wait(500);
      mark('bgm_advancing', BGM_STATE.step > step0, step0 + '->' + BGM_STATE.step + ' ac=' + (AC ? AC.state : 'none'));

      // 暂停 → 音频挂起；恢复 → 运行
      document.getElementById('btn-pause').click();
      await wait(150);
      mark('pause_audio', !AC || AC.state === 'suspended', AC ? AC.state : 'noAC');
      document.getElementById('btn-resume').click();
      await wait(150);
      mark('resume_audio', !AC || AC.state === 'running', AC ? AC.state : 'noAC');

      // 静音切换
      document.getElementById('btn-mute').click();
      await wait(200);
      mark('mute_off', BGM_STATE.on === false, 'muted=' + document.getElementById('btn-mute').dataset.muted);
      document.getElementById('btn-mute').click();
      await wait(200);
      mark('mute_on', BGM_STATE.on === true, 'muted=' + document.getElementById('btn-mute').dataset.muted);

      // 2P 触屏键：强制显示两层容器（桌面 IS_TOUCH=false 时隐藏，跳过环境限制测委托逻辑）
      document.getElementById('touch').classList.remove('hidden');
      document.getElementById('tc-2p').classList.remove('hidden');
      await wait(100);
      const kickEl = document.querySelector('.tk2[data-k="kick"]');
      const kr = kickEl ? kickEl.getBoundingClientRect() : null;
      mark('p2_touch_el', !!kickEl && !!kr && kr.width > 0 && kr.height > 0,
        'rect=' + (kr ? Math.round(kr.left) + ',' + Math.round(kr.top) + ',' + Math.round(kr.width) + 'x' + Math.round(kr.height) : 'null'));
      kickEl.dispatchEvent(
        new PointerEvent('pointerdown', { pointerId: 1, bubbles: true, cancelable: true,
          clientX: kr.left + kr.width / 2, clientY: kr.top + kr.height / 2 }));
      await wait(120);
      mark('p2_touch_bind', input2.kick === true, 'inp2.kick=' + input2.kick);
      kickEl.dispatchEvent(
        new PointerEvent('pointerup', { pointerId: 1, bubbles: true, cancelable: true }));

      // —— 触屏快速连点 / 双指独立断言 ——
      const tEl = document.getElementById('touch');
      const rc2 = (k) => { const r = tEl.querySelector('.tk[data-k="' + k + '"]').getBoundingClientRect(); return { x: r.left + r.width/2, y: r.top + r.height/2 }; };
      const pd = (id, k) => tEl.dispatchEvent(new PointerEvent('pointerdown', { pointerId: id, bubbles: true, cancelable: true, clientX: rc2(k).x, clientY: rc2(k).y }));
      const pu = (id) => tEl.dispatchEvent(new PointerEvent('pointerup', { pointerId: id, bubbles: true, cancelable: true }));
      // 同 id 快速连打（模拟偶发丢失 pointerup 场景，每次按下都须生效）
      const pr = rc2('punch');
      mark('tap_rect', pr.x > 0 && pr.y > 0, Math.round(pr.x) + ',' + Math.round(pr.y));
      pd(77, 'punch'); const tap1 = input.punch;
      pd(77, 'punch'); const tap2 = input.punch;   // 无 up 直接再 down：应重置并保持 true
      pd(77, 'punch'); const tap3 = input.punch;
      mark('tap_same_id', tap1 && tap2 && tap3, [tap1, tap2, tap3].join(','));
      pu(77);
      mark('tap_release', !input.punch, 'p=' + input.punch);
      // 双指独立（id 71 左 + id 72 拳 同时）
      pd(71, 'left'); pd(72, 'punch');
      mark('two_fingers', input.left && input.punch, 'L=' + input.left + ' P=' + input.punch);
      pu(71); pu(72);
      mark('two_up', !input.left && !input.punch, 'L=' + input.left + ' P=' + input.punch);

      // —— 街机模式断言 ——
      document.getElementById('btn-quit').click();        // 回到标题
      await wait(300);
      document.getElementById('btn-arcade').click();
      await wait(400);
      mark('arcade_mode', G.mode === 'arcade' && G.arcade.stage === 1, 'stage=' + G.arcade.stage);
      mark('arcade_scale1', G.p2.aiScale === 1, 'scale=' + G.p2.aiScale + ' p2hp=' + G.p2.hp);
      mark('arcade_persona1', G.p2.persona === 'balance' && G.arcade.boss === false, 'p=' + G.p2.persona);
      mark('vs_state', G.state === 'vs', 'state=' + G.state);
      mark('vs_scene_day', G.scene === 'day', 'scene=' + G.scene);
      await wait(1900);                                    // VS 横幅 1.6s 后进 intro
      mark('vs_done', G.state === 'intro' || G.state === 'fight', 'state=' + G.state);

      // 前置工具：p2 被打倒 → 本战胜利
      const koP2 = () => {
        G.state = 'fight'; G.p1.x = 300; G.p2.x = 320; G.p1.facing = 1; G.p2.facing = -1;
        G.p1.state = 'idle'; G.p1.attack = null; G.p1.cd.kick = 0;
        G.p2.state = 'idle'; G.p2.attack = null; G.p2.hp = 1; G.p2.blocking = false;
        G.p1.startAttack('kick');
        for (let i = 0; i < 30; i++) G.p1.update(.02, G.p2, { left:false, right:false, jump:false, block:false, punch:false, kick:false, special:false });
        const s = G.state, w = G.p1.state;   // 记录 KO 态与胜利姿势（advance 前）
        G.koTimer = 2.3; advanceAfterRound();
        return { koAfter: s, winState: w };
      };

      // 打赢第一战 → 第二战且回满血、对手强化
      const r1 = koP2();
      mark('win_pose', r1.winState === 'win', 'p1state=' + r1.winState);
      mark('arcade_next_stage', r1.koAfter === 'ko' && G.arcade.stage === 2 && G.p1.hp === G.p1.maxHp,
        'stage=' + G.arcade.stage + ' hp=' + Math.round(G.p1.hp) + ' scale=' + G.p2.aiScale + ' p2hp=' + G.p2.hp);
      mark('arcade_scene2', G.scene === 'evening', 'scene=' + G.scene);
      mark('arcade_persona2', G.p2.persona === 'rush' && !G.arcade.boss, 'p=' + G.p2.persona + ' scale=' + G.p2.aiScale);

      // 推进 3/4/5 战：人格与 Boss 战验证
      koP2(); mark('arcade_persona3', G.arcade.stage === 3 && G.p2.persona === 'guard' && !G.arcade.boss,
        'stage=' + G.arcade.stage + ' p=' + G.p2.persona);
      koP2(); mark('arcade_persona4', G.arcade.stage === 4 && G.p2.persona === 'rush' && !G.arcade.boss,
        'stage=' + G.arcade.stage + ' p=' + G.p2.persona);
      koP2();
      mark('arcade_boss', G.arcade.stage === 5 && G.arcade.boss === true && G.p2.persona === 'bossRush' &&
        G.p2.aiScale >= 1.9 && G.p2.hp === 173 && G.p2.maxHp === 173 && BGM_STATE.song === 'boss',
        'stage=' + G.arcade.stage + ' boss=' + G.arcade.boss + ' p=' + G.p2.persona + ' scale=' + G.p2.aiScale +
        ' hp=' + G.p2.hp + '/' + G.p2.maxHp + ' song=' + BGM_STATE.song);

      // Boss 战失败 → GAME OVER 结算 + 最佳纪录保存
      G.state = 'fight'; G.p1.x = 300; G.p2.x = 320; G.p1.facing = 1; G.p2.facing = -1;
      G.p1.state = 'idle'; G.p1.attack = null; G.p1.hp = 1;
      G.p2.state = 'idle'; G.p2.attack = null; G.p2.hp = 180; G.p2.blocking = false; G.p2.cd.kick = 0;
      G.p2.startAttack('kick');
      for (let i = 0; i < 30; i++) G.p2.update(.02, G.p1, { left:false, right:false, jump:false, block:false, punch:false, kick:false, special:false });
      G.koTimer = 2.3; advanceAfterRound();
      mark('arcade_gameover', G.state === 'result' && document.getElementById('result-text').textContent === 'GAME OVER',
        document.getElementById('result-text').textContent + ' | ' + document.getElementById('result-detail').textContent);
      mark('arcade_best', G.arcade.best > 0, 'best=' + G.arcade.best + ' score=' + G.arcade.score);

      // —— 连段挑战断言（训练模式） ——
      const kd = (k) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
      const ku = (k) => window.dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true }));
      const resetP1 = () => { G.p1.state = 'idle'; G.p1.attack = null; G.p1.cd.punch = 0; G.p1.cd.kick = 0; G.p1.cd.special = 0;
        G.p1.buf = { punch: 0, kick: 0, special: 0 }; G.p1.prev = { punch: false, kick: false, special: false }; G.p1.atkLog = []; };
      document.getElementById('btn-quit').click();
      await wait(300);
      document.getElementById('btn-training').click();
      await wait(400);
      mark('trial_panel', !document.getElementById('trial-panel').classList.contains('hidden') && G.trials && G.trials.length === 3,
        'trials=' + (G.trials ? G.trials.length : 0));

      // 第一关：三段连击 J·J·J（时间线探针）
      resetP1();
      const tl = [];
      const tlId = setInterval(() => { if (tl.length < 16) tl.push(G.p1.attack + '@' + Math.round(G.p1.stateT * 1000) + ':' + G.p1.state); }, 30);
      kd('j'); await wait(170); ku('j'); await wait(10);
      kd('j'); await wait(170); ku('j'); await wait(10);
      kd('j'); await wait(200); ku('j'); await wait(420);
      clearInterval(tlId);
      mark('trial_combo1', G.trials[0].done === true, 'log=' + G.p1.atkLog.join('>'));

      // 第二关：拳→脚取消 J·K
      resetP1();
      kd('j'); await wait(200); ku('j'); await wait(90);
      kd('k'); await wait(260); ku('k'); await wait(340);
      mark('trial_cancel', G.trials[1].done === true, G.p1.atkLog.slice(-3).join('>'));

      // 第三关：拳→超必杀（满能量 J·L）
      resetP1(); G.p1.meter = 100;
      kd('j'); await wait(200); ku('j'); await wait(90);
      kd('l'); await wait(240); ku('l'); await wait(360);
      mark('trial_super', G.trials[2].done === true, G.p1.atkLog.slice(-3).join('>'));
      mark('trial_all', G.trials.every(t => t.done), 'done=' + G.trials.filter(t => t.done).length);
    } catch (e) { log.push('ERROR ' + e.message); }
    document.title = 'AUTOTEST|' + log.join('|');
  })();
}