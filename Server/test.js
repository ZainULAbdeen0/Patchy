const http = require('http');
const { init, stopSocketServer } = require('./src/index');

init({ port: 0, logToConsole: true });

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({
      ok: true,
      method: req.method,
      url: req.url,
      body: Buffer.concat(chunks).toString('utf8') || null,
    }));
  });
});

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

function makeHttpCall(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      res.resume();
      res.on('end', resolve);
    });
    req.on('error', reject);
  });
}

(async () => {
  const port = await listen(server);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    console.log('\n--- Making a local test fetch call ---');
    const fetchResponse = await fetch(`${baseUrl}/fetch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: 'fetch' }),
    });
    await fetchResponse.text();
    console.log('Fetch call complete');

    console.log('\n--- Making a local test http.get call ---');
    await makeHttpCall(`${baseUrl}/api/test`);
    console.log('HTTP call complete');
  } finally {
    await close(server);
    stopSocketServer();
  }
})().catch((err) => {
  stopSocketServer();
  console.error(err);
  process.exit(1);
});
