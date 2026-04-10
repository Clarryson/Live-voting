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
  setDoc, 
  updateDoc, 
  deleteDoc,
  collection, 
  query, 
  where, 
  getDocs, 
  limit,
  runTransaction,
  increment
} from 'firebase/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase
import firebaseConfig from './firebase-applet-config.json' with { type: 'json' };

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3000;

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
