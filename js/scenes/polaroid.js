// Сцена песни: потрёпанная полароид-фотокарточка + личный текст справа.
// Карточка «живёт» в воде: дрейфует на подводном фоне.
window.Affogato = window.Affogato || {};
Affogato.Scenes = Affogato.Scenes || {};

Affogato.Scenes.createPolaroid = function (item, index) {
  var canvas, ctx, el, polaroidEl, noteEl;
  var cfg = Affogato.Config.scenes.songs;
  var card = cfg.card;
  var shownAt = null;
  // Положение карточки в череде песен: 0 — первая, 1 — последняя. Задаёт глубину
  // подводного света; масштабируется на любое число карточек в config.
  var count = cfg.items.length;
  var depth = count > 1 ? index / (count - 1) : 0;
  var depthStep = count > 1 ? 1 / (count - 1) : 0;
  var driftPhase = index * 1.7; // сдвиг фазы — карточки качаются по-разному

  function clamp01(v) {
    return v < 0 ? 0 : (v > 1 ? 1 : v);
  }

  function transitionOpacity(offsetFrac) {
    if (offsetFrac < 0) return clamp01(1 + offsetFrac);
    if (offsetFrac > 0) return clamp01(1 - offsetFrac);
    return 1;
  }

  // Дрейф элемента: мягкое покачивание по синусам разной частоты —
  // получается органичное «висит в воде», а не движение по кругу.
  function driftTransform(t, phase, transScale, rotScale) {
    var d = card.drift;
    var sp = d.speed;
    var x = Math.sin(t * 0.23 * sp + phase) * d.ampX * transScale;
    var y = Math.sin(t * 0.31 * sp + phase * 1.3) * d.ampY * transScale;
    var r = Math.sin(t * 0.19 * sp + phase * 0.7) * d.ampRot * rotScale;
    return 'translate3d(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px,0) rotate(' +
           r.toFixed(3) + 'deg)';
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

    polaroidEl = el.querySelector('.polaroid');
    noteEl = el.querySelector('.song-note');
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
      if (el) {
        el.style.opacity = 0;
        el.style.display = 'none'; // скрытую карточку не рендерим
      }
    },

    render: function (localProgress, offsetFrac) {
      if (shownAt === null) shownAt = performance.now();
      el.style.display = '';

      var offset = offsetFrac || 0;
      // При входе карточки (offset > 0) глубину плавно ведём от предыдущей карточки —
      // подводный свет меняется без скачка на стыке сцен.
      var effDepth = offset > 0 ? Math.max(0, depth - depthStep * offset) : depth;
      Affogato.UnderwaterBg.render(ctx, canvas.width, canvas.height, effDepth);

      var elapsedSec = (performance.now() - shownAt) / 1000;
      var revealOpacity = clamp01(elapsedSec / (cfg.fadeInSec || 0.55));
      var opacity = transitionOpacity(offset) * revealOpacity;
      var y = offset * 100 + (0.5 - localProgress) * 7;
      el.style.opacity = opacity.toFixed(3);
      el.style.transform = 'translate3d(-50%, ' + y.toFixed(2) + 'vh, 0)';
      polaroidEl.style.opacity = card.cardOpacity;
      noteEl.style.opacity = card.textOpacity;

      // Дрейф оставляем только у карточки; текст держится стабильно.
      var t = performance.now() / 1000;
      polaroidEl.style.transform = driftTransform(t, driftPhase, 1, 1);
    },
  };
};
