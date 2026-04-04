import React, { useState, useEffect, useRef } from 'react';
import { db, storage, auth } from '../lib/firebase';
import { doc, setDoc, onSnapshot, collection, deleteDoc, writeBatch } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Database, Loader2, Plus, Trash2, Upload, X, UserPlus, User, Users, Image as ImageIcon, FileJson, CheckCircle2, Pencil, Settings, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

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

function getFriendlyErrorMessage(error: any, operation: string): string {
  const msg = error?.message || String(error);
  if (msg.includes('permission-denied') || error?.code === 'permission-denied') {
    return `Access Denied: You don't have permission to ${operation}. Admin privileges required.`;
  }
  if (msg.includes('quota-exceeded')) {
    return "System Limit: Database quota exceeded for today. Please try again later.";
  }
  if (msg.includes('storage/unauthorized')) {
    return "Upload Error: You are not authorized to upload files to storage.";
  }
  if (msg.includes('not-found')) {
    return `Not Found: The resource for ${operation} could not be located.`;
  }
  return msg;
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

const VALID_ROLES = ['Chairperson', 'Vice Chairperson', 'Sec.General', 'Treasurer', 'P. Coordinator'];

export default function AdminSeed() {
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [voters, setVoters] = useState<any[]>([]);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const notifyError = (error: any, operation: string, path: string | null = null) => {
    setErrorMessage(getFriendlyErrorMessage(error, operation));
    try {
      handleFirestoreError(error, operation as any, path);
    } catch (e) { /* ignore re-throw */ }
  };
  
  // Form State (Candidate)
  const [name, setName] = useState('');
  const [faculty, setFaculty] = useState('Engineering');
  const [role, setRole] = useState('');
  const [bio, setBio] = useState('');
  const [manifesto, setManifesto] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  
  // Voter State
  const [voterAdm, setVoterAdm] = useState('');
  const [voterEmail, setVoterEmail] = useState('');
  const [voterFaculty, setVoterFaculty] = useState('Engineering');
  const [editingVoterId, setEditingVoterId] = useState<string | null>(null);
  
  // Sidebar State
  const [activeTab, setActiveTab] = useState<'candidates' | 'voters' | 'bulk' | 'control'>('candidates');
  
  // Settings State
  const [electionName, setElectionName] = useState('Mulembe Nation University Guild Elections 2025');
  const [openingTime, setOpeningTime] = useState('');
  const [closingTime, setClosingTime] = useState('');
  const [electionStatus, setElectionStatus] = useState<'live' | 'paused' | 'ended'>('live');
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState('');
  
  // Bulk State
  const [bulkData, setBulkData] = useState('');

  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showModal && activeTab === 'candidates') {
      setTimeout(() => nameInputRef.current?.focus(), 100);
    }
  }, [showModal, activeTab]);

  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  useEffect(() => {
    if (errorMessage) {
      const timer = setTimeout(() => setErrorMessage(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [errorMessage]);

  useEffect(() => {
    const unsubCandidates = onSnapshot(collection(db, 'candidates'), (snap) => {
      setCandidates(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      notifyError(error, 'load candidates', 'candidates');
    });
    const unsubVoters = onSnapshot(collection(db, 'voters'), (snap) => {
      setVoters(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      notifyError(error, 'load voters', 'voters');
    });
    const unsubConfig = onSnapshot(doc(db, 'config', 'config'), (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        setElectionName(data.electionName || 'Mulembe Nation University Guild Elections 2025');
        
        // Convert UTC ISO strings from Firestore to local YYYY-MM-DDTHH:mm for datetime-local input
        const formatForInput = (iso: string) => {
          if (!iso) return '';
          const d = new Date(iso);
          const offset = d.getTimezoneOffset() * 60000;
          return new Date(d.getTime() - offset).toISOString().slice(0, 16);
        };

        setOpeningTime(formatForInput(data.openingTime));
        setClosingTime(formatForInput(data.closingTime));
        setElectionStatus(data.status || 'live');
        setBannerUrl(data.bannerUrl || '');
      }
    }, (error) => {
      notifyError(error, 'load election config', 'config/config');
    });
    return () => {
      unsubCandidates();
      unsubVoters();
      unsubConfig();
    };
  }, []);

  const handleBannerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setBannerFile(file);
      setBannerPreview(URL.createObjectURL(file));
    }
  };

  const handleRemoveBanner = () => {
    setBannerFile(null);
    setBannerPreview(null);
    setBannerUrl('');
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploading(true);
    try {
      let finalBannerUrl = bannerUrl;
      if (bannerFile) {
        const storageRef = ref(storage, `config/banner_${Date.now()}_${bannerFile.name}`);
        const snapshot = await uploadBytes(storageRef, bannerFile);
        finalBannerUrl = await getDownloadURL(snapshot.ref);
      }

      const configData: any = {
        electionName,
        bannerUrl: finalBannerUrl,
        status: electionStatus
      };

      if (openingTime) configData.openingTime = new Date(openingTime).toISOString();
      if (closingTime) configData.closingTime = new Date(closingTime).toISOString();

      await setDoc(doc(db, 'config', 'config'), configData);
      
      setBannerFile(null);
      setBannerPreview(null);
      setSuccessMessage('Settings saved successfully!');
    } catch (err: any) {
      notifyError(err, 'save settings', 'config/config');
    } finally {
      setUploading(false);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleAddCandidate = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const trimmedName = name.trim();
    if (!trimmedName) {
      alert('Please enter a candidate name');
      return;
    }
    if (!faculty) {
      alert('Please select a faculty');
      return;
    }
    
    const trimmedRole = role.trim();
    if (!trimmedRole || !VALID_ROLES.includes(trimmedRole)) {
      alert('Please select a valid guild position');
      return;
    }

    if (!imageFile) {
      alert('Please upload a candidate profile image');
      return;
    }
    
    setUploading(true);
    console.log('Adding candidate:', trimmedName);
    
    try {
      let imageUrl = '';
      if (imageFile) {
        console.log('Uploading image...');
        const storageRef = ref(storage, `candidates/${Date.now()}_${imageFile.name}`);
        const snapshot = await uploadBytes(storageRef, imageFile);
        imageUrl = await getDownloadURL(snapshot.ref);
        console.log('Image uploaded:', imageUrl);
      }

      const candidateId = trimmedName.toLowerCase().replace(/\s+/g, '-');
      console.log('Setting document:', candidateId);
      
      await setDoc(doc(db, 'candidates', candidateId), {
        name: trimmedName,
        faculty,
        role: role.trim(),
        bio: bio.trim(),
        manifesto: manifesto.trim(),
        imageUrl,
        voteCount: 0
      });

      // Reset form
      setName('');
      setBio('');
      setManifesto('');
      setImageFile(null);
      setImagePreview(null);
      setSuccessMessage('Candidate added successfully!');
      
      // Re-focus name input for next entry
      setTimeout(() => nameInputRef.current?.focus(), 100);
    } catch (err: any) {
      notifyError(err, 'add candidate', 'candidates');
    } finally {
      setUploading(false);
    }
  };

  const handleAddVoter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voterAdm.trim() || !voterEmail.trim()) {
      alert('Admission Number and Email are required');
      return;
    }
    setUploading(true);
    try {
      const safeId = voterAdm.trim().replace(/\//g, '_');
      await setDoc(doc(db, 'voters', safeId), {
        admissionNumber: voterAdm.trim(),
        email: voterEmail.trim(),
        faculty: voterFaculty,
        hasVoted: editingVoterId ? voters.find(v => v.id === editingVoterId)?.hasVoted : false
      });
      
      // If we were editing and the ID changed, delete the old record
      if (editingVoterId && editingVoterId !== safeId) {
        await deleteDoc(doc(db, 'voters', editingVoterId));
      }

      setVoterAdm('');
      setVoterEmail('');
      setEditingVoterId(null);
      setSuccessMessage(editingVoterId ? 'Voter updated successfully!' : 'Voter added successfully!');
    } catch (err: any) {
      notifyError(err, editingVoterId ? 'update voter' : 'add voter', 'voters');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteVoter = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this voter?')) return;
    try {
      await deleteDoc(doc(db, 'voters', id));
      setSuccessMessage('Voter deleted successfully!');
      if (editingVoterId === id) {
        setEditingVoterId(null);
        setVoterAdm('');
        setVoterEmail('');
      }
    } catch (err) {
      notifyError(err, 'delete voter', `voters/${id}`);
    }
  };

  const handleEditVoter = (voter: any) => {
    setEditingVoterId(voter.id);
    setVoterAdm(voter.admissionNumber);
    setVoterEmail(voter.email);
    setVoterFaculty(voter.faculty);
    setActiveTab('voters');
  };

  const handleBulkImport = async () => {
    if (!bulkData.trim()) return;
    setUploading(true);
    try {
      let data: any[] = [];
      
      // Try parsing as JSON first
      try {
        const parsed = JSON.parse(bulkData);
        data = Array.isArray(parsed) ? parsed : [parsed];
      } catch (e) {
        // If JSON fails, parse as simple list
        console.log('JSON parse failed, trying simple list format...');
        const lines = bulkData.split('\n').filter(l => l.trim());
        data = lines.map(line => {
          const parts = line.split(',').map(s => s.trim());
          if (bulkMode === 'voters') {
            const [adm, email, faculty] = parts;
            return { admissionNumber: adm, email, faculty: faculty || 'Engineering' };
          } else {
            const [name, faculty, role] = parts;
            return { name, faculty: faculty || 'Engineering', role: role || 'Chairperson' };
          }
        });
      }

      if (data.length === 0) throw new Error('No valid data found');
      
      const batch = writeBatch(db);
      let count = 0;
      
      if (bulkMode === 'voters') {
        for (const item of data) {
          if (!item.admissionNumber || !item.email) continue;
          const safeId = item.admissionNumber.trim().replace(/\//g, '_');
          const ref = doc(db, 'voters', safeId);
          batch.set(ref, {
            admissionNumber: item.admissionNumber,
            email: item.email,
            faculty: item.faculty || 'Engineering',
            hasVoted: false
          });
          count++;
        }
      } else {
        for (const item of data) {
          if (!item.name) continue;
          if (item.role && !VALID_ROLES.includes(item.role)) {
            throw new Error(`Invalid role "${item.role}" for candidate ${item.name}`);
          }
          const id = item.name.toLowerCase().replace(/\s+/g, '-');
          const ref = doc(db, 'candidates', id);
          batch.set(ref, {
            name: item.name,
            faculty: item.faculty || 'Engineering',
            role: item.role || 'Chairperson',
            bio: item.bio || '',
            manifesto: item.manifesto || '',
            imageUrl: item.imageUrl || '',
            voteCount: 0
          });
          count++;
        }
      }
      
      await batch.commit();
      setBulkData('');
      setSuccessMessage(`Successfully added ${count} ${bulkMode === 'voters' ? 'voters' : 'candidates'}!`);
    } catch (err: any) {
      notifyError(err, 'bulk import', 'bulk_import');
    } finally {
      setUploading(false);
    }
  };

  const [bulkMode, setBulkMode] = useState<'candidates' | 'voters'>('candidates');

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      if (activeTab === 'candidates') handleAddCandidate(e as any);
      else if (activeTab === 'voters') handleAddVoter(e as any);
      else handleBulkImport();
    }
  };

  const handleDeleteCandidate = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this candidate?')) return;
    try {
      await deleteDoc(doc(db, 'candidates', id));
      setSuccessMessage('Candidate deleted successfully!');
    } catch (err) {
      notifyError(err, 'delete candidate', `candidates/${id}`);
    }
  };

  const seedDemoData = async () => {
    setLoading(true);
    try {
      // 1. Election Config
      await setDoc(doc(db, 'config', 'config'), {
        openingTime: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
        closingTime: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
        status: 'live'
      });

      // 2. Sample Voters
      const voters = Array.from({ length: 10 }, (_, i) => ({
        admissionNumber: `BIT/${(i + 1).toString().padStart(3, '0')}/2021`,
        email: `voter${i + 1}@student.mu.ac.ke`,
        hasVoted: false,
        faculty: ['Engineering', 'Business', 'Science', 'Arts & Humanities', 'Law', 'Education'][i % 6]
      }));

      for (const v of voters) {
        await setDoc(doc(db, 'voters', v.admissionNumber), v);
      }

      // 3. Sample Candidates
      const demoCandidates = [
        { name: 'John Doe', faculty: 'Engineering', role: 'Chairperson', bio: 'Experienced leader.', manifesto: 'Better facilities for all.' },
        { name: 'Jane Smith', faculty: 'Business', role: 'Chairperson', bio: 'Passionate advocate.', manifesto: 'Transparency in guild funds.' },
        { name: 'Peter Parker', faculty: 'Science', role: 'Sec.General', bio: 'Detail-oriented.', manifesto: 'Digitalizing guild records.' }
      ];

      for (const c of demoCandidates) {
        const id = c.name.toLowerCase().replace(/\s+/g, '-');
        await setDoc(doc(db, 'candidates', id), {
          ...c,
          voteCount: 0,
          imageUrl: '',
          manifesto: c.manifesto
        });
      }

      alert('Election config, sample voters, and candidates seeded!');
    } catch (err) {
      notifyError(err, 'seed demo data', 'seed_data');
    } finally {
      setLoading(false);
    }
  };

  // Only show if user is logged in (admin check is handled by rules, but UI should be clean)
  if (!auth.currentUser) return null;

  return (
    <>
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
        <button 
          onClick={() => setShowModal(true)}
          className="bg-amber-500 text-zinc-950 p-3 rounded-full hover:bg-amber-400 transition-all shadow-2xl flex items-center gap-2 font-bold"
        >
          <UserPlus size={20} />
          <span className="text-xs uppercase tracking-widest hidden sm:block">Manage Candidates</span>
        </button>
        <button 
          onClick={seedDemoData}
          disabled={loading}
          className="bg-zinc-900 border border-zinc-800 p-3 rounded-full text-zinc-500 hover:text-amber-500 transition-colors shadow-2xl flex items-center gap-2"
        >
          {loading ? <Loader2 className="animate-spin" size={20} /> : <Database size={20} />}
          <span className="text-xs font-bold uppercase tracking-widest hidden sm:block">Seed Config</span>
        </button>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-6xl h-[85vh] rounded-[2.5rem] overflow-hidden flex shadow-2xl">
            
            {/* Sidebar */}
            <div className="w-64 bg-zinc-950 border-r border-zinc-800 flex flex-col p-6">
              <div className="flex items-center gap-3 mb-10 px-2">
                <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center text-zinc-950">
                  <Database size={18} />
                </div>
                <h2 className="text-sm font-black uppercase tracking-tighter text-white">Admin Hub</h2>
              </div>

              <nav className="flex-1 space-y-2">
                <SidebarItem 
                  icon={<UserPlus size={18} />} 
                  label="Candidates" 
                  active={activeTab === 'candidates'} 
                  onClick={() => setActiveTab('candidates')} 
                />
                <SidebarItem 
                  icon={<Users size={18} />} 
                  label="Voters" 
                  active={activeTab === 'voters'} 
                  onClick={() => setActiveTab('voters')} 
                />
                <SidebarItem 
                  icon={<FileJson size={18} />} 
                  label="Bulk Import" 
                  active={activeTab === 'bulk'} 
                  onClick={() => setActiveTab('bulk')} 
                />
                <SidebarItem 
                  icon={<Settings size={18} />} 
                  label="Election Control" 
                  active={activeTab === 'control'} 
                  onClick={() => setActiveTab('control')} 
                />
              </nav>

              <div className="pt-6 border-t border-zinc-800">
                <button 
                  onClick={() => setShowModal(false)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-zinc-500 hover:text-white hover:bg-zinc-900 rounded-xl transition-all text-xs font-black uppercase tracking-widest"
                >
                  <X size={18} />
                  Close Hub
                </button>
              </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 flex flex-col min-w-0 bg-zinc-900/50">
              <div className="p-8 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/30">
                <div>
                  <h3 className="text-xl font-black uppercase tracking-tighter text-white">
                    {activeTab === 'candidates' ? 'Candidate Management' : activeTab === 'voters' ? 'Voter Management' : activeTab === 'bulk' ? 'Bulk Data Import' : 'Election Control Center'}
                  </h3>
                  <p className="text-[10px] text-zinc-500 font-black uppercase tracking-[0.2em] mt-1">
                    {activeTab === 'candidates' ? 'Register and manage election candidates' : activeTab === 'voters' ? 'Manage eligible student voters' : activeTab === 'bulk' ? 'Import large datasets via JSON or CSV' : 'Configure election timing, status, and branding'}
                  </p>
                </div>
                
                <AnimatePresence>
                  {successMessage && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 px-4 py-2 rounded-xl text-green-500 text-[10px] font-black uppercase tracking-widest"
                    >
                      <CheckCircle2 size={14} /> {successMessage}
                    </motion.div>
                  )}
                  {errorMessage && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 px-4 py-2 rounded-xl text-red-500 text-[10px] font-black uppercase tracking-widest"
                    >
                      <X size={14} /> {errorMessage}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="flex-1 overflow-y-auto p-8" onKeyDown={handleKeyDown}>
                {activeTab === 'candidates' ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                    <div className="space-y-6">
                      <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-500">Add New Candidate</h4>
                      <form onSubmit={handleAddCandidate} className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-1">
                            Full Name <span className="text-amber-500">*</span>
                          </label>
                          <input 
                            ref={nameInputRef}
                            value={name} onChange={e => setName(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 focus:border-amber-500 outline-none transition-all text-sm"
                            placeholder="e.g. Wanjiku Auma"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-1">
                              Faculty <span className="text-amber-500">*</span>
                            </label>
                            <select 
                              value={faculty} onChange={e => setFaculty(e.target.value)}
                              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 focus:border-amber-500 outline-none transition-all text-sm"
                            >
                              {['Engineering', 'Business', 'Science', 'Arts & Humanities', 'Law', 'Education'].map(f => (
                                <option key={f} value={f}>{f}</option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-1">
                              Role <span className="text-amber-500">*</span>
                            </label>
                            <select 
                              value={role} onChange={e => setRole(e.target.value)}
                              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 focus:border-amber-500 outline-none transition-all text-sm"
                            >
                              <option value="">Select Position</option>
                              {VALID_ROLES.map(r => (
                                <option key={r} value={r}>{r}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Biography</label>
                          <textarea 
                            value={bio} onChange={e => setBio(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 focus:border-amber-500 outline-none transition-all text-sm h-24 resize-none"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Manifesto Summary</label>
                          <textarea 
                            value={manifesto} onChange={e => setManifesto(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 focus:border-amber-500 outline-none transition-all text-sm h-24 resize-none"
                          />
                        </div>
                        
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-1">
                            Candidate Image <span className="text-amber-500">*</span>
                          </label>
                          <div className="flex items-center gap-6 p-6 bg-zinc-950 border border-dashed border-zinc-800 rounded-2xl">
                            <div className="w-24 h-24 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center overflow-hidden relative group/preview shrink-0 shadow-inner">
                              {imagePreview ? (
                                <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                              ) : (
                                <div className="flex flex-col items-center gap-1">
                                  <User size={32} className="text-zinc-800" />
                                </div>
                              )}
                              {imageFile && (
                                <button 
                                  type="button" 
                                  onClick={() => { setImageFile(null); setImagePreview(null); }}
                                  className="absolute inset-0 bg-red-500/90 flex items-center justify-center opacity-0 group-hover/preview:opacity-100 transition-opacity text-white"
                                >
                                  <X size={20} />
                                </button>
                              )}
                            </div>
                            
                            <label className="flex-1 flex items-center justify-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 cursor-pointer hover:border-amber-500/50 transition-all group">
                              <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                              <Upload size={18} className="text-zinc-500 group-hover:text-amber-500" />
                              <span className="text-xs text-zinc-500 group-hover:text-zinc-300">
                                {imageFile ? 'Change Image' : 'Upload Profile Image'}
                              </span>
                            </label>
                          </div>
                        </div>

                        <button 
                          type="submit"
                          disabled={uploading}
                          className="w-full bg-amber-500 text-zinc-950 font-black py-4 rounded-xl hover:bg-amber-400 transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-amber-500/10"
                        >
                          {uploading ? <Loader2 className="animate-spin" /> : <><Plus size={18} /> Add Candidate</>}
                        </button>
                      </form>
                    </div>

                    <div className="space-y-6">
                      <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500">Current Candidates ({candidates.length})</h4>
                      <div className="space-y-3">
                        {candidates.map(c => (
                          <div key={c.id} className="bg-zinc-950/50 border border-zinc-800 p-4 rounded-2xl flex items-center justify-between group hover:border-zinc-700 transition-all">
                            <div className="flex items-center gap-4">
                              {c.imageUrl ? (
                                <img src={c.imageUrl} alt={c.name} className="w-12 h-12 rounded-xl object-cover border border-zinc-800" referrerPolicy="no-referrer" />
                              ) : (
                                <div className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-500">
                                  <ImageIcon size={20} />
                                </div>
                              )}
                              <div>
                                <p className="font-bold text-sm text-white">{c.name}</p>
                                <p className="text-[10px] text-zinc-500 uppercase font-black tracking-widest">{c.role} • {c.faculty}</p>
                              </div>
                            </div>
                            <button 
                              onClick={() => handleDeleteCandidate(c.id)}
                              className="p-2 text-zinc-700 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        ))}
                        {candidates.length === 0 && (
                          <div className="text-center py-12 border border-dashed border-zinc-800 rounded-3xl">
                            <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest">No candidates found</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : activeTab === 'voters' ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                    <div className="space-y-6">
                      <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-500">
                        {editingVoterId ? 'Edit Voter Details' : 'Add New Voter'}
                      </h4>
                      <form onSubmit={handleAddVoter} className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-1">
                            Admission Number <span className="text-amber-500">*</span>
                          </label>
                          <input 
                            value={voterAdm} onChange={e => setVoterAdm(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 focus:border-amber-500 outline-none transition-all text-sm font-mono"
                            placeholder="e.g. BIT/001/2021"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-1">
                            Student Email <span className="text-amber-500">*</span>
                          </label>
                          <input 
                            type="email"
                            value={voterEmail} onChange={e => setVoterEmail(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 focus:border-amber-500 outline-none transition-all text-sm"
                            placeholder="e.g. student@mu.ac.ke"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-1">
                            Faculty <span className="text-amber-500">*</span>
                          </label>
                          <select 
                            value={voterFaculty} onChange={e => setVoterFaculty(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 focus:border-amber-500 outline-none transition-all text-sm"
                          >
                            {['Engineering', 'Business', 'Science', 'Arts & Humanities', 'Law', 'Education'].map(f => (
                              <option key={f} value={f}>{f}</option>
                            ))}
                          </select>
                        </div>
                        <div className="flex gap-2">
                          <button 
                            type="submit"
                            disabled={uploading}
                            className="flex-1 bg-amber-500 text-zinc-950 font-black py-4 rounded-xl hover:bg-amber-400 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                          >
                            {uploading ? <Loader2 className="animate-spin" /> : (
                              editingVoterId ? <><CheckCircle2 size={18} /> Update Voter</> : <><UserPlus size={18} /> Add Voter</>
                            )}
                          </button>
                          {editingVoterId && (
                            <button 
                              type="button"
                              onClick={() => {
                                setEditingVoterId(null);
                                setVoterAdm('');
                                setVoterEmail('');
                              }}
                              className="px-6 bg-zinc-800 text-white font-black py-4 rounded-xl hover:bg-zinc-700 transition-all"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </form>
                    </div>

                    <div className="space-y-6">
                      <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500">Registered Voters ({voters.length})</h4>
                      <div className="space-y-3">
                        {voters.map(v => (
                          <div key={v.id} className="bg-zinc-950/50 border border-zinc-800 p-4 rounded-2xl flex items-center justify-between group hover:border-zinc-700 transition-all">
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-500">
                                <User size={20} />
                              </div>
                              <div>
                                <p className="font-bold text-sm text-white">{v.admissionNumber}</p>
                                <p className="text-[10px] text-zinc-500 uppercase font-black tracking-widest">
                                  {v.email} • {v.faculty}
                                </p>
                                {v.hasVoted && (
                                  <span className="text-[8px] font-black text-green-500 uppercase tracking-widest bg-green-500/10 px-2 py-0.5 rounded-full">Voted</span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                              <button 
                                onClick={() => handleEditVoter(v)}
                                className="p-2 text-zinc-700 hover:text-amber-500 hover:bg-amber-500/10 rounded-lg transition-all"
                              >
                                <Pencil size={18} />
                              </button>
                              <button 
                                onClick={() => handleDeleteVoter(v.id)}
                                className="p-2 text-zinc-700 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>
                          </div>
                        ))}
                        {voters.length === 0 && (
                          <div className="text-center py-12 border border-dashed border-zinc-800 rounded-3xl">
                            <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest">No voters found</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : activeTab === 'bulk' ? (
                  <div className="max-w-3xl mx-auto space-y-8">
                    <div className="flex bg-zinc-950 p-1 rounded-2xl border border-zinc-800 w-fit mx-auto">
                      <button 
                        onClick={() => setBulkMode('candidates')}
                        className={cn(
                          "px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
                          bulkMode === 'candidates' ? "bg-amber-500 text-zinc-950" : "text-zinc-500 hover:text-zinc-300"
                        )}
                      >
                        Candidates
                      </button>
                      <button 
                        onClick={() => setBulkMode('voters')}
                        className={cn(
                          "px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
                          bulkMode === 'voters' ? "bg-amber-500 text-zinc-950" : "text-zinc-500 hover:text-zinc-300"
                        )}
                      >
                        Voters
                      </button>
                    </div>

                    <div className="bg-zinc-950 p-6 rounded-3xl border border-zinc-800 space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-3">
                          <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Format: CSV / Simple List</p>
                          <pre className="text-[10px] text-zinc-400 font-mono leading-relaxed bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800/50">
                            {bulkMode === 'voters' 
                              ? `BIT/001/2021, student1@mu.ac.ke, Engineering\nBIT/002/2021, student2@mu.ac.ke, Business`
                              : `John Doe, Engineering, Chairperson\nJane Smith, Business, Sec.General`}
                          </pre>
                        </div>
                        <div className="space-y-3">
                          <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Format: JSON Array</p>
                          <pre className="text-[10px] text-zinc-400 font-mono leading-relaxed bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800/50">
                            {bulkMode === 'voters'
                              ? `[ { "admissionNumber": "...", "email": "...", "faculty": "..." } ]`
                              : `[ { "name": "...", "faculty": "...", "role": "..." } ]`}
                          </pre>
                        </div>
                      </div>

                      <textarea 
                        value={bulkData}
                        onChange={e => setBulkData(e.target.value)}
                        placeholder={`Paste your ${bulkMode} data here...`}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-6 py-6 focus:border-amber-500 outline-none transition-all text-sm font-mono h-[300px] resize-none"
                      />
                      
                      <button 
                        onClick={handleBulkImport}
                        disabled={uploading || !bulkData.trim()}
                        className="w-full bg-blue-500 text-white font-black py-4 rounded-xl hover:bg-blue-400 transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-blue-500/10"
                      >
                        {uploading ? <Loader2 className="animate-spin" /> : <><FileJson size={18} /> Run Bulk Import</>}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="max-w-2xl mx-auto space-y-8">
                    <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-8 space-y-8">
                      <div className="flex items-center gap-4 pb-6 border-b border-zinc-900">
                        <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center text-amber-500">
                          <Settings size={24} />
                        </div>
                        <div>
                          <h4 className="text-lg font-bold">Election Control</h4>
                          <p className="text-xs text-zinc-500">Set election times and operational status</p>
                        </div>
                      </div>

                      <form onSubmit={handleSaveSettings} className="space-y-6">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Election Name</label>
                          <input 
                            value={electionName} onChange={e => setElectionName(e.target.value)}
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 focus:border-amber-500 outline-none transition-all text-sm"
                            placeholder="e.g. Guild Elections 2025"
                          />
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                                <Clock size={12} /> Opening Time
                              </label>
                              <div className="flex gap-2">
                                <button 
                                  type="button"
                                  onClick={() => {
                                    const d = new Date();
                                    const offset = d.getTimezoneOffset() * 60000;
                                    setOpeningTime(new Date(d.getTime() - offset).toISOString().slice(0, 16));
                                  }}
                                  className="text-[8px] font-black text-amber-500 uppercase tracking-widest hover:text-amber-400"
                                >
                                  Now
                                </button>
                                <button 
                                  type="button"
                                  onClick={() => setOpeningTime('')}
                                  className="text-[8px] font-black text-red-500 uppercase tracking-widest hover:text-red-400"
                                >
                                  Clear
                                </button>
                              </div>
                            </div>
                            <input 
                              type="datetime-local"
                              value={openingTime} onChange={e => setOpeningTime(e.target.value)}
                              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 focus:border-amber-500 outline-none transition-all text-sm"
                            />
                          </div>
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                                <Clock size={12} /> Closing Time
                              </label>
                              <div className="flex gap-2">
                                <button 
                                  type="button"
                                  onClick={() => {
                                    const d = new Date();
                                    const offset = d.getTimezoneOffset() * 60000;
                                    setClosingTime(new Date(d.getTime() - offset).toISOString().slice(0, 16));
                                  }}
                                  className="text-[8px] font-black text-amber-500 uppercase tracking-widest hover:text-amber-400"
                                >
                                  Now
                                </button>
                                <button 
                                  type="button"
                                  onClick={() => setClosingTime('')}
                                  className="text-[8px] font-black text-red-500 uppercase tracking-widest hover:text-red-400"
                                >
                                  Clear
                                </button>
                              </div>
                            </div>
                            <input 
                              type="datetime-local"
                              value={closingTime} onChange={e => setClosingTime(e.target.value)}
                              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 focus:border-amber-500 outline-none transition-all text-sm"
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Election Status</label>
                          <div className="grid grid-cols-3 gap-3">
                            {[
                              { id: 'live', label: 'Live', color: 'bg-green-500' },
                              { id: 'paused', label: 'Paused', color: 'bg-amber-500' },
                              { id: 'ended', label: 'Ended', color: 'bg-red-500' }
                            ].map((s) => (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => setElectionStatus(s.id as any)}
                                className={cn(
                                  "flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all",
                                  electionStatus === s.id 
                                    ? "bg-zinc-900 border-amber-500 shadow-lg shadow-amber-500/5" 
                                    : "bg-zinc-950 border-zinc-800 hover:border-zinc-700"
                                )}
                              >
                                <div className={cn("w-3 h-3 rounded-full", s.color, electionStatus === s.id && "animate-pulse")} />
                                <span className={cn("text-[10px] font-black uppercase tracking-widest", electionStatus === s.id ? "text-white" : "text-zinc-500")}>
                                  {s.label}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Election Banner / Logo</label>
                          <div className="flex items-center gap-6 p-6 bg-zinc-900 border border-dashed border-zinc-800 rounded-2xl">
                            <div className="w-32 h-20 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-center overflow-hidden relative group/banner shrink-0 shadow-inner">
                              {bannerPreview || bannerUrl ? (
                                <img src={bannerPreview || bannerUrl} alt="Banner" className="w-full h-full object-cover" />
                              ) : (
                                <ImageIcon size={32} className="text-zinc-800" />
                              )}
                              {(bannerFile || bannerUrl) && (
                                <button 
                                  type="button" 
                                  onClick={handleRemoveBanner}
                                  className="absolute inset-0 bg-red-500/90 flex items-center justify-center opacity-0 group-hover/banner:opacity-100 transition-opacity text-white"
                                >
                                  <X size={20} />
                                </button>
                              )}
                            </div>
                            
                            <label className="flex-1 flex items-center justify-center gap-2 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 cursor-pointer hover:border-amber-500/50 transition-all group">
                              <input type="file" accept="image/*" onChange={handleBannerChange} className="hidden" />
                              <Upload size={18} className="text-zinc-500 group-hover:text-amber-500" />
                              <span className="text-xs text-zinc-500 group-hover:text-zinc-300">
                                {bannerFile ? 'Change Banner' : 'Upload Banner'}
                              </span>
                            </label>
                          </div>
                        </div>

                        <button 
                          type="submit"
                          disabled={uploading}
                          className="w-full bg-amber-500 text-zinc-950 font-black py-4 rounded-xl hover:bg-amber-400 transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-xl shadow-amber-500/20"
                        >
                          {uploading ? <Loader2 className="animate-spin" /> : <><CheckCircle2 size={18} /> Save Election Configuration</>}
                        </button>
                      </form>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function SidebarItem({ icon, label, active, onClick }: { icon: any, label: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all group",
        active 
          ? "bg-amber-500 text-zinc-950 font-black shadow-lg shadow-amber-500/10" 
          : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900"
      )}
    >
      <div className={cn("transition-transform duration-300", active ? "scale-110" : "group-hover:scale-110")}>
        {icon}
      </div>
      <span className="text-xs uppercase tracking-widest">{label}</span>
    </button>
  );
}
