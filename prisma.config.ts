import { defineConfig } from "prisma/config";
import * as dotenv from "dotenv";

dotenv.config();

export default defineConfig({
  datasource: {
    url: process.env.DATABASE_URL,
  },
  migrate: {
    connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  },
});
