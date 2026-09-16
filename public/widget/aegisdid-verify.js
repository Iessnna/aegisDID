(function () {
  'use strict';
  var script = document.currentScript;
  var appOrigin = script ? new URL(script.src, window.location.href).origin : window.location.origin;
  var popupCounter = 0;

  function attach(element) {
    if (element.__aegisDidAttached) return;
    element.__aegisDidAttached = true;
    element.addEventListener('click', function () {
      var requirement = element.getAttribute('data-require') || element.getAttribute('data-aegisdid');
      if (!requirement) {
        element.dispatchEvent(new CustomEvent('aegisdid:error', { detail: { error: 'Add data-require="CredentialType:claim>=value".' } }));
        return;
      }
      var requestId = (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : 'aegis-' + Date.now() + '-' + Math.random().toString(36).slice(2);
      var popupUrl = appOrigin + '/verify-request?requestId=' + encodeURIComponent(requestId) + '&origin=' + encodeURIComponent(window.location.origin) + '&require=' + encodeURIComponent(requirement);
      var popup = window.open(popupUrl, 'aegisdid_verify_' + (++popupCounter), 'popup,width=620,height=760,resizable=yes,scrollbars=yes');
      if (!popup) {
        element.dispatchEvent(new CustomEvent('aegisdid:error', { detail: { error: 'Popup blocked. Allow popups for this site.' } }));
        return;
      }
      function receive(event) {
        if (event.origin !== appOrigin || event.source !== popup || !event.data || event.data.type !== 'AEGISDID_VERIFY_RESULT' || event.data.requestId !== requestId) return;
        window.removeEventListener('message', receive);
        element.dispatchEvent(new CustomEvent(event.data.valid ? 'aegisdid:verified' : 'aegisdid:rejected', { detail: event.data }));
        if (typeof element.onAegisDIDResult === 'function') element.onAegisDIDResult(event.data);
      }
      window.addEventListener('message', receive);
    });
  }

  function init() { document.querySelectorAll('[data-aegisdid], [data-require]').forEach(attach); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.AegisDID = window.AegisDID || { init: init, origin: appOrigin };
}());
