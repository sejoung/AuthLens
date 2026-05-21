// Tiny cookie-session demo for AuthLens.
// SAFE credentials only — never use real ones.

import http from 'node:http';
import { URL } from 'node:url';
import crypto from 'node:crypto';

const SAFE_USER = { email: 'demo@authlens.dev', password: 'demo-password' };
const sessions = new Map();
const csrfTokens = new Set();
const PORT = Number(process.env.PORT ?? 4001);

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const cookies = parseCookies(req.headers.cookie);

  if (url.pathname === '/' && req.method === 'GET') {
    return html(res, landingPage(cookies.session));
  }
  if (url.pathname === '/login' && req.method === 'GET') {
    const csrf = crypto.randomBytes(16).toString('hex');
    csrfTokens.add(csrf);
    return html(res, loginPage(csrf));
  }
  if (url.pathname === '/api/login' && req.method === 'POST') {
    return readBody(req).then((body) => {
      const parsed = new URLSearchParams(body);
      const csrf = parsed.get('csrf');
      if (!csrf || !csrfTokens.has(csrf)) {
        res.statusCode = 403;
        return res.end('Invalid CSRF token');
      }
      csrfTokens.delete(csrf);
      if (
        parsed.get('email') !== SAFE_USER.email ||
        parsed.get('password') !== SAFE_USER.password
      ) {
        res.statusCode = 401;
        return res.end('Invalid credentials');
      }
      const sid = crypto.randomBytes(24).toString('hex');
      sessions.set(sid, { email: SAFE_USER.email, ts: Date.now() });
      res.setHeader(
        'Set-Cookie',
        `session=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=3600`,
      );
      res.statusCode = 303;
      res.setHeader('Location', '/');
      return res.end();
    });
  }
  if (url.pathname === '/api/me' && req.method === 'GET') {
    const session = cookies.session && sessions.get(cookies.session);
    if (!session) {
      res.statusCode = 401;
      return json(res, { error: 'Not signed in' });
    }
    return json(res, { email: session.email });
  }
  if (url.pathname === '/logout' && req.method === 'POST') {
    if (cookies.session) sessions.delete(cookies.session);
    res.setHeader('Set-Cookie', `session=; Max-Age=0; Path=/`);
    res.statusCode = 303;
    res.setHeader('Location', '/');
    return res.end();
  }

  res.statusCode = 404;
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`[cookie-session-app] http://localhost:${PORT}`);
  console.log(`  email: ${SAFE_USER.email}`);
  console.log(`  password: ${SAFE_USER.password}`);
});

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const pair of header.split(';')) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    out[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
  }
  return out;
}
function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}
function html(res, body) {
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(body);
}
function json(res, obj) {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(obj));
}
function landingPage(session) {
  return `<!doctype html><meta charset="utf-8"><title>cookie-session demo</title>
<style>body{font-family:system-ui;padding:32px;max-width:640px;margin:auto;color:#0f172a}</style>
<h1>Cookie-Session Demo</h1>
<p>This is a safe demo for AuthLens. Use the credentials shown in the terminal.</p>
${
  session
    ? `<p>You are signed in. <form method="post" action="/logout"><button>Log out</button></form></p>`
    : `<p><a href="/login">Sign in</a></p>`
}
<p><code>GET /api/me</code> returns the current session.</p>`;
}
function loginPage(csrf) {
  return `<!doctype html><meta charset="utf-8"><title>Sign in</title>
<style>body{font-family:system-ui;padding:32px;max-width:480px;margin:auto;color:#0f172a}label{display:block;margin:12px 0 4px}input,button{font:inherit;padding:8px 12px}</style>
<h1>Sign in</h1>
<form method="post" action="/api/login">
  <label>Email <input name="email" type="email" required></label>
  <label>Password <input name="password" type="password" required></label>
  <input type="hidden" name="csrf" value="${csrf}">
  <button type="submit">Sign in</button>
</form>`;
}
