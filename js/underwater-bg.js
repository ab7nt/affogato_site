// Подводный фон песенных сцен: глубинный градиент + взвесь + свет.
// Свет сверху затухает с глубиной сцены, снизу (фонарик телефона) — разгорается.
// Полностью процедурный, детерминирован от общего времени performance.now() —
// все карточки показывают одну «воду», переходы между ними бесшовные.
window.Affogato = window.Affogato || {};

Affogato.UnderwaterBg = (function () {
  var particles = null;
  var rays = null;

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function clamp01(v) {
    return v < 0 ? 0 : (v > 1 ? 1 : v);
  }

  function wrap01(v) {
    v = v % 1;
    return v < 0 ? v + 1 : v;
  }

  function hexToRgb(hex) {
    var h = hex.replace('#', '');
    return {
      r: parseInt(h.substring(0, 2), 16),
      g: parseInt(h.substring(2, 4), 16),
      b: parseInt(h.substring(4, 6), 16),
    };
  }

  function withAlpha(hex, a) {
    var c = hexToRgb(hex);
    return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + a + ')';
  }

  function lerpColor(hexA, hexB, t) {
    var a = hexToRgb(hexA), b = hexToRgb(hexB);
    return 'rgb(' +
      Math.round(a.r + (b.r - a.r) * t) + ',' +
      Math.round(a.g + (b.g - a.g) * t) + ',' +
      Math.round(a.b + (b.b - a.b) * t) + ')';
  }

  // Взвесь: каждая частица — набор констант, позиция вычисляется от времени.
  // depth 0..1 — дальние мельче, тусклее и медленнее, ближние крупнее и ярче.
  function buildParticles(count) {
    var arr = [];
    for (var i = 0; i < count; i++) {
      var depth = Math.random();
      arr.push({
        baseX: Math.random(),
        baseY: Math.random(),
        depth: depth,
        size: rand(0.5, 2.2) * (0.6 + depth),
        drift: rand(0.006, 0.022) * (0.5 + depth), // медленный подъём, доли экрана/сек
        wobbleAmp: rand(0.004, 0.02),
        wobbleFreq: rand(0.1, 0.4),
        phase: rand(0, Math.PI * 2),
        bright: rand(0.25, 1),
      });
    }
    return arr;
  }

  // Лучи: мягкие световые пятна из источника выше верхней кромки экрана.
  function buildRays(count) {
    var arr = [];
    for (var i = 0; i < count; i++) {
      arr.push({
        baseX: (i + 0.5) / count + rand(-0.1, 0.1),
        swayAmp: rand(0.03, 0.07),
        swayFreq: rand(0.04, 0.1), // период покачивания ~60–150 с — очень медленно
        phase: rand(0, Math.PI * 2),
        spread: rand(0.55, 0.95),
        intensity: rand(0.55, 1),
      });
    }
    return arr;
  }

  function drawGradient(ctx, w, h, cfg, topMul) {
    // С глубиной сцены верх воды темнеет к цвету дна — света сверху всё меньше.
    var topCol = lerpColor(cfg.topColor, cfg.bottomColor, 1 - topMul);
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, topCol);
    g.addColorStop(1, cfg.bottomColor);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  // Лучи света сверху, яркость масштабируется topMul (затухает с глубиной сцены).
  function drawRays(ctx, w, h, t, cfg, topMul) {
    if (topMul <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < rays.length; i++) {
      var ray = rays[i];
      var cx = (ray.baseX + Math.sin(t * ray.swayFreq + ray.phase) * ray.swayAmp) * w;
      var cy = -h * 0.3; // источник света выше экрана
      var reach = h * (0.9 + ray.spread);
      var peak = cfg.opacity * ray.intensity * topMul;
      var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, reach);
      g.addColorStop(0, withAlpha(cfg.color, peak));
      g.addColorStop(0.5, withAlpha(cfg.color, peak * 0.4));
      g.addColorStop(1, withAlpha(cfg.color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();
  }

  // Свет снизу — фонарик у дна. Цвет тот же, что у света сверху (rays.color).
  // Разгорается с глубиной сцены.
  function drawBottomGlow(ctx, w, h, t, level) {
    if (level <= 0) return;
    var cfg = Affogato.Config.underwater;
    var color = cfg.rays.color;
    var flicker = 1 + Math.sin(t * 1.3) * 0.04 + Math.sin(t * 0.7) * 0.03;
    var peak = cfg.bottomGlow.opacity * level * flicker;
    var cx = cfg.bottomGlow.centerX * w; // положение источника по горизонтали
    var cy = h * 1.16; // источник чуть ниже нижней кромки экрана
    var reach = h * 1.15;
    var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, reach);
    g.addColorStop(0, withAlpha(color, peak));
    g.addColorStop(0.5, withAlpha(color, peak * 0.42));
    g.addColorStop(1, withAlpha(color, 0));
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  function drawParticles(ctx, w, h, t, cfg) {
    var unit = h / 1100; // нормировка размера к высоте экрана
    ctx.save();
    ctx.fillStyle = cfg.color;
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      var x = wrap01(p.baseX + Math.sin(t * p.wobbleFreq + p.phase) * p.wobbleAmp) * w;
      var y = wrap01(p.baseY - t * p.drift * cfg.speed) * h;
      var r = p.size * (cfg.sizeScale || 1) * unit;
      var alpha = (cfg.minOpacity + (cfg.maxOpacity - cfg.minOpacity) * p.bright) *
                  (0.4 + 0.6 * p.depth);
      ctx.globalAlpha = clamp01(alpha);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Перерисовывает подводный фон в ctx (w×h — размер canvas в px).
  // depth 0..1 — положение сцены в череде песен (0 — первая, 1 — последняя):
  // верхний свет с ним гаснет, нижний (фонарик) — разгорается.
  function render(ctx, w, h, depth, timeScale) {
    var cfg = Affogato.Config.underwater;
    var t = (performance.now() / 1000) * (timeScale || 1);
    var d = clamp01(depth || 0);

    if (!particles) particles = buildParticles(cfg.particles.count);
    if (!rays) rays = buildRays(cfg.rays.count);

    var dl = cfg.depthLight;
    var topMul = dl.topStart + (dl.topEnd - dl.topStart) * d;
    var bottomLevel = dl.bottomStart + (dl.bottomEnd - dl.bottomStart) * d;

    drawGradient(ctx, w, h, cfg, topMul);
    drawRays(ctx, w, h, t, cfg.rays, topMul);
    drawBottomGlow(ctx, w, h, t, bottomLevel);
    drawParticles(ctx, w, h, t, cfg.particles);
  }

  // Только нижний свет — для финальной видео-сцены: на её входе свет
  // продолжается с последней карточки и плавно гаснет (видео берёт его на себя).
  function renderBottomGlow(ctx, w, h, level) {
    drawBottomGlow(ctx, w, h, performance.now() / 1000, level);
  }

  // Только взвесь — для статичного фона плеера (стоп-кадр со дна + лёгкая взвесь).
  function renderParticles(ctx, w, h) {
    var cfg = Affogato.Config.underwater;
    if (!particles) particles = buildParticles(cfg.particles.count);
    drawParticles(ctx, w, h, performance.now() / 1000, cfg.particles);
  }

  return {
    render: render,
    renderBottomGlow: renderBottomGlow,
    renderParticles: renderParticles,
  };
})();
