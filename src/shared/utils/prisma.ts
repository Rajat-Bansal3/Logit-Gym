import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { env } from "../../env";
import { PrismaClient } from "../../generated/client";

const globalForPrisma = globalThis as unknown as {
	prisma?: PrismaClient;
};

const CON_STRING = env.DATABASE_URL;
const pool = new Pool({ connectionString: CON_STRING });
console.log(CON_STRING);

export const adapter = new PrismaPg(pool);
export const client =
	env.NODE_ENV === "production"
		? new PrismaClient({ adapter: adapter })
		: (globalForPrisma.prisma ?? new PrismaClient({ adapter: adapter }));

if (env.NODE_ENV !== "production") {
	globalForPrisma.prisma = client;
}
