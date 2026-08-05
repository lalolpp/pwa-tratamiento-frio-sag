const { app, BrowserWindow } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 37462;
const ROOT = path.join(__dirname, '..', 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pdf': 'application/pdf',
  '.csv': 'text/csv; charset=utf-8',
  '.wasm': 'application/wasm',
};

function createServer() {
  return http.createServer((req, res) => {
    let urlPath;
    try {
      urlPath = decodeURIComponent(req.url.split('?')[0]);
    } catch {
      res.writeHead(400);
      return res.end('Bad request');
    }
    if (urlPath === '/') urlPath = '/index.html';

    const filePath = path.normalize(path.join(ROOT, urlPath));
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }

    fs.stat(filePath, (statErr, st) => {
      if (!statErr && st.isDirectory()) {
        return serveFile(path.join(filePath, 'index.html'), res);
      }
      serveFile(filePath, res);
    });
  });
}

function serveFile(filePath, res) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not found');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

app.whenReady().then(() => {
  const server = createServer();

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`El puerto ${PORT} está en uso. Cierra otras instancias y vuelve a abrir.`);
    }
    app.exit(1);
  });

  server.listen(PORT, '127.0.0.1', () => {
    const win = new BrowserWindow({
      width: 1280,
      height: 800,
      minWidth: 360,
      minHeight: 600,
      autoHideMenuBar: true,
      icon: path.join(__dirname, '..', 'dist', 'tratamiento-frio.ico'),
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    win.setMenuBarVisibility(false);
    win.loadURL(`http://127.0.0.1:${PORT}/`);

    win.on('closed', () => {
      server.close();
      app.quit();
    });
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
