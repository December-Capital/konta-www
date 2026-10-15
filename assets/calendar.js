/*
  konta.md/calendar: the month as a calendar or as a list, the day panel, the filter by kind of
  taxpayer, and printing.

  The page works without this file: every month is there, in order, each with its grid and its
  dates in full, and the browser prints it. This shows the reader's own month in the middle of the
  page with steps three months back and forward to the last month the page holds; a click on a
  day, its number or one of its labels shows what falls on it beside the grid; and "Listă" shows
  the months as a list instead, the reader's month first. The filter and the chosen view are
  remembered in this browser alone (localStorage), never sent anywhere, and forgotten silently
  where storage is refused.
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
  var viewSwitch = document.querySelector('[data-cal-view]');
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
  var view = recall(VIEW) === 'list' ? 'list' : 'grid';
  var selectedDate = null;

  function longDate(date) {
    var item = document.getElementById('d-' + date);
    var heading = item && item.querySelector('h3');
    if (heading) return heading.textContent.replace(/\s+/g, ' ').trim();
    var cell = document.querySelector('.cal-day[data-date="' + date + '"]');
    var section = cell && cell.closest('.cal-month');
    var month = section && section.querySelector('h2');
    return (cell ? parseInt(date.slice(8), 10) + ' ' : '') + (month ? month.textContent.trim() : date);
  }

  // The day panel: a copy of the day's entries from the month's list, so the list stays the one
  // place the page says them.
  function select(date, focusId) {
    if (!panel) return;
    selectedDate = date;
    all('.cal-day--selected').forEach(function (d) { d.classList.remove('cal-day--selected'); });
    var cell = document.querySelector('.cal-day[data-date="' + date + '"]');
    if (cell) cell.classList.add('cal-day--selected');

    panelTitle.textContent = longDate(date);
    panelBody.innerHTML = '';
    var source = document.getElementById('d-' + date);
    var copy = null;
    if (source) {
      copy = source.cloneNode(true);
      copy.removeAttribute('id');
      all('[id]', copy).forEach(function (el) {
        el.setAttribute('data-from', el.id);
        el.removeAttribute('id');
      });
      var heading = copy.querySelector('h3');
      if (heading) heading.parentNode.removeChild(heading);
      copy.hidden = false;
      panelBody.appendChild(copy);
    }
    var visible = copy && all('.cal-item', copy).some(function (e) { return !e.hidden; });
    panelEmpty.hidden = !!visible;
    panel.hidden = false;

    if (focusId) {
      var target = panelBody.querySelector('[data-from="' + focusId + '"]');
      if (target) {
        target.classList.add('cal-item--focus');
        target.scrollIntoView({ block: 'nearest' });
      }
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
    sections.forEach(function (s, i) {
      s.hidden = view === 'grid' ? i !== current : i < first;
    });
    var heading = sections[current].querySelector('h2');
    if (title && heading) title.textContent = heading.textContent;
    if (prev) prev.disabled = current <= first;
    if (next) next.disabled = current >= months.length - 1;
    if (todayBtn) todayBtn.disabled = current === home;

    if (view === 'grid' && panel) {
      var section = sections[current];
      var keep = selectedDate && selectedDate.slice(0, 7) === months[current];
      var date = keep ? selectedDate
        : (months[current] === thisMonth ? today : firstDayWithEntries(section));
      if (date) select(date);
      else panel.hidden = true;
    }
  }

  function setView(next) {
    view = next;
    root.classList.toggle('cal-list', view === 'list');
    root.classList.toggle('cal-grid-view', view === 'grid');
    all('[data-view]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-view') === view)); });
    if (nav) nav.hidden = view !== 'grid';
    if (panel && view !== 'grid') panel.hidden = true;
    // As a list, the reader's month comes first and the months behind it last.
    sections.forEach(function (s, i) { s.style.order = view === 'list' && i < home ? '2' : ''; });
    if (pastHeading) pastHeading.hidden = view !== 'list' || first >= home;
    show(current);
  }

  // An address naming a day, a month or anything inside one (a link from a subscribed calendar)
  // opens that month and that day, even one further back than the steps allow.
  function follow() {
    var id = decodeURIComponent(location.hash.slice(1));
    var target = id && document.getElementById(id);
    var month = target && target.closest && target.closest('.cal-month');
    if (!month) return false;
    show(sections.indexOf(month));
    if (view === 'grid') {
      var day = /^d-(\d{4}-\d{2}-\d{2})$/.exec(id);
      if (day) select(day[1]);
      (panel && !panel.hidden ? panel : month).scrollIntoView({ block: 'start' });
    } else {
      target.scrollIntoView();
    }
    return true;
  }

  var pastHeading = null;
  if (sections.length && nav && holder) {
    root.classList.add('cal-js');
    if (viewSwitch) viewSwitch.hidden = false;

    if (home > first) {
      pastHeading = document.createElement('h2');
      pastHeading.className = 'cal-past-heading';
      pastHeading.textContent = word('past');
      pastHeading.style.order = '1';
      pastHeading.hidden = true;
      holder.appendChild(pastHeading);
    }

    all('[data-view]').forEach(function (b) {
      b.addEventListener('click', function () {
        setView(b.getAttribute('data-view'));
        remember(VIEW, view === 'list' ? 'list' : null);
      });
    });
    prev.addEventListener('click', function () { show(current - 1); });
    next.addEventListener('click', function () { show(current + 1); });
    todayBtn.addEventListener('click', function () { show(home); });

    // A day, its number or one of its labels: what falls on it, in the panel.
    holder.addEventListener('click', function (e) {
      if (view !== 'grid') return;
      var cell = e.target.closest && e.target.closest('.cal-day');
      if (!cell) return;
      e.preventDefault();
      var label = e.target.closest('.cal-label[data-target]');
      select(cell.getAttribute('data-date'), label ? label.getAttribute('data-target') : null);
      if (history.replaceState) history.replaceState(null, '', '#d-' + cell.getAttribute('data-date'));
      if (panel && window.matchMedia && !window.matchMedia('(min-width: 1100px)').matches) {
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });

    setView(view);
    follow();
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
    if (selectedDate && view === 'grid' && panel && !panel.hidden) select(selectedDate);

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
