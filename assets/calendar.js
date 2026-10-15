/*
  konta.md/calendar: one month at a time, the filter by kind of taxpayer, and printing.

  The page works without this file: every month is there, in order, with every deadline, and the
  browser prints it. This shows the reader's own month in the middle of the page, lets them step
  three months back and forward to the last month the page holds, and narrows what is already
  there. The filter is remembered in this browser alone (localStorage), never sent anywhere, and
  forgotten silently where storage is refused.
*/

(function () {
  'use strict';

  var root = document.documentElement;
  var KEY = 'konta.calendar.profiles';
  var BACK = 3; // months a reader may step back from their own
  var SHOWN = 4; // labels a day shows before "N more"

  function word(name) {
    var el = document.querySelector('[data-cal-js] [data-js="' + name + '"]');
    return el ? el.textContent.trim() : '';
  }

  function all(selector, scope) {
    return Array.prototype.slice.call((scope || document).querySelectorAll(selector));
  }

  /* ------------------------------------------------------------------ months */

  var sections = all('.cal-month');
  var nav = document.querySelector('[data-cal-nav]');
  var title = document.querySelector('[data-cal-title]');
  var prev = document.querySelector('[data-cal-prev]');
  var next = document.querySelector('[data-cal-next]');
  var todayBtn = document.querySelector('[data-cal-today]');

  var now = new Date();
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var thisMonth = now.getFullYear() + '-' + pad(now.getMonth() + 1);
  var today = thisMonth + '-' + pad(now.getDate());

  var months = sections.map(function (s) { return s.getAttribute('data-month'); });
  var home = months.indexOf(thisMonth);
  if (home < 0) home = thisMonth < months[0] ? 0 : months.length - 1;
  var first = Math.max(0, home - BACK);
  var current = home;

  function show(index) {
    current = Math.max(0, Math.min(months.length - 1, index));
    sections.forEach(function (s, i) { s.hidden = i !== current; });
    var heading = sections[current].querySelector('h2');
    if (title && heading) title.textContent = heading.textContent;
    if (prev) prev.disabled = current <= first;
    if (next) next.disabled = current >= months.length - 1;
    if (todayBtn) todayBtn.disabled = current === home;
  }

  // An address naming a day, a month or anything inside one (a link from a subscribed calendar)
  // opens that month, even one further back than the steps allow.
  function follow() {
    var id = decodeURIComponent(location.hash.slice(1));
    var target = id && document.getElementById(id);
    var month = target && target.closest && target.closest('.cal-month');
    if (!month) return false;
    show(sections.indexOf(month));
    if (target !== month) target.scrollIntoView();
    return true;
  }

  if (sections.length && nav) {
    root.classList.add('cal-js');
    nav.hidden = false;
    if (!follow()) show(home);
    prev.addEventListener('click', function () { show(current - 1); });
    next.addEventListener('click', function () { show(current + 1); });
    todayBtn.addEventListener('click', function () { show(home); });
    window.addEventListener('hashchange', follow);

    var badge = sections[home] && sections[home].querySelector('.cal-month__head');
    if (badge && months[home] === thisMonth && !badge.querySelector('.cal-now')) {
      var span = document.createElement('span');
      span.className = 'cal-now';
      span.textContent = word('today');
      badge.appendChild(span);
    }
  }

  all('.cal-day--today').forEach(function (d) { d.classList.remove('cal-day--today'); });
  var cell = document.querySelector('.cal-day[data-date="' + today + '"]');
  if (cell) {
    cell.classList.add('cal-day--today');
    cell.setAttribute('aria-current', 'date');
  }

  /* ------------------------------------------------------------------ filter */

  var form = document.querySelector('[data-cal-filter]');
  var boxes = form ? all('[data-cal-profile]', form) : [];
  var items = all('.cal-item--deadline');
  var marks = all('.cal-dot, .cal-label--deadline');
  var count = form && form.querySelector('[data-cal-count]');
  var reset = form && form.querySelector('[data-cal-reset]');
  var summary = document.querySelector('[data-cal-summary]');
  var allText = count ? count.textContent : '';
  var everyone = summary ? summary.textContent : '';

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

  // A busy day (the 25th) shows its first labels and how many more; the list under the grid has
  // them all.
  function crowd() {
    all('.cal-labels').forEach(function (list) {
      var more = list.querySelector('.cal-label--more');
      if (more) list.removeChild(more);
      var visible = all('.cal-label', list).filter(function (l) { return !l.hidden; });
      visible.forEach(function (l, i) { l.classList.toggle('cal-label--over', i >= SHOWN); });
      if (visible.length > SHOWN) {
        var li = document.createElement('li');
        li.className = 'cal-label cal-label--more';
        li.textContent = word('more').replace('{n}', visible.length - SHOWN);
        list.appendChild(li);
      }
    });
  }

  function apply() {
    var chosen = selected();
    var shown = 0;
    items.forEach(function (item) {
      var on = matches(item, chosen);
      item.hidden = !on;
      if (on) shown += 1;
    });
    marks.forEach(function (m) { m.hidden = !matches(m, chosen); });

    // A day whose every entry is filtered out leaves the list too.
    all('.cal-date').forEach(function (day) {
      day.hidden = !all('.cal-item', day).some(function (e) { return !e.hidden; });
    });
    crowd();

    if (count) {
      count.textContent = chosen.length
        ? word('shown').replace('{n}', shown).replace('{total}', items.length)
        : allText;
    }
    if (summary) summary.textContent = chosen.length ? word('selected').replace('{n}', chosen.length) : everyone;
    if (reset) reset.hidden = !chosen.length;
  }

  if (form) {
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

    // The panel closes on a click outside it or on Escape, like any menu.
    var box = document.querySelector('[data-cal-filter-box]');
    if (box) {
      document.addEventListener('click', function (e) {
        if (box.open && !box.contains(e.target)) box.open = false;
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && box.open) {
          box.open = false;
          box.querySelector('summary').focus();
        }
      });
    }
  }
  apply();

  /* -------------------------------------------------------------------- print */

  var print = document.querySelector('[data-cal-print]');
  if (print && window.print) {
    print.hidden = false;
    print.addEventListener('click', function () { window.print(); });
  }
})();
