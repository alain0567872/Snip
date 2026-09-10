# Snip — URL Shortener

Backend service built to demonstrate the resume bullets:

> Built a backend service that generates unique short URLs and redirects requests to stored destination URLs. Implemented persistent URL storage, request validation, and click tracking through a SQL-backed data model.

## Stack

- **Backend:** Python + Flask, `sqlite3` (stdlib) for persistence.
- **Frontend:** Vanilla JavaScript + DOM APIs, no framework, no build step — includes a hand-drawn inline SVG sparkline for the per-link click history (no charting library needed).

## How the pieces map to the resume bullet

- **Unique short codes:** `generate_unique_code()` in `backend/app.py` draws a random 6-character base62 code (`secrets.choice`, cryptographically strong) and retries on the rare collision. Optionally a user can request a custom alias instead.
- **Redirects:** `GET /<code>` looks up the destination and issues a `302` redirect.
- **Request validation:** submitted URLs must parse as absolute `http(s)://` URLs with a domain; custom aliases are restricted to `3-32` chars of `[A-Za-z0-9_-]` and checked against a reserved-word list (`api`, `static`, ...) so they can't collide with real routes.
- **SQL-backed data model with click tracking:** two tables — `links` (code, destination, running `click_count`) and `clicks` (one row per visit, with timestamp) — so you get both an O(1) counter and a queryable history (`GET /api/links/:code/stats` groups clicks by day for the sparkline).

## Running it

```bash
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python3 app.py            # http://127.0.0.1:5002
```

```bash
cd frontend
python3 -m http.server 5174
```

Open `http://127.0.0.1:5174`. If your backend runs somewhere other than `127.0.0.1:5002`, update `frontend/config.js`.

## API summary

| Method | Path                        | Description                                  |
|--------|------------------------------|-----------------------------------------------|
| POST   | `/api/links`                 | Create a short link (`url`, optional `custom_alias`) |
| GET    | `/api/links`                 | List all links with click counts              |
| GET    | `/api/links/:code/stats`     | Link details + clicks grouped by day          |
| DELETE | `/api/links/:code`           | Delete a link                                 |
| GET    | `/:code`                     | Redirect to the destination, records a click  |

## Things to call out in an interview

- Click tracking is a separate `clicks` table rather than just an incrementing counter, so it supports real analytics (trends over time) rather than only a running total.
- Short codes use `secrets.choice`, not `random`, since predictable codes would let someone enumerate other users' links.
- This is intentionally a single-user/demo-scope service (no auth on the links API) — the natural next step for production would be scoping links to an account the same way the TaskFlow project does, plus rate-limiting `POST /api/links` to stop abuse.
