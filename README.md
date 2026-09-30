# RedLife Server — REST API

Express + MongoDB API for [RedLife](https://github.com/himelahmed404/RedLife), a blood
donation platform for Bangladesh. It stores donation requests and funding, manages users
and roles, and protects private routes with JWT verification.

- **Live API:** https://YOUR-SERVER.vercel.app
- **Client:** https://YOUR-CLIENT.vercel.app

## Tech stack

Node.js · Express 5 · MongoDB (official driver) · jose (JWT) · Stripe · Vercel

| Package | Used for |
|---|---|
| `express` | HTTP server and routing |
| `mongodb` | Database access |
| `jose` | Verifying JWTs against the client's public keys (JWKS) |
| `stripe` | Checkout sessions for funding |
| `cors` | Allows only the client's origin |
| `dotenv` | Loads `.env` locally |
| `nodemon` (dev) | Auto-restart during development |

## How authentication works

1. Users sign in on the Next.js client (Better Auth). The client's jwt plugin issues a
   short-lived token (EdDSA, 15 minutes) from `GET /api/auth/token`.
2. The client sends it as `Authorization: Bearer <token>` on every private request.
3. `verifyToken` checks the signature against the client's public keys
   (`CLIENT_URL/api/auth/jwks`), then loads the user from the database. Because of that
   fresh lookup, blocking a user or changing their role applies on their next request.
4. `verifyActive`, `verifyAdmin` and `verifyStaff` (admin + volunteer) sit on top.

The user always comes from the token, never from the request body.

## API

**Public**

| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | Health check |
| GET | `/api/pending-donation-requests?page&limit` | Pending requests for the public board |
| GET | `/api/donors/search?bloodGroup&district&upazila` | Active donors matching the filters |

**Logged in** (`verifyToken`)

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/create-donation-request` | Create a request (active users only; status starts as `pending`) |
| GET | `/api/my-donation-requests?status&page&limit` | Your own requests, paginated, with per-status counts |
| GET | `/api/my-donations` | Requests you committed to as a donor |
| GET | `/api/donation-requests/detail/:id` | One request |
| PUT | `/api/donation-requests/edit/:id` | Edit (owner or admin) |
| DELETE | `/api/donation-requests/:id` | Delete (owner or admin) |
| PATCH | `/api/donation-requests/status/:id` | `pending → inprogress` (donate; not your own request, active users only), `inprogress → done/canceled` (owner, admin or volunteer) |
| POST | `/api/profile/update-profile` | Update your own profile (email is never changed) |
| GET | `/api/funds` | All contributions |
| POST | `/api/funds/create-checkout-session` | Start a Stripe Checkout payment |
| POST | `/api/funds/confirm` | Record a finished payment (safe to call twice) |

**Admin + volunteer** (`verifyStaff`)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/all-blood-donation-requests?status&page&limit` | Every request, paginated |
| GET | `/api/dashboard/stats?range=daily\|weekly\|monthly` | Totals and a request-count series for charts |

**Admin** (`verifyAdmin`)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/admin/users?status&page&limit` | All users, paginated |
| PATCH | `/api/admin/users/:id/status` | `{ "status": "active" \| "blocked" }` |
| PATCH | `/api/admin/users/:id/role` | `{ "role": "donor" \| "volunteer" \| "admin" }` |

Admins cannot change their own role or status. Errors come back as
`{ "message": "..." }` with `401` (not logged in), `403` (not allowed), `404`,
`409` (the request's status changed first) or `400`.

## Run locally

```bash
git clone https://github.com/himelahmed404/RedLife-Server.git
cd RedLife-Server
npm install
cp .env.example .env   # then fill in the values
npm run dev            # http://localhost:5000
```

| Variable | Description |
|---|---|
| `MONGO_URI` | MongoDB Atlas connection string (same database as the client) |
| `STRIPE_SECRET_KEY` | Stripe secret key (test mode) |
| `CLIENT_URL` | The client's exact URL, no trailing slash. Used for CORS, Stripe redirects and the JWT keys. Defaults to `http://localhost:3000`. |

`scripts/migrate-fields.js` is a one-off migration that renamed older user fields to
`role` / `status`. It has already been run and is safe to run again.

## Deploying (Vercel)

`vercel.json` routes every request to `index.js`, which exports the Express app. The
database connection is opened once and reused, so a cold start never serves a request
before MongoDB is ready.

1. Import the repo in Vercel.
2. Add `MONGO_URI`, `STRIPE_SECRET_KEY` and `CLIENT_URL`.
3. In MongoDB Atlas, allow network access from `0.0.0.0/0` (Vercel has no fixed IPs).
