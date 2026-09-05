// ===== 像素乱斗 PIXEL BRAWL · 场景背景（每主题预渲染一次并缓存）=====
'use strict';

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
  // 云（白昼/黄昏）
  if (!sc.stars) {
    b.fillStyle = 'rgba(255,255,255,.45)';
    [[60,30,50],[200,22,40],[330,40,60],[420,26,36]].forEach(([x,y,w]) => {
      b.fillRect(x, y, w, 8); b.fillRect(x+8, y-5, w-16, 5);
    });
  }
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
