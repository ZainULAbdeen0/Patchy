// Quick test to verify patching works
const { init } = require('./src/index');

// Init the inspector
init({ port: 9119, logToConsole: true });

// Simulate a server-side fetch call (like Next.js would do)
setTimeout(async () => {
  console.log('\n--- Making a test fetch call ---');
  try {
    await fetch('https://jsonplaceholder.typicode.com/todos/1');
    console.log('Fetch call made — check WebSocket broadcast above');
  } catch (e) {
    console.log('Fetch error (expected if no network):', e.message);
  }

  // Simulate an http call
  console.log('\n--- Making a test http call ---');
  const http = require('http');
  const req = http.request('http://example.com/api/test', (res) => {
    res.on('data', () => {});
    res.on('end', () => {
      console.log('HTTP call complete');
      process.exit(0);
    });
  });
  req.end();
}, 500);
