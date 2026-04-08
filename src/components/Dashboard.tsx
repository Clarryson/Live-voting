import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
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

import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, AreaChart, Area 
} from 'recharts';
import { Users, User, Vote, Percent, Target, Crown, Activity, Clock, TrendingUp, Info, X, AlertTriangle, Bell } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { useRef } from 'react';

const COLORS = ['#f59e0b', '#3b82f6', '#22c55e', '#ef4444', '#8b5cf6', '#ec4899'];

export default function Dashboard({ config }: { config: any }) {
  const [candidates, setCandidates] = useState<any[]>([]);
  const [liveFeed, setLiveFeed] = useState<any[]>([]);
  const [totalVotesCast, setTotalVotesCast] = useState(0);
  const [eligibleVoters, setEligibleVoters] = useState(0);
  const [facultyData, setFacultyData] = useState<any[]>([]);
  const [paceData, setPaceData] = useState<any[]>([]);
  const [timeLeft, setTimeLeft] = useState<string>('--:--:--');
  const [lastUpdated, setLastUpdated] = useState<string>('just now');
  const [selectedCandidateForModal, setSelectedCandidateForModal] = useState<any | null>(null);
  const [statusAlert, setStatusAlert] = useState<{ status: string; prev: string } | null>(null);
  const prevStatusRef = useRef<string | null>(null);

  useEffect(() => {
    if (config?.status && prevStatusRef.current && prevStatusRef.current !== config.status) {
      setStatusAlert({ status: config.status, prev: prevStatusRef.current });
      const timer = setTimeout(() => setStatusAlert(null), 8000);
      return () => clearTimeout(timer);
    }
    if (config?.status) {
      prevStatusRef.current = config.status;
    }
  }, [config?.status]);

  useEffect(() => {
    const unsubCandidates = onSnapshot(query(collection(db, 'candidates'), orderBy('voteCount', 'desc')), (snap) => {
      const fetched = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      // Secondary sort by name in case of tie
      fetched.sort((a, b) => {
        if (b.voteCount !== a.voteCount) return b.voteCount - a.voteCount;
        return a.name.localeCompare(b.name);
      });
      setCandidates(fetched);
      setLastUpdated(new Date().toLocaleTimeString());
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'candidates');
    });

    const unsubVotes = onSnapshot(query(collection(db, 'votes'), orderBy('timestamp', 'desc'), limit(10)), (snap) => {
      setLiveFeed(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'votes');
    });

    const unsubTotalVotes = onSnapshot(collection(db, 'votes'), (snap) => {
      setTotalVotesCast(snap.size);
      const counts: Record<string, number> = {};
      const pace: Record<string, number> = {};
      
      snap.docs.forEach(doc => {
        const data = doc.data();
        const f = data.faculty;
        if (f) counts[f] = (counts[f] || 0) + 1;
        
        const ts = data.timestamp;
        if (ts) {
          const hour = new Date(ts).getHours();
          const hourStr = `${hour.toString().padStart(2, '0')}:00`;
          pace[hourStr] = (pace[hourStr] || 0) + 1;
        }
      });
      
      const fData = Object.entries(counts).map(([name, votes]) => ({ name, votes }));
      setFacultyData(fData.sort((a, b) => b.votes - a.votes));
      
      const pData = Object.entries(pace).map(([time, votes]) => ({ time, votes }));
      setPaceData(pData.sort((a, b) => a.time.localeCompare(b.time)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'votes');
    });

    const unsubEligible = onSnapshot(collection(db, 'voters'), (snap) => {
      setEligibleVoters(snap.size);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'voters');
    });

    return () => {
      unsubCandidates();
      unsubVotes();
      unsubTotalVotes();
      unsubEligible();
    };
  }, []);

  // Countdown Timer based on real config
  useEffect(() => {
    if (!config?.closingTime) return;

    const interval = setInterval(() => {
      const now = new Date().getTime();
      const closing = new Date(config.closingTime).getTime();
      const opening = new Date(config.openingTime).getTime();
      
      let diff = 0;
      let label = '';

      if (now < opening) {
        diff = opening - now;
        label = 'STARTS IN: ';
      } else if (now < closing) {
        diff = closing - now;
        label = '';
      } else {
        setTimeLeft('ENDED');
        clearInterval(interval);
        return;
      }

      const h = Math.floor(diff / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((diff % (1000 * 60)) / 1000);
      
      setTimeLeft(`${label}${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [config]);

  // Data from request
  const turnoutPercent = eligibleVoters > 0 ? (totalVotesCast / eligibleVoters) * 100 : 0;
  const winThreshold = Math.ceil(eligibleVoters * 0.5) + 1;
  const remainingVoters = Math.max(0, eligibleVoters - totalVotesCast);

  return (
    <div className="space-y-8 pb-20 relative">
      {/* Status Change Notification */}
      <AnimatePresence>
        {statusAlert && (
          <motion.div 
            initial={{ opacity: 0, y: -100, x: '-50%' }}
            animate={{ opacity: 1, y: 20, x: '-50%' }}
            exit={{ opacity: 0, y: -100, x: '-50%' }}
            className="fixed top-20 left-1/2 z-[200] w-full max-w-md px-4"
          >
            <div className={cn(
              "p-4 rounded-2xl border shadow-2xl backdrop-blur-md flex items-center gap-4",
              statusAlert.status === 'live' ? "bg-green-500/10 border-green-500/30 text-green-500" :
              statusAlert.status === 'paused' ? "bg-amber-500/10 border-amber-500/30 text-amber-500" :
              "bg-red-500/10 border-red-500/30 text-red-500"
            )}>
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                statusAlert.status === 'live' ? "bg-green-500/20" :
                statusAlert.status === 'paused' ? "bg-amber-500/20" :
                "bg-red-500/20"
              )}>
                <Bell className="animate-bounce" size={20} />
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-black uppercase tracking-widest opacity-70">Election Status Updated</p>
                <h4 className="text-sm font-black">
                  The election is now <span className="uppercase">{statusAlert.status}</span>
                </h4>
                <p className="text-[10px] opacity-60">Changed from {statusAlert.prev}</p>
              </div>
              <button 
                onClick={() => setStatusAlert(null)}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header & Global Indicators */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 bg-zinc-900/40 border border-zinc-800 p-6 sm:p-8 rounded-[2rem] backdrop-blur-xl shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-500 animate-pulse" />
        
        <div className="space-y-2 w-full lg:w-auto">
          <div className="flex flex-wrap items-center gap-3">
            <div className={cn(
              "flex items-center gap-2 px-3 py-1 border rounded-full",
              config?.status === 'live' ? "bg-green-500/10 border-green-500/20 text-green-500" : 
              config?.status === 'paused' ? "bg-amber-500/10 border-amber-500/20 text-amber-500" :
              "bg-red-500/10 border-red-500/20 text-red-500"
            )}>
              <span className="relative flex h-2 w-2">
                <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-75", config?.status === 'live' ? "bg-green-400" : config?.status === 'paused' ? "bg-amber-400" : "bg-red-400")}></span>
                <span className={cn("relative inline-flex rounded-full h-2 w-2", config?.status === 'live' ? "bg-green-500" : config?.status === 'paused' ? "bg-amber-500" : "bg-red-500")}></span>
              </span>
              <span className="text-[10px] font-black tracking-[0.2em] uppercase">
                {config?.status === 'live' ? 'LIVE – ELECTION IN PROGRESS' : 
                 config?.status === 'paused' ? 'PAUSED – MAINTENANCE' : 
                 'ENDED – FINALIZING RESULTS'}
              </span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1 bg-blue-500/10 border border-blue-500/20 text-blue-500 rounded-full">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-widest">Live Stream Active</span>
            </div>
            <span className="text-[10px] sm:text-xs text-zinc-500 font-medium">Last updated {lastUpdated}</span>
          </div>
          <div className="flex items-center gap-4">
            {config?.bannerUrl && (
              <img src={config.bannerUrl} alt="Logo" className="w-12 h-12 rounded-xl object-cover border border-zinc-800 shadow-lg" referrerPolicy="no-referrer" />
            )}
            <h1 className="text-lg sm:text-xl font-black tracking-tight text-white">
              {config?.electionName || 'Mulembe Nation University Guild Elections 2025'}
            </h1>
          </div>
        </div>
        
        <div className="flex items-center gap-4 sm:gap-6 bg-zinc-950/80 p-4 sm:p-6 rounded-2xl border border-amber-500/30 shadow-[0_0_30px_-10px_rgba(245,158,11,0.3)] w-full lg:w-auto justify-between lg:justify-start">
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-black mb-1">Time Remaining</p>
            <p className="text-3xl sm:text-4xl lg:text-5xl font-mono font-black text-amber-500 tabular-nums drop-shadow-[0_0_10px_rgba(245,158,11,0.5)]">
              {timeLeft}
            </p>
          </div>
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border-2 border-amber-500/20 flex items-center justify-center shrink-0">
            <Clock className="text-amber-500 animate-pulse" size={20} />
          </div>
        </div>
      </div>

      {/* Top-Level Metrics (Summary Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <SummaryCard 
          icon={<Vote />} 
          label="Votes Cast" 
          value={totalVotesCast.toLocaleString()} 
          progress={turnoutPercent}
          color="amber" 
        />
        <SummaryCard 
          icon={<Users />} 
          label="Eligible Voters" 
          value={eligibleVoters.toLocaleString()} 
          subValue="Registered Students"
          color="blue" 
        />
        <SummaryCard 
          icon={<Percent />} 
          label="Voter Turnout" 
          value={`${turnoutPercent.toFixed(1)}%`} 
          color="green" 
          warning={turnoutPercent > 100}
        />
        {(() => {
          const chairpersons = candidates.filter(c => c.role === 'Chairperson');
          const leader = chairpersons[0];
          const runnerUp = chairpersons[1];
          return (
            <SummaryCard 
              icon={<Crown />} 
              image={leader?.imageUrl}
              label="Win Projection — Chairperson" 
              value={leader?.name || 'TBD'} 
              subValue={leader ? `Leading by ${(leader.voteCount - (runnerUp?.voteCount || 0)).toLocaleString()} votes` : 'Calculating...'}
              color="amber" 
            />
          );
        })()}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Candidate Standings (Left Column) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-zinc-900/30 border border-zinc-800 p-8 rounded-[2rem] backdrop-blur-sm">
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-xs font-black uppercase tracking-[0.3em] text-zinc-500 flex items-center gap-3">
                <Crown size={18} className="text-amber-500" />
                Guild Chairperson Standings
              </h3>
              <div className="px-3 py-1 bg-zinc-800 rounded-lg text-[10px] font-bold text-zinc-400">FILTER: CHAIRPERSON</div>
            </div>
            
            <div className="space-y-6">
              {candidates.filter(c => c.role === 'Chairperson').map((candidate, idx, filteredArr) => {
                const isTie = idx === 0 && filteredArr.length > 1 && filteredArr[0].voteCount === filteredArr[1].voteCount && filteredArr[0].voteCount > 0;
                const isLeading = idx === 0 && !isTie;

                return (
                  <motion.div 
                    layout
                    key={candidate.id}
                    className={cn(
                      "group relative p-6 rounded-2xl border transition-all duration-500 overflow-hidden",
                      isLeading 
                        ? "bg-amber-500/5 border-amber-500/40 shadow-[0_0_40px_-15px_rgba(245,158,11,0.2)]" 
                        : isTie && idx <= 1
                          ? "bg-blue-500/5 border-blue-500/40 shadow-[0_0_40px_-15px_rgba(59,130,246,0.2)]"
                          : "bg-zinc-950/40 border-zinc-800 hover:border-zinc-700"
                    )}
                  >
                    {(isLeading || (isTie && idx <= 1)) && (
                      <div className={cn(
                        "absolute top-0 right-0 w-32 h-32 blur-[50px] -mr-16 -mt-16 rounded-full",
                        isLeading ? "bg-amber-500/10" : "bg-blue-500/10"
                      )} />
                    )}
                    
                    <div className="flex justify-between items-start mb-4 relative z-10">
                      <button 
                        onClick={() => setSelectedCandidateForModal(candidate)}
                        className="flex items-center gap-4 text-left group/btn"
                      >
                        {candidate.imageUrl ? (
                          <img 
                            src={candidate.imageUrl} 
                            alt={candidate.name} 
                            className="w-14 h-14 rounded-2xl object-cover border border-zinc-800 shadow-inner group-hover/btn:border-amber-500/50 transition-colors" 
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className={cn(
                            "w-14 h-14 rounded-2xl border flex items-center justify-center shadow-inner transition-colors",
                            isLeading ? "bg-amber-500 text-zinc-950 border-amber-400" : isTie && idx <= 1 ? "bg-blue-500 text-white border-blue-400" : "bg-zinc-800 text-zinc-400 border-zinc-700 group-hover/btn:border-amber-500/50"
                          )}>
                            <User size={24} />
                          </div>
                        )}
                        <div>
                          <h4 className="text-lg font-black tracking-tight text-white group-hover/btn:text-amber-500 transition-colors">{candidate.name}</h4>
                          <p className="text-[10px] text-zinc-500 uppercase font-black tracking-widest">{candidate.role} • {candidate.faculty}</p>
                        </div>
                      </button>
                      {isLeading && (
                        <div className="bg-amber-500 text-zinc-950 text-[10px] font-black px-3 py-1 rounded-full flex items-center gap-2 shadow-lg shadow-amber-500/20">
                          <Crown size={12} />
                          PROJECTED WINNER
                        </div>
                      )}
                      {isTie && idx <= 1 && (
                        <div className="bg-blue-500 text-white text-[10px] font-black px-3 py-1 rounded-full flex items-center gap-2 shadow-lg shadow-blue-500/20 animate-pulse">
                          <Users size={12} />
                          TIE DETECTED
                        </div>
                      )}
                    </div>

                    <div className="space-y-4 relative z-10">
                      <div className="flex justify-between items-end">
                        <div>
                          <motion.p 
                            key={candidate.voteCount}
                            initial={{ scale: 1.2, color: '#f59e0b' }}
                            animate={{ scale: 1, color: '#ffffff' }}
                            className="text-3xl font-mono font-black tabular-nums"
                          >
                            {candidate.voteCount.toLocaleString()}
                          </motion.p>
                          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Total Ballots</p>
                        </div>
                        <div className="text-right">
                          <p className={cn("text-2xl font-black", isLeading ? "text-amber-500" : isTie && idx <= 1 ? "text-blue-500" : "text-zinc-500")}>
                            {totalVotesCast > 0 ? ((candidate.voteCount / totalVotesCast) * 100).toFixed(1) : '0.0'}%
                          </p>
                          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Share</p>
                        </div>
                      </div>

                      <div className="h-2 w-full bg-zinc-800/50 rounded-full overflow-hidden p-[2px] border border-zinc-700/30">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${totalVotesCast > 0 ? (candidate.voteCount / totalVotesCast) * 100 : 0}%` }}
                          className={cn(
                            "h-full rounded-full shadow-[0_0_10px_rgba(0,0,0,0.5)]", 
                            isLeading ? "bg-gradient-to-r from-amber-600 to-amber-400" : isTie && idx <= 1 ? "bg-gradient-to-r from-blue-600 to-blue-400" : "bg-zinc-500"
                          )}
                        />
                      </div>
                    </div>

                    {/* Bio & Manifesto */}
                    <div className="pt-4 border-t border-zinc-800/50 space-y-4">
                      <div className="bg-zinc-950/50 p-3 rounded-xl border border-zinc-800/50">
                        <p className="text-[9px] font-black text-amber-500 uppercase tracking-[0.2em] mb-2 flex items-center gap-1.5">
                          <Info size={12} /> Candidate Biography
                        </p>
                        <p className="text-xs text-zinc-300 leading-relaxed italic font-medium">
                          {candidate.bio || 'No biography provided.'}
                        </p>
                      </div>
                      <div className="bg-zinc-950/50 p-3 rounded-xl border border-zinc-800/50">
                        <p className="text-[9px] font-black text-blue-500 uppercase tracking-[0.2em] mb-2 flex items-center gap-1.5">
                          <TrendingUp size={12} /> Election Manifesto
                        </p>
                        <p className="text-xs text-zinc-200 font-bold leading-relaxed">
                          {candidate.manifesto || 'No manifesto summary available.'}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Data Visualization & Analytics */}
        <div className="lg:col-span-7 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Votes by Faculty Bar Chart */}
            <div className="bg-zinc-900/30 border border-zinc-800 p-8 rounded-[2rem] h-[400px] relative flex flex-col">
              <h3 className="text-xs font-black uppercase tracking-[0.3em] text-zinc-500 mb-8">Votes by Faculty</h3>
              <div className="flex-1 w-full min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={facultyData} layout="vertical">
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: '#71717a', fontSize: 10, fontWeight: 700 }} width={100} />
                    <Tooltip 
                      cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                      contentStyle={{ backgroundColor: '#09090b', border: '1px solid #27272a', borderRadius: '12px', fontSize: '12px' }}
                    />
                    <Bar dataKey="votes" fill="#f59e0b" radius={[0, 8, 8, 0]} barSize={24}>
                      {facultyData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-zinc-900/30 border border-zinc-800 p-8 rounded-[2rem] h-[400px] flex items-center justify-center">
              <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-blue-500/10 border border-blue-500/20 rounded-2xl flex items-center justify-center text-blue-500 mx-auto">
                  <Activity size={32} />
                </div>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-[0.3em] text-zinc-500">Analytics Engine</h3>
                  <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mt-2">Processing Live Telemetry...</p>
                </div>
              </div>
            </div>
          </div>

          {/* Live Activity Feed */}
          <div className="bg-zinc-900/30 border border-zinc-800 p-8 rounded-[2rem]">
            <h3 className="text-xs font-black uppercase tracking-[0.3em] text-zinc-500 mb-6 flex items-center gap-3">
              <Activity size={18} className="text-blue-500" />
              Live Activity Feed
            </h3>
            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-4 scrollbar-thin scrollbar-thumb-zinc-800">
              <AnimatePresence initial={false}>
                {liveFeed.map((item) => {
                  const candidate = candidates.find(c => c.id === item.candidateId);
                  const time = item.timestamp 
                    ? new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) 
                    : '--:--:--';
                  
                  return (
                    <motion.div 
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      key={item.id}
                      className="flex items-center gap-4 p-4 bg-zinc-950/40 border border-zinc-800/50 rounded-2xl group hover:border-blue-500/30 transition-all"
                    >
                      <div className="flex items-center justify-center bg-zinc-900 px-3 py-2 rounded-xl border border-zinc-800">
                        <span className="text-[10px] font-mono text-blue-500 font-black tracking-tighter leading-none">{time}</span>
                      </div>
                      
                      {candidate?.imageUrl ? (
                        <img 
                          src={candidate.imageUrl} 
                          alt={candidate.name} 
                          className="w-8 h-8 rounded-lg object-cover border border-zinc-800 shrink-0" 
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 shrink-0">
                          <User size={14} />
                        </div>
                      )}
                      
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-bold text-zinc-300 truncate">
                          Ballot cast for <span className="text-white">{candidate?.name || 'Candidate'}</span>
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[9px] text-zinc-500 uppercase font-black tracking-widest truncate">
                            {item.faculty}
                          </span>
                          <span className="w-1 h-1 rounded-full bg-zinc-800" />
                          <span className="text-[9px] text-amber-500/80 uppercase font-black tracking-widest truncate">
                            {candidate?.role || 'Position'}
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
              {liveFeed.length === 0 && (
                <div className="text-center py-12 border border-dashed border-zinc-800 rounded-3xl">
                  <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest">Awaiting first ballots...</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer: Hourly Voting Pace */}
      <div className="bg-zinc-900/30 border border-zinc-800 p-8 rounded-[2rem] h-[400px] relative flex flex-col">
        <div className="flex justify-between items-center mb-8">
          <h3 className="text-xs font-black uppercase tracking-[0.3em] text-zinc-500">Hourly Voting Pace (Heartbeat)</h3>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-amber-500" />
              <span className="text-[10px] font-bold text-zinc-400 uppercase">Today</span>
            </div>
          </div>
        </div>
        <div className="flex-1 w-full min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={paceData}>
              <defs>
                <linearGradient id="colorVotes" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#71717a', fontSize: 10, fontWeight: 700 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#71717a', fontSize: 10, fontWeight: 700 }} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#09090b', border: '1px solid #27272a', borderRadius: '12px' }}
              />
              <Area 
                type="monotone" 
                dataKey="votes" 
                stroke="#f59e0b" 
                fillOpacity={1} 
                fill="url(#colorVotes)" 
                strokeWidth={4} 
                animationDuration={2000}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Candidate Detail Modal */}
      <AnimatePresence>
        {selectedCandidateForModal && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-zinc-950/90 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-zinc-900 border border-zinc-800 w-full max-w-2xl max-h-[90vh] rounded-[2.5rem] overflow-hidden flex flex-col shadow-2xl"
            >
              <div className="p-8 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
                <div className="flex items-center gap-6">
                  {selectedCandidateForModal.imageUrl ? (
                    <img 
                      src={selectedCandidateForModal.imageUrl} 
                      alt={selectedCandidateForModal.name} 
                      className="w-16 h-16 rounded-2xl object-cover border border-zinc-800" 
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400">
                      <User size={28} />
                    </div>
                  )}
                  <div>
                    <h2 className="text-2xl font-black tracking-tight text-white">{selectedCandidateForModal.name}</h2>
                    <p className="text-xs text-amber-500 uppercase font-black tracking-[0.2em]">{selectedCandidateForModal.role} • {selectedCandidateForModal.faculty}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedCandidateForModal(null)}
                  className="p-2 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-full transition-all"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-10">
                <section className="space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-[0.3em] text-zinc-500 flex items-center gap-3">
                    <Info size={16} className="text-amber-500" />
                    Full Biography
                  </h3>
                  <div className="bg-zinc-950/50 p-6 rounded-3xl border border-zinc-800 leading-relaxed text-zinc-300">
                    {selectedCandidateForModal.bio || 'No biography provided for this candidate.'}
                  </div>
                </section>

                <section className="space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-[0.3em] text-zinc-500 flex items-center gap-3">
                    <TrendingUp size={16} className="text-blue-500" />
                    Election Manifesto
                  </h3>
                  <div className="bg-zinc-950/50 p-6 rounded-3xl border border-zinc-800 leading-relaxed text-zinc-200 font-bold whitespace-pre-wrap">
                    {selectedCandidateForModal.manifesto || 'No manifesto summary available for this candidate.'}
                  </div>
                </section>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl text-center">
                    <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">Total Votes</p>
                    <p className="text-2xl font-mono font-black text-white">{selectedCandidateForModal.voteCount.toLocaleString()}</p>
                  </div>
                  <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl text-center">
                    <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">Vote Share</p>
                    <p className="text-2xl font-mono font-black text-amber-500">{((selectedCandidateForModal.voteCount / totalVotesCast) * 100).toFixed(1)}%</p>
                  </div>
                </div>
              </div>

              <div className="p-6 bg-zinc-950/50 border-t border-zinc-800">
                <button 
                  onClick={() => setSelectedCandidateForModal(null)}
                  className="w-full py-4 bg-zinc-800 hover:bg-zinc-700 text-white font-black rounded-2xl transition-all uppercase tracking-widest text-xs"
                >
                  Close Profile
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SummaryCard({ icon, image, label, value, subValue, trend, color, progress, warning }: any) {
  const colorClasses: any = {
    amber: "text-amber-500 bg-amber-500/10 border-amber-500/20",
    blue: "text-blue-500 bg-blue-500/10 border-blue-500/20",
    green: "text-green-500 bg-green-500/10 border-green-500/20",
    red: "text-red-500 bg-red-500/10 border-red-500/20",
  };

  return (
    <div className={cn(
      "bg-zinc-900/30 border border-zinc-800 p-6 rounded-[2rem] backdrop-blur-sm relative overflow-hidden group hover:border-zinc-700 transition-all duration-500",
      warning && "border-red-500/50 shadow-[0_0_20px_-5px_rgba(239,68,68,0.3)]"
    )}>
      <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center mb-6 border shadow-inner group-hover:scale-110 transition-transform duration-500 overflow-hidden", colorClasses[color])}>
        {image ? (
          <img src={image} alt={label} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          React.cloneElement(icon, { size: 24 })
        )}
      </div>
      
      <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-black mb-1">{label}</p>
      <div className="flex items-baseline gap-3 mb-4">
        <h4 className="text-3xl font-black font-mono tracking-tighter text-white tabular-nums">{value}</h4>
        {trend && (
          <span className="text-[10px] font-black text-green-500 flex items-center gap-1">
            <TrendingUp size={10} /> {trend}
          </span>
        )}
      </div>

      {progress !== undefined ? (
        <div className="space-y-2">
          <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
            <div className={cn("h-full rounded-full", color === 'amber' ? "bg-amber-500" : "bg-zinc-500")} style={{ width: `${progress}%` }} />
          </div>
          <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Progress to target</p>
        </div>
      ) : (
        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{subValue}</p>
      )}

      {warning && (
        <div className="mt-4 p-2 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2">
          <AlertCircle size={12} className="text-red-500" />
          <p className="text-[9px] font-black text-red-500 uppercase tracking-tighter italic">Anomaly Detected: Turnout &gt; 100%</p>
        </div>
      )}
    </div>
  );
}

function AlertCircle(props: any) {
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
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}
