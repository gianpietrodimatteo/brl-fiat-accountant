import type { Migration } from "../migrationRunner";
import { migration0001Init } from "./0001_init";
import { migration0002Sessions } from "./0002_sessions";

export const migrations: Migration[] = [migration0001Init, migration0002Sessions];
