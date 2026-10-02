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

