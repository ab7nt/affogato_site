// Сцена-плейсхолдер «темнота» — следующая за погружением сцена.
// Пока сплошная заливка; позже заменится реальной сценой.
// Контракт сцены: { id, scrollLength, init(), resize(), render(progress, offsetFrac) }.
window.Affogato = window.Affogato || {};
Affogato.Scenes = Affogato.Scenes || {};

Affogato.Scenes.Dark = (function () {
  var canvas, ctx;

  var scene = {
    id: 'dark',
    get scrollLength() { return Affogato.Config.scenes.dark.scrollVH; },

    init: function (canvasEl) {
      canvas = canvasEl;
      ctx = canvas.getContext('2d');
    },

    resize: function () {},

    // offsetFrac — вертикальное смещение сцены при переходе (0 — на месте).
    render: function (localProgress, offsetFrac) {
      var ch = canvas.height;
      var top = Math.round((offsetFrac || 0) * ch);
      ctx.fillStyle = Affogato.Config.scenes.dark.color;
      ctx.fillRect(0, top, canvas.width, ch);
    },
  };

  return scene;
})();
