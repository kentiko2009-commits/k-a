const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/** Primary dev URL (TLS). Chrome “Always use secure connections” upgrades http→https on the same port. */
const port = Number(process.env.PORT) || 3000;
/** Plain HTTP fallback (e.g. curl, tools that don’t speak TLS). */
const httpFallbackPort = Number(process.env.HTTP_PORT) || 3001;
const root = __dirname;

const mime = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function handleRequest(req, res) {
  const pathname = req.url.split('?')[0];
  const relative =
    pathname === '/' || pathname === ''
      ? 'index.html'
      : pathname.replace(/^\/+/, '');
  const filePath = path.join(root, path.normalize(relative));

  const resolved = path.resolve(filePath);
  const rootResolved = path.resolve(root);
  if (resolved !== rootResolved && !resolved.startsWith(rootResolved + path.sep)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end('Not found: ' + pathname);
      return;
    }
    const ext = path.extname(filePath);
    const contentType = mime[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

function ensureDevCerts() {
  const certsDir = path.join(root, '.certs');
  const keyFile = path.join(certsDir, 'localhost-key.pem');
  const certFile = path.join(certsDir, 'localhost-cert.pem');
  if (!fs.existsSync(keyFile) || !fs.existsSync(certFile)) {
    fs.mkdirSync(certsDir, { recursive: true });
    execSync(
      `openssl req -x509 -newkey rsa:2048 -nodes -keyout "${keyFile}" -out "${certFile}" -days 825 -subj "/CN=localhost"`,
      { stdio: 'pipe' }
    );
  }
  return {
    key: fs.readFileSync(keyFile),
    cert: fs.readFileSync(certFile),
  };
}

function start() {
  try {
    const tls = ensureDevCerts();
    https.createServer(tls, handleRequest).listen(port, () => {
      console.log('');
      console.log('  Site (HTTPS — use this in the browser):');
      console.log('    https://localhost:' + port + '/');
      console.log('  (Accept the “Advanced” → proceed warning for the local certificate.)');
      console.log('');
    });
    http.createServer(handleRequest).listen(httpFallbackPort, () => {
      console.log('  HTTP fallback (no TLS):');
      console.log('    http://localhost:' + httpFallbackPort + '/');
      console.log('');
    });
  } catch (e) {
    console.warn('  Could not create dev TLS certs (need OpenSSL). Falling back to HTTP only.');
    console.warn('  ', e.message);
    console.log('');
    http.createServer(handleRequest).listen(port, () => {
      console.log('  HTTP:  http://localhost:' + port + '/');
      console.log('');
    });
  }
}

start();
