// ---------- 战士 ----------
class Fighter {
  constructor(opts) {
    const cfg = CHARACTERS[opts.type] || CHARACTERS.fighter;
    const setHp = ('hp' in opts) ? opts.hp : 100;
    Object.assign(this, {
      x: 0, y: GROUND, vx: 0, vy: 0, facing: 1,
      type: 'blob', name: '???',
      hp: setHp, maxHp: setHp, chipHp: setHp,
      dmg: cfg.dmg, speed: cfg.speed,
      state: 'idle',        // idle|walk|jump|attack|hit|block|ko|win
      stateT: 0,
      attack: null,         // 当前招式名
      hitDone: false,       // 本次攻击是否已命中
      cd: { punch:0, kick:0, special:0 },
      meter: 50, maxMeter: 100,
      blocking: false,
      flash: 0,
      isAI: false,
      aiTimer: 0, aiMove: 0, aiAct: null,
      aiScale: 1,        // 街机模式逐层强化系数
      persona: 'balance',  // rush | guard | balance（AI 行为性格）
      combo: 0, comboDmg: 0,
      walkPhase: 0,
      aiGuard: 0,
      buf: { punch: 0, kick: 0, special: 0 },
      prev: { punch: false, kick: false, special: false },
      atkLog: [],               // 连段挑战用：最近攻击名序列
      press: pressFrame1        // 本玩家的键盘按下帧表（1P/2P 独立，避免互相消费）
    }, opts);
  }

  get onGround() { return this.y >= GROUND - 0.5; }
  get hurtbox() {
    const w = this.type === 'blob' ? 30 : 22;
    return { x: this.x - w/2, y: this.y - (this.type==='blob'?46:48), w: w, h: this.type==='blob'?46:48 };
  }

  // 攻击输入捕获：两种信号源都进缓冲（快速连按不丢）
  //  - 键盘：keydown 是异步事件，用帧号判定"刚按下"
  //  - AI/触屏：输入是同步布尔量，用上升沿判定（原版此处只认键盘，导致 AI/触屏永远发不出招式）
  captureAttackInput(inp) {
    const pf = this.press;
    for (const k of ['punch', 'kick', 'special']) {
      const cur = !!inp[k];
      const keyed = cur && GFRAME - pf[k] <= COMBAT.pressRecency;
      const rising = cur && !this.prev[k];
      if (keyed || rising) this.buf[k] = COMBAT.atkBufFrames;
      if (keyed) pf[k] = -999;   // 消费本次键盘按下
      this.prev[k] = cur;
    }
  }

  startAttack(name) {
    const a = ATTACKS[name];
    if (!a) return false;

    // 连招链：连续输入 punch 推进到下一段（punch → punch2 → kick3）
    if (this.state === 'attack' && name === 'punch' && this.attack && ATTACKS[this.attack].combo) {
      const next = COMBO_NEXT[this.attack];
      if (next) {
        // 启动下一段：继承首次输入的进攻意志，重置攻击状态
        this.attack = next; this.stateT = 0; this.hitDone = false;
        sfxWhoosh(/kick/.test(next));
        this.atkLog.push(next);
        if (this.atkLog.length > 8) this.atkLog.shift();
        return true;
      }
    }
    if (this.cd[name] > 0 || this.state === 'attack' || this.state === 'hit' || this.state === 'ko') return false;

    // 空中攻击
    if (name === 'punch' && !this.onGround) name = 'airpunch';

    // 超必杀：能量满时波动拳升级
    let isSuper = false;
    if (name === 'special' && this.meter >= 100) { name = 'super'; isSuper = true; }

    if (name === 'special' && this.meter < COMBAT.specialCost) return false;
    this.blocking = false;
    this.state = 'attack'; this.stateT = 0;
    this.attack = name; this.hitDone = false;
    if (!a.projectile) sfxWhoosh(name === 'kick'); // 挥空 whoosh（比命中早 80–120ms）
    this.atkLog.push(name);
    if (this.atkLog.length > 8) this.atkLog.shift();
    this.cd[name] = ATTACKS[name].cd;
    if (name === 'special' || name === 'super') {
      this.meter -= (isSuper ? 100 : COMBAT.specialCost);
      sfx(isSuper ? 'super' : 'shot');
      if (isSuper) { goldenFlash(); G.slowmo = 0.32; }
    }
    return true;
  }

  takeHit(dmg, dir, kb, attacker, atkName) {
    if (this.state === 'ko') return;
    const foeInFront = Math.sign(attacker.x - this.x) === this.facing;
    const guarded = this.blocking && this.onGround && foeInFront && this.state !== 'attack';
    // 连段伤害衰减（真实格斗手感：同一连段越往后单发越轻）
    const scale = guarded ? 1 : (1 - Math.min(COMBAT.comboDecayMax, Math.max(0, attacker.combo - 1) * COMBAT.comboDecay));
    const finalDmg = guarded ? Math.max(1, Math.ceil(dmg * COMBAT.guardChip)) : Math.max(1, Math.round(dmg * scale));
    this.hp = Math.max(0, this.hp - finalDmg);
    attacker.meter = clamp(attacker.meter + (guarded ? COMBAT.meterOnGuardGiven : COMBAT.meterOnHitGiven), 0, attacker.maxMeter);
    this.meter = clamp(this.meter + (guarded ? COMBAT.meterOnGuardTaken : COMBAT.meterOnHitTaken), 0, this.maxMeter);

    if (guarded) {
      this.state = 'block'; this.stateT = 0;
      this.vx = dir * kb * 0.18;
      this.flash = .08;
      G.hitStop = hitstopFor(dmg, true); addTrauma(traumaFor(dmg, true));
      spawnSparks(this.x, this.y - 30, dir, true);
      sfx('block');
      if (this.hp <= 0) {
        this.blocking = false;
        this.state = 'ko'; this.stateT = 0;
        this.vx = dir * 80; this.vy = -90;
        onKO(attacker, this);
      }
      return;
    }

    this.blocking = false;
    this.state = 'hit'; this.stateT = 0;
    this.attack = null; this.hitDone = true;
    this.vx = dir * kb;
    if (!this.onGround) this.vy = PHYS.airJuggleV;
    this.flash = .12;
    attacker.combo++;
    attacker.comboDmg += finalDmg;
    G.hitStop = hitstopFor(finalDmg, false); addTrauma(traumaFor(finalDmg, false));
    spawnSparks(this.x, this.y - 30, dir);
    spawnImpact(this.x, this.y - 30, dir, finalDmg >= 12);
    if (atkName && /kick/.test(atkName)) spawnArc(this.x, this.y - 30, dir); // 踢技方向性弧光
    spawnDmg(this.x, this.y - 46, finalDmg, finalDmg >= 12 ? '#ff9d2e' : '#ffe95c');
    sfxHit(finalDmg >= 12 ? 'heavy' : (finalDmg >= 8 ? 'medium' : 'light'));
    if (finalDmg >= 12) {
      G.zoomPunch = Math.max(G.zoomPunch, 0.18);   // 重击 180ms 轻微推镜
      G.impactFlash = Math.max(G.impactFlash, 2);  // 2 帧冲击闪光
      if (this.onGround) spawnDust(this.x, GROUND, 5);
    }
    if (this.hp <= 0) {
      this.state = 'ko'; this.stateT = 0;
      this.vx = dir * 160; this.vy = -140;
      onKO(attacker, this);
    }
  }

  update(dt, foe, inp) {
    // 冷却与能量自然恢复
    for (const k in this.cd) this.cd[k] = Math.max(0, this.cd[k] - dt);
    this.meter = clamp(this.meter + dt * COMBAT.meterRegen, 0, this.maxMeter);
    this.flash = Math.max(0, this.flash - dt);
    if (this.chipHp > this.hp) this.chipHp = Math.max(this.hp, this.chipHp - dt * COMBAT.chipDrain); // 残血拖尾

    // 胜利姿势：动作展示，不受输入影响
    if (this.state === 'win') {
      this.stateT += dt;
      return;
    }

    // KO 倒地
    if (this.state === 'ko') {
      this.vy += PHYS.gravity * dt;
      this.x += this.vx * dt; this.y += this.vy * dt;
      if (this.y > GROUND) { if (this.vy > 200) spawnDust(this.x, GROUND, 6); this.y = GROUND; this.vy = 0; this.vx *= .8; }
      this.x = clamp(this.x, PHYS.arenaL, PHYS.arenaR);
      return;
    }

    // 受击硬直
    if (this.state === 'hit') {
      this.captureAttackInput(inp);
      this.stateT += dt;
      this.vy += PHYS.gravity * dt;
      this.x += this.vx * dt; this.y += this.vy * dt;
      if (this.y > GROUND) { this.y = GROUND; this.vy = 0; }
      this.vx *= Math.pow(.02, dt);
      this.x = clamp(this.x, PHYS.arenaL, PHYS.arenaR);
      if (this.stateT > COMBAT.hitStunTime && this.onGround) { this.state = 'idle'; this.stateT = 0; }
      return;
    }

    // 格挡：仅地面可用，按住期间持续减伤
    if (this.state === 'block') {
      this.stateT += dt;
      this.blocking = !!inp.block && this.onGround;
      this.vy += PHYS.gravity * dt;
      this.x += this.vx * dt; this.y += this.vy * dt;
      if (this.y > GROUND) { this.y = GROUND; this.vy = 0; }
      this.vx *= Math.pow(.01, dt);
      this.x = clamp(this.x, PHYS.arenaL, PHYS.arenaR);
      if (!this.blocking) { this.state = 'idle'; this.stateT = 0; }
      return;
    }

    // 攻击进行中
    if (this.state === 'attack') {
      this.stateT += dt;
      const a = ATTACKS[this.attack];

      // —— 可取消窗口（街霸引擎取消语义）：activeTo 之后可按其他攻击/波动取消 ——
      if (a.cancelFrom !== undefined && this.stateT >= a.cancelFrom) {
        // 边沿检测：键盘用帧号判定，AI/触屏用上升沿
        const edge = (k, v) => {
          const cur = !!v;
          const keyed = cur && GFRAME - this.press[k] <= COMBAT.pressRecency;
          const rising = cur && !this.prev[k];
          this.prev[k] = cur;
          if (keyed) this.press[k] = -999;   // 消费本次按下（取消路径）
          return keyed || rising;
        };
        const kickP = edge('kick', inp.kick) && this.cd.kick <= 0;
        const specialP = edge('special', inp.special) && this.meter >= COMBAT.specialCost;
        const punchP = edge('punch', inp.punch);
        if (kickP) { this.attack = 'kick'; this.stateT = 0; this.hitDone = false; this.cd.kick = ATTACKS.kick.cd; sfx('block'); this.atkLog.push('kick'); }
        else if (specialP) {
          const sup = this.meter >= 100;
          this.attack = sup ? 'super' : 'special'; this.stateT = 0; this.hitDone = false;
          this.cd.special = ATTACKS[this.attack].cd;
          this.meter -= sup ? 100 : COMBAT.specialCost;
          sfx(sup ? 'super' : 'shot');
          if (sup) { goldenFlash(); G.slowmo = 0.32; }
          this.atkLog.push(this.attack);
        }
        else if (punchP && this.attack === 'punch') {   // 拳→拳→上踢 连段链
          const next = COMBO_NEXT.punch;
          if (next) { this.attack = next; this.stateT = 0; this.hitDone = false; this.atkLog.push(next); }
        }
        else if (punchP && this.attack === 'punch2') {  // 第二段接终结踢
          this.attack = 'kick3'; this.stateT = 0; this.hitDone = false; this.atkLog.push('kick3');
        }
        else if (punchP && ATTACKS[this.attack].combo !== true && this.attack !== 'kick' && this.attack !== 'airpunch') {
          this.attack = 'punch'; this.stateT = 0; this.hitDone = false; this.atkLog.push('punch'); // 其他攻击可用拳重置
        }
      } else {
        // 未到取消窗口：提前按下先进缓冲，帧期结束自动出手
        this.captureAttackInput(inp);
      }

      if (!this.hitDone && this.stateT >= a.activeFrom && this.stateT <= a.activeTo) {
        if (a.projectile) {
          if (!this.hitDone) {
            this.hitDone = true;
            const superShot = !!a.super;
            G.projectiles.push({ x: this.x + this.facing*20, y: this.y - 26,
              vx: this.facing * (superShot ? 320 : 220),
              dmg: Math.round(a.dmg * this.dmg), owner: this, life: 1.6,
              r: superShot ? 13 : 7, super: superShot,
              skin: this.type === 'ninja' ? 'shuriken' : (superShot ? 'gold' : 'orb') });
            if (superShot) { addTrauma(0.5); G.zoomPunch = Math.max(G.zoomPunch, 0.22); }
          }
        } else {
          const hx = this.x + this.facing * a.reach;
          const hb = { x: Math.min(hx, this.x), y: this.y + a.oy - a.h/2, w: Math.abs(hx - this.x), h: a.h };
          const fb = foe.hurtbox;
          if (hb.x < fb.x + fb.w && hb.x + hb.w > fb.x && hb.y < fb.y + fb.h && hb.y + hb.h > fb.y) {
            this.hitDone = true;
            const dmg = Math.round(a.dmg * this.dmg);
            foe.takeHit(dmg, this.facing, a.kb, this, this.attack);
            if (a.last && foe.state !== 'ko') { foe.vy = -90; foe.vx = this.facing * 110; } // 终结踢上挑
          }
        }
      }
      if (this.stateT >= a.total) { this.state = this.onGround ? 'idle' : 'jump'; this.stateT = 0; this.attack = null; }
      // 攻击时轻微前移
      if (this.onGround) this.vx *= Math.pow(.01, dt);
      this.x = clamp(this.x + this.vx * dt, PHYS.arenaL, PHYS.arenaR);
      return;
    }

    // ---- 常规控制（玩家输入 或 AI 虚拟输入）----
    let move = 0;
    if (inp.left) move -= 1;
    if (inp.right) move += 1;

    if (inp.block && this.onGround) {
      this.blocking = true;
      this.state = 'block'; this.stateT = 0;
      this.vx = 0;
      return;
    }
    this.blocking = false;
    if (inp.jump && this.onGround) { this.vy = PHYS.jumpV; sfx('jump'); }

    // 攻击输入：边沿捕获 + 缓冲消费（可行动立即出手，不可行则暂存）
    this.captureAttackInput(inp);
    for (const k of ['punch', 'kick', 'special']) {
      if (this.buf[k] > 0) {
        if (this.startAttack(k)) { this.buf[k] = 0; return; }  // 攻击建立，本帧结束（防后续覆盖 state）
        this.buf[k]--;
      }
    }

    this.vy += PHYS.gravity * dt;
    this.x += move * this.speed * dt;
    this.y += this.vy * dt;
    if (this.y > GROUND) { if (this.vy > 170) spawnDust(this.x, GROUND, 6); this.y = GROUND; this.vy = 0; }
    if (move !== 0 && this.onGround) { this.state = 'walk'; this.walkPhase += dt * 10; }
    else if (this.onGround) this.state = 'idle';
    else this.state = 'jump';

    // 面向对手
    if (foe && this.state !== 'attack') this.facing = foe.x >= this.x ? 1 : -1;
    this.x = clamp(this.x, PHYS.arenaL, PHYS.arenaR);

    // 身体碰撞推挤
    if (foe) {
      const dx = this.x - foe.x;
      if (Math.abs(dx) < 22 && Math.abs(this.y - foe.y) < 40 && dx !== 0) {
        const push = (22 - Math.abs(dx)) / 2 * Math.sign(dx);
        this.x = clamp(this.x + push, PHYS.arenaL, PHYS.arenaR);
      }
    }
  }

  // ---------- AI ----------
  aiInput(dt, foe) {
    const out = { left:false, right:false, jump:false, block:false, punch:false, kick:false, special:false };
    if (this.state === 'ko' || foe.state === 'ko') return out;
    if (this.aiGuard > 0) {
      this.aiGuard -= dt;
      out.block = true;
      return out;
    }
    this.aiTimer -= dt;
    const diff = DIFFICULTY[G.difficulty] || DIFFICULTY.normal;
    const per = AI_PERSONAS[this.persona] || AI_PERSONAS.balance;
    const dist = Math.abs(foe.x - this.x);
    if (this.aiTimer <= 0) {
      this.aiTimer = rand(diff.react[0], diff.react[1]) / this.aiScale;
      this.aiMove = 0; this.aiAct = null;
      const r = Math.random();
      // 行为概率：性格权重累积成阈值（approach / jump / special / retreat）
      // 距离分三档：远 >110（接近/发波/跳）· 中 46–110（接近/跳/波/后撤）· 近 <46（拳/脚/格挡/后撤）
      const seek = per.approach, sp = seek + per.special, jp = sp + per.jump;
      if (dist > 110) {
        if (r < seek) this.aiMove = Math.sign(foe.x - this.x);
        else if (r < sp) this.aiAct = 'special';
        else if (r < jp) { this.aiMove = Math.sign(foe.x - this.x); this.aiAct = 'jump'; }
      } else if (dist > 46) {
        const rp = jp + per.retreat;
        if (r < seek * .85) this.aiMove = Math.sign(foe.x - this.x);
        else if (r < sp + per.jump * .5) this.aiAct = 'jump';
        else if (r < jp + per.special * .4) this.aiAct = 'special';
        else if (r < rp) this.aiMove = -Math.sign(foe.x - this.x); // 后撤
      } else {
        const gScale = Math.min(.8, per.guard + (this.aiScale - 1) * .18); // 性格+街机层数决定格挡概率
        const pp = per.punch, kp = pp + per.kick, rp = kp + per.retreat;
        if (foe.state === 'attack' && r < gScale) this.aiGuard = rand(.18, .42);
        else if (r < pp) this.aiAct = 'punch';
        else if (r < kp) this.aiAct = 'kick';
        else if (r < rp) this.aiMove = -Math.sign(foe.x - this.x);
        else if (r < rp + per.jump) this.aiAct = 'jump';
      }
    }
    if (this.aiMove === 1) out.right = true;
    if (this.aiMove === -1) out.left = true;
    if (this.aiAct === 'jump') { out.jump = true; this.aiAct = null; }
    if (this.aiAct === 'punch') { out.punch = true; this.aiAct = null; }
    if (this.aiAct === 'kick') { out.kick = true; this.aiAct = null; }
    if (this.aiAct === 'special') { out.special = true; this.aiAct = null; }
    return out;
  }
}

