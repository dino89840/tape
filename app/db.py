import sqlite3
import os
from contextlib import contextmanager
from datetime import datetime

DB_PATH = os.environ.get("DB_PATH", "/data/keeper.db")
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)


def init_db():
    with get_conn() as c:
        c.execute("""
            CREATE TABLE IF NOT EXISTS files (
                file_id      TEXT PRIMARY KEY,
                name         TEXT,
                added_at     TEXT NOT NULL,
                last_checked TEXT,
                last_status  TEXT,
                last_message TEXT
            )
        """)
        c.execute("""
            CREATE TABLE IF NOT EXISTS runs (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                started_at  TEXT NOT NULL,
                finished_at TEXT,
                ok_count    INTEGER DEFAULT 0,
                fail_count  INTEGER DEFAULT 0,
                note        TEXT
            )
        """)


@contextmanager
def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def now_iso() -> str:
    return datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")


def add_file(file_id: str, name: str = "") -> bool:
    with get_conn() as c:
        cur = c.execute(
            "INSERT OR IGNORE INTO files(file_id, name, added_at) VALUES (?,?,?)",
            (file_id, name, now_iso()),
        )
        return cur.rowcount > 0


def remove_file(file_id: str):
    with get_conn() as c:
        c.execute("DELETE FROM files WHERE file_id=?", (file_id,))


def list_files():
    with get_conn() as c:
        return [dict(r) for r in c.execute(
            "SELECT * FROM files ORDER BY added_at DESC"
        ).fetchall()]


def get_file(file_id: str):
    with get_conn() as c:
        r = c.execute("SELECT * FROM files WHERE file_id=?", (file_id,)).fetchone()
        return dict(r) if r else None


def update_file_status(file_id: str, status: str, message: str, name: str = None):
    with get_conn() as c:
        if name:
            c.execute(
                "UPDATE files SET last_checked=?, last_status=?, last_message=?, name=COALESCE(NULLIF(?, ''), name) WHERE file_id=?",
                (now_iso(), status, message, name, file_id),
            )
        else:
            c.execute(
                "UPDATE files SET last_checked=?, last_status=?, last_message=? WHERE file_id=?",
                (now_iso(), status, message, file_id),
            )


def start_run(note: str = "") -> int:
    with get_conn() as c:
        cur = c.execute(
            "INSERT INTO runs(started_at, note) VALUES (?, ?)",
            (now_iso(), note),
        )
        return cur.lastrowid


def finish_run(run_id: int, ok: int, fail: int):
    with get_conn() as c:
        c.execute(
            "UPDATE runs SET finished_at=?, ok_count=?, fail_count=? WHERE id=?",
            (now_iso(), ok, fail, run_id),
        )


def recent_runs(limit: int = 10):
    with get_conn() as c:
        return [dict(r) for r in c.execute(
            "SELECT * FROM runs ORDER BY id DESC LIMIT ?", (limit,)
        ).fetchall()]
