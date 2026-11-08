const winston = require("winston");
require("winston-daily-rotate-file");

const level = process.env.LOG_LEVEL || "info";

const format = winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
);

const fileTransport = new winston.transports.DailyRotateFile({
    filename: "logs/tkd-shop-%DATE%.log",
    datePattern: "YYYY-MM-DD",
    maxSize: "10m",
    maxFiles: "7d"
});

const logger = winston.createLogger({
    level,
    format,
    transports: [
        fileTransport,
        new winston.transports.Console()
    ]
});

module.exports = logger;