import { sqlite } from "./db";

export interface SearchResult {
  messageId: string;
  sessionId: string;
  snippet: string;
  rank: number;
}

export function searchMessages(query: string, limit = 20): SearchResult[] {
  const stmt = sqlite.prepare(`
    SELECT
      m.id as messageId,
      m.session_id as sessionId,
      snippet(messages_fts, 0, '<mark>', '</mark>', '...', 20) as snippet,
      messages_fts.rank
    FROM messages_fts
    JOIN messages m ON m.rowid = messages_fts.rowid
    WHERE messages_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `);
  return stmt.all(query, limit) as SearchResult[];
}
