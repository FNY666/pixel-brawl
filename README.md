# 像素乱斗 PIXEL BRAWL

复古像素格斗小游戏：三局两胜、连招/取消、波动拳超必杀、训练模式连段挑战、街机闯关模式。纯前端静态实现（Canvas + WebAudio），支持 PWA 离线、键盘双人对战与触屏操作。

## 运行

直接双击 `index.html` 或放到任意静态服务器即可：

```bash
python3 -m http.server 8000   # 然后打开 http://localhost:8000
```

调试参数：

- `?autotest=1` — 内置自检套件：自动跑双人断言，结果写入 `document.title`（`AUTOTEST|PASS xxx|...`），用于验证输入/音频/街机/连招行为。
- `?debug=1` — 显示输入监视器（实时显示 1P/2P 各键识别状态），并在 `window` 暴露 `G` / `input` / `Fighter` 测试句柄。

## 代码结构

`index.html` 按 **01 → 12 顺序**加载经典脚本（刻意不使用 ES module：游戏需兼容 `minis://` 等特殊协议的 WebView，module 脚本在自定义协议下无法加载）。文件编号即依赖顺序，新增模块请按序号插入。

| 文件 | 职责 |
| --- | --- |
| `js/01-core.js` | 画布、常量（W/H/GROUND）、工具函数（clamp/rand/px） |
| `js/02-data.js` | 静态数据表：招式 `ATTACKS`、连招链 `COMBO_NEXT`、角色 `CHARACTERS`、AI 难度 `DIFFICULTY`、AI 人格 `AI_PERSONAS`、场景 `SCENES`、连段挑战 `TRIALS` |
| `js/03-audio.js` | chipTune BGM 音序器（`BGM`/`startBGM`/`stopBGM`）+ WebAudio 音效合成（`sfx`）+ 静音开关 |
| `js/04-input.js` | 键盘映射（1P: WASD+JKL，2P: 方向键+456）、帧号按下记录（`GFRAME`/`pressFrame`）、触屏容器级事件委托（Pointer/Touch 双轨、多指独立、滑动联动） |
| `js/05-fx.js` | 粒子火花、超必杀爆发、释放金光 |
| `js/06-scene.js` | 场景背景预渲染与缓存（每主题渲染一次到离屏 canvas） |
| `js/07-fighter.js` | `Fighter` 类：动作状态机（idle/walk/jump/attack/hit/block/ko/win）、攻击判定与取消窗口、受击/格挡、AI（难度 × 人格概率驱动） |
| `js/08-render.js` | 像素小人绘制（两个角色）、头像、HUD（血条/能量/赛点/计时/连击）、VS 面板 |
| `js/09-trials.js` | 训练模式连段挑战：序列匹配 + 面板渲染 |
| `js/10-game.js` | 全局状态 `G`、比赛/回合流程（`startMatch`/`startRound`/`advanceAfterRound`/`endMatch`）、街机闯关逻辑、主循环 `frame()` 与 `render()` |
| `js/11-ui.js` | DOM 按钮绑定、角色/难度选择、`?debug=1` 输入监视器 |
| `js/12-autotest.js` | `?autotest=1` 内置自检套件 |

其他：

- `sw.js` — Service Worker 离线缓存（改文件名/版本号时记得同步 `ASSETS` 列表并升级 `VERSION`）。
- `manifest.json` — PWA 清单。
- `style.css` — UI 样式（标题/结算/暂停面板、触屏按键布局）。

## 操作

| 动作 | 1P | 2P |
| --- | --- | --- |
| 移动 | A / D | ← / → |
| 跳 | W | ↑ |
| 格挡 | S | ↓ |
| 拳 | J | 4 |
| 脚 | K | 5 |
| 波动拳（≥35 能量，满能量=超必杀） | L | 6 |
| 暂停 | P | — |
| 静音 | M | — |

连招：拳×3 三段连击（J·J·J）、拳→脚取消（J·K）、空中拳、满能量波动拳=超必杀。训练模式按 R 复位。
