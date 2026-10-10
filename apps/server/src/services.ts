import { createAuth } from "@onfloor/auth";
import { createDb } from "@onfloor/db";

import { ENV } from "./env.server";

export const db = createDb(ENV);
export const auth = createAuth(ENV, db);
