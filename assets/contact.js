/*
  The contact form, sent without leaving the page. Without JavaScript the form still posts to
  /contact/trimite.php, which redirects back to /contact/#trimis (or #incomplet, #limitat,
  #eroare), and CSS :target shows the matching message. This script does the same in place.
*/

(function () {
  'use strict';

  var form = document.querySelector('[data-contact]');
  if (!form || !window.fetch || !window.FormData) return;

  var notes = {
    sent: form.querySelector('#trimis'),
    incomplete: form.querySelector('#incomplet'),
    limited: form.querySelector('#limitat'),
    failed: form.querySelector('#eroare'),
  };
  var button = form.querySelector('button[type="submit"]');
  var lang = form.querySelector('input[name="lang"]');

  function show(outcome) {
    Object.keys(notes).forEach(function (key) {
      if (notes[key]) notes[key].hidden = key !== outcome;
    });
    var note = notes[outcome] || notes.failed;
    if (note) note.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();

    // The reply should come in the language the visitor was reading.
    if (lang && window.konta) lang.value = window.konta.lang();

    button.disabled = true;
    button.setAttribute('aria-busy', 'true');

    fetch(form.action, {
      method: 'POST',
      body: new FormData(form),
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    })
      .then(function (response) {
        return response.json().catch(function () {
          return { outcome: 'failed' };
        });
      })
      .then(function (result) {
        show(result.outcome in notes ? result.outcome : 'failed');
        if (result.outcome === 'sent') form.reset();
      })
      .catch(function () {
        show('failed');
      })
      .then(function () {
        button.disabled = false;
        button.removeAttribute('aria-busy');
      });
  });
})();
