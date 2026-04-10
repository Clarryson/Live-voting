import React, { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, CheckCircle2, AlertCircle, ArrowRight, Loader2, UserCheck, Vote, Fingerprint, Lock } from 'lucide-react';
import { cn } from '../lib/utils';

export default function CleanVotingFlow({ config }: { config: any }) {
  const [step, setStep] = useState<'identify' | 'verify' | 'ballot' | 'success'>('identify');
  const [admissionNumber, setAdmissionNumber] = useState('');
  const [candidates, setCandidates] = useState<any[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'candidates'), orderBy('name')), (snap) => {
      setCandidates(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsub();
  }, []);

  const handleIdentify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/identify-voter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admissionNumber }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStep('ballot');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCastVote = async () => {
    if (!selectedCandidate) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/cast-vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admissionNumber, candidateId: selectedCandidate }),
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

  return (
    <div className="max-w-4xl mx-auto px-4 py-12 font-sans">
      <AnimatePresence mode="wait">
        {step === 'identify' && (
          <motion.div 
            key="identify"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="max-w-md mx-auto"
          >
            <div className="text-center mb-12">
              <div className="w-20 h-20 bg-blue-600 rounded-[2.5rem] flex items-center justify-center mx-auto mb-6 text-white shadow-xl shadow-blue-500/20">
                <Fingerprint size={40} />
              </div>
              <h2 className="text-3xl font-bold text-slate-900 mb-3">Voter Authentication</h2>
              <p className="text-slate-500">Securely sign in using your student credentials to access your digital ballot.</p>
            </div>

            <div className="bg-white border border-slate-200 p-8 rounded-[2.5rem] shadow-sm">
              <form onSubmit={handleIdentify} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                    <Lock size={12} /> Student ID / Admission Number
                  </label>
                  <input 
                    type="text"
                    required
                    placeholder="e.g. BIT/001/2021"
                    value={admissionNumber}
                    onChange={(e) => setAdmissionNumber(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 focus:outline-none focus:border-blue-500 focus:bg-white transition-all font-mono text-slate-900"
                  />
                </div>

                {error && (
                  <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600 text-sm">
                    <AlertCircle size={18} />
                    <p>{error}</p>
                  </div>
                )}

                <button 
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50"
                >
                  {loading ? <Loader2 className="animate-spin" /> : <>Authenticate Identity <ArrowRight size={18} /></>}
                </button>
              </form>
              
              <div className="mt-8 pt-8 border-t border-slate-100 text-center">
                <p className="text-xs text-slate-400 flex items-center justify-center gap-2">
                  <Shield size={14} className="text-green-500" />
                  Your session is encrypted and anonymous
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {step === 'ballot' && (
          <motion.div 
            key="ballot"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-8"
          >
            <div className="bg-white border border-slate-200 p-6 rounded-[2rem] shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-green-50 rounded-2xl flex items-center justify-center text-green-600 border border-green-100">
                  <UserCheck size={24} />
                </div>
                <div>
                  <h2 className="font-bold text-slate-900">Identity Verified</h2>
                  <p className="text-xs text-slate-500 font-mono">{admissionNumber}</p>
                </div>
              </div>
              <div className="px-4 py-2 bg-blue-50 rounded-xl border border-blue-100">
                <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Ballot Status: Active</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {candidates.map((candidate) => (
                <button
                  key={candidate.id}
                  onClick={() => setSelectedCandidate(candidate.id)}
                  className={cn(
                    "p-6 rounded-[2.5rem] border text-left transition-all relative group",
                    selectedCandidate === candidate.id 
                      ? "bg-blue-50 border-blue-500 shadow-md" 
                      : "bg-white border-slate-200 hover:border-blue-300 hover:bg-slate-50"
                  )}
                >
                  <div className="flex items-center gap-6 mb-6">
                    {candidate.imageUrl ? (
                      <img 
                        src={candidate.imageUrl} 
                        alt={candidate.name} 
                        className="w-20 h-20 rounded-3xl object-cover border border-slate-200 shadow-sm" 
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-3xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 text-3xl font-bold">
                        {candidate.name[0]}
                      </div>
                    )}
                    <div>
                      <h3 className="font-bold text-xl text-slate-900">{candidate.name}</h3>
                      <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">{candidate.role} • {candidate.faculty}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
                      <Vote size={16} />
                      <span>Select for Ballot</span>
                    </div>
                    {selectedCandidate === candidate.id && (
                      <div className="text-blue-600">
                        <CheckCircle2 size={28} />
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>

            <div className="flex flex-col items-center gap-6 pt-8">
              {error && (
                <div className="w-full p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600 text-sm">
                  <AlertCircle size={18} />
                  <p>{error}</p>
                </div>
              )}
              
              <button 
                onClick={handleCastVote}
                disabled={!selectedCandidate || loading}
                className="w-full max-w-md bg-blue-600 text-white font-bold py-5 rounded-2xl flex items-center justify-center gap-3 hover:bg-blue-700 transition-all shadow-xl shadow-blue-500/20 disabled:opacity-50"
              >
                {loading ? <Loader2 className="animate-spin" /> : <>Cast Anonymous Ballot <CheckCircle2 size={20} /></>}
              </button>
              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">
                By casting your vote, you agree to the election terms
              </p>
            </div>
          </motion.div>
        )}

        {step === 'success' && (
          <motion.div 
            key="success"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-md mx-auto text-center py-12"
          >
            <div className="w-24 h-24 bg-green-50 border border-green-100 rounded-[2.5rem] flex items-center justify-center mx-auto mb-8 text-green-600 shadow-sm">
              <CheckCircle2 size={48} />
            </div>
            <h2 className="text-3xl font-bold text-slate-900 mb-4">Vote Successfully Cast</h2>
            <p className="text-slate-500 mb-10 leading-relaxed">
              Thank you for participating. Your vote has been securely recorded and will be included in the final tally.
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full py-4 bg-slate-900 text-white font-bold rounded-2xl hover:bg-slate-800 transition-colors shadow-lg"
            >
              Return to Home
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
