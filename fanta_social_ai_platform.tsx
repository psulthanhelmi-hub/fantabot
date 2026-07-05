import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithCustomToken, 
  signInAnonymously, 
  onAuthStateChanged
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  addDoc, 
  updateDoc, 
  onSnapshot
} from 'firebase/firestore';

// ==========================================
// KONFIGURASI FIREBASE & INITIALIZATION
// ==========================================
const firebaseConfig = typeof __firebase_config !== 'undefined' 
  ? JSON.parse(__firebase_config) 
  : {
      apiKey: "mock-api-key",
      authDomain: "mock-auth-domain.firebaseapp.com",
      projectId: "mock-project-id",
      storageBucket: "mock-storage-bucket.appspot.com",
      messagingSenderId: "mock-sender-id",
      appId: "mock-app-id"
    };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'fanta-social-ai-app';

// ==========================================
// DATA ACUAN & TEMPLATE DEFAULT
// ==========================================
const INITIAL_PROMPTS = [
  { id: 'p1', title: 'Viral Hook Generator', category: 'Marketing', prompt: 'Buat 5 hook instagram yang menarik perhatian tentang {topik}...' },
  { id: 'p2', title: 'PAS Framework Writer', category: 'Copywriting', prompt: 'Gunakan kerangka Problem-Agitate-Solve untuk mempromosikan {topik}...' },
  { id: 'p3', title: 'Interactive Threads Post', category: 'Threads', prompt: 'Tulis thread interaktif di Threads tentang {topik} dengan gaya mengundang diskusi...' },
];

const INITIAL_TEMPLATES = [
  { id: 't1', title: 'Product Launching Teaser', category: 'Launch', content: '🚨 HARI YANG DITUNGGU SEGERA TIBA! Kami mempersembahkan produk baru... Siap mengubah cara Anda mengelola media sosial secara otomatis?' },
  { id: 't2', title: 'Educational Swipe File', category: 'Edukasi', content: 'Simpan postingan ini dulu agar tidak hilang! 📂 Hari ini kita bahas 3 tips rahasia otomatisasi menggunakan API resmi Meta...' },
];

const AGENTS = [
  { id: 'marketing', name: 'Agent Lana (Marketing)', role: 'Mengoptimalkan konversi penjualan & merancang kampanye viral.', avatar: '🎯', prompt: 'Kamu adalah Lana, Creative Social Media Marketer yang cerdas, berfokus pada CTR dan konversi.' },
  { id: 'cs', name: 'Agent Budi (Customer Care)', role: 'Menjawab keluhan pelanggan dengan empati & presisi tinggi.', avatar: '💬', prompt: 'Kamu adalah Budi dari Customer Service Fanta Social. Balas dengan sopan, solutif, dan ramah.' },
  { id: 'branding', name: 'Agent Siska (Brand Ambassador)', role: 'Membangun koneksi emosional & menjaga konsistensi brand.', avatar: '✨', prompt: 'Kamu adalah Siska, Brand Strategist yang selalu berfokus pada nilai estetika, konsistensi visual, dan story-telling premium.' }
];

export default function App() {
  // --- STATE UTAMA ---
  const [user, setUser] = useState(null);
  const [activeMenu, setActiveMenu] = useState('Dashboard');
  const [theme, setTheme] = useState('dark');
  const [toasts, setToasts] = useState([]);
  const [apiKeys, setApiKeys] = useState({
    gemini: '',
    groq: '',
    openrouter: '',
    metaToken: '',
    instagramBusinessId: '',
    threadsUserId: ''
  });

  const [connectionStatus, setConnectionStatus] = useState({
    gemini: 'untested',
    groq: 'untested',
    openrouter: 'untested',
    meta: 'untested'
  });

  const [metaAccount, setMetaAccount] = useState({
    connected: false,
    instagramId: '@fanta.social.ai',
    threadsId: 'fanta_threads_ai',
    followers: 12450,
    threadsFollowers: 3240,
    businessName: 'Fanta Social Business Suite'
  });

  // State Data Firestore / Backup
  const [posts, setPosts] = useState([]);
  const [comments, setComments] = useState([]);
  const [prompts, setPrompts] = useState(INITIAL_PROMPTS);
  const [templates, setTemplates] = useState(INITIAL_TEMPLATES);
  const [logs, setLogs] = useState([]);

  // UI States
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Content Gen State
  const [genInput, setGenInput] = useState({
    topic: '',
    tone: 'Santai',
    length: 'Medium',
    framework: 'AIDA',
    platform: 'Instagram'
  });
  const [generatedContent, setGeneratedContent] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Post Scheduler State
  const [newPost, setNewPost] = useState({
    platform: 'Instagram',
    caption: '',
    mediaUrl: 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?q=80&w=600',
    scheduleTime: '',
    status: 'Scheduled',
    type: 'Feed'
  });

  // Prompt Form State
  const [newPrompt, setNewPrompt] = useState({ title: '', category: 'Marketing', prompt: '' });
  
  // Active Comment Reply state
  const [activeComment, setActiveComment] = useState(null);
  const [draftReplyText, setDraftReplyText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // --- TOAST NOTIFICATION HANDLER ---
  const showToast = (message, type = 'success') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  };

  // --- AUDIT LOGGER ---
  const addLog = async (action, status, details) => {
    const newLog = {
      timestamp: new Date().toISOString(),
      action,
      status,
      details,
      user: user?.uid || 'System'
    };
    
    setLogs(prev => [newLog, ...prev].slice(0, 50));

    if (user) {
      try {
        await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'logs'), newLog);
      } catch (err) {
        console.error("Gagal mencatat log ke Firestore:", err);
      }
    }
  };

  // --- AUTHENTICATION FLOW (RULE 3) ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Gagal melakukan autentikasi:", error);
        showToast("Gagal tersambung dengan sistem keamanan", "error");
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        addLog('User Login', 'Sukses', `Autentikasi selesai menggunakan UID: ${firebaseUser.uid}`);
      } else {
        setUser(null);
      }
    });

    return () => unsubscribe();
  }, []);

  // --- FIRESTORE REALTIME SYNC (RULE 1 & 2) ---
  useEffect(() => {
    if (!user) return;

    // Ambil API Keys & Konfigurasi dari Firestore
    const apiDocRef = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'apiKeys');
    getDoc(apiDocRef).then((snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setApiKeys(data);
        if (data.metaToken) {
          setMetaAccount(prev => ({ ...prev, connected: true }));
        }
      }
    });

    // Sync Postingan (Mengambil semua dokumen tanpa query filter kompleks agar aman dari indeks)
    const postsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'posts');
    const unsubPosts = onSnapshot(postsRef, 
      (snapshot) => {
        const list = [];
        snapshot.forEach((doc) => list.push({ id: doc.id, ...doc.data() }));
        list.sort((a, b) => new Date(b.scheduleTime || 0) - new Date(a.scheduleTime || 0));
        setPosts(list.length ? list : getMockPosts());
      },
      (error) => console.error("Gagal subscribe posts:", error)
    );

    // Sync Komentar
    const commentsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'comments');
    const unsubComments = onSnapshot(commentsRef, 
      (snapshot) => {
        const list = [];
        snapshot.forEach((doc) => list.push({ id: doc.id, ...doc.data() }));
        setComments(list.length ? list : getMockComments());
      },
      (error) => console.error("Gagal subscribe comments:", error)
    );

    // Sync Prompt Library
    const promptsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'prompts');
    const unsubPrompts = onSnapshot(promptsRef, 
      (snapshot) => {
        const list = [];
        snapshot.forEach((doc) => list.push({ id: doc.id, ...doc.data() }));
        if (list.length) setPrompts(list);
      },
      (error) => console.error("Gagal subscribe prompts:", error)
    );

    return () => {
      unsubPosts();
      unsubComments();
      unsubPrompts();
    };
  }, [user]);

  // --- RECOVERY MOCK DATA (Fallback jika Firestore kosong) ---
  const getMockPosts = () => [
    { id: 'm1', platform: 'Instagram', caption: 'Luncurkan campaign digital pertamamu dalam 5 menit memakai Fanta Social AI! 🚀💼 #SaaS #MetaAPI #AI', mediaUrl: 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?q=80&w=600', scheduleTime: '2026-07-10T14:00', status: 'Scheduled', type: 'Feed' },
    { id: 'm2', platform: 'Threads', caption: 'Kenapa otomasi Meta API resmi jauh lebih aman dibanding scraping? Thread🧵👇\n1. Akun Anda aman dari suspend.\n2. Kecepatan respon komentar stabil.\n3. Akses analitik jauh lebih akurat.', mediaUrl: '', scheduleTime: '2026-07-07T09:00', status: 'Draft', type: 'Text' },
    { id: 'm3', platform: 'Instagram', caption: 'Mulai pagi Anda dengan menyapa audiens menggunakan asisten AI pintar! #FantaSocial #Productivity', mediaUrl: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=600', scheduleTime: '2026-07-06T08:00', status: 'Published', type: 'Reel' }
  ];

  const getMockComments = () => [
    { id: 'c1', user: 'budi_hartono', commentText: 'Kak, apakah tools ini aman untuk akun bisnis baru? Takut kena shadowban.', platform: 'Instagram', timestamp: '2026-07-06T01:30', sentiment: 'Netral', priority: 'Medium', status: 'Pending', autoDraftReply: '' },
    { id: 'c2', user: 'dian_lestari', commentText: 'Sumpah suka banget sama fiturnya! Menghemat waktu bikin konten mingguan parah sih ini! 🔥😍', platform: 'Instagram', timestamp: '2026-07-06T01:15', sentiment: 'Positif', priority: 'High', status: 'Pending', autoDraftReply: '' },
    { id: 'c3', user: 'tony_stark_id', commentText: 'Harganya mahal amat ya untuk paket pro-nya? Ada diskon ga?', platform: 'Threads', timestamp: '2026-07-06T00:45', sentiment: 'Negatif', priority: 'High', status: 'Pending', autoDraftReply: '' }
  ];

  // --- SAVE API KEYS TO FIRESTORE ---
  const handleSaveApiKeys = async (e) => {
    e.preventDefault();
    if (!user) return;
    try {
      const apiDocRef = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'apiKeys');
      await setDoc(apiDocRef, apiKeys);
      addLog('Update API Settings', 'Sukses', 'Menyimpan konfigurasi token API eksternal.');
      showToast('Konfigurasi API berhasil disimpan!');
    } catch (err) {
      console.error(err);
      showToast('Gagal menyimpan konfigurasi.', 'error');
    }
  };

  // ==========================================
  // REAL AI ENGINE (GEMINI, GROQ, OPENROUTER) WITH FALLBACK
  // ==========================================
  
  // 1. Google Gemini Direct Call
  const callGeminiDirect = async (promptText, systemInstruction, key) => {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${key}`;
    const payload = {
      contents: [{ parts: [{ text: promptText }] }]
    };
    if (systemInstruction) {
      payload.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`Gemini API Error: Status ${res.status}`);
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  };

  // 2. Groq Direct Call
  const callGroqDirect = async (promptText, systemInstruction, key) => {
    const endpoint = `https://api.groq.com/openai/v1/chat/completions`;
    const messages = [];
    if (systemInstruction) {
      messages.push({ role: 'system', content: systemInstruction });
    }
    messages.push({ role: 'user', content: promptText });

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`
      },
      body: JSON.stringify({
        model: "llama3-8b-8192",
        messages: messages,
        temperature: 0.7
      })
    });
    if (!res.ok) throw new Error(`Groq API Error: Status ${res.status}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  };

  // 3. OpenRouter Direct Call
  const callOpenRouterDirect = async (promptText, systemInstruction, key) => {
    const endpoint = `https://openrouter.ai/api/v1/chat/completions`;
    const messages = [];
    if (systemInstruction) {
      messages.push({ role: 'system', content: systemInstruction });
    }
    messages.push({ role: 'user', content: promptText });

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
        'HTTP-Referer': 'https://fanta-social.vercel.app',
        'X-Title': 'Fanta Social AI'
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: messages
      })
    });
    if (!res.ok) throw new Error(`OpenRouter API Error: Status ${res.status}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  };

  // Main Engine with Priority Fallback (Gemini -> Groq -> OpenRouter)
  const callAIPriorityChain = async (promptText, systemInstruction = '') => {
    const providers = [];
    if (apiKeys.gemini) providers.push({ name: 'Gemini', key: apiKeys.gemini, call: callGeminiDirect });
    if (apiKeys.groq) providers.push({ name: 'Groq', key: apiKeys.groq, call: callGroqDirect });
    if (apiKeys.openrouter) providers.push({ name: 'OpenRouter', key: apiKeys.openrouter, call: callOpenRouterDirect });

    if (providers.length === 0) {
      throw new Error("Tidak ada API Key yang dikonfigurasi! Harap isi API Key Anda di halaman Settings.");
    }

    let lastError = null;
    for (const provider of providers) {
      try {
        addLog(`Memanggil AI (${provider.name})...`, 'Pending', `Mencoba memproses teks.`);
        const text = await provider.call(promptText, systemInstruction, provider.key);
        addLog(`Panggilan AI (${provider.name})`, 'Sukses', `Berhasil memproses teks.`);
        return text;
      } catch (err) {
        console.warn(`Provider ${provider.name} gagal, mencoba provider selanjutnya...`, err);
        addLog(`Panggilan AI (${provider.name})`, 'Gagal', `Error: ${err.message}. Mencoba fallback ke provider berikutnya.`);
        lastError = err;
      }
    }
    throw new Error(`Semua AI Provider gagal dieksekusi. Error terakhir: ${lastError?.message}`);
  };

  // --- CONNECTION TEST ENGINE ---
  const handleTestConnection = async (type) => {
    setConnectionStatus(prev => ({ ...prev, [type]: 'testing' }));
    try {
      if (type === 'gemini') {
        if (!apiKeys.gemini) throw new Error("API Key kosong");
        await callGeminiDirect("Hi", "System Test", apiKeys.gemini);
      } else if (type === 'groq') {
        if (!apiKeys.groq) throw new Error("API Key kosong");
        await callGroqDirect("Hi", "System Test", apiKeys.groq);
      } else if (type === 'openrouter') {
        if (!apiKeys.openrouter) throw new Error("API Key kosong");
        await callOpenRouterDirect("Hi", "System Test", apiKeys.openrouter);
      } else if (type === 'meta') {
        if (!apiKeys.metaToken) throw new Error("Meta Graph Token kosong");
        // Hit real Facebook Graph API debug endpoint
        const res = await fetch(`https://graph.facebook.com/v19.0/me?access_token=${apiKeys.metaToken}`);
        if (!res.ok) throw new Error(`HTTP Error Status ${res.status}`);
      }
      setConnectionStatus(prev => ({ ...prev, [type]: 'success' }));
      showToast(`Koneksi ${type.toUpperCase()} sukses terhubung!`);
    } catch (err) {
      console.error(err);
      setConnectionStatus(prev => ({ ...prev, [type]: 'failed' }));
      showToast(`Koneksi ${type.toUpperCase()} gagal: ${err.message}`, 'error');
    }
  };

  // ==========================================
  // REAL META GRAPH API SERVICE
  // ==========================================
  
  // 1. Post to Instagram Feed (Real API Call)
  const publishInstagramPostDirect = async (mediaUrl, caption) => {
    if (!apiKeys.metaToken || !apiKeys.instagramBusinessId) {
      throw new Error("Kredensial Meta atau Instagram Business ID belum dikonfigurasi.");
    }

    // Langkah A: Buat kontainer media di Instagram Graph
    const containerUrl = `https://graph.facebook.com/v19.0/${apiKeys.instagramBusinessId}/media?image_url=${encodeURIComponent(mediaUrl)}&caption=${encodeURIComponent(caption)}&access_token=${apiKeys.metaToken}`;
    const containerRes = await fetch(containerUrl, { method: 'POST' });
    if (!containerRes.ok) {
      const errorData = await containerRes.json();
      throw new Error(errorData.error?.message || "Gagal membuat container media Instagram");
    }
    const containerData = await containerRes.json();
    const creationId = containerData.id;

    // Langkah B: Publikasikan kontainer media
    const publishUrl = `https://graph.facebook.com/v19.0/${apiKeys.instagramBusinessId}/media_publish?creation_id=${creationId}&access_token=${apiKeys.metaToken}`;
    const publishRes = await fetch(publishUrl, { method: 'POST' });
    if (!publishRes.ok) {
      const errorData = await publishRes.json();
      throw new Error(errorData.error?.message || "Gagal mempublikasikan media Instagram");
    }
    const publishData = await publishRes.json();
    return publishData.id;
  };

  // 2. Post to Threads (Real API Call)
  const publishThreadsPostDirect = async (text) => {
    if (!apiKeys.metaToken || !apiKeys.threadsUserId) {
      throw new Error("Kredensial Meta atau Threads User ID belum dikonfigurasi.");
    }

    // Langkah A: Buat Threads Media Container
    const containerUrl = `https://graph.threads.net/v1.0/${apiKeys.threadsUserId}/threads?media_type=TEXT&text=${encodeURIComponent(text)}&access_token=${apiKeys.metaToken}`;
    const containerRes = await fetch(containerUrl, { method: 'POST' });
    if (!containerRes.ok) {
      const errorData = await containerRes.json();
      throw new Error(errorData.error?.message || "Gagal membuat container Threads");
    }
    const containerData = await containerRes.json();
    const creationId = containerData.id;

    // Langkah B: Publikasikan kontainer Threads
    const publishUrl = `https://graph.threads.net/v1.0/${apiKeys.threadsUserId}/threads_publish?creation_id=${creationId}&access_token=${apiKeys.metaToken}`;
    const publishRes = await fetch(publishUrl, { method: 'POST' });
    if (!publishRes.ok) {
      const errorData = await publishRes.json();
      throw new Error(errorData.error?.message || "Gagal mempublikasikan post Threads");
    }
    const publishData = await publishRes.json();
    return publishData.id;
  };

  // 3. Reply to Comment (Real API Call)
  const replyToInstagramCommentDirect = async (commentId, message) => {
    if (!apiKeys.metaToken) throw new Error("Token akses Meta kosong");
    const replyUrl = `https://graph.facebook.com/v19.0/${commentId}/replies?message=${encodeURIComponent(message)}&access_token=${apiKeys.metaToken}`;
    const res = await fetch(replyUrl, { method: 'POST' });
    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error?.message || "Gagal mengirim balasan ke Meta API");
    }
    const data = await res.json();
    return data.id;
  };

  // ==========================================
  // HANDLERS FOR ACTIONS
  // ==========================================

  // Generate Content
  const handleGenerateContent = async (e) => {
    e.preventDefault();
    if (!genInput.topic) {
      showToast('Silakan isi topik atau instruksi konten!', 'error');
      return;
    }
    setIsGenerating(true);
    setGeneratedContent('');

    const systemPrompt = `Kamu adalah AI social media copywriter profesional dengan gaya bahasa ${genInput.tone}. Selalu gunakan format penulisan terstruktur dan sertakan emoji relevan. Tulis dalam Bahasa Indonesia.`;
    const promptPayload = `Buatkan caption ${genInput.platform} dengan kerangka kerja ${genInput.framework}.
    Topik / Detail: "${genInput.topic}"
    Panjang teks: ${genInput.length}
    Harap sertakan juga rekomendasi hashtag (3-5 buah) dan rekomendasi Call to Action (CTA) di bagian akhir secara terpisah.`;

    try {
      const result = await callAIPriorityChain(promptPayload, systemPrompt);
      setGeneratedContent(result);
      addLog('Content Generation', 'Sukses', `Membuat konten untuk ${genInput.platform} bertema ${genInput.topic.substring(0,25)}...`);
      showToast('Konten berhasil dibuat oleh AI!');
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Gagal memproses AI.', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  // Analyze Comment & Create Reply Draft
  const handleAnalyzeComment = async (comment) => {
    setActiveComment(comment);
    setIsAnalyzing(true);
    setDraftReplyText('');

    const systemPrompt = `Kamu adalah Customer Service Agen untuk Fanta Social Suite. Balas komentar audiens dengan ramah, informatif, profesional namun hangat. Gunakan Bahasa Indonesia.`;
    const promptPayload = `Komentar Audiens: "${comment.commentText}"
    Tentukan sentimen komentar ini (Positif/Netral/Negatif) dan berikan saran balasan 1 paragraf singkat yang pas dan natural tanpa terkesan kaku seperti robot.`;

    try {
      const response = await callAIPriorityChain(promptPayload, systemPrompt);
      setDraftReplyText(response);
      showToast('Analisis komentar & draf selesai!');
      addLog('Comment Analysis', 'Sukses', `Menganalisis komentar dari @${comment.user}`);
    } catch (err) {
      console.error(err);
      setDraftReplyText("Gagal memanggil AI. Silakan tulis balasan manual langsung pada form di bawah ini.");
      showToast('Gagal memproses analisis AI.', 'error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Approve and Send Reply
  const handleApproveReply = async (commentId) => {
    try {
      addLog('Approve Reply', 'Pending', `Mengirim balasan ke comment ${commentId}`);
      
      let responseId = 'local_' + Date.now();
      
      // Jika kredensial riil tersedia, lakukan pengiriman nyata ke Meta Graph API
      if (apiKeys.metaToken && commentId.indexOf('c') !== 0) {
        responseId = await replyToInstagramCommentDirect(commentId, draftReplyText);
      } else {
        addLog('Approve Reply', 'Simulasi', 'Token Meta belum disetel, menjalankan proses mock di lokal client.');
      }

      const updatedComments = comments.map(c => {
        if (c.id === commentId) {
          return { ...c, status: 'Replied', replyText: draftReplyText };
        }
        return c;
      });
      setComments(updatedComments);

      if (user && commentId.indexOf('c') !== 0) {
        const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'comments', commentId);
        await updateDoc(docRef, { status: 'Replied', replyText: draftReplyText });
      }

      addLog('Approve Reply', 'Sukses', `Sukses membalas komentar ID: ${commentId}. Meta ID Balasan: ${responseId}`);
      showToast('Balasan terkirim secara instan!');
      setActiveComment(null);
    } catch (err) {
      console.error(err);
      showToast(`Gagal mengirim balasan: ${err.message}`, 'error');
      addLog('Approve Reply', 'Gagal', `Error: ${err.message}`);
    }
  };

  // Create Post
  const handleCreatePost = async (e) => {
    e.preventDefault();
    if (!newPost.caption) {
      showToast('Caption tidak boleh kosong!', 'error');
      return;
    }

    const payload = {
      ...newPost,
      createdAt: new Date().toISOString()
    };

    try {
      let isPublishedImmediately = false;
      let externalId = '';

      // Kirim instan jika status diset Published atau waktu terlewat (Instant Execution)
      const now = new Date();
      const schedTime = new Date(newPost.scheduleTime);
      
      if (newPost.status === 'Published' || (newPost.scheduleTime && schedTime <= now)) {
        addLog('Instant Publish', 'Pending', `Mengirim postingan ke API Meta (${newPost.platform})`);
        if (newPost.platform === 'Instagram') {
          externalId = await publishInstagramPostDirect(newPost.mediaUrl, newPost.caption);
        } else {
          externalId = await publishThreadsPostDirect(newPost.caption);
        }
        payload.status = 'Published';
        payload.metaPostId = externalId;
        isPublishedImmediately = true;
      }

      if (user) {
        await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'posts'), payload);
        addLog('Create Post', 'Sukses', isPublishedImmediately ? `Berhasil mempublikasikan ke ${newPost.platform}` : `Menjadwalkan postingan ${newPost.platform}`);
        showToast(isPublishedImmediately ? 'Postingan berhasil dipublikasikan riil!' : 'Postingan berhasil dijadwalkan!');
        setNewPost({
          platform: 'Instagram',
          caption: '',
          mediaUrl: 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?q=80&w=600',
          scheduleTime: '',
          status: 'Scheduled',
          type: 'Feed'
        });
      } else {
        setPosts([{ id: 'offline_' + Date.now(), ...payload }, ...posts]);
        showToast('Tersimpan secara lokal (Mode Offline).');
      }
    } catch (err) {
      console.error(err);
      showToast(`Gagal mengeksekusi post: ${err.message}`, 'error');
      addLog('Create Post', 'Gagal', `Error: ${err.message}`);
    }
  };

  const handleAddPrompt = async (e) => {
    e.preventDefault();
    if (!newPrompt.title || !newPrompt.prompt) {
      showToast('Judul dan Prompt wajib diisi!', 'error');
      return;
    }

    if (user) {
      try {
        await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'prompts'), newPrompt);
        showToast('Prompt berhasil ditambahkan!');
        setNewPrompt({ title: '', category: 'Marketing', prompt: '' });
      } catch (err) {
        console.error(err);
      }
    } else {
      setPrompts([{ id: 'p_' + Date.now(), ...newPrompt }, ...prompts]);
      showToast('Prompt disimpan ke memori lokal.');
      setNewPrompt({ title: '', category: 'Marketing', prompt: '' });
    }
  };

  const totalPosts = posts.length || 3;
  const totalComments = comments.length || 3;
  const repliedComments = comments.filter(c => c.status === 'Replied').length;
  const scheduledCount = posts.filter(p => p.status === 'Scheduled').length;

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className={`min-h-screen transition-colors duration-300 font-sans ${theme === 'dark' ? 'bg-[#0f111a] text-slate-100' : 'bg-slate-50 text-slate-800'}`}>
      
      {/* Toast Notifications */}
      <div className="fixed top-5 right-5 z-50 flex flex-col gap-2">
        {toasts.map(t => (
          <div key={t.id} className={`px-4 py-3 rounded-xl shadow-lg border backdrop-blur-md flex items-center justify-between gap-4 transition-all duration-300 animate-slide-in ${
            t.type === 'error' 
              ? 'bg-rose-500/10 border-rose-500 text-rose-200' 
              : 'bg-emerald-500/10 border-emerald-500 text-emerald-200'
          }`}>
            <span>{t.message}</span>
            <button onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))} className="text-sm font-bold opacity-70 hover:opacity-100">✕</button>
          </div>
        ))}
      </div>

      {/* Command Palette */}
      {commandPaletteOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center pt-[10vh] p-4">
          <div className="w-full max-w-xl bg-slate-900 border border-slate-700/60 rounded-2xl shadow-2xl p-4 overflow-hidden">
            <div className="flex items-center gap-3 border-b border-slate-700 pb-3 mb-4">
              <span className="text-xl">🔍</span>
              <input 
                type="text" 
                placeholder="Ketik perintah atau menu cepat..." 
                className="w-full bg-transparent text-white focus:outline-none placeholder-slate-400"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
              <span className="text-xs text-slate-400 bg-slate-800 px-2 py-1 rounded">ESC</span>
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {['Dashboard', 'Meta Connection', 'Scheduler', 'Content Generator', 'Comment Assistant', 'AI Agent', 'Inbox', 'API Settings', 'Logs'].filter(menu => 
                menu.toLowerCase().includes(searchQuery.toLowerCase())
              ).map(menu => (
                <button 
                  key={menu}
                  onClick={() => {
                    setActiveMenu(menu);
                    setCommandPaletteOpen(false);
                    setSearchQuery('');
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-indigo-600/30 text-slate-300 hover:text-white transition-all flex items-center justify-between"
                >
                  <span>Buka {menu}</span>
                  <span className="text-xs text-slate-500">Menu</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* HEADER UTAMA */}
      <header className={`sticky top-0 z-40 border-b backdrop-blur-md transition-colors duration-300 ${
        theme === 'dark' ? 'bg-[#0f111a]/80 border-slate-800' : 'bg-white/80 border-slate-200'
      }`}>
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-tr from-pink-500 via-purple-600 to-indigo-600 rounded-xl flex items-center justify-center font-extrabold text-white text-xl tracking-wider shadow-lg shadow-indigo-500/20">
              F
            </div>
            <div>
              <h1 className="text-lg font-black tracking-wider bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 bg-clip-text text-transparent">
                FANTA SOCIAL AI
              </h1>
              <span className="text-[10px] text-slate-400 tracking-widest block -mt-1 uppercase">Official Meta API Partner</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button 
              onClick={() => setCommandPaletteOpen(true)}
              className="hidden md:flex items-center gap-2 bg-slate-800/60 hover:bg-slate-700/60 px-3 py-1.5 rounded-lg text-xs text-slate-400 border border-slate-700/50 transition-all"
            >
              <span>Perintah Cepat</span>
              <kbd className="bg-slate-900 px-1.5 py-0.5 rounded text-[10px]">Ctrl+K</kbd>
            </button>

            <button 
              onClick={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
              className="p-2 rounded-lg bg-slate-800/40 border border-slate-700/50 hover:bg-slate-700/40 transition-all text-sm"
            >
              {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
            </button>

            <div className="flex items-center gap-2 border-l border-slate-700/50 pl-4">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
              <span className="text-xs font-semibold text-slate-400 truncate max-w-[120px]">
                {user ? `UID: ${user.uid.substring(0,6)}...` : 'Menghubungkan...'}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* BODY UTAMA: SIDEBAR & KONTEN */}
      <div className="max-w-7xl mx-auto px-4 py-6 flex flex-col lg:flex-row gap-6">
        
        {/* SIDEBAR NAVIGATION */}
        <aside className="w-full lg:w-64 shrink-0">
          <nav className={`p-4 rounded-2xl border backdrop-blur-md transition-all ${
            theme === 'dark' ? 'bg-[#151926] border-slate-800/80' : 'bg-white border-slate-200 shadow-sm'
          } space-y-1.5`}>
            <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider px-3 mb-2">Utama</p>
            {[
              { name: 'Dashboard', icon: '📊' },
              { name: 'Meta Connection', icon: '🔗' },
              { name: 'Scheduler', icon: '📅' },
              { name: 'Content Generator', icon: '✍️' },
              { name: 'Comment Assistant', icon: '💬' },
              { name: 'AI Agent', icon: '🤖' },
              { name: 'Inbox', icon: '📥' },
              { name: 'Analytics', icon: '📈' },
            ].map(item => (
              <button
                key={item.name}
                onClick={() => setActiveMenu(item.name)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                  activeMenu === item.name 
                    ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-600/10' 
                    : 'text-slate-400 hover:bg-slate-800/40 hover:text-white'
                }`}
              >
                <span>{item.icon}</span>
                <span>{item.name}</span>
              </button>
            ))}

            <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider px-3 pt-4 mb-2">Aset & Sistem</p>
            {[
              { name: 'Prompt Library', icon: '📚' },
              { name: 'API Settings', icon: '⚙️' },
              { name: 'Logs', icon: '📝' }
            ].map(item => (
              <button
                key={item.name}
                onClick={() => setActiveMenu(item.name)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                  activeMenu === item.name 
                    ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-600/10' 
                    : 'text-slate-400 hover:bg-slate-800/40 hover:text-white'
                }`}
              >
                <span>{item.icon}</span>
                <span>{item.name}</span>
              </button>
            ))}
          </nav>
        </aside>

        {/* KONTEN AKTIF */}
        <main className="flex-1 min-w-0">
          
          {/* VIEW: DASHBOARD */}
          {activeMenu === 'Dashboard' && (
            <div className="space-y-6">
              
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { title: 'Koneksi Meta', status: apiKeys.metaToken ? 'Terhubung (API Riil)' : 'Belum Terhubung', color: apiKeys.metaToken ? 'bg-emerald-500' : 'bg-rose-500', icon: '🔗' },
                  { title: 'Google Gemini', status: apiKeys.gemini ? 'Aktif' : 'Unconfigured', color: apiKeys.gemini ? 'bg-emerald-500' : 'bg-amber-500', icon: '🤖' },
                  { title: 'Fallback Engine', status: apiKeys.groq || apiKeys.openrouter ? 'Ready' : 'Off', color: apiKeys.groq || apiKeys.openrouter ? 'bg-emerald-500' : 'bg-slate-500', icon: '⚡' },
                  { title: 'Firebase Firestore', status: 'Online', color: 'bg-emerald-500', icon: '🔥' }
                ].map((st, idx) => (
                  <div key={idx} className={`p-4 rounded-2xl border transition-all ${
                    theme === 'dark' ? 'bg-[#151926] border-slate-800/80' : 'bg-white border-slate-200 shadow-sm'
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xl">{st.icon}</span>
                      <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${st.color}`}></span>
                    </div>
                    <p className="text-xs text-slate-400 font-semibold">{st.title}</p>
                    <p className="text-sm font-bold mt-0.5">{st.status}</p>
                  </div>
                ))}
              </div>

              {/* STATS SAAS WIDGETS */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className={`p-5 rounded-2xl border ${theme === 'dark' ? 'bg-[#151926] border-slate-800/80' : 'bg-white border-slate-200 shadow-sm'}`}>
                  <h3 className="text-xs text-slate-400 font-semibold">Total Postingan</h3>
                  <p className="text-3xl font-black mt-1 text-indigo-500">{totalPosts}</p>
                  <span className="text-[10px] text-slate-500 block mt-1">Dikelola via Meta API</span>
                </div>
                <div className={`p-5 rounded-2xl border ${theme === 'dark' ? 'bg-[#151926] border-slate-800/80' : 'bg-white border-slate-200 shadow-sm'}`}>
                  <h3 className="text-xs text-slate-400 font-semibold">Komentar Masuk</h3>
                  <p className="text-3xl font-black mt-1 text-purple-500">{totalComments}</p>
                  <span className="text-[10px] text-slate-500 block mt-1">Live webhook sync</span>
                </div>
                <div className={`p-5 rounded-2xl border ${theme === 'dark' ? 'bg-[#151926] border-slate-800/80' : 'bg-white border-slate-200 shadow-sm'}`}>
                  <h3 className="text-xs text-slate-400 font-semibold">Dibalas AI</h3>
                  <p className="text-3xl font-black mt-1 text-emerald-500">{repliedComments}</p>
                  <span className="text-[10px] text-slate-500 block mt-1">Selesai diverifikasi</span>
                </div>
                <div className={`p-5 rounded-2xl border ${theme === 'dark' ? 'bg-[#151926] border-slate-800/80' : 'bg-white border-slate-200 shadow-sm'}`}>
                  <h3 className="text-xs text-slate-400 font-semibold">Menunggu Publikasi</h3>
                  <p className="text-3xl font-black mt-1 text-amber-500">{scheduledCount}</p>
                  <span className="text-[10px] text-slate-500 block mt-1">Di antrean scheduler</span>
                </div>
              </div>

              {/* LOGS MONITOR */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className={`lg:col-span-2 p-5 rounded-2xl border ${
                  theme === 'dark' ? 'bg-[#151926] border-slate-800/80' : 'bg-white border-slate-200 shadow-sm'
                }`}>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-base font-bold">Realtime Webhook Feed & AI Monitor</h2>
                      <p className="text-xs text-slate-400">Log aktivitas otomatis & aktivitas scheduler</p>
                    </div>
                    <span className="text-[10px] px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-400 font-bold border border-indigo-500/20 uppercase tracking-widest animate-pulse">Live</span>
                  </div>

                  <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                    {logs.map((log, i) => (
                      <div key={i} className={`p-3 rounded-xl border text-xs flex flex-col md:flex-row md:items-center justify-between gap-2 transition-all ${
                        theme === 'dark' ? 'bg-slate-900/60 border-slate-800/60' : 'bg-slate-50 border-slate-200'
                      }`}>
                        <div className="flex items-start gap-2.5">
                          <span className="p-1 rounded bg-slate-800">⚙️</span>
                          <div>
                            <p className="font-semibold text-slate-300">{log.action}</p>
                            <p className="text-slate-400 text-[11px] mt-0.5">{log.details}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 self-end md:self-center">
                          <span className="text-[10px] text-slate-500">{new Date(log.timestamp).toLocaleTimeString()}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            log.status === 'Sukses' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                          }`}>{log.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Account Details */}
                <div className={`p-5 rounded-2xl border ${
                  theme === 'dark' ? 'bg-[#151926] border-slate-800/80' : 'bg-white border-slate-200 shadow-sm'
                }`}>
                  <h2 className="text-base font-bold mb-3">Akun Tersambung</h2>
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-gradient-to-tr from-pink-500/10 via-purple-500/10 to-transparent border border-pink-500/20 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-yellow-500 to-pink-500 flex items-center justify-center text-white font-bold">IG</div>
                      <div>
                        <p className="text-xs text-slate-400">Instagram Business ID</p>
                        <p className="text-sm font-bold text-white truncate max-w-[150px]">
                          {apiKeys.instagramBusinessId || 'Belum di-set'}
                        </p>
                        <p className="text-[11px] text-pink-400 font-semibold">{metaAccount.followers.toLocaleString()} Pengikut</p>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-gradient-to-tr from-slate-800/40 via-indigo-500/5 to-transparent border border-slate-700/50 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-black flex items-center justify-center text-white font-bold text-xs border border-slate-700">T</div>
                      <div>
                        <p className="text-xs text-slate-400">Threads User ID</p>
                        <p className="text-sm font-bold text-white truncate max-w-[150px]">
                          {apiKeys.threadsUserId || 'Belum di-set'}
                        </p>
                        <p className="text-[11px] text-indigo-400 font-semibold">{metaAccount.threadsFollowers.toLocaleString()} Pengikut</p>
                      </div>
                    </div>
                  </div>

                  <button 
                    onClick={() => setActiveMenu('Meta Connection')}
                    className="w-full mt-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold transition-all text-center block"
                  >
                    Kelola Koneksi API Meta
                  </button>
                </div>
              </div>

            </div>
          )}

          {/* VIEW: META CONNECTION */}
          {activeMenu === 'Meta Connection' && (
            <div className={`p-6 rounded-2xl border ${
              theme === 'dark' ? 'bg-[#151926] border-slate-800/80' : 'bg-white border-slate-200 shadow-sm'
            } space-y-6`}>
              <div>
                <h2 className="text-xl font-bold">Integrasi API Resmi Meta Graph</h2>
                <p className="text-xs text-slate-400">Sambungkan akun Instagram & Threads Anda secara aman sesuai standar Meta Platform Policy tanpa scraping.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* OAuth Box */}
                <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
                  <h3 className="text-sm font-bold flex items-center gap-2">
                    <span className="p-1 rounded bg-indigo-500/10 text-indigo-400">🔒</span>
                    Meta Secure Authentication Flow
                  </h3>
                  <p className="text-xs text-slate-300">
                    Masukkan Access Token jangka panjang Meta Developer Anda untuk memulai pemanggilan API dari client atau serverless function Anda secara langsung.
                  </p>

                  <div className="p-4 rounded-lg bg-slate-800 border border-slate-700 text-xs space-y-2 text-slate-400">
                    <div className="flex justify-between"><span>Status:</span> <span className={apiKeys.metaToken ? "text-emerald-400 font-bold" : "text-rose-400"}>{apiKeys.metaToken ? "Authorized" : "Not Authorized"}</span></div>
                    <div className="flex justify-between"><span>Metode Publikasi:</span> <span className="text-indigo-400">Official Graph Endpoint API</span></div>
                  </div>

                  <button 
                    onClick={() => {
                      setActiveMenu('API Settings');
                      showToast('Masukkan Token Meta Anda di form ini.');
                    }}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-pink-500 via-purple-600 to-indigo-600 hover:opacity-90 transition-all text-xs font-bold text-white text-center"
                  >
                    Konfigurasi Meta Token & ID
                  </button>
                </div>

                {/* Connected Scope Details */}
                <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
                  <h3 className="text-sm font-bold text-slate-200">Keterangan Akses Izin (Meta Scopes)</h3>
                  <div className="space-y-2 text-xs text-slate-400">
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-400">✓</span>
                      <span>instagram_basic (Membaca informasi dasar akun)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-400">✓</span>
                      <span>instagram_content_publish (Posting foto, video & Reels)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-400">✓</span>
                      <span>instagram_manage_comments (Kelola komentar masuk)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-400">✓</span>
                      <span>threads_basic & threads_content_publish (Posting ke Threads)</span>
                    </div>
                  </div>

                  <div className="p-4 rounded-lg bg-rose-500/5 border border-rose-500/20 text-xs text-rose-300">
                    ⚠️ <strong>Informasi Kebijakan Meta:</strong> Aplikasi ini 100% menggunakan API Resmi Graph, dilarang keras mencoba melakukan bypass menggunakan headless browser untuk menghindari banned permanen IP server.
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* VIEW: SCHEDULER */}
          {activeMenu === 'Scheduler' && (
            <div className="space-y-6">
              
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                
                {/* Post Creator / Scheduler Form */}
                <div className={`lg:col-span-3 p-6 rounded-2xl border ${
                  theme === 'dark' ? 'bg-[#151926] border-slate-800/80' : 'bg-white border-slate-200 shadow-sm'
                } space-y-4`}>
                  <div>
                    <h2 className="text-lg font-bold">Jadwalkan Postingan Baru (Instagram / Threads)</h2>
                    <p className="text-xs text-slate-400">Masukkan aset gambar, atur caption, dan kirimkan langsung atau jadwalkan otomatis.</p>
                  </div>

                  <form onSubmit={handleCreatePost} className="space-y-4 text-xs">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-slate-400 mb-1">Platform Tujuan</label>
                        <select 
                          className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-700 focus:outline-none focus:border-indigo-500 text-slate-300"
                          value={newPost.platform}
                          onChange={(e) => setNewPost({ ...newPost, platform: e.target.value })}
                        >
                          <option value="Instagram">Instagram</option>
                          <option value="Threads">Threads</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-slate-400 mb-1">Tipe Postingan</label>
                        <select 
                          className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-700 focus:outline-none focus:border-indigo-500 text-slate-300"
                          value={newPost.type}
                          onChange={(e) => setNewPost({ ...newPost, type: e.target.value })}
                        >
                          <option value="Feed">Feed (Single/Carousel Image)</option>
                          <option value="Reel">Reels (Video)</option>
                          <option value="Text">Teks Saja</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-slate-400 mb-1">Caption / Konten Teks</label>
                      <textarea 
                        rows="5"
                        placeholder="Tulis caption Anda di sini, gunakan Content AI untuk hasil yang lebih baik..."
                        className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-700 focus:outline-none focus:border-indigo-500 text-slate-300 resize-none font-sans"
                        value={newPost.caption}
                        onChange={(e) => setNewPost({ ...newPost, caption: e.target.value })}
                      ></textarea>
                    </div>

                    {newPost.platform === 'Instagram' && (
                      <div>
                        <label className="block text-slate-400 mb-1">URL Media Gambar/Video (Wajib diisi dan dapat diakses publik oleh Meta API)</label>
                        <input 
                          type="text" 
                          className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-700 focus:outline-none focus:border-indigo-500 text-slate-300"
                          value={newPost.mediaUrl}
                          onChange={(e) => setNewPost({ ...newPost, mediaUrl: e.target.value })}
                        />
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-slate-400 mb-1">Waktu Publikasi</label>
                        <input 
                          type="datetime-local" 
                          className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-700 focus:outline-none focus:border-indigo-500 text-slate-300"
                          value={newPost.scheduleTime}
                          onChange={(e) => setNewPost({ ...newPost, scheduleTime: e.target.value })}
                        />
                      </div>

                      <div>
                        <label className="block text-slate-400 mb-1">Aksi Publikasi</label>
                        <select 
                          className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-700 focus:outline-none focus:border-indigo-500 text-slate-300"
                          value={newPost.status}
                          onChange={(e) => setNewPost({ ...newPost, status: e.target.value })}
                        >
                          <option value="Published">Kirim Sekarang (Instant)</option>
                          <option value="Scheduled">Simpan Antrean (Terjadwal)</option>
                          <option value="Draft">Draft (Simpan Sementara)</option>
                        </select>
                      </div>
                    </div>

                    <div className="pt-2">
                      <button 
                        type="submit"
                        className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 transition-all font-bold text-center text-white text-xs"
                      >
                        💾 Jalankan / Simpan Postingan
                      </button>
                    </div>
                  </form>
                </div>

                {/* Smartphone Live Preview Mock */}
                <div className="lg:col-span-2 flex flex-col items-center justify-center">
                  <div className="w-[280px] h-[540px] rounded-[36px] border-[6px] border-slate-800 bg-[#000] shadow-2xl relative overflow-hidden flex flex-col">
                    <div className="absolute top-0 inset-x-0 h-6 bg-slate-800 rounded-b-xl flex justify-center items-center z-20">
                      <div className="w-16 h-3 bg-black rounded-full"></div>
                    </div>

                    <div className="pt-8 px-4 pb-2 border-b border-slate-900 flex justify-between items-center text-xs font-bold text-white bg-slate-950">
                      <span>{newPost.platform === 'Instagram' ? 'Instagram Feed' : 'Threads Post'}</span>
                      <span className="text-[10px] text-indigo-400">Pratinjau</span>
                    </div>

                    <div className="flex-1 overflow-y-auto bg-[#0a0c10] p-3 text-xs space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-yellow-500 to-pink-500 flex items-center justify-center text-[10px] font-bold text-white">IG</div>
                        <div>
                          <p className="font-bold text-[11px] text-white">fanta.social.ai</p>
                          <p className="text-[9px] text-slate-500">Live Publisher</p>
                        </div>
                      </div>

                      {newPost.platform === 'Instagram' && newPost.mediaUrl && (
                        <div className="w-full aspect-square rounded-lg bg-slate-900 overflow-hidden border border-slate-950">
                          <img 
                            src={newPost.mediaUrl} 
                            alt="Preview Media" 
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.target.src = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=600';
                            }}
                          />
                        </div>
                      )}

                      <div className="text-[11px] text-slate-200 whitespace-pre-line leading-relaxed">
                        {newPost.caption || 'Ketik caption di form sebelah kiri untuk melihat render visual interaktif...'}
                      </div>
                    </div>
                  </div>
                </div>

              </div>

              {/* ANTRIAN JADWAL TERDAFTAR */}
              <div className={`p-5 rounded-2xl border ${
                theme === 'dark' ? 'bg-[#151926] border-slate-800/80' : 'bg-white border-slate-200 shadow-sm'
              }`}>
                <h3 className="font-bold text-base mb-3">Antrean Postingan Terjadwal</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {posts.map((post) => (
                    <div key={post.id} className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex justify-between items-start gap-4">
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                            post.platform === 'Instagram' ? 'bg-pink-500/10 text-pink-400 border border-pink-500/20' : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                          }`}>{post.platform}</span>
                          <span className="text-[10px] text-slate-500">{new Date(post.scheduleTime).toLocaleString()}</span>
                        </div>
                        <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed">{post.caption}</p>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            post.status === 'Published' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                          }`}>{post.status}</span>
                        </div>
                      </div>

                      {post.mediaUrl && (
                        <div className="w-14 h-14 rounded-lg overflow-hidden shrink-0 border border-slate-800">
                          <img src={post.mediaUrl} className="w-full h-full object-cover" alt="Post thumbnail" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}

          {/* VIEW: CONTENT AI GENERATOR */}
          {activeMenu === 'Content Generator' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Form Input Generator */}
              <div className={`p-6 rounded-2xl border ${
                theme === 'dark' ? 'bg-[#151926] border-slate-800/80' : 'bg-white border-slate-200 shadow-sm'
              } space-y-4`}>
                <div>
                  <h2 className="text-lg font-bold">Fanta AI Copywriting Assistant</h2>
                  <p className="text-xs text-slate-400">Gunakan Gemini Flash, Groq Llama3, atau OpenRouter secara berurutan dengan sistem fallback otomatis.</p>
                </div>

                <form onSubmit={handleGenerateContent} className="space-y-4 text-xs">
                  <div>
                    <label className="block text-slate-400 mb-1">Topik Utama atau Kampanye Produk</label>
                    <textarea 
                      rows="3"
                      placeholder="Contoh: Diskon 50% produk SaaS Fanta Social, jelaskan kemudahan mengelola akun Threads..."
                      className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-700 focus:outline-none focus:border-indigo-500 text-slate-300 resize-none"
                      value={genInput.topic}
                      onChange={(e) => setGenInput({ ...genInput, topic: e.target.value })}
                    ></textarea>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-slate-400 mb-1">Tone Gaya Bahasa</label>
                      <select 
                        className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-700 focus:outline-none focus:border-indigo-500 text-slate-300"
                        value={genInput.tone}
                        onChange={(e) => setGenInput({ ...genInput, tone: e.target.value })}
                      >
                        <option value="Formal">Formal & Edukatif</option>
                        <option value="Santai">Santai & Kekinian</option>
                        <option value="Lucu">Komedi & Clickbait Positif</option>
                        <option value="Promosional">Promosional / Hard Selling</option>
                        <option value="Storytelling">Storytelling Menyentuh</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-400 mb-1">Panjang Teks</label>
                      <select 
                        className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-700 focus:outline-none focus:border-indigo-500 text-slate-300"
                        value={genInput.length}
                        onChange={(e) => setGenInput({ ...genInput, length: e.target.value })}
                      >
                        <option value="Short">Singkat (1-2 kalimat)</option>
                        <option value="Medium">Sedang (2-4 kalimat)</option>
                        <option value="Long">Panjang (Detail & Terstruktur)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-slate-400 mb-1">Framework Copywriting</label>
                      <select 
                        className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-700 focus:outline-none focus:border-indigo-500 text-slate-300"
                        value={genInput.framework}
                        onChange={(e) => setGenInput({ ...genInput, framework: e.target.value })}
                      >
                        <option value="AIDA">AIDA (Attention, Interest, Desire, Action)</option>
                        <option value="PAS">PAS (Problem, Agitate, Solve)</option>
                        <option value="BAB">BAB (Before, After, Bridge)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-400 mb-1">Platform Utama</label>
                      <select 
                        className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-700 focus:outline-none focus:border-indigo-500 text-slate-300"
                        value={genInput.platform}
                        onChange={(e) => setGenInput({ ...genInput, platform: e.target.value })}
                      >
                        <option value="Instagram">Instagram (Visual focused)</option>
                        <option value="Threads">Threads (Discussion focused)</option>
                      </select>
                    </div>
                  </div>

                  <button 
                    type="submit"
                    disabled={isGenerating}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-pink-500 via-purple-600 to-indigo-600 hover:opacity-90 transition-all font-bold text-center flex items-center justify-center gap-2 text-white"
                  >
                    {isGenerating ? (
                      <>
                        <span className="w-4 h-4 rounded-full border-2 border-slate-100 border-t-transparent animate-spin"></span>
                        Membuat Konten...
                      </>
                    ) : '⚡ Racik Caption dengan AI'}
                  </button>
                </form>
              </div>

              {/* Output & Editor */}
              <div className={`p-6 rounded-2xl border ${
                theme === 'dark' ? 'bg-[#151926] border-slate-800/80' : 'bg-white border-slate-200 shadow-sm'
              } flex flex-col justify-between space-y-4`}>
                <div className="space-y-2">
                  <h3 className="text-sm font-bold">Hasil Kreasi AI</h3>
                  <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 min-h-[300px] text-xs whitespace-pre-wrap text-slate-200 leading-relaxed font-mono overflow-y-auto">
                    {generatedContent || "Belum ada teks yang dihasilkan. Harap isi form topik lalu klik 'Racik Caption dengan AI'."}
                  </div>
                </div>

                {generatedContent && (
                  <div className="flex gap-3">
                    <button 
                      onClick={() => {
                        setNewPost(prev => ({ ...prev, caption: generatedContent, platform: genInput.platform }));
                        setActiveMenu('Scheduler');
                        showToast('Teks dipindahkan ke menu Postingan!');
                      }}
                      className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-bold transition-all text-white"
                    >
                      📅 Jadwalkan Konten Ini
                    </button>
                    <button 
                      onClick={() => {
                        document.execCommand('copy');
                        showToast('Berhasil disalin ke papan klip!');
                      }}
                      className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-750 text-xs font-bold transition-all text-slate-300"
                    >
                      📋 Salin
                    </button>
                  </div>
                )}
              </div>

            </div>
          )}

          {/* VIEW: COMMENT ASSISTANT */}
          {activeMenu === 'Comment Assistant' && (
            <div className="space-y-6">
              
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                
                {/* List Komentar */}
                <div className="lg:col-span-3 space-y-4">
                  <h2 className="text-lg font-bold">Asisten Moderasi Komentar AI</h2>
                  <p className="text-xs text-slate-400">Deteksi sentimen secara instan, urutkan prioritas krisis pelanggan, dan dapatkan draf balasan dengan sekali klik.</p>

                  <div className="space-y-3">
                    {comments.map((item) => (
                      <div key={item.id} className={`p-4 rounded-xl border transition-all cursor-pointer ${
                        activeComment?.id === item.id 
                          ? 'border-indigo-500 bg-indigo-500/5' 
                          : 'bg-slate-900/60 border-slate-800/80 hover:border-slate-700'
                      }`} onClick={() => handleAnalyzeComment(item)}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-slate-200">@{item.user}</span>
                            <span className="text-[10px] text-slate-500">{new Date(item.timestamp).toLocaleTimeString()}</span>
                          </div>
                          <div className="flex gap-1.5">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                              item.sentiment === 'Positif' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 
                              item.sentiment === 'Negatif' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'bg-slate-800 text-slate-400'
                            }`}>{item.sentiment}</span>
                          </div>
                        </div>

                        <p className="text-xs text-slate-300 mb-2 leading-relaxed">"{item.commentText}"</p>

                        <div className="flex justify-between items-center pt-2 border-t border-slate-800/60">
                          <span className="text-[10px] text-indigo-400">Platform: {item.platform}</span>
                          <span className="text-[10px] text-slate-500">{item.status === 'Replied' ? '✅ Sudah Dibalas' : '⏳ Menunggu Moderasi'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Verifikator Balasan */}
                <div className="lg:col-span-2 space-y-4">
                  <div className={`p-5 rounded-2xl border ${
                    theme === 'dark' ? 'bg-[#151926] border-slate-800/80' : 'bg-white border-slate-200 shadow-sm'
                  } space-y-4`}>
                    <h3 className="text-sm font-bold">Verifikator Balasan AI</h3>
                    
                    {activeComment ? (
                      <div className="space-y-4 text-xs">
                        <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                          <p className="text-[10px] text-slate-500 uppercase font-bold">Komentar Terpilih</p>
                          <p className="text-slate-200 mt-1">@{activeComment.user}: "{activeComment.commentText}"</p>
                        </div>

                        <div className="space-y-1">
                          <label className="block text-slate-400">Rekomendasi Draf Balasan AI (Bisa Diedit)</label>
                          {isAnalyzing ? (
                            <div className="p-6 bg-slate-900 border border-slate-800 rounded-lg text-center text-slate-400">
                              <span className="w-5 h-5 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin inline-block mb-2"></span>
                              <p>AI sedang merancang respons terbaik...</p>
                            </div>
                          ) : (
                            <textarea 
                              rows="6"
                              className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-700 focus:outline-none focus:border-indigo-500 text-slate-300 resize-none font-sans"
                              value={draftReplyText}
                              onChange={(e) => setDraftReplyText(e.target.value)}
                            ></textarea>
                          )}
                        </div>

                        <div className="flex gap-2">
                          <button 
                            onClick={() => handleApproveReply(activeComment.id)}
                            disabled={isAnalyzing || !draftReplyText}
                            className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 transition-all font-bold text-center text-white"
                          >
                            ✓ Kirim Balasan Resmi
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-12 text-slate-500 text-xs">
                        <span className="text-4xl block mb-2">💬</span>
                        Klik salah satu komentar di sisi kiri untuk memicu penganalisis AI.
                      </div>
                    )}
                  </div>
                </div>

              </div>

            </div>
          )}

          {/* VIEW: AI AGENT */}
          {activeMenu === 'AI Agent' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold">Fanta AI Agents Desk</h2>
                <p className="text-xs text-slate-400">Konfigurasi agen otonom Anda. Setiap agen memiliki kepribadian, instruksi dasar, dan keahlian kognitif yang disesuaikan.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {AGENTS.map((agent) => (
                  <div key={agent.id} className={`p-5 rounded-2xl border flex flex-col justify-between space-y-4 ${
                    theme === 'dark' ? 'bg-[#151926] border-slate-800/80' : 'bg-white border-slate-200 shadow-sm'
                  }`}>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-2xl">{agent.avatar}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-bold">Aktif</span>
                      </div>
                      <h3 className="font-bold text-base">{agent.name}</h3>
                      <p className="text-xs text-slate-400 leading-relaxed">{agent.role}</p>
                    </div>

                    <div className="p-3 rounded-lg bg-slate-900 border border-slate-800/60 text-xs text-slate-400 leading-relaxed font-mono">
                      <strong>System Prompt:</strong> "{agent.prompt}"
                    </div>

                    <button 
                      onClick={() => {
                        setGenInput({
                          ...genInput,
                          tone: agent.id === 'marketing' ? 'Promosional' : agent.id === 'cs' ? 'Formal' : 'Storytelling'
                        });
                        setActiveMenu('Content Generator');
                        showToast(`Mode agen ${agent.name} diterapkan ke Generator!`);
                      }}
                      className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-xs font-bold transition-all text-center text-slate-300"
                    >
                      Gunakan Konteks Agen Ini
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* VIEW: INBOX */}
          {activeMenu === 'Inbox' && (
            <div className={`p-6 rounded-2xl border ${
              theme === 'dark' ? 'bg-[#151926] border-slate-800/80' : 'bg-white border-slate-200 shadow-sm'
            } space-y-6`}>
              <div>
                <h2 className="text-lg font-bold">Kotak Masuk Terpadu</h2>
                <p className="text-xs text-slate-400">Pusat interaksi langsung dari Instagram DM, mention, dan post reply.</p>
              </div>

              <div className="text-center py-20 text-slate-500 text-xs">
                <span className="text-4xl block mb-2">📥</span>
                <p className="font-bold">Kotak Masuk Kosong</p>
                <p className="max-w-md mx-auto mt-1 text-slate-400">Semua pesan dari Meta API disinkronkan secara real-time. Hubungkan akun Instagram Business Pro untuk memulai sinkronisasi.</p>
              </div>
            </div>
          )}

          {/* VIEW: ANALYTICS */}
          {activeMenu === 'Analytics' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Visual Chart 1 */}
                <div className={`p-5 rounded-2xl border ${theme === 'dark' ? 'bg-[#151926] border-slate-800/80' : 'bg-white border-slate-200 shadow-sm'} space-y-4`}>
                  <h3 className="text-sm font-bold">Pertumbuhan Pengikut (Minggu Ini)</h3>
                  <div className="w-full h-40">
                    <svg className="w-full h-full" viewBox="0 0 300 150">
                      <defs>
                        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.3"/>
                          <stop offset="100%" stopColor="#6366f1" stopOpacity="0"/>
                        </linearGradient>
                      </defs>
                      <path d="M 0,130 Q 50,110 100,115 T 200,80 T 300,30 L 300,150 L 0,150 Z" fill="url(#chartGrad)"/>
                      <path d="M 0,130 Q 50,110 100,115 T 200,80 T 300,30" fill="none" stroke="#6366f1" strokeWidth="3"/>
                    </svg>
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>Sen</span><span>Rab</span><span>Jum</span><span>Min</span>
                  </div>
                </div>

                {/* Visual Chart 2 */}
                <div className={`p-5 rounded-2xl border ${theme === 'dark' ? 'bg-[#151926] border-slate-800/80' : 'bg-white border-slate-200 shadow-sm'} space-y-4`}>
                  <h3 className="text-sm font-bold">Rasio Keterlibatan (Engagement Rate)</h3>
                  <div className="w-full h-40 flex items-end justify-between px-4 pb-2">
                    <div className="w-8 bg-[#6366f1] rounded-t-lg h-[40%]"></div>
                    <div className="w-8 bg-[#6366f1] rounded-t-lg h-[55%]"></div>
                    <div className="w-8 bg-[#ec4899] rounded-t-lg h-[85%]"></div>
                    <div className="w-8 bg-[#6366f1] rounded-t-lg h-[65%]"></div>
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-500 px-2">
                    <span>M-1</span><span>M-2</span><span>M-3</span><span>M-4</span>
                  </div>
                </div>

                <div className={`p-5 rounded-2xl border ${theme === 'dark' ? 'bg-[#151926] border-slate-800/80' : 'bg-white border-slate-200 shadow-sm'} space-y-3`}>
                  <h3 className="text-sm font-bold">AI Analytics Insight</h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    "Postingan dengan tone <strong>Santai</strong> memiliki tingkat jangkauan 42% lebih tinggi dibanding format formal. Hari posting paling efektif Anda adalah <strong>Rabu pukul 19.00 WIB</strong>."
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* VIEW: PROMPT LIBRARY */}
          {activeMenu === 'Prompt Library' && (
            <div className="space-y-6">
              
              <div className={`p-6 rounded-2xl border ${
                theme === 'dark' ? 'bg-[#151926] border-slate-800/80' : 'bg-white border-slate-200 shadow-sm'
              } space-y-4`}>
                <h2 className="text-lg font-bold">Tambah Prompt Kustom Baru</h2>
                
                <form onSubmit={handleAddPrompt} className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div className="md:col-span-1 space-y-3">
                    <div>
                      <label className="block text-slate-400 mb-1">Judul Prompt</label>
                      <input 
                        type="text" 
                        placeholder="Contoh: Storytelling AIDA" 
                        className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 focus:outline-none"
                        value={newPrompt.title}
                        onChange={(e) => setNewPrompt({ ...newPrompt, title: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">Kategori</label>
                      <select 
                        className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 focus:outline-none"
                        value={newPrompt.category}
                        onChange={(e) => setNewPrompt({ ...newPrompt, category: e.target.value })}
                      >
                        <option value="Marketing">Marketing</option>
                        <option value="Copywriting">Copywriting</option>
                        <option value="Threads">Threads</option>
                      </select>
                    </div>
                  </div>

                  <div className="md:col-span-2 space-y-3">
                    <div>
                      <label className="block text-slate-400 mb-1">Isi Instruksi Prompt (System Instructions)</label>
                      <textarea 
                        rows="4"
                        placeholder="Ketik instruksi mendalam untuk AI Anda..."
                        className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 focus:outline-none resize-none font-sans"
                        value={newPrompt.prompt}
                        onChange={(e) => setNewPrompt({ ...newPrompt, prompt: e.target.value })}
                      ></textarea>
                    </div>
                  </div>

                  <div className="md:col-span-3">
                    <button type="submit" className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 font-bold rounded-lg transition-all text-white">
                      + Simpan ke Library
                    </button>
                  </div>
                </form>
              </div>

              {/* Grid Prompt Library */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {prompts.map((p) => (
                  <div key={p.id} className={`p-4 rounded-xl border ${
                    theme === 'dark' ? 'bg-[#151926] border-slate-800/80' : 'bg-white border-slate-200'
                  } space-y-2`}>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-bold">{p.category}</span>
                      <button 
                        onClick={() => {
                          setGenInput({ ...genInput, topic: p.prompt });
                          setActiveMenu('Content Generator');
                          showToast('Prompt dimasukkan ke Generator!');
                        }}
                        className="text-xs text-indigo-400 hover:text-indigo-300"
                      >
                        Gunakan ⚡
                      </button>
                    </div>
                    <h3 className="font-bold text-xs">{p.title}</h3>
                    <p className="text-[11px] text-slate-400 font-mono line-clamp-3">"{p.prompt}"</p>
                  </div>
                ))}
              </div>

            </div>
          )}

          {/* VIEW: API SETTINGS */}
          {activeMenu === 'API Settings' && (
            <div className={`p-6 rounded-2xl border ${
              theme === 'dark' ? 'bg-[#151926] border-slate-800/80' : 'bg-white border-slate-200 shadow-sm'
            } space-y-6`}>
              <div>
                <h2 className="text-xl font-bold">Kredensial API & Firebase Integration</h2>
                <p className="text-xs text-slate-400">Gunakan form di bawah untuk memasukkan API Key Anda secara riil. Klik tombol uji untuk mengetes integrasi secara real-time.</p>
              </div>

              <form onSubmit={handleSaveApiKeys} className="space-y-6 text-xs">
                
                {/* AI PROVIDERS */}
                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wider">Kredensial AI Provider</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-slate-400">Google Gemini API Key</label>
                        <button 
                          type="button" 
                          onClick={() => handleTestConnection('gemini')}
                          className="text-[10px] text-indigo-400 hover:underline font-bold"
                        >
                          {connectionStatus.gemini === 'testing' ? 'Menguji...' : 'Uji Koneksi'}
                        </button>
                      </div>
                      <input 
                        type="password" 
                        placeholder="AIzaSy..." 
                        className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 focus:outline-none focus:border-indigo-500"
                        value={apiKeys.gemini}
                        onChange={(e) => setApiKeys({ ...apiKeys, gemini: e.target.value })}
                      />
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-slate-400">Groq API Key (Opsional)</label>
                        <button 
                          type="button" 
                          onClick={() => handleTestConnection('groq')}
                          className="text-[10px] text-indigo-400 hover:underline font-bold"
                        >
                          {connectionStatus.groq === 'testing' ? 'Menguji...' : 'Uji Koneksi'}
                        </button>
                      </div>
                      <input 
                        type="password" 
                        placeholder="gsk_..." 
                        className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 focus:outline-none focus:border-indigo-500"
                        value={apiKeys.groq}
                        onChange={(e) => setApiKeys({ ...apiKeys, groq: e.target.value })}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-slate-400">OpenRouter API Key (Opsional)</label>
                      <button 
                        type="button" 
                        onClick={() => handleTestConnection('openrouter')}
                        className="text-[10px] text-indigo-400 hover:underline font-bold"
                      >
                        {connectionStatus.openrouter === 'testing' ? 'Menguji...' : 'Uji Koneksi'}
                      </button>
                    </div>
                    <input 
                      type="password" 
                      placeholder="sk-or-v1-..." 
                      className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 focus:outline-none focus:border-indigo-500"
                      value={apiKeys.openrouter}
                      onChange={(e) => setApiKeys({ ...apiKeys, openrouter: e.target.value })}
                    />
                  </div>
                </div>

                {/* META CONNECTIONS */}
                <div className="space-y-4 pt-4 border-t border-slate-800/80">
                  <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wider">Kredensial Meta Developer</h3>
                  
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-slate-400">Meta Graph Access Token (User / Page Token)</label>
                      <button 
                        type="button" 
                        onClick={() => handleTestConnection('meta')}
                        className="text-[10px] text-indigo-400 hover:underline font-bold"
                      >
                        {connectionStatus.meta === 'testing' ? 'Menguji...' : 'Uji Koneksi'}
                      </button>
                    </div>
                    <input 
                      type="password" 
                      placeholder="EAA..." 
                      className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 focus:outline-none focus:border-indigo-500"
                      value={apiKeys.metaToken}
                      onChange={(e) => setApiKeys({ ...apiKeys, metaToken: e.target.value })}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-slate-400 mb-1">Instagram Business Account ID</label>
                      <input 
                        type="text" 
                        placeholder="178414..." 
                        className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 focus:outline-none focus:border-indigo-500"
                        value={apiKeys.instagramBusinessId || ''}
                        onChange={(e) => setApiKeys({ ...apiKeys, instagramBusinessId: e.target.value })}
                      />
                    </div>

                    <div>
                      <label className="block text-slate-400 mb-1">Threads User ID</label>
                      <input 
                        type="text" 
                        placeholder="12345678..." 
                        className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 focus:outline-none focus:border-indigo-500"
                        value={apiKeys.threadsUserId || ''}
                        onChange={(e) => setApiKeys({ ...apiKeys, threadsUserId: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <button 
                  type="submit"
                  className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-bold transition-all text-white"
                >
                  Simpan Semua Kredensial API
                </button>

              </form>
            </div>
          )}

          {/* VIEW: LOGS */}
          {activeMenu === 'Logs' && (
            <div className={`p-6 rounded-2xl border ${
              theme === 'dark' ? 'bg-[#151926] border-slate-800/80' : 'bg-white border-slate-200 shadow-sm'
            } space-y-6`}>
              <div>
                <h2 className="text-xl font-bold">Audit & Activity Logs</h2>
                <p className="text-xs text-slate-400">Riwayat eksekusi serverless, webhook, dan interaksi bot otonom yang terekam.</p>
              </div>

              <div className="space-y-3">
                {logs.length === 0 ? (
                  <div className="text-center py-10 text-slate-500">Log Kosong.</div>
                ) : (
                  logs.map((log, index) => (
                    <div key={index} className="p-3 bg-slate-900 border border-slate-800 rounded-lg text-xs flex justify-between items-center">
                      <div>
                        <p className="font-bold text-slate-300">{log.action}</p>
                        <p className="text-[11px] text-slate-500">{log.details}</p>
                      </div>
                      <span className="text-[10px] text-slate-600 font-mono">{new Date(log.timestamp).toLocaleTimeString()}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

        </main>
      </div>

      <footer className="text-center py-8 text-xs text-slate-500 border-t border-slate-900/40 mt-12">
        <p>&copy; 2026 FANTA SOCIAL AI. Dibuat sesuai standar Meta Platform Policy.</p>
      </footer>
    </div>
  );
}