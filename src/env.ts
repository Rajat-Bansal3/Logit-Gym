import { config } from "dotenv";

config();

import { z } from "zod";

const envSchema = z.object({
	PORT: z.coerce.number(),
	MACHINE_SERVER: z.coerce.string(),
	MACHINE_SERVER_API_KEY: z.coerce.string(),
	DATABASE_URL: z.coerce.string(),
	JWT_ACCESS_SECRET: z.string().nonempty(),
	JWT_REFRESH_SECRET: z.string().nonempty(),
	SALT: z.coerce.number().default(10),
	AWS_S3_BUCKET: z.coerce.string().min(5).max(50),
	AWS_REGION: z.coerce.string().min(5).max(50),
	RAZORPAY_KEY_ID: z.coerce.string(),
	RAZORPAY_KEY_SECRET: z.coerce.string(),
	RAZORPAY_WEBHOOK_SECRET: z.coerce.string(),
	NODE_ENV: z.enum(["development", "testing", "production"]).default("development"),
	PLANS_API_KEY: z.string().min(1),
});
const data = envSchema.safeParse(process.env);
if (!data.success) {
	process.exit(1);
}

export const env = data.data;
