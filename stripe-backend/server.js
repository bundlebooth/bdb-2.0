const app = require('./app');
const config = require('./config/config');

const server = app.listen(config.server.port, () => {
  console.log(`Server running in ${config.server.environment} mode on port ${config.server.port}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error(`Error: ${err.message}`);
  server.close(() => process.exit(1));
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error(`Error: ${err.message}`);
  server.close(() => process.exit(1));
});
