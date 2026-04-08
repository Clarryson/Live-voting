import express from 'express';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin
// In this environment, we don't have a service account JSON, 
// so we'll try to initialize with the project ID from the config.
import firebaseConfig from './firebase-applet-config.json' with { type: 'json' };

const adminApp = getApps().length === 0 
  ? initializeApp({ projectId: firebaseConfig.projectId })
  : getApps()[0];

const db = getFirestore(adminApp, firebaseConfig.firestoreDatabaseId);
const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3000;

// API Endpoints for the voting flow

// 1. Request 2FA Token
app.post('/api/request-token', async (req, res) => {
  const { admissionNumber } = req.body;
  if (!admissionNumber) return res.status(400).json({ error: 'Admission Number is required' });

  try {
    const safeId = admissionNumber.trim().replace(/\//g, '_');
    // Check if voter exists and hasn't voted
    const voterRef = db.collection('voters').doc(safeId);
    const voterDoc = await voterRef.get();

    if (!voterDoc.exists) {
      return res.status(404).json({ error: 'Admission Number not found in eligible list' });
    }

    const voterData = voterDoc.data();
    if (voterData?.hasVoted) {
      return res.status(403).json({ error: 'You have already voted' });
    }

    // Generate 6-digit token
    const token = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

    // Store token
    await db.collection('tokens').doc(safeId).set({
      admissionNumber,
      token,
      expiresAt: expiresAt.toISOString(),
    });

    // In a real app, send email here. For demo, we'll return it (or log it)
    console.log(`[DEMO] Token for ${voterData?.email}: ${token}`);
    
    res.json({ message: 'Token sent to your student email', email: voterData?.email, demoToken: token });
  } catch (error) {
    console.error('Error requesting token:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 2. Cast Vote
app.post('/api/cast-vote', async (req, res) => {
  const { admissionNumber, token, candidateId } = req.body;
  if (!admissionNumber || !token || !candidateId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // 1. Check election status
    const configDoc = await db.collection('config').doc('config').get();
    if (!configDoc.exists) return res.status(500).json({ error: 'Election configuration not found' });
    
    const config = configDoc.data();
    const now = new Date();
    const openingTime = new Date(config?.openingTime);
    const closingTime = new Date(config?.closingTime);

    if (now < openingTime) return res.status(403).json({ error: 'Election has not started yet' });
    if (now > closingTime) return res.status(403).json({ error: 'Election has ended' });
    if (config?.status !== 'live') return res.status(403).json({ error: 'Election is not live' });

    const safeId = admissionNumber.trim().replace(/\//g, '_');

    // 2. Verify token
    const tokenRef = db.collection('tokens').doc(safeId);
    const tokenDoc = await tokenRef.get();

    if (!tokenDoc.exists || tokenDoc.data()?.token !== token) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const expiresAt = new Date(tokenDoc.data()?.expiresAt);
    if (now > expiresAt) {
      return res.status(401).json({ error: 'Token has expired' });
    }

    // 3. Check if voter exists and has voted
    const voterRef = db.collection('voters').doc(safeId);
    const voterDoc = await voterRef.get();
    
    if (!voterDoc.exists) {
      return res.status(404).json({ error: 'Voter record not found' });
    }
    
    if (voterDoc.data()?.hasVoted) {
      return res.status(403).json({ error: 'You have already voted' });
    }

    // 4. Atomic Transaction: Mark as voted, record anonymous vote, increment candidate
    await db.runTransaction(async (transaction) => {
      const candidateRef = db.collection('candidates').doc(candidateId);
      const candidateDoc = await transaction.get(candidateRef);
      if (!candidateDoc.exists) throw new Error('Candidate not found');

      // Mark voter as voted
      transaction.update(voterRef, { hasVoted: true });

      // Add anonymous vote
      const voteRef = db.collection('votes').doc();
      transaction.set(voteRef, {
        candidateId,
        faculty: voterDoc.data()?.faculty,
        timestamp: now.toISOString(),
      });

      // Increment candidate vote count
      transaction.update(candidateRef, {
        voteCount: FieldValue.increment(1),
      });

      // Delete token
      transaction.delete(tokenRef);
    });

    res.json({ message: 'Vote cast successfully' });
  } catch (error) {
    console.error('Error casting vote:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
  }
});

// Vite middleware for development
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
