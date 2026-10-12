// Roadclaim website: static assets from ./public, plus invite links and app link files.
import fingerprints from './assetlinks-fingerprints.json';

const APP_ID = 'STSYBH724K.de.codext.roadclaim';
const PACKAGE = 'de.codext.roadclaim';

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'DENY',
};

function json(body) {
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, max-age=3600',
      ...SECURITY_HEADERS,
    },
  });
}

const COPY = {
  en: {
    title: 'You are invited to Roadclaim',
    lead: 'A friend wants to race you for the map. Open the invite in Roadclaim to add them as a friend.',
    open: 'Open in Roadclaim',
    noApp: 'No app yet? Get Roadclaim for free, then open this link again.',
    code: 'Invite code',
    ios: 'App Store',
    iosSmall: 'Download on the',
    android: 'Google Play',
    androidSmall: 'Get it on',
  },
  de: {
    title: 'Du bist zu Roadclaim eingeladen',
    lead: 'Jemand will mit dir um die Karte fahren. Öffne die Einladung in Roadclaim, um euch als Freunde zu verbinden.',
    open: 'In Roadclaim öffnen',
    noApp: 'Noch keine App? Lade Roadclaim kostenlos und öffne den Link danach noch einmal.',
    code: 'Einladungscode',
    ios: 'App Store',
    iosSmall: 'Laden im',
    android: 'Google Play',
    androidSmall: 'Jetzt bei',
  },
};

function invitePage(code, lang) {
  const t = COPY[lang];
  const deepLink = `roadclaim://i/${code}`;
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t.title}</title>
<meta name="robots" content="noindex">
<meta name="description" content="${t.lead}">
<meta property="og:title" content="${t.title}">
<meta property="og:description" content="${t.lead}">
<meta name="theme-color" content="#0B0F0E">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/style.css">
<script src="/assets/invite.js" defer></script>
</head>
<body class="invite">
<main class="invite-card" data-deeplink="${deepLink}">
  <a class="brand" href="${lang === 'de' ? '/de/' : '/'}"><img src="/assets/favicon.svg" alt="" width="36" height="36">Roadclaim</a>
  <h1>${t.title}</h1>
  <p class="lead">${t.lead}</p>
  <a class="btn btn-primary btn-block" href="${deepLink}">${t.open}</a>
  <p class="code">${t.code}: <strong>${code}</strong></p>
  <p class="muted">${t.noApp}</p>
  <div class="stores">
    <a class="store" href="/ios"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.4 12.7c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.7 1.3 10.2.8 1.2 1.8 2.6 3.1 2.5 1.3-.1 1.7-.8 3.2-.8s1.9.8 3.2.8c1.3 0 2.2-1.2 3-2.4.9-1.4 1.3-2.7 1.3-2.8 0 0-2.6-1-2.6-4.2zM13.9 5.1c.7-.8 1.2-2 1-3.1-1 0-2.2.7-2.9 1.5-.6.7-1.2 1.9-1 3 1.1.1 2.2-.6 2.9-1.4z"/></svg><span><small>${t.iosSmall}</small>${t.ios}</span></a>
    <a class="store" href="/android"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3.6 2.3c-.2.2-.3.6-.3 1v17.4c0 .4.1.8.3 1l.1.1 9.7-9.7v-.2L3.7 2.2l-.1.1zm13 13l-3.2-3.2v-.2l3.2-3.2.1.1 3.8 2.2c1.1.6 1.1 1.6 0 2.2l-3.8 2.2-.1-.1zm-.1.1L13.2 12l-9.6 9.7c.4.4.9.4 1.6.1l11.3-6.4M16.5 8.6L5.2 2.2c-.7-.4-1.2-.3-1.6.1l9.6 9.7 3.3-3.4z"/></svg><span><small>${t.androidSmall}</small>${t.android}</span></a>
  </div>
</main>
</body>
</html>`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/.well-known/apple-app-site-association') {
      return json({
        applinks: {
          details: [{ appIDs: [APP_ID], components: [{ '/': '/i/*', comment: 'Friend invites' }] }],
        },
      });
    }

    if (path === '/.well-known/assetlinks.json') {
      return json([
        {
          relation: ['delegate_permission/common.handle_all_urls'],
          target: { namespace: 'android_app', package_name: PACKAGE, sha256_cert_fingerprints: fingerprints },
        },
      ]);
    }

    const invite = path.match(/^\/i\/([A-Za-z0-9_-]{1,64})\/?$/);
    if (invite) {
      const lang = /^de\b/i.test(request.headers.get('accept-language') ?? '') ? 'de' : 'en';
      return new Response(invitePage(invite[1], lang), {
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
          'content-security-policy':
            "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
          vary: 'accept-language',
          ...SECURITY_HEADERS,
        },
      });
    }

    return env.ASSETS.fetch(request);
  },
};
