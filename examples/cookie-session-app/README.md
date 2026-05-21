# cookie-session-app

Minimal Node.js HTTP server demonstrating a cookie-session login flow.
Used as a test target for AuthLens. **Safe demo credentials only.**

```sh
npm start
# open http://localhost:4001
# email: demo@authlens.dev
# password: demo-password
```

What this demonstrates for AuthLens:

- `GET /login` — login page with hidden CSRF token
- `POST /api/login` — sets `session` cookie (HttpOnly, SameSite=Lax)
- `GET /api/me` — protected endpoint relying on the cookie
- `POST /logout` — clears the session
