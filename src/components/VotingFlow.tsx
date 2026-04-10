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
import { Shield, Mail, CheckCircle2, AlertCircle, ArrowRight, Loader2, UserCheck, Vote, X, Search } from 'lucide-react';
import { cn } from '../lib/utils';

export default function VotingFlow({ config }: { config: any }) {
  const [step, setStep] = useState<'identify' | 'verify' | 'ballot' | 'success'>('identify');
  const [idMode, setIdMode] = useState<'admission' | 'email'>('admission');
  const [admissionNumber, setAdmissionNumber] = useState('');
  const [voterEmailInput, setVoterEmailInput] = useState('');
  const [candidates, setCandidates] = useState<any[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<string | null>(null);
  const [zoomedCandidate, setZoomedCandidate] = useState<any | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [showRegistrationError, setShowRegistrationError] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [isVoteCommitted, setIsVoteCommitted] = useState(false);

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
        setIsVoteCommitted(true);
        setShowSuccessToast(true);
        setTimeout(() => {
          setStep('success');
        }, 3000);
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

  const handleIdentify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isOffline) {
      setError('You are currently offline. Identification requires a connection.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload = idMode === 'admission' 
        ? { admissionNumber } 
        : { email: voterEmailInput };

      const res = await fetch('/api/identify-voter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      setAdmissionNumber(data.admissionNumber);
      setEmail(data.email);
      setStep('ballot'); // Skip verify step
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

  const handleCastVote = async () => {
    if (!selectedCandidate) return;
    const voteData = { admissionNumber, candidateId: selectedCandidate };
    
    if (isOffline) {
      localStorage.setItem('pending_vote', JSON.stringify(voteData));
      setIsVoteCommitted(true);
      setShowSuccessToast(true);
      setTimeout(() => {
        setStep('success');
      }, 3000);
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
      
      setIsVoteCommitted(true);
      setShowSuccessToast(true);
      setTimeout(() => {
        setStep('success');
      }, 3000);
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
        <div className="w-24 h-24 bg-midnight-surface rounded-3xl flex items-center justify-center mx-auto mb-8 border border-midnight-border shadow-2xl relative overflow-hidden group">
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
          <div className="p-6 bg-midnight-surface/50 border border-midnight-border rounded-2xl text-left">
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
            className="w-full py-4 bg-midnight-surface border border-midnight-border rounded-xl text-xs font-black uppercase tracking-widest hover:bg-white/5 transition-all"
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
      <div className="flex flex-col items-center mb-12 text-center">
        {config?.bannerUrl && (
          <img 
            src={config.bannerUrl} 
            alt="Election Banner" 
            className="w-32 h-32 sm:w-48 sm:h-48 rounded-[2.5rem] object-cover border-4 border-midnight-border shadow-[0_0_50px_rgba(0,0,0,0.5)] mb-6" 
            referrerPolicy="no-referrer"
          />
        )}
        <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white px-4 leading-tight">
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
              <div className="w-2 h-2 rounded-full bg-midnight-bg animate-pulse" />
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
            className="bg-midnight-surface/50 border border-midnight-border p-8 rounded-3xl backdrop-blur-sm"
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

            <form onSubmit={handleIdentify} className="space-y-6">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                    {idMode === 'admission' ? 'Admission Number' : 'Student Email'}
                  </label>
                  <div className="flex bg-midnight-bg p-1 rounded-lg border border-midnight-border">
                    <button 
                      type="button"
                      onClick={() => setIdMode('admission')}
                      className={cn(
                        "px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-widest transition-all",
                        idMode === 'admission' ? "bg-amber-500 text-zinc-950" : "text-zinc-500 hover:text-zinc-300"
                      )}
                    >
                      ADM
                    </button>
                    <button 
                      type="button"
                      onClick={() => setIdMode('email')}
                      className={cn(
                        "px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-widest transition-all",
                        idMode === 'email' ? "bg-amber-500 text-zinc-950" : "text-zinc-500 hover:text-zinc-300"
                      )}
                    >
                      Email
                    </button>
                  </div>
                </div>
                {idMode === 'admission' ? (
                  <input 
                    type="text"
                    required
                    placeholder="e.g. BIT/001/2021"
                    value={admissionNumber}
                    onChange={(e) => setAdmissionNumber(e.target.value)}
                    className="w-full bg-midnight-bg border border-midnight-border rounded-xl px-4 py-3 focus:outline-none focus:border-amber-500 transition-colors font-mono"
                  />
                ) : (
                  <input 
                    type="email"
                    required
                    placeholder="e.g. student@mulembe.ac.ke"
                    value={voterEmailInput}
                    onChange={(e) => setVoterEmailInput(e.target.value)}
                    className="w-full bg-midnight-bg border border-midnight-border rounded-xl px-4 py-3 focus:outline-none focus:border-amber-500 transition-colors font-mono"
                  />
                )}
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

        {step === 'ballot' && (
          <motion.div 
            key="ballot"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6 relative"
          >
            <AnimatePresence>
              {showSuccessToast && (
                <motion.div
                  initial={{ opacity: 0, y: -50 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -50 }}
                  className="fixed top-24 left-1/2 -translate-x-1/2 z-[150] w-full max-w-md px-4"
                >
                  <div className="bg-green-600 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 border border-white/20 backdrop-blur-md">
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                      <CheckCircle2 size={24} />
                    </div>
                    <div>
                      <p className="font-black uppercase tracking-widest text-[10px] opacity-80">Vote Confirmed</p>
                      <p className="text-sm font-bold">Your ballot has been cast successfully!</p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className={cn("bg-midnight-surface/50 border border-midnight-border p-6 rounded-3xl backdrop-blur-sm flex items-center justify-between transition-opacity", isVoteCommitted && "opacity-50")}>
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

            <div className={cn("relative group transition-opacity", isVoteCommitted && "opacity-50 pointer-events-none")}>
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-amber-500 transition-colors" size={18} />
              <input 
                type="text"
                disabled={isVoteCommitted}
                placeholder="Search for your candidate..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-midnight-surface/50 border border-midnight-border rounded-3xl py-4 pl-12 pr-4 text-sm focus:outline-none focus:border-amber-500 transition-all backdrop-blur-sm"
              />
            </div>

            <div className="grid grid-cols-1 gap-6">
              {candidates
                .filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
                .map((candidate) => (
                <button
                  key={candidate.id}
                  onClick={() => !isVoteCommitted && setSelectedCandidate(candidate.id)}
                  disabled={isVoteCommitted}
                  className={cn(
                    "p-6 sm:p-8 rounded-[2.5rem] border text-left transition-all relative overflow-hidden group",
                    selectedCandidate === candidate.id 
                      ? "bg-amber-500/20 border-amber-500 shadow-lg shadow-amber-500/10" 
                      : "bg-midnight-surface/50 border-midnight-border hover:border-white/10",
                    isVoteCommitted && selectedCandidate !== candidate.id && "opacity-30 grayscale",
                    isVoteCommitted && selectedCandidate === candidate.id && "border-green-500 bg-green-500/10"
                  )}
                >
                  <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 sm:gap-8">
                    {candidate.imageUrl ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setZoomedCandidate(candidate);
                        }}
                        className="relative group/img shrink-0"
                      >
                        <img 
                          src={candidate.imageUrl} 
                          alt={candidate.name} 
                          className="w-32 h-32 sm:w-40 sm:h-40 rounded-[2rem] object-cover border-4 border-midnight-border group-hover/img:border-amber-500 transition-all shadow-2xl" 
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity rounded-[2rem] flex items-center justify-center">
                          <span className="text-xs font-black text-white uppercase tracking-widest">View Portrait</span>
                        </div>
                      </button>
                    ) : (
                      <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-[2rem] bg-midnight-surface border-2 border-midnight-border flex items-center justify-center text-5xl font-black shrink-0 text-zinc-700">
                        {candidate.name[0]}
                      </div>
                    )}
                    <div className="flex-1 text-center sm:text-left pt-2">
                      <h3 className="text-2xl sm:text-3xl font-black text-white mb-2">{candidate.name}</h3>
                      <div className="space-y-1">
                        <p className="text-xs font-black text-amber-500 uppercase tracking-[0.2em]">{candidate.role}</p>
                        <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{candidate.faculty}</p>
                      </div>
                      
                      <div className="mt-6 flex items-center justify-center sm:justify-start gap-2 text-xs font-black text-zinc-400 uppercase tracking-widest">
                        <Vote size={16} className="text-amber-500" />
                        <span>Select this candidate</span>
                      </div>
                    </div>
                  </div>
                  
                  {selectedCandidate === candidate.id && (
                    <div className="absolute top-6 right-6 text-amber-500">
                      <CheckCircle2 size={32} />
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
              disabled={!selectedCandidate || loading || isVoteCommitted}
              className={cn(
                "w-full font-bold py-5 rounded-3xl flex items-center justify-center gap-3 transition-all shadow-xl",
                isVoteCommitted 
                  ? "bg-green-500 text-white shadow-green-500/20" 
                  : "bg-amber-500 text-zinc-950 hover:bg-amber-400 shadow-amber-500/20"
              )}
            >
              {loading ? <Loader2 className="animate-spin" /> : isVoteCommitted ? <><CheckCircle2 size={20} /> Vote Recorded</> : <>Cast Anonymous Ballot <CheckCircle2 size={20} /></>}
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
              className="px-8 py-3 bg-midnight-surface border border-midnight-border rounded-xl font-bold hover:bg-white/5 transition-colors"
            >
              Return Home
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Registration Error Modal */}
      <AnimatePresence>
        {showRegistrationError && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-midnight-bg/90 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-midnight-surface border border-midnight-border w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl text-center"
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
                  className="w-full py-4 bg-white text-midnight-bg font-black rounded-2xl hover:bg-white/90 transition-all uppercase tracking-widest text-xs"
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

      {/* Image Zoom Modal */}
      <AnimatePresence>
        {zoomedCandidate && (
          <div 
            className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/95 backdrop-blur-xl"
            onClick={() => setZoomedCandidate(null)}
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="relative max-w-lg w-full aspect-[4/5] bg-midnight-surface rounded-[3rem] overflow-hidden border-4 border-white/10 shadow-[0_0_100px_rgba(0,0,0,0.8)]"
              onClick={(e) => e.stopPropagation()}
            >
              <img 
                src={zoomedCandidate.imageUrl} 
                alt={zoomedCandidate.name} 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
              
              {/* Passport Overlay Info */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/60 to-transparent p-10 pt-20">
                <div className="flex justify-between items-end">
                  <div>
                    <p className="text-[10px] font-black text-amber-500 uppercase tracking-[0.4em] mb-2">Official Candidate Portrait</p>
                    <h3 className="text-3xl font-black text-white uppercase tracking-tighter leading-none mb-2">{zoomedCandidate.name}</h3>
                    <p className="text-sm font-bold text-zinc-400 uppercase tracking-widest">{zoomedCandidate.role} • {zoomedCandidate.faculty}</p>
                  </div>
                  <div className="w-16 h-16 border-2 border-white/20 rounded-2xl flex items-center justify-center text-white/20">
                    <Shield size={32} />
                  </div>
                </div>
              </div>

              <button 
                onClick={() => setZoomedCandidate(null)}
                className="absolute top-6 right-6 w-12 h-12 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white transition-all border border-white/10"
              >
                <X size={24} />
              </button>
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
