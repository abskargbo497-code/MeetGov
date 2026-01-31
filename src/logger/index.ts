import winston from 'winston';

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

const level = () => {
  const env = process.env.NODE_ENV || 'development';
  const isDevelopment = env === 'development';
  return isDevelopment ? 'debug' : 'warn';
};

const env = process.env.NODE_ENV || 'development';
const isDevelopment = env === 'development';

const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json(),
);

const consoleFormat = isDevelopment
  ? winston.format.combine(
      winston.format.colorize({ all: true }),
      winston.format.timestamp({ format: 'HH:mm:ss' }),
      winston.format.errors({ stack: true }),
      winston.format.splat(),
      winston.format.printf((info) => {
        const { timestamp, level, message, stack, ...meta } = info as any;
        const metaKeys = meta && typeof meta === 'object' ? Object.keys(meta) : [];
        const metaString = metaKeys.length ? ` ${JSON.stringify(meta)}` : '';
        const stackString = stack ? `\n${stack}` : '';
        return `${timestamp} ${level}: ${message}${metaString}${stackString}`;
      }),
    )
  : jsonFormat;

const transports = [
  new winston.transports.Console({
    format: consoleFormat,
  }),
  new winston.transports.File({
    filename: 'logs/error.log',
    level: 'error',
    format: jsonFormat,
  }),
  new winston.transports.File({
    filename: 'logs/all.log',
    format: jsonFormat,
  }),
];

const Logger = winston.createLogger({
  level: level(),
  levels,
  format: jsonFormat,
  transports,
  defaultMeta: {
    service: 'govmeet-api',
  },
});

export default Logger;
