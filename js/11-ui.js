// ===== 像素乱斗 PIXEL BRAWL · UI 绑定（按钮 / 角色与难度选择 / debug 监视器）=====
'use strict';

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
}
document.getElementById('char-fighter').addEventListener('click', () => selectCharacter('fighter'));
document.getElementById('char-blob').addEventListener('click', () => selectCharacter('blob'));

// 难度选择
function selectDifficulty(level) {
  G.difficulty = level;
  ['easy','normal','hard'].forEach(k =>
    document.getElementById('diff-'+k).classList.toggle('selected', k === level));
}
document.getElementById('diff-easy').addEventListener('click', () => selectDifficulty('easy'));
document.getElementById('diff-normal').addEventListener('click', () => selectDifficulty('normal'));
document.getElementById('diff-hard').addEventListener('click', () => selectDifficulty('hard'));

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
