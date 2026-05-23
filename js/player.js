// Локальный плеер альбома: триггерится кликом по «послушать» в верхней навигации.
// Сценарий: погружение → стоп-кадр со дна + лёгкая взвесь → плеер → клик play.
// Выход — клик «вернуться» сверху или scroll-up (wheel / touch).
window.Affogato = window.Affogato || {};

Affogato.Player = (function () {
  var triggerEl, playerEl, titleEl, playBtn, prevBtn, nextBtn;
  var volumeBtn, volumeRange, timeEl, timeCurrentEl, timeTotalEl;
  var returnHintEl, elsewhereEl, audioEl;
  var tracks = [];
  var currentIdx = 0;
  var stoneImage = null;
  var divingFrames = null;
  var mode = 'closed'; // 'closed' | 'descending' | 'open' | 'ascending'
  var touchStartY = 0;
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
    returnHintEl = document.createElement('div');
    returnHintEl.id = 'return-hint';
    returnHintEl.className = 'return-hint';
    returnHintEl.innerHTML =
      '<span class="return-hint__arrow" aria-hidden="true"></span>' +
      '<span class="return-hint__label">вернуться</span>';
    document.body.appendChild(returnHintEl);

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
    document.body.appendChild(playerEl);

    elsewhereEl = document.createElement('div');
    elsewhereEl.className = 'listen-elsewhere';
    elsewhereEl.textContent = 'слушать в другом месте';
    document.body.appendChild(elsewhereEl);

    audioEl = document.createElement('audio');
    audioEl.id = 'player-audio';
    audioEl.preload = 'auto';
    document.body.appendChild(audioEl);

    restoreVolume();
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

    audioEl.addEventListener('play', updatePlayButton);
    audioEl.addEventListener('pause', updatePlayButton);
    audioEl.addEventListener('ended', onTrackEnded);
    audioEl.addEventListener('volumechange', onVolumeChange);
    audioEl.addEventListener('timeupdate', onTimeUpdate);
    audioEl.addEventListener('loadedmetadata', onLoadedMetadata);

    // scroll-up в режиме плеера = выход (как переход в карточках песен).
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
  }

  function onWheel(e) {
    if (mode !== 'open') return;
    if (e.deltaY < 0) {
      e.preventDefault();
      closePlayer();
    }
  }

  function onTouchStart(e) {
    if (mode === 'open' && e.touches && e.touches[0]) {
      touchStartY = e.touches[0].clientY;
    }
  }

  function onTouchMove(e) {
    if (mode !== 'open' || !e.touches || !e.touches[0]) return;
    var dy = e.touches[0].clientY - touchStartY;
    if (dy > 40) closePlayer();
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

  function closePlayer() {
    if (mode !== 'open') return;
    mode = 'ascending';
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
      onProgress: function (p) {
        Affogato.TitleOverlay.renderPlayerTransition(p);
      },
    });

    window.setTimeout(function () {
      Affogato.SmoothScroll.jumpTo(0);
      Affogato.TitleOverlay.reset();
      Affogato.Transit.stop();
      Affogato.SmoothScroll.unlock();
      document.body.classList.remove('player-transitioning');
      mode = 'closed';
    }, dur * 1000);
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

  function crossfadeTitle() {
    titleEl.classList.remove('visible');
    if (titleCrossfadeTimer) window.clearTimeout(titleCrossfadeTimer);
    titleCrossfadeTimer = window.setTimeout(function () {
      titleEl.textContent = tracks[currentIdx].title;
      titleEl.classList.add('visible');
    }, 280);
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
