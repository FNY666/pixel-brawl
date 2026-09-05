// ===== 像素乱斗 PIXEL BRAWL · 全局状态 + 回合/比赛流程 + 主循环 =====
'use strict';

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
  shake: 0,
  hitStop: 0,
  projectiles: [],
  comboShow: 0, comboSide: 1, comboT: 0,
  p1: null, p2: null
};

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
  G.p1 = new Fighter({ x: 140, facing: 1, type: G.playerType, name: p1c.name, hp: p1c.hp, isAI: false });
  G.p2 = new Fighter({ x: 340, facing: -1, type: p2Type, name: p2c.name, hp: p2c.hp + hpBoost, isAI: true, aiScale, persona });
  G.projectiles = []; particles = [];
  G.time = G.training ? Infinity : 60;
  G.winner = null; G.roundCause = '';
  G.pausedFrom = null;
  G.shake = 0; G.hitStop = 0; G.comboShow = 0; G.comboT = 0;
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
    sfx('ko'); G.shake = 6;
    return;
  }
  G.roundCause = cause;
  G.koTimer = 0;
  if (winner === G.p1) G.wins.p1++;
  if (winner === G.p2) G.wins.p2++;
  if (cause === 'ko') {
    G.state = 'ko';
    sfx('ko'); G.shake = 6;
  } else {
    G.state = 'timeup';
    G.shake = 2;
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

// ---------- 场景选择 ----------
function pickScene() {
  if (G.mode === 'arcade') return ARCADE_SCENE_ORDER[Math.min(4, G.arcade.stage - 1)];
  return 'day';
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
      foe.takeHit(p.dmg, Math.sign(p.vx), 130, .45, p.owner);
      p.life = 0;
    }
  }
  G.projectiles = G.projectiles.filter(p => p.life > 0 && p.x > -20 && p.x < W + 20);

  // 粒子
  for (const pt of particles) { pt.t += rawDt; pt.x += pt.vx*rawDt; pt.y += pt.vy*rawDt; pt.vy += 300*rawDt; }
  particles = particles.filter(pt => pt.t < pt.life);

  // 连击显示计时
  const lastCombo = Math.max(G.p1.combo, G.p2.combo);
  if (lastCombo >= 2) {
    if (lastCombo !== G.comboShow) { G.comboShow = lastCombo; G.comboT = 1.2; G.comboSide = G.p1.combo >= G.p2.combo ? 1 : 2; }
  }
  G.comboT -= rawDt;
  if (G.comboT <= 0) { G.comboShow = 0; G.p1.combo = 0; G.p2.combo = 0; G.p1.comboDmg = 0; G.p2.comboDmg = 0; }

  G.shake = Math.max(0, G.shake - rawDt * 20);
  render(rawDt);
}

function drawTitleBG() {
  ctx.drawImage(sceneCanvas(), 0, 0);
  ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(0,0,W,H);
}

function render(dt) {
  ctx.save();
  if (G.shake > 0) ctx.translate(rand(-G.shake, G.shake), rand(-G.shake, G.shake));

  ctx.drawImage(sceneCanvas(), 0, 0);

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
    // 飞行道具（波动拳 / 超必杀金波）
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
      } else {
        px(p.x - r, p.y - r, r*2, r*2, '#7ad8ff');
        px(p.x - r+2, p.y - r+2, r*2-4, r*2-4, '#c8ecff');
        px(p.x - r+4, p.y - r+4, r, r, '#ffffff');
        // 拖尾
        px(p.x - Math.sign(p.vx)*r*2 - r/2, p.y - 3, r, 6, 'rgba(122,216,255,.4)');
      }
    }
    // 粒子
    for (const pt of particles) {
      ctx.globalAlpha = 1 - pt.t/pt.life;
      px(pt.x, pt.y, pt.s, pt.s, pt.c);
      ctx.globalAlpha = 1;
    }
    drawHUD();
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
    ctx.restore();
  }

  ctx.restore();
}

// ---------- 循环启动：rAF 若不触发（部分 WebView 会挂起）自动降级 setInterval ----------
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
