import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { auth } from '../lib/firebase';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

import { motion, AnimatePresence } from 'motion/react';
import { Shield, Mail, CheckCircle2, AlertCircle, ArrowRight, Loader2, UserCheck, Vote } from 'lucide-react';
import { cn } from '../lib/utils';

export default function VotingFlow({ config }: { config: any }) {
  const [step, setStep] = useState<'identify' | 'verify' | 'ballot' | 'success'>('identify');
  const [admissionNumber, setAdmissionNumber] = useState('');
  const [token, setToken] = useState('');
  const [candidates, setCandidates] = useState<any[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [demoToken, setDemoToken] = useState('');
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [showRegistrationError, setShowRegistrationError] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Sync offline votes on mount or when online
  useEffect(() => {
    if (!isOffline) {
      const offlineVote = localStorage.getItem('pending_vote');
      if (offlineVote) {
        const voteData = JSON.parse(offlineVote);
        syncVote(voteData);
      }
    }
  }, [isOffline]);

  const syncVote = async (voteData: any) => {
    try {
      const res = await fetch('/api/cast-vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(voteData),
      });
      if (res.ok) {
        localStorage.removeItem('pending_vote');
        setStep('success');
      }
    } catch (err) {
      console.error('Failed to sync offline vote:', err);
    }
  };

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'candidates'), orderBy('name')), (snap) => {
      setCandidates(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'candidates');
    });
    return () => unsub();
  }, []);

  const handleRequestToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isOffline) {
      setError('You are currently offline. Token request requires a connection.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/request-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admissionNumber }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      setEmail(data.email);
      setDemoToken(data.demoToken); // For demo purposes
      setStep('verify');
    } catch (err: any) {
      if (err.message.includes('not registered to vote')) {
        setShowRegistrationError(true);
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setStep('ballot');
    setLoading(false);
  };

  const handleCastVote = async () => {
    if (!selectedCandidate) return;
    const voteData = { admissionNumber, token, candidateId: selectedCandidate };
    
    if (isOffline) {
      localStorage.setItem('pending_vote', JSON.stringify(voteData));
      setStep('success');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/cast-vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(voteData),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      setStep('success');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const isElectionLive = config?.status === 'live';
  const now = new Date();
  const openingTime = config?.openingTime ? new Date(config.openingTime) : null;
  const closingTime = config?.closingTime ? new Date(config.closingTime) : null;
  
  const isBeforeOpening = openingTime && now < openingTime;
  const isAfterClosing = closingTime && now > closingTime;
  const isPaused = config?.status === 'paused';
  const isEnded = config?.status === 'ended' || isAfterClosing;

  if ((!isElectionLive || isBeforeOpening || isAfterClosing) && step !== 'success') {
    return (
      <div className="max-w-md mx-auto text-center py-20 px-6">
        <div className="w-24 h-24 bg-zinc-900 rounded-3xl flex items-center justify-center mx-auto mb-8 border border-zinc-800 shadow-2xl relative overflow-hidden group">
          <div className="absolute inset-0 bg-amber-500/5 group-hover:bg-amber-500/10 transition-colors" />
          <Clock className={cn("text-zinc-500 relative z-10 transition-transform duration-500", isBeforeOpening && "animate-pulse text-amber-500")} size={48} />
        </div>
        
        <h2 className="text-3xl font-black uppercase tracking-tighter mb-4 text-white">
          {isBeforeOpening ? 'Election Opening Soon' : isEnded ? 'Election Concluded' : isPaused ? 'Voting Paused' : 'Voting Unavailable'}
        </h2>
        
        <p className="text-zinc-500 mb-10 text-sm leading-relaxed">
          {isBeforeOpening 
            ? `The election is scheduled to begin on ${openingTime?.toLocaleString()}. Please return then to cast your vote.`
            : isEnded 
              ? 'The voting period has officially ended. Thank you for participating in the democratic process. Results are being finalized.'
              : isPaused
                ? 'The election has been temporarily paused by the administrators for maintenance. Please check back shortly.'
                : 'The election is currently not accepting votes. Please contact the administration for more information.'}
        </p>

        <div className="grid grid-cols-1 gap-4">
          <div className="p-6 bg-zinc-900/50 border border-zinc-800 rounded-2xl text-left">
            <p className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em] mb-3">Election Status Report</p>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs text-zinc-400">Operational Status</span>
                <span className={cn(
                  "text-[10px] font-black px-2 py-1 rounded-md uppercase tracking-widest",
                  isElectionLive ? "bg-green-500/10 text-green-500" : isPaused ? "bg-amber-500/10 text-amber-500" : "bg-red-500/10 text-red-500"
                )}>
                  {config?.status?.toUpperCase() || 'OFFLINE'}
                </span>
              </div>
              {openingTime && (
                <div className="flex justify-between items-center">
                  <span className="text-xs text-zinc-400">Opening Time</span>
                  <span className="text-xs font-mono text-zinc-300">{openingTime.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
                </div>
              )}
              {closingTime && (
                <div className="flex justify-between items-center">
                  <span className="text-xs text-zinc-400">Closing Time</span>
                  <span className="text-xs font-mono text-zinc-300">{closingTime.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
                </div>
              )}
            </div>
          </div>
          
          <button 
            onClick={() => window.location.reload()}
            className="w-full py-4 bg-zinc-900 border border-zinc-800 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-zinc-800 transition-all"
          >
            Refresh Status
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto relative">
      {/* Election Branding */}
      <div className="flex flex-col items-center mb-8 text-center">
        {config?.bannerUrl && (
          <img 
            src={config.bannerUrl} 
            alt="Election Banner" 
            className="w-24 h-24 sm:w-32 sm:h-32 rounded-3xl object-cover border-2 border-zinc-800 shadow-2xl mb-4" 
            referrerPolicy="no-referrer"
          />
        )}
        <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-white px-4">
          {config?.electionName || 'Mulembe Nation University Guild Elections 2025'}
        </h1>
      </div>

      {/* Offline Indicator */}
      <AnimatePresence>
        {isOffline && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute -top-12 left-0 right-0 flex justify-center z-50"
          >
            <div className="bg-amber-500 text-zinc-950 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-amber-500/20">
              <div className="w-2 h-2 rounded-full bg-zinc-950 animate-pulse" />
              Offline Mode Active – Votes will sync on reconnect
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence mode="wait">
        {step === 'identify' && (
          <motion.div 
            key="identify"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-zinc-900/50 border border-zinc-800 p-8 rounded-3xl backdrop-blur-sm"
          >
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center text-amber-500">
                <Shield size={24} />
              </div>
              <div>
                <h2 className="text-xl font-bold">Voter Identification</h2>
                <p className="text-sm text-zinc-500">Enter your admission number to begin.</p>
              </div>
            </div>

            <form onSubmit={handleRequestToken} className="space-y-6">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">Admission Number</label>
                <input 
                  type="text"
                  required
                  placeholder="e.g. BIT/001/2021"
                  value={admissionNumber}
                  onChange={(e) => setAdmissionNumber(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 focus:outline-none focus:border-amber-500 transition-colors font-mono"
                />
              </div>

              {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-500 text-sm">
                  <AlertCircle size={18} />
                  <p>{error}</p>
                </div>
              )}

              <button 
                type="submit"
                disabled={loading}
                className="w-full bg-amber-500 text-zinc-950 font-bold py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-amber-400 transition-colors disabled:opacity-50"
              >
                {loading ? <Loader2 className="animate-spin" /> : <>Continue <ArrowRight size={18} /></>}
              </button>
            </form>
          </motion.div>
        )}

        {step === 'verify' && (
          <motion.div 
            key="verify"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-zinc-900/50 border border-zinc-800 p-8 rounded-3xl backdrop-blur-sm"
          >
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 bg-blue-500/10 border border-blue-500/20 rounded-2xl flex items-center justify-center text-blue-500">
                <Mail size={24} />
              </div>
              <div>
                <h2 className="text-xl font-bold">Two-Factor Verification</h2>
                <p className="text-sm text-zinc-500">A token has been sent to <span className="text-zinc-300 font-bold">{email}</span></p>
              </div>
            </div>

            <form onSubmit={handleVerifyToken} className="space-y-6">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">6-Digit Token</label>
                <input 
                  type="text"
                  required
                  maxLength={6}
                  placeholder="000000"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors text-center text-2xl font-mono tracking-[1em]"
                />
              </div>

              {demoToken && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-500 text-center">
                  <span className="font-bold">DEMO MODE:</span> Use token <span className="font-mono font-bold">{demoToken}</span>
                </div>
              )}

              <button 
                type="submit"
                className="w-full bg-blue-500 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-blue-400 transition-colors"
              >
                Verify Identity <ArrowRight size={18} />
              </button>
            </form>
          </motion.div>
        )}

        {step === 'ballot' && (
          <motion.div 
            key="ballot"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-3xl backdrop-blur-sm flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-green-500/10 border border-green-500/20 rounded-xl flex items-center justify-center text-green-500">
                  <UserCheck size={20} />
                </div>
                <div>
                  <h2 className="font-bold">Identity Verified</h2>
                  <p className="text-xs text-zinc-500">{admissionNumber}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Ballot Status</p>
                <p className="text-xs font-bold text-green-500">ANONYMOUS</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {candidates.map((candidate) => (
                <button
                  key={candidate.id}
                  onClick={() => setSelectedCandidate(candidate.id)}
                  className={cn(
                    "p-6 rounded-3xl border text-left transition-all relative overflow-hidden group",
                    selectedCandidate === candidate.id 
                      ? "bg-amber-500/20 border-amber-500 shadow-lg shadow-amber-500/10" 
                      : "bg-zinc-900/50 border-zinc-800 hover:border-zinc-700"
                  )}
                >
                  <div className="flex items-center gap-4 mb-4">
                    {candidate.imageUrl ? (
                      <img 
                        src={candidate.imageUrl} 
                        alt={candidate.name} 
                        className="w-16 h-16 rounded-2xl object-cover border border-zinc-800" 
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-2xl font-bold">
                        {candidate.name[0]}
                      </div>
                    )}
                    <div>
                      <h3 className="font-bold text-lg">{candidate.name}</h3>
                      <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest">{candidate.role} • {candidate.faculty}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-bold text-zinc-400">
                    <Vote size={14} />
                    <span>Select Candidate</span>
                  </div>
                  {selectedCandidate === candidate.id && (
                    <div className="absolute top-4 right-4 text-amber-500">
                      <CheckCircle2 size={24} />
                    </div>
                  )}
                </button>
              ))}
            </div>

            {error && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-500 text-sm">
                <AlertCircle size={18} />
                <p>{error}</p>
              </div>
            )}

            <button 
              onClick={handleCastVote}
              disabled={!selectedCandidate || loading}
              className="w-full bg-amber-500 text-zinc-950 font-bold py-5 rounded-3xl flex items-center justify-center gap-3 hover:bg-amber-400 transition-all disabled:opacity-50 shadow-xl shadow-amber-500/20"
            >
              {loading ? <Loader2 className="animate-spin" /> : <>Cast Anonymous Ballot <CheckCircle2 size={20} /></>}
            </button>
          </motion.div>
        )}

        {step === 'success' && (
          <motion.div 
            key="success"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-md mx-auto text-center py-12"
          >
            <div className="w-24 h-24 bg-green-500/10 border border-green-500/20 rounded-full flex items-center justify-center mx-auto mb-8 text-green-500">
              <CheckCircle2 size={48} />
            </div>
            <h2 className="text-3xl font-bold mb-4">Vote Cast Successfully!</h2>
            <p className="text-zinc-500 mb-8">Thank you for participating in the {config?.electionName || 'Mulembe Nation University Guild Elections'}. Your vote has been recorded anonymously.</p>
            <button 
              onClick={() => window.location.reload()}
              className="px-8 py-3 bg-zinc-900 border border-zinc-800 rounded-xl font-bold hover:bg-zinc-800 transition-colors"
            >
              Return Home
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Registration Error Modal */}
      <AnimatePresence>
        {showRegistrationError && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-zinc-950/90 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl text-center"
            >
              <div className="w-20 h-20 bg-red-500/10 border border-red-500/20 rounded-3xl flex items-center justify-center mx-auto mb-6 text-red-500">
                <AlertCircle size={40} />
              </div>
              
              <h3 className="text-2xl font-black uppercase tracking-tighter text-white mb-4">
                Not Registered
              </h3>
              
              <p className="text-zinc-400 text-sm leading-relaxed mb-8">
                You are not registered to vote. Please seek clarification from the election administration or the Dean of Students office.
              </p>
              
              <div className="space-y-3">
                <button 
                  onClick={() => setShowRegistrationError(false)}
                  className="w-full py-4 bg-zinc-100 text-zinc-950 font-black rounded-2xl hover:bg-white transition-all uppercase tracking-widest text-xs"
                >
                  Understood
                </button>
                <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">
                  Reference ID: {admissionNumber}
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Clock(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
