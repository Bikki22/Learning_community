import winston from "winston";
import path from "node:path";

const { combine, timestamp, printf, colorize, json } = winston.format;

const isProduction = process.env.NODE_ENV === "production";

// Console / file log format for development
const devFormat = combine(
  colorize(),
  timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  printf(({ level, message, timestamp, ...meta }) => {
    const metaStr = Object.keys(meta).length
      ? ` ${JSON.stringify(meta)}`
      : "";
    return `${timestamp} [${level}] ${message}${metaStr}`;
  }),
);

// JSON log format for production
const prodFormat = combine(timestamp(), json());

const logDir = path.join(process.cwd(), "logs");

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (isProduction ? "info" : "debug"),
  format: isProduction ? prodFormat : devFormat,
  transports: [
    // Write all logs to console
    new winston.transports.Console(),
    // Write all error-level logs to error.log
    new winston.transports.File({
      filename: path.join(logDir, "error.log"),
      level: "error",
      maxsize: 10_000_000, // 10 MB
      maxFiles: 5,
    }),
    // Write all logs (info and above) to combined.log
    new winston.transports.File({
      filename: path.join(logDir, "combined.log"),
      maxsize: 10_000_000,
      maxFiles: 5,
    }),
  ],
  exitOnError: false,
});

// Stream for Morgan-style HTTP request logging if needed
export const httpLogStream = {
  write: (message: string) => {
    logger.http(message.trim());
  },
};

export default logger;