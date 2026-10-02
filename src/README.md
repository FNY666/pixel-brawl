# 游戏运行时脚本

这些文件按文件名前缀顺序作为**普通经典脚本**由 `index.html` 加载，而不是 ES modules。这样各文件可以继续共享页面级绑定，同时保留直接通过 `file://` 打开游戏的能力，无需构建步骤。

## 加载顺序

1. `00-foundation-audio.js` — 画布、常量、音频与通用基础函数
2. `01-input.js` — 键盘和触屏输入
3. `02-content.js` — 招式、连段挑战、角色和 AI 配置
4. `03-fighter.js` — 战士物理、战斗与 AI
5. `04-effects.js` — 粒子与打击特效
6. `05-match-flow.js` — 全局状态、回合及模式流程
7. `06-scenes.js` — 场景背景
8. `07-rendering.js` — 角色、HUD 与画面绘制
9. `08-game-loop.js` — 主循环
10. `09-ui-bootstrap.js` — UI 接线、启动及 debug/autotest

## 维护约定

- 在 `index.html` 中按上述顺序添加或调整脚本；不要改成 `type="module"`，除非同时决定放弃 `file://` 直开兼容性。
- 修改脚本文件或 URL 版本号时，同步更新 `sw.js` 的预缓存资源列表；需要让已安装的 PWA 立即更新时，也递增 Service Worker 缓存版本。
- 回归测试：对页面添加 `?autotest=1`，完成后查看 `document.title` 中的 `PASS` / `FAIL` 结果。
