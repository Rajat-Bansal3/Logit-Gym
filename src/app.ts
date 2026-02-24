import cors from "cors";
import express from "express";
import helmet from "helmet";
import { errorHandler } from "./api/middleware/error.middleware";
import { httpLogger, requestIdMiddleware, requestLogger } from "./api/middleware/logger.middleware";
import { notFoundHandler } from "./api/middleware/not-found.middleware";
import { env } from "./env";
import { appLogger } from "./shared/utils/logger";

export const createApp = () => {
	const app = express();

	app.use(helmet());
	app.use(
		cors({
			origin: true,
			credentials: true,
		}),
	);

	app.use(express.json({ limit: "10mb" }));
	app.use(express.urlencoded({ extended: true, limit: "2mb", parameterLimit: 5000 }));

	app.use(requestIdMiddleware);
	app.use(httpLogger);
	app.use(requestLogger);

	app.get("/api/v1/health", (req, res) => {
		const logger = appLogger.withRequest(req);
		logger.info("Health check endpoint hit");

		res.status(200).json({
			status: "OK",
			timestamp: new Date().toISOString(),
			uptime: process.uptime(),
			environment: env.NODE_ENV || "development",
		});
	});
	app.use("/api/v1/auth", require("./api/routes/v1/auth.routes").default);
	app.use("/api/v1/gym", require("./api/routes/v1/gym.routes").default);
	//   app.use("/api/v1/member", require("./api/routes/v1/member.routes").default);

	app.use(notFoundHandler);
	app.use(errorHandler);

	return app;
};
