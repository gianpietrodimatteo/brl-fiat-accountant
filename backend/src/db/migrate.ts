import { openDatabase } from "./connection";
import { runMigrations } from "./migrationRunner";
import { migrations } from "./migrations";

function main(): void {
  const db = openDatabase();
  try {
    const applied = runMigrations(db, migrations);
    if (applied.length === 0) {
      console.log("No new migrations to apply.");
    } else {
      console.log(`Applied migrations: ${applied.join(", ")}`);
    }
  } finally {
    db.close();
  }
}

main();
