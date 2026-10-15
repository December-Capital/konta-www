/*
  konta.md/calendar: the month, what falls on the day picked in it, the filter by kind of
  taxpayer, and printing.

  The page works without this file: every month is there, in order, each with its grid and its
  dates in full, and the browser prints it. This shows the reader's own month in the middle of the
  page with steps three months back and forward to the last month the page holds. Under it go the
  entries of the day clicked (the day, its number or one of its labels), or of the whole month,
  as a grid of cards or as a list. The filter and the grid-or-list choice are remembered in this
  browser alone (localStorage), never sent anywhere, and forgotten silently where storage is
  refused.
*/

(function () {
  'use strict';

  var root = document.documentElement;
  var KEY = 'konta.calendar.profiles';
  var VIEW = 'konta.calendar.view';
  var BACK = 3; // months a reader may step back from their own
  var SHOWN = 4; // labels a day shows before "N more"

  function word(name) {
    var el = document.querySelector('[data-cal-js] [data-js="' + name + '"]');
    return el ? el.textContent.trim() : '';
  }

  function all(selector, scope) {
    return Array.prototype.slice.call((scope || document).querySelectorAll(selector));
  }

  function remember(key, value) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch (e) {
      /* private mode or storage refused: the choice lasts as long as the page */
    }
  }

  function recall(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  /* ------------------------------------------------------------------ months */

  var sections = all('.cal-month');
  var holder = document.querySelector('[data-cal-months]');
  var nav = document.querySelector('[data-cal-nav]');
  var title = document.querySelector('[data-cal-title]');
  var prev = document.querySelector('[data-cal-prev]');
  var next = document.querySelector('[data-cal-next]');
  var todayBtn = document.querySelector('[data-cal-today]');
  var panel = document.querySelector('[data-cal-panel]');
  var panelTitle = document.querySelector('[data-cal-panel-title]');
  var panelBody = document.querySelector('[data-cal-panel-body]');
  var panelEmpty = document.querySelector('[data-cal-panel-empty]');

  var now = new Date();
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var thisMonth = now.getFullYear() + '-' + pad(now.getMonth() + 1);
  var today = thisMonth + '-' + pad(now.getDate());

  var months = sections.map(function (s) { return s.getAttribute('data-month'); });
  var home = months.indexOf(thisMonth);
  if (home < 0) home = thisMonth < months[0] ? 0 : months.length - 1;
  var first = Math.max(0, home - BACK);
  var current = home;
  // Under the calendar: one day or the whole month, as a grid of cards or a list.
  var layout = recall(VIEW) === 'list' ? 'list' : 'grid';
  var scope = 'day';
  var selectedDate = null;
  var focusId = null;

  function monthName(section) {
    var h = section && section.querySelector('h2');
    return h ? h.textContent.trim() : '';
  }

  function dayName(date) {
    var item = document.getElementById('d-' + date);
    var heading = item && item.querySelector('h3');
    if (heading) return heading.textContent.replace(/\s+/g, ' ').trim();
    var cell = document.querySelector('.cal-day[data-date="' + date + '"]');
    return parseInt(date.slice(8), 10) + ' ' + monthName(cell && cell.closest('.cal-month')).replace(/\s+\d{4}$/, '');
  }

  // Copies of the month's own list, so the list stays the one place the page says each entry.
  function copy(node) {
    var c = node.cloneNode(true);
    [c].concat(all('[id]', c)).forEach(function (el) {
      if (!el.id) return;
      el.setAttribute('data-from', el.id);
      el.removeAttribute('id');
    });
    return c;
  }

  function press(attr, value) {
    all('[' + attr + ']').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute(attr) === value)); });
  }

  function render() {
    if (!panel) return;
    var section = sections[current];
    panel.classList.toggle('cal-panel--list', layout === 'list');
    panel.classList.toggle('cal-panel--month', scope === 'month');
    press('data-view', layout);
    press('data-scope', scope);
    all('.cal-day--selected').forEach(function (d) { d.classList.remove('cal-day--selected'); });
    panelBody.innerHTML = '';

    if (scope === 'month') {
      panelTitle.textContent = monthName(section);
      var list = section.querySelector('.cal-dates');
      if (list) panelBody.appendChild(copy(list));
    } else {
      panelTitle.textContent = selectedDate ? dayName(selectedDate) : monthName(section);
      var cell = selectedDate && document.querySelector('.cal-day[data-date="' + selectedDate + '"]');
      if (cell) cell.classList.add('cal-day--selected');
      var source = selectedDate && document.getElementById('d-' + selectedDate);
      if (source) {
        var c = copy(source);
        c.hidden = false;
        var heading = c.querySelector('h3');
        if (heading) heading.parentNode.removeChild(heading);
        var ol = document.createElement('ol');
        ol.className = 'cal-dates';
        ol.appendChild(c);
        panelBody.appendChild(ol);
      }
    }
    var visible = all('.cal-item', panelBody).some(function (e) { return !e.hidden; });
    panelEmpty.hidden = visible;
    panel.hidden = false;

    if (focusId) {
      var target = panelBody.querySelector('[data-from="' + focusId + '"]');
      if (target) target.classList.add('cal-item--focus');
    }
  }

  function firstDayWithEntries(section) {
    var cells = all('.cal-day', section).filter(function (c) {
      return c.querySelector('.cal-label:not([hidden])');
    });
    return cells.length ? cells[0].getAttribute('data-date') : null;
  }

  function show(index) {
    current = Math.max(0, Math.min(months.length - 1, index));
    sections.forEach(function (s, i) { s.hidden = i !== current; });
    if (title) title.textContent = monthName(sections[current]);
    if (prev) prev.disabled = current <= first;
    if (next) next.disabled = current >= months.length - 1;
    if (todayBtn) todayBtn.disabled = current === home;
    if (!selectedDate || selectedDate.slice(0, 7) !== months[current]) {
      selectedDate = months[current] === thisMonth ? today : firstDayWithEntries(sections[current]);
      focusId = null;
    }
    render();
  }

  // An address naming a day, a month or anything inside one (a link from a subscribed calendar)
  // opens that month and that day, even one further back than the steps allow.
  function follow() {
    var id = decodeURIComponent(location.hash.slice(1));
    var target = id && document.getElementById(id);
    var month = target && target.closest && target.closest('.cal-month');
    if (!month) return false;
    var day = /^d-(\d{4}-\d{2}-\d{2})$/.exec(id);
    if (day) {
      selectedDate = day[1];
      scope = 'day';
    }
    show(sections.indexOf(month));
    month.scrollIntoView({ block: 'start' });
    return true;
  }

  if (sections.length && nav && holder) {
    root.classList.add('cal-js');
    nav.hidden = false;

    all('[data-view]').forEach(function (b) {
      b.addEventListener('click', function () {
        layout = b.getAttribute('data-view');
        remember(VIEW, layout === 'list' ? 'list' : null);
        render();
      });
    });
    all('[data-scope]').forEach(function (b) {
      b.addEventListener('click', function () {
        scope = b.getAttribute('data-scope');
        render();
      });
    });
    prev.addEventListener('click', function () { show(current - 1); });
    next.addEventListener('click', function () { show(current + 1); });
    todayBtn.addEventListener('click', function () { show(home); });

    // A day, its number or one of its labels: what falls on it, under the calendar.
    holder.addEventListener('click', function (e) {
      var cell = e.target.closest && e.target.closest('.cal-day');
      if (!cell) return;
      e.preventDefault();
      var label = e.target.closest('.cal-label[data-target]');
      selectedDate = cell.getAttribute('data-date');
      focusId = label ? label.getAttribute('data-target') : null;
      scope = 'day';
      render();
      if (history.replaceState) history.replaceState(null, '', '#d-' + selectedDate);
      var box = panel.getBoundingClientRect();
      if (box.top > window.innerHeight - 120) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    if (!follow()) show(home);
    window.addEventListener('hashchange', follow);
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
  var items = all('.cal-month .cal-item--deadline, .cal-events .cal-item--deadline');
  var marks = all('.cal-dot, .cal-label--deadline');
  var count = form && form.querySelector('[data-cal-count]');
  var reset = form && form.querySelector('[data-cal-reset]');
  var summary = document.querySelector('[data-cal-summary]');
  var allText = count ? count.textContent : '';
  var everyone = summary ? summary.textContent : '';

  function selected() {
    return boxes.filter(function (b) { return b.checked; }).map(function (b) { return b.value; });
  }

  function matches(el, chosen) {
    if (!chosen.length) return true;
    var mine = (el.getAttribute('data-profiles') || '').split(' ');
    return chosen.some(function (p) { return mine.indexOf(p) >= 0; });
  }

  // A busy day (the 25th) shows its first labels and how many more; the panel and the list have
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
      if (on && item.closest('.cal-month')) shown += 1;
    });
    marks.forEach(function (m) { m.hidden = !matches(m, chosen); });

    // A day whose every entry is filtered out leaves the list too.
    all('.cal-date').forEach(function (day) {
      day.hidden = !all('.cal-item', day).some(function (e) { return !e.hidden; });
    });
    crowd();
    if (panel && !panel.hidden) render();

    var total = items.filter(function (i) { return i.closest('.cal-month'); }).length;
    if (count) {
      count.textContent = chosen.length
        ? word('shown').replace('{n}', shown).replace('{total}', total)
        : allText;
    }
    if (summary) summary.textContent = chosen.length ? word('selected').replace('{n}', chosen.length) : everyone;
    if (reset) reset.hidden = !chosen.length;
  }

  if (form) {
    var saved = [];
    try {
      saved = JSON.parse(recall(KEY) || '[]');
      if (!Array.isArray(saved)) saved = [];
    } catch (e) {
      saved = [];
    }
    boxes.forEach(function (b) {
      b.checked = saved.indexOf(b.value) >= 0;
      b.addEventListener('change', function () {
        var chosen = selected();
        remember(KEY, chosen.length ? JSON.stringify(chosen) : null);
        apply();
      });
    });
    if (reset) {
      reset.addEventListener('click', function () {
        boxes.forEach(function (b) { b.checked = false; });
        remember(KEY, null);
        apply();
      });
    }
    form.addEventListener('submit', function (e) { e.preventDefault(); });

    // The menu closes on a click outside it or on Escape, like any menu.
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
