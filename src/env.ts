import { config } from "dotenv";

config();

import { z } from "zod";

const envSchema = z.object({
	PORT: z.coerce.number(),
	DATABASE_URL: z.coerce.string(),
	JWT_ACCESS_SECRET: z.string().nonempty(),
	JWT_REFRESH_SECRET: z.string().nonempty(),
	SALT: z.coerce.number().default(10),
	NODE_ENV: z.enum(["development", "testing", "production"]).default("development"),
});
const data = envSchema.safeParse(process.env);
if (!data.success) {
	process.exit(1);
}

export const env = data.data;
