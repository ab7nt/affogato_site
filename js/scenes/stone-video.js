// Финальная видео-сцена с дном и камнем. По окончании запускает callback.
window.Affogato = window.Affogato || {};
Affogato.Scenes = Affogato.Scenes || {};

Affogato.Scenes.createStoneVideo = function (cfg) {
  var canvas, ctx, el, video, endedCallback;
  var hasEnded = false;
  var shownAt = null;
  var isPlaying = false;

  function clamp01(v) {
    return v < 0 ? 0 : (v > 1 ? 1 : v);
  }

  function transitionOpacity(offsetFrac) {
    if (offsetFrac < 0) return clamp01(1 + offsetFrac);
    if (offsetFrac > 0) return clamp01(1 - offsetFrac);
    return 1;
  }

  function createElement() {
    el = document.createElement('section');
    el.className = 'stone-video-scene';
    el.innerHTML =
      '<video class="stone-video" playsinline muted></video>' +
      '<div class="stone-video__placeholder"></div>';

    video = el.querySelector('.stone-video');
    video.preload = 'auto';
    if (cfg.videoSrc) video.src = cfg.videoSrc;
    if (cfg.poster) {
      video.poster = cfg.poster;
      el.querySelector('.stone-video__placeholder').style.backgroundImage = 'url("' + cfg.poster + '")';
    }

    video.addEventListener('ended', function () {
      if (hasEnded) return;
      hasEnded = true;
      if (endedCallback) endedCallback();
    });

    document.body.appendChild(el);
  }

  return {
    id: 'stoneVideo',
    get scrollLength() { return cfg.scrollVH; },

    init: function (canvasEl) {
      canvas = canvasEl;
      ctx = canvas.getContext('2d');
      createElement();
    },

    onEnded: function (callback) {
      endedCallback = callback;
    },

    getVideoElement: function () {
      return video;
    },

    resize: function () {},

    hide: function () {
      shownAt = null;
      isPlaying = false;
      hasEnded = false;
      if (Affogato.TitleOverlay) Affogato.TitleOverlay.setFinalFade(1);
      if (el) el.style.opacity = 0;
      if (video) {
        if (!video.paused) video.pause();
        if (Number.isFinite(video.duration)) video.currentTime = 0;
      }
    },

    render: function (localProgress, offsetFrac) {
      ctx.fillStyle = cfg.background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      var offset = offsetFrac || 0;
      // Нижний свет держим постоянным — он продолжается с последней карточки
      // и не гаснет, чтобы появление видео было мягким (видео несёт такой же свет).
      Affogato.UnderwaterBg.renderBottomGlow(ctx, canvas.width, canvas.height, 1);

      var isEntering = offset > 0 && offset < 1;
      var isSettled = Math.abs(offset) < 0.02;
      if ((isEntering || isSettled) && shownAt === null) {
        shownAt = performance.now();
      }
      if (isSettled && !isPlaying) {
        Affogato.SmoothScroll.lockAtCurrent();
      }

      var renderOffset = isSettled ? 0 : offset;
      var opacity = isSettled ? 1 : transitionOpacity(offset);
      el.style.opacity = opacity.toFixed(3);
      el.style.transform = 'translate3d(0, ' + (renderOffset * 100).toFixed(2) + 'vh, 0)';

      if (cfg.videoSrc && isSettled && !isPlaying && video.paused) {
        isPlaying = true;
        hasEnded = false;
        video.currentTime = 0;
        video.play();
      }

      if (isSettled && Affogato.TitleOverlay && Number.isFinite(video.duration) && video.duration > 0) {
        var videoProgress = clamp01(video.currentTime / video.duration);
        var titleFade = 1 - clamp01(videoProgress / 0.5);
        Affogato.TitleOverlay.setFinalFade(titleFade);
      }
    },
  };
};
