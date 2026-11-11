/*!
 * spider.js - a procedural spider that follows your cursor and, on demand,
 * devours the page (words, images, buttons, pills...).
 *
 * Usage:   <script src="JS/spider.js" defer></script>
 *
 * - A "Release the spider" button is injected bottom-right automatically.
 * - Or put data-spider-toggle on ANY element of your own to use it as the button
 *   (and data-spider-restore on one that should bring the page back).
 * - JS API: SpiderCrawler.toggle(), .restore(), .start()
 * - Esc stops the rampage.
 */
(() => {
  'use strict';
  if (window.SpiderCrawler) return;

  /* ------------------------------ settings ------------------------------ */
  const CFG = {
    scale: 0.8,            // overall spider size
    followSpeed: 420,      // px/s while following the cursor
    rampageSpeed: 540,     // px/s while hunting content
    wordEatTime: 0.22,     // seconds to chew one word
    blockEatTime: 0.5,     // seconds to chew an image / button / pill
    legColor: '#141414',
    rimColor: 'rgba(255,255,255,0.5)',   // light outline so it shows on dark AND light areas
    // Whole elements eaten in one piece (everything else is eaten word by word)
    blockSelector:
      'img, button, input, textarea, select, .skill-pill, .btn-light-outline, ' +
      '.social-link, .project-link, div[style*="mask"]'
  };
  const PROTECT = '[data-spider-ui], [data-spider-toggle], [data-spider-restore]';
  const SKIP = 'script, style, noscript, textarea, select, option, .sp-ghost, ' +
               PROTECT + ', ' + CFG.blockSelector;

  /* ------------------------------- state -------------------------------- */
  const k = CFG.scale;
  const mouse = { x: innerWidth / 2, y: innerHeight / 2 };
  const S = {
    x: 0, y: -80, vx: 0, vy: 0, ang: Math.PI / 2,
    time: 0, rampage: false,
    target: null, eatT: 0, eating: false, age: 0, pickCD: 0,
    leaving: false, exitX: 0, exitY: 0
  };
  const particles = [];
  const eaten = [];
  const blockSet = new WeakSet();
  const words = [];
  let all = [], targets = [], prepared = false;
  let canvas, ctx, W = 0, H = 0, running = false, last = 0;
  const ui = {};

  /* -------------------------------- legs -------------------------------- */
  // local frame: +x = forward. Four legs per side.
  const ANCHOR = [[11, 6], [4, 7], [-3, 7], [-10, 6]];
  const REST   = [[56, 34], [36, 52], [-30, 56], [-52, 44]];
  const L1 = 36 * k, L2 = 46 * k;
  const legs = [];
  [1, -1].forEach(s => {
    for (let i = 0; i < 4; i++) {
      legs.push({
        idx: legs.length,
        ax: ANCHOR[i][0] * k, ay: s * ANCHOR[i][1] * k,
        rx: REST[i][0] * k,   ry: s * REST[i][1] * k,
        side: s,                // +1 / -1: which side of the body the leg is on
        bend: i < 2 ? 1 : -1,   // tiny forward/back bias for the knee
        fx: 0, fy: 0, sx: 0, sy: 0, tx: 0, ty: 0,
        t: 0, dur: 0.12, stepping: false, lift: 0,
        kx: 0, ky: 0, ex: 0, ey: 0
      });
    }
  });
  function legBlocked(L) {
    const i = L.idx, j = i % 4;
    return (j > 0 && legs[i - 1].stepping) ||
           (j < 3 && legs[i + 1].stepping) ||
           legs[(i + 4) % 8].stepping;
  }
  function placeFeet() {
    const c = Math.cos(S.ang), s = Math.sin(S.ang);
    legs.forEach(L => {
      L.fx = S.x + L.rx * c - L.ry * s;
      L.fy = S.y + L.rx * s + L.ry * c;
      L.stepping = false;
    });
  }

  /* ------------------------------ helpers ------------------------------- */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  function distToRect(px, py, r) {
    const dx = Math.max(r.left - px, 0, px - r.right);
    const dy = Math.max(r.top - py, 0, py - r.bottom);
    return Math.hypot(dx, dy);
  }
  function solveKnee(ax, ay, fx, fy, bend, side, c, s) {
    const dx = fx - ax, dy = fy - ay;
    const d = Math.hypot(dx, dy) || 0.001;
    const dc = clamp(d, Math.abs(L1 - L2) + 0.5, L1 + L2 - 0.5);
    const ux = dx / d, uy = dy / d;
    const a = (L1 * L1 - L2 * L2 + dc * dc) / (2 * dc);
    const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    let px = -uy, py = ux;
    // The knee must bulge AWAY from the body (outward), with only a tiny
    // forward/back bias to break ties for legs pointing straight sideways.
    const lx = bend * 0.2, ly = side;                 // preferred direction, local frame
    const wx = lx * c - ly * s, wy = lx * s + ly * c; // ...in world frame
    if (px * wx + py * wy < 0) { px = -px; py = -py; }
    return { kx: ax + ux * a + px * h, ky: ay + uy * a + py * h,
             ex: ax + ux * dc, ey: ay + uy * dc };
  }

  /* --------------------------- page destruction ------------------------- */
  function wrapWords(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (!n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const p = n.parentElement;
        return (!p || p.closest(SKIP)) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      const frag = document.createDocumentFragment();
      node.nodeValue.split(/(\s+)/).forEach(part => {
        if (!part) return;
        if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
        const span = document.createElement('span');
        span.className = 'sp-w';
        span.textContent = part;
        frag.appendChild(span);
        words.push(span);
      });
      node.parentNode.replaceChild(frag, node);
    });
  }

  function prepare() {
    if (prepared) return;
    prepared = true;
    const blocks = [...document.querySelectorAll(CFG.blockSelector)].filter(el =>
      !el.closest(PROTECT) &&
      !(el.parentElement && el.parentElement.closest(CFG.blockSelector)));
    blocks.forEach(b => blockSet.add(b));
    wrapWords(document.body);
    all = words.concat(blocks);
    targets = all.slice();
  }

  function isShown(el) {
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) < 0.2) return false;
    }
    return true;
  }

  // Nearest edible thing (to the cursor) that is on screen.
  function pickTarget() {
    let best = null, bestD = Infinity;
    for (const el of targets) {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.top > innerHeight ||
          r.right < 0 || r.left > innerWidth) continue;
      const dx = r.left + r.width / 2 - mouse.x, dy = r.top + r.height / 2 - mouse.y;
      const d = dx * dx + dy * dy;
      if (d < bestD && isShown(el)) { best = el; bestD = d; }
    }
    return best;
  }

  function addCrumbs(n, color) {
    const mx = S.x + Math.cos(S.ang) * 18 * k, my = S.y + Math.sin(S.ang) * 18 * k;
    for (let i = 0; i < n; i++) {
      particles.push({
        x: mx, y: my, vx: rand(-120, 120), vy: rand(-160, 20),
        life: 0, max: rand(0.4, 0.9), size: rand(1.5, 3.2), color
      });
    }
  }

  function devour(el) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const isBlock = blockSet.has(el);
    let g;
    if (isBlock) {
      g = el.cloneNode(true);
      g.removeAttribute('id');
      g.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
    } else {
      g = document.createElement('span');
      g.textContent = el.textContent;
      const st = g.style;
      st.fontFamily = cs.fontFamily; st.fontSize = cs.fontSize;
      st.fontWeight = cs.fontWeight; st.fontStyle = cs.fontStyle;
      st.letterSpacing = cs.letterSpacing; st.textTransform = cs.textTransform;
      st.color = cs.color; st.lineHeight = r.height + 'px';
    }
    g.classList.add('sp-ghost');
    Object.assign(g.style, {
      left: r.left + 'px', top: r.top + 'px',
      width: r.width + 'px', height: r.height + 'px'
    });
    document.body.appendChild(g);
    el.style.visibility = 'hidden';

    g.animate([
      { transform: 'translate(0,0) rotate(0deg) scale(1)', opacity: 1, offset: 0 },
      { transform: `translate(${rand(-14, 14)}px,-6px) rotate(${rand(-8, 8)}deg) scale(1.05)`, opacity: 1, offset: 0.15 },
      { transform: `translate(${rand(-60, 60)}px,${rand(120, 260)}px) rotate(${rand(-90, 90)}deg) scale(0.5)`, opacity: 0 }
    ], { duration: rand(700, 1100), easing: 'ease-in', fill: 'forwards' })
      .onfinish = () => g.remove();

    addCrumbs(isBlock ? 14 : 7, isBlock ? '#888' : cs.color);
    eaten.push(el);
    const i = targets.indexOf(el);
    if (i > -1) targets.splice(i, 1);
    updateUI();
  }

  function restore() {
    S.target = null; S.eatT = 0; S.eating = false;
    eaten.forEach(el => { el.style.visibility = ''; });
    eaten.length = 0;
    document.querySelectorAll('.sp-ghost').forEach(g => g.remove());
    targets = all.slice();
    updateUI();
  }

  /* ------------------------------- update ------------------------------- */
  function update(dt) {
    S.time += dt;
    let gx = mouse.x, gy = mouse.y, stop = 62 * k, max = CFG.followSpeed;
    let hunting = false, rect = null;

    if (S.rampage) {
      if (!S.target) {
        S.pickCD -= dt;
        if (S.pickCD <= 0) { S.target = pickTarget(); S.pickCD = 0.12; S.eatT = 0; S.age = 0; }
      }
      if (S.target) {
        rect = S.target.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1 || rect.bottom < -20 || rect.top > innerHeight + 20) {
          S.target = null; rect = null;       // scrolled away
        } else {
          hunting = true; max = CFG.rampageSpeed; stop = 0;
          gx = clamp(S.x, rect.left, rect.right);
          gy = clamp(S.y, rect.top, rect.bottom);
        }
      }
    }

    if (S.leaving) {                       // scurry off towards the exit point
      gx = S.exitX; gy = S.exitY; stop = 0; max = CFG.rampageSpeed;
    }

    const dx = gx - S.x, dy = gy - S.y, dist = Math.hypot(dx, dy);

    // heading
    if (dist > 6) {
      let da = Math.atan2(dy, dx) - S.ang;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      S.ang += da * Math.min(1, dt * 9);
    }
    const c = Math.cos(S.ang), s = Math.sin(S.ang);
    const mx = S.x + c * 18 * k, my = S.y + s * 18 * k;

    // eating?
    const mouthD = hunting ? distToRect(mx, my, rect) : Infinity;
    S.eating = hunting && (mouthD < 7 || dist < 2);

    // speed
    let sp = 0;
    if (hunting) sp = S.eating ? 0 : Math.min(max, mouthD * 7 + 40);
    else sp = Math.min(max, Math.max(0, dist - stop) * 4);
    const ux = dist > 1 ? dx / dist : 0, uy = dist > 1 ? dy / dist : 0;
    const f = Math.min(1, dt * 9);
    S.vx += (ux * sp - S.vx) * f;
    S.vy += (uy * sp - S.vy) * f;
    S.x += S.vx * dt; S.y += S.vy * dt;

    // fully off-screen (legs included) -> remove it until the next button press
    if (S.leaving && (S.x < -110 || S.x > W + 110 || S.y < -110 || S.y > H + 110)) {
      running = false; S.leaving = false;
      particles.length = 0;
      canvas.remove();
      return;
    }

    // chewing / stuck guard
    if (hunting) {
      S.age += dt;
      if (S.eating) {
        S.eatT += dt;
        if (Math.random() < dt * 25) addCrumbs(1, getComputedStyle(S.target).color);
      }
      const need = blockSet.has(S.target) ? CFG.blockEatTime : CFG.wordEatTime;
      if (S.eatT >= need || S.age > 5) {
        devour(S.target); S.target = null; S.eatT = 0; S.pickCD = 0;
      }
    }

    // legs
    const speed = Math.hypot(S.vx, S.vy);
    const trig = 16 * k, force = 30 * k;
    for (const L of legs) {
      const r0x = S.x + L.rx * c - L.ry * s, r0y = S.y + L.rx * s + L.ry * c;
      const tx = r0x + S.vx * 0.05, ty = r0y + S.vy * 0.05;
      if (L.stepping) {
        L.tx = tx; L.ty = ty;
        L.t += dt / L.dur;
        if (L.t >= 1) { L.t = 1; L.stepping = false; L.lift = 0; }
        else L.lift = Math.sin(Math.PI * L.t);
        const e = L.t * L.t * (3 - 2 * L.t);
        L.fx = L.sx + (L.tx - L.sx) * e;
        L.fy = L.sy + (L.ty - L.sy) * e;
      } else {
        const d = Math.hypot(L.fx - r0x, L.fy - r0y);
        if (d > trig && (!legBlocked(L) || d > force)) {
          L.stepping = true; L.t = 0; L.sx = L.fx; L.sy = L.fy;
          L.dur = Math.max(0.07, 0.17 - speed * 0.00022);
        }
      }
    }

    // crumbs
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life += dt;
      if (p.life >= p.max) { particles.splice(i, 1); continue; }
      p.vy += 900 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    }
  }

  /* -------------------------------- draw -------------------------------- */
  function draw() {
    ctx.clearRect(0, 0, W, H);
    const c = Math.cos(S.ang), s = Math.sin(S.ang);

    for (const L of legs) {
      const ax = S.x + L.ax * c - L.ay * s, ay = S.y + L.ax * s + L.ay * c;
      const j = solveKnee(ax, ay, L.fx, L.fy, L.bend, L.side, c, s);
      L.sx0 = ax; L.sy0 = ay; L.kx = j.kx; L.ky = j.ky; L.ex = j.ex; L.ey = j.ey;
    }

    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const pass of [0, 1]) {
      for (const L of legs) {
        const w = (1 + 0.25 * L.lift) * k;
        ctx.strokeStyle = pass ? CFG.legColor : CFG.rimColor;
        const extra = pass ? 0 : 1.8;
        ctx.lineWidth = 3.4 * w + extra;
        ctx.beginPath(); ctx.moveTo(L.sx0, L.sy0); ctx.lineTo(L.kx, L.ky); ctx.stroke();
        ctx.lineWidth = 2.2 * w + extra;
        ctx.beginPath(); ctx.moveTo(L.kx, L.ky); ctx.lineTo(L.ex, L.ey); ctx.stroke();
      }
    }

    // body
    ctx.save();
    ctx.translate(S.x, S.y); ctx.rotate(S.ang); ctx.scale(k, k);
    ctx.fillStyle = '#161616';
    ctx.strokeStyle = CFG.rimColor; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(-12, 0, 13, 10, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(4, 0, 9, 7, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath(); ctx.ellipse(-13, -3, 7, 3, 0, 0, Math.PI * 2); ctx.fill();
    // eyes
    ctx.fillStyle = '#e8e8e8';
    [[11, 1.8], [11, -1.8], [8.6, 4], [8.6, -4]].forEach(([x, y]) => {
      ctx.beginPath(); ctx.arc(x, y, 1.3, 0, Math.PI * 2); ctx.fill();
    });
    // fangs
    const open = S.eating ? 0.5 + 0.5 * Math.sin(S.time * 40) : 0.1;
    ctx.strokeStyle = '#161616'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
    [1, -1].forEach(sd => {
      ctx.beginPath();
      ctx.moveTo(12, sd * 2);
      ctx.lineTo(17, sd * (2.5 + open * 4));
      ctx.stroke();
    });
    ctx.restore();

    // crumbs
    for (const p of particles) {
      ctx.globalAlpha = 1 - p.life / p.max;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    if (!running) return;          // spider has left the page: stop the loop
    draw();
    requestAnimationFrame(frame);
  }

  /* ---------------------------- setup & wiring -------------------------- */
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    W = innerWidth; H = innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function start() {
    if (running) return;
    running = true;
    document.body.appendChild(canvas);
    resize();
    S.x = innerWidth / 2; S.y = -80; S.ang = Math.PI / 2;
    placeFeet();
    last = performance.now();
    requestAnimationFrame(frame);
  }

  function setRampage(on) {
    S.rampage = on;
    if (on) {
      S.leaving = false;           // changed its mind mid-exit
      start(); prepare();
    } else {
      S.target = null; S.eatT = 0; S.eating = false;
      if (running) {               // head for the nearest edge and leave
        const dl = S.x, dr = W - S.x, dtp = S.y, db = H - S.y;
        const m = Math.min(dl, dr, dtp, db);
        S.exitX = S.x; S.exitY = S.y;
        if (m === dl) S.exitX = -170;
        else if (m === dr) S.exitX = W + 170;
        else if (m === dtp) S.exitY = -170;
        else S.exitY = H + 170;
        S.leaving = true;
      }
    }
    document.querySelectorAll('[data-spider-toggle]')
      .forEach(b => b.setAttribute('aria-pressed', String(on)));
    if (ui.toggle) ui.toggle.textContent = on ? '\u{1F577} Call it off' : '\u{1F577} Release the spider';
  }
  const toggle = () => setRampage(!S.rampage);

  function updateUI() { if (ui.restore) ui.restore.hidden = eaten.length === 0; }

  function init() {
    const style = document.createElement('style');
    style.textContent = `
      .sp-ghost{position:fixed;pointer-events:none;z-index:9998;margin:0;box-sizing:border-box;white-space:nowrap;will-change:transform}
      .sp-ui{position:fixed;right:18px;bottom:18px;z-index:10000;display:flex;gap:8px;font-family:'DM Sans',system-ui,sans-serif}
      .sp-btn{cursor:pointer;border:1px solid rgba(255,255,255,.35);background:#111;color:#fff;padding:.6rem 1rem;border-radius:999px;font:inherit;font-size:.85rem;letter-spacing:.02em;box-shadow:0 6px 20px rgba(0,0,0,.25)}
      .sp-btn:hover{background:#222}
      .sp-btn[aria-pressed="true"]{background:#8b1e1e;border-color:#d44}
      .sp-btn[hidden]{display:none}`;
    document.head.appendChild(style);

    canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:fixed;inset:0;z-index:9999;pointer-events:none';
    ctx = canvas.getContext('2d');

    // injected buttons (skipped if the page already provides its own)
    const bar = document.createElement('div');
    bar.className = 'sp-ui'; bar.setAttribute('data-spider-ui', '');
    if (!document.querySelector('[data-spider-toggle]')) {
      ui.toggle = document.createElement('button');
      ui.toggle.className = 'sp-btn'; ui.toggle.type = 'button';
      ui.toggle.setAttribute('data-spider-toggle', '');
      ui.toggle.setAttribute('aria-pressed', 'false');
      ui.toggle.textContent = '\u{1F577} Release the spider';
      bar.appendChild(ui.toggle);
    }
    if (!document.querySelector('[data-spider-restore]')) {
      ui.restore = document.createElement('button');
      ui.restore.className = 'sp-btn'; ui.restore.type = 'button';
      ui.restore.setAttribute('data-spider-restore', '');
      ui.restore.textContent = 'Restore page';
      ui.restore.hidden = true;
      bar.appendChild(ui.restore);
    }
    if (bar.children.length) document.body.appendChild(bar);

    document.addEventListener('click', e => {
      if (e.target.closest('[data-spider-toggle]')) toggle();
      else if (e.target.closest('[data-spider-restore]')) restore();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && S.rampage) setRampage(false); });
    const track = e => { mouse.x = e.clientX; mouse.y = e.clientY; };
    window.addEventListener('pointermove', track, { passive: true });
    window.addEventListener('pointerdown', track, { passive: true });
    window.addEventListener('resize', () => { if (running) resize(); });

    // The spider stays hidden until the toggle button is pressed (see setRampage).
  }

  window.SpiderCrawler = { start, toggle, restore };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();