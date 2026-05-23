// Титры поверх canvas: задержки задаются в конфиге, движение — от прогресса сцены.
window.Affogato = window.Affogato || {};

Affogato.TitleOverlay = (function () {
  var groupEl, albumEl;
  var sceneStartedAt = null;
  var groupBaseOpacity = 0;
  var albumBaseOpacity = 0;
  var albumRevealValue = 0;
  var finalFade = 1;
  var staticMode = false; // на время плеера титры замораживаются в «приглушённом» конце
  var groupTopVH = 0;
  var albumTopVH = 0;
  var playerTransition = null;

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

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function resolveItemConfig(cfg, key) {
    var item = {};
    var base = cfg[key];
    var mobile = cfg.mobile && cfg.mobile[key];
    var useMobile = window.matchMedia && window.matchMedia('(max-width: 760px)').matches;

    for (var prop in base) item[prop] = base[prop];
    if (useMobile && mobile) {
      for (var mobileProp in mobile) item[mobileProp] = mobile[mobileProp];
    }
    return item;
  }

  function applyOpacity(el, baseOpacity) {
    el.style.opacity = (baseOpacity * finalFade).toFixed(3);
  }

  function updateItem(el, itemCfg, progress, visibleProgress) {
    var motion = easeOutCubic(progress);
    var reveal = clamp01(visibleProgress);
    var opacity = lerp(itemCfg.opacityStart, itemCfg.opacityEnd, motion) * reveal;

    var top = lerp(itemCfg.startTopVH, itemCfg.endTopVH, motion);
    el.style.top = top + 'vh';
    if (el === groupEl) groupTopVH = top;
    if (el === albumEl) albumTopVH = top;
    return opacity;
  }

  function currentState() {
    return {
      groupTop: groupTopVH,
      albumTop: albumTopVH,
      groupOpacity: groupBaseOpacity * finalFade,
      albumOpacity: albumBaseOpacity * finalFade,
    };
  }

  function playerState() {
    var cfg = Affogato.Config.scenes.diving.titles;
    var groupCfg = resolveItemConfig(cfg, 'group');
    var albumCfg = resolveItemConfig(cfg, 'album');
    var p = cfg.player || {};
    return {
      groupTop: p.groupTopVH != null ? p.groupTopVH : groupCfg.endTopVH,
      albumTop: p.albumTopVH != null ? p.albumTopVH : albumCfg.endTopVH,
      groupOpacity: p.groupOpacity != null ? p.groupOpacity : groupCfg.opacityEnd,
      albumOpacity: p.albumOpacity != null ? p.albumOpacity : albumCfg.opacityEnd,
    };
  }

  function surfaceState() {
    var cfg = Affogato.Config.scenes.diving.titles;
    var groupCfg = resolveItemConfig(cfg, 'group');
    var albumCfg = resolveItemConfig(cfg, 'album');
    return {
      groupTop: groupCfg.startTopVH,
      albumTop: albumCfg.startTopVH,
      groupOpacity: 0,
      albumOpacity: 0,
    };
  }

  function applyState(state) {
    groupTopVH = state.groupTop;
    albumTopVH = state.albumTop;
    groupBaseOpacity = state.groupOpacity;
    albumBaseOpacity = state.albumOpacity;
    finalFade = 1;
    groupEl.style.top = groupTopVH + 'vh';
    albumEl.style.top = albumTopVH + 'vh';
    applyOpacity(groupEl, groupBaseOpacity);
    applyOpacity(albumEl, albumBaseOpacity);
  }

  function interpolateState(from, to, t) {
    return {
      groupTop: lerp(from.groupTop, to.groupTop, t),
      albumTop: lerp(from.albumTop, to.albumTop, t),
      groupOpacity: lerp(from.groupOpacity, to.groupOpacity, t),
      albumOpacity: lerp(from.albumOpacity, to.albumOpacity, t),
    };
  }

  function render(sceneProgress, offsetFrac) {
    if (!groupEl || !albumEl) return;
    if (staticMode) return; // в режиме плеера титры держатся в конечном состоянии

    var cfg = Affogato.Config.scenes.diving.titles;
    var now = performance.now();
    var sceneOnScreen = (offsetFrac || 0) >= -0.02;

    if (sceneOnScreen && sceneStartedAt === null) sceneStartedAt = now;
    if (sceneStartedAt === null) return;

    var elapsedSec = (now - sceneStartedAt) / 1000;
    var groupReveal = (elapsedSec - cfg.group.delaySec) / 0.9;
    var albumReveal = (elapsedSec - cfg.group.delaySec - cfg.album.delaySec) / 0.9;
    albumRevealValue = clamp01(albumReveal);

    groupBaseOpacity = updateItem(groupEl, resolveItemConfig(cfg, 'group'), sceneProgress, groupReveal);
    albumBaseOpacity = updateItem(albumEl, resolveItemConfig(cfg, 'album'), sceneProgress, albumReveal);
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
    staticMode = false;
    playerTransition = null;
    hide();
  }

  function beginPlayerTransition(direction) {
    if (!groupEl || !albumEl) return;
    staticMode = true;
    var target = direction === 'up' ? surfaceState() : playerState();
    playerTransition = {
      from: direction === 'up' ? playerState() : currentState(),
      to: target,
    };
  }

  function renderPlayerTransition(progress) {
    if (!playerTransition || !groupEl || !albumEl) return;
    var t = easeInOutCubic(clamp01(progress));
    applyState(interpolateState(playerTransition.from, playerTransition.to, t));
  }

  // Замораживает титры в их «конечном приглушённом» виде — для режима плеера.
  // Позиции и opacity берутся из titles.player.* (если задано) либо из endTopVH/opacityEnd
  // карточечного состояния. В config регулируется верх «АФФОГАТО» под плеер.
  function setStatic(active) {
    staticMode = !!active;
    if (!staticMode || !groupEl || !albumEl) return;
    var cfg = Affogato.Config.scenes.diving.titles;
    var groupCfg = resolveItemConfig(cfg, 'group');
    var albumCfg = resolveItemConfig(cfg, 'album');
    var p = cfg.player || {};
    var groupTop = p.groupTopVH != null ? p.groupTopVH : groupCfg.endTopVH;
    var albumTop = p.albumTopVH != null ? p.albumTopVH : albumCfg.endTopVH;
    var groupOp = p.groupOpacity != null ? p.groupOpacity : groupCfg.opacityEnd;
    var albumOp = p.albumOpacity != null ? p.albumOpacity : albumCfg.opacityEnd;
    finalFade = 1;
    groupBaseOpacity = groupOp;
    albumBaseOpacity = albumOp;
    groupEl.style.top = groupTop + 'vh';
    albumEl.style.top = albumTop + 'vh';
    groupTopVH = groupTop;
    albumTopVH = albumTop;
    applyOpacity(groupEl, groupBaseOpacity);
    applyOpacity(albumEl, albumBaseOpacity);
  }

  return {
    init: init,
    render: render,
    hide: hide,
    reset: reset,
    getAlbumReveal: getAlbumReveal,
    setFinalFade: setFinalFade,
    setStatic: setStatic,
    beginPlayerTransition: beginPlayerTransition,
    renderPlayerTransition: renderPlayerTransition,
  };
})();
