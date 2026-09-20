import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { upsertChunks } from './vectorService.js';
import { extractTextFromFile, processDocument } from './documentService.js';

dotenv.config();

const ollamaUrl = (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, '');
const embeddingModel = process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text';
const chatModel = process.env.OLLAMA_CHAT_MODEL || 'llama3.2';
const visionModel = process.env.OLLAMA_VISION_MODEL || 'llava';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const documentStore = new Map();

export async function hydrateDocumentStore() {
  const { default: Document } = await import('../models/Document.js');
  const documents = await Document.find().sort({ createdAt: 1 });

  documents.forEach((document) => {
    if (Array.isArray(document.chunks) && document.chunks.length) {
      documentStore.set(document.originalName, document.chunks);
    }
  });

  for (const document of documents) {
    if (documentStore.has(document.originalName) || !document.fileName) continue;

    const filePath = path.join(__dirname, '..', 'uploads', document.fileName);
    if (!fs.existsSync(filePath)) continue;

    try {
      const extractedText = await extractTextFromFile(filePath);
      const result = await processDocument(document.originalName, extractedText);
      const chunksWithEmbeddings = await createEmbeddingsForDocument(document.originalName, result.chunks);

      document.chunks = chunksWithEmbeddings;
      document.chunkCount = result.chunkCount;
      document.totalCharacters = result.totalCharacters;
      await document.save();
      documentStore.set(document.originalName, chunksWithEmbeddings);
      console.log(`Rebuilt index for ${document.originalName}.`);
    } catch (error) {
      console.warn(`Unable to rebuild index for ${document.originalName}:`, error.message);
    }
  }

  console.log(`Loaded ${documentStore.size} document libraries into memory.`);
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i += 1) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function embedText(text) {
  try {
    const response = await fetch(`${ollamaUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: embeddingModel, prompt: text }),
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const data = await response.json();
    return data.embedding;
  } catch (error) {
    console.warn('Ollama embedding failed:', error.message);
    return null;
  }
}

export function addDocumentToStore(documentName, chunks) {
  documentStore.set(documentName, chunks);
}

export function removeDocumentFromStore(documentName) {
  documentStore.delete(documentName);
}

export async function createEmbeddingsForDocument(documentName, chunks) {
  const preparedChunks = [];

  for (const chunk of chunks) {
    const embedding = await embedText(chunk.text);
    preparedChunks.push({
      ...chunk,
      embedding,
      metadata: {
        ...(chunk.metadata || {}),
        documentName,
      },
    });
  }

  await upsertChunks(preparedChunks);

  return preparedChunks;
}

export async function retrieveRelevantChunks(question, limit = 5) {
  const allChunks = Array.from(documentStore.values()).flat();

  if (!allChunks.length) {
    return [];
  }

  const questionEmbedding = await embedText(question);
  if (!questionEmbedding) {
    return allChunks.slice(0, limit).map((chunk) => ({
      ...chunk,
      similarity: 0.0,
    }));
  }

  try {
    const { searchRelevantChunks } = await import('./vectorService.js');
    const vectorMatches = await searchRelevantChunks(questionEmbedding, limit);

    if (vectorMatches.length) {
      return vectorMatches.map((match) => ({
        id: match.id,
        text: match.payload?.text || '',
        metadata: {
          documentName: match.payload?.documentName || 'unknown',
          page: match.payload?.page || 1,
        },
        similarity: Number(match.score ?? 0),
      }));
    }
  } catch (error) {
    console.warn('Vector search unavailable, using local similarity fallback:', error.message);
  }

  const scoredChunks = allChunks.map((chunk) => {
    const chunkEmbedding = chunk.embedding || Array(questionEmbedding.length).fill(0);
    const similarity = cosineSimilarity(questionEmbedding, chunkEmbedding);

    return {
      ...chunk,
      similarity,
    };
  });

  return scoredChunks
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

export async function answerQuestion(question, image) {
  const hasImage = Boolean(image);

  try {
    const listQuestion = /\b(all|every|each|list|extract|projects?|skills?|experience|responsibilit(?:y|ies))\b/i.test(question);
    const relevantChunks = await retrieveRelevantChunks(question, listQuestion ? 10 : 5);
    const context = relevantChunks
      .map((chunk) => `Source: ${chunk.metadata.documentName} (Page ${chunk.metadata.page})\n${chunk.text}`)
      .join('\n\n');
    const userMessage = {
      role: 'user',
      content: hasImage
        ? `${question || 'Describe and analyze this screenshot.'}\n\nUse the document context when it is relevant:\n\n${context || 'No document context available.'}`
        : `Context:\n\n${context || 'No document chunks available yet.'}\n\nQuestion: ${question}`,
    };

    if (hasImage) {
      userMessage.images = [image.replace(/^data:image\/[^;]+;base64,/, '')];
    }

    const response = await fetch(`${ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: hasImage ? visionModel : chatModel,
        stream: false,
        options: { temperature: 0.2 },
        messages: [
          {
            role: 'system',
            content:
              'Answer only from the provided document context. For requests to list, extract, summarize, or identify all items, combine information across every relevant context section and return a complete, clearly structured answer. If the answer is not present in the context, state that the uploaded documents do not contain enough information to answer confidently.',
          },
          userMessage,
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const completion = await response.json();

    return {
      answer: completion.message?.content || 'Ollama returned an empty answer.',
      sources: relevantChunks.map((chunk) => ({
        document: chunk.metadata.documentName,
        page: chunk.metadata.page,
        similarity: Number((chunk.similarity || 0).toFixed(3)),
      })),
    };
  } catch (error) {
    const fallback = `Ollama is not ready. Start Ollama and run "ollama pull ${hasImage ? visionModel : chatModel}"${hasImage ? '' : ` and "ollama pull ${embeddingModel}"`}.`;
    return {
      answer: fallback,
      sources: [],
    };
  }
}
