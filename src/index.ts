import { createApp } from "./app";
import env from "./env";
import { AuthenticatedUser } from "./shared/types/auth.types";
import { appLogger } from "./shared/utils/logger";

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

const app = createApp();

const server = app.listen(env.PORT, () => {
  appLogger.info(`Server running on port ${env.PORT}`, {
    environment: process.env.NODE_ENV || "development",
    port: env.PORT,
  });
});

const gracefulShutdown = (signal: string) => {
  appLogger.info(`Received ${signal}, starting graceful shutdown...`);

  server.close(() => {
    appLogger.info("HTTP server closed.");
    process.exit(0);
  });

  setTimeout(() => {
    appLogger.error(
      "Could not close connections in time, forcefully shutting down",
    );
    process.exit(1);
  }, 10_000);
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
