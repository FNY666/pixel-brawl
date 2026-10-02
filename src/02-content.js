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

