import type Database from "better-sqlite3";
import type { User } from "../domain/User";

interface UserRow {
  id: number;
  username: string;
  spread: number;
  created_at: string;
}

function toDomain(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    spreadBasisPoints: row.spread,
    createdAt: new Date(row.created_at),
  };
}

export class UserRepository {
  constructor(private readonly db: Database.Database) {}

  findById(id: number): User | null {
    const row = this.db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
    return row ? toDomain(row) : null;
  }

  findByUsername(username: string): User | null {
    const row = this.db.prepare("SELECT * FROM users WHERE username = ?").get(username) as
      UserRow | undefined;
    return row ? toDomain(row) : null;
  }

  listAll(): User[] {
    const rows = this.db.prepare("SELECT * FROM users").all() as UserRow[];
    return rows.map(toDomain);
  }

  /** Inserts a user, doing nothing if the username already exists. */
  insertIfNotExists(username: string, spreadBasisPoints: number): void {
    this.db
      .prepare("INSERT OR IGNORE INTO users (username, spread) VALUES (?, ?)")
      .run(username, spreadBasisPoints);
  }
}
