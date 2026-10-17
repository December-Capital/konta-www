/*
  Theme and language for konta.md.

  Romanian is the source language and lives in the HTML itself. Every indexable page also exists
  in Russian under /ru/ and in English under /en/, written from assets/ru.json and assets/en.json
  when the site is packaged (tools/languages.py), so a crawler and a visitor both read real text
  in their language at its own address. On those pages the language control is a link to the
  next language's copy, and this script only remembers the choice on the way.

  Pages with no copies (the status page, the 404 page) are translated here instead, from the same
  catalogues fetched on demand. Keys match the data-t attributes in the markup; a key missing from
  a catalogue leaves the Romanian in place, which is visible rather than silently wrong.
*/

(function () {
  'use strict';

  var root = document.documentElement;
  var LANGS = ['ro', 'ru', 'en'];
  // The language the page was written in: Romanian, or the language of its /ru/ or /en/ copy.
  var SOURCE = LANGS.indexOf(root.lang) !== -1 ? root.lang : 'ro';
  // A page with copies in the other languages names them in hreflang alternates. The head script
  // has already moved an address without /ru/ or /en/ to the remembered language's copy.
  var hasCopies = !!document.querySelector('link[rel="alternate"][hreflang]');

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

  // The words already in the document are its own language's catalogue, and the fallback.
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
    cycler.addEventListener('click', function (event) {
      var next = nextAfter(current);
      if (hasCopies && cycler.getAttribute('href')) {
        // A link to the next language's copy: remember the choice, here and for the app, and let
        // the browser follow it.
        write('lang', next);
        return;
      }
      event.preventDefault();
      select(next, true);
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

  // A page with copies is already in its language. One without is translated in place: to the
  // language named by ?lang= (links from the /ru/ and /en/ copies carry it) or by a /ru/ or /en/
  // address the 404 page answers, neither remembered, else to the remembered one.
  if (!hasCopies) {
    var asked = new URLSearchParams(window.location.search).get('lang');
    var prefix = /^\/(ru|en)\//.exec(window.location.pathname);
    if (LANGS.indexOf(asked) === -1) asked = prefix ? prefix[1] : null;
    var initial = asked || read('lang');
    if (initial && initial !== SOURCE) select(initial, asked === null);
  }

  /* --------------------------------------------------------------- sections */

  // The header's sections, as app.konta.md's menu (JellyRadio): the page
  // you are on swells and shoulders its neighbours aside on a spring, the others shrink a little.
  // Its settings are the app's, so both menus move alike. No animation library: a damped spring,
  // stepped per frame.
  var JELLY = { swell: 0.2, barge: 5, shrink: 0.05, jelly: 0.5, bounce: 0.4, stagger: 10, stiffness: 700 };
  // Long enough to see the swell land, short enough not to feel like waiting for the page.
  var LEAVE_AFTER = 160;

  function Spring(value) {
    this.value = value;
    this.velocity = 0;
    this.target = value;
  }

  // Toward the target from where it is, at the speed it already has. Damping from the bounce, as
  // the app's motion springs have it.
  Spring.prototype.to = function (target, stiffness, mass, bounce, startAt) {
    this.target = target;
    this.k = stiffness;
    this.m = mass;
    this.c = 2 * Math.sqrt(stiffness * mass) * (1 - bounce);
    this.startAt = startAt;
  };

  Spring.prototype.jump = function (value) {
    this.value = this.target = value;
    this.velocity = 0;
  };

  Spring.prototype.step = function (now, dt) {
    if (now < this.startAt) return true;
    var force = -this.k * (this.value - this.target) - this.c * this.velocity;
    this.velocity += (force / this.m) * dt;
    this.value += this.velocity * dt;
    if (Math.abs(this.value - this.target) < 0.0005 && Math.abs(this.velocity) < 0.005) {
      this.jump(this.target);
      return false;
    }
    return true;
  };

  Spring.prototype.moving = function () {
    return this.value !== this.target || this.velocity !== 0;
  };

  // Each group of chips on the page moves on its own: the header's sections today.
  function jellyGroup(nav) {
    var chips = Array.prototype.slice.call(nav.querySelectorAll('.jelly__chip'));
    var chosen = chips.findIndex(function (chip) {
      return chip.getAttribute('aria-current') === 'page';
    });
    var widths = [];
    var tops = [];

    var springs = chips.map(function () {
      return { x: new Spring(0), sx: new Spring(1), sy: new Spring(1) };
    });

    function paint() {
      chips.forEach(function (chip, i) {
        var s = springs[i];
        chip.style.transform = 'translateX(' + s.x.value + 'px) scale(' + s.sx.value + ', ' + s.sy.value + ')';
      });
    }

    var frame = 0;
    var last = 0;

    function tick(now) {
      // Small fixed steps, so a stiff spring stays stable on a slow frame.
      var elapsed = Math.min((now - (last || now)) / 1000, 1 / 20);
      last = now;
      var steps = Math.max(1, Math.round(elapsed * 240));
      var dt = elapsed > 0 ? elapsed / steps : 1 / 240;
      var busy = false;
      for (var n = 0; n < steps; n++) {
        springs.forEach(function (s) {
          // Every spring steps; none may be skipped because another is still moving.
          var moved = [s.x.step(now, dt), s.sx.step(now, dt), s.sy.step(now, dt)];
          busy = busy || moved.indexOf(true) !== -1;
        });
      }
      paint();
      frame = busy ? requestAnimationFrame(tick) : 0;
      if (!busy) last = 0;
    }

    function measure() {
      widths = chips.map(function (chip) {
        return chip.offsetWidth;
      });
      tops = chips.map(function (chip) {
        return chip.offsetTop;
      });
      var widest = Math.max.apply(null, widths);
      nav.style.setProperty('--jr-pad-x', Math.ceil((widest * JELLY.swell * 1.3) / 2 + JELLY.barge) + 2 + 'px');
    }

    function settle(on, instant) {
      var rtl = getComputedStyle(nav).direction === 'rtl';
      var push = on < 0 ? 0 : (widths[on] * JELLY.swell) / 2 + JELLY.barge;
      var now = performance.now();
      var j = JELLY.jelly;

      springs.forEach(function (s, i) {
        var far = Math.abs(i - on);
        // A chip on another row of the wrapped header has nothing to make room for.
        var sameRow = on >= 0 && Math.abs(tops[i] - tops[on]) < 2;
        var x = sameRow ? Math.sign(i - on) * (rtl ? -1 : 1) * push : 0;
        var scale = on < 0 ? 1 : i === on ? 1 + JELLY.swell : 1 - JELLY.shrink;

        if (instant || lessMotion.matches) {
          s.x.jump(x);
          s.sx.jump(scale);
          s.sy.jump(scale);
          return;
        }

        var k = JELLY.stiffness * (1 - 0.12 * Math.min(far, 3));
        var inFlight = s.x.moving() || s.sx.moving() || s.sy.moving();
        var at = now + (inFlight ? 0 : far * JELLY.stagger);
        s.x.to(x, k, 0.9, JELLY.bounce, at);
        s.sx.to(scale, k * (1 + 0.24 * j), 0.9 - 0.1 * j, Math.min(0.85, JELLY.bounce + 0.3 * j), at);
        s.sy.to(scale, k * (1 - 0.14 * j), 0.9 + 0.05 * j, JELLY.bounce, at + 50 * j);
      });

      if (instant || lessMotion.matches) {
        paint();
      } else if (!frame) {
        frame = requestAnimationFrame(tick);
      }
    }

    function rest() {
      measure();
      settle(chosen, true);
    }

    rest();
    // New widths: a language translated in place, fonts arriving, the header wrapping differently.
    if (typeof ResizeObserver === 'function') {
      var observer = new ResizeObserver(rest);
      observer.observe(nav);
      chips.forEach(function (chip) {
        observer.observe(chip.firstElementChild);
      });
    }
    if (document.fonts) document.fonts.ready.then(rest);

    // A plain click plays the swell on its way to the page. A new tab, a modified click or less
    // motion goes at once, as any link would.
    chips.forEach(function (chip, i) {
      chip.addEventListener('click', function (event) {
        if (i === chosen) {
          event.preventDefault();
          return;
        }
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        if (lessMotion.matches) return;
        event.preventDefault();
        chosen = i;
        settle(i, false);
        window.setTimeout(function () {
          window.location.href = chip.href;
        }, LEAVE_AFTER);
      });
    });

    // Back from the next page: the browser may restore this one as it was left, chip and all.
    window.addEventListener('pageshow', function (event) {
      if (!event.persisted) return;
      chosen = chips.findIndex(function (chip) {
        return chip.getAttribute('aria-current') === 'page';
      });
      rest();
    });
  }

  Array.prototype.slice.call(document.querySelectorAll('.jelly')).forEach(jellyGroup);
})();
