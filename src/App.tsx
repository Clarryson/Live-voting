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
import { Layout, Vote, BarChart3, Settings, LogIn, LogOut, ShieldCheck, Loader2, X, ArrowRight, Users, Clock } from 'lucide-react';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  sendPasswordResetEmail, 
  getMultiFactorResolver, 
  PhoneAuthProvider, 
  PhoneMultiFactorGenerator, 
  RecaptchaVerifier,
  sendEmailVerification
} from 'firebase/auth';
import { cn } from './lib/utils';
import AdminSeed from './components/AdminSeed';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'motion/react';

const ADMIN_EMAILS = ['clarrysoncarson003@gmail.com'];

function CursorGlow() {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const springConfig = { damping: 20, stiffness: 100 };
  const x = useSpring(mouseX, springConfig);
  const y = useSpring(mouseY, springConfig);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mouseX.set(e.clientX);
      mouseY.set(e.clientY);
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [mouseX, mouseY]);

  return (
    <motion.div
      className="pointer-events-none fixed inset-0 z-[100] transition-opacity duration-300"
      style={{
        background: useTransform(
          [x, y],
          ([lx, ly]) => `radial-gradient(600px circle at ${lx}px ${ly}px, rgba(139, 92, 246, 0.15), transparent 80%)`
        ),
      }}
    />
  );
}

export default function App() {
  const [view, setView] = useState<'voting' | 'dashboard' | 'admin'>('voting');
  const [electionConfig, setElectionConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [isAdminPath, setIsAdminPath] = useState(false);
  
  // Admin Login States
  const [loginMethod, setLoginMethod] = useState<'google' | 'password'>('google');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);

  // MFA States
  const [mfaResolver, setMfaResolver] = useState<any>(null);
  const [mfaVerificationId, setMfaVerificationId] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaLoading, setMfaLoading] = useState(false);
  const [selectedMfaHint, setSelectedMfaHint] = useState<any>(null);

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
    setAuthError(null);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error('Login failed:', error);
      if (error.code === 'auth/multi-factor-auth-required') {
        const resolver = getMultiFactorResolver(auth, error);
        setMfaResolver(resolver);
      } else {
        setAuthError(error.message);
      }
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error: any) {
      console.error('Email login failed:', error);
      if (error.code === 'auth/multi-factor-auth-required') {
        const resolver = getMultiFactorResolver(auth, error);
        setMfaResolver(resolver);
      } else {
        setAuthError(error.message);
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSendMfaCode = async (hint: any) => {
    setMfaLoading(true);
    setAuthError(null);
    try {
      const recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
        size: 'invisible'
      });
      
      const phoneInfoOptions = {
        multiFactorHint: hint,
        session: mfaResolver.session
      };
      
      const phoneAuthProvider = new PhoneAuthProvider(auth);
      const verificationId = await phoneAuthProvider.verifyPhoneNumber(phoneInfoOptions, recaptchaVerifier);
      setMfaVerificationId(verificationId);
      setSelectedMfaHint(hint);
    } catch (error: any) {
      console.error('MFA send failed:', error);
      setAuthError(error.message);
    } finally {
      setMfaLoading(false);
    }
  };

  const handleVerifyMfaCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setMfaLoading(true);
    setAuthError(null);
    try {
      const cred = PhoneAuthProvider.credential(mfaVerificationId, mfaCode);
      const multiFactorAssertion = PhoneMultiFactorGenerator.assertion(cred);
      await mfaResolver.resolveSignIn(multiFactorAssertion);
      setMfaResolver(null);
      setMfaVerificationId('');
      setMfaCode('');
      setSelectedMfaHint(null);
    } catch (error: any) {
      console.error('MFA verify failed:', error);
      setAuthError(error.message);
    } finally {
      setMfaLoading(false);
    }
  };

  const handleCancelMfa = () => {
    setMfaResolver(null);
    setMfaVerificationId('');
    setMfaCode('');
    setSelectedMfaHint(null);
    setAuthError(null);
  };

  const handleResetPassword = async () => {
    if (!email) {
      setAuthError('Please enter your email address first.');
      return;
    }
    setAuthError(null);
    setAuthLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setResetSent(true);
      setTimeout(() => setResetSent(false), 5000);
    } catch (error: any) {
      console.error('Reset failed:', error);
      setAuthError(error.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSendEmailVerification = async () => {
    if (!user) return;
    setAuthLoading(true);
    setAuthError(null);
    try {
      await sendEmailVerification(user);
      setVerificationSent(true);
      setTimeout(() => setVerificationSent(false), 5000);
    } catch (error: any) {
      console.error('Verification send failed:', error);
      setAuthError(error.message);
    } finally {
      setAuthLoading(false);
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
      <div className="min-h-screen bg-midnight-bg flex items-center justify-center">
        <CursorGlow />
        <div className="animate-pulse text-amber-500 font-mono">INITIALIZING ELECTION COMMAND CENTER...</div>
      </div>
    );
  }

  const isAdmin = user && ADMIN_EMAILS.includes(user.email || '');
  const isEmailVerified = user?.emailVerified;

  // If on admin path but not logged in as admin, show login screen
  if (isAdminPath && (!isAdmin || !isEmailVerified)) {
    return (
      <div className="min-h-screen bg-midnight-bg text-zinc-100 flex items-center justify-center p-4">
        <CursorGlow />
        <div className="max-w-md w-full space-y-8">
          <div className="text-center space-y-4">
            <div className="w-20 h-20 bg-amber-500/10 border border-amber-500/20 rounded-3xl flex items-center justify-center mx-auto text-amber-500">
              <ShieldCheck size={40} />
            </div>
            <h1 className="text-3xl font-black uppercase tracking-tighter">Admin Access</h1>
            <p className="text-zinc-500 text-sm">
              {isAdmin && !isEmailVerified 
                ? "Your email is not verified. Please check your inbox." 
                : "Restricted area. Please authenticate to continue."}
            </p>
          </div>

          <div className="bg-midnight-surface/50 border border-midnight-border p-8 rounded-3xl backdrop-blur-sm space-y-6">
            <div id="recaptcha-container"></div>
            
            {isAdmin && !isEmailVerified ? (
              <div className="space-y-6 text-center">
                <div className="p-6 bg-amber-500/5 border border-amber-500/10 rounded-2xl space-y-4">
                  <Clock className="mx-auto text-amber-500" size={32} />
                  <p className="text-sm text-zinc-300">
                    We've sent a verification link to <span className="text-amber-500 font-bold">{user.email}</span>. 
                    You must verify your email to access the command center.
                  </p>
                </div>
                
                <button 
                  onClick={handleSendEmailVerification}
                  disabled={authLoading || verificationSent}
                  className="w-full bg-amber-500 text-zinc-950 font-black py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-amber-400 transition-colors disabled:opacity-50"
                >
                  {authLoading ? <Loader2 className="animate-spin" /> : verificationSent ? "Email Sent!" : "Resend Verification Email"}
                </button>

                <button 
                  onClick={handleLogout}
                  className="text-xs font-bold text-zinc-500 hover:text-zinc-300 uppercase tracking-widest transition-colors"
                >
                  Sign in with a different account
                </button>
              </div>
            ) : mfaResolver ? (
              <div className="space-y-6">
                <div className="text-center space-y-2">
                  <h3 className="text-lg font-bold text-white">Two-Factor Authentication</h3>
                  <p className="text-xs text-zinc-500">A second factor is required to complete your sign-in.</p>
                </div>

                {!mfaVerificationId ? (
                  <div className="space-y-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 text-center">Select a verification method</p>
                    {mfaResolver.hints.map((hint: any, i: number) => (
                      <button
                        key={i}
                        onClick={() => handleSendMfaCode(hint)}
                        disabled={mfaLoading}
                        className="w-full flex items-center justify-between p-4 bg-midnight-bg border border-midnight-border rounded-xl hover:border-amber-500 transition-all group"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-amber-500/10 rounded-lg flex items-center justify-center text-amber-500">
                            <Clock size={16} />
                          </div>
                          <div className="text-left">
                            <p className="text-xs font-bold text-white">{hint.displayName || 'Phone Number'}</p>
                            <p className="text-[10px] text-zinc-500">{hint.phoneNumber}</p>
                          </div>
                        </div>
                        <ArrowRight size={16} className="text-zinc-600 group-hover:text-amber-500 transition-colors" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <form onSubmit={handleVerifyMfaCode} className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-1">Verification Code</label>
                      <input 
                        type="text"
                        required
                        value={mfaCode}
                        onChange={(e) => setMfaCode(e.target.value)}
                        placeholder="123456"
                        className="w-full bg-midnight-bg border border-midnight-border rounded-xl px-4 py-3 focus:outline-none focus:border-amber-500 transition-colors text-center text-xl tracking-[0.5em] font-mono"
                      />
                      <p className="text-[8px] text-zinc-500 text-center uppercase tracking-widest">Sent to {selectedMfaHint?.phoneNumber}</p>
                    </div>
                    
                    <button 
                      type="submit"
                      disabled={mfaLoading}
                      className="w-full bg-amber-500 text-zinc-950 font-black py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-amber-400 transition-colors disabled:opacity-50"
                    >
                      {mfaLoading ? <Loader2 className="animate-spin" /> : <>Verify Code <ArrowRight size={18} /></>}
                    </button>
                  </form>
                )}

                <button 
                  onClick={handleCancelMfa}
                  className="w-full text-[10px] font-bold text-zinc-500 hover:text-zinc-300 transition-colors uppercase tracking-widest text-center"
                >
                  Cancel and try again
                </button>
              </div>
            ) : (
              <>
                <div className="flex p-1 bg-midnight-bg rounded-xl border border-midnight-border">
              <button 
                onClick={() => setLoginMethod('google')}
                className={cn(
                  "flex-1 py-2 text-xs font-bold uppercase tracking-widest rounded-lg transition-all",
                  loginMethod === 'google' ? "bg-amber-500 text-zinc-950" : "text-zinc-500 hover:text-zinc-300"
                )}
              >
                Google
              </button>
              <button 
                onClick={() => setLoginMethod('password')}
                className={cn(
                  "flex-1 py-2 text-xs font-bold uppercase tracking-widest rounded-lg transition-all",
                  loginMethod === 'password' ? "bg-amber-500 text-zinc-950" : "text-zinc-500 hover:text-zinc-300"
                )}
              >
                Password
              </button>
            </div>

                {loginMethod === 'google' ? (
                  <button 
                    onClick={handleLogin}
                    className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-white text-zinc-950 rounded-2xl font-black uppercase tracking-widest hover:bg-zinc-200 transition-all shadow-xl shadow-white/5"
                  >
                    <LogIn size={20} />
                    <span>Login with Google</span>
                  </button>
                ) : (
                  <form onSubmit={handleEmailLogin} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-1">Email Address</label>
                  <input 
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@example.com"
                    className="w-full bg-midnight-bg border border-midnight-border rounded-xl px-4 py-3 focus:outline-none focus:border-amber-500 transition-colors"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-1">Password</label>
                  <input 
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-midnight-bg border border-midnight-border rounded-xl px-4 py-3 focus:outline-none focus:border-amber-500 transition-colors"
                  />
                </div>
                
                <button 
                  type="submit"
                  disabled={authLoading}
                  className="w-full bg-amber-500 text-zinc-950 font-black py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-amber-400 transition-colors disabled:opacity-50"
                >
                  {authLoading ? <Loader2 className="animate-spin" /> : <>Sign In <ArrowRight size={18} /></>}
                </button>

                <div className="flex items-center justify-between px-1">
                  <button 
                    type="button"
                    onClick={handleResetPassword}
                    className="text-[10px] font-bold text-zinc-500 hover:text-amber-500 transition-colors uppercase tracking-widest"
                  >
                    Forgot Password?
                  </button>
                </div>
              </form>
            )}

            {authError && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-500 text-xs">
                <X size={16} />
                <p>{authError}</p>
              </div>
            )}

                {resetSent && (
                  <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl flex items-center gap-3 text-green-500 text-xs text-center justify-center">
                    <p>Password reset email sent! Check your inbox.</p>
                  </div>
                )}
              </>
            )}
          </div>
          
          <div className="text-center">
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
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-midnight-bg text-zinc-100 font-sans selection:bg-amber-500/30">
      <CursorGlow />
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-midnight-border bg-midnight-bg/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {electionConfig?.bannerUrl ? (
              <img src={electionConfig.bannerUrl} alt="Logo" className="w-8 h-8 rounded-lg object-cover border border-midnight-border" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-8 h-8 bg-amber-500 rounded flex items-center justify-center text-zinc-950 font-bold">M</div>
            )}
            <h1 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 hidden sm:block">
              {electionConfig?.electionName || 'MULEMBE NATION UNIVERSITY'}
            </h1>
            {isAdmin && (
              <div className={cn(
                "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border flex items-center gap-1.5 transition-all duration-500",
                electionConfig?.status === 'live' ? "bg-green-500/10 border-green-500/20 text-green-500 shadow-[0_0_10px_rgba(34,197,94,0.2)]" :
                electionConfig?.status === 'paused' ? "bg-amber-500/10 border-amber-500/20 text-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.2)]" :
                "bg-red-500/10 border-red-500/20 text-red-500 shadow-[0_0_10px_rgba(239,68,68,0.2)]"
              )}>
                <span className="relative flex h-1.5 w-1.5">
                  <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-75", electionConfig?.status === 'live' ? "bg-green-400" : electionConfig?.status === 'paused' ? "bg-amber-400" : "bg-red-400")}></span>
                  <span className={cn("relative inline-flex rounded-full h-1.5 w-1.5", electionConfig?.status === 'live' ? "bg-green-500" : electionConfig?.status === 'paused' ? "bg-amber-500" : "bg-red-500")}></span>
                </span>
                <motion.span
                  key={electionConfig?.status}
                  initial={{ opacity: 0, x: -5 }}
                  animate={{ opacity: 1, x: 0 }}
                >
                  {electionConfig?.status || 'OFFLINE'}
                </motion.span>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 bg-midnight-surface p-1 rounded-lg border border-midnight-border">
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
