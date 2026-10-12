// Opens the invite in the app on phones. The page itself offers the store buttons.
(function () {
  var card = document.querySelector('[data-deeplink]');
  if (!card || !/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) return;
  window.location.href = card.getAttribute('data-deeplink');
})();
