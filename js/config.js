// Единая точка конфигурации: манифест кадров и параметры тюнинга.
window.Affogato = window.Affogato || {};

Affogato.Config = {
  // Манифест секвенции погружения.
  // Файлы: diving_under_water_frames/diving_under_water_frame_0001.jpg ... _0086.jpg
  frames: {
    dir: 'diving_under_water_frames',
    prefix: 'diving_under_water_frame_',
    pad: 4,
    start: 1,
    count: 86,
    ext: '.jpg',
    width: 1280,
    height: 704,
  },

  scroll: {
    ease: 0.09,         // инерция: доля пути к таргету за один кадр rAF
    transitionVH: 0.15, // длина перехода между сценами (меньше — быстрее переход)
    autoTransitionSec: 0.3, // автопроигрывание перехода между последним кадром и темнотой
    songTransitionSec: 0.55, // автопереход между карточками песен
    hintTransitionSec: 1.55, // клик по «погрузиться»: мягкий шаг к следующей сцене
    returnToTopSec: 1.2, // длительность визуального подъёма к началу
  },

  // Баланс качества и нагрева. Самая дорогая часть сайта — полноэкранный canvas:
  // на Retina 2x он рисует в 4 раза больше пикселей, чем экран в CSS-пикселях.
  performance: {
    maxDpr: 1.5,        // 2 -> 1.5 снижает площадь canvas примерно на 44%
    activeFps: 60,      // во время скролла и автопереходов
    idleFps: 30,        // когда страница стоит, но вода/карточки ещё «дышат»
    transitIdleFps: 24, // фон плеера после погружения
    sleepMs: 180,       // пауза главного цикла, пока открыт плеер/идёт возврат
  },

  scenes: {
    diving: {
      framesVH: 2,     // длина сцены погружения в высотах экрана (меньше — быстрее)
      startSpeed: 0.4, // скорость на старте, доля от равномерной:
                       // 1 — равномерно, меньше — сильнее ускорение к концу
      fadeOutStart: 0.78, // прогресс, с которого последний кадр уходит в фейд
      fadeOutMax: 0.92,   // максимальная плотность затемнения к p=1 (0..1)
      titles: {
        sizeScale: 0.85, // общий множитель размера текста: 1 — базово, 1.2 — крупнее, 0.85 — меньше
        group: {
          text: 'АФФОГАТО',
          delaySec: 0.5,
          startTopVH: 35,
          endTopVH: 17,   // = polaroid.groupTopVH — без прыжка позиции на переходе
          opacityStart: 1,
          opacityEnd: 0.12,
        },
        album: {
          text: 'после падения',
          delaySec: 0.5,
          startTopVH: 53,
          endTopVH: 87,
          opacityStart: 0.95,
          opacityEnd: 0.22,
        },
        mobile: {
          // На мобиле для diving оставляем десктопную раскладку: «после падения»
          // снизу, при погружении уходит вниз вместе с водой. edgeGuard на
          // низких экранах сам подожмёт к границе под «погрузиться».
          // Для polaroid: «АФФОГАТО» в верхней зоне, чтобы не висел в середине
          // полароида; «после падения» — у нижней кромки (edgeGuard зажмёт его
          // над «погрузиться»).
          polaroid: {
            groupTopVH: 8,
            albumTopVH: 92,
          },
        },
        // Положения и яркость титров на экране плеера. Не заданное — берётся
        // из endTopVH / opacityEnd соответствующего блока.
        player: {
          groupTopVH: 17,      // как опустить «АФФОГАТО» под навигацию плеера
          albumTopVH: 87,
          groupOpacity: 0.32,
          albumOpacity: 0.22,
        },
        // Аналогично — для сцен с полароидами. «АФФОГАТО» опущен ниже, чтобы
        // не пересекаться с кнопкой «вернуться» наверху. «После падения»
        // сделан почти невидимым: иначе налезает на «погрузиться» с подписью
        // снизу. Позиция держит низкий бекграунд-уровень для атмосферы.
        polaroid: {
          groupTopVH: 17,
          albumTopVH: 87,
          groupOpacity: 0.22,
          albumOpacity: 0.08,
        },
      },
    },
    songs: {
      scrollVH: 1.15,
      fadeInSec: 0.8,
      // Подводная «жизнь» карточки: дрейф.
      card: {
        cardOpacity: 0.52, // прозрачность полароида в воде
        textOpacity: 0.68, // прозрачность правого текстового блока
        drift: {
          ampX: 11,      // px — амплитуда бокового покачивания
          ampY: 12,      // px — вертикального
          ampRot: 0.7,  // deg — покачивание наклоном
          speed: 0.6,     // общий множитель скорости (меньше — медленнее)
        },
        // Реакция карточки на курсор/палец: яркость на 100%, лёгкий наклон с объёмом.
        hover: {
          maxAngle: 8,            // deg — макс. угол rotateX/Y
          scaleMax: 1.04,         // итоговый scale в активной фазе
          lerpSpeed: 0.18,        // скорость схождения к таргету за кадр
          gradientMax: 0.55,      // макс. opacity свето-теневого ::after
          longPressMs: 250,       // задержка активации на touch
          touchMoveCancelPx: 10,  // сдвиг пальца, отменяющий long-press (расценивается как скролл)
          revealThreshold: 0.05,  // нижний порог revealOpacity, при котором карточка реагирует
        },
      },
      items: [
        {
          title: 'Пресловутая гордость',
          year: '1999',
          cover: 'assets/song-covers/the-proverbial-pride.png',
          audio: 'assets/songs/the-proverbial-pride.mp3',
          note: 'Мотив песни кардинально изменился из-за неожиданного эксперимента с нейросетями, в то время как текст остался почти неизменным. Первоначально композиция имела более плавный и протяжный характер с длинными завываниями между куплетами.',
        },
        {
          title: 'После падения',
          year: '2003-2026',
          cover: 'assets/song-covers/after-the-fall.png',
          audio: 'assets/songs/after-the-fall.m4a',
          note: 'Сначала был просто немного слащавый стих, написанный в 2005 г. А в 2026 г. после экспериментов с теми же нейросетями песня обрела мотив, а текст был переработан и дополнен.',
        },
        {
          title: 'Вечная жизнь',
          year: '2025-2026',
          cover: 'assets/song-covers/eternal-life.png',
          audio: 'assets/songs/eternal-life.mp3',
          note: 'Год я мысленно напевал четверостишье о вечности. Затем, когда менял струны на гитаре, решил попробовать положить его на музыку. Для куплета я использовал уже готовые строки другого стихотворения.',
        },
        {
          title: 'Цвела земля',
          year: '2005-2006',
          cover: 'assets/song-covers/the-Earth-was-blooming.png',
          audio: 'assets/songs/the-Earth-was-blooming.m4a',
          note: 'Песня рождалась исключительно в воображении на протяжении года. Спустя некоторое время был добавлен финальный куплет, однако он не был включён в окончательную версию.',
        },
      ],
    },
    stoneVideo: {
      scrollVH: 1,
      videoSrc: 'assets/final-video.mp4',
      background: '#000000',
    },
    forest: {
      // Манифест секвенции «в лесу» — модальный переход по клику «что это?».
      // Грузится лениво, при первом клике (не входит в стартовый Preloader).
      frames: {
        dir: 'into-the-forest_frames',
        prefix: 'into-the-forest_frame_',
        pad: 4,
        start: 1,
        count: 79,
        ext: '.jpg',
        width: 1280,
        height: 720,
      },
      descentSec: 1.2,            // длительность авто-входа (симметрично player)
      ascentSec: 1.2,             // длительность авто-возврата
      returnScrollThreshold: 920, // порог накопленного scroll-up для срыва из «о проекте»
      startSpeed: 0.4,            // нелинейная привязка прогресса к кадру (как в diving)
      // Мобильный «pan»: на портретных экранах последние кадры плавно
      // сдвигают изображение по горизонтали (cover обрезает широкий 16:9
      // по краям, и хижина уезжает за пределы). Знак endShiftFrac:
      // отрицательный = картинка движется влево, в экране открывается то,
      // что было за правой кромкой; положительный — наоборот. endShiftFrac
      // в долях от ширины отмасштабированного кадра (dw).
      mobilePan: {
        startProgress: 0.88, // с какого прогресса начинать pan (последние ~12% кадров)
        endShiftFrac: 0.12, // итоговое смещение на progress=1 (≈22% dw)
      },
    },
    sky: {
      // Манифест секвенции «в небо» — модальный переход по клику «написать».
      // Структурно повторяет forest: лениво грузится при первом клике, на
      // финальном кадре проявляется панель с формой письма.
      frames: {
        dir: 'into-the-sky',
        prefix: 'into-the-sky_frame_',
        pad: 4,
        start: 1,
        count: 81,
        ext: '.jpg',
        width: 1280,
        height: 720,
      },
      descentSec: 1.2,
      ascentSec: 1.2,
      returnScrollThreshold: 920,
      startSpeed: 0.4,
    },
  },

  // Локальный плеер альбома (js/player.js).
  player: {
    stillSrc: 'assets/stone-still.png', // стоп-кадр со дна, фон плеера
    descentSec: 1.2,  // длительность анимации погружения по клику «послушать»
    ascentSec: 1.2,   // держим симметрию: возврат ощущается как обратное погружение
    returnScrollThreshold: 920, // сколько upward-scroll нужно накопить для выхода из плеера
    returnPreviewMax: 0.14, // максимальная доля подъёма до реального выхода
    returnPreviewSettleSec: 0.55, // как быстро preview возвращается, если отпустить скролл
    initialVolume: 0.8, // дефолтная громкость до первого сохранения в localStorage
    platforms: [
      {
        name: 'Яндекс Музыка',
        url: 'https://music.yandex.ru/artist/25763131',
        icon: 'https://music.yandex.ru/favicon.ico',
      },
      {
        name: 'VK Музыка',
        url: 'https://vk.ru/artist/3370093710875078942',
        icon: 'https://vk.ru/favicon.ico',
        iconFit: 'cover',
      },
      {
        name: 'Spotify',
        url: 'https://open.spotify.com/artist/5xUN3y9ink4drWwpSX441a',
        icon: 'https://open.spotify.com/favicon.ico',
      },
      {
        name: 'Apple Music',
        url: 'https://music.apple.com/to/artist/аффогато/1894767834',
        icon: 'https://music.apple.com/favicon.ico',
        iconFit: 'cover',
      },
      {
        name: 'МТС Музыка',
        url: 'https://music.mts.ru/artist/25763131',
        icon: 'https://music.mts.ru/favicon.ico',
        iconFit: 'cover',
      },
      {
        name: 'Звук',
        url: 'https://zvuk.com/artist/214192655',
        icon: 'https://zvuk.com/favicon.ico',
      },
      {
        name: 'Deezer',
        url: 'https://www.deezer.com/ru/artist/388195261',
        icon: 'https://www.deezer.com/favicon.ico',
      },
    ],
  },

  // Процедурный подводный фон песенных сцен (js/underwater-bg.js).
  underwater: {
    topColor: '#0c161b',     // вода у верхней кромки — далёкий свет с поверхности
    bottomColor: '#020304',  // вода в глубине
    particles: {
      count: 180,            // число частиц взвеси (берётся при загрузке)
      color: '#aac3cf',
      sizeScale: 1,          // общий множитель размера взвеси
      minOpacity: 0.04,
      maxOpacity: 0.2,
      speed: 1,              // множитель скорости дрейфа
    },
    rays: {
      count: 3,              // число световых пятен (берётся при загрузке)
      color: '#43606e',
      opacity: 0.1,          // макс. яркость пятна
    },
    // Свет от карточки к карточке: сверху гаснет, снизу (фонарик) разгорается.
    // depth = index / (count - 1) — блок масштабируется на любое число карточек.
    depthLight: {
      topStart: 1,     // верхний свет на первой карточке
      topEnd: 0.05,    // верхний свет на последней (≈ нет)
      bottomStart: 0,  // нижний свет (фонарик) на первой карточке
      bottomEnd: 1,    // нижний свет на последней
    },
    bottomGlow: {
      // цвет берётся из rays.color — нижний свет того же цвета, что верхний
      opacity: 0.45,    // макс. яркость
      centerX: 0.57,    // позиция по горизонтали: 0.5 — центр, >0.5 — правее
    },
    // Параллакс воды: тонкие отклики на прогресс глубины, скорость скролла и
    // общий медленный «ток». Считаются в js/underwater-bg.js, читаются каждый
    // кадр — крути в DevTools вживую. В плеере работает только velocity-отклик,
    // steady-state эффекты (depthShift, currentX) отключены — фон статичен.
    parallax: {
      // (1) Слоистая взвесь по depth (steady-state). На полной глубине сцены
      // (depth=1) ближняя частица (p.depth=1) смещается по Y на эту долю экрана;
      // дальние почти стоят. В плеере выключено.
      depthShift: 0.06,
      // (2) Прямая реакция на velocity скролла: displacement = smoothVel × amplitude.
      // Пока скроллится — взвесь смещена в сторону движения, перестал — быстро
      // (через low-pass) встала. При автопереходе velocity идёт по easing от 0
      // к пику и обратно к 0 → взвесь стабилизируется к концу перехода сама.
      // Знак: скролл вниз страницы (velocity>0) → взвесь вниз по экрану.
      amplitude: 0.04,        // макс. смещение по Y при |velNorm|=1, доля экрана
      velocityRef: 80,        // px/frame, при котором |velNorm| = 1 (с насыщением)
      velocitySmooth: 0.35,   // low-pass: 1.0 — без сглаживания (точнее фаза автоперехода),
                              // меньше — мягче, но displacement чуть отстаёт от остановки
      // (3) Общий горизонтальный ток (steady-state). Очень медленный sin от
      // времени, взвесь смещается сильнее, лучи — слабее. В плеере выключено.
      currentAmpX: 0.018,     // макс. сдвиг взвеси по X, доля ширины
      currentFreq: 0.05,      // рад/сек, период ~125 с
      raysCurrentMul: 0.35,   // доля общего тока для лучей света
    },
  },
};
