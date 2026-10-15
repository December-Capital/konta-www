/*
  konta.md/calendar: the filter by kind of taxpayer, today's month first, and printing.

  The page works without this file: every month is there in order from the month it was built,
  every deadline is shown, and the browser prints it. This only narrows and reorders what is
  already on the page. The filter is remembered in this browser alone (localStorage), never sent
  anywhere, and forgotten silently where storage is refused.
*/

(function () {
  'use strict';

  var KEY = 'konta.calendar.profiles';
  var form = document.querySelector('[data-cal-filter]');
  if (!form) return;

  var boxes = Array.prototype.slice.call(form.querySelectorAll('[data-cal-profile]'));
  var items = Array.prototype.slice.call(document.querySelectorAll('.cal-item--deadline'));
  var dots = Array.prototype.slice.call(document.querySelectorAll('.cal-dot'));
  var count = form.querySelector('[data-cal-count]');
  var reset = form.querySelector('[data-cal-reset]');
  var allText = count ? count.textContent : '';

  function word(name) {
    var el = document.querySelector('[data-cal-js] [data-js="' + name + '"]');
    return el ? el.textContent.trim() : '';
  }

  function load() {
    try {
      var saved = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(saved) ? saved : [];
    } catch (e) {
      return [];
    }
  }

  function save(list) {
    try {
      if (list.length) localStorage.setItem(KEY, JSON.stringify(list));
      else localStorage.removeItem(KEY);
    } catch (e) {
      /* private mode or storage refused: the filter lasts as long as the page */
    }
  }

  function selected() {
    return boxes.filter(function (b) { return b.checked; }).map(function (b) { return b.value; });
  }

  function matches(el, chosen) {
    if (!chosen.length) return true;
    var mine = (el.getAttribute('data-profiles') || '').split(' ');
    return chosen.some(function (p) { return mine.indexOf(p) >= 0; });
  }

  function apply() {
    var chosen = selected();
    var shown = 0;
    items.forEach(function (item) {
      var on = matches(item, chosen);
      item.hidden = !on;
      if (on) shown += 1;
    });
    dots.forEach(function (dot) { dot.hidden = !matches(dot, chosen); });

    // A day whose every entry is filtered out leaves the list too.
    Array.prototype.forEach.call(document.querySelectorAll('.cal-date'), function (day) {
      var entries = day.querySelectorAll('.cal-item');
      var visible = Array.prototype.some.call(entries, function (e) { return !e.hidden; });
      day.hidden = !visible;
    });

    if (count) {
      count.textContent = chosen.length
        ? word('shown').replace('{n}', shown).replace('{total}', items.length)
        : allText;
    }
    if (reset) reset.hidden = !chosen.length;
  }

  var saved = load();
  boxes.forEach(function (b) {
    b.checked = saved.indexOf(b.value) >= 0;
    b.addEventListener('change', function () {
      save(selected());
      apply();
    });
  });
  if (reset) {
    reset.addEventListener('click', function () {
      boxes.forEach(function (b) { b.checked = false; });
      save([]);
      apply();
    });
  }
  form.addEventListener('submit', function (e) { e.preventDefault(); });
  apply();

  /* -------------------------------------------------------- today's month first */

  // The page was built on one day and is read on another: the months are put in order from the
  // reader's own month, and the ones already behind go under "Past months".
  var now = new Date();
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var month = now.getFullYear() + '-' + pad(now.getMonth() + 1);
  var today = month + '-' + pad(now.getDate());

  var sections = Array.prototype.slice.call(document.querySelectorAll('.cal-month'));
  var container = sections.length ? sections[0].parentNode : null;
  var past = document.querySelector('[data-cal-past]');
  if (container && sections.some(function (s) { return s.getAttribute('data-month') === month; })) {
    sections.sort(function (a, b) { return a.getAttribute('data-month') < b.getAttribute('data-month') ? -1 : 1; });
    var behind = sections.filter(function (s) { return s.getAttribute('data-month') < month; });
    var ahead = sections.filter(function (s) { return s.getAttribute('data-month') >= month; });
    ahead.forEach(function (s) { container.insertBefore(s, past && past.parentNode === container ? past : null); });
    if (past) {
      behind.forEach(function (s) { past.appendChild(s); });
      past.hidden = !behind.length;
      if (past.parentNode === container) container.appendChild(past);
    }

    var current = document.getElementById('m-' + month);
    var head = current && current.querySelector('.cal-month__head');
    if (head && !head.querySelector('.cal-now')) {
      var badge = document.createElement('span');
      badge.className = 'cal-now';
      badge.textContent = word('today');
      head.appendChild(badge);
    }
  }

  Array.prototype.forEach.call(document.querySelectorAll('.cal-day--today'), function (d) {
    d.classList.remove('cal-day--today');
  });
  var cell = document.querySelector('.cal-day[data-date="' + today + '"]');
  if (cell) {
    cell.classList.add('cal-day--today');
    cell.setAttribute('aria-current', 'date');
  }

  /* -------------------------------------------------------------------- print */

  var print = document.querySelector('[data-cal-print]');
  if (print && window.print) {
    print.hidden = false;
    print.addEventListener('click', function () { window.print(); });
  }
})();
