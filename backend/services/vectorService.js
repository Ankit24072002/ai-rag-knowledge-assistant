import { QdrantClient } from '@qdrant/js-client-rest';

const client = new QdrantClient({
  url: process.env.QDRANT_URL || 'http://localhost:6333',
  checkCompatibility: false,
});
const COLLECTION_NAME = 'document_chunks';

async function pingQdrant() {
  try {
    await client.getCollections();
    return true;
  } catch (error) {
    return false;
  }
}

export async function ensureCollection(vectorSize) {
  const available = await pingQdrant();
  if (!available) {
    console.warn('Qdrant unavailable, continuing in fallback mode.');
    return false;
  }

  try {
    const collection = await client.getCollection(COLLECTION_NAME);
    const existingSize = collection.config?.params?.vectors?.size;
    if (vectorSize && existingSize && existingSize !== vectorSize) {
      console.warn(`Qdrant collection expects ${existingSize}-dimensional vectors, but Ollama returned ${vectorSize}.`);
      return false;
    }
  } catch (error) {
    try {
      await client.createCollection(COLLECTION_NAME, {
        vectors: {
          size: vectorSize || Number(process.env.OLLAMA_EMBEDDING_DIMENSIONS) || 768,
          distance: 'Cosine',
        },
      });
    } catch (createError) {
      console.warn('Qdrant collection setup failed, continuing in fallback mode:', createError.message);
      return false;
    }
  }

  return true;
}

export async function upsertChunks(chunks) {
  if (!chunks.length || !chunks[0].embedding) return;

  const collectionReady = await ensureCollection(chunks[0].embedding.length);
  if (!collectionReady) return;

  const points = chunks.map((chunk) => ({
    id: chunk.id,
    vector: chunk.embedding,
    payload: {
      text: chunk.text,
      documentName: chunk.metadata.documentName,
      page: chunk.metadata.page,
      chunkId: chunk.id,
    },
  }));

  await client.upsert(COLLECTION_NAME, { wait: true, points });
}

export async function searchRelevantChunks(questionEmbedding, limit = 5) {
  const collectionReady = await ensureCollection(questionEmbedding.length);
  if (!collectionReady) return [];

  try {
    const result = await client.search(COLLECTION_NAME, {
      vector: questionEmbedding,
      limit,
      with_payload: true,
    });

    return result;
  } catch (error) {
    console.warn('Qdrant search failed, falling back to local retrieval:', error.message);
    return [];
  }
}

export async function deleteDocumentChunks(documentName) {
  try {
    const collection = await client.getCollection(COLLECTION_NAME);
    if (!collection) return;

    await client.delete(COLLECTION_NAME, {
      filter: {
        must: [{ key: 'documentName', match: { value: documentName } }],
      },
      wait: true,
    });
  } catch (error) {
    console.warn('Failed to remove document chunks from Qdrant:', error.message);
  }
}
