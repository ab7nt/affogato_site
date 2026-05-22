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
    returnToTopSec: 0.8, // быстрый автоскролл к началу после финальной темноты
  },

  scenes: {
    diving: {
      framesVH: 2,     // длина сцены погружения в высотах экрана (меньше — быстрее)
      startSpeed: 0.4, // скорость на старте, доля от равномерной:
                       // 1 — равномерно, меньше — сильнее ускорение к концу
      titles: {
        sizeScale: 0.85, // общий множитель размера текста: 1 — базово, 1.2 — крупнее, 0.85 — меньше
        group: {
          text: 'АФФОГАТО',
          delaySec: 0.5,
          startTopVH: 35,
          endTopVH: 10,
          opacityStart: 1,
          opacityEnd: 0.12,
        },
        album: {
          text: 'после падения',
          delaySec: 0.5,
          startTopVH: 75,
          endTopVH: 94,
          opacityStart: 0.95,
          opacityEnd: 0.12,
        },
      },
    },
    dark: {
      scrollVH: 1,     // длина сцены-плейсхолдера «темнота» (следующая сцена)
      color: '#000000',
    },
    songs: {
      scrollVH: 1.15,
      fadeInSec: 0.8,
      background: '#030506',
      items: [
        {
          title: 'Пресловутая гордость',
          year: '1999 г.',
          cover: 'assets/song-covers/song1.png',
          note: 'Мотив песни кардинально изменился из-за неожиданного эксперимента с нейросетями, в то время как текст остался почти неизменным. Первоначально композиция имела более плавный и протяжный характер с длинными завываниями между куплетами.',
        },
        {
          title: 'После падения',
          year: '2003-2026 г.',
          cover: 'assets/song-covers/song2.png',
          note: 'Сначала был просто немного слащавый стих, написанный в 2005 г. А в 2026 г. после экспериментов с теми же нейросетями песня обрела мотив, а текст был переработан и дополнен.',
        },
        {
          title: 'Цвела земля',
          year: '2005-2006 г.',
          cover: 'assets/song-covers/song3.png',
          note: 'Песня рождалась исключительно в воображении на протяжении года. Спустя некоторое время был добавлен финальный куплет, однако он не был включён в окончательную версию.',
        },
      ],
    },
    preVideoDark: {
      scrollVH: 0.7,
      color: '#000000',
    },
    stoneVideo: {
      scrollVH: 1,
      videoSrc: '', // сюда добавить путь к видео с дном и камнем
      poster: 'end-frame.jpeg',
      background: '#000000',
    },
    returnDark: {
      scrollVH: 0.45,
      color: '#000000',
    },
  },
};
