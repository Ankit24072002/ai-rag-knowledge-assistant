import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import Document from '../models/Document.js';
import { extractTextFromFile, processDocument } from '../services/documentService.js';
import { addDocumentToStore, createEmbeddingsForDocument } from '../services/ragService.js';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadDir = path.join(__dirname, '..', 'uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/\s+/g, '_');
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const upload = multer({ storage });

router.get('/', async (req, res) => {
  try {
    const documents = await Document.find().sort({ createdAt: -1 }).lean();
    res.status(200).json({ documents });
  } catch (error) {
    console.error('Document list error:', error);
    res.status(500).json({ message: 'Unable to load documents' });
  }
});

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const extractedText = await extractTextFromFile(req.file.path);
    const result = await processDocument(req.file.originalname, extractedText);
    const chunksWithEmbeddings = await createEmbeddingsForDocument(req.file.originalname, result.chunks);
    addDocumentToStore(req.file.originalname, chunksWithEmbeddings);

    await Document.findOneAndUpdate(
      { originalName: req.file.originalname },
      {
        fileName: req.file.filename,
        originalName: req.file.originalname,
        fileSize: req.file.size,
        chunks: chunksWithEmbeddings,
        chunkCount: result.chunkCount,
        totalCharacters: result.totalCharacters,
        status: 'processed',
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );

    res.status(200).json({
      message: 'Document processed successfully',
      file: {
        originalName: req.file.originalname,
        savedName: req.file.filename,
        path: req.file.path,
      },
      stats: result,
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      message: 'Error processing document',
      error: error.message,
    });
  }
});

export default router;
