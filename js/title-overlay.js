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

  var clamp01 = Affogato.Utils.clamp01;
  var easeOutCubic = Affogato.Utils.easeOutCubic;
  var easeInOutCubic = Affogato.Utils.easeInOutCubic;

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function isMobile() {
    return !!(window.matchMedia && window.matchMedia('(max-width: 760px)').matches);
  }

  function resolveItemConfig(cfg, key) {
    var item = {};
    var base = cfg[key];
    var mobile = cfg.mobile && cfg.mobile[key];

    for (var prop in base) item[prop] = base[prop];
    if (isMobile() && mobile) {
      for (var mobileProp in mobile) item[mobileProp] = mobile[mobileProp];
    }
    return item;
  }

  // Аналогично resolveItemConfig, но для составных «state»-блоков
  // (titles.player.*, titles.polaroid.*). Сливает mobile[stateName] поверх
  // базового. Используется в setStatic и playerState — благодаря этому на
  // мобиле можно отдельно крутить позиции титров под плеер и полароид.
  function resolveStateConfig(cfg, stateName) {
    var out = {};
    var base = cfg[stateName] || {};
    var mobile = cfg.mobile && cfg.mobile[stateName];
    for (var prop in base) out[prop] = base[prop];
    if (isMobile() && mobile) {
      for (var mobileProp in mobile) out[mobileProp] = mobile[mobileProp];
    }
    return out;
  }

  function applyOpacity(el, baseOpacity) {
    el.style.opacity = (baseOpacity * finalFade).toFixed(3);
  }

  // Защита от налегания титров на «вернуться»/«погрузиться» при низких экранах:
  // на больших экранах позиция в vh, на маленьких — rem-минимум держит дистанцию
  // от кромки (учитывает высоту кнопок с шевроном/подсказкой и полу-высоту шрифта).
  // На мобиле сами кнопки .return-hint / .scroll-hint компактнее (≈3.5rem против
  // ≈4.7rem на десктопе) и шрифт титров мельче — guard уменьшаем, иначе title
  // отрывается далеко вниз от кнопки.
  var EDGE_REM_DESKTOP = 8;
  var EDGE_REM_MOBILE = 5.4;
  function topWithEdgeGuard(topVH, el) {
    var rem = isMobile() ? EDGE_REM_MOBILE : EDGE_REM_DESKTOP;
    if (el === groupEl) {
      return 'max(' + topVH.toFixed(2) + 'vh, ' + rem + 'rem)';
    }
    if (el === albumEl) {
      return 'min(' + topVH.toFixed(2) + 'vh, calc(100vh - ' + rem + 'rem))';
    }
    return topVH + 'vh';
  }

  function updateItem(el, itemCfg, progress, visibleProgress) {
    var motion = easeOutCubic(progress);
    var reveal = clamp01(visibleProgress);
    var opacity = lerp(itemCfg.opacityStart, itemCfg.opacityEnd, motion) * reveal;

    var top = lerp(itemCfg.startTopVH, itemCfg.endTopVH, motion);
    el.style.top = topWithEdgeGuard(top, el);
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
    var p = resolveStateConfig(cfg, 'player');
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
    groupEl.style.top = topWithEdgeGuard(groupTopVH, groupEl);
    albumEl.style.top = topWithEdgeGuard(albumTopVH, albumEl);
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

    // Снимаем CSS-transition: при покадровой анимации он создаёт отставание.
    // setStatic выставляет transition обратно, когда нужна плавность смены режима.
    groupEl.style.transition = '';
    albumEl.style.transition = '';

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
    // playerTransition сам анимирует position/opacity по rAF (через applyState
    // каждый кадр). Если на элементе висит CSS-transition (он остаётся от
    // предыдущего setStatic, который ставит 0.6s ease), браузер будет
    // интерполировать поверх — получится отставание/разсинхрон позиции
    // и opacity. Сбрасываем transition, пусть rAF-tween идёт чисто.
    groupEl.style.transition = '';
    albumEl.style.transition = '';
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

  // Замораживает титры в их «конечном приглушённом» виде. По умолчанию режим
  // 'player' (titles.player.* — позиция и opacity под кнопку «вернуться» в
  // плеере). Можно передать другое имя — например 'polaroid' для смещённой
  // позиции АФФОГАТО на полароид-сценах. CSS-transition включается только в
  // статическом режиме: при diving render() ставит transition='' и движение
  // идёт по rAF, чтобы переходить между сценами без отставания.
  function setStatic(active, stateName) {
    staticMode = !!active;
    if (!staticMode || !groupEl || !albumEl) return;
    var cfg = Affogato.Config.scenes.diving.titles;
    var groupCfg = resolveItemConfig(cfg, 'group');
    var albumCfg = resolveItemConfig(cfg, 'album');
    var stateCfg = resolveStateConfig(cfg, stateName || 'player');
    var groupTop = stateCfg.groupTopVH != null ? stateCfg.groupTopVH : groupCfg.endTopVH;
    var albumTop = stateCfg.albumTopVH != null ? stateCfg.albumTopVH : albumCfg.endTopVH;
    var groupOp = stateCfg.groupOpacity != null ? stateCfg.groupOpacity : groupCfg.opacityEnd;
    var albumOp = stateCfg.albumOpacity != null ? stateCfg.albumOpacity : albumCfg.opacityEnd;
    finalFade = 1;
    groupBaseOpacity = groupOp;
    albumBaseOpacity = albumOp;
    var trans = 'top 0.6s ease, opacity 0.6s ease';
    groupEl.style.transition = trans;
    albumEl.style.transition = trans;
    groupEl.style.top = topWithEdgeGuard(groupTop, groupEl);
    albumEl.style.top = topWithEdgeGuard(albumTop, albumEl);
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
