import fs from 'fs';
import path from 'path';
import { PDFParse } from 'pdf-parse';

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 120;

export async function extractTextFromFile(filePath) {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === '.pdf') {
    const dataBuffer = fs.readFileSync(filePath);
    const parser = new PDFParse({ data: dataBuffer });
    const pdfData = await parser.getText();
    await parser.destroy();
    return pdfData.text || '';
  }

  if (extension === '.txt') {
    return fs.readFileSync(filePath, 'utf-8');
  }

  if (extension === '.docx') {
    throw new Error('DOCX extraction is not implemented yet. Please upload a PDF or TXT file for the milestone build.');
  }

  throw new Error(`Unsupported file type: ${extension}`);
}

export function chunkText(text, documentName = 'unknown') {
  if (!text || !text.trim()) {
    return [];
  }

  const normalized = text.replace(/\s+/g, ' ').trim();
  const chunks = [];

  for (let i = 0; i < normalized.length; i += CHUNK_SIZE - CHUNK_OVERLAP) {
    const chunkTextValue = normalized.slice(i, i + CHUNK_SIZE).trim();
    if (!chunkTextValue) continue;

    const startIndex = i;
    const estimatedPage = Math.max(1, Math.floor(startIndex / 1500) + 1);

    chunks.push({
      id: `${documentName}-${chunks.length + 1}`,
      text: chunkTextValue,
      metadata: {
        documentName,
        page: estimatedPage,
        startIndex,
      },
    });
  }

  return chunks;
}

export async function processDocument(fileName, extractedText) {
  const chunks = chunkText(extractedText, fileName);

  return {
    fileName,
    totalCharacters: extractedText.length,
    chunkCount: chunks.length,
    chunks,
  };
}
