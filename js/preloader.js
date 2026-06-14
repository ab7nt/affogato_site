// Предзагрузка всей секвенции кадров с прогрессом.
// Через file:// fetch() недоступен — грузим только через Image + decode().
window.Affogato = window.Affogato || {};

Affogato.Preloader = (function () {
  var cfg = Affogato.Config.frames;

  function framePath(frameNumber) {
    var n = String(frameNumber).padStart(cfg.pad, '0');
    return cfg.dir + '/' + cfg.prefix + n + cfg.ext;
  }

  // Возвращает Promise с массивом Image в порядке кадров.
  // Загрузка одного кадра — общий Affogato.Utils.loadImage (Image + decode(),
  // битый кадр не роняет всю загрузку).
  function loadAll(onProgress) {
    var total = cfg.count;
    var done = 0;
    var tasks = [];
    for (var i = 0; i < total; i++) {
      tasks.push(
        Affogato.Utils.loadImage(framePath(cfg.start + i)).then(function (img) {
          done++;
          if (onProgress) onProgress(done / total);
          return img;
        })
      );
    }
    return Promise.all(tasks);
  }

  return { loadAll: loadAll, framePath: framePath };
})();
