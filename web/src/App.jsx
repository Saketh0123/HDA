import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Menu,
  LogOut,
  Home,
  Users,
  BookOpen,
  MessageSquare,
  DollarSign,
  TrendingUp,
  ArrowLeft,
  Camera,
} from 'lucide-react';
import { getIdTokenResult, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  collection,
  doc,
  deleteField,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { format } from 'date-fns';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { auth, db, functions } from './firebase';
import {
  Alert,
  Badge,
  Button,
  Card,
  Input,
  Modal,
  Pagination,
  ProgressBar,
  Select,
  SummaryCard,
  Table,
  Textarea,
} from './ComponentLibrary';

const PAGE_SIZE = 10;

const STREAM_OPTIONS = ['TECHNICAL', 'EAPCET', 'NDA', 'CEC'];
const SUBJECT_OPTIONS = ['Physics', 'Chemistry', 'Mathematics', 'Biology', 'English'];
const REMARK_SUBJECT_OPTIONS = ['General', ...SUBJECT_OPTIONS];
const SPEND_CATEGORIES = ['Salary', 'Maintenance', 'Utilities', 'Supplies', 'Other'];

function getAcademicBatchStartYear(date = new Date()) {
  // Future batches from current calendar year.
  // Example: 2026 => 2026-2027, 2027-2028, ...
  return date.getFullYear();
}

function formatBatch(startYear) {
  const y = Number(startYear);
  if (!Number.isFinite(y)) return '';
  return `${y}-${y + 1}`;
}

function getBatchOptions(count = 10, date = new Date()) {
  const start = getAcademicBatchStartYear(date);
  const years = [];
  for (let i = 0; i < count; i++) {
    years.push(formatBatch(start + i));
  }
  return years;
}

const BATCH_OPTIONS = getBatchOptions(10);
const DEFAULT_BATCH = BATCH_OPTIONS[0] || formatBatch(getAcademicBatchStartYear());

const adminCreateAdmission = httpsCallable(functions, 'adminCreateAdmission');
const updateStudentMarks = httpsCallable(functions, 'updateStudentMarks');
const addStudentRemark = httpsCallable(functions, 'addStudentRemark');
const updateFees = httpsCallable(functions, 'updateFees');
const addStatisticsEntry = httpsCallable(functions, 'addStatisticsEntry');
const adminMigrateStudents = httpsCallable(functions, 'adminMigrateStudents');
const adminDeleteStudent = httpsCallable(functions, 'adminDeleteStudent');

function normalizeTerm(input) {
  return String(input || '').trim().replace(/\s+/g, ' ');
}

function isProbablyAdmissionNumber(term) {
  const t = String(term || '').trim().toUpperCase();
  return t.startsWith('HDA') || /^HDA[-\dA-Z]+$/.test(t);
}

function isProbablyUid(term) {
  const t = String(term || '').trim();
  return t.length >= 20 && !/\s/.test(t);
}

function extractDigitsInt(input) {
  const digits = String(input || '').replace(/\D/g, '');
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

function admissionMatchesTerm(admissionNumber, term) {
  const a = String(admissionNumber || '').toUpperCase();
  const t = String(term || '').trim().toUpperCase();
  if (!t) return true;

  // Quick substring match first.
  if (a.includes(t)) return true;

  // Numeric equality match so HDA001 matches HDA0001.
  const an = extractDigitsInt(a);
  const tn = extractDigitsInt(t);
  if (an !== null && tn !== null && an === tn) return true;

  return false;
}

function getStudentStreamValue(student) {
  const raw =
    typeof student?.stream === 'string'
      ? student.stream
      : typeof student?.courseOfStudy === 'string'
        ? student.courseOfStudy
        : '';
  return String(raw || '').trim();
}

function studentMatchesSearch(student, term) {
  const t = normalizeTerm(term);
  if (!t) return true;

  if (isProbablyAdmissionNumber(t)) {
    return admissionMatchesTerm(student?.admissionNumber, t);
  }
  if (isProbablyUid(t)) {
    return String(student?.id || '').includes(t);
  }

  const tLower = t.toLowerCase();
  const name = String(student?.nameLower || student?.name || '').toLowerCase();
  const admission = String(student?.admissionNumber || '').toUpperCase();
  return name.includes(tLower) || admissionMatchesTerm(admission, t);
}

function formatCurrency(amount) {
  const value = typeof amount === 'number' && Number.isFinite(amount) ? amount : Number(amount || 0);
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
  } catch {
    return `₹${Math.round(value).toLocaleString('en-IN')}`;
  }
}

function amountToWordsINR(amount) {
  const num = Math.floor(Math.max(0, Number(amount || 0)));
  if (!Number.isFinite(num)) return '';
  if (num === 0) return 'Zero rupees';

  const a = [
    '',
    'One',
    'Two',
    'Three',
    'Four',
    'Five',
    'Six',
    'Seven',
    'Eight',
    'Nine',
    'Ten',
    'Eleven',
    'Twelve',
    'Thirteen',
    'Fourteen',
    'Fifteen',
    'Sixteen',
    'Seventeen',
    'Eighteen',
    'Nineteen',
  ];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const inWordsBelowThousand = (n) => {
    let out = '';
    const hundred = Math.floor(n / 100);
    const rest = n % 100;
    if (hundred) out += `${a[hundred]} Hundred${rest ? ' ' : ''}`;
    if (rest) {
      if (rest < 20) out += a[rest];
      else out += `${b[Math.floor(rest / 10)]}${rest % 10 ? ' ' + a[rest % 10] : ''}`;
    }
    return out.trim();
  };

  const crore = Math.floor(num / 10000000);
  const lakh = Math.floor((num / 100000) % 100);
  const thousand = Math.floor((num / 1000) % 100);
  const rest = num % 1000;

  const parts = [];
  if (crore) parts.push(`${inWordsBelowThousand(crore)} Crore`);
  if (lakh) parts.push(`${inWordsBelowThousand(lakh)} Lakh`);
  if (thousand) parts.push(`${inWordsBelowThousand(thousand)} Thousand`);
  if (rest) parts.push(inWordsBelowThousand(rest));

  return `${parts.join(' ').trim()} rupees`;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setAuthReady(false);
      setAuthError('');
      setUser(u);

      if (!u) {
        setIsAdmin(false);
        setAuthReady(true);
        return;
      }

      try {
        const token = await getIdTokenResult(u, true);
        const role = token?.claims?.role;
        if (role !== 'admin') {
          setIsAdmin(false);
          setAuthError('Admin role required.');
          await signOut(auth);
          return;
        }
        setIsAdmin(true);
      } catch {
        setIsAdmin(false);
        setAuthError('Failed to verify admin access.');
        try {
          await signOut(auth);
        } catch {
          // ignore
        }
      } finally {
        setAuthReady(true);
      }
    });

    return () => unsub();
  }, []);

  const handleLogout = useCallback(async () => {
    await signOut(auth);
  }, []);

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="text-sm text-gray-700">Loading…</div>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return <AdminLogin error={authError} />;
  }

  return <AdminShell user={user} onLogout={handleLogout} />;
}

function AdminShell({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const navItems = useMemo(
    () => [
      { id: 'dashboard', icon: Home, label: 'Dashboard' },
      { id: 'students', icon: Users, label: 'Students' },
      { id: 'results', icon: BookOpen, label: 'Results' },
      { id: 'remarks', icon: MessageSquare, label: 'Remarks' },
      { id: 'fees', icon: DollarSign, label: 'Fees' },
      { id: 'accounts', icon: DollarSign, label: 'Accounts' },
      { id: 'statistics', icon: TrendingUp, label: 'Daily Tracking' },
    ],
    []
  );

  const adminInitials = useMemo(() => {
    const email = String(user?.email || 'Admin');
    const base = email.split('@')[0] || 'Admin';
    const parts = base.split(/[._\-\s]+/).filter(Boolean);
    const letters = (parts.length ? parts : [base]).slice(0, 2).map((p) => p[0]?.toUpperCase() || 'A');
    return letters.join('').slice(0, 2) || 'AD';
  }, [user?.email]);

  const handleLogout = useCallback(() => {
    onLogout?.();
  }, [onLogout]);

  return (
    <div className="flex h-screen bg-gray-50">
      {mobileSidebarOpen ? (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setMobileSidebarOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
        </div>
      ) : null}

      <aside
        className={
          `fixed md:static z-50 top-0 left-0 h-full bg-sidebar text-white flex flex-col flex-shrink-0 transition-all ` +
          (sidebarExpanded ? 'w-64' : 'w-20') +
          ` ` +
          (mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0')
        }
      >
        <div className="p-6 border-b border-white/10 flex items-center justify-between">
          {sidebarExpanded ? (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-gradient-to-br from-accent-500 to-accent-600 flex items-center justify-center text-white font-bold text-sm shadow-glow">H</div>
              <div className="text-xl font-bold tracking-wider text-white">HDA</div>
            </div>
          ) : (
            <div className="w-8 h-8 rounded bg-gradient-to-br from-accent-500 to-accent-600 flex items-center justify-center text-white font-bold text-sm shadow-glow mx-auto">H</div>
          )}
          <button
            onClick={() => setSidebarExpanded((v) => !v)}
            className="p-2 hover:bg-white/10 rounded-lg"
            aria-label="Toggle sidebar"
          >
            <Menu size={20} />
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id);
                setMobileSidebarOpen(false);
              }}
              className={
                `w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ` +
                (activeTab === item.id ? 'bg-white/15 text-white font-medium' : 'text-white/90 hover:bg-white/10')
              }
            >
              <item.icon size={20} />
              {sidebarExpanded && <span>{item.label}</span>}
            </button>
          ))}
        </nav>

        <button
          onClick={handleLogout}
          className="m-4 flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-lg w-auto"
        >
          <LogOut size={20} />
          {sidebarExpanded && <span>Logout</span>}
        </button>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-gray-200 px-4 md:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <button
              className="md:hidden p-2 rounded-lg hover:bg-gray-100"
              onClick={() => setMobileSidebarOpen(true)}
              aria-label="Open sidebar"
            >
              <Menu size={20} />
            </button>
            <h2 className="text-xl md:text-2xl font-bold text-gray-900">{navItems.find((i) => i.id === activeTab)?.label}</h2>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-primary-100 border border-primary-200 rounded-full flex items-center justify-center text-primary-700 font-bold">{adminInitials}</div>
            <span className="text-gray-700 font-medium hidden sm:block">{user?.email || 'Admin'}</span>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-4 md:p-8">
          {activeTab === 'dashboard' && <DashboardPage />}
          {activeTab === 'students' && <StudentsPage />}
          {activeTab === 'results' && <ResultsPage />}
          {activeTab === 'remarks' && <RemarksPage />}
          {activeTab === 'fees' && <FeesPage />}
          {activeTab === 'accounts' && <AccountsPage />}
          {activeTab === 'statistics' && <StatisticsPage />}
        </div>
      </main>
    </div>
  );
}

function AdminLogin({ error }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState('');

  const displayError = useMemo(() => localError || error || '', [localError, error]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setLocalError('');
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      const code = typeof err?.code === 'string' ? err.code : '';
      const message = typeof err?.message === 'string' ? err.message : '';
      if (code) {
        setLocalError(`${code}${message ? `: ${message}` : ''}`);
      } else {
        setLocalError('Login failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg p-6 relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
        <div className="absolute -top-[10%] -right-[10%] w-[40%] h-[40%] rounded-full bg-primary-500/10 blur-[100px]"></div>
        <div className="absolute -bottom-[10%] -left-[10%] w-[40%] h-[40%] rounded-full bg-accent-500/10 blur-[100px]"></div>
      </div>

      <div className="w-full max-w-md bg-white/80 backdrop-blur-xl border border-white/40 rounded-[24px] shadow-[0_8px_32px_rgba(0,0,0,0.08)] p-8 space-y-8 z-10">
        <div className="text-center space-y-3">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-accent-500 to-accent-600 flex items-center justify-center text-white font-bold text-2xl shadow-glow mb-6">H</div>
          <div className="text-2xl font-bold text-gray-900 tracking-wider">HDA PORTAL</div>
          <div className="text-sm text-gray-500 font-medium">Secure admin access</div>
        </div>

        {displayError ? (
          <div className="bg-red-50/80 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
            {displayError}
          </div>
        ) : null}

        <form className="space-y-5" onSubmit={onSubmit}>
          <div className="space-y-4">
            <Input
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-white/50"
            />
            <Input
              placeholder="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-white/50"
            />
          </div>
          <Button type="submit" disabled={loading} className="w-full shadow-lg shadow-primary-500/25 mt-2">
            {loading ? 'Authenticating…' : 'Sign In to HDA'}
          </Button>
        </form>
      </div>
    </div>
  );
}

// ============================================================================
// PAGE: DASHBOARD
// ============================================================================

function DashboardPage() {
  const [studentCount, setStudentCount] = useState(null);
  const [accounts, setAccounts] = useState(null);
  const [recentLogs, setRecentLogs] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const countSnap = await getCountFromServer(collection(db, 'students'));
        if (!cancelled) setStudentCount(countSnap.data().count);
      } catch {
        if (!cancelled) setStudentCount(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'accounts', 'summary'),
      (snap) => setAccounts(snap.exists() ? snap.data() : null),
      () => setAccounts(null)
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const q = query(collection(db, 'logs'), orderBy('createdAt', 'desc'), limit(5));
        const snap = await getDocs(q);
        if (cancelled) return;
        setRecentLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch {
        if (!cancelled) setRecentLogs([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const totalBudget = typeof accounts?.totalBudget === 'number' ? accounts.totalBudget : 0;
  const totalCollected = typeof accounts?.totalCollected === 'number' ? accounts.totalCollected : 0;
  const totalPending = typeof accounts?.totalPending === 'number' ? accounts.totalPending : Math.max(0, totalBudget - totalCollected);
  const progress = totalBudget > 0 ? Math.round((totalCollected / totalBudget) * 100) : 0;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <SummaryCard
          title="Total Students"
          value={typeof studentCount === 'number' ? studentCount.toLocaleString('en-IN') : '—'}
          color="primary"
          icon="👥"
        />
        <SummaryCard
          title="Total Collected"
          value={formatCurrency(totalCollected)}
          color="success"
          icon="💳"
        />
        <SummaryCard
          title="Total Pending"
          value={formatCurrency(totalPending)}
          color="alert"
          icon="⚠️"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Recent Activity" subtitle="Latest admin actions">
          <div className="space-y-3">
            {recentLogs.length === 0 ? (
              <div className="text-sm text-gray-600">No recent activity yet.</div>
            ) : (
              recentLogs.map((l) => (
                <div key={l.id} className="flex justify-between items-center py-3 border-b border-gray-100 last:border-0">
                  <span className="text-gray-700">{String(l.action || 'action')}</span>
                  <span className="text-xs text-gray-500">{l.createdAt?.toDate ? format(l.createdAt.toDate(), 'dd MMM, HH:mm') : '—'}</span>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card title="Fee Collection Status">
          <div className="space-y-6">
            <ProgressBar value={progress} label="Overall Collection" color="success" />
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100">
              <div>
                <p className="text-sm text-gray-600">Collected</p>
                <p className="text-xl font-bold text-green-600">{formatCurrency(totalCollected)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Pending</p>
                <p className="text-xl font-bold text-red-600">{formatCurrency(totalPending)}</p>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ============================================================================
// PAGE: STUDENTS MANAGEMENT
// ============================================================================

function cacheBustUrl(url, version) {
  const u = String(url || '').trim();
  if (!u) return '';
  if (version == null) return u;
  const v = encodeURIComponent(String(version));
  return u.includes('?') ? `${u}&v=${v}` : `${u}?v=${v}`;
}

async function compressImageToBase64(file, maxKB = 20) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        const MAX_DIM = 200;
        if (width > height && width > MAX_DIM) {
          height = Math.round((height * MAX_DIM) / width);
          width = MAX_DIM;
        } else if (height > MAX_DIM) {
          width = Math.round((width * MAX_DIM) / height);
          height = MAX_DIM;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        let quality = 0.85;
        const attempt = () => {
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          const sizeKB = (dataUrl.length * (3 / 4)) / 1024; // Rough Base64 size estimation
          if (sizeKB > maxKB && quality > 0.1) {
            quality -= 0.1;
            attempt();
          } else {
            resolve({ base64: dataUrl, sizeKB });
          }
        };
        attempt();
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const adminUploadProfilePhoto = httpsCallable(functions, 'adminUploadProfilePhoto');

async function uploadStudentPhotoToStorage(studentId, base64) {
  if (!studentId) throw new Error('Missing studentId');
  if (!base64) throw new Error('Missing base64');

  const res = await adminUploadProfilePhoto({ studentId, base64 });
  return res.data.url;
}

function StudentsPage() {
  const [admissionFormOpen, setAdmissionFormOpen] = useState(false);

  const [fullName, setFullName] = useState('');
  const [fatherName, setFatherName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [courseOfStudy, setCourseOfStudy] = useState(STREAM_OPTIONS[0]);
  const [admissionYear, setAdmissionYear] = useState('1');
  const [admissionBatch, setAdmissionBatch] = useState(DEFAULT_BATCH);
  const [gender, setGender] = useState('male');
  const [studentPhotoFile, setStudentPhotoFile] = useState(null);
  const [studentPhotoPreviewUrl, setStudentPhotoPreviewUrl] = useState('');
  const [photoSizeKB, setPhotoSizeKB] = useState(null);
  const [creatingAdmission, setCreatingAdmission] = useState(false);
  const [createAdmissionError, setCreateAdmissionError] = useState('');
  const [generatedAdmission, setGeneratedAdmission] = useState(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [batchFilter, setBatchFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');
  const [streamFilter, setStreamFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);

  const [allStudentsLoading, setAllStudentsLoading] = useState(false);
  const [studentsError, setStudentsError] = useState('');
  const [allStudents, setAllStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const [migrationAction, setMigrationAction] = useState(null);
  const [migrationConfirmOpen, setMigrationConfirmOpen] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [migrationError, setMigrationError] = useState('');
  const [migrationOk, setMigrationOk] = useState('');

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, batchFilter, yearFilter, streamFilter]);

  useEffect(() => {
    if (!studentPhotoFile) {
      setStudentPhotoPreviewUrl('');
      return;
    }
    let url = '';
    try {
      url = URL.createObjectURL(studentPhotoFile);
      setStudentPhotoPreviewUrl(url);
    } catch {
      setStudentPhotoPreviewUrl('');
    }
    return () => {
      if (!url) return;
      try {
        URL.revokeObjectURL(url);
      } catch {}
    };
  }, [studentPhotoFile]);

  useEffect(() => {
    const term = normalizeTerm(searchTerm);
    if (!term) return;
    if (isProbablyAdmissionNumber(term) || isProbablyUid(term)) return;

    const baseMatches = allStudents.filter((s) => studentMatchesSearch(s, term));
    if (baseMatches.length === 0) return;

    const visibleMatches = baseMatches.filter((s) => {
      if (batchFilter !== 'all' && String(s.batch || '') !== String(batchFilter)) return false;
      if (yearFilter !== 'all' && String(s.year || '') !== String(yearFilter)) return false;
      if (
        streamFilter !== 'all' &&
        getStudentStreamValue(s).toUpperCase() !== String(streamFilter).toUpperCase()
      ) {
        return false;
      }
      return true;
    });

    if (visibleMatches.length > 0) return;

    if (baseMatches.length === 1) {
      const only = baseMatches[0];
      const matchBatch = String(only?.batch || 'all');
      const matchYear = String(only?.year || 'all');
      const matchStream = getStudentStreamValue(only);
      if (batchFilter !== matchBatch) setBatchFilter(matchBatch);
      if (yearFilter !== matchYear) setYearFilter(matchYear);
      if (streamFilter !== (matchStream || 'all')) setStreamFilter(matchStream || 'all');
    } else {
      if (batchFilter !== 'all') setBatchFilter('all');
      if (yearFilter !== 'all') setYearFilter('all');
      if (streamFilter !== 'all') setStreamFilter('all');
    }
  }, [searchTerm, allStudents, batchFilter, yearFilter, streamFilter]);

  useEffect(() => {
    setAllStudentsLoading(true);
    setStudentsError('');

    const baseQuery = query(collection(db, 'students'), orderBy('admissionSequence', 'asc'));
    const unsub = onSnapshot(
      baseQuery,
      (snap) => {
        setAllStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setAllStudentsLoading(false);
      },
      () => {
        setStudentsError('Failed to load students.');
        setAllStudents([]);
        setAllStudentsLoading(false);
      }
    );

    return () => unsub();
  }, []);

  const filteredStudents = useMemo(() => {
    const term = normalizeTerm(searchTerm);
    const termLower = term.toLowerCase();

    return allStudents.filter((s) => {
      if (batchFilter !== 'all' && String(s.batch || '') !== String(batchFilter)) return false;
      if (yearFilter !== 'all' && String(s.year || '') !== String(yearFilter)) return false;
      if (
        streamFilter !== 'all' &&
        getStudentStreamValue(s).toUpperCase() !== String(streamFilter).toUpperCase()
      ) {
        return false;
      }

      if (!term) return true;

      if (isProbablyAdmissionNumber(term)) {
        return admissionMatchesTerm(s.admissionNumber, term);
      }
      if (isProbablyUid(term)) {
        return String(s.id || '').includes(term);
      }

      const name = String(s.nameLower || s.name || '').toLowerCase();
      const admission = String(s.admissionNumber || '').toUpperCase();
      return name.includes(termLower) || admissionMatchesTerm(admission, term);
    });
  }, [allStudents, searchTerm, batchFilter, yearFilter, streamFilter]);

  const totalCount = filteredStudents.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPageSafe = Math.min(Math.max(1, currentPage), totalPages);

  const students = useMemo(() => {
    const start = (currentPageSafe - 1) * PAGE_SIZE;
    return filteredStudents.slice(start, start + PAGE_SIZE);
  }, [filteredStudents, currentPageSafe]);

  const handlePhotoSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setStudentPhotoFile(file);
      setPhotoSizeKB(Math.round(((file.size || 0) / 1024) * 10) / 10);
    } catch {
      setCreateAdmissionError('Failed to process image. Please try another file.');
    }
  };

  const onGenerateAdmission = async () => {
    setCreateAdmissionError('');
    setGeneratedAdmission(null);

    const trimmedName = fullName.trim();
    const trimmedFather = fatherName.trim();
    const trimmedPhone = phoneNumber.trim();

    if (!trimmedName || !trimmedFather) {
      setCreateAdmissionError('Please fill name and father name.');
      return;
    }

    const yr = String(admissionYear);
    const strm = String(courseOfStudy);

    setCreatingAdmission(true);
    try {
      const res = await adminCreateAdmission({
        fullName: trimmedName,
        fatherName: trimmedFather,
        phoneNumber: trimmedPhone || null,
        courseOfStudy,
        year: String(admissionYear),
        batch: String(admissionBatch),
        gender: String(gender),
      });

      const admissionNumber = res?.data?.admissionNumber;
      const studentUid = res?.data?.uid;
      if (!admissionNumber) throw new Error('Missing admissionNumber');

      // Upload photo to Storage + persist URL if provided
      if (studentPhotoFile && studentUid) {
        try {
          const updatedAt = Date.now();
          const { base64 } = await compressImageToBase64(studentPhotoFile, 80);
          const url = await uploadStudentPhotoToStorage(studentUid, base64);
          await setDoc(
            doc(db, 'students', studentUid),
            { photoUrl: url, photoUpdatedAt: updatedAt, photoBase64: deleteField() },
            { merge: true }
          );
        } catch {
          // Non-fatal: admission created, photo upload/save failed
          console.warn('Photo upload failed');
        }
      }

      setGeneratedAdmission({ admissionNumber });
      setAdmissionFormOpen(false);

      setFullName('');
      setFatherName('');
      setPhoneNumber('');
      setCourseOfStudy(STREAM_OPTIONS[0]);
      setAdmissionYear('1');
      setAdmissionBatch(DEFAULT_BATCH);
      setGender('male');
      setStudentPhotoFile(null);
      setStudentPhotoPreviewUrl('');
      setPhotoSizeKB(null);

      setYearFilter(yr);
      setStreamFilter(strm);
      setSearchTerm('');
      setCurrentPage(1);
    } catch {
      setCreateAdmissionError('Failed to generate admission number. Please try again.');
    } finally {
      setCreatingAdmission(false);
    }
  };

  const canRunMigration = batchFilter !== 'all';
  const openMigrationConfirm = (action) => {
    setMigrationOk('');
    setMigrationError('');

    if (!canRunMigration) {
      setMigrationError('Select a specific Batch first (not "All").');
      return;
    }

    setMigrationAction(action);
    setMigrationConfirmOpen(true);
  };



  return (
    <div className="space-y-6">
      {selectedStudent && !showDeleteConfirm ? (
        <StudentDetailsView student={selectedStudent} onBack={() => setSelectedStudent(null)} onDelete={() => setShowDeleteConfirm(true)} />
      ) : (
        <>
          <div className="flex justify-between items-center">
            <div></div>
            <div>
              <Button
                onClick={() => {
                  setAdmissionFormOpen((v) => !v);
                  setCreateAdmissionError('');
                  setGeneratedAdmission(null);
                }}
              >
                {admissionFormOpen ? 'Close Admission Form' : 'New Admission'}
              </Button>
            </div>
          </div>

          <Card title="Students" subtitle="Search by student name / ID / admission number">
        {admissionFormOpen ? (
          <div className="mb-6">
            <div className="space-y-4">
              {createAdmissionError ? <Alert type="error" title="Error" message={createAdmissionError} /> : null}

              {generatedAdmission ? (
                <div className="bg-green-50 border border-green-200 text-green-800 rounded-lg px-4 py-3 text-sm">
                  <div className="font-semibold">Admission created</div>
                  <div>
                    Admission Number: <span className="font-mono">{generatedAdmission.admissionNumber}</span>
                  </div>
                  <div>
                    Default Password: <span className="font-mono">HDA@2026</span>
                  </div>
                  <div className="text-xs text-green-700 mt-1">Student must change password after first login.</div>
                </div>
              ) : null}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input className="py-2 text-sm" placeholder="Student name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
                <Input className="py-2 text-sm" placeholder="Father name" value={fatherName} onChange={(e) => setFatherName(e.target.value)} />
                <Input className="py-2 text-sm" placeholder="Phone number" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} />

                <Select
                  className="py-2 text-sm"
                  label="Course"
                  value={courseOfStudy}
                  onChange={(e) => setCourseOfStudy(e.target.value)}
                  options={STREAM_OPTIONS.map((s) => ({ value: s, label: s }))}
                />
                <Select
                  className="py-2 text-sm"
                  label="Year"
                  value={admissionYear}
                  onChange={(e) => setAdmissionYear(e.target.value)}
                  options={[
                    { value: '1', label: '1st Year' },
                    { value: '2', label: '2nd Year' },
                  ]}
                />
                <Select
                  className="py-2 text-sm"
                  label="Batch"
                  value={admissionBatch}
                  onChange={(e) => setAdmissionBatch(e.target.value)}
                  options={BATCH_OPTIONS.map((b) => ({ value: b, label: b }))}
                />
                <Select
                  className="py-2 text-sm"
                  label="Gender"
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  options={[
                    { value: 'male', label: 'Male' },
                    { value: 'female', label: 'Female' },
                  ]}
                />
              </div>

              {/* ── Student Photo Upload ── */}
              <div className="mt-2">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Student Photo <span className="font-normal text-gray-400">(optional, stored as URL)</span></label>
                <div className="flex items-center gap-4">
                  <label
                    htmlFor="student-photo-input"
                    className="flex flex-col items-center justify-center w-24 h-24 rounded-xl border-2 border-dashed border-primary-300 bg-primary-50 cursor-pointer hover:bg-primary-100 transition-colors overflow-hidden relative"
                  >
                    {studentPhotoPreviewUrl ? (
                      <img src={studentPhotoPreviewUrl} alt="Preview" className="w-full h-full object-contain object-center" />
                    ) : (
                      <>
                        <svg className="w-7 h-7 text-primary-400 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 4v16m8-8H4" />
                        </svg>
                        <span className="text-xs text-primary-500 font-semibold">Add Photo</span>
                      </>
                    )}
                    <input
                      id="student-photo-input"
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={handlePhotoSelect}
                    />
                  </label>
                  <div className="flex flex-col gap-1 text-sm">
                    {studentPhotoFile && (
                      <>
                        <span className="text-green-700 font-semibold">✓ Photo ready</span>
                        <span className="text-gray-500">Size: ~{photoSizeKB} KB</span>
                        <button
                          type="button"
                          className="text-xs text-red-500 hover:underline text-left"
                          onClick={() => { setStudentPhotoFile(null); setStudentPhotoPreviewUrl(''); setPhotoSizeKB(null); }}
                        >
                          Remove
                        </button>
                      </>
                    )}
                    {!studentPhotoFile && (
                      <span className="text-gray-400 text-xs">JPG, PNG, WEBP accepted.</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={onGenerateAdmission} disabled={creatingAdmission}>
                  {creatingAdmission ? 'Generating…' : 'Generate Admission Number'}
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <Input
            label="Search"
            className="py-2 text-sm border-2 border-primary-200 focus:ring-primary-500 focus:border-primary-500"
            placeholder="Name / UID / admission (HDA...)"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <Select
            className="py-2 text-sm border-2 border-primary-200 focus:ring-primary-500 focus:border-primary-500"
            label="Batch"
            value={batchFilter}
            onChange={(e) => setBatchFilter(e.target.value)}
            options={[{ value: 'all', label: 'All Batches' }, ...BATCH_OPTIONS.map((b) => ({ value: b, label: b }))]}
          />
          <Select
            className="py-2 text-sm border-2 border-primary-200 focus:ring-primary-500 focus:border-primary-500"
            label="Year"
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            options={[
              { value: '1', label: '1st Year' },
              { value: '2', label: '2nd Year' },
              { value: 'all', label: 'All Years' },
            ]}
          />
          <Select
            className="py-2 text-sm border-2 border-primary-200 focus:ring-primary-500 focus:border-primary-500"
            label="Stream"
            value={streamFilter}
            onChange={(e) => setStreamFilter(e.target.value)}
            options={[{ value: 'all', label: 'All Streams' }, ...STREAM_OPTIONS.map((s) => ({ value: s, label: s }))]}
          />
        </div>

        {migrationOk ? (
          <div className="mt-4">
            <Alert type="success" title="Migration complete" message={migrationOk} onClose={() => setMigrationOk('')} />
          </div>
        ) : null}

        {migrationError ? (
          <div className="mt-4">
            <Alert type="warning" title="Migration" message={migrationError} onClose={() => setMigrationError('')} />
          </div>
        ) : null}

        <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-2xl flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-gray-900">Academic Migration</div>
            <div className="text-xs text-gray-600">Run migration for the selected Batch + Stream.</div>
            <div className="text-xs text-gray-600 mt-1">
              Selected: <span className="font-medium">{batchFilter}</span> / <span className="font-medium">{streamFilter}</span>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={!canRunMigration || migrating}
              onClick={() => openMigrationConfirm('PROMOTE')}
            >
              Promote Year 1 → Year 2
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={!canRunMigration || migrating}
              onClick={() => openMigrationConfirm('COMPLETE')}
            >
              Mark Year 2 Completed
            </Button>
          </div>
        </div>

        {studentsError ? <div className="mt-4"><Alert type="error" title="Error" message={studentsError} /></div> : null}
        {allStudentsLoading ? <div className="mt-3 text-sm text-gray-600">Loading students…</div> : null}

        <div className="mt-5">
          <Table
            columns={[
              { key: 'admissionNumber', label: 'Admission No' },
              { key: 'name', label: 'Student Name' },
              { key: 'fatherName', label: 'Father Name' },
              { key: 'stream', label: 'Stream', render: (v, row) => getStudentStreamValue(row) || '—' },
              { key: 'year', label: 'Year' },
              {
                key: 'status',
                label: 'Status',
                render: (v, row) =>
                  String(row?.status || '').toLowerCase() === 'completed' ? (
                    <Badge variant="success" label="Completed" />
                  ) : (
                    <Badge variant="gray" label="Active" />
                  ),
              },
            ]}
            data={students}
            onRowClick={(row) => setSelectedStudent((prev) => (prev?.id === row.id ? null : row))}
          />

          <Pagination
            currentPage={currentPageSafe}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        </div>
        <Modal
          isOpen={showDeleteConfirm}
          onClose={() => setShowDeleteConfirm(false)}
          title="Confirm Delete"
          actions={[
            <Button key="cancel" variant="secondary" onClick={() => setShowDeleteConfirm(false)}>
              Cancel
            </Button>,
            <Button
              key="delete"
              variant="danger"
              onClick={async () => {
                setDeleting(true);
                setDeleteError('');
                try {
                  if (!selectedStudent?.id) throw new Error('No student selected');
                  if (auth.currentUser?.getIdToken) {
                    await auth.currentUser.getIdToken(true);
                  }
                  await adminDeleteStudent({ studentId: selectedStudent.id });
                  setShowDeleteConfirm(false);
                  setSelectedStudent(null);
                } catch (err) {
                  const code = typeof err?.code === 'string' ? err.code : '';
                  const msgRaw = typeof err?.message === 'string' ? err.message : '';
                  const msg = msgRaw.replace(/^FirebaseError:\s*/i, '').trim();
                  const detailsRaw = err?.details;
                  const details = detailsRaw ? String(typeof detailsRaw === 'string' ? detailsRaw : JSON.stringify(detailsRaw)) : '';
                  const composed = [code && `(${code})`, msg, details && `Details: ${details}`].filter(Boolean).join(' ');
                  setDeleteError(composed || 'Failed to delete student.');
                } finally {
                  setDeleting(false);
                }
              }}
              disabled={deleting}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>,
          ]}
        >
          {deleteError ? <Alert type="error" title="Error" message={deleteError} /> : null}
          <p>Are you sure you want to delete this student record? This action cannot be undone.</p>
        </Modal>

        <Modal
          isOpen={migrationConfirmOpen}
          onClose={() => {
            if (migrating) return;
            setMigrationConfirmOpen(false);
          }}
          title={migrationAction === 'COMPLETE' ? 'Confirm Completion' : 'Confirm Promotion'}
          actions={[
            <Button
              key="cancel"
              variant="secondary"
              onClick={() => setMigrationConfirmOpen(false)}
              disabled={migrating}
            >
              Cancel
            </Button>,
            <Button
              key="confirm"
              variant={migrationAction === 'COMPLETE' ? 'danger' : 'primary'}
              disabled={migrating}
              onClick={async () => {
                setMigrating(true);
                setMigrationError('');
                setMigrationOk('');
                try {
                  if (!migrationAction) throw new Error('Missing action');
                  if (!canRunMigration) throw new Error('Select batch and stream');
                  const res = await adminMigrateStudents({
                    batch: String(batchFilter),
                    stream: streamFilter === 'all' ? 'ALL' : String(streamFilter),
                    action: String(migrationAction),
                  });

                  const updated = Number(res?.data?.updated ?? 0);
                  const label = migrationAction === 'COMPLETE' ? 'completed' : 'promoted';
                  const toBatch = typeof res?.data?.toBatch === 'string' ? res.data.toBatch : '';
                  const streamLabel = streamFilter === 'all' ? 'ALL' : streamFilter;
                  if (migrationAction === 'PROMOTE' && toBatch) {
                    setMigrationOk(`${updated} student(s) ${label}: ${batchFilter} → ${toBatch} (Stream: ${streamLabel}).`);
                  } else {
                    setMigrationOk(`${updated} student(s) ${label} for ${batchFilter} (Stream: ${streamLabel}).`);
                  }
                  setMigrationConfirmOpen(false);
                } catch {
                  setMigrationError('Migration failed. Please try again.');
                } finally {
                  setMigrating(false);
                }
              }}
            >
              {migrating ? 'Processing…' : 'Confirm'}
            </Button>,
          ]}
        >
          <div className="space-y-3">
            <div className="text-sm text-gray-700">
              Batch: <span className="font-medium">{batchFilter}</span>
              <br />
              Stream: <span className="font-medium">{streamFilter}</span>
            </div>

            {migrationAction === 'COMPLETE' ? (
              <p>All 2nd year students in this Batch + Stream will be marked as Completed.</p>
            ) : (
              <p>All 1st year students in this Batch + Stream will be promoted to 2nd year.</p>
            )}

            <p className="text-sm text-gray-600">This updates both student profile and fees records.</p>
          </div>
        </Modal>
      </Card>
      </>
      )}
    </div>
  );
}

// ============================================================================
// STUDENT DETAILS VIEW
// ============================================================================

function StudentDetailsView({ student, onBack, onDelete }) {
  const [dpUrl, setDpUrl] = useState(
    student.photoUrl
      ? cacheBustUrl(student.photoUrl, student.photoUpdatedAt)
      : 'https://ui-avatars.com/api/?name=' + encodeURIComponent(student.name || 'Student')
  );
  const [isUploading, setIsUploading] = useState(false);
  const [feeData, setFeeData] = useState(null);
  const [previewImg, setPreviewImg] = useState(null);

  useEffect(() => {
    setDpUrl(
      student?.photoUrl
        ? cacheBustUrl(student.photoUrl, student.photoUpdatedAt)
        : 'https://ui-avatars.com/api/?name=' + encodeURIComponent(student?.name || 'Student')
    );
  }, [student?.photoUrl, student?.photoUpdatedAt, student?.name]);

  useEffect(() => {
    if (!student?.id) return;
    const unsub = onSnapshot(doc(db, 'fees', student.id), (snap) => {
      setFeeData(snap.exists() ? snap.data() : null);
    });
    return () => unsub();
  }, [student?.id]);

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!student?.id) {
      alert('Missing student id. Please re-open the student and try again.');
      return;
    }

    // Allow selecting the same file again.
    try { e.target.value = ''; } catch {}

    setIsUploading(true);
    try {
      const { base64 } = await compressImageToBase64(file, 20);
      const updatedAt = Date.now();
      const url = await uploadStudentPhotoToStorage(student.id, base64);

      // Update local preview immediately (avoid stale cached image).
      setDpUrl(cacheBustUrl(url, updatedAt));

      // Persist so it reflects immediately in the mobile app.
      await setDoc(
        doc(db, 'students', student.id),
        { photoUrl: url, photoUpdatedAt: updatedAt, photoBase64: deleteField() },
        { merge: true }
      );

      alert('Photo updated successfully.');
    } catch (err) {
      console.error(err);
      const message =
        typeof err?.message === 'string' && err.message.trim()
          ? err.message.trim()
          : 'Failed to update photo. Please try another image.';
      alert(message);
    } finally {
      setIsUploading(false);
    }
  };

  const totalFees = feeData?.totalFees || 0;
  const paidAmount = feeData?.paidAmount || 0;
  const depositAmount = typeof feeData?.cautionDeposit === 'number' ? feeData.cautionDeposit : 0;
  const pendingAmount = Math.max(0, totalFees - paidAmount);
  const studentPaymentHistory = Array.isArray(feeData?.paymentHistory) ? feeData.paymentHistory : [];
  // Deposit history: entries where cautionDeposit > 0
  const depositHistory = studentPaymentHistory.filter((p) => Number(p?.cautionDeposit || 0) > 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex justify-between items-center">
        <button onClick={onBack} className="flex items-center text-primary-600 hover:text-primary-700 font-medium transition-colors">
          <ArrowLeft size={20} className="mr-2" /> Back to Students
        </button>
        <Button variant="danger" size="sm" onClick={onDelete}>Delete Student</Button>
      </div>

      {/* Profile Header */}
      <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200 flex flex-col md:flex-row items-center md:items-start gap-8">
        {/* DP Upload Section */}
        <div className="relative group flex-shrink-0">
          <div className="w-32 h-32 rounded-2xl overflow-hidden bg-gray-100 border-4 border-white shadow-lg">
            <img src={dpUrl} alt={student.name} className="w-full h-full object-contain object-center" />
          </div>
          <label className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer rounded-2xl">
            <Camera size={24} className="mb-1" />
            <span className="text-xs font-medium">Upload DP</span>
            <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} disabled={isUploading} />
          </label>
          {isUploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-2xl">
              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 text-center md:text-left mt-2">
          <h2 className="text-3xl font-bold text-gray-900">{student.name}</h2>
          <p className="text-lg text-gray-500 mt-1">Admission Number: {student.admissionNumber || '—'}</p>
          
          <div className="flex flex-wrap gap-4 mt-6 justify-center md:justify-start">
            <span className="px-4 py-2 bg-primary-50 text-primary-700 rounded-lg font-medium">{getStudentStreamValue(student) || '—'}</span>
            <span className="px-4 py-2 bg-accent-50 text-accent-700 rounded-lg font-medium">{student.year || '1st'} Year</span>
            <span className="px-4 py-2 bg-gray-50 text-gray-700 rounded-lg font-medium">Batch: {student.batch || '—'}</span>
          </div>
        </div>
      </div>

      {/* Detailed Sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Contact & Personal Details */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Personal Details</h3>
          <div className="space-y-4">
            <div className="flex justify-between border-b border-gray-100 pb-2">
              <span className="text-gray-500">Father's Name</span>
              <span className="font-medium text-gray-900">{student.fatherName || '—'}</span>
            </div>
            <div className="flex justify-between border-b border-gray-100 pb-2">
              <span className="text-gray-500">Phone</span>
              <span className="font-medium text-gray-900">{student.phoneNumber || '—'}</span>
            </div>
            <div className="flex justify-between border-b border-gray-100 pb-2">
              <span className="text-gray-500">Gender</span>
              <span className="font-medium text-gray-900 capitalize">{student.gender || '—'}</span>
            </div>
          </div>
        </div>

        {/* Fees Overview */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Fee Overview</h3>
          <div className="space-y-4">
            <div className="flex justify-between border-b border-gray-100 pb-2">
              <span className="text-gray-500">Total Fees</span>
              <span className="font-bold text-gray-900">{formatCurrency(totalFees)}</span>
            </div>
            <div className="flex justify-between border-b border-gray-100 pb-2">
              <span className="text-gray-500">Caution Deposit</span>
              <span className="font-bold text-blue-600">{formatCurrency(depositAmount)}</span>
            </div>
            <div className="flex justify-between border-b border-gray-100 pb-2">
              <span className="text-gray-500">Paid Amount</span>
              <span className="font-bold text-green-600">{formatCurrency(paidAmount + depositAmount)}</span>
            </div>
            <div className="flex justify-between border-b border-gray-100 pb-2">
              <span className="text-gray-500">Pending Amount</span>
              <span className="font-bold text-red-600">{formatCurrency(pendingAmount)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Payment History & Deposit History */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Payment History */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment History</h3>
          {studentPaymentHistory.length === 0 ? (
            <div className="text-sm text-gray-500">No payments recorded yet.</div>
          ) : (
            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {[...studentPaymentHistory].reverse().map((p, idx) => (
                <div key={idx} className="border border-gray-100 rounded-xl p-3 bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-gray-900">
                      {Number(p.amount || 0) > 0 ? `Fees: ${formatCurrency(Number(p.amount))}` : ''}
                      {Number(p.amount || 0) > 0 && Number(p.cautionDeposit || 0) > 0 ? ' + ' : ''}
                      {Number(p.cautionDeposit || 0) > 0 ? `Deposit: ${formatCurrency(Number(p.cautionDeposit))}` : ''}
                      {Number(p.amount || 0) === 0 && Number(p.cautionDeposit || 0) === 0 ? formatCurrency(0) : ''}
                    </div>
                    <div className="text-xs text-gray-400">
                      {p.at?.toDate ? format(p.at.toDate(), 'dd MMM yyyy') : '—'}
                    </div>
                  </div>
                  <div className="mt-1 flex gap-3 text-xs text-gray-500">
                    <span>Method: {String(p.method || 'cash').toUpperCase()}</span>
                    {p.receiptNo ? <span>Receipt: {p.receiptNo}</span> : null}
                    {p.transactionId ? <span>Txn: {p.transactionId}</span> : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Deposit History */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Deposit History</h3>
          {depositHistory.length === 0 ? (
            <div className="text-sm text-gray-500">No deposit payments recorded yet.</div>
          ) : (
            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {[...depositHistory].reverse().map((p, idx) => (
                <div key={idx} className="border border-blue-100 rounded-xl p-3 bg-blue-50">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-blue-800">
                      Deposit: {formatCurrency(Number(p.cautionDeposit || 0))}
                    </div>
                    <div className="text-xs text-blue-400">
                      {p.at?.toDate ? format(p.at.toDate(), 'dd MMM yyyy') : '—'}
                    </div>
                  </div>
                  <div className="mt-1 flex gap-3 text-xs text-blue-600">
                    <span>Method: {String(p.method || 'cash').toUpperCase()}</span>
                    {p.receiptNo ? <span>Receipt: {p.receiptNo}</span> : null}
                    {p.transactionId ? <span>Txn: {p.transactionId}</span> : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Remarks History */}
      <Card title="Remarks History" subtitle="Behavioral and academic feedback log">
        {!student.remarks || student.remarks.length === 0 ? (
          <div className="text-sm text-gray-500">No remarks recorded yet.</div>
        ) : (
          <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
            {[...student.remarks]
              .sort((a, b) => {
                const da = a.date?.toDate ? a.date.toDate().getTime() : 0;
                const db = b.date?.toDate ? b.date.toDate().getTime() : 0;
                return db - da;
              })
              .map((r, idx) => {
                const dateStr = r.date?.toDate ? format(r.date.toDate(), 'dd MMM yyyy hh:mm a') : '—';
                const isAlert = r.type === 'alert' || r.type === 'negative';
                const isPositive = r.type === 'positive';
                const badgeColor = isPositive
                  ? 'bg-green-100 text-green-800 border-green-200'
                  : isAlert
                  ? 'bg-red-100 text-red-800 border-red-200'
                  : 'bg-gray-100 text-gray-800 border-gray-200';
                const typeLabel = isPositive
                  ? 'Positive'
                  : isAlert
                  ? 'Negative (Alert)'
                  : 'Note';

                return (
                  <div key={idx} className="border border-gray-100 rounded-xl p-4 bg-gray-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badgeColor}`}>
                          {typeLabel}
                        </span>
                        <span className="text-xs text-gray-400">{dateStr}</span>
                      </div>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{r.message}</p>
                    </div>
                    {r.imageBase64 && (
                      <div className="flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => setPreviewImg(r.imageBase64)}
                          className="w-16 h-16 rounded-lg border border-gray-200 overflow-hidden hover:border-primary-500 transition-colors shadow-sm"
                          title="Click to view full image"
                        >
                          <img src={r.imageBase64} alt="remark evidence" className="w-full h-full object-cover" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        )}
      </Card>

      {/* Image preview lightbox */}
      {previewImg && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setPreviewImg(null)}
        >
          <div
            className="relative bg-white rounded-2xl shadow-2xl p-3 max-w-sm w-full mx-4 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-gray-800">📷 Evidence Photo</span>
              <button
                onClick={() => setPreviewImg(null)}
                className="text-gray-400 hover:text-gray-700 text-xl leading-none font-bold"
              >
                ×
              </button>
            </div>
            <img
              src={previewImg}
              alt="Evidence"
              className="w-full rounded-xl object-contain max-h-72 border border-gray-100"
            />
            <div className="mt-2 text-xs text-gray-400 text-center">Click outside or × to close</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// PAGE: RESULTS
// ============================================================================

function ResultsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [batchFilter, setBatchFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');
  const [streamFilter, setStreamFilter] = useState('all');

  const [currentPage, setCurrentPage] = useState(1);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentsError, setStudentsError] = useState('');
  const [allStudents, setAllStudents] = useState([]);

  // Batch Entry State
  const [globalTestName, setGlobalTestName] = useState('');
  const [globalTestDate, setGlobalTestDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [globalSubject, setGlobalSubject] = useState(SUBJECT_OPTIONS[0]);
  const [globalMaxScore, setGlobalMaxScore] = useState('100');
  const [globalError, setGlobalError] = useState('');

  // Row Modification State
  const [unsavedScores, setUnsavedScores] = useState({}); // { [studentId]: scoreString }
  const [isSavingAll, setIsSavingAll] = useState(false);

  // Toggle for Tests Cards view
  const [showTestsView, setShowTestsView] = useState(false);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, batchFilter, yearFilter, streamFilter]);

  // Clear unsaved scores if test name or subject changes
  useEffect(() => {
    setUnsavedScores({});
  }, [globalTestName, globalSubject]);

  useEffect(() => {
    const term = normalizeTerm(searchTerm);
    if (!term) return;
    if (isProbablyAdmissionNumber(term) || isProbablyUid(term)) return;

    const baseMatches = allStudents.filter((s) => studentMatchesSearch(s, term));
    if (baseMatches.length === 0) return;

    const visibleMatches = baseMatches.filter((s) => {
      if (batchFilter !== 'all' && String(s.batch || '') !== String(batchFilter)) return false;
      if (yearFilter !== 'all' && String(s.year || '') !== String(yearFilter)) return false;
      if (
        streamFilter !== 'all' &&
        getStudentStreamValue(s).toUpperCase() !== String(streamFilter).toUpperCase()
      ) {
        return false;
      }
      return true;
    });

    if (visibleMatches.length > 0) return;

    if (baseMatches.length === 1) {
      const only = baseMatches[0];
      const matchBatch = String(only?.batch || 'all');
      const matchYear = String(only?.year || 'all');
      const matchStream = getStudentStreamValue(only);
      if (batchFilter !== matchBatch) setBatchFilter(matchBatch);
      if (yearFilter !== matchYear) setYearFilter(matchYear);
      if (streamFilter !== (matchStream || 'all')) setStreamFilter(matchStream || 'all');
    } else {
      if (batchFilter !== 'all') setBatchFilter('all');
      if (yearFilter !== 'all') setYearFilter('all');
      if (streamFilter !== 'all') setStreamFilter('all');
    }
  }, [searchTerm, allStudents, batchFilter, yearFilter, streamFilter]);

  useEffect(() => {
    setStudentsLoading(true);
    setStudentsError('');

    const baseQuery = query(collection(db, 'students'), orderBy('admissionSequence', 'asc'));
    const unsub = onSnapshot(
      baseQuery,
      (snap) => {
        setAllStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setStudentsLoading(false);
      },
      () => {
        setStudentsError('Failed to load students.');
        setAllStudents([]);
        setStudentsLoading(false);
      }
    );

    return () => unsub();
  }, []);

  const filteredStudents = useMemo(() => {
    const term = normalizeTerm(searchTerm);
    const termLower = term.toLowerCase();

    return allStudents.filter((s) => {
      if (batchFilter !== 'all' && String(s.batch || '') !== String(batchFilter)) return false;
      if (yearFilter !== 'all' && String(s.year || '') !== String(yearFilter)) return false;
      if (
        streamFilter !== 'all' &&
        getStudentStreamValue(s).toUpperCase() !== String(streamFilter).toUpperCase()
      ) {
        return false;
      }

      if (!term) return true;

      if (isProbablyAdmissionNumber(term)) {
        return admissionMatchesTerm(s.admissionNumber, term);
      }

      const name = String(s.nameLower || s.name || '').toLowerCase();
      const admission = String(s.admissionNumber || '').toUpperCase();
      return name.includes(termLower) || admissionMatchesTerm(admission, term);
    });
  }, [allStudents, searchTerm, batchFilter, yearFilter, streamFilter]);

  const totalCount = filteredStudents.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPageSafe = Math.min(Math.max(1, currentPage), totalPages);

  const students = useMemo(() => {
    const start = (currentPageSafe - 1) * PAGE_SIZE;
    return filteredStudents.slice(start, start + PAGE_SIZE);
  }, [filteredStudents, currentPageSafe]);

  const getExistingScore = (student) => {
    if (!globalTestName.trim()) return '';
    const existingTest = Array.isArray(student.weeklyTests)
      ? student.weeklyTests.find((t) => t.name.trim().toLowerCase() === globalTestName.trim().toLowerCase())
      : null;
    if (!existingTest) return '';

    const match = Array.isArray(existingTest.subjects)
      ? existingTest.subjects.find((s) => String(s.subject || '').toLowerCase() === globalSubject.toLowerCase())
      : null;
    return match && match.score !== undefined ? String(match.score) : '';
  };

  // Aggregation of unique weekly tests
  const aggregatedTests = useMemo(() => {
    const testMap = {};
    allStudents.forEach((student) => {
      const tests = Array.isArray(student.weeklyTests) ? student.weeklyTests : [];
      tests.forEach((t) => {
        if (!t.name) return;
        const key = t.name.trim();
        const keyLower = key.toLowerCase();
        
        let dateStr = '';
        if (t.date) {
          if (t.date.seconds) { // Firestore Timestamp
            dateStr = format(new Date(t.date.seconds * 1000), 'yyyy-MM-dd');
          } else if (t.date instanceof Date) {
            dateStr = format(t.date, 'yyyy-MM-dd');
          } else if (typeof t.date === 'string') {
            dateStr = t.date.split('T')[0];
          } else if (t.date.toDate && typeof t.date.toDate === 'function') {
            dateStr = format(t.date.toDate(), 'yyyy-MM-dd');
          } else {
            try {
              dateStr = format(new Date(t.date), 'yyyy-MM-dd');
            } catch (e) {
              dateStr = String(t.date);
            }
          }
        }

        if (!testMap[keyLower]) {
          testMap[keyLower] = {
            name: key,
            date: dateStr,
            subjects: new Set(),
            maxScore: 100,
            studentCount: 0
          };
        }
        
        testMap[keyLower].studentCount++;
        if (t.subjects && Array.isArray(t.subjects)) {
          t.subjects.forEach((s) => {
            if (s.subject) {
              testMap[keyLower].subjects.add(s.subject);
            }
            if (s.maxScore !== undefined) {
              const msVal = Number(s.maxScore);
              if (!isNaN(msVal) && msVal > 0) {
                testMap[keyLower].maxScore = msVal;
              }
            }
          });
        }
      });
    });

    return Object.values(testMap).map((t) => ({
      ...t,
      subjects: Array.from(t.subjects)
    }));
  }, [allStudents]);

  const saveScoreForStudent = async (studentId, scoreRaw) => {
    const student = allStudents.find((s) => s.id === studentId);
    if (!student) throw new Error('Student not found');

    const maxScore = Number(globalMaxScore);
    if (isNaN(maxScore) || maxScore <= 0) throw new Error('Invalid Max Score');

    const existingTests = Array.isArray(student.weeklyTests) ? [...student.weeklyTests] : [];
    const testIndex = existingTests.findIndex((t) => t.name.trim().toLowerCase() === globalTestName.trim().toLowerCase());

    let testObj = testIndex >= 0 ? { ...existingTests[testIndex] } : {
      name: globalTestName.trim(),
      date: new Date(globalTestDate + 'T00:00:00'),
      subjects: []
    };

    const subjects = Array.isArray(testObj.subjects) ? [...testObj.subjects] : [];
    const subIndex = subjects.findIndex((s) => String(s.subject).toLowerCase() === globalSubject.toLowerCase());

    if (scoreRaw === '') {
      // Remove subject if empty
      if (subIndex >= 0) subjects.splice(subIndex, 1);
    } else {
      const score = Number(scoreRaw);
      if (isNaN(score) || score < 0) throw new Error('Score must be a valid number >= 0');
      if (score > maxScore) throw new Error('Score cannot exceed Max Score');

      if (subIndex >= 0) {
        subjects[subIndex] = { ...subjects[subIndex], score, maxScore };
      } else {
        subjects.push({ subject: globalSubject, score, maxScore });
      }
    }

    testObj.subjects = subjects;

    if (testIndex >= 0) {
      existingTests[testIndex] = testObj;
    } else {
      existingTests.push(testObj);
    }

    await setDoc(doc(db, 'students', studentId), { weeklyTests: existingTests }, { merge: true });
  };

  const handleSaveRow = async (studentId) => {
    if (!globalTestName.trim()) {
      setGlobalError('Please enter a Weekly Test Name (e.g. "Weekly Test 1").');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const val = unsavedScores[studentId];
    if (val === undefined) return; // Nothing changed

    setGlobalError('');

    try {
      await saveScoreForStudent(studentId, val);
      setUnsavedScores((prev) => {
        const next = { ...prev };
        delete next[studentId];
        return next;
      });
    } catch (err) {
      alert(`Error saving for student ID ${studentId}: ${err.message}`);
    }
  };

  const handleSaveAll = async () => {
    if (!globalTestName.trim()) {
      setGlobalError('Please enter a Weekly Test Name.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const studentIds = Object.keys(unsavedScores);
    if (studentIds.length === 0) {
      alert("No changes to save. All marks are up to date.");
      return;
    }

    setGlobalError('');
    setIsSavingAll(true);
    let successCount = 0;
    let errorCount = 0;

    for (const studentId of studentIds) {
      const val = unsavedScores[studentId];
      try {
        await saveScoreForStudent(studentId, val);
        successCount++;
        setUnsavedScores((prev) => {
          const next = { ...prev };
          delete next[studentId];
          return next;
        });
      } catch (err) {
        errorCount++;
      }
    }

    setIsSavingAll(false);
    if (errorCount === 0) {
      alert(`Successfully saved marks for ${successCount} students.`);
    } else {
      alert(`Saved ${successCount} students. Failed for ${errorCount} students (check validity of their scores).`);
    }
  };

  const handleCreateNewTest = () => {
    let maxNum = 0;
    aggregatedTests.forEach((t) => {
      const name = t.name.toLowerCase();
      if (name.includes('weekly test')) {
        const match = name.match(/weekly test\s*(\d+)/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) {
            maxNum = num;
          }
        }
      }
    });
    const nextNum = maxNum > 0 ? maxNum + 1 : aggregatedTests.length + 1;
    const nextTestName = `weekly test ${nextNum}`;

    setGlobalTestName(nextTestName);
    setGlobalTestDate(format(new Date(), 'yyyy-MM-dd'));
    setGlobalMaxScore('100');
    setGlobalError('');
    setUnsavedScores({});
    setShowTestsView(false);
  };

  return (
    <div className="space-y-6">
      {/* Weekly Test Configuration Area */}
      <Card
        title="Weekly Test Configuration"
        subtitle="Set the active test and subject to begin batch entering marks."
        className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200 shadow-md"
      >
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <Input
            label="Weekly Test Name"
            placeholder="e.g. weekly test 1"
            value={globalTestName}
            onChange={(e) => {
               setGlobalTestName(e.target.value);
               setGlobalError('');
            }}
            className="border-blue-200 focus:border-blue-500 focus:ring-blue-500 bg-white"
          />
          <Select
            label="Subject"
            value={globalSubject}
            onChange={(e) => setGlobalSubject(e.target.value)}
            options={SUBJECT_OPTIONS.map((sub) => ({ value: sub, label: sub }))}
            className="border-blue-200 focus:border-blue-500 focus:ring-blue-500 bg-white"
          />
          <Input
            label="Max Score"
            type="number"
            value={globalMaxScore}
            onChange={(e) => setGlobalMaxScore(e.target.value)}
            className="border-blue-200 focus:border-blue-500 focus:ring-blue-500 bg-white"
          />
          <div className="w-full">
            <Button
              onClick={handleCreateNewTest}
              className="w-full shadow-sm border border-indigo-600 hover:bg-indigo-700 bg-indigo-600 hover:border-indigo-700 text-white font-semibold flex items-center justify-center gap-2"
            >
              <span>➕</span> <span>New Test</span>
            </Button>
          </div>
        </div>
        {globalError && <p className="text-red-600 text-sm font-medium mt-3 bg-red-50 p-2 rounded border border-red-200">{globalError}</p>}
      </Card>

      <Card
        title={showTestsView ? "Available Weekly Tests" : "Students Results List"}
        subtitle={showTestsView ? "Select a test card to load and edit its marks." : `Enter marks for ${globalSubject} across all filtered students.`}
        className="border-blue-150 shadow-md bg-gradient-to-br from-white to-indigo-50/10"
        action={
          <div className="flex gap-2">
            <Button 
              onClick={() => setShowTestsView(!showTestsView)}
              className={`shadow-sm font-bold transition-all duration-200 flex items-center gap-2 border-2 ${
                showTestsView 
                  ? 'bg-blue-600 text-white hover:bg-blue-700 border-blue-600 shadow-md' 
                  : 'bg-white text-blue-600 hover:bg-blue-50 border-blue-600'
              }`}
            >
              <span>📋</span> <span>Tests</span>
            </Button>
            <Button 
              onClick={handleSaveAll} 
              disabled={isSavingAll}
              className="shadow-sm border border-blue-600 hover:bg-blue-700 bg-blue-600 hover:border-blue-700 text-white font-semibold transition-all duration-200"
            >
              {isSavingAll ? 'Saving All...' : `💾 Save All Changes (${Object.keys(unsavedScores).length})`}
            </Button>
          </div>
        }
      >
        {showTestsView ? (
          <div className="mt-2">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {aggregatedTests.map((t) => (
                <div 
                  key={t.name}
                  onClick={() => {
                    setGlobalTestName(t.name);
                    if (t.date) setGlobalTestDate(t.date);
                    if (t.maxScore) setGlobalMaxScore(String(t.maxScore));
                    if (t.subjects && t.subjects.length > 0) {
                      if (!t.subjects.includes(globalSubject)) {
                        setGlobalSubject(t.subjects[0]);
                      }
                    }
                    setShowTestsView(false);
                  }}
                  className="group relative bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all duration-300 cursor-pointer overflow-hidden flex flex-col justify-between min-h-[160px]"
                >
                  <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 rounded-bl-full group-hover:scale-110 transition-transform duration-300 pointer-events-none" />
                  
                  <div>
                    <div className="flex justify-between items-start mb-3">
                      <h4 className="text-lg font-bold text-gray-900 group-hover:text-indigo-600 transition-colors duration-200">
                        {t.name}
                      </h4>
                      <span className="text-xs bg-indigo-50 text-indigo-700 font-semibold px-2.5 py-1 rounded-full border border-indigo-100 shadow-sm">
                        {t.studentCount} student{t.studentCount !== 1 ? 's' : ''}
                      </span>
                    </div>

                    <p className="text-xs text-gray-500 mb-4 font-medium flex items-center gap-1">
                      <span>📅 Date:</span> <span>{t.date || 'No Date'}</span>
                    </p>

                    <div className="mb-4">
                      <span className="text-[10px] text-gray-400 block mb-1.5 uppercase tracking-wider font-bold">Subjects</span>
                      <div className="flex flex-wrap gap-1.5">
                        {t.subjects && t.subjects.length > 0 ? (
                          t.subjects.map((sub) => (
                            <span 
                              key={sub}
                              className={`text-xs px-2 py-0.5 rounded-md font-medium border transition-colors ${
                                sub === globalSubject 
                                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' 
                                  : 'bg-gray-50 text-gray-600 border-gray-200'
                              }`}
                            >
                              {sub}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-gray-400 italic">No subjects</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-gray-100 flex justify-between items-center mt-auto">
                    <span className="text-xs text-gray-500 font-medium">
                      Max Score: <strong className="text-gray-700">{t.maxScore}</strong>
                    </span>
                    <button className="text-xs font-bold text-indigo-600 group-hover:text-indigo-800 flex items-center gap-1 transition-colors">
                      ✏️ Edit Marks &rarr;
                    </button>
                  </div>
                </div>
              ))}
              {aggregatedTests.length === 0 && (
                <div className="col-span-full text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                  <p className="text-gray-500 font-medium">No tests found in database.</p>
                  <p className="text-xs text-gray-400 mt-1">Start by adding a test name and entering marks in the form above.</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <Input
                label="Search"
                className="border-2 border-primary-200 focus:ring-primary-500 focus:border-primary-500"
                placeholder="Name / admission"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <Select
                className="border-2 border-primary-200 focus:ring-primary-500 focus:border-primary-500"
                label="Batch"
                value={batchFilter}
                onChange={(e) => setBatchFilter(e.target.value)}
                options={[{ value: 'all', label: 'All Batches' }, ...BATCH_OPTIONS.map((b) => ({ value: b, label: b }))]}
              />
              <Select
                className="border-2 border-primary-200 focus:ring-primary-500 focus:border-primary-500"
                label="Year"
                value={yearFilter}
                onChange={(e) => setYearFilter(e.target.value)}
                options={[
                  { value: '1', label: '1st Year' },
                  { value: '2', label: '2nd Year' },
                  { value: 'all', label: 'All Years' },
                ]}
              />
              <Select
                className="border-2 border-primary-200 focus:ring-primary-500 focus:border-primary-500"
                label="Stream"
                value={streamFilter}
                onChange={(e) => setStreamFilter(e.target.value)}
                options={[{ value: 'all', label: 'All Streams' }, ...STREAM_OPTIONS.map((s) => ({ value: s, label: s }))]}
              />
            </div>

            {studentsError ? <div className="mt-4"><Alert type="error" title="Error" message={studentsError} /></div> : null}

            <div className="mt-6">
              {studentsLoading ? <div className="text-sm text-gray-600 px-2 py-3">Loading students…</div> : null}
              {!studentsLoading && !studentsError && students.length === 0 ? (
                <div className="text-sm text-gray-600 px-2 py-3">No students match the selected filters.</div>
              ) : null}

              {students.length > 0 && (
                <>
                  <Table
                    columns={[
                      { key: 'admissionNumber', label: 'Admission No' },
                      { key: 'name', label: 'Student Name' },
                      { key: 'yearStream', label: 'Year & Stream', render: (_, row) => `${row.year || '1st'} Yr • ${getStudentStreamValue(row) || '—'}` },
                      { 
                        key: 'scoreInput', 
                        label: `${globalSubject} Score`, 
                        render: (_, row) => {
                          const isUnsaved = unsavedScores[row.id] !== undefined;
                          const val = isUnsaved ? unsavedScores[row.id] : getExistingScore(row);
                          return (
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                placeholder="Score"
                                className={`w-28 px-3 py-2 text-center text-base font-semibold border-2 rounded-lg shadow-sm transition-all duration-200 focus:outline-none focus:ring-4 focus:border-blue-500 focus:ring-blue-100 ${
                                  isUnsaved 
                                    ? 'bg-amber-50 border-amber-400 text-amber-900' 
                                    : 'bg-blue-50/20 border-blue-200 text-blue-900 hover:border-blue-300'
                                }`}
                                value={val}
                                onChange={(e) => setUnsavedScores(prev => ({ ...prev, [row.id]: e.target.value }))}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    handleSaveRow(row.id);
                                  }
                                }}
                              />
                              <span className="text-gray-400 text-sm">/ {globalMaxScore}</span>
                            </div>
                          );
                        } 
                      }
                    ]}
                    data={students}
                  />

                  <Pagination
                    currentPage={currentPageSafe}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                  />
                </>
              )}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}


// ============================================================================
// PAGE: REMARKS
// ============================================================================

function RemarksPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [batchFilter, setBatchFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');
  const [streamFilter, setStreamFilter] = useState('all');
  const [subject, setSubject] = useState('Other');
  const [remarkType, setRemarkType] = useState('positive');

  const [currentPage, setCurrentPage] = useState(1);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentsError, setStudentsError] = useState('');
  const [allStudents, setAllStudents] = useState([]);

  const [messageById, setMessageById] = useState({});
  const [imageById, setImageById] = useState({});   // studentId -> base64 data url
  const [previewImg, setPreviewImg] = useState(null); // base64 url currently being previewed
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveOk, setSaveOk] = useState(false);

  // Compress image to ≤20KB as base64 JPEG
  const compressImageForRemark = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const MAX_BYTES = 20 * 1024;
        let quality = 0.8;
        let w = img.width;
        let h = img.height;
        // Scale down if very large
        const MAX_DIM = 600;
        if (w > MAX_DIM || h > MAX_DIM) {
          const ratio = Math.min(MAX_DIM / w, MAX_DIM / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        // Reduce quality until under MAX_BYTES
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        while (dataUrl.length * 0.75 > MAX_BYTES && quality > 0.1) {
          quality = Math.max(0.1, quality - 0.1);
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }
        resolve(dataUrl);
      };
      img.onerror = reject;
      img.src = ev.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, batchFilter, yearFilter, streamFilter, subject, remarkType]);

  useEffect(() => {
    const term = normalizeTerm(searchTerm);
    if (!term) return;
    if (isProbablyAdmissionNumber(term) || isProbablyUid(term)) return;

    const baseMatches = allStudents.filter((s) => studentMatchesSearch(s, term));
    if (baseMatches.length === 0) return;

    const visibleMatches = baseMatches.filter((s) => {
      if (batchFilter !== 'all' && String(s.batch || '') !== String(batchFilter)) return false;
      if (yearFilter !== 'all' && String(s.year || '') !== String(yearFilter)) return false;
      if (
        streamFilter !== 'all' &&
        getStudentStreamValue(s).toUpperCase() !== String(streamFilter).toUpperCase()
      ) {
        return false;
      }
      return true;
    });

    if (visibleMatches.length > 0) return;

    if (baseMatches.length === 1) {
      const only = baseMatches[0];
      const matchBatch = String(only?.batch || 'all');
      const matchYear = String(only?.year || 'all');
      const matchStream = getStudentStreamValue(only);
      if (batchFilter !== matchBatch) setBatchFilter(matchBatch);
      if (yearFilter !== matchYear) setYearFilter(matchYear);
      if (streamFilter !== (matchStream || 'all')) setStreamFilter(matchStream || 'all');
    } else {
      if (batchFilter !== 'all') setBatchFilter('all');
      if (yearFilter !== 'all') setYearFilter('all');
      if (streamFilter !== 'all') setStreamFilter('all');
    }
  }, [searchTerm, allStudents, batchFilter, yearFilter, streamFilter]);

  useEffect(() => {
    setStudentsLoading(true);
    setStudentsError('');

    const baseQuery = query(collection(db, 'students'), orderBy('admissionSequence', 'asc'));
    const unsub = onSnapshot(
      baseQuery,
      (snap) => {
        setAllStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setStudentsLoading(false);
      },
      () => {
        setStudentsError('Failed to load students.');
        setAllStudents([]);
        setStudentsLoading(false);
      }
    );

    return () => unsub();
  }, []);

  const filteredStudents = useMemo(() => {
    const term = normalizeTerm(searchTerm);
    const termLower = term.toLowerCase();

    return allStudents.filter((s) => {
      if (batchFilter !== 'all' && String(s.batch || '') !== String(batchFilter)) return false;
      if (yearFilter !== 'all' && String(s.year || '') !== String(yearFilter)) return false;
      if (
        streamFilter !== 'all' &&
        getStudentStreamValue(s).toUpperCase() !== String(streamFilter).toUpperCase()
      ) {
        return false;
      }

      if (!term) return true;

      if (isProbablyAdmissionNumber(term)) {
        return admissionMatchesTerm(s.admissionNumber, term);
      }

      const name = String(s.nameLower || s.name || '').toLowerCase();
      const admission = String(s.admissionNumber || '').toUpperCase();
      return name.includes(termLower) || admissionMatchesTerm(admission, term);
    });
  }, [allStudents, searchTerm, batchFilter, yearFilter, streamFilter]);

  const totalCount = filteredStudents.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPageSafe = Math.min(Math.max(1, currentPage), totalPages);

  const students = useMemo(() => {
    const start = (currentPageSafe - 1) * PAGE_SIZE;
    return filteredStudents.slice(start, start + PAGE_SIZE);
  }, [filteredStudents, currentPageSafe]);

  const onUploadRemarks = async () => {
    setSaving(true);
    setSaveOk(false);
    setSaveError('');
    try {
      const backendType = remarkType === 'negative' ? 'alert' : remarkType === 'note' ? 'note' : 'positive';

      for (const s of students) {
        const raw = messageById[s.id];
        const msg = String(raw || '').trim();
        if (!msg) continue;

        const finalMessage = subject && subject !== 'Other' ? `[${subject}] ${msg}` : msg;
        const imgBase64 = imageById[s.id] || null;
        await addStudentRemark({ studentId: s.id, type: backendType, message: finalMessage, imageBase64: imgBase64 });
      }

      setSaveOk(true);
      setMessageById({});
      setImageById({});
    } catch {
      setSaveError('Failed to upload remarks.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card
        title="Remarks"
        subtitle="Same structure as Results + subject dropdown (Other included)"
        action={
          <Button onClick={onUploadRemarks} disabled={saving}>
            {saving ? 'Uploading…' : 'Upload Remarks'}
          </Button>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
          <Input
            label="Search"
            className="border-2 border-primary-200 focus:ring-primary-500 focus:border-primary-500"
            placeholder="Name / admission"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <Select
            className="border-2 border-primary-200 focus:ring-primary-500 focus:border-primary-500"
            label="Batch"
            value={batchFilter}
            onChange={(e) => setBatchFilter(e.target.value)}
            options={[{ value: 'all', label: 'All Batches' }, ...BATCH_OPTIONS.map((b) => ({ value: b, label: b }))]}
          />
          <Select
            className="border-2 border-primary-200 focus:ring-primary-500 focus:border-primary-500"
            label="Year"
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            options={[
              { value: '1', label: '1st Year' },
              { value: '2', label: '2nd Year' },
              { value: 'all', label: 'All Years' },
            ]}
          />
          <Select
            className="border-2 border-primary-200 focus:ring-primary-500 focus:border-primary-500"
            label="Stream"
            value={streamFilter}
            onChange={(e) => setStreamFilter(e.target.value)}
            options={[{ value: 'all', label: 'All Streams' }, ...STREAM_OPTIONS.map((s) => ({ value: s, label: s }))]}
          />
          <Select
            className="border-2 border-primary-200 focus:ring-primary-500 focus:border-primary-500"
            label="Subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            options={REMARK_SUBJECT_OPTIONS.map((s) => ({ value: s, label: s }))}
          />
          <Select
            className="border-2 border-primary-200 focus:ring-primary-500 focus:border-primary-500"
            label="Type"
            value={remarkType}
            onChange={(e) => setRemarkType(e.target.value)}
            options={[
              { value: 'positive', label: 'Positive' },
              { value: 'negative', label: 'Negative' },
              { value: 'note', label: 'Note' },
            ]}
          />
        </div>

        {saveError ? <div className="mt-4"><Alert type="error" title="Error" message={saveError} /></div> : null}
        {saveOk ? <div className="mt-4"><Alert type="success" title="Uploaded" message="Remarks uploaded." /></div> : null}
        {studentsError ? <div className="mt-4"><Alert type="error" title="Error" message={studentsError} /></div> : null}

        <div className="mt-6">
          {studentsLoading ? <div className="text-sm text-gray-600 px-2 py-3">Loading students…</div> : null}
          {!studentsLoading && !studentsError && students.length === 0 ? (
            <div className="text-sm text-gray-600 px-2 py-3">No students match the selected Year/Stream/Search.</div>
          ) : null}

          <Table
            columns={[
              { key: 'admissionNumber', label: 'Admission No' },
              { key: 'name', label: 'Student Name' },
              {
                key: 'remarkEntry',
                label: 'Remark',
                render: (v, row) => (
                  <Input
                    placeholder={subject === 'Other' ? 'Enter remark' : `Enter remark for ${subject}`}
                    value={messageById[row.id] ?? ''}
                    onChange={(e) => setMessageById((prev) => ({ ...prev, [row.id]: e.target.value }))}
                  />
                ),
              },
              ...(remarkType === 'negative' ? [{
                key: 'photoUpload',
                label: 'Photo (Evidence)',
                render: (_v, row) => (
                  <div className="flex items-center gap-2">
                    {imageById[row.id] ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setPreviewImg(imageById[row.id])}
                          className="w-10 h-10 rounded-lg border-2 border-red-300 overflow-hidden hover:border-red-500 transition-colors flex-shrink-0 shadow"
                          title="Click to preview"
                        >
                          <img src={imageById[row.id]} alt="evidence" className="w-full h-full object-cover" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setImageById((prev) => { const n = {...prev}; delete n[row.id]; return n; })}
                          className="text-xs text-red-500 hover:text-red-700 font-medium"
                          title="Remove photo"
                        >
                          ✕
                        </button>
                      </>
                    ) : (
                      <label className="cursor-pointer flex items-center gap-1.5 px-3 py-2 rounded-lg border-2 border-dashed border-red-200 hover:border-red-400 bg-red-50 hover:bg-red-100 transition-colors text-xs font-medium text-red-600">
                        <span>📎 Upload</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            try {
                              const dataUrl = await compressImageForRemark(file);
                              setImageById((prev) => ({ ...prev, [row.id]: dataUrl }));
                            } catch {
                              alert('Failed to process image. Please try another file.');
                            }
                            try { e.target.value = ''; } catch {}
                          }}
                        />
                      </label>
                    )}
                  </div>
                ),
              }] : []),
            ]}
            data={students}
          />

          {/* Image preview lightbox */}
          {previewImg && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
              onClick={() => setPreviewImg(null)}
            >
              <div
                className="relative bg-white rounded-2xl shadow-2xl p-3 max-w-sm w-full mx-4"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-gray-800">📷 Evidence Photo</span>
                  <button
                    onClick={() => setPreviewImg(null)}
                    className="text-gray-400 hover:text-gray-700 text-xl leading-none font-bold"
                  >
                    ×
                  </button>
                </div>
                <img
                  src={previewImg}
                  alt="Evidence"
                  className="w-full rounded-xl object-contain max-h-72 border border-gray-100"
                />
                <div className="mt-2 text-xs text-gray-400 text-center">Click outside or × to close</div>
              </div>
            </div>
          )}

          <Pagination
            currentPage={currentPageSafe}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        </div>
      </Card>
    </div>
  );
}

// ============================================================================
// PAGE: FEES
// ============================================================================

function FeesPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [batchFilter, setBatchFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');
  const [streamFilter, setStreamFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const [currentPage, setCurrentPage] = useState(1);
  const [feesLoading, setFeesLoading] = useState(false);
  const [feesError, setFeesError] = useState('');
  const [studentsForFees, setStudentsForFees] = useState([]);
  const [allFeeRows, setAllFeeRows] = useState([]);
  const [studentsLoaded, setStudentsLoaded] = useState(false);
  const [feesDocsLoaded, setFeesDocsLoaded] = useState(false);

  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [selectedFees, setSelectedFees] = useState(null);
  const [detailsError, setDetailsError] = useState('');

  const [detailsTotalFees, setDetailsTotalFees] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [cautionDeposit, setCautionDeposit] = useState('');
  const [receiptNo, setReceiptNo] = useState('');
  const [payMethod, setPayMethod] = useState('cash');
  const [transactionId, setTransactionId] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveOk, setSaveOk] = useState(false);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, batchFilter, yearFilter, streamFilter, statusFilter]);

  useEffect(() => {
    setSelectedStudentId(null);
    setSelectedFees(null);
    setDetailsError('');
    setSaveError('');
    setSaveOk(false);
    setPayAmount('');
    setCautionDeposit('');
    setReceiptNo('');
    setTransactionId('');
    setPayMethod('cash');
  }, [searchTerm, batchFilter, yearFilter, streamFilter, statusFilter, currentPage]);

  const selectedStudentMeta = useMemo(() => {
    if (!selectedStudentId) return null;
    return (Array.isArray(studentsForFees) ? studentsForFees : []).find((s) => s.id === selectedStudentId) || null;
  }, [studentsForFees, selectedStudentId]);

  useEffect(() => {
    setStudentsLoaded(false);
    setFeesDocsLoaded(false);
    setFeesError('');

    const studentsQ = query(collection(db, 'students'), orderBy('admissionNumber', 'asc'));
    const unsubStudents = onSnapshot(
      studentsQ,
      (snap) => {
        setStudentsForFees(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setStudentsLoaded(true);
      },
      () => {
        setStudentsForFees([]);
        setStudentsLoaded(true);
        setFeesError('Failed to load students.');
      }
    );

    const feesQ = query(collection(db, 'fees'), orderBy('admissionNumber', 'asc'));
    const unsubFees = onSnapshot(
      feesQ,
      (snap) => {
        setAllFeeRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setFeesDocsLoaded(true);
      },
      () => {
        setAllFeeRows([]);
        setFeesDocsLoaded(true);
        setFeesError((prev) => prev || 'Failed to load fees.');
      }
    );

    return () => {
      unsubStudents();
      unsubFees();
    };
  }, []);

  useEffect(() => {
    setFeesLoading(!(studentsLoaded && feesDocsLoaded));
  }, [studentsLoaded, feesDocsLoaded]);

  useEffect(() => {
    if (!selectedStudentId) return;
    setDetailsError('');

    const unsub = onSnapshot(
      doc(db, 'fees', selectedStudentId),
      (snap) => {
        const data = snap.exists() ? snap.data() : null;
        setSelectedFees(data);

        const tf = typeof data?.totalFees === 'number' ? data.totalFees : 0;
        setDetailsTotalFees(String(tf));
      },
      () => setDetailsError('Failed to load fee details.')
    );
    return () => unsub();
  }, [selectedStudentId]);

  const selectedPaid = typeof selectedFees?.paidAmount === 'number' ? selectedFees.paidAmount : 0;
  const selectedCautionDeposit = typeof selectedFees?.cautionDeposit === 'number' ? selectedFees.cautionDeposit : 0;
  const selectedCautionDepositUsed = typeof selectedFees?.cautionDepositUsed === 'number' ? selectedFees.cautionDepositUsed : 0;
  const selectedCautionDepositRemaining = typeof selectedFees?.cautionDepositRemaining === 'number'
    ? selectedFees.cautionDepositRemaining
    : Math.max(0, selectedCautionDeposit - selectedCautionDepositUsed);

  const parsedTotalFees = Number(detailsTotalFees);
  const selectedTotal =
    detailsTotalFees !== '' && Number.isFinite(parsedTotalFees)
      ? parsedTotalFees
      : typeof selectedFees?.totalFees === 'number'
        ? selectedFees.totalFees
        : 0;
  const selectedPending = Math.max(0, selectedTotal - selectedPaid);

  const pay = Number(payAmount) || 0;
  const caution = Number(cautionDeposit) || 0;
  const nextPaid = selectedPaid + (pay > 0 ? pay : 0);
  const nextPending = Math.max(0, selectedTotal - nextPaid);

  const payValidationError = useMemo(() => {
    if (!selectedStudentId) return 'Select a student to pay.';
    if (!Number.isFinite(selectedTotal) || selectedTotal < 0) return 'Enter a valid total fee amount.';
    if (pay === 0 && caution === 0) return 'Enter a payment amount or a cautionary deposit.';
    if (pay < 0 || caution < 0) return 'Enter valid amounts.';
    if (nextPaid > selectedTotal) return 'Payment exceeds total fees.';
    if (payMethod !== 'cash' && !String(transactionId || '').trim()) return 'Reference ID is required for UPI/Cheque.';
    return '';
  }, [selectedStudentId, selectedTotal, pay, caution, nextPaid, payMethod, transactionId]);

  const onPay = async () => {
    if (payValidationError) {
      setSaveError(payValidationError);
      return;
    }

    setSaving(true);
    setSaveOk(false);
    setSaveError('');
    try {
      if (auth.currentUser?.getIdToken) {
        await auth.currentUser.getIdToken(true);
      }

      await updateFees({
        studentId: selectedStudentId,
        totalFees: Number(selectedTotal),
        paidAmount: Number(nextPaid),
        cautionDeposit: Number(caution),
        receiptNo: String(receiptNo || '').trim(),
        paymentEntry: {
          amount: Number(pay),
          method: payMethod,
          transactionId: payMethod === 'cash' ? null : String(transactionId || '').trim(),
        },
      });

      setPayAmount('');
      setCautionDeposit('');
      setReceiptNo('');
      setTransactionId('');
      setSaveOk(true);
    } catch (err) {
      const code = typeof err?.code === 'string' ? err.code : '';
      const msgRaw = typeof err?.message === 'string' ? err.message : '';
      const msg = msgRaw.replace(/^FirebaseError:\s*/i, '').trim();
      const detailsRaw = err?.details;
      const details = detailsRaw ? String(typeof detailsRaw === 'string' ? detailsRaw : JSON.stringify(detailsRaw)) : '';

      const composed = [code && `(${code})`, msg, details && `Details: ${details}`].filter(Boolean).join(' ');
      setSaveError(composed || 'Failed to record payment.');
    } finally {
      setSaving(false);
    }
  };

  const paymentHistory = Array.isArray(selectedFees?.paymentHistory) ? selectedFees.paymentHistory : [];

  const filteredFees = useMemo(() => {
    const term = normalizeTerm(searchTerm);

    const wantBatch = batchFilter !== 'all' ? String(batchFilter || '').trim() : null;
    const wantYear = yearFilter !== 'all' ? yearFilter : null;
    const wantStream = streamFilter !== 'all' ? String(streamFilter || '').trim().toUpperCase() : null;
    const wantStatus = statusFilter !== 'all' ? statusFilter : null;

    const feesById = new Map((Array.isArray(allFeeRows) ? allFeeRows : []).map((r) => [r.id, r]));
    const students = Array.isArray(studentsForFees) ? studentsForFees : [];

    const mergedRows = students.map((student) => {
      const fees = feesById.get(student.id);
      const totalFees = typeof fees?.totalFees === 'number' ? fees.totalFees : 0;
      const paidAmount = typeof fees?.paidAmount === 'number' ? fees.paidAmount : 0;
      const depositAmount = typeof fees?.cautionDeposit === 'number' ? fees.cautionDeposit : 0;
      const pendingAmount =
        typeof fees?.pendingAmount === 'number' ? fees.pendingAmount : Math.max(0, Number(totalFees || 0) - Number(paidAmount || 0));

      return {
        id: student.id,
        admissionNumber: student?.admissionNumber || fees?.admissionNumber || '',
        studentName: student?.name || fees?.studentName || '',
        studentNameLower:
          student?.nameLower || (typeof student?.name === 'string' ? student.name.toLowerCase() : '') || fees?.studentNameLower || '',
        batch: student?.batch || fees?.batch || '',
        year: student?.year || fees?.year || '',
        courseOfStudy: student?.courseOfStudy || fees?.courseOfStudy || '',
        stream: getStudentStreamValue(student) || getStudentStreamValue(fees) || '',
        feeStatus: fees?.feeStatus || 'none',
        totalFees,
        depositAmount,
        paidAmount,
        pendingAmount,
      };
    });

    return mergedRows.filter((row) => {
      if (wantBatch && String(row?.batch || '') !== wantBatch) return false;
      if (wantYear && String(row?.year || '') !== wantYear) return false;

      const rowStream = String(getStudentStreamValue(row) || '').trim().toUpperCase();
      if (wantStream && rowStream !== wantStream) return false;

      if (wantStatus && String(row?.feeStatus || '') !== wantStatus) return false;

      if (!term) return true;

      if (isProbablyAdmissionNumber(term)) {
        return admissionMatchesTerm(String(row?.admissionNumber || ''), term);
      }

      const nameLower = String(row?.studentNameLower || row?.studentName || '').toLowerCase();
      return nameLower.includes(term.toLowerCase());
    });
  }, [allFeeRows, studentsForFees, searchTerm, batchFilter, yearFilter, streamFilter, statusFilter]);

  const totalCount = filteredFees.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPageSafe = Math.min(Math.max(1, currentPage), totalPages);
  const feeRows = useMemo(() => {
    const start = (currentPageSafe - 1) * PAGE_SIZE;
    return filteredFees.slice(start, start + PAGE_SIZE);
  }, [filteredFees, currentPageSafe]);

  if (selectedStudentId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xl font-semibold text-gray-900">Fees</div>
            <div className="text-sm text-gray-600">Fee details</div>
          </div>
          <Button
            variant="secondary"
            onClick={() => {
              setSelectedStudentId(null);
              setSelectedFees(null);
              setDetailsError('');
              setSaveError('');
              setSaveOk(false);
              setPayAmount('');
              setCautionDeposit('');
              setReceiptNo('');
              setPayMethod('cash');
              setTransactionId('');
            }}
          >
            Back
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card
            title="Fee Details"
            subtitle={`${selectedStudentMeta?.name || selectedFees?.studentName || 'Student'} • ${
              selectedStudentMeta?.admissionNumber || selectedFees?.admissionNumber || ''
            }`}
            action={
              <Button onClick={onPay} disabled={saving || Boolean(payValidationError)}>
                {saving ? 'Processing…' : 'Pay'}
              </Button>
            }
          >
            {detailsError ? <div className="mb-4"><Alert type="error" title="Error" message={detailsError} /></div> : null}
            {saveError ? <div className="mb-4"><Alert type="error" title="Error" message={saveError} /></div> : null}
            {saveOk ? <div className="mb-4"><Alert type="success" title="Saved" message="Payment recorded." /></div> : null}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Total Fees" type="number" placeholder="0" value={detailsTotalFees} onChange={(e) => setDetailsTotalFees(e.target.value)} />
              <Input label="Paid" value={formatCurrency(selectedPaid)} readOnly />
              <Input label="Pending" value={formatCurrency(selectedPending)} readOnly />
              <Input label="Next Pending (after payment)" value={formatCurrency(nextPending)} readOnly />
            </div>

            <div className="mt-4 p-4 bg-primary-50 rounded-lg border border-primary-100 space-y-2">
              <div className="text-xs font-semibold text-primary-800 uppercase tracking-wider">Cautionary Deposit Info</div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-white p-2 rounded border border-primary-100">
                  <div className="text-2xs text-gray-500 font-medium">Deposited</div>
                  <div className="text-sm font-bold text-gray-900">{formatCurrency(selectedCautionDeposit)}</div>
                </div>
                <div className="bg-white p-2 rounded border border-primary-100">
                  <div className="text-2xs text-gray-500 font-medium">Used</div>
                  <div className="text-sm font-bold text-gray-900">{formatCurrency(selectedCautionDepositUsed)}</div>
                </div>
                <div className="bg-white p-2 rounded border border-primary-100">
                  <div className="text-2xs text-gray-500 font-medium">Remaining</div>
                  <div className="text-sm font-bold text-gray-900">{formatCurrency(selectedCautionDepositRemaining)}</div>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-gray-100 space-y-4">
              <div className="text-sm font-semibold text-gray-900">Payment</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Amount (Tuition Fee)"
                  type="number"
                  placeholder="0"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                />
                <Input
                  label="Cautionary Deposit"
                  type="number"
                  placeholder="0"
                  value={cautionDeposit}
                  onChange={(e) => setCautionDeposit(e.target.value)}
                />
                <Select
                  label="Method"
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                  options={[
                    { value: 'cash', label: 'Cash' },
                    { value: 'upi', label: 'UPI' },
                    { value: 'check', label: 'Cheque' },
                  ]}
                />
                <Input
                  label="Receipt No."
                  placeholder="Enter receipt number"
                  value={receiptNo}
                  onChange={(e) => setReceiptNo(e.target.value)}
                />
                {payMethod !== 'cash' ? (
                  <div className="md:col-span-2">
                    <Input
                      label={payMethod === 'upi' ? 'Transaction ID' : 'Cheque / Reference No.'}
                      placeholder={payMethod === 'upi' ? 'Enter UPI transaction id' : 'Enter cheque/reference no.'}
                      value={transactionId}
                      onChange={(e) => setTransactionId(e.target.value)}
                    />
                  </div>
                ) : null}
              </div>
              <div className="text-sm text-gray-700">
                Amount in words: <span className="font-semibold">{amountToWordsINR(pay + caution)}</span>
              </div>
            </div>
          </Card>

          <Card title="Payment History" subtitle="Latest first">
            {paymentHistory.length === 0 ? (
              <div className="text-sm text-gray-600">No payments recorded yet.</div>
            ) : (
              <div className="space-y-3">
                {[...paymentHistory].reverse().slice(0, 10).map((p, idx) => (
                  <div key={idx} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-gray-900">
                        {p.amount > 0 ? `Fees: ${formatCurrency(p.amount)}` : ''}
                        {p.amount > 0 && p.cautionDeposit > 0 ? ' + ' : ''}
                        {p.cautionDeposit > 0 ? `Caution: ${formatCurrency(p.cautionDeposit)}` : ''}
                        {p.amount === 0 && (!p.cautionDeposit || p.cautionDeposit === 0) ? formatCurrency(0) : ''}
                      </div>
                      <div className="text-xs text-gray-500">{p.at?.toDate ? format(p.at.toDate(), 'dd MMM, HH:mm') : '—'}</div>
                    </div>
                    <div className="mt-1 text-xs text-gray-600">Method: {String(p.method || 'unknown').toUpperCase()}</div>
                    {p.transactionId ? <div className="text-xs text-gray-600">Txn: {String(p.transactionId)}</div> : null}
                    {p.receiptNo ? <div className="text-xs text-gray-600">Receipt No: {String(p.receiptNo)}</div> : null}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card title="Fees" subtitle="Search + filter, then click View to open fee details">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <Input
            label="Search"
            className="py-2 text-sm border-2 border-primary-200 focus:ring-primary-500 focus:border-primary-500"
            placeholder="Search: name / admission"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <Select
            className="py-2 text-sm border-2 border-primary-200 focus:ring-primary-500 focus:border-primary-500"
            label="Batch"
            value={batchFilter}
            onChange={(e) => setBatchFilter(e.target.value)}
            options={[{ value: 'all', label: 'All Batches' }, ...BATCH_OPTIONS.map((b) => ({ value: b, label: b }))]}
          />
          <Select
            className="py-2 text-sm border-2 border-primary-200 focus:ring-primary-500 focus:border-primary-500"
            label="Year"
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            options={[
              { value: '1', label: '1st Year' },
              { value: '2', label: '2nd Year' },
              { value: 'all', label: 'All Years' },
            ]}
          />
          <Select
            className="py-2 text-sm border-2 border-primary-200 focus:ring-primary-500 focus:border-primary-500"
            label="Stream"
            value={streamFilter}
            onChange={(e) => setStreamFilter(e.target.value)}
            options={[{ value: 'all', label: 'All Streams' }, ...STREAM_OPTIONS.map((s) => ({ value: s, label: s }))]}
          />
          <Select
            className="py-2 text-sm border-2 border-primary-200 focus:ring-primary-500 focus:border-primary-500"
            label="Status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: 'all', label: 'ALL' },
              { value: 'full', label: 'Full' },
              { value: 'half', label: 'Half' },
              { value: 'none', label: 'None' },
            ]}
          />
        </div>

        {feesError ? <div className="mt-4"><Alert type="error" title="Error" message={feesError} /></div> : null}

        <div className="mt-6">
          {feesLoading ? <div className="text-sm text-gray-600 px-2 py-3">Loading…</div> : null}
          {!feesLoading && feeRows.length === 0 ? (
            <div className="text-sm text-gray-600 px-2 py-3">No students match these filters.</div>
          ) : null}
          <Table
            columns={[
              { key: 'admissionNumber', label: 'Admission No' },
              { key: 'studentName', label: 'Student Name' },
              { key: 'year', label: 'Year' },
              { key: 'stream', label: 'Stream', render: (v, row) => getStudentStreamValue(row) || '—' },
              {
                key: 'feeStatus',
                label: 'Status',
                render: (v) => (
                  <Badge
                    label={String(v || 'none')}
                    variant={v === 'full' ? 'success' : v === 'half' ? 'alert' : 'gray'}
                  />
                ),
              },
              { key: 'totalFees', label: 'Total', render: (v, row) => formatCurrency(Number(v || 0) + Number(row?.depositAmount || 0)) },
              { key: 'paidAmount', label: 'Paid', render: (v, row) => formatCurrency(Number(v || 0) + Number(row?.depositAmount || 0)) },
              {
                key: 'actions',
                label: 'View',
                render: (_v, row) => (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedStudentId(row.id);
                      setSaveOk(false);
                      setSaveError('');
                      setPayAmount('');
                      setPayMethod('cash');
                      setTransactionId('');
                    }}
                  >
                    View
                  </Button>
                ),
              },
              {
                key: 'pendingAmount',
                label: 'Pending',
                render: (v) => formatCurrency(Number(v || 0)),
              },
            ]}
            data={feeRows}
            onRowClick={(row) => {
              setSelectedStudentId(row.id);
              setSaveOk(false);
              setSaveError('');
              setPayAmount('');
              setPayMethod('cash');
              setTransactionId('');
            }}
          />

          <Pagination
            currentPage={currentPageSafe}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        </div>
      </Card>
    </div>
  );
}

// ============================================================================
// PAGE: ACCOUNTS (FINANCE)
// ============================================================================

function AccountsPage() {
  const [accounts, setAccounts] = useState(null);
  const [monthCursor, setMonthCursor] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [statsEntries, setStatsEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [incomeViewMode, setIncomeViewMode] = useState('monthly'); // 'monthly' or 'daily'
  const [expenditureViewMode, setExpenditureViewMode] = useState('monthly'); // 'monthly' or 'daily'

  // Reset selectedDate and view modes when month selection changes
  useEffect(() => {
    const today = new Date();
    if (monthCursor.getFullYear() === today.getFullYear() && monthCursor.getMonth() === today.getMonth()) {
      setSelectedDate(format(today, 'yyyy-MM-dd'));
    } else {
      setSelectedDate(format(monthCursor, 'yyyy-MM-dd'));
    }
    setIncomeViewMode('monthly');
    setExpenditureViewMode('monthly');
  }, [monthCursor]);

  const displayedIncomeEntries = useMemo(() => {
    const allIncome = statsEntries.filter((e) => e.isIncome);
    if (incomeViewMode === 'daily' && selectedDate) {
      return allIncome.filter((e) => e.date === selectedDate);
    }
    return allIncome;
  }, [statsEntries, incomeViewMode, selectedDate]);

  const displayedExpenditureEntries = useMemo(() => {
    const allExp = statsEntries.filter((e) => !e.isIncome);
    if (expenditureViewMode === 'daily' && selectedDate) {
      return allExp.filter((e) => e.date === selectedDate);
    }
    return allExp;
  }, [statsEntries, expenditureViewMode, selectedDate]);

  const monthLabel = useMemo(() => format(monthCursor, 'MMMM yyyy'), [monthCursor]);
  const monthStartISO = useMemo(() => format(new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1), 'yyyy-MM-dd'), [monthCursor]);
  const monthEndISO = useMemo(() => format(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0), 'yyyy-MM-dd'), [monthCursor]);
  const todayISO = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'accounts', 'summary'),
      (snap) => setAccounts(snap.exists() ? snap.data() : null),
      () => setAccounts(null)
    );
    return () => unsub();
  }, []);

  // Fetch statistics entries (income + expenditure) in real-time
  useEffect(() => {
    setLoading(true);
    const q = query(
      collection(db, 'statistics'),
      where('date', '>=', monthStartISO),
      where('date', '<=', monthEndISO),
      orderBy('date', 'asc')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setStatsEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      () => {
        setStatsEntries([]);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [monthStartISO, monthEndISO]);

  // Real-time synchronization of statistics entries with fees collection to ensure caution deposits are included
  useEffect(() => {
    let active = true;
    const syncStatsWithFees = async () => {
      try {
        const [statsSnap, feeSnap] = await Promise.all([
          getDocs(query(collection(db, 'statistics'), where('isIncome', '==', true), where('source', '==', 'Fees'))),
          getDocs(collection(db, 'fees')),
        ]);
        if (!active) return;

        const feePaymentsMap = {};
        for (const docSnap of feeSnap.docs) {
          const feeData = docSnap.data();
          const history = Array.isArray(feeData?.paymentHistory) ? feeData.paymentHistory : [];
          for (const p of history) {
            const at = p?.at?.toDate ? p.at.toDate() : null;
            if (!at) continue;
            const dateStr = format(at, 'yyyy-MM-dd');
            const admissionNo = String(feeData.admissionNumber || '').toUpperCase().trim();
            const totalPaid = Number(p.amount || 0) + Number(p.cautionDeposit || 0);
            
            const key = `${admissionNo}_${dateStr}`;
            if (!feePaymentsMap[key]) {
              feePaymentsMap[key] = [];
            }
            feePaymentsMap[key].push({
              totalPaid,
              cautionDeposit: Number(p.cautionDeposit || 0),
            });
          }
        }

        for (const d of statsSnap.docs) {
          const statsData = d.data();
          const dateStr = statsData.date;
          const admissionNo = String(statsData.studentHtno || '').toUpperCase().trim();
          if (!dateStr || !admissionNo) continue;

          const key = `${admissionNo}_${dateStr}`;
          const matches = feePaymentsMap[key];
          if (matches && matches.length > 0) {
            let bestMatch = matches[0];
            if (matches.length > 1) {
              const currentIncome = Number(statsData.income || 0);
              bestMatch = matches.find(m => m.totalPaid === currentIncome) || 
                          matches.find(m => m.totalPaid - m.cautionDeposit === currentIncome) || 
                          matches[0];
            }

            if (bestMatch && Number(statsData.income || 0) !== bestMatch.totalPaid) {
              console.log(`[Sync] Updating statistics doc ${d.id} for ${admissionNo} on ${dateStr}: income ${statsData.income} -> ${bestMatch.totalPaid}`);
              await setDoc(
                doc(db, 'statistics', d.id),
                { income: bestMatch.totalPaid },
                { merge: true }
              );
            }
          }
        }
      } catch (err) {
        console.error('[Sync] Failed to sync stats with fees:', err);
      }
    };
    syncStatsWithFees();
    return () => { active = false; };
  }, []);

  // One-time client-side migration for legacy statistics entries (saved before Cloud Function update)
  useEffect(() => {
    let active = true;
    const migrateLegacy = async () => {
      try {
        const statsSnap = await getDocs(collection(db, 'statistics'));
        const legacyDocs = statsSnap.docs.filter((d) => {
          const data = d.data();
          const noteText = data.note || data.spentOn || '';
          return (
            data.isIncome === undefined &&
            (noteText.startsWith('Fee payment —') || noteText.startsWith('Fee payment -'))
          );
        });

        if (legacyDocs.length === 0) return;

        console.log(`[Migration] Found ${legacyDocs.length} legacy fee entries to migrate.`);

        // Fetch all fees to match amounts
        const feeSnap = await getDocs(collection(db, 'fees'));
        const allFeePmts = [];
        for (const docSnap of feeSnap.docs) {
          const data = docSnap.data();
          const history = Array.isArray(data?.paymentHistory) ? data.paymentHistory : [];
          for (const p of history) {
            const at = p?.at?.toDate ? p.at.toDate() : null;
            if (!at) continue;
            allFeePmts.push({
              studentName: data.studentName || '',
              admissionNumber: data.admissionNumber || '',
              amount: Number(p.amount || 0) + Number(p.cautionDeposit || 0),
              method: p.method,
              transactionId: p.transactionId || '',
              dateStr: format(at, 'yyyy-MM-dd'),
            });
          }
        }

        const methodMap = { cash: 'Cash', upi: 'UPI', check: 'Cheque' };

        for (const d of legacyDocs) {
          if (!active) return;
          const data = d.data();
          const noteText = data.note || data.spentOn || '';
          const studentName = noteText.replace(/^Fee payment\s*[—–-]\s*/, '').trim();
          const date = data.date;

          // Find matching fee payment by date and student name
          const match = allFeePmts.find(
            (p) =>
              p.dateStr === date &&
              p.studentName.toLowerCase().trim() === studentName.toLowerCase().trim()
          );

          if (match) {
            console.log(`[Migration] Matching fee found for ${studentName} on ${date}: ₹${match.amount}`);
            await setDoc(
              doc(db, 'statistics', d.id),
              {
                isIncome: true,
                income: match.amount,
                expenditure: 0,
                source: 'Fees',
                studentHtno: match.admissionNumber,
                studentName: match.studentName,
                paymentMode: methodMap[match.method] || 'Cash',
                utrRef: match.transactionId || '',
              },
              { merge: true }
            );
          } else {
            console.warn(`[Migration] No matching fee payment found for ${studentName} on ${date}`);
            // Fallback: at least set isIncome: true so it doesn't show up in expenditure table
            await setDoc(
              doc(db, 'statistics', d.id),
              {
                isIncome: true,
                income: 0,
                expenditure: 0,
                source: 'Fees',
                studentName: studentName,
              },
              { merge: true }
            );
          }
        }
        console.log('[Migration] Legacy fee entries migration completed successfully.');
      } catch (err) {
        console.error('[Migration] Failed to run migration:', err);
      }
    };
    migrateLegacy();
    return () => {
      active = false;
    };
  }, []);


  const [feesByDate, setFeesByDate] = useState({});

  // Load ALL fee payment history and aggregate by date (tuition + caution deposit)
  // This is the source-of-truth for income — same approach as Daily Tracking's feesIncome
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(collection(db, 'fees'));
        if (cancelled) return;
        const byDate = {};
        for (const docSnap of snap.docs) {
          const data = docSnap.data();
          const history = Array.isArray(data?.paymentHistory) ? data.paymentHistory : [];
          for (const p of history) {
            const at = p?.at?.toDate ? p.at.toDate() : null;
            if (!at) continue;
            const dateStr = format(at, 'yyyy-MM-dd');
            const totalPaid = Number(p?.amount || 0) + Number(p?.cautionDeposit || 0);
            if (totalPaid <= 0) continue;
            byDate[dateStr] = (byDate[dateStr] || 0) + totalPaid;
          }
        }
        if (!cancelled) setFeesByDate(byDate);
      } catch {
        // silently ignore
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Build date-wise summary:
  // - Income comes directly from fees paymentHistory (tuition + caution deposit) — the ground truth
  // - Other income (donations, grants, etc.) comes from statistics entries with isIncome=true and source!='Fees'
  // - Expenditure comes from statistics entries with isIncome=false
  const dateSummary = useMemo(() => {
    const byDate = {};

    // 1. Add fee income from fees collection (accurate: tuition + caution deposit)
    for (const [dateStr, amount] of Object.entries(feesByDate)) {
      if (dateStr >= monthStartISO && dateStr <= monthEndISO) {
        if (!byDate[dateStr]) byDate[dateStr] = { income: 0, expenditure: 0 };
        byDate[dateStr].income += amount;
      }
    }

    // 2. Add non-fee income and expenditure from statistics
    for (const e of statsEntries) {
      const d = String(e.date || '');
      if (!d) continue;
      if (d >= monthStartISO && d <= monthEndISO) {
        if (!byDate[d]) byDate[d] = { income: 0, expenditure: 0 };
        if (e.isIncome) {
          // Only add non-Fees income to avoid double counting with feesByDate
          if (e.source !== 'Fees') {
            byDate[d].income += Number(e.income || 0);
          }
        } else {
          byDate[d].expenditure += Number(e.expenditure || 0);
        }
      }
    }

    return Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({ date, income: data.income, expenditure: data.expenditure, net: data.income - data.expenditure }));
  }, [statsEntries, feesByDate, monthStartISO, monthEndISO]);

  const selectedRow = dateSummary.find((r) => r.date === selectedDate);
  const monthTotalIncome = dateSummary.reduce((s, r) => s + r.income, 0);
  const monthTotalExpenditure = dateSummary.reduce((s, r) => s + r.expenditure, 0);
  const monthNet = monthTotalIncome - monthTotalExpenditure;

  const totalFees = typeof accounts?.totalBudget === 'number' ? accounts.totalBudget : 0;
  const collectedFees = typeof accounts?.totalCollected === 'number' ? accounts.totalCollected : 0;
  const recovery = Math.max(0, totalFees - collectedFees);

  return (
    <div className="space-y-6">
      {/* Fee summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <SummaryCard title="Total Fees" value={formatCurrency(totalFees)} color="primary" icon="💳" />
        <SummaryCard title="Collected" value={formatCurrency(collectedFees)} color="success" icon="✓" />
        <SummaryCard title="Recovery" value={formatCurrency(recovery)} color="alert" icon="⚠️" />
      </div>

      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-900">{monthLabel} — Daily Breakdown</h3>
          <p className="text-sm text-gray-500">Click any date row to highlight its income &amp; expenditure</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setMonthCursor((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}>Prev</Button>
          <Button variant="secondary" onClick={() => setMonthCursor((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}>Next</Button>
        </div>
      </div>

      {/* Selected date highlight boxes */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={`rounded-2xl border-2 p-5 text-center transition-all ${
          selectedRow ? 'bg-green-50 border-green-400 shadow-md' : 'bg-gray-50 border-gray-200'
        }`}>
          <div className="text-xs font-bold uppercase tracking-widest text-green-600 mb-2">📥 Income</div>
          <div className="text-3xl font-extrabold text-green-700">{formatCurrency(selectedRow?.income ?? 0)}</div>
          <div className="text-xs text-green-500 mt-2 font-medium">{selectedDate}</div>
        </div>
        <div className={`rounded-2xl border-2 p-5 text-center transition-all ${
          selectedRow ? 'bg-red-50 border-red-400 shadow-md' : 'bg-gray-50 border-gray-200'
        }`}>
          <div className="text-xs font-bold uppercase tracking-widest text-red-600 mb-2">📤 Expenditure</div>
          <div className="text-3xl font-extrabold text-red-700">{formatCurrency(selectedRow?.expenditure ?? 0)}</div>
          <div className="text-xs text-red-500 mt-2 font-medium">{selectedDate}</div>
        </div>
        <div className={`rounded-2xl border-2 p-5 text-center transition-all ${
          selectedRow
            ? selectedRow.net >= 0 ? 'bg-blue-50 border-blue-400 shadow-md' : 'bg-orange-50 border-orange-400 shadow-md'
            : 'bg-gray-50 border-gray-200'
        }`}>
          <div className={`text-xs font-bold uppercase tracking-widest mb-2 ${
            selectedRow ? (selectedRow.net >= 0 ? 'text-blue-600' : 'text-orange-600') : 'text-gray-500'
          }`}>💰 Net Balance</div>
          <div className={`text-3xl font-extrabold ${
            selectedRow ? (selectedRow.net >= 0 ? 'text-blue-700' : 'text-orange-700') : 'text-gray-400'
          }`}>{formatCurrency(selectedRow?.net ?? 0)}</div>
          <div className={`text-xs mt-2 font-medium ${
            selectedRow ? (selectedRow.net >= 0 ? 'text-blue-500' : 'text-orange-500') : 'text-gray-400'
          }`}>{selectedDate}</div>
        </div>
      </div>

      {/* Date picker */}
      <div className="flex items-center gap-4">
        <div className="w-56">
          <Input
            label="Jump to date"
            type="date"
            value={selectedDate}
            onChange={(e) => {
              setSelectedDate(e.target.value);
              setIncomeViewMode('daily');
              setExpenditureViewMode('daily');
            }}
          />
        </div>
      </div>

      {/* ── Income & Expenditure detailed tables side-by-side summary ── */}
      {loading ? <div className="text-sm text-gray-600 py-4">Loading entries…</div> : null}

      {/* Date-wise summary table (click to select) */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <span className="font-bold text-gray-700">📅 Date-wise Summary — {monthLabel}</span>
          <span className="text-xs text-gray-500">Click a row to select date</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="px-5 py-3 text-left font-semibold text-gray-700">Date</th>
              <th className="px-5 py-3 text-right font-semibold text-gray-700">Income</th>
              <th className="px-5 py-3 text-right font-semibold text-gray-700">Expenditure</th>
              <th className="px-5 py-3 text-right font-semibold text-gray-700">Net Balance</th>
            </tr>
          </thead>
          <tbody>
            {dateSummary.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-10 text-center text-gray-400 text-sm">
                  No entries found for {monthLabel}. Add income or expenditure in Daily Tracking.
                </td>
              </tr>
            ) : dateSummary.map((row) => {
              const isSelected = row.date === selectedDate;
              const isToday = row.date === todayISO;
              return (
                <tr
                  key={row.date}
                  onClick={() => {
                    setSelectedDate(row.date);
                    setIncomeViewMode('daily');
                    setExpenditureViewMode('daily');
                  }}
                  className={`border-b border-gray-100 cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-blue-50 ring-1 ring-inset ring-blue-200'
                      : isToday
                      ? 'bg-yellow-50'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`font-semibold ${isSelected ? 'text-blue-700' : 'text-gray-800'}`}>
                        {row.date}
                      </span>
                      {isToday && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">Today</span>
                      )}
                      {isSelected && !isToday && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">Selected</span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <span className={`inline-block px-3 py-1 rounded-lg font-semibold ${
                      isSelected
                        ? 'bg-green-100 text-green-800 border border-green-300 shadow-sm'
                        : row.income > 0 ? 'text-green-700 bg-green-50' : 'text-gray-400'
                    }`}>
                      {formatCurrency(row.income)}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <span className={`inline-block px-3 py-1 rounded-lg font-semibold ${
                      isSelected
                        ? 'bg-red-100 text-red-800 border border-red-300 shadow-sm'
                        : row.expenditure > 0 ? 'text-red-700 bg-red-50' : 'text-gray-400'
                    }`}>
                      {formatCurrency(row.expenditure)}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <span className={`inline-block px-3 py-1 rounded-lg font-semibold ${
                      isSelected
                        ? row.net >= 0
                          ? 'bg-blue-100 text-blue-800 border border-blue-300 shadow-sm'
                          : 'bg-orange-100 text-orange-800 border border-orange-300 shadow-sm'
                        : row.net >= 0 ? 'text-blue-700' : 'text-orange-700'
                    }`}>
                      {formatCurrency(row.net)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {dateSummary.length > 0 && (
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-300 font-bold">
                <td className="px-5 py-3 text-gray-700">Total ({monthLabel})</td>
                <td className="px-5 py-3 text-right text-green-700">{formatCurrency(monthTotalIncome)}</td>
                <td className="px-5 py-3 text-right text-red-700">{formatCurrency(monthTotalExpenditure)}</td>
                <td className={`px-5 py-3 text-right ${monthNet >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>{formatCurrency(monthNet)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* ── Income Table ── */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="px-5 py-3 bg-green-50 border-b border-green-200 flex items-center justify-between flex-wrap gap-2">
          <div className="flex flex-col">
            <span className="font-bold text-green-800">
              📥 {incomeViewMode === 'daily' ? `Income for ${selectedDate}` : `Monthly Income — ${monthLabel}`}
            </span>
            <span className="text-xs text-green-600">Rows highlighted for selected date</span>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={incomeViewMode === 'monthly' ? 'primary' : 'secondary'}
              onClick={() => setIncomeViewMode('monthly')}
            >
              Monthly Income
            </Button>
            <Button
              size="sm"
              variant={incomeViewMode === 'daily' ? 'primary' : 'secondary'}
              onClick={() => setIncomeViewMode('daily')}
              disabled={!selectedDate}
            >
              Daily Income {selectedDate ? `(${selectedDate})` : ''}
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Date</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-700">Income</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Payment Mode</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">UTR / Ref No.</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Paid For</th>
              </tr>
            </thead>
            <tbody>
              {displayedIncomeEntries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400 text-sm">
                    {incomeViewMode === 'daily'
                      ? `No income entries found for ${selectedDate}.`
                      : `No income entries found for ${monthLabel}.`}
                  </td>
                </tr>
              ) : displayedIncomeEntries.map((e) => (
                <tr key={e.id} className={`border-b border-gray-100 transition-colors ${e.date === selectedDate ? 'bg-green-50' : 'hover:bg-gray-50'}`}>
                  <td className="px-4 py-3 font-medium text-gray-800">{e.date}</td>
                  <td className="px-4 py-3 text-right font-bold text-green-700">{formatCurrency(Number(e.income || 0))}</td>
                  <td className="px-4 py-3 text-gray-600">{e.paymentMode || '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">
                    {(e.paymentMode === 'UPI' || e.paymentMode === 'Cheque' || e.paymentMode === 'Bank Transfer')
                      ? (e.utrRef || '—') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {e.source === 'Fees' ? (
                      <span className="flex items-center gap-1.5">
                        <span className="text-xs bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded-full">Fees</span>
                        <span className="font-mono text-xs text-blue-800 font-bold">{e.studentHtno || '—'}</span>
                        <span className="text-gray-600 text-xs">{e.studentName || ''}</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        <span className="text-xs bg-purple-100 text-purple-700 font-bold px-2 py-0.5 rounded-full">{e.source || 'Other'}</span>
                        <span className="text-gray-600 text-xs">{e.note || '—'}</span>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Expenditure Table ── */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="px-5 py-3 bg-red-50 border-b border-red-200 flex items-center justify-between flex-wrap gap-2">
          <div className="flex flex-col">
            <span className="font-bold text-red-800">
              📤 {expenditureViewMode === 'daily' ? `Expenditure for ${selectedDate}` : `Monthly Expenditure — ${monthLabel}`}
            </span>
            <span className="text-xs text-red-500">Rows highlighted for selected date</span>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={expenditureViewMode === 'monthly' ? 'primary' : 'secondary'}
              onClick={() => setExpenditureViewMode('monthly')}
            >
              Monthly Expenditure
            </Button>
            <Button
              size="sm"
              variant={expenditureViewMode === 'daily' ? 'primary' : 'secondary'}
              onClick={() => setExpenditureViewMode('daily')}
              disabled={!selectedDate}
            >
              Daily Expenditure {selectedDate ? `(${selectedDate})` : ''}
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Date</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-700">Expenditure</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Category</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Mode of Payment</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">UTR / Ref No.</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Spent On</th>
              </tr>
            </thead>
            <tbody>
              {displayedExpenditureEntries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-sm">
                    {expenditureViewMode === 'daily'
                      ? `No expenditure entries found for ${selectedDate}.`
                      : `No expenditure entries found for ${monthLabel}.`}
                  </td>
                </tr>
              ) : displayedExpenditureEntries.map((e) => (
                <tr key={e.id} className={`border-b border-gray-100 transition-colors ${e.date === selectedDate ? 'bg-red-50' : 'hover:bg-gray-50'}`}>
                  <td className="px-4 py-3 font-medium text-gray-800">{e.date}</td>
                  <td className="px-4 py-3 text-right font-bold text-red-700">{formatCurrency(Number(e.expenditure || 0))}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
                      {e.category || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{e.paymentMode || 'Cash'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">
                    {(e.paymentMode === 'UPI' || e.paymentMode === 'Cheque' || e.paymentMode === 'Bank Transfer')
                      ? (e.utrRef || '—') : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{e.spentOn || e.note || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


// ============================================================================
// PAGE: DAILY TRACKING (formerly Statistics)
// ============================================================================

const INCOME_SOURCES = ['Fees', 'Donation', 'Grant', 'Other'];
const PAYMENT_MODES = ['Cash', 'UPI', 'Cheque', 'Bank Transfer', 'Other'];

function StatisticsPage() {
  // ── Income form state ──────────────────────────────────────────────────────
  const [incomeDate, setIncomeDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [incomeAmount, setIncomeAmount] = useState('');
  const [incomeSource, setIncomeSource] = useState('Fees');
  const [incomeNote, setIncomeNote] = useState('');

  // Fees-specific prefill fields
  const [feeStudentHtno, setFeeStudentHtno] = useState('');
  const [feeStudentName, setFeeStudentName] = useState('');
  const [feePaymentMode, setFeePaymentMode] = useState('Cash');
  const [feeUtrRef, setFeeUtrRef] = useState('');

  // Student lookup for fee prefill
  const [allStudents, setAllStudents] = useState([]);
  const [fromDeposit, setFromDeposit] = useState(false);
  const [expDepositHtno, setExpDepositHtno] = useState('');
  const [matchedCautionRemaining, setMatchedCautionRemaining] = useState(null);

  const matchedStudentForDeposit = useMemo(() => {
    if (!fromDeposit || !expDepositHtno.trim()) return null;
    const term = expDepositHtno.trim().toUpperCase();
    return allStudents.find((s) => String(s.admissionNumber || '').toUpperCase() === term) || null;
  }, [fromDeposit, expDepositHtno, allStudents]);

  useEffect(() => {
    if (!matchedStudentForDeposit) {
      setMatchedCautionRemaining(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const feesDoc = await getDoc(doc(db, 'fees', matchedStudentForDeposit.id));
        if (cancelled) return;
        if (feesDoc.exists()) {
          const feesData = feesDoc.data();
          const remaining = typeof feesData?.cautionDepositRemaining === 'number'
            ? feesData.cautionDepositRemaining
            : (typeof feesData?.cautionDeposit === 'number' ? feesData.cautionDeposit : 0) - (typeof feesData?.cautionDepositUsed === 'number' ? feesData.cautionDepositUsed : 0);
          setMatchedCautionRemaining(remaining);
        } else {
          setMatchedCautionRemaining(0);
        }
      } catch {
        if (!cancelled) setMatchedCautionRemaining(0);
      }
    })();
    return () => { cancelled = true; };
  }, [matchedStudentForDeposit]);

  const [studentSuggestions, setStudentSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [incomeSaving, setIncomeSaving] = useState(false);
  const [incomeSaveError, setIncomeSaveError] = useState('');
  const [incomeSaveOk, setIncomeSaveOk] = useState(false);


  // ── Expenditure form state ─────────────────────────────────────────────────
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [expenditure, setExpenditure] = useState('');
  const [category, setCategory] = useState(SPEND_CATEGORIES[0]);
  const [note, setNote] = useState('');
  const [expSpentOn, setExpSpentOn] = useState('');
  const [expPaymentMode, setExpPaymentMode] = useState('Cash');
  const [expUtrRef, setExpUtrRef] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveOk, setSaveOk] = useState(false);

  // ── Shared / month data ────────────────────────────────────────────────────
  const [accounts, setAccounts] = useState(null);
  const [monthCursor, setMonthCursor] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [entries, setEntries] = useState([]);
  const [incomeEntries, setIncomeEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [feesIncome, setFeesIncome] = useState(0);
  const [feesIncomeLoading, setFeesIncomeLoading] = useState(false);
  const [feesIncomeError, setFeesIncomeError] = useState('');

  // ── Fee payments on selected income date (prefill cards) ───────────────────
  const [dateFeePmts, setDateFeePmts] = useState([]);
  const [dateFeePmtsLoading, setDateFeePmtsLoading] = useState(false);
  // Persist logged keys in localStorage so they survive navigation/remount
  const [loggedPmtKeys, setLoggedPmtKeys] = useState(() => {
    try {
      const raw = localStorage.getItem('hda_loggedFeeIncomePmts');
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  });
  const [quickLogStatus, setQuickLogStatus] = useState({});

  // Keep localStorage in sync whenever loggedPmtKeys changes
  useEffect(() => {
    try {
      localStorage.setItem('hda_loggedFeeIncomePmts', JSON.stringify([...loggedPmtKeys]));
    } catch { /* ignore storage errors */ }
  }, [loggedPmtKeys]);

  // Per-payment editable form data (keyed by pmt.key)
  // MUST be declared after dateFeePmts to avoid TDZ error in dependency array
  const [pmtFormData, setPmtFormData] = useState({});
  useEffect(() => {
    setPmtFormData((prev) => {
      const next = { ...prev };
      for (const pmt of dateFeePmts) {
        if (!next[pmt.key]) {
          next[pmt.key] = {
            amount: String(pmt.amount),
            mode: pmt.mode,
            utr: pmt.utr,
            note: `Fee payment — ${pmt.studentName}`,
          };
        }
      }
      return next;
    });
  }, [dateFeePmts]);

  const monthLabel = useMemo(() => format(monthCursor, 'MMMM yyyy'), [monthCursor]);
  const monthStartISO = useMemo(() => format(new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1), 'yyyy-MM-dd'), [monthCursor]);
  const monthEndISO = useMemo(() => format(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0), 'yyyy-MM-dd'), [monthCursor]);
  const monthStartDate = useMemo(() => new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1), [monthCursor]);
  const nextMonthStartDate = useMemo(() => new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1), [monthCursor]);

  // Load students for fee prefill
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'students'), orderBy('admissionSequence', 'asc')));
        if (!cancelled) setAllStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch {
        // silently ignore
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Fetch fee payments made on the selected income date (for prefill cards)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setDateFeePmtsLoading(true);
      try {
        const dayStart = new Date(incomeDate + 'T00:00:00');
        const dayEnd = new Date(incomeDate + 'T00:00:00');
        dayEnd.setDate(dayEnd.getDate() + 1);
        const snap = await getDocs(query(collection(db, 'fees')));
        if (cancelled) return;
        const pmts = [];
        for (const docSnap of snap.docs) {
          const data = docSnap.data();
          const history = Array.isArray(data?.paymentHistory) ? data.paymentHistory : [];
          history.forEach((p, idx) => {
            const at = p?.at?.toDate ? p.at.toDate() : null;
            if (!at || at < dayStart || at >= dayEnd) return;
            const methodMap = { cash: 'Cash', upi: 'UPI', check: 'Cheque' };
            pmts.push({
              key: `${docSnap.id}-${idx}`,
              studentId: docSnap.id,
              studentName: data.studentName || '',
              admissionNumber: data.admissionNumber || '',
              amount: Number(p.amount || 0) + Number(p.cautionDeposit || 0),
              mode: methodMap[p.method] || 'Cash',
              utr: p.transactionId || '',
              at,
            });
          });
        }
        if (!cancelled) setDateFeePmts(pmts);
      } catch {
        if (!cancelled) setDateFeePmts([]);
      } finally {
        if (!cancelled) setDateFeePmtsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [incomeDate]);

  // Save a single fee payment as income using its editable form data
  // NOTE: quickLogFeeIncome is defined here but refreshEntries is defined later.
  // We store a ref to avoid TDZ, and call the real fn via the ref.
  const quickLogFeeIncomeRef = React.useRef(null);
  const quickLogFeeIncome = useCallback(async (pmt, formData) => {
    setQuickLogStatus((s) => ({ ...s, [pmt.key]: 'saving' }));
    try {
      await addStatisticsEntry({
        date: incomeDate,
        income: Number(formData?.amount || pmt.amount),
        source: 'Fees',
        note: String(formData?.note || ''),
        isIncome: true,
        expenditure: 0,
        studentHtno: pmt.admissionNumber,
        studentName: pmt.studentName,
        paymentMode: formData?.mode || pmt.mode,
        utrRef: formData?.mode !== 'Cash' ? String(formData?.utr || '') : '',
      });
      setLoggedPmtKeys((prev) => new Set([...prev, pmt.key]));
      setQuickLogStatus((s) => ({ ...s, [pmt.key]: 'done' }));
      if (quickLogFeeIncomeRef.current) await quickLogFeeIncomeRef.current();
    } catch {
      setQuickLogStatus((s) => ({ ...s, [pmt.key]: 'error' }));
    }
  }, [incomeDate]); // refreshEntries assigned to ref below after its declaration

  // Student search suggestions
  useEffect(() => {
    const term = feeStudentHtno.trim().toUpperCase();
    if (!term || term.length < 2) {
      setStudentSuggestions([]);
      return;
    }
    const matches = allStudents.filter((s) =>
      String(s.admissionNumber || '').toUpperCase().includes(term) ||
      String(s.name || '').toUpperCase().includes(term)
    ).slice(0, 6);
    setStudentSuggestions(matches);
  }, [feeStudentHtno, allStudents]);

  // Prefill income form from latest fee payment when a student is selected
  const selectStudentForFee = useCallback(async (student) => {
    setFeeStudentHtno(student.admissionNumber || '');
    setFeeStudentName(student.name || '');
    setShowSuggestions(false);
    try {
      const feeSnap = await getDocs(query(collection(db, 'fees'), where('studentId', '==', student.id)));
      if (!feeSnap.empty) {
        const feeData = feeSnap.docs[0].data();
        const history = Array.isArray(feeData?.paymentHistory) ? feeData.paymentHistory : [];
        if (history.length > 0) {
          const latest = history[history.length - 1];
          const methodMap = { cash: 'Cash', upi: 'UPI', check: 'Cheque' };
          setFeePaymentMode(methodMap[latest.method] || 'Cash');
          setFeeUtrRef(latest.transactionId || '');
          const totalLatest = Number(latest.amount || 0) + Number(latest.cautionDeposit || 0);
          if (totalLatest > 0) setIncomeAmount(String(totalLatest));
        }
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'accounts', 'summary'),
      (snap) => setAccounts(snap.exists() ? snap.data() : null),
      () => setAccounts(null)
    );
    return () => unsub();
  }, []);

  const collectedFees = typeof accounts?.totalCollected === 'number' ? accounts.totalCollected : 0;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError('');
      try {
        const q = query(
          collection(db, 'statistics'),
          where('date', '>=', monthStartISO),
          where('date', '<=', monthEndISO),
          orderBy('date', 'asc')
        );
        const snap = await getDocs(q);
        if (cancelled) return;
        const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setEntries(all.filter((e) => !e.isIncome));
        setIncomeEntries(all.filter((e) => e.isIncome));
      } catch {
        if (!cancelled) {
          setEntries([]);
          setIncomeEntries([]);
          setLoadError('Failed to load statistics for this month (index may be required).');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [monthStartISO, monthEndISO]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setFeesIncomeLoading(true);
      setFeesIncomeError('');
      try {
        const snap = await getDocs(query(collection(db, 'fees')));
        if (cancelled) return;
        let sum = 0;
        for (const docSnap of snap.docs) {
          const data = docSnap.data();
          const history = Array.isArray(data?.paymentHistory) ? data.paymentHistory : [];
          for (const p of history) {
            const amount = Number(p?.amount || 0) + Number(p?.cautionDeposit || 0);
            if (!Number.isFinite(amount) || amount <= 0) continue;
            const at = p?.at;
            const atDate = at?.toDate ? at.toDate() : null;
            if (!atDate || !(atDate instanceof Date) || Number.isNaN(atDate.getTime())) continue;
            if (atDate >= monthStartDate && atDate < nextMonthStartDate) sum += amount;
          }
        }
        setFeesIncome(sum);
      } catch {
        if (!cancelled) { setFeesIncome(0); setFeesIncomeError('Failed to load fee income for this month.'); }
      } finally {
        if (!cancelled) setFeesIncomeLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [monthStartDate, nextMonthStartDate]);

  const refreshEntries = useCallback(async () => {
    const q = query(
      collection(db, 'statistics'),
      where('date', '>=', monthStartISO),
      where('date', '<=', monthEndISO),
      orderBy('date', 'asc')
    );
    const snap = await getDocs(q);
    const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    setEntries(all.filter((e) => !e.isIncome));
    setIncomeEntries(all.filter((e) => e.isIncome));
  }, [monthStartISO, monthEndISO]);

  // Wire refreshEntries into the ref so quickLogFeeIncome can call it
  React.useEffect(() => { quickLogFeeIncomeRef.current = refreshEntries; }, [refreshEntries]);

  const monthTotals = useMemo(() => {
    let totalExpenditure = 0;
    for (const e of entries) totalExpenditure += Number(e.expenditure || 0);
    let totalManualIncome = 0;
    for (const e of incomeEntries) totalManualIncome += Number(e.income || 0);
    // Non-fee income = manual entries where source !== 'Fees'
    let totalOtherIncome = 0;
    for (const e of incomeEntries) {
      if (e.source !== 'Fees') totalOtherIncome += Number(e.income || 0);
    }
    return { totalExpenditure, totalManualIncome, totalOtherIncome };
  }, [entries, incomeEntries]);

  // totalIncome = fees collected this month (from fees collection) + non-fee manual income
  // This avoids double-counting: fee payments appear in feesIncome; other income in totalOtherIncome
  const totalIncome = feesIncome + monthTotals.totalOtherIncome;
  const netBalance = useMemo(() => Math.max(0, totalIncome - monthTotals.totalExpenditure), [totalIncome, monthTotals.totalExpenditure]);

  const categorySpend = useMemo(() => {
    const byCat = new Map();
    for (const e of entries) {
      const cat = String(e.category || 'Other');
      byCat.set(cat, (byCat.get(cat) || 0) + Number(e.expenditure || 0));
    }
    return Array.from(byCat.entries()).map(([c, v]) => ({ category: c, spend: v })).sort((a, b) => b.spend - a.spend);
  }, [entries]);

  const dailyTrend = useMemo(() => {
    const byDate = new Map();
    for (const e of entries) {
      const d = String(e.date || '');
      if (!d) continue;
      byDate.set(d, (byDate.get(d) || 0) + Number(e.expenditure || 0));
    }
    return Array.from(byDate.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([d, v]) => ({ date: d.slice(8), expenditure: v }));
  }, [entries]);

  // Save income entry
  const onSaveIncome = async () => {
    if (!incomeAmount || Number(incomeAmount) <= 0) {
      setIncomeSaveError('Please enter a valid income amount.');
      return;
    }
    setIncomeSaving(true);
    setIncomeSaveOk(false);
    setIncomeSaveError('');
    try {
      const payload = {
        date: String(incomeDate),
        income: Number(incomeAmount),
        source: incomeSource,
        note: incomeNote,
        isIncome: true,
        expenditure: 0,
        paymentMode: feePaymentMode,
        utrRef: feePaymentMode !== 'Cash' ? feeUtrRef : '',
        ...(incomeSource === 'Fees' ? {
          studentHtno: feeStudentHtno,
          studentName: feeStudentName,
        } : {}),
      };
      await addStatisticsEntry(payload);
      setIncomeAmount('');
      setIncomeNote('');
      setFeeStudentHtno('');
      setFeeStudentName('');
      setFeeUtrRef('');
      setFeePaymentMode('Cash');
      setIncomeSaveOk(true);
      await refreshEntries();
    } catch {
      setIncomeSaveError('Failed to save income entry.');
    } finally {
      setIncomeSaving(false);
    }
  };

  // Save expenditure entry
  const onSave = async () => {
    if (!expenditure || Number(expenditure) <= 0) {
      setSaveError('Please enter a valid expenditure amount.');
      return;
    }
    if (fromDeposit) {
      if (!expDepositHtno.trim()) {
        setSaveError('Please enter a student HTNO.');
        return;
      }
      if (!matchedStudentForDeposit) {
        setSaveError('Entered HTNO does not match any existing student.');
        return;
      }
    }
    setSaving(true);
    setSaveOk(false);
    setSaveError('');
    try {
      await addStatisticsEntry({
        date: String(date),
        expenditure: Number(expenditure || 0),
        income: 0,
        isIncome: false,
        category,
        note: String(note || ''),
        spentOn: String(expSpentOn || ''),
        paymentMode: expPaymentMode,
        utrRef: expPaymentMode !== 'Cash' ? String(expUtrRef || '') : '',
        fromDeposit: fromDeposit,
        studentId: fromDeposit ? matchedStudentForDeposit.id : '',
        studentHtno: fromDeposit ? matchedStudentForDeposit.admissionNumber : '',
        studentName: fromDeposit ? matchedStudentForDeposit.name : '',
      });
      setExpenditure('');
      setNote('');
      setExpSpentOn('');
      setExpUtrRef('');
      setExpPaymentMode('Cash');
      setFromDeposit(false);
      setExpDepositHtno('');
      setSaveOk(true);
      await refreshEntries();
    } catch (err) {
      const msg = typeof err?.message === 'string' ? err.message : 'Failed to save entry.';
      setSaveError(msg.replace(/^FirebaseError:\s*/i, '').trim());
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">

      {/* ── Month navigation ── */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Daily Tracking</h3>
          <p className="text-sm text-gray-500">Track income &amp; expenditure day-by-day</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setMonthCursor((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}>Prev</Button>
          <Button variant="secondary" onClick={() => setMonthCursor((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}>Next</Button>
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <SummaryCard title={`Month Income (${monthLabel})`} value={formatCurrency(Number(totalIncome || 0))} color="primary" icon="📈" />
        <SummaryCard title={`Month Spend (${monthLabel})`} value={formatCurrency(monthTotals.totalExpenditure)} color="alert" icon="📉" />
        <SummaryCard title="Net Balance (Income - Spend)" value={formatCurrency(netBalance)} color="success" icon="💰" />
      </div>

      {feesIncomeLoading ? <div className="text-sm text-gray-600">Loading fee income…</div> : null}
      {feesIncomeError ? <Alert type="warning" title="Fee income" message={feesIncomeError} /> : null}

      {/* ══════════════════════════════════════════════════════════════
          SECTION 1 — DAILY INCOME ENTRY
      ══════════════════════════════════════════════════════════════ */}
      <Card
        title="📥 Daily Income Entry"
        subtitle="Fee payments auto-populate below. Review and save each one."
      >
        {/* Date picker */}
        <div className="mb-6 w-56">
          <Input
            label="Select Date"
            type="date"
            value={incomeDate}
            onChange={(e) => setIncomeDate(e.target.value)}
          />
        </div>

        {/* ── FEE PAYMENT PREFILLED FORMS ── */}
        {dateFeePmtsLoading && (
          <div className="text-sm text-gray-500 mb-4">⏳ Loading fee payments for {incomeDate}…</div>
        )}

        {!dateFeePmtsLoading && dateFeePmts.length === 0 && (
          <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-500">
            No fee payments found on <strong>{incomeDate}</strong>. Use the manual form below.
          </div>
        )}

        {dateFeePmts.length > 0 && (
          <div className="space-y-5 mb-6">
            <div className="text-sm font-bold text-gray-700">
              🎓 Fee Payments on {incomeDate}
              <span className="ml-2 text-xs font-normal text-gray-500">({dateFeePmts.length} payment{dateFeePmts.length > 1 ? 's' : ''} — all fields pre-filled)</span>
            </div>

            {dateFeePmts.map((pmt, idx) => {
              const fd = pmtFormData[pmt.key] || { amount: String(pmt.amount), mode: pmt.mode, utr: pmt.utr, note: '' };
              const status = quickLogStatus[pmt.key];
              const logged = loggedPmtKeys.has(pmt.key) || status === 'done';

              const updateFd = (field, val) =>
                setPmtFormData((prev) => ({
                  ...prev,
                  [pmt.key]: { ...prev[pmt.key], [field]: val },
                }));

              return (
                <div
                  key={pmt.key}
                  className={`rounded-2xl border-2 p-5 transition-all ${
                    logged ? 'border-green-300 bg-green-50' : 'border-blue-200 bg-white shadow-sm'
                  }`}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs bg-blue-600 text-white font-bold px-2 py-0.5 rounded-full">#{idx + 1}</span>
                      <span className="text-sm font-semibold text-gray-800">🎓 Fee Income Entry</span>
                    </div>
                    {logged && (
                      <span className="text-xs text-green-700 font-semibold bg-green-100 px-3 py-1 rounded-full">✅ Saved to Income</span>
                    )}
                    {status === 'error' && (
                      <span className="text-xs text-red-600 font-semibold">❌ Failed — retry</span>
                    )}
                  </div>

                  {/* Row 1: Amount + Source (locked) */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <Input
                      label="Income Amount (₹)"
                      type="number"
                      value={fd.amount}
                      onChange={(e) => updateFd('amount', e.target.value)}
                    />
                    <Input
                      label="Income Source"
                      value="Fees"
                      readOnly
                      className="bg-blue-50 text-blue-800 font-semibold cursor-not-allowed"
                    />
                  </div>

                  {/* Row 2: HTNO + Name (prefilled, read-only) */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Student HTNO / Admission No.</label>
                      <div className="px-3 py-2.5 rounded-lg border border-gray-200 bg-blue-50 text-blue-800 font-bold text-sm">
                        {pmt.admissionNumber || '—'}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Student Name</label>
                      <div className="px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-gray-800 font-semibold text-sm">
                        {pmt.studentName || '—'}
                      </div>
                    </div>
                  </div>

                  {/* Row 3: Mode + UTR */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <Select
                      label="Mode of Payment"
                      value={fd.mode}
                      onChange={(e) => updateFd('mode', e.target.value)}
                      options={PAYMENT_MODES.map((m) => ({ value: m, label: m }))}
                    />
                    {fd.mode !== 'Cash' && (
                      <Input
                        label="Reference / UTR Number"
                        placeholder="UTR / transaction ref."
                        value={fd.utr}
                        onChange={(e) => updateFd('utr', e.target.value)}
                      />
                    )}
                  </div>

                  {/* Row 4: Notes */}
                  <div className="mb-4">
                    <Textarea
                      label="Notes"
                      rows={1}
                      value={fd.note}
                      onChange={(e) => updateFd('note', e.target.value)}
                    />
                  </div>

                  {/* Save button */}
                  {!logged && (
                    <Button
                      onClick={() => quickLogFeeIncome(pmt, fd)}
                      disabled={status === 'saving'}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      {status === 'saving' ? 'Saving…' : '💾 Save Income Entry'}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── MANUAL INCOME ── */}
        <details className="group">
          <summary className="cursor-pointer text-sm font-semibold text-blue-600 hover:text-blue-800 list-none flex items-center gap-2 select-none">
            <span className="text-base group-open:rotate-90 transition-transform inline-block">▶</span>
            + Add Manual Income (Fees, Donation, Grant, etc.)
          </summary>
          <div className="mt-4 pt-4 border-t border-gray-100 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input
                label="Income Amount (₹)"
                type="number"
                placeholder="Enter amount"
                value={incomeAmount}
                onChange={(e) => setIncomeAmount(e.target.value)}
              />
              <Select
                label="Income Source"
                value={incomeSource}
                onChange={(e) => setIncomeSource(e.target.value)}
                options={INCOME_SOURCES.map((s) => ({ value: s, label: s }))}
              />
              <Select
                label="Payment Mode"
                value={feePaymentMode}
                onChange={(e) => {
                  setFeePaymentMode(e.target.value);
                  setFeeUtrRef('');
                }}
                options={PAYMENT_MODES.map((m) => ({ value: m, label: m }))}
              />
            </div>

            {/* Fees-specific student lookup */}
            {incomeSource === 'Fees' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative">
                <div className="relative">
                  <Input
                    label="Search Student (HTNO or Name)"
                    placeholder="Type to search..."
                    value={feeStudentHtno}
                    onChange={(e) => {
                      setFeeStudentHtno(e.target.value);
                      setShowSuggestions(true);
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  />
                  {showSuggestions && studentSuggestions.length > 0 && (
                    <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto divide-y divide-gray-100">
                      {studentSuggestions.map((s) => (
                        <div
                          key={s.id}
                          className="px-4 py-2 hover:bg-blue-50 cursor-pointer text-sm"
                          onMouseDown={() => {
                            setFeeStudentHtno(s.admissionNumber || '');
                            setFeeStudentName(s.name || '');
                            setShowSuggestions(false);
                          }}
                        >
                          <span className="font-bold text-blue-700">{s.admissionNumber}</span> — {s.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <Input
                  label="Student Name"
                  placeholder="Student name"
                  value={feeStudentName}
                  onChange={(e) => setFeeStudentName(e.target.value)}
                />
              </div>
            )}

            {feePaymentMode !== 'Cash' && (
              <div className="w-full md:w-1/2">
                <Input
                  label="Reference / UTR Number"
                  placeholder="UTR / Transaction reference"
                  value={feeUtrRef}
                  onChange={(e) => setFeeUtrRef(e.target.value)}
                />
              </div>
            )}

            <Textarea
              label="Notes / Remarks / Reason"
              rows={2}
              placeholder="Reason for payment or extra details…"
              value={incomeNote}
              onChange={(e) => setIncomeNote(e.target.value)}
            />
            <div className="flex items-center gap-4">
              <Button
                className="bg-green-600 hover:bg-green-700"
                onClick={onSaveIncome}
                disabled={incomeSaving}
              >
                {incomeSaving ? 'Saving…' : '💾 Save Income Entry'}
              </Button>
              {incomeSaveOk && <span className="text-green-600 text-sm font-medium">✅ Saved!</span>}
            </div>
            {incomeSaveError && <Alert type="error" title="Error" message={incomeSaveError} />}
          </div>
        </details>
      </Card>

      {/* ══════════════════════════════════════════════════════════════
          SECTION 2 — DAILY EXPENDITURE ENTRY (existing form)
      ══════════════════════════════════════════════════════════════ */}
      <Card
        title="📤 Add Daily Expenditure"
        subtitle="Record spending — salary, maintenance, utilities, etc."
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Input label="Expenditure (₹)" type="number" placeholder="Enter amount" value={expenditure} onChange={(e) => setExpenditure(e.target.value)} />
          <Select
            label="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            options={SPEND_CATEGORIES.map((c) => ({ value: c, label: c }))}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-5">
          <Select
            label="Payment Mode"
            value={expPaymentMode}
            onChange={(e) => { setExpPaymentMode(e.target.value); setExpUtrRef(''); }}
            options={PAYMENT_MODES.map((m) => ({ value: m, label: m }))}
          />
          {expPaymentMode !== 'Cash' ? (
            <Input
              label="UTR / Reference Number"
              placeholder="Enter UTR or transaction reference"
              value={expUtrRef}
              onChange={(e) => setExpUtrRef(e.target.value)}
            />
          ) : (
            <div className="hidden md:block"></div>
          )}
          <Select
            label="From Caution Deposit?"
            value={fromDeposit ? 'yes' : 'no'}
            onChange={(e) => {
              const yes = e.target.value === 'yes';
              setFromDeposit(yes);
              if (!yes) {
                setExpDepositHtno('');
                setMatchedCautionRemaining(null);
              }
            }}
            options={[
              { value: 'no', label: 'No' },
              { value: 'yes', label: 'Yes' },
            ]}
          />
        </div>

        {fromDeposit && (
          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-5 p-4 bg-blue-50/50 rounded-xl border border-blue-100">
            <div className="relative">
              <Input
                label="Student HTNO"
                placeholder="Enter student HTNO (e.g. HDA0001)"
                value={expDepositHtno}
                onChange={(e) => setExpDepositHtno(e.target.value)}
              />
              {expDepositHtno.trim() && (
                <div className="mt-1 text-xs">
                  {matchedStudentForDeposit ? (
                    <span className="text-green-600 font-semibold">
                      ✅ Matched: {matchedStudentForDeposit.name}
                    </span>
                  ) : (
                    <span className="text-red-650 font-semibold">
                      ❌ No matching student found
                    </span>
                  )}
                </div>
              )}
            </div>
            {matchedStudentForDeposit && matchedCautionRemaining !== null && (
              <div className="flex flex-col justify-center bg-white border border-blue-200 rounded-lg p-3 text-sm text-blue-900 shadow-2xs">
                <div>Student Name: <span className="font-semibold text-gray-900">{matchedStudentForDeposit.name}</span></div>
                <div className="mt-1">Available Caution Deposit: <span className="font-bold text-blue-700">{formatCurrency(matchedCautionRemaining)}</span></div>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5">
          <Input
            label="Reason / Spent On"
            placeholder="What was this spent on?"
            value={expSpentOn}
            onChange={(e) => setExpSpentOn(e.target.value)}
          />
          <Textarea
            label="Additional Notes"
            rows={2}
            placeholder="Any extra details…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <div className="mt-5 flex items-center gap-4">
          <Button onClick={onSave} disabled={saving}>
            {saving ? 'Saving…' : '💾 Save Expenditure'}
          </Button>
          {saveOk && <span className="text-green-600 text-sm font-medium">✅ Expenditure saved!</span>}
        </div>
        {saveError && <div className="mt-4"><Alert type="error" title="Error" message={saveError} /></div>}
      </Card>



      {/* ── Income Entries Table ── */}
      <Card title={`Income Entries (${monthLabel})`} subtitle={`${monthStartISO} to ${monthEndISO}`}>
        {loading ? <div className="text-sm text-gray-600 px-2 py-3">Loading…</div> : null}
        {loadError ? <div className="mb-4"><Alert type="error" title="Error" message={loadError} /></div> : null}
        <Table
          columns={[
            { key: 'date', label: 'Date' },
            { key: 'income', label: 'Income (₹)', render: (v) => formatCurrency(Number(v || 0)) },
            { key: 'source', label: 'Source' },
            { key: 'studentHtno', label: 'HTNO', render: (v) => v || '—' },
            { key: 'studentName', label: 'Student', render: (v) => v || '—' },
            { key: 'paymentMode', label: 'Mode', render: (v) => v || '—' },
            { key: 'utrRef', label: 'UTR/Ref', render: (v) => v || '—' },
            { key: 'note', label: 'Notes', render: (v) => v || '—' },
          ]}
          data={incomeEntries}
        />
      </Card>

      {/* ── Expenditure Entries Table ── */}
      <Card title={`Expenditure Entries (${monthLabel})`} subtitle={`${monthStartISO} to ${monthEndISO}`}>
        {loading ? <div className="text-sm text-gray-600 px-2 py-3">Loading…</div> : null}
        <Table
          columns={[
            { key: 'date', label: 'Date' },
            { key: 'expenditure', label: 'Amount', render: (v) => formatCurrency(Number(v || 0)) },
            { key: 'category', label: 'Category', render: (v) => v || '—' },
            { key: 'paymentMode', label: 'Payment Mode', render: (v) => v || 'Cash' },
            { key: 'utrRef', label: 'UTR / Ref', render: (v) => v || '—' },
            { key: 'spentOn', label: 'Reason / Spent On', render: (v) => v || '—' },
            { key: 'note', label: 'Notes', render: (v) => v || '—' },
          ]}
          data={entries}
        />
      </Card>
    </div>
  );
}
