import { openDatabase } from "./db/connection";
import { seedDatabase } from "./seedData";

function main(): void {
  const db = openDatabase();
  try {
    seedDatabase(db);
    console.log("Seed complete.");
  } finally {
    db.close();
  }
}

main();
