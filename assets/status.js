/*
  Reachability check for the status page.

  The request goes from the visitor's browser straight to the service, so this page can be honest
  about the app while being hosted nowhere near it. The mode is no-cors: the response is opaque and
  its status code is unreadable, so the only claim made is "answered" or "did not answer" — which
  is the claim the page's wording makes, and no more.
*/

(function () {
  'use strict';

  var TIMEOUT = 8000;
  var REPEAT = 60000;

  var rows = Array.prototype.slice.call(document.querySelectorAll('[data-check]'));
  var stamp = document.querySelector('[data-checked-at]');
  if (rows.length === 0) return;

  function relabel() {
    if (window.konta && window.konta.relabel) window.konta.relabel();
  }

  function probe(url) {
    if (typeof AbortController !== 'function') {
      return fetch(url, { mode: 'no-cors', cache: 'no-store' });
    }

    var controller = new AbortController();
    var timer = setTimeout(function () {
      controller.abort();
    }, TIMEOUT);

    return fetch(url, {
      mode: 'no-cors',
      cache: 'no-store',
      credentials: 'omit',
      signal: controller.signal,
    }).then(
      function (response) {
        clearTimeout(timer);
        return response;
      },
      function (error) {
        clearTimeout(timer);
        throw error;
      },
    );
  }

  function settle(row, state) {
    row.dataset.state = state;
    var text = row.querySelector('[data-state-text]');
    if (text) text.dataset.t = state === 'up' ? 'st.up' : 'st.down';
  }

  function runAll() {
    rows.forEach(function (row) {
      row.dataset.state = 'checking';
      var text = row.querySelector('[data-state-text]');
      if (text) text.dataset.t = 'st.checking';
    });
    relabel();

    var checks = rows.map(function (row) {
      return probe(row.dataset.check).then(
        function () {
          settle(row, 'up');
        },
        function () {
          settle(row, 'down');
        },
      );
    });

    Promise.all(checks).then(function () {
      if (stamp) {
        var lang = window.konta && window.konta.lang ? window.konta.lang() : 'ro';
        var locale = { ro: 'ro-MD', ru: 'ru-MD', en: 'en-GB' }[lang] || 'ro-MD';
        stamp.textContent = new Date().toLocaleTimeString(locale, {
          hour: '2-digit',
          minute: '2-digit',
        });
      }
      relabel();
    });
  }

  runAll();
  setInterval(runAll, REPEAT);

  // Re-check when the tab comes back, so a page left open overnight is not showing yesterday.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') runAll();
  });
})();
