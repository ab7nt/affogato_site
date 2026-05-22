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
    transitionVH: 0.35, // длина перехода между сценами (меньше — быстрее переход)
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
  },
};
