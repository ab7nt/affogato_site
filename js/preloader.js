// Предзагрузка всей секвенции кадров с прогрессом.
// Через file:// fetch() недоступен — грузим только через Image + decode().
window.Affogato = window.Affogato || {};

Affogato.Preloader = (function () {
  var cfg = Affogato.Config.frames;

  function framePath(frameNumber) {
    var n = String(frameNumber).padStart(cfg.pad, '0');
    return cfg.dir + '/' + cfg.prefix + n + cfg.ext;
  }

  function loadOne(src) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        // decode() готовит битмап заранее — иначе Safari может
        // декодировать кадр прямо во время скролла и дать фликер.
        if (img.decode) {
          img.decode().then(
            function () { resolve(img); },
            function () { resolve(img); }
          );
        } else {
          resolve(img);
        }
      };
      // Битый кадр не должен ронять всю загрузку.
      img.onerror = function () { resolve(img); };
      img.src = src;
    });
  }

  // Возвращает Promise с массивом Image в порядке кадров.
  function loadAll(onProgress) {
    var total = cfg.count;
    var done = 0;
    var tasks = [];
    for (var i = 0; i < total; i++) {
      tasks.push(
        loadOne(framePath(cfg.start + i)).then(function (img) {
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
