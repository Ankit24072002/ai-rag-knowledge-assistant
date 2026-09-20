import { useEffect, useRef, useState } from 'react';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5005/api';
const suggestedQuestions = [
  'Summarize this document',
  'What are the key skills?',
  'List the main projects',
];

function formatFileSize(bytes) {
  if (!bytes) return 'PDF';
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function uniqueDocuments(documents) {
  return Array.from(new Map(documents.map((document) => [document.name, document])).values());
}

function App() {
  const [file, setFile] = useState(null);
  const [question, setQuestion] = useState('');
  const [documents, setDocuments] = useState([]);
  const [answer, setAnswer] = useState('');
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pastedImage, setPastedImage] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    axios.get(`${API_BASE_URL}/documents`)
      .then((response) => {
        setDocuments(uniqueDocuments(response.data.documents.map((document) => ({
          name: document.originalName,
          size: document.fileSize,
          stats: { chunkCount: document.chunkCount },
        }))));
      })
      .catch(() => {
        setDocuments([]);
      });
  }, []);

  const selectFile = (nextFile) => {
    if (nextFile && ['application/pdf', 'text/plain'].includes(nextFile.type)) {
      setFile(nextFile);
    }
  };

  const handleUpload = async (event) => {
    event.preventDefault();
    if (!file) return;

    setLoading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post(`${API_BASE_URL}/documents/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setDocuments((prev) => uniqueDocuments([
        ...prev,
        {
          name: response.data.file.originalName,
          size: file.size,
          stats: response.data.stats,
        },
      ]));
      setAnswer('Document indexed successfully. Ask a question to explore it.');
      setSources([]);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (error) {
      setAnswer(error.response?.data?.message || 'Upload failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!answer) return;
    await navigator.clipboard.writeText(answer);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const handleReset = () => {
    setQuestion('');
    setAnswer('');
    setSources([]);
    setPastedImage(null);
  };

  const readImage = (imageFile) => {
    if (!imageFile?.type?.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => setPastedImage({ name: imageFile.name || 'Pasted screenshot', url: reader.result });
    reader.readAsDataURL(imageFile);
  };

  const handlePaste = (event) => {
    const imageItem = Array.from(event.clipboardData.items).find((item) => item.type.startsWith('image/'));
    if (imageItem) {
      event.preventDefault();
      readImage(imageItem.getAsFile());
    }
  };

  const handleAsk = async (event) => {
    event.preventDefault();
    if (!question.trim() && !pastedImage) return;

    setLoading(true);
    try {
      const response = await axios.post(`${API_BASE_URL}/chat/ask`, {
        question,
        image: pastedImage?.url,
      });
      setAnswer(response.data.answer);
      setSources(response.data.sources || []);
      setPastedImage(null);
    } catch (error) {
      setAnswer(error.response?.data?.message || 'Something went wrong while generating the answer.');
      setSources([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-row">
          <div className="brand-mark">A</div>
          <div>
            <div className="brand">Atlas AI</div>
            <span className="brand-caption">Knowledge workspace</span>
          </div>
        </div>

        <div className="workspace-select">
          <span className="workspace-icon">NW</span>
          <span><strong>Northwind workspace</strong><small>Personal plan</small></span>
          <span className="chevron">v</span>
        </div>

        <nav className="side-nav" aria-label="Main navigation">
          <button className="nav-item active"><span>+</span> Knowledge chat</button>
          <button className="nav-item"><span>o</span> Documents <em>{documents.length}</em></button>
          <button className="nav-item"><span>~</span> Activity</button>
        </nav>

        <form onSubmit={handleUpload} className="upload-panel">
          <div className="section-label">SOURCE LIBRARY <span>+</span></div>
          <div
            className={`drop-zone ${isDragging ? 'dragging' : ''}`}
            onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              selectFile(event.dataTransfer.files[0]);
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="upload-icon">^</div>
            <strong>{file ? file.name : 'Drop a file here'}</strong>
            <span>{file ? formatFileSize(file.size) : 'or click to browse'}</span>
            <input ref={fileInputRef} type="file" accept=".pdf,.txt" onChange={(e) => selectFile(e.target.files[0])} />
          </div>
          <button className="primary-button" type="submit" disabled={loading || !file}>
            {loading ? 'Indexing document...' : 'Add to library'}
          </button>
          <small className="upload-hint">PDF and TXT files up to 25 MB</small>
        </form>

        <div className="documents-panel">
          <div className="section-label">RECENT DOCUMENTS <span>{documents.length}</span></div>
          {documents.length === 0 ? (
            <p className="empty-state">Your indexed files will appear here.</p>
          ) : (
            documents.map((doc, index) => (
              <div key={`${doc.name}-${index}`} className="doc-item">
                <span className="doc-type">PDF</span>
                <span className="doc-copy"><strong>{doc.name}</strong><small>{formatFileSize(doc.size)}  |  {doc.stats?.chunkCount || 0} chunks</small></span>
                <span className="doc-status">OK</span>
              </div>
            ))
          )}
        </div>

        <div className="sidebar-footer"><span className="status-dot" /> Ollama connected <span>v1.0</span></div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumbs"><span>Workspace</span><b>/</b><strong>Knowledge chat</strong></div>
          <div className="topbar-actions"><span className="connection"><i /> Local AI online</span><button className="avatar">AK</button></div>
        </header>

        <section className="content-wrap">
          <div className="page-heading">
            <div><span className="eyebrow">INTELLIGENCE HUB</span><h1>Ask your knowledge base</h1><p>Search across your private documents with grounded, source-backed answers.</p></div>
            <button className="secondary-button" onClick={handleReset}>Reset session</button>
          </div>

          <div className="metric-grid">
            <div className="metric-card"><span className="metric-label">DOCUMENTS</span><strong>{documents.length}</strong><small>in this workspace</small></div>
            <div className="metric-card"><span className="metric-label">INDEXED CHUNKS</span><strong>{documents.reduce((total, doc) => total + (doc.stats?.chunkCount || 0), 0)}</strong><small>ready for retrieval</small></div>
            <div className="metric-card accent"><span className="metric-label">MODEL</span><strong>llama3.2</strong><small>running locally</small></div>
            <div className="metric-card"><span className="metric-label">PRIVACY</span><strong>100%</strong><small>local processing</small></div>
          </div>

          <div className="chat-layout">
            <section className="chat-card">
              <div className="chat-card-header"><div><span className="panel-kicker">CONVERSATION</span><h2>Knowledge chat</h2></div><span className="live-pill"><i /> Live</span></div>
              <div className="message output">
                <div className="assistant-avatar">A</div>
                <div><div className="message-meta"><strong>Atlas AI</strong><span>Just now</span></div><p>{answer || 'Upload a document and ask a question to begin.'}</p></div>
              </div>

              {sources.length > 0 && (
                <div className="sources-box">
                  <div className="sources-heading"><span>Retrieved sources</span><small>{sources.length} matches</small></div>
                  {sources.map((source, index) => (
                    <div className="source-card" key={`${source.document}-${index}`}><span className="source-number">0{index + 1}</span><span className="source-copy"><strong>{source.document}</strong><small>Page {source.page}</small></span><span className="similarity">{Math.round(source.similarity * 100)}%</span></div>
                  ))}
                </div>
              )}

              <div className="suggestions"><span>Try asking</span>{suggestedQuestions.map((suggestion) => <button key={suggestion} onClick={() => setQuestion(suggestion)}>{suggestion}</button>)}</div>

              <form onSubmit={handleAsk} className="ask-form">
                {pastedImage && <div className="image-attachment"><img src={pastedImage.url} alt="Pasted screenshot preview" /><div><strong>{pastedImage.name}</strong><small>Ready for visual analysis</small></div><button type="button" onClick={() => setPastedImage(null)} aria-label="Remove screenshot">x</button></div>}
                <textarea value={question} onPaste={handlePaste} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask a question or paste a screenshot..." rows="3" />
                <div className="composer-footer"><span>Paste screenshots for visual analysis</span><button className="send-button" type="submit" disabled={loading || (!question.trim() && !pastedImage)}>{loading ? 'Thinking...' : 'Ask AI  ->'}</button></div>
              </form>
              <div className="response-actions"><button onClick={handleCopy} disabled={!answer}>{copied ? 'Copied' : 'Copy answer'}</button><span>Answers are generated from your indexed sources.</span></div>
            </section>

            <aside className="insight-card"><div className="panel-kicker">WORKSPACE GUIDE</div><h2>Build your private library</h2><p>Bring in the documents your team works with. Atlas keeps retrieval focused and answers traceable.</p><div className="guide-step"><span>01</span><div><strong>Add a source</strong><small>Upload a PDF or TXT file.</small></div></div><div className="guide-step"><span>02</span><div><strong>Ask naturally</strong><small>Use plain language to search.</small></div></div><div className="guide-step"><span>03</span><div><strong>Verify the answer</strong><small>Open the cited source match.</small></div></div><div className="privacy-note"><span>+</span><div><strong>Your data stays local</strong><small>Powered by Ollama on your machine.</small></div></div></aside>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
