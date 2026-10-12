// Deletes an account with its recovery key via the Roadclaim API.
(function () {
  var form = document.getElementById('delete-form');
  if (!form) return;
  var status = document.getElementById('delete-status');
  var button = form.querySelector('button');
  var text = form.dataset;

  function show(kind, message) {
    status.className = 'status ' + kind;
    status.textContent = message;
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var key = form.elements.recoveryKey.value.trim();
    if (!key) return show('err', text.empty);
    if (!form.elements.confirm.checked) return show('err', text.confirm);
    button.disabled = true;
    show('ok', text.working);
    fetch('https://roadclaim-api.codext.de/v1/auth/delete-with-recovery', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ recoveryKey: key }),
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          if (res.ok) {
            form.reset();
            return show('ok', text.done);
          }
          var code = body && body.error && body.error.code;
          show('err', res.status === 404 || res.status === 401 || code === 'not_found' || code === 'invalid_recovery_key' ? text.notfound : text.failed);
          button.disabled = false;
        });
      })
      .catch(function () {
        show('err', text.offline);
        button.disabled = false;
      });
  });
})();
