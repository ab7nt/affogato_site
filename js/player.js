// Локальный плеер альбома: триггерится кликом по «послушать» в верхней навигации.
// Сценарий: погружение → стоп-кадр со дна + лёгкая взвесь → плеер → клик play.
// Выход — клик «вернуться» сверху или scroll-up (wheel / touch).
window.Affogato = window.Affogato || {};

Affogato.Player = (function () {
  var triggerEl, playerShellEl, playerEl, titleEl, playBtn, prevBtn, nextBtn;
  var volumeBtn, volumeRange, timeEl, timeCurrentEl, timeTotalEl;
  var returnHintEl, elsewhereBtn, elsewhereTextEl, platformsEl, audioEl;
  var tracks = [];
  var currentIdx = 0;
  var stoneImage = null;
  var divingFrames = null;
  var mode = 'closed'; // 'closed' | 'descending' | 'open' | 'ascending'
  var touchLastY = 0;
  var returnScrollDebt = 0;
  var lastReturnScrollAt = 0;
  var returnPreviewProgress = 0;
  var returnPreviewTimer = null;
  var returnPreviewRaf = null;
  var titleCrossfadeTimer = null;
  var hasStartedPlayback = false;
  var wantsPlayback = false;

  var STORAGE_VOLUME = 'affogato.volume';
  var STORAGE_MUTED = 'affogato.muted';

  function init(opts) {
    triggerEl = opts.triggerEl;
    divingFrames = opts.frames || null;

    var items = (Affogato.Config.scenes.songs && Affogato.Config.scenes.songs.items) || [];
    tracks = items
      .filter(function (it) { return it.audio; })
      .map(function (it) { return { title: it.title, audio: it.audio }; });

    preloadStone();
    createDom();
    bindEvents();
  }

  function isActive() {
    return mode !== 'closed';
  }

  function playerCfg() {
    return Affogato.Config.player || {};
  }

  // ───────────────────────────────────────────────── DOM ──

  function preloadStone() {
    stoneImage = new Image();
    stoneImage.src = playerCfg().stillSrc || 'assets/stone-still.png';
  }

  function createDom() {
    returnHintEl = document.createElement('button');
    returnHintEl.type = 'button';
    returnHintEl.id = 'return-hint';
    returnHintEl.className = 'return-hint return-hint--player';
    returnHintEl.setAttribute('aria-label', 'Вернуться');
    // Структура и подсказка идентичны polaroid-кнопке (в index.html).
    returnHintEl.innerHTML =
      '<span class="return-hint__arrow" aria-hidden="true"></span>' +
      '<span class="return-hint__sub">лучше скроллить, но можно и нажать</span>' +
      '<span class="return-hint__label">вернуться</span>';
    document.body.appendChild(returnHintEl);

    playerShellEl = document.createElement('div');
    playerShellEl.className = 'player-shell';

    playerEl = document.createElement('div');
    playerEl.id = 'player';
    playerEl.className = 'player';
    playerEl.innerHTML =
      '<div class="player__title" aria-live="polite"></div>' +
      '<div class="player__controls">' +
        '<button class="player__btn player__btn--prev" type="button" aria-label="предыдущая">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true">' +
            '<rect x="5" y="5" width="2" height="14" fill="currentColor"/>' +
            '<polygon points="20,5 9,12 20,19" fill="currentColor"/>' +
          '</svg>' +
        '</button>' +
        '<button class="player__btn player__btn--play" type="button" aria-label="воспроизвести / пауза">' +
          '<svg class="player__icon player__icon--play" viewBox="0 0 24 24" aria-hidden="true"><polygon points="6,4 20,12 6,20" fill="currentColor"/></svg>' +
          '<svg class="player__icon player__icon--pause" viewBox="0 0 24 24" aria-hidden="true">' +
            '<rect x="5" y="4" width="4.5" height="16" fill="currentColor"/>' +
            '<rect x="14.5" y="4" width="4.5" height="16" fill="currentColor"/>' +
          '</svg>' +
        '</button>' +
        '<button class="player__btn player__btn--next" type="button" aria-label="следующая">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true">' +
            '<polygon points="4,5 15,12 4,19" fill="currentColor"/>' +
            '<rect x="17" y="5" width="2" height="14" fill="currentColor"/>' +
          '</svg>' +
        '</button>' +
      '</div>' +
      // Нижняя строка плеера: таймкод, динамик-кнопка (mute), ползунок громкости.
      '<div class="player__meta">' +
        '<span class="player__time" aria-hidden="false">' +
          '<span class="player__time-current">--:--</span>' +
          '<span class="player__time-sep"> / </span>' +
          '<span class="player__time-total">--:--</span>' +
        '</span>' +
        '<button class="player__volume" type="button" aria-label="громкость / без звука">' +
          '<svg class="player__icon player__icon--volume" viewBox="0 0 24 24" aria-hidden="true">' +
            '<polygon points="4,9 8,9 13,5 13,19 8,15 4,15" fill="currentColor"/>' +
            '<path d="M16 8.5 Q18.5 12 16 15.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' +
            '<path d="M18.5 6 Q22 12 18.5 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' +
          '</svg>' +
          '<svg class="player__icon player__icon--muted" viewBox="0 0 24 24" aria-hidden="true">' +
            '<polygon points="4,9 8,9 13,5 13,19 8,15 4,15" fill="currentColor"/>' +
            '<line x1="16" y1="8" x2="22" y2="16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' +
            '<line x1="22" y1="8" x2="16" y2="16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' +
          '</svg>' +
        '</button>' +
        '<input class="player__volume-range" type="range" min="0" max="1" step="0.01" aria-label="громкость">' +
      '</div>';
    titleEl = playerEl.querySelector('.player__title');
    playBtn = playerEl.querySelector('.player__btn--play');
    prevBtn = playerEl.querySelector('.player__btn--prev');
    nextBtn = playerEl.querySelector('.player__btn--next');
    volumeBtn = playerEl.querySelector('.player__volume');
    volumeRange = playerEl.querySelector('.player__volume-range');
    timeEl = playerEl.querySelector('.player__time');
    timeCurrentEl = playerEl.querySelector('.player__time-current');
    timeTotalEl = playerEl.querySelector('.player__time-total');
    playerShellEl.appendChild(playerEl);

    elsewhereBtn = document.createElement('button');
    elsewhereBtn.className = 'listen-elsewhere';
    elsewhereBtn.type = 'button';
    elsewhereBtn.setAttribute('aria-expanded', 'false');
    elsewhereBtn.setAttribute('aria-controls', 'listen-platforms');

    elsewhereTextEl = document.createElement('span');
    elsewhereTextEl.textContent = 'слушать в другом месте';
    elsewhereBtn.appendChild(elsewhereTextEl);
    playerShellEl.appendChild(elsewhereBtn);

    platformsEl = document.createElement('nav');
    platformsEl.id = 'listen-platforms';
    platformsEl.className = 'listen-platforms';
    platformsEl.setAttribute('aria-label', 'Слушать на других площадках');
    platformsEl.setAttribute('aria-hidden', 'true');
    platformsEl.inert = true;
    buildPlatforms();
    playerShellEl.appendChild(platformsEl);

    document.body.appendChild(playerShellEl);

    audioEl = document.createElement('audio');
    audioEl.id = 'player-audio';
    audioEl.preload = 'auto';
    document.body.appendChild(audioEl);

    restoreVolume();
  }

  function buildPlatforms() {
    var platforms = playerCfg().platforms || [];

    platforms.forEach(function (platform) {
      var link = document.createElement('a');
      link.className = 'listen-platforms__link';
      link.href = platform.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';

      if (platform.icon) {
        var iconWrap = document.createElement('span');
        iconWrap.className = 'listen-platforms__icon-wrap';
        if (platform.iconFit === 'cover') {
          iconWrap.classList.add('listen-platforms__icon-wrap--cover');
        }

        var icon = document.createElement('img');
        icon.className = 'listen-platforms__icon';
        icon.src = platform.icon;
        icon.alt = '';
        icon.loading = 'lazy';
        icon.decoding = 'async';
        iconWrap.appendChild(icon);
        link.appendChild(iconWrap);
      }

      var name = document.createElement('span');
      name.className = 'listen-platforms__name';
      name.textContent = platform.name;
      link.appendChild(name);

      platformsEl.appendChild(link);
    });
  }

  // ─────────────────────────────────────────── volume ──

  function clamp01(v) {
    return v < 0 ? 0 : (v > 1 ? 1 : v);
  }

  function safeStorage(fn) {
    try { return fn(); } catch (e) { return null; }
  }

  function restoreVolume() {
    var saved = safeStorage(function () { return localStorage.getItem(STORAGE_VOLUME); });
    var savedMuted = safeStorage(function () { return localStorage.getItem(STORAGE_MUTED); });
    var def = (playerCfg().initialVolume != null) ? playerCfg().initialVolume : 0.8;
    var vol = saved != null ? parseFloat(saved) : def;
    if (!isFinite(vol)) vol = def;
    audioEl.volume = clamp01(vol);
    audioEl.muted = savedMuted === '1';
    volumeRange.value = audioEl.volume;
    updateVolumeUi();
  }

  function persistVolume() {
    safeStorage(function () { localStorage.setItem(STORAGE_VOLUME, String(audioEl.volume)); });
    safeStorage(function () { localStorage.setItem(STORAGE_MUTED, audioEl.muted ? '1' : '0'); });
  }

  function updateVolumeUi() {
    var muted = audioEl.muted || audioEl.volume <= 0.0001;
    if (muted) volumeBtn.classList.add('is-muted');
    else volumeBtn.classList.remove('is-muted');
    volumeBtn.setAttribute('aria-label', muted ? 'включить звук' : 'выключить звук');
  }

  function onRangeInput() {
    audioEl.volume = clamp01(parseFloat(volumeRange.value));
    // Любое движение ползунка снимает mute — стандартное поведение медиа-плееров.
    if (audioEl.muted && audioEl.volume > 0) audioEl.muted = false;
  }

  function onMuteClick() {
    audioEl.muted = !audioEl.muted;
  }

  function onVolumeChange() {
    // volumechange стреляет и при programmatic, и при ручной смене — единая точка
    // синхронизации UI и сохранения.
    if (parseFloat(volumeRange.value) !== audioEl.volume) {
      volumeRange.value = audioEl.volume;
    }
    updateVolumeUi();
    persistVolume();
  }

  // ─────────────────────────────────────── time display ──

  function formatTime(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    var m = Math.floor(sec / 60);
    var s = Math.floor(sec % 60);
    return (m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s : s);
  }

  function onTimeUpdate() {
    timeCurrentEl.textContent = formatTime(audioEl.currentTime);
  }

  function onLoadedMetadata() {
    onTimeUpdate();
    timeTotalEl.textContent = formatTime(audioEl.duration);
    timeEl.classList.add('has-values');
  }

  // ───────────────────────────────────────────── events ──

  function bindEvents() {
    triggerEl.addEventListener('click', function (e) {
      e.preventDefault();
      openPlayer();
    });

    returnHintEl.addEventListener('click', closePlayer);

    playBtn.addEventListener('click', togglePlayPause);
    prevBtn.addEventListener('click', prevTrack);
    nextBtn.addEventListener('click', nextTrack);
    volumeBtn.addEventListener('click', onMuteClick);
    volumeRange.addEventListener('input', onRangeInput);
    elsewhereBtn.addEventListener('click', togglePlatforms);

    audioEl.addEventListener('play', updatePlayButton);
    audioEl.addEventListener('pause', updatePlayButton);
    audioEl.addEventListener('ended', onTrackEnded);
    audioEl.addEventListener('volumechange', onVolumeChange);
    audioEl.addEventListener('timeupdate', onTimeUpdate);
    audioEl.addEventListener('loadedmetadata', onLoadedMetadata);

    // В режиме плеера скролл не двигает страницу: upward-scroll копится
    // до порога, чтобы выход ощущался как длинное пробирание через воду.
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
  }

  function togglePlatforms() {
    if (mode !== 'open') return;
    setPlatformsOpen(!playerShellEl.classList.contains('is-platforms-open'));
  }

  function setPlatformsOpen(isOpen) {
    playerShellEl.classList.toggle('is-platforms-open', isOpen);
    elsewhereBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    elsewhereTextEl.textContent = isOpen ? 'вернуть плеер' : 'слушать в другом месте';
    playerEl.inert = isOpen;
    platformsEl.inert = !isOpen;
    if (isOpen) {
      playerEl.setAttribute('aria-hidden', 'true');
      platformsEl.removeAttribute('aria-hidden');
    } else {
      playerEl.removeAttribute('aria-hidden');
      platformsEl.setAttribute('aria-hidden', 'true');
    }

    if (isOpen) {
      pauseAudio();
      hideTitle();
    } else if (hasStartedPlayback) {
      showTitle();
    }
  }

  function onWheel(e) {
    if (mode !== 'open') return;
    e.preventDefault();
    collectReturnScroll(-e.deltaY);
    // Импульс воде только при жесте наверх (deltaY < 0). Вниз в плеере смысла
    // не имеет — collectReturnScroll и так гасит накопленный preview, а взвесь
    // не должна откликаться на «несуществующее» движение.
    if (e.deltaY < 0 && Affogato.UnderwaterBg && Affogato.UnderwaterBg.pulseFromScroll) {
      Affogato.UnderwaterBg.pulseFromScroll(e.deltaY);
    }
  }

  function onTouchStart(e) {
    if (mode === 'open' && e.touches && e.touches[0]) {
      touchLastY = e.touches[0].clientY;
    }
  }

  function onTouchMove(e) {
    if (mode !== 'open' || !e.touches || !e.touches[0]) return;
    if (e.cancelable) e.preventDefault();
    var y = e.touches[0].clientY;
    var dy = y - touchLastY;
    touchLastY = y;
    collectReturnScroll(dy * 2.2);
    // Свайп пальцем вниз (dy>0) — это движение наверх по сайту: только в эту
    // сторону имеет смысл шевелить взвесь. Свайп пальцем вверх (dy<0) в плеере
    // ничего не двигает — игнорируем.
    if (dy > 0 && Affogato.UnderwaterBg && Affogato.UnderwaterBg.pulseFromScroll) {
      Affogato.UnderwaterBg.pulseFromScroll(-dy);
    }
  }

  function collectReturnScroll(amount) {
    if (mode !== 'open') return;
    var now = performance.now();
    if (!lastReturnScrollAt || now - lastReturnScrollAt > 850) {
      returnScrollDebt = 0;
    }
    lastReturnScrollAt = now;
    cancelReturnPreviewSettle();

    if (amount <= 0) {
      returnScrollDebt = Math.max(0, returnScrollDebt + amount * 0.7);
      applyReturnPreview(returnScrollDebt / (playerCfg().returnScrollThreshold || 900));
      scheduleReturnPreviewSettle();
      return;
    }

    returnScrollDebt += amount;
    var threshold = playerCfg().returnScrollThreshold || 900;
    if (returnScrollDebt >= threshold) {
      // Сохраняем накопленный preview-прогресс до сброса, чтобы реальная
      // анимация всплытия стартовала ровно с того места, где замер preview —
      // иначе камень дёрнется обратно в исходное положение и пойдёт заново.
      var carryProgress = returnPreviewProgress * (playerCfg().returnPreviewMax || 0.14);
      returnScrollDebt = 0;
      cancelReturnPreviewSettle();
      closePlayer({ startProgress: carryProgress });
      return;
    }

    applyReturnPreview(returnScrollDebt / threshold);
    scheduleReturnPreviewSettle();
  }

  function applyReturnPreview(progress) {
    returnPreviewProgress = clamp01(progress);
    if (!Affogato.Transit || !Affogato.Transit.previewAscent) return;
    Affogato.Transit.previewAscent(returnPreviewProgress * (playerCfg().returnPreviewMax || 0.14), {
      stoneImage: stoneImage,
      frames: divingFrames,
    });
  }

  function cancelReturnPreviewSettle() {
    if (returnPreviewTimer) window.clearTimeout(returnPreviewTimer);
    if (returnPreviewRaf) cancelAnimationFrame(returnPreviewRaf);
    returnPreviewTimer = null;
    returnPreviewRaf = null;
  }

  function scheduleReturnPreviewSettle() {
    if (returnPreviewTimer) window.clearTimeout(returnPreviewTimer);
    returnPreviewTimer = window.setTimeout(settleReturnPreview, 180);
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function settleReturnPreview() {
    returnPreviewTimer = null;
    var from = returnPreviewProgress;
    if (from <= 0) return;
    var duration = Math.max(0.15, playerCfg().returnPreviewSettleSec || 0.55) * 1000;
    var startedAt = performance.now();

    function tick(now) {
      if (mode !== 'open') {
        returnPreviewRaf = null;
        return;
      }

      var p = clamp01((now - startedAt) / duration);
      applyReturnPreview(from * (1 - easeOutCubic(p)));
      if (p < 1) {
        returnPreviewRaf = requestAnimationFrame(tick);
      } else {
        returnPreviewRaf = null;
        returnScrollDebt = 0;
        lastReturnScrollAt = 0;
        if (Affogato.Transit && Affogato.Transit.resumeIdleStone) {
          Affogato.Transit.resumeIdleStone();
        }
      }
    }

    returnPreviewRaf = requestAnimationFrame(tick);
  }

  function resetReturnGesture() {
    returnScrollDebt = 0;
    lastReturnScrollAt = 0;
    returnPreviewProgress = 0;
    cancelReturnPreviewSettle();
  }

  // ─────────────────────────────────────── open / close ──

  // Прячем верхнюю навигацию и подсказку «погрузиться» — иначе они мерцают
  // в первые/последние ~0.25с анимации, пока canvas-оверлей ещё прозрачен.
  function hideSiteOverlays() {
    ['top-nav', 'scroll-hint'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) {
        el.style.opacity = 0;
        el.style.pointerEvents = 'none';
      }
    });
  }

  function openPlayer() {
    if (mode !== 'closed') return;
    mode = 'descending';
    resetReturnGesture();
    hideSiteOverlays();
    document.body.classList.add('player-transitioning');
    Affogato.TitleOverlay.beginPlayerTransition('down');

    Affogato.SmoothScroll.lockAtCurrent();

    var dur = playerCfg().descentSec || 1.2;
    Affogato.Transit.start('down', dur, {
      stoneImage: stoneImage,
      frames: divingFrames,
      onProgress: function (p) {
        Affogato.TitleOverlay.renderPlayerTransition(p);
      },
    });

    window.setTimeout(function () {
      document.body.classList.add('in-player-mode');
      document.body.classList.remove('player-transitioning');
      Affogato.TitleOverlay.setStatic(true);
      if (hasStartedPlayback) showTitle();
      mode = 'open';
    }, dur * 1000);
  }

  function closePlayer(opts) {
    if (mode !== 'open') return;
    mode = 'ascending';
    var startProgress = clamp01((opts && opts.startProgress) || 0);
    resetReturnGesture();
    setPlatformsOpen(false);
    pauseAudio();
    hideTitle();
    hideSiteOverlays();
    document.body.classList.add('player-transitioning');
    Affogato.TitleOverlay.beginPlayerTransition('up');
    document.body.classList.remove('in-player-mode');

    var dur = playerCfg().ascentSec || 1.2;
    Affogato.Transit.start('up', dur, {
      stoneImage: stoneImage,
      frames: divingFrames,
      startProgress: startProgress,
      onProgress: function (p) {
        Affogato.TitleOverlay.renderPlayerTransition(p);
      },
    });

    // Реальная длительность короче на пропущенную долю — иначе setTimeout
    // отработает позже завершения анимации и оставит лишний idle-хвост.
    var remainingMs = Math.max(120, (1 - startProgress) * dur * 1000);
    window.setTimeout(function () {
      Affogato.SmoothScroll.jumpTo(0);
      Affogato.TitleOverlay.reset();
      Affogato.Transit.stop();
      Affogato.SmoothScroll.unlock();
      document.body.classList.remove('player-transitioning');
      mode = 'closed';
    }, remainingMs);
  }

  // ───────────────────────────────────── tracks / audio ──

  function togglePlayPause() {
    if (!tracks.length) return;
    if (audioEl.paused) {
      ensureSrc();
      wantsPlayback = true;
      playAudio();
      hasStartedPlayback = true;
      showTitle();
    } else {
      wantsPlayback = false;
      audioEl.pause();
    }
  }

  function prevTrack() {
    if (tracks.length < 2) return;
    currentIdx = (currentIdx - 1 + tracks.length) % tracks.length;
    onTrackChanged();
  }

  function nextTrack() {
    if (tracks.length < 2) return;
    currentIdx = (currentIdx + 1) % tracks.length;
    onTrackChanged();
  }

  function onTrackChanged() {
    var shouldResume = wantsPlayback || !audioEl.paused;
    audioEl.src = tracks[currentIdx].audio;
    audioEl.load();
    timeEl.classList.remove('has-values');
    timeCurrentEl.textContent = '--:--';
    timeTotalEl.textContent = '--:--';
    if (shouldResume) {
      wantsPlayback = true;
      hasStartedPlayback = true;
      playAudio();
    }
    if (titleEl.classList.contains('visible')) crossfadeTitle();
    else if (shouldResume) showTitle();
    else swapTitleSilently();
  }

  function ensureSrc() {
    if (!audioEl.src) audioEl.src = tracks[currentIdx].audio;
  }

  function playAudio() {
    var playPromise = audioEl.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(function () {
        var retryOnCanPlay = function () {
          audioEl.removeEventListener('canplay', retryOnCanPlay);
          if (mode !== 'open' || !wantsPlayback) return;
          var retryPromise = audioEl.play();
          if (retryPromise && typeof retryPromise.catch === 'function') {
            retryPromise.catch(updatePlayButton);
          }
        };
        audioEl.addEventListener('canplay', retryOnCanPlay);
      });
    }
  }

  function pauseAudio() {
    wantsPlayback = false;
    if (audioEl && !audioEl.paused) audioEl.pause();
  }

  function showTitle() {
    if (!tracks.length) return;
    titleEl.textContent = tracks[currentIdx].title;
    titleEl.classList.add('visible');
  }

  function hideTitle() {
    titleEl.classList.remove('visible');
  }

  function swapTitleSilently() {
    if (tracks.length) titleEl.textContent = tracks[currentIdx].title;
  }

  // Меняем текст ТОЛЬКО когда opacity дошёл до 0 (transitionend на opacity).
  // Раньше тут был setTimeout(280), который срабатывал посреди fade-out — на
  // iOS Safari это давало рваный «щелчок»: текст менялся на полупрозрачном
  // элементе, reflow на разной длине заголовков был виден. transitionend
  // ловит реальный конец анимации; на всякий случай — fallback-таймер чуть
  // длиннее самого transition (0.5s), чтобы кросс-фейд не «заморозился».
  function crossfadeTitle() {
    if (titleCrossfadeTimer) window.clearTimeout(titleCrossfadeTimer);
    var swapped = false;
    var swap = function () {
      if (swapped) return;
      swapped = true;
      titleEl.removeEventListener('transitionend', onEnd);
      titleEl.textContent = tracks[currentIdx].title;
      // rAF гарантирует, что браузер успел применить opacity:0 перед тем,
      // как мы вернёмся к visible — иначе transition может не отыграть.
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(function () {
          titleEl.classList.add('visible');
        });
      });
    };
    var onEnd = function (e) {
      if (e.propertyName !== 'opacity') return;
      swap();
    };
    titleEl.addEventListener('transitionend', onEnd);
    titleEl.classList.remove('visible');
    titleCrossfadeTimer = window.setTimeout(swap, 620);
  }

  function updatePlayButton() {
    if (audioEl.paused) playBtn.classList.remove('is-playing');
    else playBtn.classList.add('is-playing');
  }

  function onTrackEnded() {
    // Без auto-next: останавливаемся на месте, кнопка возвращается в play.
    wantsPlayback = false;
    audioEl.currentTime = 0;
    onTimeUpdate();
    updatePlayButton();
  }

  return { init: init, isActive: isActive };
})();
