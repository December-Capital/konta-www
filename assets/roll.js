/*
 * Rolling digits for the tools' results (konta.md/instrumente): when a result changes, each digit
 * rolls on its own wheel from the old figure to the new one, after the rolling part of Skiper UI's
 * Animated number (skiper37, which draws it with the Number Flow library). Written again here
 * without either, since the site loads nothing it does not serve itself.
 *
 * One file, loaded before salary.js and instrumente.js on the five pages with results, and
 * cached across them. It gives them window.kontaRoll(cell, text): the cell ends up holding
 * exactly that text, as if textContent had been set. While digits roll, screen readers are given
 * the new text, and once they stop, the wheels are replaced by the plain text again, so a figure
 * can be selected and copied as usual. Readers who ask for reduced motion get the text at once.
 */
(function () {
  'use strict';

  var DURATION = 650; // ms, the same as --roll-time in salary.css
  var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  var DIGIT = /[0-9]/;

  function plain(cell, text) {
    cell.textContent = text;
    delete cell.dataset.roll;
  }

  // A wheel of 0 to 9, turned to show `from`; rolls to `to` once the browser has laid it out.
  function wheel(from, to, height) {
    var box = document.createElement('span');
    box.className = 'roll__d';
    var strip = document.createElement('span');
    strip.className = 'roll__strip';
    for (var d = 0; d < 10; d++) {
      var one = document.createElement('span');
      one.textContent = String(d);
      strip.appendChild(one);
    }
    strip.style.transform = 'translateY(' + -from * height + 'px)';
    box.appendChild(strip);
    return { box: box, strip: strip, to: to, height: height };
  }

  function roll(cell, text) {
    text = String(text);
    var before = cell.dataset.roll !== undefined ? cell.dataset.roll : cell.textContent;
    if (before === text) return; // already there, or already rolling there
    if ((still && still.matches) || !DIGIT.test(text) || !cell.isConnected) {
      plain(cell, text);
      return;
    }

    var height = parseFloat(getComputedStyle(cell).lineHeight);
    if (!height) height = parseFloat(getComputedStyle(cell).fontSize) * 1.5;

    // Digits are matched from the right, the units under the units, as the column is aligned.
    var turning = [];
    var shown = document.createElement('span');
    shown.className = 'roll';
    shown.setAttribute('aria-hidden', 'true');
    shown.style.setProperty('--roll-h', height + 'px');
    var gap = text.length - before.length;
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (!DIGIT.test(ch)) {
        var mark = document.createElement('span');
        mark.className = 'roll__c';
        mark.textContent = ch;
        shown.appendChild(mark);
        continue;
      }
      var old = before.charAt(i - gap);
      var known = i - gap >= 0 && DIGIT.test(old);
      var w = wheel(known ? Number(old) : 0, Number(ch), height);
      if (!known) w.box.classList.add('roll__d--new');
      turning.push(w);
      shown.appendChild(w.box);
    }

    var spoken = document.createElement('span');
    spoken.className = 'roll__said';
    spoken.textContent = text;

    cell.textContent = '';
    cell.appendChild(spoken);
    cell.appendChild(shown);
    cell.dataset.roll = text;

    // Laid out at the old digits first, so the transition has somewhere to start from.
    void shown.offsetWidth;
    turning.forEach(function (w) {
      w.box.classList.add('roll__d--go');
      w.strip.style.transform = 'translateY(' + -w.to * w.height + 'px)';
    });

    var mine = (cell._rollTurn = (cell._rollTurn || 0) + 1);
    setTimeout(function () {
      if (cell._rollTurn === mine && cell.dataset.roll === text) plain(cell, text);
    }, DURATION + 60);
  }

  window.kontaRoll = roll;
})();
