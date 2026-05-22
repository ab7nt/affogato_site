// Титры поверх canvas: задержки задаются в конфиге, движение — от прогресса сцены.
window.Affogato = window.Affogato || {};

Affogato.TitleOverlay = (function () {
  var groupEl, albumEl;
  var sceneStartedAt = null;

  function init() {
    groupEl = document.getElementById('title-group');
    albumEl = document.getElementById('title-album');

    var cfg = Affogato.Config.scenes.diving.titles;
    groupEl.textContent = cfg.group.text;
    albumEl.textContent = cfg.album.text;
    document.documentElement.style.setProperty('--title-size-scale', cfg.sizeScale || 1);
  }

  function clamp01(v) {
    return v < 0 ? 0 : (v > 1 ? 1 : v);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function updateItem(el, itemCfg, progress, visibleProgress) {
    var motion = easeOutCubic(progress);
    var reveal = clamp01(visibleProgress);
    var opacity = lerp(itemCfg.opacityStart, itemCfg.opacityEnd, motion) * reveal;

    el.style.top = lerp(itemCfg.startTopVH, itemCfg.endTopVH, motion) + 'vh';
    el.style.opacity = opacity.toFixed(3);
  }

  function render(sceneProgress, offsetFrac) {
    if (!groupEl || !albumEl) return;

    var cfg = Affogato.Config.scenes.diving.titles;
    var now = performance.now();
    var sceneOnScreen = (offsetFrac || 0) >= -0.02;

    if (sceneOnScreen && sceneStartedAt === null) sceneStartedAt = now;
    if (sceneStartedAt === null) return;

    var elapsedSec = (now - sceneStartedAt) / 1000;
    var groupReveal = (elapsedSec - cfg.group.delaySec) / 0.9;
    var albumReveal = (elapsedSec - cfg.group.delaySec - cfg.album.delaySec) / 0.9;

    updateItem(groupEl, cfg.group, sceneProgress, groupReveal);
    updateItem(albumEl, cfg.album, sceneProgress, albumReveal);
  }

  function hide() {
    if (groupEl) groupEl.style.opacity = 0;
    if (albumEl) albumEl.style.opacity = 0;
  }

  return { init: init, render: render, hide: hide };
})();
