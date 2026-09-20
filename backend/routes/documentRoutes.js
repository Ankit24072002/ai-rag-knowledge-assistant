import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import Document from '../models/Document.js';
import { extractTextFromFile, processDocument } from '../services/documentService.js';
import { addDocumentToStore, createEmbeddingsForDocument } from '../services/ragService.js';
import { authMiddleware, adminOnly } from '../middleware/authMiddleware.js';

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

router.get('/', authMiddleware, async (req, res) => {
  try {
    const userScope = req.user.role === 'admin' ? {} : { userId: req.user._id };
    const documents = await Document.find(userScope).sort({ createdAt: -1 }).lean();
    res.status(200).json({ documents });
  } catch (error) {
    console.error('Document list error:', error);
    res.status(500).json({ message: 'Unable to load documents' });
  }
});

router.get('/analytics', authMiddleware, adminOnly, async (req, res) => {
  try {
    const totalDocuments = await Document.countDocuments();
    const totalStorage = await Document.aggregate([
      { $group: { _id: null, totalSize: { $sum: '$fileSize' }, totalChunks: { $sum: '$chunkCount' } } },
    ]);
    const byUser = await Document.aggregate([
      { $group: { _id: '$userId', count: { $sum: 1 }, size: { $sum: '$fileSize' } } },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      { $project: { userName: '$user.name', count: 1, size: 1 } },
    ]);

    res.status(200).json({
      totalDocuments,
      totalStorage: totalStorage[0]?.totalSize || 0,
      totalChunks: totalStorage[0]?.totalChunks || 0,
      byUser,
    });
  } catch (error) {
    console.error('Document analytics error:', error);
    res.status(500).json({ message: 'Unable to load analytics', error: error.message });
  }
});

router.delete('/', authMiddleware, async (req, res) => {
  try {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ message: 'At least one document id is required' });
    }

    const scope = req.user.role === 'admin' ? {} : { userId: req.user._id };
    const documents = await Document.find({ _id: { $in: ids }, ...scope }).lean();
    const deletedDocs = await Document.deleteMany({ _id: { $in: ids }, ...scope });

    for (const document of documents) {
      const { removeDocumentFromStore } = await import('../services/ragService.js');
      const { deleteDocumentChunks } = await import('../services/vectorService.js');

      removeDocumentFromStore(document.originalName);
      await deleteDocumentChunks(document.originalName);
    }

    res.status(200).json({
      message: `${deletedDocs.deletedCount} document(s) deleted successfully`,
      deletedCount: deletedDocs.deletedCount,
    });
  } catch (error) {
    console.error('Delete documents error:', error);
    res.status(500).json({ message: 'Unable to delete documents', error: error.message });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const scope = req.user.role === 'admin' ? {} : { userId: req.user._id };
    const document = await Document.findOne({ _id: req.params.id, ...scope });
    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    await Document.deleteOne({ _id: req.params.id, ...scope });
    const { removeDocumentFromStore } = await import('../services/ragService.js');
    const { deleteDocumentChunks } = await import('../services/vectorService.js');

    removeDocumentFromStore(document.originalName);
    await deleteDocumentChunks(document.originalName);

    res.status(200).json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({ message: 'Unable to delete document', error: error.message });
  }
});

router.post('/upload', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const extractedText = await extractTextFromFile(req.file.path);
    const result = await processDocument(req.file.originalname, extractedText);
    const chunksWithEmbeddings = await createEmbeddingsForDocument(req.file.originalname, result.chunks);
    addDocumentToStore(req.file.originalname, chunksWithEmbeddings);

    const document = await Document.findOneAndUpdate(
      { originalName: req.file.originalname, userId: req.user._id },
      {
        userId: req.user._id,
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
      document,
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
