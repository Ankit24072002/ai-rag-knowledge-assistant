import { useEffect, useRef, useState } from 'react';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5005/api';
const suggestedQuestions = [
  'Summarize this document',
  'What are the key skills?',
  'List the main projects',
];

function getAuthHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatFileSize(bytes) {
  if (!bytes) return 'PDF';
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function uniqueDocuments(documents) {
  return Array.from(new Map(documents.map((document) => [document._id || document.name, document])).values());
}

function formatConversationTime(timestamp) {
  if (!timestamp) return 'Just now';
  try {
    return new Date(timestamp).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return 'Just now';
  }
}

function formatStorage(bytes) {
  if (!bytes) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function App() {
  const [token, setToken] = useState(localStorage.getItem('rag_token') || '');
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '', role: 'user' });
  const [authError, setAuthError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [file, setFile] = useState(null);
  const [question, setQuestion] = useState('');
  const [documents, setDocuments] = useState([]);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [answer, setAnswer] = useState('');
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pastedImage, setPastedImage] = useState(null);
  const [showDashboard, setShowDashboard] = useState(false);
  const [analytics, setAnalytics] = useState(null);
  const fileInputRef = useRef(null);

  const refreshDocuments = async (activeToken = token) => {
    if (!activeToken) return;

    try {
      const response = await axios.get(`${API_BASE_URL}/documents`, {
        headers: getAuthHeaders(activeToken),
      });
      const nextDocuments = (response.data.documents || []).map((document) => ({
        _id: document._id,
        name: document.originalName,
        size: document.fileSize,
        stats: { chunkCount: document.chunkCount },
      }));
      setDocuments(uniqueDocuments(nextDocuments));
    } catch (error) {
      setDocuments([]);
    }
  };

  const refreshConversations = async (activeToken = token) => {
    if (!activeToken) return;

    try {
      const response = await axios.get(`${API_BASE_URL}/chat/conversations`, {
        headers: getAuthHeaders(activeToken),
      });
      const nextConversations = response.data.conversations || [];
      setConversations(nextConversations);

      if (!activeConversationId && nextConversations.length) {
        setActiveConversationId(nextConversations[0]._id);
      }

      if (activeConversationId && !nextConversations.some((item) => item._id === activeConversationId) && nextConversations.length) {
        setActiveConversationId(nextConversations[0]._id);
      }

      return nextConversations;
    } catch (error) {
      setConversations([]);
      return [];
    }
  };

  const loadAnalytics = async (activeToken = token) => {
    if (!activeToken || !user || user.role !== 'admin') return;

    try {
      const response = await axios.get(`${API_BASE_URL}/documents/analytics`, {
        headers: getAuthHeaders(activeToken),
      });
      setAnalytics(response.data);
    } catch (error) {
      setAnalytics(null);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('rag_token');
    setToken('');
    setUser(null);
    setDocuments([]);
    setConversations([]);
    setAnswer('');
    setSources([]);
    setPastedImage(null);
    setShowDashboard(false);
    setAnalytics(null);
  };

  const bootstrapSession = async (activeToken = token) => {
    if (!activeToken) return;

    try {
      const response = await axios.get(`${API_BASE_URL}/auth/me`, {
        headers: getAuthHeaders(activeToken),
      });
      setUser(response.data.user);
      await refreshDocuments(activeToken);
      await refreshConversations(activeToken);
      if (response.data.user?.role === 'admin') {
        await loadAnalytics(activeToken);
      }
    } catch (error) {
      handleLogout();
    }
  };

  useEffect(() => {
    bootstrapSession();
  }, [token]);

  useEffect(() => {
    if (!activeConversationId || !conversations.length) return;

    const currentConversation = conversations.find((conversation) => conversation._id === activeConversationId);
    if (!currentConversation) return;

    const lastAssistantMessage = [...(currentConversation.messages || [])].reverse().find((entry) => entry.role === 'assistant');
    if (lastAssistantMessage) {
      setAnswer(lastAssistantMessage.content);
    } else if (!answer) {
      setAnswer('');
    }
  }, [activeConversationId, conversations]);

  const selectFile = (nextFile) => {
    if (nextFile && ['application/pdf', 'text/plain'].includes(nextFile.type)) {
      setFile(nextFile);
    }
  };

  const toggleDocumentSelection = (documentId) => {
    setSelectedDocumentIds((previous) => {
      if (previous.includes(documentId)) {
        return previous.filter((id) => id !== documentId);
      }
      return [...previous, documentId];
    });
  };

  const handleDeleteDocuments = async (documentIds = selectedDocumentIds) => {
    if (!documentIds.length || !token) return;

    try {
      await axios.delete(`${API_BASE_URL}/documents`, {
        headers: getAuthHeaders(token),
        data: { ids: documentIds },
      });
      setSelectedDocumentIds([]);
      setDocuments((previous) => previous.filter((document) => !documentIds.includes(document._id)));
      await refreshDocuments(token);
      if (user?.role === 'admin') {
        await loadAnalytics(token);
      }
    } catch (error) {
      setAnswer(error.response?.data?.message || 'Unable to delete documents.');
    }
  };

  const handleCreateConversation = async () => {
    if (!token) return;

    try {
      const response = await axios.post(`${API_BASE_URL}/chat/conversations`, { title: 'New conversation' }, {
        headers: getAuthHeaders(token),
      });

      const conversation = response.data.conversation;
      setActiveConversationId(conversation._id);
      setQuestion('');
      setAnswer('');
      setSources([]);
      setPastedImage(null);
      setConversations((previous) => [conversation, ...previous]);
    } catch (error) {
      setAnswer(error.response?.data?.message || 'Unable to create a chat session.');
    }
  };

  const handleDeleteConversation = async (conversationId, event) => {
    if (event) event.stopPropagation();
    if (!token) return;

    try {
      await axios.delete(`${API_BASE_URL}/chat/conversations/${conversationId}`, {
        headers: getAuthHeaders(token),
      });
      const nextConversations = conversations.filter((conversation) => conversation._id !== conversationId);
      setConversations(nextConversations);

      if (activeConversationId === conversationId) {
        const nextActiveConversation = nextConversations[0];
        setActiveConversationId(nextActiveConversation?._id || null);
        if (nextActiveConversation) {
          const lastAssistantMessage = [...(nextActiveConversation.messages || [])].reverse().find((entry) => entry.role === 'assistant');
          setAnswer(lastAssistantMessage?.content || '');
        } else {
          setAnswer('');
        }
      }
    } catch (error) {
      setAnswer(error.response?.data?.message || 'Unable to delete this conversation.');
    }
  };

  const handleUpload = async (event) => {
    event.preventDefault();
    if (!file || !token) return;

    setLoading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post(`${API_BASE_URL}/documents/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          ...getAuthHeaders(token),
        },
      });

      setDocuments((previous) => uniqueDocuments([
        ...previous,
        {
          _id: response.data.document?._id || response.data.file?.originalName,
          name: response.data.file.originalName,
          size: file.size,
          stats: response.data.stats,
        },
      ]));
      setAnswer('Document indexed successfully. Ask a question to explore it.');
      setSources([]);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await refreshDocuments(token);
      if (user?.role === 'admin') {
        await loadAnalytics(token);
      }
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

  const handleReset = async () => {
    if (!token) return;
    await handleCreateConversation();
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
    if (!token || (!question.trim() && !pastedImage)) return;

    let conversationIdToUse = activeConversationId;
    if (!conversationIdToUse) {
      const creationResponse = await axios.post(`${API_BASE_URL}/chat/conversations`, { title: 'New conversation' }, {
        headers: getAuthHeaders(token),
      });
      conversationIdToUse = creationResponse.data.conversation._id;
      setActiveConversationId(conversationIdToUse);
      setConversations((previous) => [creationResponse.data.conversation, ...previous]);
    }

    setLoading(true);
    try {
      const response = await axios.post(`${API_BASE_URL}/chat/ask`, {
        question,
        image: pastedImage?.url,
        conversationId: conversationIdToUse,
      }, {
        headers: getAuthHeaders(token),
      });
      setAnswer(response.data.answer);
      setSources(response.data.sources || []);
      setPastedImage(null);
      await refreshConversations(token);
    } catch (error) {
      setAnswer(error.response?.data?.message || 'Something went wrong while generating the answer.');
      setSources([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAuthSubmit = async (event) => {
    event.preventDefault();
    setAuthError('');

    try {
      const endpoint = authMode === 'login' ? '/auth/login' : '/auth/register';
      const payload = authMode === 'login'
        ? { email: authForm.email, password: authForm.password }
        : { name: authForm.name, email: authForm.email, password: authForm.password };

      const response = await axios.post(`${API_BASE_URL}${endpoint}`, payload);
      const nextToken = response.data.token;

      localStorage.setItem('rag_token', nextToken);
      setToken(nextToken);
      setUser(response.data.user);
      setAuthForm({ name: '', email: '', password: '', role: 'user' });
      setShowPassword(false);
      await refreshDocuments(nextToken);
      await refreshConversations(nextToken);
      if (response.data.user.role === 'admin') {
        await loadAnalytics(nextToken);
      }
    } catch (error) {
      setAuthError(error.response?.data?.message || 'Authentication failed.');
    }
  };

  if (!token || !user) {
    return (
      <div className="auth-shell">
        <div className="auth-layout">
          <section className="auth-story">
            <div className="brand-row auth-brand">
              <div className="brand-mark">A</div>
              <div>
                <div className="brand">Atlas AI</div>
                <span className="brand-caption">Private knowledge workspace</span>
              </div>
            </div>

            <div className="auth-story-copy">
              <span className="auth-eyebrow">YOUR KNOWLEDGE, AMPLIFIED</span>
              <h1>Make every document<br /><em>work harder.</em></h1>
              <p>Search, understand, and act on your private knowledge base with answers grounded in the files you trust.</p>
            </div>

            <div className="auth-proof">
              <div className="proof-avatar">JD</div>
              <div><p>“The fastest way for our team to find the signal in a mountain of docs.”</p><strong>Jordan Davis <span>Product lead</span></strong></div>
            </div>

            <div className="auth-privacy"><span className="privacy-check">+</span><div><strong>Private by design</strong><small>Your documents stay in your workspace and are processed locally.</small></div></div>
          </section>

          <section className="auth-card">
            <div className="auth-heading">
              <span className="auth-mobile-mark">A</span>
              <span className="auth-eyebrow">WELCOME BACK</span>
              <h2>{authMode === 'login' ? 'Sign in to Atlas' : 'Create your workspace'}</h2>
              <p>{authMode === 'login' ? 'Continue where you left off.' : 'Start building a smarter, more searchable library.'}</p>
            </div>

            <div className="auth-toggle" role="tablist" aria-label="Authentication mode">
              <button type="button" role="tab" aria-selected={authMode === 'login'} className={authMode === 'login' ? 'active' : ''} onClick={() => { setAuthMode('login'); setAuthError(''); }}>Sign in</button>
              <button type="button" role="tab" aria-selected={authMode === 'register'} className={authMode === 'register' ? 'active' : ''} onClick={() => { setAuthMode('register'); setAuthError(''); }}>Create account</button>
            </div>

            <form onSubmit={handleAuthSubmit} className="auth-form">
              {authMode === 'register' && (
                <label>
                  <span>Full name</span>
                  <input type="text" value={authForm.name} onChange={(event) => setAuthForm({ ...authForm, name: event.target.value })} placeholder="Alex Morgan" autoComplete="name" required />
                </label>
              )}

              <label>
                <span>Work email</span>
                <input type="email" value={authForm.email} onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })} placeholder="you@company.com" autoComplete="email" required />
              </label>

              <label>
                <span>Password <small>{authMode === 'register' ? 'At least 8 characters' : ''}</small></span>
                <span className="password-field">
                  <input type={showPassword ? 'text' : 'password'} value={authForm.password} onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })} placeholder="Enter your password" autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} minLength="8" required />
                  <button type="button" onClick={() => setShowPassword((previous) => !previous)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? 'Hide' : 'Show'}</button>
                </span>
              </label>

              {authMode === 'login' && <div className="auth-options"><label className="checkbox-label"><input type="checkbox" /> <span>Keep me signed in</span></label><button type="button" className="text-button">Forgot password?</button></div>}

              {authError && <div className="auth-error" role="alert">{authError}</div>}

              <button type="submit" className="primary-button auth-button">
                {authMode === 'login' ? 'Sign in to workspace' : 'Create workspace'}
                <span aria-hidden="true">-&gt;</span>
              </button>
            </form>

            <p className="auth-terms">By continuing, you agree to our <button type="button" className="text-button">Terms of service</button> and <button type="button" className="text-button">Privacy policy</button>.</p>
          </section>
        </div>
      </div>
    );
  }

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
          <span className="workspace-icon">{user?.name?.slice(0, 2).toUpperCase() || 'US'}</span>
          <span><strong>{user?.name || 'User'}</strong><small>{user?.role === 'admin' ? 'Admin access' : 'Personal plan'}</small></span>
          <span className="chevron">v</span>
        </div>

        <nav className="side-nav" aria-label="Main navigation">
          <button type="button" className="nav-item active"><span>+</span> Knowledge chat</button>
          <button type="button" className="nav-item" onClick={() => setShowDashboard(false)}><span>o</span> Documents <em>{documents.length}</em></button>
          {user?.role === 'admin' && (
            <button type="button" className="nav-item" onClick={() => { setShowDashboard(true); loadAnalytics(); }}><span>~</span> Analytics</button>
          )}
          <button type="button" className="nav-item" onClick={handleLogout}><span>⇠</span> Sign out</button>
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

          {selectedDocumentIds.length > 0 && (
            <button type="button" className="delete-docs-button" onClick={() => handleDeleteDocuments()}>
              Delete selected
            </button>
          )}

          {documents.length === 0 ? (
            <p className="empty-state">Your indexed files will appear here.</p>
          ) : (
            documents.map((doc, index) => (
              <div key={`${doc._id || doc.name}-${index}`} className={`doc-item ${selectedDocumentIds.includes(doc._id) ? 'selected' : ''}`}>
                <input
                  type="checkbox"
                  checked={selectedDocumentIds.includes(doc._id)}
                  onChange={() => toggleDocumentSelection(doc._id)}
                  aria-label={`Select ${doc.name}`}
                />
                <span className="doc-type">{doc.name?.toLowerCase().endsWith('.txt') ? 'TXT' : 'PDF'}</span>
                <span className="doc-copy"><strong>{doc.name}</strong><small>{formatFileSize(doc.size)}  |  {doc.stats?.chunkCount || 0} chunks</small></span>
                <button type="button" className="doc-delete" onClick={() => handleDeleteDocuments([doc._id])}>Delete</button>
                <span className="doc-status">OK</span>
              </div>
            ))
          )}
        </div>

        <div className="conversation-panel">
          <div className="section-label">CHAT HISTORY <span>{conversations.length}</span></div>
          <button type="button" className="new-chat-button" onClick={handleCreateConversation}>New chat</button>

          {conversations.length === 0 ? (
            <p className="empty-state">No saved chats yet.</p>
          ) : (
            conversations.map((conversation) => (
              <div
                key={conversation._id}
                className={`conversation-item ${activeConversationId === conversation._id ? 'active' : ''}`}
                onClick={() => setActiveConversationId(conversation._id)}
              >
                <div className="conversation-copy">
                  <strong>{conversation.title || 'Untitled conversation'}</strong>
                  <small>{conversation.messages?.length || 0} messages</small>
                  <em>{formatConversationTime(conversation.updatedAt || conversation.createdAt)}</em>
                </div>
                <button type="button" className="conversation-delete" onClick={(event) => handleDeleteConversation(conversation._id, event)}>
                  ×
                </button>
              </div>
            ))
          )}
        </div>

        <div className="sidebar-footer"><span className="status-dot" /> Ollama connected <span>v1.0</span></div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumbs"><span>Workspace</span><b>/</b><strong>{showDashboard ? 'Admin analytics' : 'Knowledge chat'}</strong></div>
          <div className="topbar-actions">
            <span className="connection"><i /> Local AI online</span>
            {user?.role === 'admin' && (
              <button type="button" className="secondary-button small-button" onClick={() => { setShowDashboard((prev) => !prev); if (!showDashboard) loadAnalytics(); }}>
                {showDashboard ? 'Back to chat' : 'Admin dashboard'}
              </button>
            )}
            <button className="avatar" type="button">{user?.name?.slice(0, 2).toUpperCase()}</button>
          </div>
        </header>

        {showDashboard && user?.role === 'admin' ? (
          <section className="content-wrap analytics-wrap">
            <div className="page-heading">
              <div>
                <span className="eyebrow">ADMIN OVERVIEW</span>
                <h1>Document analytics</h1>
                <p>Track document volume, storage use, and user activity.</p>
              </div>
            </div>

            <div className="metric-grid analytics-grid">
              <div className="metric-card"><span className="metric-label">TOTAL FILES</span><strong>{analytics?.totalDocuments ?? 0}</strong><small>indexed documents</small></div>
              <div className="metric-card"><span className="metric-label">TOTAL STORAGE</span><strong>{formatStorage(analytics?.totalStorage ?? 0)}</strong><small>used by library</small></div>
              <div className="metric-card accent"><span className="metric-label">TOTAL CHUNKS</span><strong>{analytics?.totalChunks ?? 0}</strong><small>retrieval units</small></div>
              <div className="metric-card"><span className="metric-label">USERS</span><strong>{analytics?.byUser?.length ?? 0}</strong><small>active contributors</small></div>
            </div>

            <div className="analytics-table-wrap">
              <h2>Usage by user</h2>
              <table className="analytics-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Documents</th>
                    <th>Storage</th>
                  </tr>
                </thead>
                <tbody>
                  {(analytics?.byUser || []).map((entry) => (
                    <tr key={entry._id || entry.userName || 'unknown'}>
                      <td>{entry.userName || 'Unknown user'}</td>
                      <td>{entry.count || 0}</td>
                      <td>{formatStorage(entry.size || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : (
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

                <div className="suggestions"><span>Try asking</span>{suggestedQuestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => setQuestion(suggestion)}>{suggestion}</button>)}</div>

                <form onSubmit={handleAsk} className="ask-form">
                  {pastedImage && <div className="image-attachment"><img src={pastedImage.url} alt="Pasted screenshot preview" /><div><strong>{pastedImage.name}</strong><small>Ready for visual analysis</small></div><button type="button" onClick={() => setPastedImage(null)} aria-label="Remove screenshot">x</button></div>}
                  <textarea value={question} onPaste={handlePaste} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask a question or paste a screenshot..." rows="3" />
                  <div className="composer-footer"><span>Paste screenshots for visual analysis</span><button className="send-button" type="submit" disabled={loading || (!question.trim() && !pastedImage)}>{loading ? 'Thinking...' : 'Ask AI  ->'}</button></div>
                </form>
                <div className="response-actions"><button type="button" onClick={handleCopy} disabled={!answer}>{copied ? 'Copied' : 'Copy answer'}</button><span>Answers are generated from your indexed sources.</span></div>
              </section>

              <aside className="insight-card"><div className="panel-kicker">WORKSPACE GUIDE</div><h2>Build your private library</h2><p>Bring in the documents your team works with. Atlas keeps retrieval focused and answers traceable.</p><div className="guide-step"><span>01</span><div><strong>Add a source</strong><small>Upload a PDF or TXT file.</small></div></div><div className="guide-step"><span>02</span><div><strong>Ask naturally</strong><small>Use plain language to search.</small></div></div><div className="guide-step"><span>03</span><div><strong>Verify the answer</strong><small>Open the cited source match.</small></div></div><div className="privacy-note"><span>+</span><div><strong>Your data stays local</strong><small>Powered by Ollama on your machine.</small></div></div></aside>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
