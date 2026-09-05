// ===== 像素乱斗 PIXEL BRAWL · 渲染（像素小人 / 头像 / HUD / VS / KO）=====
'use strict';

// ---------- 像素小人绘制 ----------
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
      px(-11, -56 + bounce, 5, 22, '#ff8b2e'); px(-13, -58 + bounce, 8, 8, '#ffcf9e');
      px(7, -56 + bounce, 5, 22, '#ff8b2e');  px(6, -58 + bounce, 8, 8, '#ffcf9e');
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
  const SK = '#ffcf9e', HAIR = '#22222a', GI = '#ff8b2e', GI_D = '#d86a18', BLUE = '#3a6ad8';

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
  // 血条底
  function bar(x, w, pct, flip) {
    px(x, 8, w, 10, '#1a1a22');
    px(x+1, 9, w-2, 8, '#3a1a10');
    const fw = Math.round((w-2) * pct);
    if (pct > .5) px(flip ? x+1+(w-2-fw) : x+1, 9, fw, 8, '#5ad83a');
    else if (pct > .25) px(flip ? x+1+(w-2-fw) : x+1, 9, fw, 8, '#ffd83a');
    else px(flip ? x+1+(w-2-fw) : x+1, 9, fw, 8, '#ff4b2e');
    px(x, 8, w, 2, 'rgba(255,255,255,.25)');
  }
  bar(34, 170, p1.hp / p1.maxHp, false);
  bar(W-34-170, 170, p2.hp / p2.maxHp, true);
  // 头像框
  drawPortrait(4, 4, 'fighter');
  ctx.save(); ctx.translate(W-30, 0); ctx.scale(-1,1); drawPortrait(0, 4, 'blob'); ctx.restore();
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
  // 连击显示
  if (G.comboShow >= 2 && G.comboT > 0) {
    ctx.save();
    ctx.font = 'bold 16px monospace'; ctx.textAlign = 'right';
    const cx = G.comboSide === 1 ? W - 40 : 40;
    ctx.textAlign = G.comboSide === 1 ? 'right' : 'left';
    ctx.fillStyle = '#ffe95c';
    ctx.strokeStyle = '#8a2a10'; ctx.lineWidth = 3;
    const txt = G.comboShow + ' HIT' + ' · ' + (G.comboSide === 1 ? G.p1.comboDmg : G.p2.comboDmg) + ' DMG';
    const sx = cx + (G.comboSide===1?-1:1) * Math.max(0, 4 - G.comboT*20);
    ctx.strokeText(txt, sx, 44);
    ctx.fillText(txt, sx, 44);
    ctx.restore();
  }
}
