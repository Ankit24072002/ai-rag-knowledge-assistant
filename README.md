# AI RAG Assistant

A local, document-aware AI assistant for indexing PDFs and TXT files, retrieving the most relevant content, and answering questions with source-backed responses. The app combines a React frontend with an Express backend, MongoDB for metadata storage, Qdrant for vector search, and Ollama for local LLM inference.

## Overview

This project enables users to:

- Upload project documents such as PDFs and text files
- Split documents into searchable chunks
- Generate embeddings locally with Ollama
- Store vectors in Qdrant for semantic retrieval
- Ask grounded questions using the indexed document library
- Paste screenshots for visual analysis with a multimodal model
- Keep the workflow private and local by running inference on your machine

## Features

- PDF and TXT document ingestion
- Automatic text extraction and chunking
- Embedding generation with Ollama
- Vector retrieval with Qdrant
- Context-grounded responses from the uploaded content
- Screenshot-based visual Q&A using a vision-capable model
- MongoDB-backed document tracking and conversation history
- Modern Vite + React frontend for document and chat workflows
- Dockerized local infrastructure for MongoDB and Qdrant

## Tech Stack

- Frontend: React, Vite, Axios
- Backend: Node.js, Express.js
- Database: MongoDB with Mongoose
- Vector store: Qdrant
- AI runtime: Ollama
- Document processing: PDF parsing and text extraction

## Architecture

```text
Frontend (React + Vite)
        |
        v
Backend API (Express)
  |--------------------------|
  |                          |
  v                          v
MongoDB                Qdrant
  (document metadata)    (vector search)
        |
        v
Ollama
(LLM + embeddings + vision model)
```

## Prerequisites

Before running the app, ensure you have the following installed:

- Node.js 18+
- npm or yarn
- Docker Desktop / Docker Engine
- Ollama installed and running locally

## Local AI Setup

Install the required Ollama models before using chat and embeddings:

```bash
ollama pull llama3.2
ollama pull nomic-embed-text
ollama pull llava
```

If Ollama is not running yet, start it with:

```bash
ollama serve
```

## Environment Configuration

Create the required environment files before running the app.

### Root backend configuration

Use the sample at `.env.example` as a reference and create a backend environment file matching the values:

```bash
cp .env.example .env
```

Default environment values:

```env
PORT=5000
OLLAMA_URL=http://localhost:11434
OLLAMA_CHAT_MODEL=llama3.2
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
OLLAMA_EMBEDDING_DIMENSIONS=768
OLLAMA_VISION_MODEL=llava
MONGODB_URI=mongodb://127.0.0.1:27017/ai-rag-assistant
QDRANT_URL=http://localhost:6333
```

### Frontend configuration

```bash
cp frontend/.env.example frontend/.env
```

Frontend example:

```env
VITE_API_BASE_URL=http://localhost:5000/api
```

## Installation

1. Clone the repository:

```bash
git clone <your-repo-url>
cd ai-rag-assistant
```

2. Install backend dependencies:

```bash
cd backend
npm install
```

3. Install frontend dependencies:

```bash
cd ../frontend
npm install
```

## Running the Services

### 1. Start infrastructure services

From the project root:

```bash
docker compose up -d
```

This starts:

- MongoDB on port `27017`
- Qdrant on ports `6333` and `6334`

### 2. Start the backend

```bash
cd backend
npm run dev
```

The backend runs on port `5000` by default and exposes routes under `/api`.

### 3. Start the frontend

In a separate terminal:

```bash
cd frontend
npm run dev
```

The frontend is typically served at:

- `http://localhost:5173`

## Project Structure

```text
ai-rag-assistant/
├── backend/
│   ├── controllers/
│   ├── db/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── services/
│   ├── uploads/
│   ├── .env
│   ├── package.json
│   └── server.js
├── frontend/
│   ├── src/
│   ├── .env
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── docker-compose.yml
├── .env.example
├── README.md
└── package.json (if added at project root later)
```

## API Endpoints

### Health check

```http
GET /api/health
```

### Document management

```http
GET /api/documents
POST /api/documents/upload
```

### Chat and Q&A

```http
POST /api/chat/ask
```

Request body example:

```json
{
  "question": "Summarize the uploaded file in 5 bullet points",
  "image": "optional-base64-image-data"
}
```

## Usage

1. Open the frontend in the browser.
2. Upload a PDF or TXT file to the library.
3. Wait for the document to be processed and indexed.
4. Ask a question about the document content.
5. Review the response and cited sources.
6. Paste a screenshot to ask visual questions when relevant.

## Notes

- The app is designed for local-first deployment and keeps AI processing on your own machine.
- Qdrant and MongoDB must be running before document ingestion and chat requests work correctly.
- If Ollama is not started or the required models are missing, the app will return a friendly setup message.
- Uploaded document files are stored under the backend uploads directory.

## Common Commands

```bash
# Start infrastructure
cd ai-rag-assistant
docker compose up -d

# Start backend
dcd backend
npm run dev

# Start frontend
cd ../frontend
npm run dev

# Build frontend for production
cd frontend
npm run build
```

## Next Improvements

Potential enhancements for this project include:

- multi-document deletion and management
- chat history per user session
- improved chunking and metadata extraction
- support for more file types such as DOCX and CSV
- admin dashboard for document analytics
- authentication and multi-user access

## Summary

This project provides a practical, local-first RAG workflow for private knowledge retrieval and document Q&A. It is a strong foundation for building secure internal AI assistants that work with company documents without sending sensitive data to external SaaS providers.
