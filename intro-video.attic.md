# Intro-видео (законсервировано)

Наработки по проигрыванию `assets/start-video.mp4` поверх первого кадра погружения. Поставлено на полку — текущее видео не подходит по цвету и зацикленности. Когда будет новое — вернуть по этой инструкции.

## Что было сделано

- Видео автоматически проигрывается на старте (один раз).
- Замедление через `video.playbackRate` (параметр в config).
- Плавный crossfade в первый кадр секвенции: стартует за `crossfadeSec` до конца видео (по `timeupdate`, с учётом `playbackRate` в реальном времени) либо при первом скролле (> `scrollThresholdPx`).
- Перезапуск при возврате к началу через `returnToSurface` — `replay()` под прикрытием `transit-overlay`.
- iOS: `playsinline` + `muted` + `autoplay`-fallback (если `play()` отказывается — fade сразу, без чёрного слоя).
- `playbackRate` восстанавливается на `loadedmetadata` / `play` / `ratechange` — Safari иначе сбрасывает.
- После fade освобождается декодер (`removeAttribute('src')` + `load()`).

## Известные нюансы

- Safari жмёт `playbackRate` снизу ~до 0.5 — если в новом видео нужно сильное замедление, кодируй файл уже медленным (через ffmpeg / Premiere).
- Видео должно либо вписываться в стилистику первого кадра секвенции (минимум разница цвета/композиции), либо последний кадр должен идеально совпадать с `diving_under_water_frame_0001.jpg`, чтобы crossfade не «щёлкал».
- Длительность зацикливания/loop ещё не реализована — текущая версия играет один раз. Если новое видео — короткий цикл, добавь `videoEl.loop = true` и убери `ended`-fadeOut + `timeupdate`-fadeOut по `realRemaining`.

---

## Как вернуть в проект

Файлы, которые нужно тронуть: `index.html`, `js/config.js`, `styles.css`, `js/app.js`, и создать заново `js/intro-video.js`.

### 1. `index.html`

После `<canvas id="stage"></canvas>` (перед `<nav id="top-nav">`):

```html
<!-- Intro-видео поверх первого кадра погружения. Гаснет на `ended` или при
     первом скролле, см. js/intro-video.js. -->
<video id="intro-video" class="intro-video" playsinline muted preload="auto" aria-hidden="true"></video>
```

Перед `<script src="js/app.js"></script>`:

```html
<script src="js/intro-video.js"></script>
```

### 2. `js/config.js`

В `scenes.diving`, рядом с `fadeOutMax`:

```js
// Intro-видео: проигрывается один раз поверх первого кадра при заходе
// на сайт; гаснет либо по `ended`, либо при первом скролле. Логика —
// в js/intro-video.js. Не участвует в SceneManager.
intro: {
  videoSrc: 'assets/start-video.mp4',
  playbackRate: 1 / 6,    // замедление; Safari зажимает ниже ~0.5
  crossfadeSec: 0.3,      // длительность fade-out
  scrollThresholdPx: 4,   // после какого scrollPx прервать видео
},
```

### 3. `styles.css`

После блока `body.ready #stage { opacity: 1; }`:

```css
/* Intro-видео: лежит поверх #stage (z-index 0) до окончания или первого
   скролла, потом класс is-hidden плавно опускает opacity до 0 и под собой
   проявляется первый кадр секвенции, нарисованный в canvas. Под titles (4)
   и UI (5) — они должны быть видны поверх видео. */
.intro-video {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: 2;
  opacity: 1;
  pointer-events: none;
  transition: opacity var(--intro-fade-sec, 0.3s) ease;
}

.intro-video.is-hidden {
  opacity: 0;
}
```

### 4. `js/app.js`

В `start()`, после `SM.render(0)` (перед `document.body.classList.add('ready')`):

```js
// Intro-видео поверх первого кадра. Автозапуск с playbackRate из конфига.
if (Affogato.IntroVideo) Affogato.IntroVideo.init();
```

В функции `loop()`, сразу после `var scrollPx = Affogato.SmoothScroll.update();`:

```js
if (Affogato.IntroVideo) Affogato.IntroVideo.tick(scrollPx);
```

В `returnToSurface()`, внутри первого `setTimeout` (рядом с `SM.render(0)` после `stoneVideo.hide()`):

```js
// Перезапускаем intro-видео под transit-overlay (он ещё тёмный):
// когда overlay снимется во втором setTimeout, видео уже играет.
if (Affogato.IntroVideo) Affogato.IntroVideo.replay();
```

### 5. `js/intro-video.js` (новый)

```js
// Intro-видео поверх первого кадра diving. Гаснет либо по `ended`, либо
// при первом скролле. Не участвует в SceneManager.
window.Affogato = window.Affogato || {};

Affogato.IntroVideo = (function () {
  var videoEl;
  var cfg;
  var isHidden = false;
  var fadeTimer = null;

  function init() {
    videoEl = document.getElementById('intro-video');
    if (!videoEl) return;

    cfg = (Affogato.Config.scenes.diving && Affogato.Config.scenes.diving.intro) || {};
    if (!cfg.videoSrc) {
      // Без источника — сразу скрываем, чтобы не висел пустой чёрный слой.
      hideImmediately();
      return;
    }

    // CSS-переменная управляет длительностью CSS transition opacity.
    var fadeSec = cfg.crossfadeSec != null ? cfg.crossfadeSec : 0.3;
    document.documentElement.style.setProperty('--intro-fade-sec', fadeSec + 's');

    var rate = cfg.playbackRate || 1;

    // playbackRate надо ставить ПОСЛЕ метаданных: при назначении src и
    // последующем load() значение rate в Safari сбрасывается в 1. Ставим на
    // 'loadedmetadata' и страхуемся через 'play' — это надёжно отрабатывает
    // на iOS Safari и Chrome.
    var applyRate = function () {
      videoEl.playbackRate = rate;
      videoEl.defaultPlaybackRate = rate;
    };
    videoEl.addEventListener('loadedmetadata', applyRate);
    videoEl.addEventListener('play', applyRate);
    // Если браузер зажмёт rate снизу (Safari, как правило, ниже 0.5 не пускает) —
    // в консоль уйдёт фактическое значение, чтобы не гадать.
    videoEl.addEventListener('ratechange', function () {
      if (Math.abs(videoEl.playbackRate - rate) > 0.001) {
        // eslint-disable-next-line no-console
        console.warn('[intro-video] браузер зажал playbackRate:', videoEl.playbackRate, 'хотели', rate);
      }
    });

    videoEl.src = cfg.videoSrc;

    // Запускаем fade ЗА crossfadeSec до конца — иначе пользователь видит
    // последний кадр, а лишь потом он начинает гаснуть. Считаем оставшееся в
    // реальном времени (с учётом playbackRate): при медленном rate видео-секунд
    // до конца остаётся меньше, чем реальных секунд.
    videoEl.addEventListener('timeupdate', function () {
      if (isHidden) return;
      var dur = videoEl.duration;
      if (!Number.isFinite(dur) || dur <= 0) return;
      var fadeSec = cfg.crossfadeSec != null ? cfg.crossfadeSec : 0.3;
      var rate = Math.max(0.01, videoEl.playbackRate);
      var realRemaining = (dur - videoEl.currentTime) / rate;
      if (realRemaining <= fadeSec) fadeOut();
    });
    // На случай, если timeupdate не успел тикнуть до ended (короткие видео,
    // большой rate) — дублирующая страховка.
    videoEl.addEventListener('ended', function () {
      fadeOut();
    });

    var playPromise = videoEl.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(function () {
        // iOS autoplay policy / другие ошибки — не оставляем чёрный слой,
        // сразу открываем первый кадр под видео.
        fadeOut();
      });
    }
  }

  function tick(scrollPx) {
    if (isHidden || !cfg) return;
    var threshold = cfg.scrollThresholdPx != null ? cfg.scrollThresholdPx : 4;
    if (scrollPx > threshold) fadeOut();
  }

  function fadeOut() {
    if (isHidden || !videoEl) return;
    isHidden = true;
    videoEl.classList.add('is-hidden');

    var fadeSec = (cfg && cfg.crossfadeSec != null) ? cfg.crossfadeSec : 0.3;
    if (fadeTimer) window.clearTimeout(fadeTimer);
    // По окончании fade останавливаем декодер: на iOS висящий <video> ест
    // память и иногда тормозит canvas-рендер.
    fadeTimer = window.setTimeout(function () {
      if (!videoEl.paused) videoEl.pause();
      videoEl.removeAttribute('src');
      try { videoEl.load(); } catch (e) {}
    }, fadeSec * 1000 + 50);
  }

  function hideImmediately() {
    if (!videoEl) return;
    isHidden = true;
    videoEl.classList.add('is-hidden');
    videoEl.style.display = 'none';
  }

  // Перезапуск при возврате к началу (returnToSurface в app.js). После
  // fadeOut мы освободили декодер (removeAttribute('src') + load()), поэтому
  // здесь заново выставляем src и стартуем воспроизведение с нуля.
  function replay() {
    if (!videoEl || !cfg || !cfg.videoSrc) return;
    if (fadeTimer) {
      window.clearTimeout(fadeTimer);
      fadeTimer = null;
    }
    isHidden = false;
    videoEl.classList.remove('is-hidden');
    videoEl.style.display = '';
    // Назначаем src заново только если он сброшен (после fadeOut). Иначе
    // повторное присваивание тех же байт триггерит лишний load() и Safari
    // зацикливается на буферизации.
    if (!videoEl.src || videoEl.src.indexOf(cfg.videoSrc) === -1) {
      videoEl.src = cfg.videoSrc;
    }
    try { videoEl.currentTime = 0; } catch (e) {}
    var p = videoEl.play();
    if (p && typeof p.catch === 'function') {
      p.catch(function () { fadeOut(); });
    }
  }

  return {
    init: init,
    tick: tick,
    replay: replay,
  };
})();
```
