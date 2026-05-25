# Intro-видео (законсервировано)

Наработки по проигрыванию `assets/start-video.mp4` поверх первого кадра погружения. Поставлено на полку — переход к видео (fadeIn после возврата) ощущается резковатым из-за того, что между снятием `is-hidden` и реальным декодированием первого кадра есть пауза (50–300мс), видна как «щелчок». Не успел доделать сглаживание (см. «Идеи, которые не успели попробовать» в конце).

## Что было сделано

- Видео автозапускается на старте сайта.
- Замедление через `video.playbackRate` (параметр в config).
- **loop=true** — крутится бесконечно до первого скролла.
- Цветокор через CSS-фильтр (`config.scenes.diving.intro.filter`), применяется как `filter: var(--intro-filter)` на `.intro-video`. Крутится вживую в DevTools:
  ```js
  document.documentElement.style.setProperty('--intro-filter', 'brightness(0.9) saturate(0.8)')
  ```
- Fade-out по первому скроллу (`scrollPx > scrollThresholdPx`), fade-in при возврате к `scrollPx ≤ threshold`. Длительность — `crossfadeSec`.
- Перезапуск (`replay()`) при выходе из плеера (`closePlayer`) и при `returnToSurface` — под прикрытием `transit-overlay`.
- iOS: `playsinline` + `muted` + `autoplay`-fallback (если `play()` отклоняется — fade сразу).
- `playbackRate` восстанавливается на `loadedmetadata` / `play` / `ratechange` — Safari иначе сбрасывает в 1.
- После fade освобождается декодер (`removeAttribute('src')` + `load()`) — на iOS висящий `<video>` ест память.
- `replay()` идемпотентен (страж `if (!isHidden) return`) — auto-replay из `tick` не сбрасывает currentTime каждый кадр.

## Известные нюансы / открытые вопросы

- **Safari жмёт `playbackRate` снизу** ~до 0.5. Если в новом видео нужно сильное замедление — кодируй файл уже медленным (ffmpeg / Premiere).
- **Чёрный flash при fade-in**: после `replay()` мы сразу снимаем `is-hidden` (opacity 0→1 за `crossfadeSec`), но реальный кадр видео появляется через 50–300мс (буферизация). В этом окне видна тёмная подложка `<video>`. Длинный `crossfadeSec` симптом не лечит. См. идеи ниже.
- **`object-fit: cover`** — текущее видео обрезается по краям; если новое видео имеет важные элементы у краёв, нужно пересмотреть позиционирование.

## Идеи, которые не успели попробовать

1. **Ждать `playing` перед снятием `is-hidden`**: `replay()` стартует загрузку, не трогая класс. На событие `playing` снимаем `is-hidden`. Гарантия, что fade-in идёт уже на живом кадре, без чёрного flash. Это лучший вариант.
2. **Разные длительности fadeIn/fadeOut** — fadeOut при скролле резче (0.3s), fadeIn при возврате длиннее (1.0–1.5s).
3. **Blur-переход** — `filter: blur(8px)` → `blur(0)` параллельно с opacity. На iOS Safari blur на видео иногда подтормаживает.
4. **Предзагрузка через preloader** — добавить видео в `Preloader.loadAll()` (chunked fetch + canplaythrough), чтобы старт был мгновенным.

---

## Как вернуть в проект

Файлы: `index.html`, `js/config.js`, `styles.css`, `js/app.js`, `js/player.js`, и создать `js/intro-video.js`.

### 1. `index.html`

После `<canvas id="stage"></canvas>` (перед `<nav id="top-nav">`):

```html
<!-- Intro-видео поверх первого кадра погружения. Гаснет на скролле, см. js/intro-video.js. -->
<video id="intro-video" class="intro-video" playsinline muted preload="auto" aria-hidden="true"></video>
```

Перед `<script src="js/player.js"></script>`:

```html
<script src="js/intro-video.js"></script>
```

### 2. `js/config.js`

В `scenes.diving`, рядом с `fadeOutMax`:

```js
// Intro-видео: проигрывается циклом поверх первого кадра при заходе на сайт;
// гаснет при первом скролле, восстанавливается при возврате к началу.
// Логика — в js/intro-video.js. Не участвует в SceneManager.
intro: {
  videoSrc: 'assets/start-video.mp4',
  playbackRate: 1,        // 1 = оригинал; Safari зажимает ниже ~0.5
  crossfadeSec: 0.3,      // длительность fadeIn/fadeOut
  scrollThresholdPx: 4,   // ниже этого scrollPx — видео видно; выше — гаснет
  // Цветокор: применяется как CSS filter к <video>. Подгоняем палитру под
  // первый кадр секвенции, чтобы переход не «щёлкал». Любая валидная цепочка
  // CSS-функций filter: brightness/contrast/saturate/hue-rotate/sepia/blur.
  filter: 'brightness(0.85) contrast(1.05) saturate(0.85)',
},
```

### 3. `styles.css`

После блока `body.ready #stage { opacity: 1; }`:

```css
/* Intro-видео: лежит поверх #stage (z-index 0) до первого скролла, потом
   класс is-hidden плавно опускает opacity до 0 и под собой проявляется
   первый кадр секвенции, нарисованный в canvas. Под titles (4) и UI (5). */
.intro-video {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: 2;
  opacity: 1;
  pointer-events: none;
  /* Цветокор: значение задаётся из config.scenes.diving.intro.filter
     через CSS-переменную (см. js/intro-video.js). */
  filter: var(--intro-filter, none);
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

В `loop()`, сразу после `var scrollPx = Affogato.SmoothScroll.update();`:

```js
if (Affogato.IntroVideo) Affogato.IntroVideo.tick(scrollPx);
```

В `returnToSurface()`, внутри первого `setTimeout` (после `SM.render(0)`):

```js
// Перезапускаем intro-видео под transit-overlay (он ещё тёмный):
// когда overlay снимется во втором setTimeout, видео уже играет.
if (Affogato.IntroVideo) Affogato.IntroVideo.replay();
```

### 5. `js/player.js`

В `closePlayer()`, внутри `setTimeout`, после `Affogato.TitleOverlay.reset();` и ДО `Affogato.Transit.stop();`:

```js
// Перезапускаем intro-видео до Transit.stop(): пока overlay ещё гасит
// экран, видео успевает стартовать и появиться плавно.
if (Affogato.IntroVideo) Affogato.IntroVideo.replay();
```

### 6. `js/intro-video.js` (новый)

```js
// Intro-видео поверх первого кадра diving. Гаснет на скролле, возвращается
// при возврате к началу. Не участвует в SceneManager.
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

    // Цветовой фильтр для видео — применяется через CSS var --intro-filter
    // (см. .intro-video в styles.css). В DevTools крутить можно так:
    //   document.documentElement.style.setProperty('--intro-filter', 'brightness(0.9) saturate(0.8)')
    if (cfg.filter) {
      document.documentElement.style.setProperty('--intro-filter', cfg.filter);
    }

    // Зацикливаем: видео крутится, пока пользователь не начнёт скроллить.
    // С loop=true события 'ended' не возникают, поэтому listener'ы по
    // окончанию видео не нужны.
    videoEl.loop = true;

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
    if (!cfg) return;
    var threshold = cfg.scrollThresholdPx != null ? cfg.scrollThresholdPx : 4;
    if (scrollPx > threshold) {
      if (!isHidden) fadeOut();
    } else {
      // Пользователь докрутил скроллом обратно к началу — возвращаем видео.
      // replay() идемпотентен (страж по isHidden), повторных play не будет.
      if (isHidden) replay();
    }
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

  // Перезапуск при возврате к началу (returnToSurface в app.js, closePlayer
  // в player.js, auto-replay из tick при scroll-back). После fadeOut мы
  // освободили декодер (removeAttribute('src') + load()), поэтому здесь
  // заново выставляем src и стартуем воспроизведение с нуля.
  function replay() {
    if (!videoEl || !cfg || !cfg.videoSrc) return;
    if (!isHidden) return; // уже играет — не сбрасываем currentTime каждый tick
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
