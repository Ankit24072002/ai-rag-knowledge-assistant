import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import morgan from 'morgan';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';

import { connectDB } from './db/connectDB.js';
import documentRoutes from './routes/documentRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import { hydrateDocumentStore } from './services/ragService.js';

dotenv.config();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const preferredPort = Number(process.env.PORT) || 5000;

async function getAvailablePort(startPort) {
  for (let port = startPort; port < startPort + 20; port += 1) {
    const isAvailable = await new Promise((resolve) => {
      const probe = http.createServer();

      probe.once('error', () => resolve(false));
      probe.once('listening', () => {
        probe.close(() => resolve(true));
      });

      probe.listen(port);
    });

    if (isAvailable) return port;
  }

  return startPort;
}

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'AI RAG Assistant backend is running',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/documents', documentRoutes);
app.use('/api/chat', chatRoutes);

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

async function startServer() {
  await connectDB();
  await hydrateDocumentStore();

  const PORT = await getAvailablePort(preferredPort);
  process.env.PORT = String(PORT);

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
