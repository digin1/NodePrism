// Jest setup file for global test configuration

// Set test environment variables
(process.env as Record<string, string>).NODE_ENV = 'test';
(process.env as Record<string, string>).DATABASE_URL = 'postgresql://nodeprism:${DB_PASSWORD}@localhost:5432/nodeprism_test';
(process.env as Record<string, string>).RABBITMQ_URL = 'amqp://nodeprism:${DB_PASSWORD}@localhost:5672';
(process.env as Record<string, string>).REDIS_URL = 'redis://localhost:6379';

// Global timeout for async operations
jest.setTimeout(30000);

// Clean up after all tests
afterAll(async () => {
  // Add any global cleanup here
});
