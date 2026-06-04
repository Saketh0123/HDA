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
      { id: 'statistics', icon: TrendingUp, label: 'Statistics' },
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
  const pendingAmount = Math.max(0, totalFees - paidAmount);

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
              <span className="text-gray-500">Paid Amount</span>
              <span className="font-bold text-green-600">{formatCurrency(paidAmount)}</span>
            </div>
            <div className="flex justify-between border-b border-gray-100 pb-2">
              <span className="text-gray-500">Pending Amount</span>
              <span className="font-bold text-red-600">{formatCurrency(pendingAmount)}</span>
            </div>
          </div>
        </div>
      </div>
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
  const [subject, setSubject] = useState('');

  const [currentPage, setCurrentPage] = useState(1);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentsError, setStudentsError] = useState('');
  const [allStudents, setAllStudents] = useState([]);

  const [marksById, setMarksById] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveOk, setSaveOk] = useState(false);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, batchFilter, yearFilter, streamFilter, subject]);

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

  const totalCount = subject ? filteredStudents.length : 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPageSafe = Math.min(Math.max(1, currentPage), totalPages);

  const students = useMemo(() => {
    if (!subject) return [];
    const start = (currentPageSafe - 1) * PAGE_SIZE;
    return filteredStudents.slice(start, start + PAGE_SIZE);
  }, [filteredStudents, currentPageSafe, subject]);

  useEffect(() => {
    if (!subject) return;
    setMarksById((prev) => {
      const next = { ...prev };
      for (const s of students) {
        if (Object.prototype.hasOwnProperty.call(next, s.id)) continue;
        const marks = Array.isArray(s.marks) ? s.marks : [];
        const existing = marks.find((m) => String(m?.subject || '').toLowerCase() === String(subject).toLowerCase());
        next[s.id] = existing ? String(existing.score ?? '') : '';
      }
      return next;
    });
  }, [students, subject]);

  const onUpload = async () => {
    if (!subject) {
      setSaveError('Select a subject first.');
      return;
    }

    setSaving(true);
    setSaveOk(false);
    setSaveError('');
    try {
      for (const s of students) {
        const raw = marksById[s.id];
        if (raw === '' || raw === null || typeof raw === 'undefined') continue;
        const score = Number(raw);
        if (!Number.isFinite(score)) continue;
        await updateStudentMarks({ studentId: s.id, subject, score, maxScore: 100 });
      }
      setSaveOk(true);
    } catch {
      setSaveError('Failed to upload results.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card
        title="Results"
        subtitle="Select year + stream + subject, then enter marks"
        action={
          <Button onClick={onUpload} disabled={saving || !subject}>
            {saving ? 'Uploading…' : 'Upload Results'}
          </Button>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
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
            options={[{ value: '', label: 'Select Subject' }, ...SUBJECT_OPTIONS.map((s) => ({ value: s, label: s }))]}
          />
        </div>

        {saveError ? <div className="mt-4"><Alert type="error" title="Error" message={saveError} /></div> : null}
        {saveOk ? <div className="mt-4"><Alert type="success" title="Uploaded" message="Marks uploaded." /></div> : null}
        {studentsError ? <div className="mt-4"><Alert type="error" title="Error" message={studentsError} /></div> : null}

        {!subject ? (
          <div className="mt-6 text-sm text-gray-600">Select a subject to load the student list.</div>
        ) : (
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
                  key: 'marksEntry',
                  label: 'Marks',
                  render: (v, row) => (
                    <Input
                      type="number"
                      placeholder="0"
                      className="max-w-[140px]"
                      value={marksById[row.id] ?? ''}
                      onChange={(e) => setMarksById((prev) => ({ ...prev, [row.id]: e.target.value }))}
                    />
                  ),
                },
              ]}
              data={students}
            />

            <Pagination
              currentPage={currentPageSafe}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          </div>
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
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveOk, setSaveOk] = useState(false);

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
        await addStudentRemark({ studentId: s.id, type: backendType, message: finalMessage });
      }

      setSaveOk(true);
      setMessageById({});
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
            ]}
            data={students}
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
  const parsedTotalFees = Number(detailsTotalFees);
  const selectedTotal =
    detailsTotalFees !== '' && Number.isFinite(parsedTotalFees)
      ? parsedTotalFees
      : typeof selectedFees?.totalFees === 'number'
        ? selectedFees.totalFees
        : 0;
  const selectedPending = Math.max(0, selectedTotal - selectedPaid);

  const pay = Number(payAmount) || 0;
  const nextPaid = selectedPaid + (pay > 0 ? pay : 0);
  const nextPending = Math.max(0, selectedTotal - nextPaid);

  const payValidationError = useMemo(() => {
    if (!selectedStudentId) return 'Select a student to pay.';
    if (!Number.isFinite(selectedTotal) || selectedTotal < 0) return 'Enter a valid total fee amount.';
    if (!Number.isFinite(pay) || pay <= 0) return 'Enter a valid payment amount.';
    if (nextPaid > selectedTotal) return 'Payment exceeds total fees.';
    if (payMethod !== 'cash' && !String(transactionId || '').trim()) return 'Reference ID is required for UPI/Cheque.';
    return '';
  }, [selectedStudentId, selectedTotal, pay, nextPaid, payMethod, transactionId]);

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
        paymentEntry: {
          amount: Number(pay),
          method: payMethod,
          transactionId: payMethod === 'cash' ? null : String(transactionId || '').trim(),
        },
      });

      setPayAmount('');
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
              <Input
                label="Total Fees"
                type="number"
                placeholder="0"
                value={detailsTotalFees}
                onChange={(e) => setDetailsTotalFees(e.target.value)}
              />
              <Input label="Paid" value={formatCurrency(selectedPaid)} readOnly />
              <Input label="Pending" value={formatCurrency(selectedPending)} readOnly />
              <Input label="Next Pending (after payment)" value={formatCurrency(nextPending)} readOnly />
            </div>

            <div className="mt-6 pt-6 border-t border-gray-100 space-y-4">
              <div className="text-sm font-semibold text-gray-900">Payment</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Amount"
                  type="number"
                  placeholder="0"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
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
                Amount in words: <span className="font-semibold">{amountToWordsINR(pay)}</span>
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
                      <div className="text-sm font-semibold text-gray-900">{formatCurrency(p.amount)}</div>
                      <div className="text-xs text-gray-500">{p.at?.toDate ? format(p.at.toDate(), 'dd MMM, HH:mm') : '—'}</div>
                    </div>
                    <div className="mt-1 text-xs text-gray-600">Method: {String(p.method || 'unknown').toUpperCase()}</div>
                    {p.transactionId ? <div className="text-xs text-gray-600">Txn: {String(p.transactionId)}</div> : null}
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
              { key: 'totalFees', label: 'Total', render: (v) => formatCurrency(Number(v || 0)) },
              { key: 'paidAmount', label: 'Paid', render: (v) => formatCurrency(Number(v || 0)) },
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

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'accounts', 'summary'),
      (snap) => setAccounts(snap.exists() ? snap.data() : null),
      () => setAccounts(null)
    );
    return () => unsub();
  }, []);

  const totalFees = typeof accounts?.totalBudget === 'number' ? accounts.totalBudget : 0;
  const collectedFees = typeof accounts?.totalCollected === 'number' ? accounts.totalCollected : 0;
  const recovery = Math.max(0, totalFees - collectedFees);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <SummaryCard title="Total Fees" value={formatCurrency(totalFees)} color="primary" icon="💳" />
        <SummaryCard title="Collected" value={formatCurrency(collectedFees)} color="success" icon="✓" />
        <SummaryCard title="Recovery" value={formatCurrency(recovery)} color="alert" icon="⚠️" />
      </div>
    </div>
  );
}

// ============================================================================
// PAGE: STATISTICS
// ============================================================================

function StatisticsPage() {
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [expenditure, setExpenditure] = useState('');
  const [category, setCategory] = useState(SPEND_CATEGORIES[0]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveOk, setSaveOk] = useState(false);

  const [accounts, setAccounts] = useState(null);

  const [monthCursor, setMonthCursor] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [feesIncome, setFeesIncome] = useState(0);
  const [feesIncomeLoading, setFeesIncomeLoading] = useState(false);
  const [feesIncomeError, setFeesIncomeError] = useState('');

  const monthLabel = useMemo(() => format(monthCursor, 'MMMM yyyy'), [monthCursor]);

  const monthStartISO = useMemo(() => format(new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1), 'yyyy-MM-dd'), [monthCursor]);
  const monthEndISO = useMemo(() => format(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0), 'yyyy-MM-dd'), [monthCursor]);

  const monthStartDate = useMemo(() => new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1), [monthCursor]);
  const nextMonthStartDate = useMemo(() => new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1), [monthCursor]);

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
        setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch {
        if (!cancelled) {
          setEntries([]);
          setLoadError('Failed to load statistics for this month (index may be required).');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
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
            const amount = Number(p?.amount || 0);
            if (!Number.isFinite(amount) || amount <= 0) continue;
            const at = p?.at;
            const atDate = at?.toDate ? at.toDate() : null;
            if (!atDate || !(atDate instanceof Date) || Number.isNaN(atDate.getTime())) continue;
            if (atDate >= monthStartDate && atDate < nextMonthStartDate) {
              sum += amount;
            }
          }
        }

        setFeesIncome(sum);
      } catch {
        if (!cancelled) {
          setFeesIncome(0);
          setFeesIncomeError('Failed to load fee income for this month.');
        }
      } finally {
        if (!cancelled) setFeesIncomeLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [monthStartDate, nextMonthStartDate]);

  const monthTotals = useMemo(() => {
    let totalExpenditure = 0;
    for (const e of entries) {
      totalExpenditure += Number(e.expenditure || 0);
    }
    return { totalExpenditure };
  }, [entries]);

  const netBalance = useMemo(() => Math.max(0, collectedFees - monthTotals.totalExpenditure), [collectedFees, monthTotals.totalExpenditure]);

  const categorySpend = useMemo(() => {
    const byCat = new Map();
    for (const e of entries) {
      const cat = String(e.category || 'Other');
      const exp = Number(e.expenditure || 0);
      byCat.set(cat, (byCat.get(cat) || 0) + exp);
    }
    return Array.from(byCat.entries())
      .map(([c, v]) => ({ category: c, spend: v }))
      .sort((a, b) => b.spend - a.spend);
  }, [entries]);

  const dailyTrend = useMemo(() => {
    const byDate = new Map();
    for (const e of entries) {
      const d = String(e.date || '');
      if (!d) continue;
      byDate.set(d, (byDate.get(d) || 0) + Number(e.expenditure || 0));
    }
    return Array.from(byDate.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([d, v]) => ({ date: d.slice(8), expenditure: v }));
  }, [entries]);

  const onSave = async () => {
    setSaving(true);
    setSaveOk(false);
    setSaveError('');
    try {
      await addStatisticsEntry({
        date: String(date),
        expenditure: Number(expenditure || 0),
        category,
        note: String(note || ''),
      });

      setExpenditure('');
      setNote('');
      setSaveOk(true);

      // Refresh current month view if the saved date lands inside it.
      const q = query(
        collection(db, 'statistics'),
        where('date', '>=', monthStartISO),
        where('date', '<=', monthEndISO),
        orderBy('date', 'asc')
      );
      const snap = await getDocs(q);
      setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch {
      setSaveError('Failed to save statistics entry.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <Card
        title="Daily Tracking"
        subtitle="Add daily spending"
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setMonthCursor((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}>Prev</Button>
            <Button variant="secondary" onClick={() => setMonthCursor((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}>Next</Button>
          </div>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Input label="Expenditure" type="number" placeholder="Enter amount" value={expenditure} onChange={(e) => setExpenditure(e.target.value)} />
          <Select
            label="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            options={SPEND_CATEGORIES.map((c) => ({ value: c, label: c }))}
          />
          <div className="md:col-span-2">
            <Textarea
              label="Spent on"
              rows={2}
              placeholder="Description"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <Button className="w-full" onClick={onSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>

        {saveError ? <div className="mt-4"><Alert type="error" title="Error" message={saveError} /></div> : null}
        {saveOk ? <div className="mt-4"><Alert type="success" title="Saved" message="Entry added." /></div> : null}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <SummaryCard title={`Month Income (${monthLabel})`} value={formatCurrency(Number(feesIncome || 0))} color="primary" icon="📈" />
        <SummaryCard title={`Month Spend (${monthLabel})`} value={formatCurrency(monthTotals.totalExpenditure)} color="alert" icon="📉" />
        <SummaryCard title="Net Balance (Collected - Spend)" value={formatCurrency(netBalance)} color="success" icon="💰" />
      </div>

      {feesIncomeLoading ? <div className="text-sm text-gray-600">Loading fee income…</div> : null}
      {feesIncomeError ? <Alert type="warning" title="Fee income" message={feesIncomeError} /> : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Spend by Category" subtitle={monthLabel}>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categorySpend} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="category" tick={{ fontSize: 12 }} interval={0} angle={-10} height={60} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => formatCurrency(Number(v || 0))} />
                <Legend />
                <Bar dataKey="spend" name="Spend" fill="#2563EB" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Daily Spend Trend" subtitle={monthLabel}>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyTrend} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => formatCurrency(Number(v || 0))} />
                <Legend />
                <Line type="monotone" dataKey="expenditure" name="Expenditure" stroke="#EF4444" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card title={`Entries (${monthLabel})`} subtitle={`${monthStartISO} to ${monthEndISO}`}>
        {loading ? <div className="text-sm text-gray-600 px-2 py-3">Loading…</div> : null}
        {loadError ? <div className="mb-4"><Alert type="error" title="Error" message={loadError} /></div> : null}
        <Table
          columns={[
            { key: 'date', label: 'Date' },
            { key: 'expenditure', label: 'Expenditure', render: (v) => formatCurrency(Number(v || 0)) },
            { key: 'category', label: 'Category' },
            { key: 'note', label: 'Spent on' },
          ]}
          data={entries}
        />
      </Card>
    </div>
  );
}
