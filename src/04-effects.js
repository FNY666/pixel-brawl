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

