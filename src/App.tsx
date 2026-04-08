import React, { useState, useEffect } from 'react';
import { db, auth } from './lib/firebase';
import { doc, onSnapshot, collection, query, orderBy } from 'firebase/firestore';

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

import Dashboard from './components/Dashboard';
import VotingFlow from './components/VotingFlow';
import { Layout, Vote, BarChart3, Settings, LogIn, LogOut, ShieldCheck, Loader2, X, ArrowRight } from 'lucide-react';
import { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from 'firebase/auth';
import { cn } from './lib/utils';
import AdminSeed from './components/AdminSeed';
import { motion, AnimatePresence } from 'motion/react';

const ADMIN_EMAILS = ['clarrysoncarson003@gmail.com'];

export default function App() {
  const [view, setView] = useState<'voting' | 'dashboard' | 'admin'>('voting');
  const [electionConfig, setElectionConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [isAdminPath, setIsAdminPath] = useState(false);

  useEffect(() => {
    // Detect admin path
    const checkPath = () => {
      setIsAdminPath(window.location.pathname === '/admin');
    };
    
    checkPath();
    window.addEventListener('popstate', checkPath);
    
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    
    const unsubConfig = onSnapshot(doc(db, 'config', 'config'), (doc) => {
      if (doc.exists()) {
        setElectionConfig(doc.data());
      }
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'config/config');
    });
    return () => {
      window.removeEventListener('popstate', checkPath);
      unsubAuth();
      unsubConfig();
    };
  }, []);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="animate-pulse text-amber-500 font-mono">INITIALIZING ELECTION COMMAND CENTER...</div>
      </div>
    );
  }

  const isAdmin = user && ADMIN_EMAILS.includes(user.email || '');

  // If on admin path but not logged in as admin, show login screen
  if (isAdminPath && !isAdmin) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full space-y-8 text-center">
          <div className="space-y-4">
            <div className="w-20 h-20 bg-amber-500/10 border border-amber-500/20 rounded-3xl flex items-center justify-center mx-auto text-amber-500">
              <ShieldCheck size={40} />
            </div>
            <h1 className="text-3xl font-black uppercase tracking-tighter">Admin Access</h1>
            <p className="text-zinc-500 text-sm">Restricted area. Please authenticate to continue.</p>
          </div>
          
          <button 
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-amber-500 text-zinc-950 rounded-2xl font-black uppercase tracking-widest hover:bg-amber-400 transition-all shadow-xl shadow-amber-500/20"
          >
            <LogIn size={20} />
            <span>Login with Google</span>
          </button>
          
          <button 
            onClick={() => {
              window.history.pushState({}, '', '/');
              setIsAdminPath(false);
            }}
            className="text-xs font-bold text-zinc-600 hover:text-zinc-400 uppercase tracking-widest transition-colors"
          >
            Return to Voting
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-amber-500/30">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {electionConfig?.bannerUrl ? (
              <img src={electionConfig.bannerUrl} alt="Logo" className="w-8 h-8 rounded-lg object-cover border border-zinc-800" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-8 h-8 bg-amber-500 rounded flex items-center justify-center text-zinc-950 font-bold">M</div>
            )}
            <h1 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 hidden sm:block">
              {electionConfig?.electionName || 'MULEMBE NATION UNIVERSITY'}
            </h1>
            {isAdmin && (
              <div className={cn(
                "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border",
                electionConfig?.status === 'live' ? "bg-green-500/10 border-green-500/20 text-green-500" :
                electionConfig?.status === 'paused' ? "bg-amber-500/10 border-amber-500/20 text-amber-500" :
                "bg-red-500/10 border-red-500/20 text-red-500"
              )}>
                {electionConfig?.status || 'OFFLINE'}
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 bg-zinc-900 p-1 rounded-lg border border-zinc-800">
              <button
                onClick={() => setView('voting')}
                className={cn(
                  "px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2",
                  view === 'voting' ? "bg-amber-500 text-zinc-950 shadow-lg shadow-amber-500/20" : "text-zinc-400 hover:text-zinc-100"
                )}
              >
                <Vote size={16} />
                <span>Vote</span>
              </button>
              <button
                onClick={() => setView('dashboard')}
                className={cn(
                  "px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2",
                  view === 'dashboard' ? "bg-amber-500 text-zinc-950 shadow-lg shadow-amber-500/20" : "text-zinc-400 hover:text-zinc-100"
                )}
              >
                <BarChart3 size={16} />
                <span>War Room</span>
              </button>
            </div>

            {isAdmin && isAdminPath && (
              <div className="flex items-center gap-3">
                <div className="hidden sm:block text-right">
                  <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest leading-none">
                    Admin
                  </p>
                  <p className="text-xs font-bold text-zinc-300">{user.email}</p>
                </div>
                <button 
                  onClick={handleLogout}
                  className="p-2 text-zinc-500 hover:text-red-500 transition-colors"
                  title="Logout"
                >
                  <LogOut size={20} />
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      <main className="pt-24 pb-12 px-4 max-w-7xl mx-auto">
        {view === 'voting' && <VotingFlow config={electionConfig} />}
        {view === 'dashboard' && <Dashboard config={electionConfig} />}
      </main>

      {isAdmin && isAdminPath && <AdminSeed />}
    </div>
  );
}
