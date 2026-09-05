/**
 * PrivateSignal — Query History SQLite Storage
 *
 * ============================================================================
 * PRIVACY CONTRACT:
 * Stores ONLY sanitized public query metadata for demo audit logs:
 * - queryId, timestamp, walletAddress, score, recommendation, protocols, donId
 *
 * ABSOLUTELY NEVER stores:
 * - Model weights, private thresholds, intermediate features, or policy formulas.
 * ============================================================================
 */

import { Database } from 'bun:sqlite'
import path from 'path'

export interface QueryRecord {
  queryId: string
  timestamp: number
  walletAddress: string
  score: number
  recommendation: string
  protocols: string
  donId: string
}

let dbInstance: Database | null = null

export function getDatabase(): Database {
  if (!dbInstance) {
    const dbPath = process.env.SQLITE_DB_PATH || ':memory:'
    dbInstance = new Database(dbPath)
    dbInstance.run(`
      CREATE TABLE IF NOT EXISTS queries (
        queryId TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        walletAddress TEXT NOT NULL,
        score REAL NOT NULL,
        recommendation TEXT NOT NULL,
        protocols TEXT NOT NULL,
        donId TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_queries_timestamp ON queries(timestamp DESC);
    `)
  }
  return dbInstance
}

export function saveQueryMetadata(record: QueryRecord): void {
  const db = getDatabase()
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO queries (queryId, timestamp, walletAddress, score, recommendation, protocols, donId)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  stmt.run(
    record.queryId,
    record.timestamp,
    record.walletAddress.toLowerCase(),
    record.score,
    record.recommendation,
    record.protocols,
    record.donId,
  )
}

export function getRecentQueries(limit = 20): QueryRecord[] {
  const db = getDatabase()
  const stmt = db.prepare(`
    SELECT queryId, timestamp, walletAddress, score, recommendation, protocols, donId
    FROM queries
    ORDER BY timestamp DESC
    LIMIT ?
  `)
  return stmt.all(limit) as QueryRecord[]
}

export function getQueryById(queryId: string): QueryRecord | null {
  const db = getDatabase()
  const stmt = db.prepare(`
    SELECT queryId, timestamp, walletAddress, score, recommendation, protocols, donId
    FROM queries
    WHERE queryId = ?
    LIMIT 1
  `)
  const result = stmt.get(queryId)
  return (result as QueryRecord) || null
}
