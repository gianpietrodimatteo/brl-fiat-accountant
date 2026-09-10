import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { Session } from "../domain/Session";

interface SessionRow {
  id: number;
  token: string;
  user_id: number;
  created_at: string;
}

function toDomain(row: SessionRow): Session {
  return {
    id: row.id,
    token: row.token,
    userId: row.user_id,
    createdAt: new Date(row.created_at),
  };
}

export class SessionRepository {
  constructor(private readonly db: Database.Database) {}

  create(userId: number): Session {
    const token = randomUUID();
    const info = this.db
      .prepare("INSERT INTO sessions (token, user_id) VALUES (?, ?)")
      .run(token, userId);

    const session = this.findById(Number(info.lastInsertRowid));
    if (!session) {
      throw new Error("Failed to read back newly created session");
    }
    return session;
  }

  findById(id: number): Session | null {
    const row = this.db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as
      SessionRow | undefined;
    return row ? toDomain(row) : null;
  }

  findByToken(token: string): Session | null {
    const row = this.db.prepare("SELECT * FROM sessions WHERE token = ?").get(token) as
      SessionRow | undefined;
    return row ? toDomain(row) : null;
  }
}
