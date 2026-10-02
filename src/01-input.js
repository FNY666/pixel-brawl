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

