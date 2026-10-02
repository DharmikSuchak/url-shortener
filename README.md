# URL shortener

A URL shortener built with the MERN stack (MongoDB, Express, React, and Node.js), with Redis for code generation, caching, and rate limiting.

## Design and assignment answers

### 1. Setup and tests

From the repository root, start the complete application:

```sh
docker compose up --build
```

Open **http://localhost:8080**. This starts the frontend, Express API, analytics worker, MongoDB, and Redis. The frontend's Nginx server proxies API and short-link requests to `backend:3000`; the API is also exposed at http://localhost:3000.

Defaults work without an environment file. To customize them, copy the root `.env.example` to `.env`, preserving existing settings. If changing `FRONTEND_PORT`, update `BASE_URL` to the same browser-accessible address. `BASE_URL` must be an HTTP(S) URL without credentials, query, or fragment. The root environment file configures Compose; `server/.env` and `client/.env` configure native development.

```sh
docker compose up --build -d --wait
docker compose ps
docker compose logs -f backend worker
docker compose stop
```

Stopping preserves the existing `mongo_data` and `redis_data` named volumes. Use this directory and the same Compose project name to reuse them. Do not run `down -v` or prune volumes you need.

For native development, create `server/.env` from `server/.env.example` if it does not already exist. Stop the Docker application services if they are running, and start only the databases:

```sh
docker compose stop frontend backend worker
docker compose up -d mongo redis
```

In separate terminals:

```sh
# API
cd server
npm ci
node src/server.js
```

```sh
# Analytics worker
cd server
npm run worker
```

```sh
# Frontend
cd client
npm ci
npm run dev
```

Open the Vite address printed in the terminal (normally http://localhost:5173). Native defaults use API port 3000 and `BASE_URL=http://localhost:3000`. The frontend defaults to `VITE_API_BASE_URL=/api`, with Vite forwarding API requests to `API_PROXY_TARGET=http://127.0.0.1:3000`; optional settings are in `client/.env.example`. Short URLs open the backend directly during native development.

With MongoDB and Redis running, check the backend and frontend:

```sh
cd server
npm test
```

```sh
cd client
npm run build
```

Backend tests use Node's built-in runner with real HTTP, MongoDB, Redis Streams, and worker integration tests. Coverage includes creation and both URL field names, invalid input, redirects, expiry, analytics retries, pagination, deletion, alias boundaries and legacy aliases, collisions, permutation boundaries, cache hits without MongoDB lookup, cache/deletion races, and atomic rate limiting.

Tests do not load `server/.env`. Each run forces a random `url_shortener_test_<id>` database and `short-url:test:<id>` Redis namespace for all test keys and the consumer group. Cleanup checks these boundaries, drops only that test database, and deletes only keys in that run's namespace. It never flushes Redis, drops the development database, or removes volumes. Use `TEST_MONGODB_URI` and `TEST_REDIS_URL` to select test services; interrupted runs can leave isolated test resources behind.

### 2. Why this stack?

I chose JavaScript so React and Node.js/Express use one language. MongoDB stores URLs and separate click records. Redis provides an atomic code counter, redirect cache, creation rate limits, and a stream for click events. A separate worker saves those events without making each redirect write directly to MongoDB. Docker Compose runs the local stack together.

### 3. Codes and collisions

Redis `INCR` allocates distinct numbers concurrently. Before seven-character Base62 encoding, a deterministic bijective permutation applies `(a * n + b) mod m` using `BigInt`, with:

- `m = 62^7 = 3,521,614,606,208` (about 3.52 trillion codes).
- `a = 1,103,515,245`, coprime to 62.
- `b = 25,214,903,917`.

These parameters are fixed in `server/src/utils/permuteCounter.js`; changing them changes future allocation. Numbers run from 1 to `m - 1`, leaving the permutation of 0 unused; reaching the boundary returns 503 rather than wrapping. The permutation makes codes look less sequential; it is not encryption or a security guarantee. `INCR` is atomic, not a lock.

Random generation encounters the birthday paradox: some collision becomes likely long before the space is full. The counter and bijection avoid collisions between newly allocated numbers, but aliases or earlier saved codes can occupy a result. MongoDB's unique `code` index is the final safeguard. Generated codes retry up to ten times with fresh counter values, then return 503; a taken custom alias returns 409.

Existing saved codes are not migrated. Preserve the counter key (`URL_COUNTER_KEY`, default `short-url:counter`) and its data: resetting it revisits allocated numbers, although the unique index prevents overwriting records.

### 4. Assumptions and trade-offs

Shortening the same destination twice creates separate links with independent expiry and analytics. Links are public, with no accounts or ownership checks. Click events enter Redis Streams and are saved asynchronously, so stats can lag briefly. MongoDB supports analytics for this local stack; complex, high-volume dashboards could benefit from a dedicated analytical store.

Compose uses single MongoDB and Redis instances, not a highly available cluster. Cache coordination and analytics have failure limits described below; there is no end-to-end delivery or throughput guarantee.

### 5. One million redirects per day

One million per day averages roughly 12 redirects per second; peak traffic matters more. I would benchmark the redirect path, run multiple stateless API instances behind a load balancer, monitor cache hit rate and stream lag, and add replication and backups. If stats became a bottleneck, I would pre-aggregate counts and consider ClickHouse. Kafka or a managed queue would be considered only when event volume and operational needs justified it. These are proposed changes, not measured capabilities of this implementation.

### 6. AI tools

I set up the project and initial Express backend, configured MongoDB and Redis with Docker Compose, and wrote the database connections and URL schema. I also implemented the seven-character Base62 encoder, Redis-backed counter, code-generation utility, and initial URL-creation endpoint.

While preparing for a weekend hackathon, I used Codex to help complete the React frontend, extend and refine the backend, add tests, and improve the documentation. I reviewed and tested the resulting application, this README describes its design and limitations.
## API

Errors use JSON `{ "error": "message" }`, except health readiness responses.

| Method | Path | Behavior |
| --- | --- | --- |
| POST | `/api/urls` | Creates a link; 201 with `code`, `shortUrl`, `url`, `originalUrl`, and optional `expiresAt`. |
| GET | `/:code` | 302 redirect; 404 for unknown codes; 410 for expired links; 503 if click queuing fails. |
| GET | `/api/urls?page=1&limit=20` | Newest-first `items` with pagination metadata; each item includes both URL fields and `createdAt`. |
| GET | `/api/urls/:code/stats` | Persisted click stats; 404 for an unknown or deleted link. |
| DELETE | `/api/urls/:code` | 204 deleted, 404 absent, 400 invalid code, or 503 on cache invalidation failure. |
| GET | `/health` | 200 with `{ "status": "ok" }` when MongoDB and Redis are connected, otherwise 503 with `{ "status": "unavailable" }`. |

Creation accepts `url` as in the assignment, or the compatible `originalUrl` field used by the frontend. Destinations must be absolute HTTP(S) URLs. If both fields are supplied, each must be valid and normalize to the same destination; conflicting values return 400. Creation, listing, and stats return both names with the same normalized value. Optional `expiresAt` must be a valid future date string.

New custom aliases are case-sensitive and contain **6–7 letters, digits, hyphens, or underscores**. `api` and `health` are reserved in every letter case. Invalid input returns 400; a taken valid alias returns 409. Existing 3–64 character aliases remain supported for redirects, listing, stats, and deletion; the new length restriction applies only to creation.

Example creation through Docker (when `my-link` is available):

```sh
curl -sS http://localhost:8080/api/urls \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com/some/long/path","alias":"my-link","expiresAt":"2030-12-31T00:00:00Z"}'
```

Example 201 response:

```json
{
  "code": "my-link",
  "shortUrl": "http://localhost:8080/my-link",
  "url": "https://example.com/some/long/path",
  "originalUrl": "https://example.com/some/long/path",
  "expiresAt": "2030-12-31T00:00:00.000Z"
}
```

Omit `alias` for an automatically generated code and `expiresAt` for no expiry. Inspect a redirect without following the destination, then check persisted stats:

```sh
curl -i http://localhost:8080/my-link
curl -sS http://localhost:8080/api/urls/my-link/stats
```

Repeat the redirect to count more clicks. Retry stats after a moment if the worker has not caught up. Stats include `code`, `url`, `originalUrl`, `createdAt`, `totalClicks`, `lastClickedAt` (initially null), `clicksByDay` (UTC dates/counts), and the latest 20 `recentClicks` (code, timestamp, user-agent, referrer). Expired links retain stats.

Pagination defaults to page 1 and limit 20, bounded to page 1–10,000 and limit 1–100. Invalid values return 400. Metadata contains `page`, `limit`, `totalItems`, `totalPages`, `hasNextPage`, and `hasPreviousPage`. Pages beyond the last are empty; expired links remain listed. Equal creation times are ordered by descending MongoDB ID. Concurrent changes can shift pages or affect counts.

## Runtime settings and Docker behavior

The root and server `.env.example` files document these settings; restart native processes or recreate services after changes.

| Setting | Default | Accepted values / purpose |
| --- | --- | --- |
| `REDIRECT_CACHE_PREFIX` | `short-url:redirect` | Non-empty prefix without whitespace; keys append the case-sensitive code. |
| `REDIRECT_CACHE_TTL_SECONDS` | `300` | Integer 1–3600; maximum cache lifetime. |
| `CREATE_RATE_PREFIX` | `short-url:rate:create` | Non-empty prefix without whitespace; keys append a SHA-256 hash of the resolved IP. |
| `CREATE_RATE_LIMIT` | `20` | Integer 1–10,000; POST attempts per IP per window. |
| `CREATE_RATE_WINDOW_SECONDS` | `60` | Integer 1–86,400; window starts with the IP's first attempt. |
| `TRUST_PROXY` | `false` | `false` or a comma-separated list of trusted proxy IPs/subnets. |

Containers use `mongodb://mongo:27017/url_shortener` and `redis://redis:6379`, with Docker service names rather than localhost. MongoDB and Redis health checks gate API and worker startup; the frontend waits for API readiness. The worker connects and initializes its MongoDB index before consuming, retries stream failures, and exits on startup failure. It has no HTTP health endpoint. `restart: unless-stopped` restarts exited processes; an unhealthy status alone does not restart a container.

Images exclude environment files and copy explicit source/configuration files. Credentials are runtime settings, never build arguments. The frontend builds with public `VITE_API_BASE_URL=/api` and serves static assets through Nginx, which uses Docker DNS for backend replacement and disables upstream retries to avoid duplicate click submissions. MongoDB/Redis host ports remain 27017/6379 for native development. This unauthenticated Compose setup is intended for local use.

## Redirect caching and deletion

Cache payloads contain the URL document ID, destination, and expiry, never click counts. **A valid cache hit performs no MongoDB lookup and queues its own click.** Misses fetch MongoDB. Old entries without an ID and malformed entries fall back to MongoDB. TTL is bounded by the earlier of the configured deadline and `expiresAt`; hits do not refresh it. Unknown and already expired links are not cached. Expiry is checked on both paths; even an expired entry still present in Redis returns 410.

Cache read/write failures fall back to MongoDB where possible. A miss may reserve a five-second `loading:` token; a conditional Lua write fills only that token. Requests seeing a loading token query MongoDB without filling the cache.

DELETE observes the document ID, then replaces the cache slot with an `invalidating:` token before deleting that particular document. This blocks delayed fills and protects a replacement alias from overlapping deletes. Requests seeing the marker use MongoDB. Cleanup conditionally removes only the deleting request's token.

If establishing the marker fails, DELETE returns 503 without starting database deletion. If deletion succeeds but cleanup fails, it returns 503 explaining the partial result; retry DELETE to clean up (possibly receiving 404). A MongoDB deletion failure returns 500 and leaves caching blocked. Markers have no expiry so a crash cannot reopen caching before deletion's outcome is known; interrupted deletions may leave markers indefinitely until retried. Check for alias reuse before retrying a partial deletion, and do not manually remove active markers.

An already resolved redirect can finish concurrently with deletion. MongoDB and Redis are not one transaction: marker eviction, Redis rollback/restoration, or direct MongoDB edits can bypass coordination and leave stale cache data until TTL expiry. API-created expiry dates do not change. Clear the corresponding cache after direct edits, and keep host clocks synchronized. A cache fallback still returns 503 if Redis cannot queue analytics.

## Creation rate limiting

Only `POST /api/urls` is rate limited, including aliases, invalid input, malformed JSON, and failed creations. One atomic Redis script combines `INCR`, TTL inspection, and `PEXPIRE`, setting expiry on the first attempt and repairing counters without expiry without extending a live window. Excess attempts return 429 with JSON error and integer-seconds `Retry-After`. Enforcement failures/timeouts return 503; a timed-out command may still consume an attempt. Redirects and other endpoints are not limited.

Express ignores `X-Forwarded-For` by default. Through Docker Nginx, clients therefore share its container IP quota. Configure only actual trusted proxy IPs/subnets to separate clients; trusting all proxies or arbitrary hop counts is rejected. Nginx appends its observed peer address, and Express stops at the first untrusted hop. A broad trusted Docker subnet can include gateways or other containers able to forge identity; control the forwarding chain and restrict direct backend access before trusting it. The local backend host port is exposed.

This is a fixed window: shared IPs share quotas, boundary bursts are possible, and Redis key loss/eviction resets quotas. Cache and limiter prefixes must be shared by API replicas using the same database and isolated between independent deployments.

## Click analytics and limitations

Before every active-link 302, the API queues a Redis Stream event with a UUID, URL document ID, code, UTC timestamp, user-agent, and referrer. Missing headers become empty strings. Unknown and expired links queue nothing; Express also counts HEAD redirects.

Disconnected Redis, a rejected write, or a two-second queuing timeout produces a logged error and 503 without a Location header. Offline commands are not buffered. A timeout or lost response can still mean Redis accepted an event, so an attempt returning 503 can be counted. An event is a redirect attempt, not proof the browser followed the destination.

The worker's consumer group starts at the beginning of the stream. It upserts events into the separate `clicks` collection using the event UUID as unique `_id`, with `$setOnInsert` preventing duplicate stored events on retry, and acknowledges Redis only after an acknowledged MongoDB write (`w:1`). Failed writes/acknowledgements remain pending; `XAUTOCLAIM` recovers events idle for at least 30 seconds. Invalid events are logged and left pending for investigation; there is no dead-letter queue.

Events are tied to document IDs, so reusing a deleted alias starts fresh stats while historical clicks remain stored. Stream entries and click records have no automatic trimming/expiry, and stats aggregate stored clicks on each request. Redis uses AOF in Compose, but neither service has replication; queuing does not require synchronous Redis disk acknowledgement, and `w:1` is not a replicated or explicitly journaled write guarantee. Storage loss or stream removal can lose events. Retry protection is per event ID, not exactly-once redirects or guaranteed end-to-end delivery.
