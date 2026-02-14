import { config } from "dotenv";
import { z } from "zod";
import { appLogger } from "./shared/utils/logger";

config();

const envSchema = z.object({
	PORT: z.coerce.number(),
	DATABASE_URL: z.coerce.string(),
	JWT_ACCESS_SECRET: z.string().nonempty(),
	JWT_REFRESH_SECRET: z.string().nonempty(),
	SALT: z.coerce.number().default(10),
});
const data = envSchema.safeParse(process.env);

if (!data.success) {
	appLogger.error("env vars not set");
	process.exit(1);
}

export default data.data;
