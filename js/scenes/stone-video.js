// Финальная видео-сцена с дном и камнем. По окончании запускает callback.
window.Affogato = window.Affogato || {};
Affogato.Scenes = Affogato.Scenes || {};

Affogato.Scenes.createStoneVideo = function (cfg) {
  var canvas, ctx, el, video, endedCallback;
  var hasEnded = false;

  function createElement() {
    el = document.createElement('section');
    el.className = 'stone-video-scene';
    el.innerHTML =
      '<video class="stone-video" playsinline muted></video>' +
      '<div class="stone-video__placeholder"></div>';

    video = el.querySelector('.stone-video');
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

    resize: function () {},

    hide: function () {
      if (el) el.style.opacity = 0;
      if (video && !video.paused) video.pause();
    },

    render: function (localProgress, offsetFrac) {
      ctx.fillStyle = cfg.background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      var opacity = Math.min(1, localProgress / 0.18, (1 - localProgress) / 0.18);
      el.style.opacity = opacity.toFixed(3);
      el.style.transform = 'translate3d(0, ' + ((offsetFrac || 0) * 100).toFixed(2) + 'vh, 0)';

      if (cfg.videoSrc && video.paused && opacity > 0.85) {
        video.play();
      }
    },
  };
};
