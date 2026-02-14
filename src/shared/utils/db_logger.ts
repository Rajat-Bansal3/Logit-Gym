import { appLogger } from "./logger";

export const databaseLogger = {
	log: (level: "log" | "info" | "warn" | "error", message: string) => {
		switch (level) {
			case "error":
				appLogger.error(`Prisma: ${message}`, { context: "prisma" });
				break;
			case "warn":
				appLogger.warn(`Prisma: ${message}`, { context: "prisma" });
				break;
			case "info":
				appLogger.info(`Prisma: ${message}`, { context: "prisma" });
				break;
			default:
				appLogger.debug(`Prisma: ${message}`, { context: "prisma" });
		}
	},

	query: (event: {
		timestamp: Date;
		query: string;
		params: string;
		duration: number;
		target: string;
	}) => {
		appLogger.database(`Query executed in ${event.duration}ms`, "query", event.duration);
	},

	info: (message: string) => {
		appLogger.info(`Prisma: ${message}`, { context: "prisma" });
	},

	warn: (message: string) => {
		appLogger.warn(`Prisma: ${message}`, { context: "prisma" });
	},

	error: (message: string) => {
		appLogger.error(`Prisma: ${message}`, { context: "prisma" });
	},
};
