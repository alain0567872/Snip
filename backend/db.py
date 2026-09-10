"""SQL-backed persistence for the URL shortener (sqlite3, stdlib)."""
import os
import sqlite3

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
DB_PATH = os.path.join(BASE_DIR, "shortener.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS links (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    code        TEXT NOT NULL UNIQUE,
    long_url    TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    click_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS clicks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    link_id     INTEGER NOT NULL REFERENCES links(id) ON DELETE CASCADE,
    clicked_at  TEXT NOT NULL DEFAULT (datetime('now')),
    referrer    TEXT
);

CREATE INDEX IF NOT EXISTS idx_clicks_link ON clicks(link_id);
"""


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    conn = get_connection()
    try:
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()
