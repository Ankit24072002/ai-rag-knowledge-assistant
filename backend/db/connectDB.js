import mongoose from 'mongoose';

export async function connectDB() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ai-rag-assistant';

  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 3000,
    });
    console.log('MongoDB connected');
  } catch (error) {
    console.warn('MongoDB connection failed, continuing in degraded mode:', error.message);
  }
}
