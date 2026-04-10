import React, { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  Cell, AreaChart, Area 
} from 'recharts';
import { Users, Vote, Percent, Activity, Clock, TrendingUp, Info, ChevronRight, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function CleanDashboard({ config }: { config: any }) {
  const [candidates, setCandidates] = useState<any[]>([]);
  const [liveFeed, setLiveFeed] = useState<any[]>([]);
  const [totalVotesCast, setTotalVotesCast] = useState(0);
  const [eligibleVoters, setEligibleVoters] = useState(0);
  const [facultyData, setFacultyData] = useState<any[]>([]);
  const [paceData, setPaceData] = useState<any[]>([]);
  const [timeLeft, setTimeLeft] = useState<string>('--:--:--');

  useEffect(() => {
    const unsubCandidates = onSnapshot(query(collection(db, 'candidates'), orderBy('voteCount', 'desc')), (snap) => {
      const fetched = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      setCandidates(fetched);
    });

    const unsubVotes = onSnapshot(query(collection(db, 'votes'), orderBy('timestamp', 'desc'), limit(10)), (snap) => {
      setLiveFeed(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
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
      
      setFacultyData(Object.entries(counts).map(([name, votes]) => ({ name, votes })));
      setPaceData(Object.entries(pace).map(([time, votes]) => ({ time, votes })).sort((a, b) => a.time.localeCompare(b.time)));
    });

    const unsubEligible = onSnapshot(collection(db, 'voters'), (snap) => {
      setEligibleVoters(snap.size);
    });

    return () => {
      unsubCandidates();
      unsubVotes();
      unsubTotalVotes();
      unsubEligible();
    };
  }, []);

  useEffect(() => {
    if (!config?.closingTime) return;
    const interval = setInterval(() => {
      const now = new Date().getTime();
      const closing = new Date(config.closingTime).getTime();
      const diff = Math.max(0, closing - now);
      
      const h = Math.floor(diff / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((diff % (1000 * 60)) / 1000);
      setTimeLeft(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [config]);

  const turnoutPercent = eligibleVoters > 0 ? (totalVotesCast / eligibleVoters) * 100 : 0;

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 p-4 sm:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Live Election Dashboard</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              {config?.electionName || 'University Guild Elections'}
            </h1>
          </div>
          
          <div className="flex items-center gap-4 bg-white p-2 rounded-2xl shadow-sm border border-slate-200">
            <div className="px-4 py-2 text-right">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Time Remaining</p>
              <p className="text-xl font-mono font-bold text-slate-900">{timeLeft}</p>
            </div>
            <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400">
              <Clock size={20} />
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard icon={<Vote />} label="Total Votes" value={totalVotesCast.toLocaleString()} color="blue" />
          <StatCard icon={<Users />} label="Eligible Voters" value={eligibleVoters.toLocaleString()} color="slate" />
          <StatCard icon={<Percent />} label="Turnout Rate" value={`${turnoutPercent.toFixed(1)}%`} progress={turnoutPercent} color="green" />
          <StatCard icon={<Activity />} label="Poll Status" value={config?.status?.toUpperCase() || 'LIVE'} color="amber" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Main Results Chart */}
          <div className="lg:col-span-8 space-y-8">
            <div className="bg-white border border-slate-200 rounded-[2rem] p-8 shadow-sm">
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Real-Time Standings</h3>
                  <p className="text-sm text-slate-500">Current vote distribution across candidates</p>
                </div>
                <div className="flex items-center gap-2 px-3 py-1 bg-slate-50 rounded-full border border-slate-100">
                  <TrendingUp size={14} className="text-blue-500" />
                  <span className="text-[10px] font-bold text-slate-600 uppercase">Live Updates</span>
                </div>
              </div>
              
              <div className="h-[400px] w-full">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <BarChart data={candidates} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#64748b', fontSize: 12, fontWeight: 500 }}
                    />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                    <Tooltip 
                      cursor={{ fill: '#f8fafc' }}
                      contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <Bar dataKey="voteCount" radius={[8, 8, 0, 0]} barSize={40}>
                      {candidates.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Voting Pace */}
            <div className="bg-white border border-slate-200 rounded-[2rem] p-8 shadow-sm">
              <h3 className="text-lg font-bold text-slate-900 mb-8">Voting Activity Pace</h3>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <AreaChart data={paceData}>
                    <defs>
                      <linearGradient id="colorVotes" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0' }} />
                    <Area type="monotone" dataKey="votes" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorVotes)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Sidebar: Live Feed & Top Candidates */}
          <div className="lg:col-span-4 space-y-8">
            <div className="bg-white border border-slate-200 rounded-[2rem] p-6 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-widest mb-6 flex items-center gap-2">
                <Activity size={16} className="text-blue-500" />
                Live Activity
              </h3>
              <div className="space-y-4">
                {liveFeed.map((item) => (
                  <div key={item.id} className="flex items-center gap-4 p-3 rounded-2xl bg-slate-50 border border-slate-100 transition-all hover:border-blue-200">
                    <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-blue-500 shadow-sm">
                      <Vote size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-900 truncate">New Ballot Cast</p>
                      <p className="text-[10px] text-slate-500 uppercase tracking-widest">{item.faculty || 'General'}</p>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400">
                      {item.timestamp ? new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-blue-600 rounded-[2rem] p-8 text-white shadow-xl shadow-blue-500/20 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-3xl" />
              <ShieldCheck size={48} className="mb-6 opacity-50" />
              <h3 className="text-xl font-bold mb-2">Secure & Transparent</h3>
              <p className="text-sm text-blue-100 leading-relaxed mb-6">
                Every vote is cryptographically verified and recorded on our secure ledger. Transparency is our priority.
              </p>
              <button className="w-full py-3 bg-white text-blue-600 rounded-xl font-bold text-sm hover:bg-blue-50 transition-colors flex items-center justify-center gap-2">
                Verify My Vote <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, progress, color }: any) {
  const colors: any = {
    blue: "text-blue-600 bg-blue-50 border-blue-100",
    green: "text-green-600 bg-green-50 border-green-100",
    amber: "text-amber-600 bg-amber-50 border-amber-100",
    slate: "text-slate-600 bg-slate-50 border-slate-100",
  };

  return (
    <div className="bg-white border border-slate-200 p-6 rounded-[2rem] shadow-sm hover:shadow-md transition-all group">
      <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center mb-6 border transition-transform group-hover:scale-110", colors[color])}>
        {React.cloneElement(icon, { size: 24 })}
      </div>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-1">{label}</p>
      <h4 className="text-3xl font-bold text-slate-900 mb-4">{value}</h4>
      {progress !== undefined && (
        <div className="space-y-2">
          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full transition-all duration-1000" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Progress to 100%</p>
        </div>
      )}
    </div>
  );
}
