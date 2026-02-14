import type { NextFunction, Request, Response } from "express";
import morgan from "morgan";
import { v4 as uuidv4 } from "uuid";
import { appLogger } from "../../shared/utils/logger";

export const requestIdMiddleware = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  (req as any).id = uuidv4();
  next();
};

export const httpLogger = morgan(
  ":method :url :status :res[content-length] - :response-time ms",
  {
    stream: {
      write: (message: string) => appLogger.http(message.trim()),
    },
  },
);

export const requestLogger = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const requestLogger = appLogger.withRequest(req);

  requestLogger.http(`Incoming request: ${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get("User-Agent"),
    query: req.query,
    body: req.method !== "GET" ? req.body : undefined,
  });

  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    requestLogger.http(`Request completed: ${req.method} ${req.path}`, {
      statusCode: res.statusCode,
      duration,
    });
  });

  next();
};
