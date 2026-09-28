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

