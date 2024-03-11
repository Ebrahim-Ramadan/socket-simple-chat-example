import express from 'express';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Server } from 'socket.io';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { Worker } from 'node:worker_threads';
import { join as pathJoin } from 'node:path';

const numThreads = require('node:os').cpus().length;

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const server = createServer(app);
const io = new Server(server);

app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'index.html'));
});

const workers = [];

for (let i = 0; i < numThreads; i++) {
  const worker = new Worker(pathJoin(__dirname, 'worker.js'), {
    workerData: {
      port: 3000 + i,
      databasePath: 'chat.db'
    }
  });
  workers.push(worker);
}

io.on('connection', (socket) => {
  const worker = workers[Math.floor(Math.random() * workers.length)];
  worker.postMessage({ event: 'connection', data: socket.id });

  socket.on('disconnect', () => {
    worker.postMessage({ event: 'disconnect', data: socket.id });
  });

  socket.on('chat message', (msg, clientOffset, callback) => {
    worker.postMessage({ event: 'chat message', data: { msg, clientOffset, callback, socketId: socket.id } });
  });
});

server.listen(3000, () => {
  console.log(`server running at http://localhost:3000`);
});