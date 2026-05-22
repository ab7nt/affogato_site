// Сцена песни: потрёпанная полароид-фотокарточка + личный текст справа.
window.Affogato = window.Affogato || {};
Affogato.Scenes = Affogato.Scenes || {};

Affogato.Scenes.createPolaroid = function (item, index) {
  var canvas, ctx, el;
  var cfg = Affogato.Config.scenes.songs;
  var shownAt = null;

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
    el.className = 'song-card-scene song-card-scene--variant-' + (index % 3);
    el.innerHTML =
      '<figure class="polaroid">' +
        '<img class="polaroid__image" alt="">' +
      '</figure>' +
      '<div class="song-note">' +
        '<div class="song-note__kicker"></div>' +
        '<h2 class="song-note__title"></h2>' +
        '<p class="song-note__text"></p>' +
      '</div>';

    el.querySelector('.polaroid__image').src = item.cover;
    el.querySelector('.polaroid__image').alt = item.title;
    el.querySelector('.song-note__kicker').textContent = item.year || '';
    el.querySelector('.song-note__title').textContent = item.title;
    el.querySelector('.song-note__text').textContent = item.note;
    document.body.appendChild(el);
  }

  return {
    id: 'song-' + index,
    get scrollLength() { return cfg.scrollVH; },

    init: function (canvasEl) {
      canvas = canvasEl;
      ctx = canvas.getContext('2d');
      createElement();
    },

    resize: function () {},

    hide: function () {
      shownAt = null;
      if (el) el.style.opacity = 0;
    },

    render: function (localProgress, offsetFrac) {
      if (shownAt === null) shownAt = performance.now();

      ctx.fillStyle = cfg.background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      var offset = offsetFrac || 0;
      var elapsedSec = (performance.now() - shownAt) / 1000;
      var revealOpacity = clamp01(elapsedSec / (cfg.fadeInSec || 0.55));
      var opacity = transitionOpacity(offset) * revealOpacity;
      var y = offset * 100 + (0.5 - localProgress) * 7;
      el.style.opacity = opacity.toFixed(3);
      el.style.transform = 'translate3d(-50%, ' + y.toFixed(2) + 'vh, 0)';
    },
  };
};
