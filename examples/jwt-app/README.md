# jwt-app

Minimal Node.js HTTP server demonstrating a JWT-based login flow.
Used as a test target for AuthLens. **Safe demo credentials only.**

```sh
npm start
# open http://localhost:4002
```

What this demonstrates:

- `POST /api/login` — returns `{ access_token, token_type: "Bearer", expires_in }`
- Token is stored in `localStorage` (deliberately, to make AuthLens detect token storage)
- `GET /api/me` — requires `Authorization: Bearer <token>`
