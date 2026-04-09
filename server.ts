import express from 'express';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  getDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  limit,
  runTransaction,
  increment
} from 'firebase/firestore';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Client SDK
import firebaseConfig from './firebase-applet-config.json' with { type: 'json' };
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

// Secret for signing dev admin tokens (HMAC-SHA256)
const DEV_TOKEN_SECRET = process.env.DEV_TOKEN_SECRET || 'dev-override-secret-change-in-prod';

const app = express();
app.use(cors());
app.use(express.json());

// Custom In-Memory Rate Limiter
const requestCounts = new Map<string, { count: number; timestamp: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS = 20;

const apiLimiter = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  
  const record = requestCounts.get(ip);
  if (!record || now - record.timestamp > WINDOW_MS) {
    requestCounts.set(ip, { count: 1, timestamp: now });
    next();
  } else {
    if (record.count >= MAX_REQUESTS) {
      res.status(429).json({ error: 'Too many requests from this IP, please try again after 15 minutes' });
    } else {
      record.count += 1;
      next();
    }
  }
};
app.use('/api/', apiLimiter);

const PORT = 3000;

// Admin master password (dev override)
const ADMIN_MASTER_PASSWORD = 'MulembeAdmin2025';

// Dev Admin Token endpoint — mints a signed HMAC token (no Firebase Admin SDK needed)
app.post('/api/admin-token', (req, res) => {
  const { password } = req.body;
  if (!password || password !== ADMIN_MASTER_PASSWORD) {
    return res.status(401).json({ error: 'Invalid master password' });
  }

  // Build a simple token: base64(payload).base64(signature)
  const payload = Buffer.from(JSON.stringify({
    uid: 'dev-admin-override',
    isDevAdmin: true,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 8, // 8-hour expiry
  })).toString('base64url');

  const sig = crypto
    .createHmac('sha256', DEV_TOKEN_SECRET)
    .update(payload)
    .digest('base64url');

  res.json({ token: `${payload}.${sig}` });
});

// API Endpoints for the voting flow

// 1. Identify Voter (Registration Check)
app.post('/api/identify-voter', async (req, res) => {
  const { admissionNumber, email } = req.body;
  if (!admissionNumber && !email) return res.status(400).json({ error: 'Admission Number or Email is required' });

  try {
    let voterData;
    let safeId;

    if (admissionNumber) {
      safeId = admissionNumber.trim().replace(/\//g, '_');
      const voterRef = doc(db, 'voters', safeId);
      const voterDoc = await getDoc(voterRef);
      if (!voterDoc.exists()) {
        return res.status(404).json({ error: 'You are not registered to vote. Seek clarification from admin.' });
      }
      voterData = voterDoc.data();
    } else {
      // Search by email
      const votersRef = collection(db, 'voters');
      const q = query(votersRef, where('email', '==', email.trim()), limit(1));
      const querySnapshot = await getDocs(q);
      if (querySnapshot.empty) {
        return res.status(404).json({ error: 'You are not registered to vote. Seek clarification from admin.' });
      }
      const voterDoc = querySnapshot.docs[0];
      voterData = voterDoc.data();
      safeId = voterDoc.id;
    }

    if (voterData?.hasVoted) {
      return res.status(403).json({ error: 'You have already voted' });
    }

    res.json({ 
      message: 'Voter identified', 
      email: voterData?.email, 
      admissionNumber: voterData?.admissionNumber
    });
  } catch (error) {
    console.error('Error identifying voter:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 2. Cast Vote
app.post('/api/cast-vote', async (req, res) => {
  const { admissionNumber, candidateId } = req.body;
  if (!admissionNumber || !candidateId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // 1. Check election status
    const configDoc = await getDoc(doc(db, 'config', 'config'));
    if (!configDoc.exists()) return res.status(500).json({ error: 'Election configuration not found' });
    
    const config = configDoc.data();
    const now = new Date();
    const openingTime = new Date(config?.openingTime);
    const closingTime = new Date(config?.closingTime);

    if (now < openingTime) return res.status(403).json({ error: 'Election has not started yet' });
    if (now > closingTime) return res.status(403).json({ error: 'Election has ended' });
    if (config?.status !== 'live') return res.status(403).json({ error: 'Election is not live' });

    const safeId = admissionNumber.trim().replace(/\//g, '_');

    // 2. Check if voter exists and has voted
    const voterRef = doc(db, 'voters', safeId);
    const voterDoc = await getDoc(voterRef);
    
    if (!voterDoc.exists()) {
      return res.status(404).json({ error: 'You are not registered to vote. Seek clarification from admin.' });
    }
    
    if (voterDoc.data()?.hasVoted) {
      return res.status(403).json({ error: 'You have already voted' });
    }

    // 3. Atomic Transaction: Mark as voted, record anonymous vote, increment candidate
    await runTransaction(db, async (transaction) => {
      const candidateRef = doc(db, 'candidates', candidateId);
      const candidateDoc = await transaction.get(candidateRef);
      if (!candidateDoc.exists()) throw new Error('Candidate not found');

      // Mark voter as voted
      transaction.update(voterRef, { hasVoted: true });

      // Add anonymous vote
      const voteRef = doc(collection(db, 'votes'));
      transaction.set(voteRef, {
        candidateId,
        faculty: voterDoc.data()?.faculty,
        timestamp: now.toISOString(),
      });

      // Increment candidate vote count
      transaction.update(candidateRef, {
        voteCount: increment(1),
      });
    });

    res.json({ message: 'Vote cast successfully' });
  } catch (error) {
    console.error('Error casting vote:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
  }
});

// Start listening immediately so API routes are available
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// Set up Vite middleware asynchronously (does NOT block API routes)
async function initVite() {
  if (process.env.NODE_ENV !== 'production') {
    try {
      const vite = await createViteServer({
        server: { 
          middlewareMode: true,
          hmr: { server },  // Reuse the existing HTTP server for HMR websocket
        },
        appType: 'spa',
      });
      app.use(vite.middlewares);
      console.log('Vite dev middleware ready');
    } catch (e) {
      console.error('Vite init failed:', e);
    }
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
}

initVite();
