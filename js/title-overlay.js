// Титры поверх canvas: задержки задаются в конфиге, движение — от прогресса сцены.
window.Affogato = window.Affogato || {};

Affogato.TitleOverlay = (function () {
  var groupEl, albumEl;
  var sceneStartedAt = null;
  var groupBaseOpacity = 0;
  var albumBaseOpacity = 0;
  var albumRevealValue = 0;
  var finalFade = 1;

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

  function applyOpacity(el, baseOpacity) {
    el.style.opacity = (baseOpacity * finalFade).toFixed(3);
  }

  function updateItem(el, itemCfg, progress, visibleProgress) {
    var motion = easeOutCubic(progress);
    var reveal = clamp01(visibleProgress);
    var opacity = lerp(itemCfg.opacityStart, itemCfg.opacityEnd, motion) * reveal;

    el.style.top = lerp(itemCfg.startTopVH, itemCfg.endTopVH, motion) + 'vh';
    return opacity;
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
    albumRevealValue = clamp01(albumReveal);

    groupBaseOpacity = updateItem(groupEl, cfg.group, sceneProgress, groupReveal);
    albumBaseOpacity = updateItem(albumEl, cfg.album, sceneProgress, albumReveal);
    applyOpacity(groupEl, groupBaseOpacity);
    applyOpacity(albumEl, albumBaseOpacity);
  }

  function hide() {
    if (groupEl) groupEl.style.opacity = 0;
    if (albumEl) albumEl.style.opacity = 0;
  }

  function getAlbumReveal() {
    return albumRevealValue;
  }

  function setFinalFade(value) {
    finalFade = clamp01(value);
    if (groupEl) applyOpacity(groupEl, groupBaseOpacity);
    if (albumEl) applyOpacity(albumEl, albumBaseOpacity);
  }

  function reset() {
    sceneStartedAt = null;
    groupBaseOpacity = 0;
    albumBaseOpacity = 0;
    albumRevealValue = 0;
    finalFade = 1;
    hide();
  }

  return {
    init: init,
    render: render,
    hide: hide,
    reset: reset,
    getAlbumReveal: getAlbumReveal,
    setFinalFade: setFinalFade,
  };
})();
