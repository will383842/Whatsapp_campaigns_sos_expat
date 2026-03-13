import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';
const level = process.env.LOG_LEVEL || 'info';

const transport = isDev
  ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    }
  : undefined;

const logger = pino(
  {
    level,
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level(label) {
        return { level: label };
      },
    },
  },
  transport ? pino.transport(transport) : undefined,
);

export default logger;
