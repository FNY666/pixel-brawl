// ===== 像素乱斗 PIXEL BRAWL · 核心（画布 + 工具函数）=====
// 加载顺序约定：01 → 12，均为经典脚本（兼容 minis:// 等特殊协议，勿改 ES module）
'use strict';

// ---------- 基础 ----------
const W = 480, H = 270, GROUND = 226;
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
ctx.imageSmoothingEnabled = false;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const irand = (a, b) => Math.floor(rand(a, b + 1));

// 像素填充（小人 / HUD / 特效共用）
function px(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
