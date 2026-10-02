# URL shortener

JavaScript/CommonJS with Express, Mongoose, Redis, and Docker Compose.

## Run locally

Create `server/.env` from `server/.env.example` if needed. Keep existing settings and set `BASE_URL` to the public HTTP(S) address of the service, without credentials, a query, or a fragment.

```sh
docker compose up -d
cd server
npm ci
node src/server.js
```

## Endpoints

| Method | Route | Behavior |
| --- | --- | --- |
| POST | `/api/urls` | Creates a link; returns 201 with `code`, `shortUrl`, `originalUrl`, and optional `expiresAt`. |
| GET | `/:code` | Redirects with 302; returns 404 when unknown or 410 when expired. |
| GET | `/api/urls?page=1&limit=20` | Lists saved links newest first with `items` and pagination metadata. |
| DELETE | `/api/urls/:code` | Returns 204 when deleted, 404 when absent, or 400 for an invalid code. |
| GET | `/health` | Returns `{ "status": "ok" }`. |

Creation accepts `originalUrl` (an absolute HTTP(S) URL), optional `expiresAt` (a future date string), and optional `alias`. Aliases are case-sensitive and contain 3–64 letters, digits, hyphens, or underscores. `api` and `health` are reserved in every letter case. Invalid input returns 400; a taken alias returns 409.

Generated codes contain seven Base62 characters from an atomic Redis counter. MongoDB's unique code index protects both aliases and generated codes. Generated codes retry collisions up to ten times, then return 503. Each creation gets a new code unless an alias is provided.

Pagination defaults to page 1 and limit 20. Page is bounded to 1–10,000 and limit to 1–100; invalid values return 400. `pagination` contains `page`, `limit`, `totalItems`, `totalPages`, `hasNextPage`, and `hasPreviousPage`. Pages beyond the last page return empty `items`; expired links remain listed. Equal creation times are ordered by descending MongoDB ID. Concurrent changes may affect counts or shift pages.
