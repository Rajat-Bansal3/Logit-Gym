import fs from "node:fs";
import path from "node:path";
import type { Request } from "express";
import winston from "winston";

const levels = {
	error: 0,
	warn: 1,
	info: 2,
	http: 3,
	debug: 4,
};

const colors = {
	error: "red",
	warn: "yellow",
	info: "green",
	http: "magenta",
	debug: "white",
};

winston.addColors(colors);

const ensureLogsDirectory = () => {
	const logsDir = path.join(process.cwd(), "logs");
	appLogger.warn(logsDir);
	if (!fs.existsSync(logsDir)) {
		console.log("xyzkajdnjland\n\n\nn\n\n\\nalkndjnf\n\n\n\n\n\n");
		fs.mkdirSync(logsDir, { recursive: true });
	}
};

export class AppLogger {
	private logger: winston.Logger;

	constructor() {
		const isDev = process.env.NODE_ENV !== "production";

		if (!isDev) {
			ensureLogsDirectory();
		}

		const baseFormat = winston.format.combine(
			winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss:ms" }),
			winston.format.errors({ stack: true }),
		);

		const devFormat = winston.format.combine(
			baseFormat,
			winston.format.colorize({ all: true }),
			winston.format.printf((info) => {
				const { timestamp, level, message, stack, ...meta } = info;

				let log = `${timestamp} ${level}: ${message}`;

				if (stack) {
					log += `\n${stack}`;
				}

				const metaString = this.formatMeta(meta);
				if (metaString) {
					log += `\n${metaString}`;
				}

				return log;
			}),
		);

		const prodFormat = winston.format.combine(baseFormat, winston.format.json());

		this.logger = winston.createLogger({
			level: isDev ? "debug" : "warn",
			levels,
			defaultMeta: { service: "Logit" },
			format: isDev ? devFormat : prodFormat,
			transports: this.getTransports(),
			silent: process.env.NODE_ENV === "test",
		});
	}

	private formatMeta(meta: any): string {
		const filteredMeta = Object.keys(meta)
			.filter((key) => !["timestamp", "level", "message", "stack"].includes(key))
			.reduce((obj, key) => {
				if (meta[key] !== undefined && meta[key] !== null) {
					if (typeof meta[key] === "object" && Object.keys(meta[key]).length > 0) {
						obj[key] = meta[key];
					} else if (typeof meta[key] !== "object") {
						obj[key] = meta[key];
					}
				}
				return obj;
			}, {} as any);

		if (Object.keys(filteredMeta).length === 0) {
			return "";
		}

		return `Meta: ${JSON.stringify(filteredMeta, null, 2)}`;
	}

	private getTransports() {
		const transports: winston.transport[] = [new winston.transports.Console()];

		if (process.env.NODE_ENV === "production") {
			transports.push(
				new winston.transports.File({
					filename: "logs/error.log",
					level: "error",
					handleExceptions: true,
				}),
				new winston.transports.File({
					filename: "logs/combined.log",
					handleExceptions: true,
				}),
			);
		}

		return transports;
	}

	// Fixed logging methods - properly pass metadata
	public error(message: string, meta?: any) {
		this.logger.error(message, meta);
	}

	public warn(message: string, meta?: any) {
		this.logger.warn(message, meta);
	}

	public info(message: string, meta?: any) {
		this.logger.info(message, meta);
	}

	public http(message: string, meta?: any) {
		this.logger.http(message, meta);
	}

	public debug(message: string, meta?: any) {
		this.logger.debug(message, meta);
	}

	public withRequest(req: Request) {
		const requestId = (req as any).id || "unknown";
		const userId = (req as any).user?.id || "anonymous";

		return {
			error: (message: string, meta?: any) => this.error(message, { ...meta, requestId, userId }),
			warn: (message: string, meta?: any) => this.warn(message, { ...meta, requestId, userId }),
			info: (message: string, meta?: any) => this.info(message, { ...meta, requestId, userId }),
			http: (message: string, meta?: any) => this.http(message, { ...meta, requestId, userId }),
			debug: (message: string, meta?: any) => this.debug(message, { ...meta, requestId, userId }),
		};
	}

	public database(message: string, operation?: string, duration?: number) {
		this.debug(message, {
			context: "database",
			operation,
			duration,
		});
	}

	public externalApi(message: string, service?: string, url?: string) {
		this.info(message, {
			context: "external-api",
			service,
			url,
		});
	}
}

export const appLogger = new AppLogger();

export const stream = {
	write: (message: string) => appLogger.http(message.trim()),
};
