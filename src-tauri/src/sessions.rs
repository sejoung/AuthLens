//! Persistent storage for captured `AuthFlow` sessions.
//!
//! Backed by SQLite (bundled). Stored under the OS-standard app data
//! directory; on macOS that's `~/Library/Application Support/AuthLens/`,
//! on Linux `~/.local/share/AuthLens/`, Windows `%APPDATA%/AuthLens/`.
//!
//! The full AuthFlow is persisted as JSON in a single `flow` column —
//! the schema stays simple, and querying is purely metadata-based
//! (list by recency, get by id). Raw sensitive values are stripped on
//! the frontend before save (matches the existing InMemorySessionStore
//! policy); we do not re-validate here, but we also never re-introduce
//! raw values on read.
//!
//! Capacity: no hard cap server-side. UI keeps things bounded by the
//! Recent list pagination + manual delete.

use parking_lot::Mutex;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::State;

pub struct SessionDb {
    inner: Mutex<Option<Connection>>,
}

impl SessionDb {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(None),
        }
    }

    fn ensure(&self) -> Result<(), String> {
        let mut guard = self.inner.lock();
        if guard.is_some() {
            return Ok(());
        }
        let path = sessions_db_path()?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("mkdir: {e}"))?;
        }
        let conn = Connection::open(&path).map_err(|e| format!("open db: {e}"))?;
        conn.execute_batch(SCHEMA_SQL)
            .map_err(|e| format!("init schema: {e}"))?;
        *guard = Some(conn);
        Ok(())
    }
}

impl Default for SessionDb {
    fn default() -> Self {
        Self::new()
    }
}

fn sessions_db_path() -> Result<PathBuf, String> {
    let base = dirs::data_dir().ok_or_else(|| "no data dir on this platform".to_string())?;
    Ok(base.join("AuthLens").join("sessions.sqlite"))
}

const SCHEMA_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS sessions (
  id           TEXT PRIMARY KEY,
  target_url   TEXT NOT NULL,
  started_at   TEXT NOT NULL,
  ended_at     TEXT,
  auth_type    TEXT,
  confidence   REAL,
  flow_json    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_started_at_idx ON sessions(started_at DESC);
"#;

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StoredSession {
    pub id: String,
    pub target_url: String,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub auth_type: Option<String>,
    pub confidence: Option<f64>,
    /// The full AuthFlow JSON as a string. The frontend re-parses it.
    /// Kept as a string here so the Rust side never has to model the full
    /// AuthFlow type (which is large and evolves with the analyzer).
    pub flow_json: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummary {
    pub id: String,
    pub target_url: String,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub auth_type: Option<String>,
    pub confidence: Option<f64>,
}

#[tauri::command]
pub fn session_save(db: State<'_, SessionDb>, session: StoredSession) -> Result<(), String> {
    db.ensure()?;
    let guard = db.inner.lock();
    let conn = guard.as_ref().ok_or_else(|| "db not initialized".to_string())?;
    conn.execute(
        r#"INSERT OR REPLACE INTO sessions
            (id, target_url, started_at, ended_at, auth_type, confidence, flow_json)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)"#,
        params![
            session.id,
            session.target_url,
            session.started_at,
            session.ended_at,
            session.auth_type,
            session.confidence,
            session.flow_json,
        ],
    )
    .map_err(|e| format!("insert: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn session_list(db: State<'_, SessionDb>, limit: Option<u32>) -> Result<Vec<SessionSummary>, String> {
    db.ensure()?;
    let guard = db.inner.lock();
    let conn = guard.as_ref().ok_or_else(|| "db not initialized".to_string())?;
    let limit = limit.unwrap_or(50).min(500);
    let mut stmt = conn
        .prepare(
            r#"SELECT id, target_url, started_at, ended_at, auth_type, confidence
               FROM sessions
               ORDER BY started_at DESC
               LIMIT ?1"#,
        )
        .map_err(|e| format!("prepare list: {e}"))?;
    let rows = stmt
        .query_map(params![limit], |row| {
            Ok(SessionSummary {
                id: row.get(0)?,
                target_url: row.get(1)?,
                started_at: row.get(2)?,
                ended_at: row.get(3)?,
                auth_type: row.get(4)?,
                confidence: row.get(5)?,
            })
        })
        .map_err(|e| format!("query list: {e}"))?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| format!("row: {e}"))?);
    }
    Ok(out)
}

#[tauri::command]
pub fn session_get(db: State<'_, SessionDb>, id: String) -> Result<Option<StoredSession>, String> {
    db.ensure()?;
    let guard = db.inner.lock();
    let conn = guard.as_ref().ok_or_else(|| "db not initialized".to_string())?;
    let result = conn.query_row(
        r#"SELECT id, target_url, started_at, ended_at, auth_type, confidence, flow_json
           FROM sessions WHERE id = ?1"#,
        params![id],
        |row| {
            Ok(StoredSession {
                id: row.get(0)?,
                target_url: row.get(1)?,
                started_at: row.get(2)?,
                ended_at: row.get(3)?,
                auth_type: row.get(4)?,
                confidence: row.get(5)?,
                flow_json: row.get(6)?,
            })
        },
    );
    match result {
        Ok(s) => Ok(Some(s)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(format!("get: {e}")),
    }
}

#[tauri::command]
pub fn session_delete(db: State<'_, SessionDb>, id: String) -> Result<(), String> {
    db.ensure()?;
    let guard = db.inner.lock();
    let conn = guard.as_ref().ok_or_else(|| "db not initialized".to_string())?;
    conn.execute("DELETE FROM sessions WHERE id = ?1", params![id])
        .map_err(|e| format!("delete: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn session_delete_all(db: State<'_, SessionDb>) -> Result<(), String> {
    db.ensure()?;
    let guard = db.inner.lock();
    let conn = guard.as_ref().ok_or_else(|| "db not initialized".to_string())?;
    conn.execute("DELETE FROM sessions", [])
        .map_err(|e| format!("delete all: {e}"))?;
    Ok(())
}
