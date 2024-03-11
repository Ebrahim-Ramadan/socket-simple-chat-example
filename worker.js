import { Server } from 'socket.io';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

const __dirname = dirname(fileURLToPath(import.meta.url));
const port = workerData.port;
const databasePath = workerData.databasePath;

const io = new Server(port);

const clients = new Map();

(async () => {
  const db = await open({
    filename: databasePath,
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_offset TEXT UNIQUE,
      content TEXT
    );
  `);

  io.on('connection', async(socket) => {
    clients.set(socket.id, socket);

    socket.on('disconnect', () => {
      clients.delete(socket.id);
    });

    socket.on('chat message', async (msg, clientOffset, callback) => {
      let result;
      try {
        result = await db.run('INSERT INTO messages (content, client_offset) VALUES (?, ?)', msg, clientOffset);
      } catch (e) {
        if (e.errno === 19 /* SQLITE_CONSTRAINT */) {
          callback();
        } else {
          // nothing to do, just let the client retry
        }
        return;
      }
      io.emit('chat message', msg, result.lastID);
      callback();
    });

    if (!socket.recovered) {
      try {
        await db.each('SELECT id, content FROM messages WHERE id > ?',
          [socket.handshake.auth.serverOffset || 0],
          (_err, row) => {
            socket.emit('chat message', row.content, row.id);
          }
        )
      } catch (e) {
        // something went wrong
      }
    }
  });

  parentPort.on('message', (message) => {
    const { event, data } = message;

    switch (event) {
      case 'connection':
        const socket = io.connectSocket(data);
        clients.set(data, socket);
        break;
      case 'disconnect':
        const disconnectedSocket = clients.get(data);
        disconnectedSocket.disconnect();
        clients.delete(data);
        break;
      case 'chat message':
        const { msg, clientOffset, callback, socketId } = data;
        const clientSocket = clients.get(socketId);
        clientSocket.emit('chat message', msg, clientOffset, callback);
        break;
    }
  });
})();