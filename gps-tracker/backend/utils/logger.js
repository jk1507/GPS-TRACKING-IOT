/* Tiny dependency-free logger (keeps the request/status logs consistent). */

function stamp() {
  return new Date().toISOString();
}

function write(stream, level, args) {
  stream(`[${stamp()}] [${level}]`, ...args);
}

export const logger = {
  info: (...args) => write(console.log, 'INFO', args),
  warn: (...args) => write(console.warn, 'WARN', args),
  error: (...args) => write(console.error, 'ERROR', args),
  debug: (...args) => {
    if (process.env.NODE_ENV !== 'production') write(console.log, 'DEBUG', args);
  },
};

export default logger;
