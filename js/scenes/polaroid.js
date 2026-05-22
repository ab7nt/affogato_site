// Сцена песни: потрёпанная полароид-фотокарточка + личный текст справа.
window.Affogato = window.Affogato || {};
Affogato.Scenes = Affogato.Scenes || {};

Affogato.Scenes.createPolaroid = function (item, index) {
  var canvas, ctx, el;
  var cfg = Affogato.Config.scenes.songs;

  function clamp01(v) {
    return v < 0 ? 0 : (v > 1 ? 1 : v);
  }

  function fade(progress) {
    var inFade = clamp01(progress / 0.22);
    var outFade = clamp01((1 - progress) / 0.22);
    return Math.min(inFade, outFade);
  }

  function createElement() {
    el = document.createElement('section');
    el.className = 'song-card-scene';
    el.innerHTML =
      '<figure class="polaroid">' +
        '<img class="polaroid__image" alt="">' +
        '<figcaption class="polaroid__caption"></figcaption>' +
      '</figure>' +
      '<div class="song-note">' +
        '<h2 class="song-note__title"></h2>' +
        '<p class="song-note__text"></p>' +
      '</div>';

    el.querySelector('.polaroid__image').src = item.cover;
    el.querySelector('.polaroid__image').alt = item.title;
    el.querySelector('.polaroid__caption').textContent = item.year || '';
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
      if (el) el.style.opacity = 0;
    },

    render: function (localProgress, offsetFrac) {
      ctx.fillStyle = cfg.background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      var opacity = fade(localProgress);
      var y = (offsetFrac || 0) * 100 + (0.5 - localProgress) * 7;
      el.style.opacity = opacity.toFixed(3);
      el.style.transform = 'translate3d(-50%, ' + y.toFixed(2) + 'vh, 0)';
    },
  };
};
