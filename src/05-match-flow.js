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

