"""URL Shortener API.

Demonstrates: unique short-code generation, redirect handling, request
validation, and a SQL-backed data model with click tracking.
"""
import re
import secrets
import string
from urllib.parse import urlparse

from flask import Flask, jsonify, redirect, request

from db import get_connection, init_db

app = Flask(__name__)

ALPHABET = string.ascii_letters + string.digits  # 62 characters -> base62 codes
CODE_LENGTH = 6
ALIAS_PATTERN = re.compile(r"^[A-Za-z0-9_-]{3,32}$")
RESERVED_CODES = {"api", "static", "health", "favicon.ico"}


@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, DELETE, OPTIONS"
    return response


@app.route("/api/<path:_any>", methods=["OPTIONS"])
def cors_preflight(_any):
    return "", 204


# ---------------------------------------------------------------- helpers
def validate_url(raw_url: str):
    """Return (cleaned_url, error). Requires an absolute http(s) URL."""
    if not raw_url or len(raw_url) > 2048:
        return None, "url is required and must be under 2048 characters"

    parsed = urlparse(raw_url)
    if parsed.scheme not in ("http", "https"):
        return None, "url must start with http:// or https://"
    if not parsed.netloc:
        return None, "url must include a domain, e.g. https://example.com/page"
    return raw_url, None


def generate_unique_code(conn) -> str:
    for _ in range(10):
        code = "".join(secrets.choice(ALPHABET) for _ in range(CODE_LENGTH))
        exists = conn.execute("SELECT 1 FROM links WHERE code = ?", (code,)).fetchone()
        if not exists:
            return code
    raise RuntimeError("could not generate a unique short code, try again")


def link_to_dict(row, base_url):
    return {
        "id": row["id"],
        "code": row["code"],
        "short_url": f"{base_url}/{row['code']}",
        "long_url": row["long_url"],
        "created_at": row["created_at"],
        "click_count": row["click_count"],
    }


# ------------------------------------------------------------------ routes
@app.post("/api/links")
def create_link():
    data = request.get_json(silent=True) or {}
    cleaned_url, error = validate_url((data.get("url") or "").strip())
    if error:
        return jsonify(error=error), 400

    custom_alias = (data.get("custom_alias") or "").strip()
    conn = get_connection()
    try:
        if custom_alias:
            if not ALIAS_PATTERN.match(custom_alias):
                return jsonify(
                    error="custom alias must be 3-32 characters: letters, numbers, - or _"
                ), 400
            if custom_alias.lower() in RESERVED_CODES:
                return jsonify(error="that alias is reserved"), 400
            if conn.execute(
                "SELECT 1 FROM links WHERE code = ?", (custom_alias,)
            ).fetchone():
                return jsonify(error="that alias is already taken"), 409
            code = custom_alias
        else:
            code = generate_unique_code(conn)

        cur = conn.execute(
            "INSERT INTO links (code, long_url) VALUES (?, ?)", (code, cleaned_url)
        )
        conn.commit()
        row = conn.execute("SELECT * FROM links WHERE id = ?", (cur.lastrowid,)).fetchone()
        return jsonify(link=link_to_dict(row, request.host_url.rstrip("/"))), 201
    finally:
        conn.close()


@app.get("/api/links")
def list_links():
    conn = get_connection()
    try:
        rows = conn.execute("SELECT * FROM links ORDER BY created_at DESC").fetchall()
        return jsonify(links=[link_to_dict(r, request.host_url.rstrip("/")) for r in rows])
    finally:
        conn.close()


@app.get("/api/links/<code>/stats")
def link_stats(code):
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM links WHERE code = ?", (code,)).fetchone()
        if not row:
            return jsonify(error="short link not found"), 404
        clicks = conn.execute(
            "SELECT date(clicked_at) AS day, COUNT(*) AS count "
            "FROM clicks WHERE link_id = ? GROUP BY day ORDER BY day",
            (row["id"],),
        ).fetchall()
        return jsonify(
            link=link_to_dict(row, request.host_url.rstrip("/")),
            clicks_by_day=[{"day": c["day"], "count": c["count"]} for c in clicks],
        )
    finally:
        conn.close()


@app.delete("/api/links/<code>")
def delete_link(code):
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM links WHERE code = ?", (code,)).fetchone()
        if not row:
            return jsonify(error="short link not found"), 404
        conn.execute("DELETE FROM links WHERE id = ?", (row["id"],))
        conn.commit()
        return jsonify(message="link deleted")
    finally:
        conn.close()


@app.get("/api/health")
def health():
    return jsonify(status="ok")


@app.get("/<code>")
def follow_link(code):
    """Redirect to the stored destination and record a click."""
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM links WHERE code = ?", (code,)).fetchone()
        if not row:
            return jsonify(error="short link not found"), 404

        conn.execute(
            "INSERT INTO clicks (link_id, referrer) VALUES (?, ?)",
            (row["id"], request.referrer),
        )
        conn.execute(
            "UPDATE links SET click_count = click_count + 1 WHERE id = ?", (row["id"],)
        )
        conn.commit()
        return redirect(row["long_url"], code=302)
    finally:
        conn.close()


init_db()

if __name__ == "__main__":
    app.run(debug=True, port=5002)
