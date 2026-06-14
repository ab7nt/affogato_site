// Общие утилиты: тайминги и хелперы, используемые несколькими модулями.
// Подключается ПЕРВЫМ — до config.js и сцен, поэтому модули могут ссылаться
// на Affogato.Utils.* уже на этапе своей загрузки.
window.Affogato = window.Affogato || {};
Affogato.Utils = Affogato.Utils || {};

// Зажать значение в диапазон [0, 1].
Affogato.Utils.clamp01 = function (v) {
  return v < 0 ? 0 : (v > 1 ? 1 : v);
};

// Плавный разгон/торможение (cubic ease-in-out).
Affogato.Utils.easeInOutCubic = function (t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

// Торможение к концу (cubic ease-out).
Affogato.Utils.easeOutCubic = function (t) {
  return 1 - Math.pow(1 - t, 3);
};

// Загрузка одной картинки с предварительным decode(). Промис всегда резолвится
// (в т.ч. при ошибке загрузки) — общий код покадровых сцен forest/sky.
Affogato.Utils.loadImage = function (src) {
  return new Promise(function (resolve) {
    var img = new Image();
    img.onload = function () {
      if (img.decode) {
        img.decode().then(function () { resolve(img); }, function () { resolve(img); });
      } else {
        resolve(img);
      }
    };
    img.onerror = function () { resolve(img); };
    img.src = src;
  });
};
