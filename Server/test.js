const { init } = require('./src/index');

init({ port: 9119, logToConsole: true });

setTimeout(async () => {
  console.log('\n--- Making a test fetch call ---');
  try {
    await fetch('https://jsonplaceholder.typicode.com/todos/1');
    console.log('Fetch call made — check WebSocket broadcast above');
  } catch (e) {
    console.log('Fetch error (expected if no network):', e.message);
  }

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
