// Бутстрап: предзагрузка кадров → инициализация сцен → главный rAF-цикл.
(function () {
  // Отключаем восстановление позиции скролла при перезагрузке — стартуем сверху.
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  var loader = document.getElementById('loader');
  var loaderProgress = document.getElementById('loader-progress');
  var canvas = document.getElementById('stage');

  function onProgress(p) {
    loaderProgress.textContent = Math.round(p * 100) + '%';
  }

  function start(frames) {
    var SM = Affogato.SceneManager;
    var diving = Affogato.Scenes.Diving;
    var dark = Affogato.Scenes.Dark;

    Affogato.TitleOverlay.init();
    diving.init(canvas, { frames: frames });
    dark.init(canvas);
    SM.register(diving);
    SM.register(dark);
    SM.layout(); // задаёт высоту body и размер canvas

    window.scrollTo(0, 0);
    Affogato.SmoothScroll.init({ ease: Affogato.Config.scroll.ease });
    Affogato.SmoothScroll.setAutoTransitionProvider(function () {
      return SM.transitionRange(0);
    });

    // Рисуем первый кадр до показа canvas — чтобы не мигнуло пустотой.
    SM.render(0);

    document.body.classList.add('ready');
    loader.classList.add('hidden');

    window.addEventListener('resize', function () { SM.layout(); });

    function loop() {
      SM.render(Affogato.SmoothScroll.update());
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  Affogato.Preloader.loadAll(onProgress).then(start);
})();
