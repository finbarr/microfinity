// npm run dev owns hot reload; npm start always serves the built application.
process.env.NODE_ENV = 'production';
await import('../dist/server/index.js');
