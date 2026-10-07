/*
  Theme and language for konta.md.

  Romanian is the source language and lives in the HTML itself, so a Romanian visitor (the
  majority) downloads no translation file at all and a crawler reads real text rather than an
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

  // Language and theme are shared with app.konta.md: two cookies on the whole konta.md domain,
  // konta_lang and konta_theme, kept a year, each with konta_lang_at and konta_theme_at saying
  // when it was chosen, so that signing in to the app keeps the newer of this choice and the
  // account's. Choosing English and dark here means arriving in the app in English and dark, and
  // the reverse; the app's src/preferences.ts reads and writes the same four. Before them each
  // site kept its own copy in localStorage (konta.lang, konta.theme), which is still read so
  // nobody loses a choice already made.
  var YEAR = 365 * 24 * 60 * 60;
  var host = window.location.hostname;
  var SHARED = host === 'konta.md' || /\.konta\.md$/.test(host) ? '; Domain=konta.md; Secure' : '';

  function read(name) {
    var match = new RegExp('(?:^|;\\s*)konta_' + name + '=([^;]*)').exec(document.cookie);
    if (match) return decodeURIComponent(match[1]);
    try {
      return localStorage.getItem('konta.' + name);
    } catch (e) {
      return null;
    }
  }

  function cookie(name, value) {
    document.cookie =
      'konta_' + name + '=' + encodeURIComponent(value) + '; Path=/; Max-Age=' + YEAR + '; SameSite=Lax' + SHARED;
  }

  function write(name, value) {
    cookie(name, value);
    cookie(name + '_at', String(Date.now()));
    try {
      localStorage.setItem('konta.' + name, value);
    } catch (e) {
      /* private mode: the cookie carries it */
    }
  }

  /* ------------------------------------------------------------------ theme */

  var themeBtn = document.querySelector('[data-theme-btn]');
  var lessMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // The device's theme unless somebody chose, here or in the app. The page's first script has
  // already set data-theme from the shared cookie or the device.
  function isDark() {
    return root.dataset.theme === 'dark';
  }

  function chosen() {
    var saved = read('theme');
    return saved === 'dark' || saved === 'light';
  }

  var logos = Array.prototype.slice.call(document.querySelectorAll('[data-logo]'));

  // The control's icon is drawn by CSS from the same selectors as the colours, so only the mark is
  // left to swap here: the logo's aubergine disappears against a dark ground.
  function paintToggle() {
    var dark = isDark();

    logos.forEach(function (logo) {
      var wanted = dark ? 'logo-dark.png' : 'logo.png';
      var next = logo.src.replace(/logo(-dark)?\.png/, wanted);
      if (logo.src !== next) logo.src = next;
    });
  }

  // Hold the sweep until the new logo is decoded, so it arrives with the new colours rather than
  // swapping halfway through. Never wait long: a slow connection gets the sweep on time and the
  // mark a moment later.
  function logosReady() {
    var decoded = Promise.all(
      logos.map(function (logo) {
        return logo.decode ? logo.decode().catch(function () {}) : null;
      })
    );
    var patience = new Promise(function (resolve) {
      setTimeout(resolve, 300);
    });
    return Promise.race([decoded, patience]);
  }

  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var next = isDark() ? 'light' : 'dark';

      function apply() {
        root.dataset.theme = next;
        write('theme', next);
        paintToggle();
      }

      // The sweep from site.css, where the browser can do it and the visitor has not asked for
      // less motion. Everywhere else the theme changes at once.
      if (!document.startViewTransition || lessMotion.matches) {
        apply();
        return;
      }

      document.startViewTransition(function () {
        apply();
        return logosReady();
      });
    });
  }

  // While nobody has chosen, a device that switches between light and dark takes the page with it.
  if (window.matchMedia) {
    var deviceDark = window.matchMedia('(prefers-color-scheme: dark)');
    var follow = function () {
      if (chosen()) return;
      root.dataset.theme = deviceDark.matches ? 'dark' : 'light';
      paintToggle();
    };
    if (deviceDark.addEventListener) deviceDark.addEventListener('change', follow);
    else if (deviceDark.addListener) deviceDark.addListener(follow);
  }

  paintToggle();

  /* -------------------------------------------------------------- copyright */

  // The site went up in 2026. The markup says 2026 for anyone without script; after that the
  // footer runs from 2026 to the visitor's current year.
  var FIRST_YEAR = 2026;
  var thisYear = new Date().getFullYear();
  Array.prototype.forEach.call(document.querySelectorAll('[data-year]'), function (node) {
    node.textContent = thisYear > FIRST_YEAR ? FIRST_YEAR + ' - ' + thisYear : String(FIRST_YEAR);
  });

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
    if (remember) write('lang', lang);

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
  var initial = LANGS.indexOf(asked) !== -1 ? asked : read('lang');
  if (initial && initial !== SOURCE) select(initial, asked === null);
})();
