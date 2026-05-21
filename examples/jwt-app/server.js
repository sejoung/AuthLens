// Minimal JWT demo for AuthLens.
// SAFE credentials only.

import http from 'node:http';
import { URL } from 'node:url';
import crypto from 'node:crypto';

const SAFE_USER = { email: 'demo@authlens.dev', password: 'demo-password' };
const SECRET = 'authlens-demo-secret-not-for-production';
const PORT = Number(process.env.PORT ?? 4002);

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/' && req.method === 'GET') {
    return html(res, landing());
  }
  if (url.pathname === '/api/login' && req.method === 'POST') {
    return readJson(req).then((body) => {
      if (body.email !== SAFE_USER.email || body.password !== SAFE_USER.password) {
        res.statusCode = 401;
        return json(res, { error: 'invalid credentials' });
      }
      const token = signJwt({ sub: SAFE_USER.email, iat: Math.floor(Date.now() / 1000) });
      return json(res, { access_token: token, token_type: 'Bearer', expires_in: 3600 });
    });
  }
  if (url.pathname === '/api/me' && req.method === 'GET') {
    const auth = req.headers.authorization ?? '';
    const match = /^Bearer (.+)$/i.exec(auth);
    if (!match) {
      res.statusCode = 401;
      return json(res, { error: 'missing bearer token' });
    }
    try {
      const payload = verifyJwt(match[1]);
      return json(res, { email: payload.sub });
    } catch {
      res.statusCode = 401;
      return json(res, { error: 'invalid token' });
    }
  }
  res.statusCode = 404;
  res.end('Not Found');
});
server.listen(PORT, () =>
  console.log(`[jwt-app] http://localhost:${PORT}\n  email: ${SAFE_USER.email}\n  password: ${SAFE_USER.password}`),
);

function landing() {
  return `<!doctype html><meta charset="utf-8"><title>JWT demo</title>
<style>body{font-family:system-ui;padding:32px;max-width:560px;margin:auto;color:#0f172a}button,input{font:inherit;padding:8px 12px;display:block;margin:8px 0}</style>
<h1>JWT Demo</h1>
<form id="f">
  <label>Email <input id="email" value="demo@authlens.dev"></label>
  <label>Password <input id="password" type="password" value="demo-password"></label>
  <button type="submit">Sign in</button>
</form>
<pre id="out"></pre>
<script>
const out = document.getElementById('out');
document.getElementById('f').addEventListener('submit', async (e) => {
  e.preventDefault();
  const r = await fetch('/api/login', { method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ email: email.value, password: password.value })});
  const data = await r.json();
  if (data.access_token) {
    localStorage.setItem('access_token', data.access_token);
    const me = await fetch('/api/me', { headers:{ authorization:'Bearer ' + data.access_token }}).then(r=>r.json());
    out.textContent = 'Signed in: ' + JSON.stringify(me, null, 2);
  } else {
    out.textContent = JSON.stringify(data, null, 2);
  }
});
</script>`;
}

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function signJwt(payload) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify(payload));
  const sig = crypto
    .createHmac('sha256', SECRET)
    .update(header + '.' + body)
    .digest('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return header + '.' + body + '.' + sig;
}
function verifyJwt(token) {
  const [h, b, s] = token.split('.');
  const expected = crypto
    .createHmac('sha256', SECRET)
    .update(h + '.' + b)
    .digest('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  if (s !== expected) throw new Error('bad signature');
  return JSON.parse(Buffer.from(b, 'base64url').toString('utf8'));
}
function readJson(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        resolve({});
      }
    });
  });
}
function json(res, obj) {
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(obj));
}
function html(res, body) {
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(body);
}
