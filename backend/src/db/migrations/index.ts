import type { Migration } from "../migrationRunner";
import { migration0001Init } from "./0001_init";

export const migrations: Migration[] = [migration0001Init];
