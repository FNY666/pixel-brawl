// ===== 像素乱斗 PIXEL BRAWL · 特效（粒子 / 闪光）=====
'use strict';

let particles = [];

// 命中火花
function spawnSparks(x, y, dir, guarded = false) {
  for (let i = 0; i < 10; i++) {
    particles.push({ x, y, vx: dir * rand(30,160) + rand(-40,40), vy: rand(-120,40),
      life: rand(.15,.35), t: 0, c: guarded ? (Math.random() < .5 ? '#b8f6ff' : '#5ccfff') : (Math.random() < .5 ? '#ffe95c' : '#ff8b2e'), s: irand(2,4) });
  }
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
  G.shake = Math.max(G.shake, 5);
}

// 超必杀释放金光
function goldenFlash() {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;z-index:30;pointer-events:none;' +
    'background:radial-gradient(ellipse at center,rgba(255,240,150,.85),rgba(255,180,40,.35) 45%,transparent 75%);' +
    'animation:goldfade .5s ease-out forwards;';
  document.head.appendChild(document.createElement('style')).textContent =
    '@keyframes goldfade{from{opacity:1}to{opacity:0}}';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 520);
}
