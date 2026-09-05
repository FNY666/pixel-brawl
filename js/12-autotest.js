// ===== 像素乱斗 PIXEL BRAWL · 内置自检 =====
// autotest=1 时自动跑双人断言，结果写入 document.title（AUTOTEST|PASS xxx|...）
'use strict';
if (location.search.includes('autotest=1')) {
  window.G = G; window.input = input; window.input2 = input2;
  (async function autoTest() {
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const log = [];
    const mark = (name, ok, extra) => log.push((ok ? 'PASS' : 'FAIL') + ' ' + name + (extra ? ' ' + extra : ''));
    window.onerror = (m, s, l, c) => { log.push('ERR ' + m + '@' + l + ':' + c); };
    try {
      let rafN = 0;
      const probe = () => { rafN++; requestAnimationFrame(probe); };
      requestAnimationFrame(probe);
      await wait(1000);
      mark('headless_fps', rafN >= 30, 'rAF=' + rafN + '/1s');
      await wait(400);
      document.getElementById('btn-pvp').click();
      await wait(400);
      mark('pvp_mode', G.mode === 'pvp', 'mode=' + G.mode);
      await wait(3200); // intro 1.35s 后 fight
      mark('fight_start', G.state === 'fight', 'state=' + G.state);

      // 2P 键盘：← 持续 700ms
      const x0 = Math.round(G.p2.x);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      await wait(700);
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowLeft', bubbles: true }));
      mark('p2_move_left', G.p2.x < x0 - 3, x0 + '->' + Math.round(G.p2.x));

      // 2P 键盘：4=拳（断言攻击真实建立：state==='attack'）
      G.p2.state = 'idle'; G.p2.attack = null; G.p2.cd.punch = 0; G.p2.buf = { punch: 0, kick: 0, special: 0 }; G.p2.prev = { punch: false, kick: false, special: false };
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '4', bubbles: true }));
      await wait(90);
      mark('p2_punch_key', G.p2.state === 'attack' && G.p2.attack === 'punch', 'atk=' + G.p2.attack + ' st=' + G.p2.state);
      window.dispatchEvent(new KeyboardEvent('keyup', { key: '4', bubbles: true }));
      await wait(260);
      mark('p2_punch_done', G.p2.state !== 'attack', 'st=' + G.p2.state);

      // 1P 键盘：A 移动 + J 拳 联动（断言攻击真实建立）
      G.p1.state = 'idle'; G.p1.attack = null; G.p1.cd.punch = 0; G.p1.buf = { punch: 0, kick: 0, special: 0 }; G.p1.prev = { punch: false, kick: false, special: false };
      const p1x = Math.round(G.p1.x);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', bubbles: true }));
      await wait(100);
      const p1React = { attack: G.p1.attack, state: G.p1.state };
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'j', bubbles: true }));
      await wait(250);
      mark('p1_move_punch', p1React.state === 'attack' && p1React.attack === 'punch', 'atk=' + p1React.attack + ' st=' + p1React.state);

      // —— BGM 音序器断言 ——
      mark('bgm_playing', BGM_STATE.on === true, 'song=' + BGM_STATE.song);
      const step0 = BGM_STATE.step;
      await wait(500);
      mark('bgm_advancing', BGM_STATE.step > step0, step0 + '->' + BGM_STATE.step + ' ac=' + (AC ? AC.state : 'none'));

      // 暂停 → 音频挂起；恢复 → 运行
      document.getElementById('btn-pause').click();
      await wait(150);
      mark('pause_audio', !AC || AC.state === 'suspended', AC ? AC.state : 'noAC');
      document.getElementById('btn-resume').click();
      await wait(150);
      mark('resume_audio', !AC || AC.state === 'running', AC ? AC.state : 'noAC');

      // 静音切换
      document.getElementById('btn-mute').click();
      await wait(200);
      mark('mute_off', BGM_STATE.on === false, 'muted=' + document.getElementById('btn-mute').dataset.muted);
      document.getElementById('btn-mute').click();
      await wait(200);
      mark('mute_on', BGM_STATE.on === true, 'muted=' + document.getElementById('btn-mute').dataset.muted);

      // 2P 触屏键：强制显示两层容器（桌面 IS_TOUCH=false 时隐藏，跳过环境限制测委托逻辑）
      document.getElementById('touch').classList.remove('hidden');
      document.getElementById('tc-2p').classList.remove('hidden');
      await wait(100);
      const kickEl = document.querySelector('.tk2[data-k="kick"]');
      const kr = kickEl ? kickEl.getBoundingClientRect() : null;
      mark('p2_touch_el', !!kickEl && !!kr && kr.width > 0 && kr.height > 0,
        'rect=' + (kr ? Math.round(kr.left) + ',' + Math.round(kr.top) + ',' + Math.round(kr.width) + 'x' + Math.round(kr.height) : 'null'));
      kickEl.dispatchEvent(
        new PointerEvent('pointerdown', { pointerId: 1, bubbles: true, cancelable: true,
          clientX: kr.left + kr.width / 2, clientY: kr.top + kr.height / 2 }));
      await wait(120);
      mark('p2_touch_bind', input2.kick === true, 'inp2.kick=' + input2.kick);
      kickEl.dispatchEvent(
        new PointerEvent('pointerup', { pointerId: 1, bubbles: true, cancelable: true }));

      // —— 触屏快速连点 / 双指独立断言 ——
      const tEl = document.getElementById('touch');
      const rc2 = (k) => { const r = tEl.querySelector('.tk[data-k="' + k + '"]').getBoundingClientRect(); return { x: r.left + r.width/2, y: r.top + r.height/2 }; };
      const pd = (id, k) => tEl.dispatchEvent(new PointerEvent('pointerdown', { pointerId: id, bubbles: true, cancelable: true, clientX: rc2(k).x, clientY: rc2(k).y }));
      const pu = (id) => tEl.dispatchEvent(new PointerEvent('pointerup', { pointerId: id, bubbles: true, cancelable: true }));
      // 同 id 快速连打（模拟偶发丢失 pointerup 场景，每次按下都须生效）
      const pr = rc2('punch');
      mark('tap_rect', pr.x > 0 && pr.y > 0, Math.round(pr.x) + ',' + Math.round(pr.y));
      pd(77, 'punch'); const tap1 = input.punch;
      pd(77, 'punch'); const tap2 = input.punch;   // 无 up 直接再 down：应重置并保持 true
      pd(77, 'punch'); const tap3 = input.punch;
      mark('tap_same_id', tap1 && tap2 && tap3, [tap1, tap2, tap3].join(','));
      pu(77);
      mark('tap_release', !input.punch, 'p=' + input.punch);
      // 双指独立（id 71 左 + id 72 拳 同时）
      pd(71, 'left'); pd(72, 'punch');
      mark('two_fingers', input.left && input.punch, 'L=' + input.left + ' P=' + input.punch);
      pu(71); pu(72);
      mark('two_up', !input.left && !input.punch, 'L=' + input.left + ' P=' + input.punch);

      // —— 街机模式断言 ——
      document.getElementById('btn-quit').click();        // 回到标题
      await wait(300);
      document.getElementById('btn-arcade').click();
      await wait(400);
      mark('arcade_mode', G.mode === 'arcade' && G.arcade.stage === 1, 'stage=' + G.arcade.stage);
      mark('arcade_scale1', G.p2.aiScale === 1, 'scale=' + G.p2.aiScale + ' p2hp=' + G.p2.hp);
      mark('arcade_persona1', G.p2.persona === 'balance' && G.arcade.boss === false, 'p=' + G.p2.persona);
      mark('vs_state', G.state === 'vs', 'state=' + G.state);
      mark('vs_scene_day', G.scene === 'day', 'scene=' + G.scene);
      await wait(1900);                                    // VS 横幅 1.6s 后进 intro
      mark('vs_done', G.state === 'intro' || G.state === 'fight', 'state=' + G.state);

      // 前置工具：p2 被打倒 → 本战胜利
      const koP2 = () => {
        G.state = 'fight'; G.p1.x = 300; G.p2.x = 320; G.p1.facing = 1; G.p2.facing = -1;
        G.p1.state = 'idle'; G.p1.attack = null; G.p1.cd.kick = 0;
        G.p2.state = 'idle'; G.p2.attack = null; G.p2.hp = 1; G.p2.blocking = false;
        G.p1.startAttack('kick');
        for (let i = 0; i < 30; i++) G.p1.update(.02, G.p2, { left:false, right:false, jump:false, block:false, punch:false, kick:false, special:false });
        const s = G.state, w = G.p1.state;   // 记录 KO 态与胜利姿势（advance 前）
        G.koTimer = 2.3; advanceAfterRound();
        return { koAfter: s, winState: w };
      };

      // 打赢第一战 → 第二战且回满血、对手强化
      const r1 = koP2();
      mark('win_pose', r1.winState === 'win', 'p1state=' + r1.winState);
      mark('arcade_next_stage', r1.koAfter === 'ko' && G.arcade.stage === 2 && G.p1.hp === G.p1.maxHp,
        'stage=' + G.arcade.stage + ' hp=' + Math.round(G.p1.hp) + ' scale=' + G.p2.aiScale + ' p2hp=' + G.p2.hp);
      mark('arcade_scene2', G.scene === 'evening', 'scene=' + G.scene);
      mark('arcade_persona2', G.p2.persona === 'rush' && !G.arcade.boss, 'p=' + G.p2.persona + ' scale=' + G.p2.aiScale);

      // 推进 3/4/5 战：人格与 Boss 战验证
      koP2(); mark('arcade_persona3', G.arcade.stage === 3 && G.p2.persona === 'guard' && !G.arcade.boss,
        'stage=' + G.arcade.stage + ' p=' + G.p2.persona);
      koP2(); mark('arcade_persona4', G.arcade.stage === 4 && G.p2.persona === 'rush' && !G.arcade.boss,
        'stage=' + G.arcade.stage + ' p=' + G.p2.persona);
      koP2();
      mark('arcade_boss', G.arcade.stage === 5 && G.arcade.boss === true && G.p2.persona === 'bossRush' &&
        G.p2.aiScale >= 1.9 && G.p2.hp === 173 && G.p2.maxHp === 173 && BGM_STATE.song === 'boss',
        'stage=' + G.arcade.stage + ' boss=' + G.arcade.boss + ' p=' + G.p2.persona + ' scale=' + G.p2.aiScale +
        ' hp=' + G.p2.hp + '/' + G.p2.maxHp + ' song=' + BGM_STATE.song);

      // Boss 战失败 → GAME OVER 结算 + 最佳纪录保存
      G.state = 'fight'; G.p1.x = 300; G.p2.x = 320; G.p1.facing = 1; G.p2.facing = -1;
      G.p1.state = 'idle'; G.p1.attack = null; G.p1.hp = 1;
      G.p2.state = 'idle'; G.p2.attack = null; G.p2.hp = 180; G.p2.blocking = false; G.p2.cd.kick = 0;
      G.p2.startAttack('kick');
      for (let i = 0; i < 30; i++) G.p2.update(.02, G.p1, { left:false, right:false, jump:false, block:false, punch:false, kick:false, special:false });
      G.koTimer = 2.3; advanceAfterRound();
      mark('arcade_gameover', G.state === 'result' && document.getElementById('result-text').textContent === 'GAME OVER',
        document.getElementById('result-text').textContent + ' | ' + document.getElementById('result-detail').textContent);
      mark('arcade_best', G.arcade.best > 0, 'best=' + G.arcade.best + ' score=' + G.arcade.score);

      // —— 连段挑战断言（训练模式） ——
      const kd = (k) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
      const ku = (k) => window.dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true }));
      const resetP1 = () => { G.p1.state = 'idle'; G.p1.attack = null; G.p1.cd.punch = 0; G.p1.cd.kick = 0; G.p1.cd.special = 0;
        G.p1.buf = { punch: 0, kick: 0, special: 0 }; G.p1.prev = { punch: false, kick: false, special: false }; G.p1.atkLog = []; };
      document.getElementById('btn-quit').click();
      await wait(300);
      document.getElementById('btn-training').click();
      await wait(400);
      mark('trial_panel', !document.getElementById('trial-panel').classList.contains('hidden') && G.trials && G.trials.length === 3,
        'trials=' + (G.trials ? G.trials.length : 0));

      // 第一关：三段连击 J·J·J（时间线探针）
      resetP1();
      const tl = [];
      const tlId = setInterval(() => { if (tl.length < 16) tl.push(G.p1.attack + '@' + Math.round(G.p1.stateT * 1000) + ':' + G.p1.state); }, 30);
      kd('j'); await wait(170); ku('j'); await wait(10);
      kd('j'); await wait(170); ku('j'); await wait(10);
      kd('j'); await wait(200); ku('j'); await wait(420);
      clearInterval(tlId);
      mark('trial_combo1', G.trials[0].done === true, 'log=' + G.p1.atkLog.join('>'));

      // 第二关：拳→脚取消 J·K
      resetP1();
      kd('j'); await wait(200); ku('j'); await wait(90);
      kd('k'); await wait(260); ku('k'); await wait(340);
      mark('trial_cancel', G.trials[1].done === true, G.p1.atkLog.slice(-3).join('>'));

      // 第三关：拳→超必杀（满能量 J·L）
      resetP1(); G.p1.meter = 100;
      kd('j'); await wait(200); ku('j'); await wait(90);
      kd('l'); await wait(240); ku('l'); await wait(360);
      mark('trial_super', G.trials[2].done === true, G.p1.atkLog.slice(-3).join('>'));
      mark('trial_all', G.trials.every(t => t.done), 'done=' + G.trials.filter(t => t.done).length);
    } catch (e) { log.push('ERROR ' + e.message); }
    document.title = 'AUTOTEST|' + log.join('|');
  })();
}
