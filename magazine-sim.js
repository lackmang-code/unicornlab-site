/* =========================================================
   유니콘랩 — 매거진 조립 시뮬레이션
   흩어진 조각(사진·텍스트)이 날아와 펼침 지면으로 정렬된다.
   순수 canvas 2D · 외부 라이브러리 없음

   색 처리: 조각은 흩어져 있을 때(어두운 배경 위)와
   지면에 안착했을 때(흰 종이 위)의 색이 다르다. 진행도에 따라 섞는다.
   ========================================================= */
(function () {
  'use strict';

  var canvas = document.getElementById('magazine-sim');
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');

  var reduced = window.matchMedia &&
                window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- 색 (r, g, b, a) ---- */
  var PAPER     = '#F7F6F2';
  var INDIGO    = [45, 42, 110, 1];
  var INDIGO_L  = [91, 95, 207, 1];
  var CORAL     = [255, 122, 89, 1];
  var OCHER     = [255, 209, 102, 1];
  var INK_LINE  = [45, 42, 110, 0.30];   /* 지면 위 본문 줄 */
  var INK_BAR   = [45, 42, 110, 0.58];   /* 지면 위 제목 바 */
  var LT_LINE   = [247, 246, 242, 0.38]; /* 어두운 배경 위 본문 줄 */
  var LT_BAR    = [247, 246, 242, 0.68];
  var LT_SOLID  = [247, 246, 242, 0.92];

  function rgba(c) {
    return 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' +
           Math.round(c[2]) + ',' + c[3].toFixed(3) + ')';
  }
  function mix(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t,
            a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t];
  }

  /* ---------------------------------------------------------
     펼침 지면 레이아웃 (정규화 좌표 0~1) — x = 0.5 가 접힘선
     c  = 지면에 안착했을 때 색 / cd = 흩어져 있을 때 색
     --------------------------------------------------------- */
  function buildLayout() {
    var L = [];
    var i, j, col;

    /* -- 왼쪽 페이지 -- */
    L.push({ x: .055, y: .075, w: .385, h: .295, t: 'photo', c: INDIGO,  cd: INDIGO_L });
    L.push({ x: .055, y: .420, w: .300, h: .042, t: 'bar',   c: INK_BAR, cd: LT_BAR   });
    L.push({ x: .055, y: .482, w: .185, h: .024, t: 'bar',   c: CORAL,   cd: CORAL    });
    for (i = 0; i < 6; i++) {
      L.push({
        x: .055, y: .545 + i * .039,
        w: .34 - (i % 3) * .045, h: .013,
        t: 'line', c: INK_LINE, cd: LT_LINE
      });
    }
    L.push({ x: .055, y: .875, w: .062, h: .026, t: 'tag', c: OCHER, cd: OCHER });

    /* -- 오른쪽 페이지 -- */
    L.push({ x: .545, y: .068, w: .250, h: .034, t: 'masthead', c: INDIGO,   cd: LT_SOLID });
    L.push({ x: .545, y: .140, w: .190, h: .150, t: 'photo',    c: CORAL,    cd: CORAL    });
    L.push({ x: .757, y: .140, w: .198, h: .150, t: 'photo',    c: INDIGO_L, cd: INDIGO_L });
    L.push({ x: .545, y: .335, w: .410, h: .048, t: 'quote',    c: CORAL,    cd: CORAL    });
    for (col = 0; col < 2; col++) {
      for (j = 0; j < 8; j++) {
        L.push({
          x: col === 0 ? .545 : .757,
          y: .440 + j * .037,
          w: (col === 0 ? .190 : .198) - (j === 7 ? .06 : 0),
          h: .013,
          t: 'line', c: INK_LINE, cd: LT_LINE
        });
      }
    }
    L.push({ x: .905, y: .885, w: .050, h: .022, t: 'tag', c: INDIGO_L, cd: INDIGO_L });

    return L;
  }

  var LAYOUT = buildLayout();

  var pieces = LAYOUT.map(function (o, i) {
    return {
      home: o,
      sx: 0, sy: 0, srot: 0, sscale: 1,   /* 흩어진 자세 */
      x: 0, y: 0, w: 0, h: 0, rot: 0,     /* 현재 화면 좌표 */
      px: 0, py: 0,                       /* 마우스 밀림 */
      delay: 0,
      seed: (i * 0.618033988749895) % 1
    };
  });

  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function easeOutCubic(x) { return 1 - Math.pow(1 - x, 3); }
  function easeInCubic(x) { return x * x * x; }

  function reseed() {
    pieces.forEach(function (p) {
      /* 흩어진 동안에도 눈에 보이도록 무대 안팎에 고루 뿌린다 */
      p.sx = rand(-.08, 1.08) - p.home.w / 2;
      p.sy = rand(-.06, 1.06) - p.home.h / 2;
      p.srot = rand(-0.85, 0.85);
      p.sscale = rand(0.55, 1.30);
      p.delay = rand(0, 0.42);
    });
  }
  reseed();

  /* ---- 사이클: 조립 → 유지 → 흩어짐 → 쉼 ---- */
  var T = { assemble: 2400, hold: 2800, scatter: 1600, gap: 900 };
  var CYCLE = T.assemble + T.hold + T.scatter + T.gap;
  var t0 = null;
  var lastCycle = 0;

  function globalProgress(ms) {
    var t = ms % CYCLE;
    if (t < T.assemble) return { p: t / T.assemble, phase: 'in' };
    t -= T.assemble;
    if (t < T.hold) return { p: 1, phase: 'hold' };
    t -= T.hold;
    if (t < T.scatter) return { p: 1 - t / T.scatter, phase: 'out' };
    return { p: 0, phase: 'gap' };
  }

  /* ---- 캔버스 ---- */
  var W = 0, H = 0, DPR = 1;
  function resize() {
    var r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  function stage() {
    var padX = W * 0.045, padY = H * 0.075;
    return { x: padX, y: padY, w: W - padX * 2, h: H - padY * 2 };
  }

  /* ---- 마우스 ---- */
  var mouse = { x: -9999, y: -9999, on: false };
  canvas.addEventListener('pointermove', function (e) {
    var r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
    mouse.on = true;
  });
  canvas.addEventListener('pointerleave', function () { mouse.on = false; });

  /* ---- 스크롤: 히어로를 벗어날수록 옅어짐 ---- */
  var scrollFade = 1;
  function onScroll() {
    var hero = document.getElementById('hero');
    if (!hero) return;
    var h = hero.getBoundingClientRect();
    scrollFade = 1 - clamp01(-h.top / (h.height * 0.85));
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ---- 그리기 ---- */
  function roundRect(x, y, w, h, r) {
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* 지면이 놓일 자리 — 늘 희미하게 보여 목표를 암시한다 */
  function drawGhost(s, a) {
    if (a <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.strokeStyle = 'rgba(247,246,242,0.13)';
    ctx.lineWidth = 1;
    roundRect(s.x + .5, s.y + .5, s.w - 1, s.h - 1, 3);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s.x + s.w / 2, s.y + s.h * .06);
    ctx.lineTo(s.x + s.w / 2, s.y + s.h * .94);
    ctx.stroke();
    ctx.restore();
  }

  /* 완성된 종이(펼침면) */
  function drawPaper(s, a) {
    if (a <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 38 * a;
    ctx.shadowOffsetY = 16 * a;
    ctx.fillStyle = PAPER;
    roundRect(s.x, s.y, s.w, s.h, 3);
    ctx.fill();
    ctx.restore();

    /* 가운데 접힘선 */
    ctx.save();
    ctx.globalAlpha = a * 0.9;
    var cx = s.x + s.w / 2;
    var g = ctx.createLinearGradient(cx - 15, 0, cx + 15, 0);
    g.addColorStop(0, 'rgba(22,21,46,0)');
    g.addColorStop(0.5, 'rgba(22,21,46,0.15)');
    g.addColorStop(1, 'rgba(22,21,46,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - 15, s.y, 30, s.h);
    ctx.restore();
  }

  function drawPiece(p, local, alpha) {
    var o = p.home;
    var col = rgba(mix(o.cd, o.c, local));
    var w = p.w, h = p.h, x = -w / 2, y = -h / 2;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
    ctx.rotate(p.rot);

    if (o.t === 'photo') {
      ctx.fillStyle = col;
      roundRect(x, y, w, h, 2); ctx.fill();
      /* 사진처럼 보이는 밝은 사선 */
      ctx.globalAlpha = alpha * 0.22;
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.moveTo(x, y + h);
      ctx.lineTo(x + w * 0.55, y + h * 0.30);
      ctx.lineTo(x + w, y + h);
      ctx.closePath(); ctx.fill();
    } else if (o.t === 'quote') {
      ctx.globalAlpha = alpha * 0.20;
      ctx.fillStyle = col;
      roundRect(x, y, w, h, 2); ctx.fill();
      ctx.globalAlpha = alpha;
      ctx.fillRect(x, y, Math.max(2, w * 0.014), h);
    } else if (o.t === 'masthead') {
      ctx.fillStyle = col;
      ctx.font = '600 ' + Math.max(9, h * 0.80) + 'px Fraunces, Georgia, serif';
      ctx.textBaseline = 'middle';
      if ('letterSpacing' in ctx) ctx.letterSpacing = (h * 0.12) + 'px';
      ctx.fillText('UNICORN LAB', x, 0);
      ctx.globalAlpha = alpha * 0.5;
      ctx.fillRect(x, y + h * 1.3, w, Math.max(1, h * 0.06));
    } else if (o.t === 'tag') {
      ctx.fillStyle = col;
      roundRect(x, y, w, h, h / 2); ctx.fill();
    } else {
      /* bar / line */
      ctx.fillStyle = col;
      roundRect(x, y, w, h, Math.min(2, h / 2)); ctx.fill();
    }
    ctx.restore();
  }

  /* ---- 메인 루프 ---- */
  function frame(ts) {
    if (!W || !H) resize();
    if (t0 === null) t0 = ts;
    var ms = ts - t0;

    var g = reduced ? { p: 1, phase: 'hold' } : globalProgress(ms);

    var cyc = Math.floor(ms / CYCLE);
    if (cyc !== lastCycle) { lastCycle = cyc; reseed(); }

    var s = stage();
    ctx.clearRect(0, 0, W, H);

    var fade = reduced ? 1 : Math.max(0, scrollFade);
    if (fade <= 0.01) { requestAnimationFrame(frame); return; }

    var paperA = clamp01((g.p - 0.42) / 0.38);
    drawGhost(s, (1 - paperA) * fade);
    drawPaper(s, paperA * fade);

    for (var i = 0; i < pieces.length; i++) {
      var p = pieces[i], o = p.home;

      var local;
      if (g.phase === 'out') {
        local = easeInCubic(clamp01((g.p - p.delay * 0.5) / (1 - p.delay * 0.5)));
      } else {
        local = easeOutCubic(clamp01((g.p - p.delay) / (1 - p.delay)));
      }

      /* 정렬된 자세 */
      var hx = s.x + o.x * s.w, hy = s.y + o.y * s.h;
      var hw = o.w * s.w, hh = o.h * s.h;
      /* 흩어진 자세 */
      var qx = s.x + p.sx * s.w, qy = s.y + p.sy * s.h;
      var qw = hw * p.sscale, qh = hh * p.sscale;

      p.x = qx + (hx - qx) * local;
      p.y = qy + (hy - qy) * local;
      p.w = qw + (hw - qw) * local;
      p.h = qh + (hh - qh) * local;
      p.rot = p.srot * (1 - local);

      /* 마우스로 밀어내기 */
      var tx = 0, ty = 0;
      if (mouse.on && !reduced) {
        var dx = (p.x + p.w / 2) - mouse.x;
        var dy = (p.y + p.h / 2) - mouse.y;
        var d2 = dx * dx + dy * dy;
        var R = Math.min(W, H) * 0.30;
        if (d2 < R * R && d2 > 0.01) {
          var d = Math.sqrt(d2);
          var f = (1 - d / R) * 26;
          tx = (dx / d) * f; ty = (dy / d) * f;
        }
      }
      p.px += (tx - p.px) * 0.12;
      p.py += (ty - p.py) * 0.12;
      p.x += p.px; p.y += p.py;

      /* 떠 있는 동안 미세한 부유감 */
      if (local < 0.995) {
        var fl = (1 - local) * 6;
        p.x += Math.sin(ms / 900 + p.seed * 12) * fl;
        p.y += Math.cos(ms / 1100 + p.seed * 9) * fl;
      }

      drawPiece(p, local, (0.55 + 0.45 * local) * fade);
    }

    requestAnimationFrame(frame);
  }

  /* ---- 시작 (웹폰트를 기다리지 않는다) ---- */
  if (window.ResizeObserver) {
    new ResizeObserver(resize).observe(canvas);
  } else {
    window.addEventListener('resize', resize);
  }
  resize();
  onScroll();
  requestAnimationFrame(frame);
})();
