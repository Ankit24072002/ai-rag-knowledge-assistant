import mongoose from 'mongoose';

const documentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    fileName: { type: String, required: true },
    originalName: { type: String, required: true },
    fileSize: { type: Number, default: 0 },
    chunks: { type: [mongoose.Schema.Types.Mixed], default: [] },
    uploadedAt: { type: Date, default: Date.now },
    chunkCount: { type: Number, default: 0 },
    totalCharacters: { type: Number, default: 0 },
    status: { type: String, default: 'processed' },
  },
  { timestamps: true }
);

export default mongoose.models.Document || mongoose.model('Document', documentSchema);
