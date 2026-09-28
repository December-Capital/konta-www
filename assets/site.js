/*
  Theme and language for konta.md.

  Romanian is the source language and lives in the HTML itself, so a Romanian visitor — the
  majority — downloads no translation file at all and a crawler reads real text rather than an
  empty shell. Russian and English are fetched on demand from assets/ru.json and assets/en.json.
  Keys match the data-t attributes in the markup; a key missing from a catalogue leaves the
  Romanian in place, which is visible rather than silently wrong.
*/

(function () {
  'use strict';

  var root = document.documentElement;
  var LANGS = ['ro', 'ru', 'en'];
  var SOURCE = 'ro';

  // Resolve catalogues against this script rather than the page, so /status/ works too.
  var here = document.currentScript && document.currentScript.src;
  var ASSETS = here ? here.replace(/[^/]*$/, '') : 'assets/';

  /* ---------------------------------------------------------------- storage */

  function read(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      /* private mode: the choice lasts for this page only */
    }
  }

  /* ------------------------------------------------------------------ theme */

  var themeBtn = document.querySelector('[data-theme-btn]');
  var sun = document.querySelector('[data-theme-icon="light"]');
  var moon = document.querySelector('[data-theme-icon="dark"]');
  var systemDark = window.matchMedia('(prefers-color-scheme: dark)');

  function isDark() {
    var chosen = root.dataset.theme;
    if (chosen === 'dark') return true;
    if (chosen === 'light') return false;
    return systemDark.matches;
  }

  var logos = Array.prototype.slice.call(document.querySelectorAll('[data-logo]'));

  // `hidden` is defined on HTMLElement, so assigning svg.hidden = true sets a plain JavaScript
  // property and never touches the attribute — the icon stayed exactly as authored no matter how
  // often the theme changed. Set the attribute.
  function show(node, visible) {
    if (!node) return;
    if (visible) {
      node.removeAttribute('hidden');
    } else {
      node.setAttribute('hidden', '');
    }
  }

  // The button shows the theme you are in: a moon in the dark, a sun in the light. It reads as
  // state rather than as an instruction, which is what people expect of a theme control. The
  // mark swaps too: the logo's aubergine disappears against a dark ground.
  function paintToggle() {
    var dark = isDark();
    show(moon, dark);
    show(sun, !dark);

    logos.forEach(function (logo) {
      var wanted = dark ? 'logo-dark.png' : 'logo.png';
      var next = logo.src.replace(/logo(-dark)?\.png/, wanted);
      if (logo.src !== next) logo.src = next;
    });
  }

  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var next = isDark() ? 'light' : 'dark';
      root.dataset.theme = next;
      write('konta.theme', next);
      paintToggle();
    });
  }

  // Follow the system while no explicit choice has been made.
  var onSystemChange = function () {
    if (!root.dataset.theme) paintToggle();
  };
  if (systemDark.addEventListener) {
    systemDark.addEventListener('change', onSystemChange);
  } else if (systemDark.addListener) {
    systemDark.addListener(onSystemChange);
  }

  paintToggle();

  /* --------------------------------------------------------------- language */

  var nodes = Array.prototype.slice.call(document.querySelectorAll('[data-t]'));
  var labelled = Array.prototype.slice.call(document.querySelectorAll('[data-t-aria-label]'));
  var cycler = document.querySelector('[data-lang-cycle]');

  // Each language names itself, and never in translation.
  var NAMES = { ro: 'Română', ru: 'Русский', en: 'English' };

  function nextAfter(lang) {
    return LANGS[(LANGS.indexOf(lang) + 1) % LANGS.length];
  }

  // The Romanian already in the document is the fallback catalogue.
  var source = {};
  nodes.forEach(function (node) {
    source[node.dataset.t] = node.tagName === 'META' ? node.content : node.textContent.trim();
  });
  labelled.forEach(function (node) {
    source[node.dataset.tAriaLabel] = node.getAttribute('aria-label');
  });

  // Strings a page swaps in at runtime have no element to be read off at load, so the Romanian
  // for them is seeded from the page instead. Source language still lives in the document.
  var seed = document.querySelector('script[type="application/json"][data-seed]');
  if (seed) {
    try {
      var extra = JSON.parse(seed.textContent);
      Object.keys(extra).forEach(function (key) {
        source[key] = extra[key];
      });
    } catch (e) {
      /* a broken seed leaves the page as authored */
    }
  }

  var catalogues = {};
  catalogues[SOURCE] = source;
  var current = SOURCE;

  function apply(lang) {
    current = lang;
    var words = catalogues[lang] || source;

    nodes.forEach(function (node) {
      var value = words[node.dataset.t];
      if (typeof value !== 'string') return;
      if (node.tagName === 'META') {
        node.content = value;
      } else {
        node.textContent = value;
      }
    });

    labelled.forEach(function (node) {
      var value = words[node.dataset.tAriaLabel];
      if (typeof value === 'string') node.setAttribute('aria-label', value);
    });

    root.lang = lang;
    root.dataset.lang = lang;

    // The control shows the language you are reading, and pressing it moves to the next one.
    // The accessible name keeps the visible code in it, so a voice-control user can say what they
    // can see, and then names where a press would take them.
    if (cycler) {
      var next = nextAfter(lang);
      var hint = lang.toUpperCase() + '. ' + (words['lang.next'] || '') + ' ' + NAMES[next];

      cycler.textContent = lang.toUpperCase();
      cycler.setAttribute('lang', lang);
      cycler.setAttribute('aria-label', hint.replace(/\s+/g, ' ').trim());
      cycler.setAttribute('title', NAMES[next]);
    }

    document.dispatchEvent(new CustomEvent('konta:lang', { detail: { lang: lang } }));
  }

  function select(lang, remember) {
    if (LANGS.indexOf(lang) === -1) return;
    if (remember) write('konta.lang', lang);

    if (catalogues[lang]) {
      apply(lang);
      return;
    }

    fetch(ASSETS + lang + '.json', { credentials: 'omit' })
      .then(function (response) {
        if (!response.ok) throw new Error(String(response.status));
        return response.json();
      })
      .then(function (words) {
        catalogues[lang] = words;
        apply(lang);
      })
      .catch(function () {
        // A missing catalogue leaves Romanian on screen rather than a half-empty page.
        apply(SOURCE);
      });
  }

  if (cycler) {
    cycler.addEventListener('click', function () {
      select(nextAfter(current), true);
    });
  }

  // Pages that rewrite a data-t at runtime call this to re-label in the current language.
  window.konta = {
    relabel: function () {
      apply(current);
    },
    lang: function () {
      return current;
    },
  };

  var asked = new URLSearchParams(window.location.search).get('lang');
  var initial = LANGS.indexOf(asked) !== -1 ? asked : read('konta.lang');
  if (initial && initial !== SOURCE) select(initial, asked === null);
})();
