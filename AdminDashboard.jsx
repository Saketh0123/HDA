import React, { useState } from 'react';
import { Menu, LogOut, Home, Users, BookOpen, MessageSquare, DollarSign, TrendingUp, Settings, ArrowLeft, Camera } from 'lucide-react';

// Main Admin Dashboard Component
export default function AdminDashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div className="flex h-screen bg-gray-50">
      {/* SIDEBAR */}
      <aside className={`${sidebarOpen ? 'w-64' : 'w-20'} bg-white border-r border-gray-200 transition-all duration-300 flex flex-col`}>
        {/* Logo */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            {sidebarOpen && <h1 className="text-xl font-bold text-blue-600">EduHub</h1>}
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 hover:bg-gray-100 rounded-lg">
              <Menu size={20} />
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2">
          {[
            { id: 'dashboard', icon: Home, label: 'Dashboard' },
            { id: 'students', icon: Users, label: 'Students' },
            { id: 'results', icon: BookOpen, label: 'Results' },
            { id: 'remarks', icon: MessageSquare, label: 'Remarks' },
            { id: 'fees', icon: DollarSign, label: 'Fees' },
            { id: 'accounts', icon: DollarSign, label: 'Accounts' },
            { id: 'statistics', icon: TrendingUp, label: 'Statistics' },
          ].map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                activeTab === item.id
                  ? 'bg-blue-50 text-blue-600 font-medium'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <item.icon size={20} />
              {sidebarOpen && <span>{item.label}</span>}
            </button>
          ))}
        </nav>

        {/* Logout */}
        <button className="m-4 flex items-center gap-3 px-4 py-3 text-red-600 hover:bg-red-50 rounded-lg w-full">
          <LogOut size={20} />
          {sidebarOpen && <span>Logout</span>}
        </button>
      </aside>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* TOP BAR */}
        <header className="bg-white border-b border-gray-200 px-8 py-4 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-gray-900">
            {['Dashboard', 'Students', 'Results', 'Remarks', 'Fees', 'Accounts', 'Statistics'][
              ['dashboard', 'students', 'results', 'remarks', 'fees', 'accounts', 'statistics'].indexOf(activeTab)
            ]}
          </h2>
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold">AD</div>
            <span className="text-gray-700">Admin</span>
          </div>
        </header>

        {/* PAGE CONTENT */}
        <main className="flex-1 overflow-auto p-8">
          {activeTab === 'dashboard' && <Dashboard />}
          {activeTab === 'students' && <StudentManagement />}
          {activeTab === 'results' && <Results />}
          {activeTab === 'remarks' && <Remarks />}
          {activeTab === 'fees' && <Fees />}
          {activeTab === 'accounts' && <Accounts />}
          {activeTab === 'statistics' && <Statistics />}
        </main>
      </div>
    </div>
  );
}

// Dashboard Page
function Dashboard() {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card title="Total Students" value="1,245" change="+12%" icon="👥" />
        <Card title="Avg. Grade" value="7.8/10" change="+0.5" icon="📊" />
        <Card title="Pending Fees" value="₹54,320" change="-8%" icon="💰" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h3>
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="flex justify-between items-center py-3 border-b border-gray-100 last:border-0">
                <span className="text-gray-700">Student marked absent</span>
                <span className="text-xs text-gray-500">2 hours ago</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Fee Collection</h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-gray-700">Monthly Progress</span>
                <span className="text-sm font-bold text-green-600">78%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-green-500 h-2 rounded-full" style={{ width: '78%' }}></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Student Management Page
function StudentManagement() {
  const [searchTerm, setSearchTerm] = useState('');
  const [yearFilter, setYearFilter] = useState('all');
  const [streamFilter, setStreamFilter] = useState('all');
  const [selectedStudent, setSelectedStudent] = useState(null);

  const students = [
    { id: 1, name: 'Rajesh Kumar', hallTicket: 'HT001', stream: 'Science', year: '1st', email: 'rajesh@example.com', phone: '+91 9876543210' },
    { id: 2, name: 'Priya Sharma', hallTicket: 'HT002', stream: 'Commerce', year: '2nd', email: 'priya@example.com', phone: '+91 9876543211' },
    { id: 3, name: 'Amit Patel', hallTicket: 'HT003', stream: 'Science', year: '1st', email: 'amit@example.com', phone: '+91 9876543212' },
    { id: 4, name: 'Neha Singh', hallTicket: 'HT004', stream: 'Arts', year: '3rd', email: 'neha@example.com', phone: '+91 9876543213' },
  ];

  if (selectedStudent) {
    return <StudentDetailsView student={selectedStudent} onBack={() => setSelectedStudent(null)} />;
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <input
          type="text"
          placeholder="Search by name or hall ticket..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select value={yearFilter} onChange={e => setYearFilter(e.target.value)} className="px-4 py-3 border border-gray-200 rounded-lg">
          <option value="all">All Years</option>
          <option value="1">1st Year</option>
          <option value="2">2nd Year</option>
          <option value="3">3rd Year</option>
        </select>
        <select value={streamFilter} onChange={e => setStreamFilter(e.target.value)} className="px-4 py-3 border border-gray-200 rounded-lg">
          <option value="all">All Streams</option>
          <option value="science">Science</option>
          <option value="commerce">Commerce</option>
          <option value="arts">Arts</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Name</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Hall Ticket</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Stream</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Year</th>
              <th className="px-6 py-4 text-right text-sm font-semibold text-gray-900">Actions</th>
            </tr>
          </thead>
          <tbody>
            {students.map(student => (
              <tr key={student.id} className="border-b border-gray-100 hover:bg-blue-50 transition-colors">
                <td className="px-6 py-4 text-gray-900 font-medium">{student.name}</td>
                <td className="px-6 py-4 text-gray-600">{student.hallTicket}</td>
                <td className="px-6 py-4 text-gray-600">{student.stream}</td>
                <td className="px-6 py-4 text-gray-600">{student.year}</td>
                <td className="px-6 py-4 text-right">
                  <button onClick={() => setSelectedStudent(student)} className="text-blue-600 hover:text-blue-700 font-medium text-sm">View</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        <div className="flex justify-between items-center px-6 py-4 bg-gray-50 border-t border-gray-200">
          <span className="text-sm text-gray-600">Showing 1-4 of 1,245 students</span>
          <div className="flex gap-2">
            <button className="px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-100 text-sm">Previous</button>
            <button className="px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-100 text-sm">Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Student Details Page (Individual View)
function StudentDetailsView({ student, onBack }) {
  const [dpUrl, setDpUrl] = useState(student.photoUrl || 'https://ui-avatars.com/api/?name=' + student.name);
  const [isUploading, setIsUploading] = useState(false);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setIsUploading(true);
    
    // Simulate upload delay for Firebase Storage
    setTimeout(() => {
      // In real app:
      // const storageRef = ref(storage, `avatars/${student.id}`);
      // await uploadBytes(storageRef, file);
      // const url = await getDownloadURL(storageRef);
      
      const fakeUrl = URL.createObjectURL(file); // Temporary mock URL for UI
      setDpUrl(fakeUrl);
      setIsUploading(false);
      alert('Image successfully uploaded to Firebase Storage (Mock) and linked!');
    }, 1500);
  };

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="flex items-center text-blue-600 hover:text-blue-700 font-medium transition-colors">
        <ArrowLeft size={20} className="mr-2" /> Back to Students
      </button>

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
          <p className="text-lg text-gray-500 mt-1">Hall Ticket: {student.hallTicket}</p>
          
          <div className="flex flex-wrap gap-4 mt-6 justify-center md:justify-start">
            <span className="px-4 py-2 bg-blue-50 text-blue-700 rounded-lg font-medium">{student.stream}</span>
            <span className="px-4 py-2 bg-purple-50 text-purple-700 rounded-lg font-medium">{student.year} Year</span>
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
              <span className="text-gray-500">Email</span>
              <span className="font-medium text-gray-900">{student.email || 'Not provided'}</span>
            </div>
            <div className="flex justify-between border-b border-gray-100 pb-2">
              <span className="text-gray-500">Phone</span>
              <span className="font-medium text-gray-900">{student.phone || 'Not provided'}</span>
            </div>
            <div className="flex justify-between border-b border-gray-100 pb-2">
              <span className="text-gray-500">Date of Admission</span>
              <span className="font-medium text-gray-900">12 Aug 2025</span>
            </div>
          </div>
        </div>

        {/* Fees Overview */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Fee Overview</h3>
          <div className="space-y-4">
            <div className="flex justify-between border-b border-gray-100 pb-2">
              <span className="text-gray-500">Total Fees</span>
              <span className="font-bold text-gray-900">₹85,000</span>
            </div>
            <div className="flex justify-between border-b border-gray-100 pb-2">
              <span className="text-gray-500">Paid Amount</span>
              <span className="font-bold text-green-600">₹60,000</span>
            </div>
            <div className="flex justify-between border-b border-gray-100 pb-2">
              <span className="text-gray-500">Pending Amount</span>
              <span className="font-bold text-red-600">₹25,000</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Accounts (Finance) Page
function Accounts() {
  return (
    <div className="space-y-8">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-6 rounded-2xl border border-blue-200">
          <p className="text-sm font-medium text-blue-700">Total Fees</p>
          <p className="text-4xl font-bold text-blue-900 mt-2">₹24,50,000</p>
        </div>
        <div className="bg-gradient-to-br from-green-50 to-green-100 p-6 rounded-2xl border border-green-200">
          <p className="text-sm font-medium text-green-700">Collected Amount</p>
          <p className="text-4xl font-bold text-green-900 mt-2">₹19,10,000</p>
        </div>
        <div className="bg-gradient-to-br from-red-50 to-red-100 p-6 rounded-2xl border border-red-200">
          <p className="text-sm font-medium text-red-700">Pending Amount</p>
          <p className="text-4xl font-bold text-red-900 mt-2">₹5,40,000</p>
        </div>
      </div>

      {/* Progress */}
      <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-6">Fee Collection Progress</h3>
        <div className="space-y-6">
          <div>
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm font-medium text-gray-700">Overall Collection</span>
              <span className="text-lg font-bold text-green-600">78%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div className="bg-green-500 h-3 rounded-full" style={{ width: '78%' }}></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Statistics Page
function Statistics() {
  const [todayIncome, setTodayIncome] = useState('');
  const [todayExpenditure, setTodayExpenditure] = useState('');

  return (
    <div className="space-y-8">
      {/* Daily Tracking */}
      <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-6">Daily Tracking</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Today's Income</label>
            <input
              type="number"
              value={todayIncome}
              onChange={e => setTodayIncome(e.target.value)}
              placeholder="Enter amount"
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Today's Expenditure</label>
            <input
              type="number"
              value={todayExpenditure}
              onChange={e => setTodayExpenditure(e.target.value)}
              placeholder="Enter amount"
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
          <div className="flex items-end">
            <button className="w-full bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors">Save</button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card title="Total Monthly Income" value="₹8,45,000" icon="📈" />
        <Card title="Total Monthly Expenditure" value="₹2,30,000" icon="📉" />
        <Card title="Net Balance" value="₹6,15,000" icon="💎" />
      </div>

      {/* Chart Placeholder */}
      <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-6">Monthly Trend</h3>
        <div className="h-64 bg-gray-50 rounded-lg flex items-center justify-center text-gray-500">
          📊 Income & Expenditure Chart (Integration Ready)
        </div>
      </div>
    </div>
  );
}

// Placeholder Components
function Results() {
  return <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200 text-gray-600">📚 Results Management - Coming Soon</div>;
}

function Remarks() {
  return <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200 text-gray-600">💬 Remarks Management - Coming Soon</div>;
}

function Fees() {
  return <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200 text-gray-600">🧾 Fees Management - Coming Soon</div>;
}

// Card Component
function Card({ title, value, change, icon }) {
  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-sm font-medium text-gray-700">{title}</h3>
        <span className="text-2xl">{icon}</span>
      </div>
      <p className="text-3xl font-bold text-gray-900">{value}</p>
      {change && <p className="text-sm text-green-600 mt-2">↑ {change}</p>}
    </div>
  );
}
