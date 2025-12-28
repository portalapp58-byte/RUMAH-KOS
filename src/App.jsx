import React, { useState, useEffect, useRef } from 'react';
import { 
  LayoutDashboard, Bed, History, Settings, LogOut, Plus, 
  Printer, Home, CreditCard, AlertCircle, UserPlus, Pencil, 
  X, Users, ChevronRight, Info, Upload, FileText, DoorOpen, 
  CalendarCheck, Wallet, CheckCircle2, Calendar, ArrowLeft, 
  Stamp, Clock, Save, Lock, TrendingUp, Calculator, UserCog, Download, RefreshCw 
} from 'lucide-react';

import html2pdf from 'html2pdf.js';

import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  addDoc, 
  getDocs, 
  doc, 
  setDoc, 
  updateDoc, 
  getDoc 
} from "firebase/firestore";

// --- 1. KONFIGURASI FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyCQorCh1PaYdspqcnoGVfdz9OOdqMd13Q0",
  authDomain: "management-kos.firebaseapp.com",
  projectId: "management-kos",
  storageBucket: "management-kos.firebasestorage.app",
  messagingSenderId: "661524860034",
  appId: "1:661524860034:web:277dbf69b555b0a688389b"
};

// Inisialisasi Database
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// --- KONFIGURASI & HELPER ---

const formatIDR = (amount) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
  }).format(amount);
};

const formatDateIndo = (dateStr) => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
};

const addMonths = (dateStr, months) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  date.setMonth(date.getMonth() + months);
  return date.toISOString().split('T')[0];
};

const getDaysOverdue = (dueDate) => {
  if (!dueDate) return 0;
  const today = new Date();
  const due = new Date(dueDate);
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
   
  const diffTime = today - due;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
  return diffDays > 0 ? diffDays : 0;
};

// [LOGIC V.6.0] Helper: Hitung Status Warna & Hutang Secara Mendetail
const getRoomStatusLogic = (room) => {
  if (!room.resident || !room.nextPaymentDate) {
    return { color: 'white', label: 'Kosong', debt: { months: 0, totalDebt: 0 } };
  }

  const today = new Date();
  today.setHours(0,0,0,0);
  
  const dueDate = new Date(room.nextPaymentDate);
  dueDate.setHours(0,0,0,0);

  // Selisih hari untuk warning
  const diffTime = dueDate - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  // 1. KONDISI MERAH (TELAT)
  if (today > dueDate) {
    let diffMonths = (today.getFullYear() - dueDate.getFullYear()) * 12 + (today.getMonth() - dueDate.getMonth());
    if (today.getDate() >= dueDate.getDate()) {
      diffMonths += 1; 
    }
    const debtMonths = diffMonths > 0 ? diffMonths : 1;
    const totalDebt = (debtMonths * room.price) + (room.debt || 0);

    return { 
      color: 'red', 
      label: 'Telat', 
      debt: { months: debtMonths, totalDebt: totalDebt },
      daysOverdue: getDaysOverdue(room.nextPaymentDate)
    };
  }

  // 2. KONDISI KUNING (TAGIH - H-5 sampai Hari H)
  if (diffDays <= 5) {
    return { 
      color: 'yellow', 
      label: 'Tagih', 
      debt: { months: 0, totalDebt: 0 } 
    };
  }

  // 3. KONDISI HIJAU (LUNAS / AMAN)
  return { 
    color: 'green', 
    label: 'Lunas', 
    debt: { months: 0, totalDebt: 0 } 
  };
};

// Konstanta Nama Bulan
const MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

const App = () => {
  // --- STATE UTAMA ---
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userRole, setUserRole] = useState(null); // 'owner' or 'admin'
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loginCode, setLoginCode] = useState('');
   
  // --- STATE MODAL & FORM ---
  const [selectedRoom, setSelectedRoom] = useState(null); 
  const [editingId, setEditingId] = useState(null); 
  const [showRoomForm, setShowRoomForm] = useState(false); 
   
  const [showResidentForm, setShowResidentForm] = useState(false); 
  const [showEditResidentForm, setShowEditResidentForm] = useState(false); 
  const [showResidentDetail, setShowResidentDetail] = useState(false); 
  const [selectedRoomForResident, setSelectedRoomForResident] = useState(null); 

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentFormData, setPaymentFormData] = useState({ roomId: null, amount: 0, date: '', method: 'Transfer', nextDueDate: '', currentDueDateRaw: '' });
   
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [checkoutData, setCheckoutData] = useState(null);

  // --- STATE LAPORAN ---
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [reportViewMode, setReportViewMode] = useState('grid'); 
  const [selectedMonthIndex, setSelectedMonthIndex] = useState(null); 
  const [depositStatus, setDepositStatus] = useState({}); 
  const [isRefreshing, setIsRefreshing] = useState(false);
  const reportContentRef = useRef(null); 

  // --- CONFIG ---
  const [config, setConfig] = useState({
    ownerCode: 'OWNER123',
    adminCode: 'ADMIN456'
  });

  const [rooms, setRooms] = useState([]); 
  const [payments, setPayments] = useState([]); 

  // --- FETCH DATA ---
  const fetchData = async () => {
    setIsRefreshing(true);
    try {
      const snapshot = await getDocs(collection(db, "rooms"));
      if (!snapshot.empty) {
        const dataDariDB = snapshot.docs.map(doc => doc.data());
        dataDariDB.sort((a, b) => a.id - b.id);
        setRooms(dataDariDB);
      } else {
        const dataAwal = Array.from({ length: 20 }, (_, i) => {
          const num = i + 1;
          const roomNumber = `ROOM ${num < 10 ? '0' + num : num}`;
          return {
            id: num, number: roomNumber, price: 0, type: 'Standard', 
            floor: num <= 10 ? '1' : '2', resident: '', entryDate: '', 
            nextPaymentDate: '', status: 'Available', debt: 0
          };
        });
        setRooms(dataAwal);
        dataAwal.forEach(async (r) => await setDoc(doc(db, "rooms", r.number), r));
      }

      const paySnapshot = await getDocs(collection(db, "payments"));
      const payData = paySnapshot.docs.map(doc => doc.data());
      payData.sort((a, b) => b.id - a.id);
      setPayments(payData);

      const configSnap = await getDoc(doc(db, "settings", "access_codes"));
      if (configSnap.exists()) setConfig(configSnap.data());

      const depositSnap = await getDoc(doc(db, "settings", "deposits"));
      if (depositSnap.exists()) setDepositStatus(depositSnap.data());

    } catch (error) {
      console.error("Error:", error);
    } finally {
      setTimeout(() => setIsRefreshing(false), 600);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // --- AUTH LOGIC ---
  const handleLogin = () => {
    if (loginCode === config.ownerCode) {
      setUserRole('owner'); setIsLoggedIn(true); setActiveTab('monitor');
    } else if (loginCode === config.adminCode) {
      setUserRole('admin'); setIsLoggedIn(true); setActiveTab('dashboard');
    } else { alert("Kode akses salah!"); }
  };

  const handleLogout = () => {
    setIsLoggedIn(false); setUserRole(null); setLoginCode(''); setActiveTab('dashboard');
  };

  // --- ROOM MGMT ---
  const openEditRoomForm = (room) => {
    setRoomFormData({ number: room.number, price: room.price, type: room.type, floor: room.floor, desc: room.desc || '' });
    setEditingId(room.id);
    setShowRoomForm(true);
  };

  const handleSaveRoom = async () => {
    if (editingId) {
      try {
        const roomToUpdate = rooms.find(r => r.id === editingId);
        await updateDoc(doc(db, "rooms", roomToUpdate.number), { price: roomFormData.price, desc: roomFormData.desc });
        setRooms(rooms.map(r => r.id === editingId ? { ...r, ...roomFormData } : r));
        alert("Data fisik kamar diperbarui!");
      } catch (e) { console.error(e); }
    }
    setShowRoomForm(false);
  };

  // --- RESIDENT MGMT ---
  const openResidentRegistration = (room) => {
    const today = new Date().toISOString().split('T')[0];
    setSelectedRoomForResident(room);
    setResidentFormData({ name: '', entryDate: today, nextPaymentDate: today, ktpPhoto: null });
    setShowResidentForm(true);
  };

  const handleSaveResident = async () => {
    if (!residentFormData.name) { alert("Nama wajib diisi!"); return; }
    try {
      const dataUpdate = {
        resident: residentFormData.name, entryDate: residentFormData.entryDate,
        nextPaymentDate: residentFormData.nextPaymentDate, ktpPhoto: residentFormData.ktpPhoto || "",
        status: 'Unpaid', debt: 0
      };
      await updateDoc(doc(db, "rooms", selectedRoomForResident.number), dataUpdate);
      setRooms(rooms.map(r => r.id === selectedRoomForResident.id ? { ...r, ...dataUpdate } : r));
      setShowResidentForm(false);
      alert("Penghuni didaftarkan. Status masih 'Tagih/Telat' sampai Anda input pembayaran pertama.");
    } catch (e) { console.error(e); }
  };

  const openEditResidentForm = (room) => {
    setEditResidentData({ roomId: room.id, roomNumber: room.number, name: room.resident, entryDate: room.entryDate, nextPaymentDate: room.nextPaymentDate });
    setShowEditResidentForm(true);
  };

  const handleSaveEditedResident = async () => {
    try {
      await updateDoc(doc(db, "rooms", editResidentData.roomNumber), {
        resident: editResidentData.name, entryDate: editResidentData.entryDate, nextPaymentDate: editResidentData.nextPaymentDate
      });
      setRooms(rooms.map(r => r.id === editResidentData.roomId ? { ...r, resident: editResidentData.name, entryDate: editResidentData.entryDate, nextPaymentDate: editResidentData.nextPaymentDate } : r));
      setShowEditResidentForm(false);
      alert("Data penghuni diubah!");
    } catch (e) { console.error(e); }
  };

  // --- PAYMENT MGMT ---
  const openPaymentModal = (room) => {
    const today = new Date().toISOString().split('T')[0];
    const baseDueDate = room.nextPaymentDate || today;
    setPaymentFormData({
      roomId: room.id, roomNumber: room.number, resident: room.resident, 
      roomPrice: room.price, amount: 0, date: today, method: 'Transfer',
      nextDueDate: baseDueDate, currentDueDateRaw: baseDueDate 
    });
    setShowPaymentModal(true);
  };

  const calculatePaymentPreview = () => {
    const price = paymentFormData.roomPrice || 1;
    const amount = parseInt(paymentFormData.amount) || 0;
    const monthsPaid = Math.floor(amount / price);
    const remainder = amount % price; 
    const currentDue = new Date(paymentFormData.currentDueDateRaw);
    const newDueObj = new Date(currentDue);
    newDueObj.setMonth(newDueObj.getMonth() + monthsPaid);
    return { months: monthsPaid, remainder: remainder, newDate: newDueObj.toISOString().split('T')[0], isValid: monthsPaid > 0 };
  };

  const handleConfirmPayment = async () => {
    const preview = calculatePaymentPreview();
    if (!preview.isValid) { alert("Nominal minimal 1 bulan sewa!"); return; }
    try {
      const today = new Date(); today.setHours(0,0,0,0);
      const newDue = new Date(preview.newDate); newDue.setHours(0,0,0,0);
      
      // Hitung H-5 untuk status kuning
      const diffTime = newDue - today;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      let newStatus = 'Paid';
      if (today > newDue) newStatus = 'Unpaid';
      else if (diffDays <= 5) newStatus = 'Warning'; // Internal tag

      await updateDoc(doc(db, "rooms", paymentFormData.roomNumber), { status: newStatus, nextPaymentDate: preview.newDate, debt: 0 });
      
      const newPayment = {
        id: Date.now(), roomId: paymentFormData.roomNumber, residentName: paymentFormData.resident,
        amount: paymentFormData.amount, date: paymentFormData.date, 
        type: `Sewa (${preview.months} Bulan)`, method: paymentFormData.method
      };
      await addDoc(collection(db, "payments"), newPayment);
      
      setRooms(rooms.map(r => r.id === paymentFormData.roomId ? { ...r, status: newStatus, nextPaymentDate: preview.newDate } : r));
      setPayments([newPayment, ...payments]);
      setShowPaymentModal(false);
      alert("Pembayaran Berhasil!");
    } catch (e) { console.error(e); }
  };

  // --- CHECKOUT ---
  const handleConfirmCheckout = async () => {
    if (!checkoutData) return;
    try {
      await updateDoc(doc(db, "rooms", checkoutData.number), { resident: '', entryDate: '', nextPaymentDate: '', ktpPhoto: null, status: 'Available', debt: 0 });
      const log = { id: Date.now(), roomId: checkoutData.number, residentName: checkoutData.resident, amount: 0, date: new Date().toISOString().split('T')[0], type: 'Checkout', method: '-' };
      await addDoc(collection(db, "payments"), log);
      setRooms(rooms.map(r => r.id === checkoutData.id ? { ...r, resident: '', status: 'Available', nextPaymentDate: '' } : r));
      setPayments([log, ...payments]);
      setShowCheckoutModal(false); setShowResidentDetail(false);
      alert("Checkout Sukses!");
    } catch (e) { console.error(e); }
  };

  // --- REPORT LOGIC ---
  const handleDownloadPDF = () => {
    const element = reportContentRef.current;
    html2pdf().set({
      margin: 10, filename: `Laporan-${MONTH_NAMES[selectedMonthIndex]}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).from(element).save();
  };

  const getMonthlyIncome = (monthIndex, year) => {
    return payments.filter(p => {
      const d = new Date(p.date);
      return d.getMonth() === monthIndex && d.getFullYear() === year;
    }).reduce((acc, curr) => acc + curr.amount, 0);
  };

  const getFilteredPayments = () => {
    if (selectedMonthIndex === null) return [];
    return payments.filter(p => {
      const d = new Date(p.date);
      return d.getMonth() === selectedMonthIndex && d.getFullYear() === selectedYear;
    });
  };

  const toggleDepositStatus = async () => {
    const key = `${selectedYear}-${selectedMonthIndex}`;
    const newStatus = !depositStatus[key];
    setDepositStatus({ ...depositStatus, [key]: newStatus });
    await setDoc(doc(db, "settings", "deposits"), { [key]: newStatus }, { merge: true });
  };

  // --- UI CONSTANTS ---
  const occupiedRooms = rooms.filter(r => r.resident).length;
  const overdueRoomsCount = rooms.filter(r => r.resident && getRoomStatusLogic(r).color === 'red').length;
  const currentMonthIncome = getMonthlyIncome(new Date().getMonth(), new Date().getFullYear());

  // --- VIEW LOGIN ---
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-10 border border-slate-200">
          <div className="text-center mb-10">
            <div className="bg-blue-600 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6 text-white shadow-blue-200 shadow-2xl">
              <Home size={40} />
            </div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight">PRO-KOS</h1>
            <p className="text-slate-500 font-medium mt-2 text-sm uppercase tracking-widest">Management System</p>
          </div>
          <div className="space-y-6">
            <div className="relative">
              <input 
                type="password" placeholder="Masukkan Kode User" 
                className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all font-bold text-center tracking-[0.5em]" 
                value={loginCode} onChange={(e) => setLoginCode(e.target.value)} 
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()} 
              />
              <Lock className="absolute left-4 top-4.5 text-slate-400" size={20} />
            </div>
            <button onClick={handleLogin} className="w-full bg-slate-900 hover:bg-black text-white font-bold py-4 rounded-2xl shadow-xl active:scale-[0.98] transition-all tracking-wide">
              MASUK KE SISTEM
            </button>
          </div>
          <div className="mt-12 text-center">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Powered By Malang Florist Group • V.6.0 Final</p>
          </div>
        </div>
      </div>
    );
  }

  const NavItem = ({ id, icon: Icon, label }) => (
    <button 
      onClick={() => { setActiveTab(id); if(id !== 'reports') { setReportViewMode('grid'); setSelectedMonthIndex(null); } }} 
      className={`flex flex-col items-center gap-1 p-3 flex-1 md:flex-row md:gap-4 md:px-6 md:py-4 md:rounded-2xl transition-all print:hidden ${activeTab === id ? 'text-blue-600 md:bg-blue-50 font-bold' : 'text-slate-400 hover:text-slate-600'}`}
    >
      <Icon size={24} />
      <span className="text-[10px] md:text-sm uppercase tracking-wider">{label}</span>
    </button>
  );

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col md:flex-row print:block">
      {/* SIDEBAR */}
      <aside className="hidden md:flex flex-col w-72 bg-white border-r border-slate-200 p-8 sticky top-0 h-screen print:hidden shadow-sm">
        <div className="flex items-center gap-4 mb-12 px-2">
          <div className="bg-blue-600 p-2.5 rounded-xl text-white shadow-lg shadow-blue-100"><Home size={28} /></div>
          <span className="font-black text-2xl text-slate-800 tracking-tighter">PRO-KOS</span>
        </div>
        <nav className="space-y-3 flex-1">
          {userRole === 'admin' ? (
            <>
              <NavItem id="dashboard" icon={LayoutDashboard} label="Dashboard" />
              <NavItem id="rooms" icon={Bed} label="Kamar" />
              <NavItem id="history" icon={History} label="Laporan" />
              <NavItem id="settings" icon={Settings} label="Akses" />
            </>
          ) : (
            <>
              <NavItem id="monitor" icon={LayoutDashboard} label="Monitor" />
              <NavItem id="reports" icon={Printer} label="Cetak" />
            </>
          )}
        </nav>
        <button onClick={handleLogout} className="flex items-center gap-4 px-6 py-4 text-red-500 hover:bg-red-50 rounded-2xl transition-all font-bold">
          <LogOut size={22} /> <span>KELUAR</span>
        </button>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 pb-24 md:pb-0 overflow-y-auto print:w-full">
        <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 p-4 md:p-6 sticky top-0 z-40 flex justify-between items-center print:hidden">
          <div>
            <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">
              {activeTab === 'monitor' ? 'Pemantauan Kos' : activeTab === 'dashboard' ? 'Dashboard Utama' : activeTab.toUpperCase()}
            </h2>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-0.5">Mode: {userRole}</p>
          </div>
          <div className="flex items-center gap-4">
            {userRole === 'owner' && (
              <button 
                onClick={fetchData} 
                className={`p-2.5 rounded-xl bg-slate-100 text-slate-600 hover:bg-blue-600 hover:text-white transition-all shadow-sm ${isRefreshing ? 'animate-spin' : ''}`}
                title="Refresh Data"
              >
                <RefreshCw size={20} />
              </button>
            )}
            <div className="h-12 w-12 rounded-2xl bg-slate-900 flex items-center justify-center text-white font-black shadow-lg border-2 border-white">
              {userRole === 'admin' ? 'A' : 'P'}
            </div>
          </div>
        </header>

        <div className="p-4 md:p-10 max-w-7xl mx-auto print:w-full print:p-0">
          
          {/* MODAL EDIT FISIK KAMAR */}
          {showRoomForm && (
            <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in duration-200">
                <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                  <h4 className="font-black text-slate-800 flex items-center gap-3 text-xl"><Pencil size={24} className="text-blue-600"/> EDIT KAMAR {roomFormData.number}</h4>
                  <button onClick={() => setShowRoomForm(false)} className="p-2 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-full transition-colors"><X size={24}/></button>
                </div>
                <div className="p-8 space-y-6">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Harga Sewa / Bln</label>
                        <div className="relative">
                            <span className="absolute left-4 top-3.5 text-slate-400 font-bold">Rp</span>
                            <input type="number" className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold focus:ring-4 focus:ring-blue-100 outline-none transition-all" value={roomFormData.price} onChange={e => setRoomFormData({...roomFormData, price: parseInt(e.target.value) || 0})} />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tipe Kamar</label>
                        <input className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold focus:ring-4 focus:ring-blue-100 outline-none transition-all" value={roomFormData.type} onChange={e => setRoomFormData({...roomFormData, type: e.target.value})} />
                    </div>
                  </div>
                  <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Fasilitas / Deskripsi</label>
                      <textarea rows="3" className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold focus:ring-4 focus:ring-blue-100 outline-none transition-all resize-none" value={roomFormData.desc} onChange={e => setRoomFormData({...roomFormData, desc: e.target.value})} />
                  </div>
                </div>
                <div className="p-6 bg-slate-50 flex justify-end gap-3 px-8 border-t border-slate-100">
                    <button onClick={() => setShowRoomForm(false)} className="px-6 py-3 rounded-2xl text-slate-500 font-bold hover:bg-slate-200 transition-all">BATAL</button>
                    <button onClick={handleSaveRoom} className="px-8 py-3 bg-slate-900 text-white rounded-2xl font-black shadow-xl hover:bg-black transition-all">SIMPAN DATA</button>
                </div>
              </div>
            </div>
          )}

          {/* MODAL REGISTRASI PENGHUNI */}
          {showResidentForm && (
            <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in duration-200">
                <div className="bg-green-600 p-8 flex justify-between items-center text-white">
                    <div>
                        <h4 className="font-black text-2xl flex items-center gap-3"><UserPlus size={30}/> PENDAFTARAN BARU</h4>
                        <p className="text-sm font-bold opacity-80 mt-1 uppercase tracking-widest ml-1">Alokasi Kamar: {selectedRoomForResident?.number}</p>
                    </div>
                    <button onClick={() => setShowResidentForm(false)} className="p-2 hover:bg-white/20 rounded-full transition-colors"><X size={28}/></button>
                </div>
                <div className="p-8 space-y-6">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nama Lengkap Sesuai KTP</label>
                        <input className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-lg focus:ring-4 focus:ring-green-100 outline-none transition-all" value={residentFormData.name} onChange={e => setResidentFormData({...residentFormData, name: e.target.value})} placeholder="Contoh: Budi Santoso" />
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tanggal Mulai Kos</label>
                        <input type="date" className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:border-green-500" value={residentFormData.entryDate} onChange={e => setResidentFormData({...residentFormData, entryDate: e.target.value})} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Target Jatuh Tempo</label>
                        <input type="date" className="w-full px-5 py-4 bg-yellow-50 border border-yellow-200 rounded-2xl font-bold outline-none focus:border-yellow-500" value={residentFormData.nextPaymentDate} onChange={e => setResidentFormData({...residentFormData, nextPaymentDate: e.target.value})} />
                      </div>
                    </div>
                    <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 flex gap-4 items-start">
                        <Info size={24} className="text-blue-500 shrink-0 mt-1" />
                        <p className="text-xs text-blue-700 leading-relaxed font-medium">
                            <b>Catatan:</b> Pendaftaran ini hanya menyimpan biodata. Status akan otomatis <b>TELAT/TAGIH</b> jika tanggal jatuh tempo hari ini atau lampau. Silakan lakukan pembayaran manual di dashboard kamar setelah simpan.
                        </p>
                    </div>
                </div>
                <div className="p-6 bg-slate-50 flex justify-end gap-3 px-8 border-t border-slate-100">
                    <button onClick={() => setShowResidentForm(false)} className="px-6 py-3 rounded-2xl text-slate-500 font-bold hover:bg-slate-200 transition-all">BATAL</button>
                    <button onClick={handleSaveResident} className="px-10 py-3 bg-green-600 text-white rounded-2xl font-black shadow-xl hover:bg-green-700 transition-all">SIMPAN PENGHUNI</button>
                </div>
              </div>
            </div>
          )}

          {/* MODAL EDIT DATA PENGHUNI */}
          {showEditResidentForm && (
            <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden">
                <div className="bg-indigo-600 p-8 flex justify-between items-center text-white">
                    <h4 className="font-black text-xl flex items-center gap-3 tracking-tight"><UserCog size={28}/> EDIT IDENTITAS PENGHUNI</h4>
                    <button onClick={() => setShowEditResidentForm(false)}><X size={24}/></button>
                </div>
                <div className="p-8 space-y-6">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Nama Penghuni</label>
                        <input className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold focus:ring-4 focus:ring-indigo-100 outline-none" value={editResidentData.name} onChange={e => setEditResidentData({...editResidentData, name: e.target.value})} />
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Tgl Masuk</label>
                        <input type="date" className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold" value={editResidentData.entryDate} onChange={e => setEditResidentData({...editResidentData, entryDate: e.target.value})} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-orange-500 uppercase ml-1">Koreksi Jatuh Tempo</label>
                        <input type="date" className="w-full px-5 py-4 bg-orange-50 border border-orange-200 rounded-2xl font-bold text-orange-700 focus:ring-4 focus:ring-orange-100 outline-none" value={editResidentData.nextPaymentDate} onChange={e => setEditResidentData({...editResidentData, nextPaymentDate: e.target.value})} />
                      </div>
                    </div>
                </div>
                <div className="p-6 bg-slate-50 flex justify-end gap-3 px-8">
                    <button onClick={() => setShowEditResidentForm(false)} className="font-bold text-slate-400 px-4">BATAL</button>
                    <button onClick={handleSaveEditedResident} className="px-8 py-3.5 bg-indigo-600 text-white rounded-2xl font-black shadow-lg shadow-indigo-100">UPDATE DATA</button>
                </div>
              </div>
            </div>
          )}

          {/* MODAL PEMBAYARAN PINTAR */}
          {showPaymentModal && (
            <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
              <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-300">
                <div className="bg-blue-600 p-8 flex justify-between items-center text-white">
                    <h4 className="font-black text-2xl flex items-center gap-3 tracking-tighter"><Wallet size={32}/> INPUT PEMBAYARAN</h4>
                    <button onClick={() => setShowPaymentModal(false)} className="p-2 hover:bg-white/20 rounded-full"><X size={24}/></button>
                </div>
                
                <div className="p-8 space-y-8">
                    {/* INFO HEADER */}
                    <div className="bg-blue-50 rounded-[30px] border border-blue-100 p-6">
                        <div className="flex justify-between items-center mb-4">
                             <h5 className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] ml-1">{paymentFormData.roomNumber}</h5>
                             <span className="text-xs font-black bg-white border border-blue-200 px-3 py-1 rounded-full text-blue-600 shadow-sm">{paymentFormData.resident}</span>
                        </div>
                        <div className="flex justify-between items-end">
                            <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Hutang Jatuh Tempo:</p>
                                <p className="text-xl font-black text-slate-800">{formatDateIndo(paymentFormData.currentDueDateRaw)}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Harga Sewa:</p>
                                <p className="text-xl font-black text-blue-600">{formatIDR(paymentFormData.roomPrice)} <span className="text-[10px] text-slate-400">/BLN</span></p>
                            </div>
                        </div>
                    </div>

                    {/* INPUT SECTION */}
                    <div className="space-y-4">
                        <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1 flex justify-between">
                            <span>Masukkan Nominal Diterima</span>
                            <span className="text-blue-500">Live Calculation</span>
                        </label>
                        <div className="relative group">
                            <span className="absolute left-6 top-5 text-slate-300 font-black text-2xl group-focus-within:text-blue-500 transition-colors">Rp</span>
                            <input 
                                type="number" 
                                className="w-full pl-16 pr-6 py-6 bg-slate-50 border-2 border-slate-100 rounded-[30px] font-black text-4xl focus:border-blue-500 focus:bg-white focus:ring-8 focus:ring-blue-50 focus:shadow-2xl outline-none transition-all placeholder:text-slate-200"
                                placeholder="0"
                                value={paymentFormData.amount || ""} 
                                onChange={e => setPaymentFormData({...paymentFormData, amount: parseInt(e.target.value) || 0})}
                                autoFocus
                            />
                        </div>
                         <div className="flex gap-4">
                            <div className="w-1/2 space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-tighter ml-1">Metode</label>
                                <select className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm" value={paymentFormData.method} onChange={e => setPaymentFormData({...paymentFormData, method: e.target.value})}>
                                  <option value="Transfer">Transfer Bank</option><option value="Tunai">Uang Tunai</option><option value="QRIS">E-Wallet/QRIS</option>
                                </select>
                            </div>
                            <div className="w-1/2 space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-tighter ml-1">Tgl Bayar</label>
                                <input type="date" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm" value={paymentFormData.date} onChange={e => setPaymentFormData({...paymentFormData, date: e.target.value})} />
                            </div>
                        </div>
                    </div>

                    {/* LIVE PREVIEW BOX */}
                    {(() => {
                        const preview = calculatePaymentPreview();
                        return (
                            <div className={`rounded-[30px] p-6 border-2 transition-all duration-500 ${preview.isValid ? 'bg-green-50 border-green-200 scale-100 opacity-100' : 'bg-slate-50 border-slate-100 opacity-60 scale-95'}`}>
                                <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                                    <Calculator size={16} className="text-slate-400"/> RINGKASAN PERPANJANGAN
                                </h5>
                                {preview.isValid ? (
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <span className="text-[10px] font-black text-slate-500 uppercase">Masa Sewa Baru:</span>
                                            <p className="font-black text-green-700 text-lg">+{preview.months} BULAN</p>
                                        </div>
                                        <div className="space-y-1 text-right">
                                            <span className="text-[10px] font-black text-slate-500 uppercase">Hingga Tanggal:</span>
                                            <p className="font-black text-blue-700 text-lg underline decoration-blue-200 underline-offset-4">{formatDateIndo(preview.newDate)}</p>
                                        </div>
                                        {preview.remainder > 0 && (
                                            <div className="col-span-2 mt-2 pt-3 border-t border-green-200 flex justify-between">
                                                <span className="text-[10px] font-black text-slate-400 uppercase italic">Sisa/Kelebihan:</span>
                                                <span className="font-black text-slate-600 text-sm">{formatIDR(preview.remainder)}</span>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="text-center py-2">
                                        <p className="text-[11px] text-slate-400 font-bold italic">Sistem akan menghitung durasi otomatis berdasarkan nominal...</p>
                                    </div>
                                )}
                            </div>
                        );
                    })()}
                </div>

                <div className="p-8 bg-slate-50 flex flex-col gap-4 border-t border-slate-100 px-10">
                    <button onClick={handleConfirmPayment} disabled={!calculatePaymentPreview().isValid} className="w-full py-5 bg-slate-900 text-white rounded-[25px] font-black text-xl shadow-2xl shadow-slate-200 hover:bg-black hover:-translate-y-1 active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:bg-slate-300 disabled:shadow-none disabled:translate-y-0">
                        <CheckCircle2 size={24} /> KONFIRMASI BAYAR
                    </button>
                    <button onClick={() => setShowPaymentModal(false)} className="w-full py-2 font-black text-slate-400 hover:text-slate-600 text-sm tracking-widest uppercase transition-colors">
                        BATALKAN
                    </button>
                </div>
              </div>
            </div>
          )}

          {/* DASHBOARD GRID AREA */}
          {(activeTab === 'dashboard' || activeTab === 'monitor') && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
               {/* LEGEND SECTION */}
               <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 bg-white p-8 rounded-[35px] border border-slate-200 shadow-sm overflow-hidden relative">
                  <div className="absolute top-0 right-0 p-8 opacity-5">
                    <TrendingUp size={120} className="text-slate-900" />
                  </div>
                  <div className="z-10">
                    <h3 className="text-2xl font-black text-slate-800 tracking-tighter mb-2">Monitoring Real-time</h3>
                    <p className="text-slate-400 text-sm font-medium">Klik pada kartu kamar untuk melihat detail riwayat pembayaran.</p>
                  </div>
                  <div className="flex flex-wrap gap-3 z-10">
                     <div className="flex items-center gap-2 bg-slate-50 px-4 py-2 rounded-full border border-slate-200">
                        <div className="w-3 h-3 bg-white border-2 border-slate-300 rounded-full"></div>
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Kosong</span>
                     </div>
                     <div className="flex items-center gap-2 bg-green-50 px-4 py-2 rounded-full border border-green-200">
                        <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                        <span className="text-[10px] font-black text-green-600 uppercase tracking-widest">Lunas</span>
                     </div>
                     <div className="flex items-center gap-2 bg-yellow-50 px-4 py-2 rounded-full border border-yellow-200">
                        <div className="w-3 h-3 bg-yellow-400 rounded-full animate-pulse"></div>
                        <span className="text-[10px] font-black text-yellow-600 uppercase tracking-widest">Tagih (H-5)</span>
                     </div>
                     <div className="flex items-center gap-2 bg-red-50 px-4 py-2 rounded-full border border-red-200">
                        <div className="w-3 h-3 bg-red-500 rounded-full animate-ping"></div>
                        <span className="text-[10px] font-black text-red-600 uppercase tracking-widest">Telat</span>
                     </div>
                  </div>
               </div>

               {/* GRID KAMAR */}
               <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                {rooms.map(room => {
                  const isOccupied = !!room.resident;
                  const status = getRoomStatusLogic(room);
                  
                  let cardStyle = "bg-white border-slate-200 hover:border-blue-300 shadow-sm";
                  let badgeColor = "bg-slate-100 text-slate-400";
                  
                  if (isOccupied) {
                    if (status.color === 'red') {
                        cardStyle = "bg-red-50/50 border-red-200 shadow-lg shadow-red-50 hover:border-red-500";
                        badgeColor = "bg-red-500 text-white shadow-lg shadow-red-100";
                    } else if (status.color === 'yellow') {
                        cardStyle = "bg-yellow-50/50 border-yellow-200 shadow-md shadow-yellow-50 hover:border-yellow-500";
                        badgeColor = "bg-yellow-400 text-slate-800 font-black";
                    } else {
                        cardStyle = "bg-green-50/30 border-green-200 shadow-md shadow-green-50 hover:border-green-500";
                        badgeColor = "bg-green-500 text-white shadow-lg shadow-green-100";
                    }
                  }

                  return (
                    <div 
                      key={room.id} 
                      onClick={() => setSelectedRoom(room)}
                      className={`p-6 rounded-[35px] border-2 transition-all cursor-pointer group active:scale-95 ${cardStyle}`}
                    >
                       <div className="flex justify-between items-start mb-6">
                         <div className="space-y-1">
                            <span className="text-xs font-black text-slate-300 uppercase tracking-widest group-hover:text-blue-400 transition-colors">{room.type}</span>
                            <h4 className="font-black text-3xl text-slate-800 tracking-tighter">{room.number.replace('ROOM ', '')}</h4>
                         </div>
                         {status.color === 'red' && <AlertCircle className="text-red-500" size={24} />}
                         {status.color === 'green' && <CheckCircle2 className="text-green-500" size={24} />}
                         {status.color === 'yellow' && <Clock className="text-yellow-500" size={24} />}
                       </div>

                       <div className="space-y-3">
                          <p className="text-sm font-black text-slate-600 truncate">
                            {room.resident || <span className="text-slate-300 font-bold italic tracking-normal">Tersedia</span>}
                          </p>
                          <div className="flex items-center justify-between gap-2">
                             <span className="text-[10px] font-black text-slate-400 uppercase bg-white/60 px-2 py-1 rounded-lg border border-slate-100">{formatIDR(room.price)}</span>
                             <span className={`text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-widest ${badgeColor}`}>
                                {status.label}
                             </span>
                          </div>
                       </div>
                    </div>
                  );
                })}
               </div>
            </div>
          )}

          {/* TAB OWNER: MONITORING KHUSUS */}
          {userRole === 'owner' && activeTab === 'monitor' && (
            <div className="mt-12 space-y-8 animate-in fade-in duration-500">
               <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  <div className="bg-white p-8 rounded-[40px] border shadow-sm flex items-center gap-6">
                    <div className="bg-blue-600 p-4 rounded-3xl text-white"><Bed size={32}/></div>
                    <div><p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Kamar Terisi</p><h3 className="text-3xl font-black text-slate-800">{occupiedRooms} <span className="text-sm text-slate-300 font-bold">Kamar</span></h3></div>
                  </div>
                  <div className="bg-white p-8 rounded-[40px] border shadow-sm flex items-center gap-6">
                    <div className="bg-green-500 p-4 rounded-3xl text-white"><TrendingUp size={32}/></div>
                    <div><p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Pendapatan Bulan Ini</p><h3 className="text-2xl font-black text-slate-800">{formatIDR(currentMonthIncome)}</h3></div>
                  </div>
                  <div className="bg-white p-8 rounded-[40px] border shadow-sm flex items-center gap-6 border-red-100">
                    <div className="bg-red-500 p-4 rounded-3xl text-white"><AlertCircle size={32}/></div>
                    <div><p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Penghuni Telat</p><h3 className="text-3xl font-black text-red-600">{overdueRoomsCount} <span className="text-sm text-slate-300 font-bold">Orang</span></h3></div>
                  </div>
               </div>
            </div>
          )}

          {/* MANAJEMEN KAMAR (ADMIN ONLY) */}
          {userRole === 'admin' && activeTab === 'rooms' && (
            <div className="bg-white rounded-[40px] border shadow-sm overflow-hidden animate-in fade-in duration-500">
                <div className="p-8 border-b bg-slate-50/50 flex justify-between items-center">
                    <div>
                        <h3 className="font-black text-2xl text-slate-800 tracking-tighter">DAFTAR & KELOLA KAMAR</h3>
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Ubah data fisik atau pendaftaran penghuni</p>
                    </div>
                    <div className="bg-white p-2 px-4 rounded-2xl border border-slate-200 shadow-sm text-[10px] font-black text-slate-500 uppercase tracking-widest">Total: {rooms.length} Kamar</div>
                </div>
                <div className="divide-y divide-slate-100">
                    {rooms.map(room => (
                      <div key={room.id} className="flex flex-col md:flex-row md:items-center justify-between p-8 hover:bg-slate-50 transition-all group">
                         <div className="flex items-center gap-6 mb-6 md:mb-0">
                            <div className="h-16 w-16 bg-slate-900 rounded-3xl flex items-center justify-center text-white text-2xl font-black shadow-lg shadow-slate-200 group-hover:scale-110 transition-transform">{room.number.replace('ROOM ', '')}</div>
                            <div>
                                <h4 className="font-black text-xl text-slate-800 uppercase tracking-tighter">{room.resident || <span className="text-slate-300 italic font-bold tracking-normal">Kamar Kosong</span>}</h4>
                                <div className="flex gap-2 mt-1">
                                    <span className="text-[10px] font-black text-slate-400 uppercase px-2 py-0.5 bg-white border rounded-md">{room.type}</span>
                                    <span className="text-[10px] font-black text-blue-600 uppercase px-2 py-0.5 bg-blue-50 rounded-md">{formatIDR(room.price)}</span>
                                </div>
                            </div>
                         </div>
                         <div className="flex items-center gap-3">
                            <button onClick={() => openEditRoomForm(room)} className="p-3 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-2xl transition-all" title="Ubah Fisik Kamar"><Pencil size={22} /></button>
                            {room.status === 'Available' ? (
                               <button onClick={() => openResidentRegistration(room)} className="bg-slate-900 text-white px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-black shadow-lg shadow-slate-100 active:scale-95 transition-all flex items-center gap-2">
                                <Plus size={18} /> Daftar Penghuni
                               </button>
                            ) : (
                               <>
                                 <button onClick={() => openResidentDetail(room)} className="p-3 bg-slate-100 text-slate-600 rounded-2xl hover:bg-blue-600 hover:text-white transition-all" title="Detail"><Info size={22} /></button>
                                 <button onClick={() => openEditResidentForm(room)} className="p-3 bg-yellow-50 text-yellow-600 rounded-2xl hover:bg-yellow-400 hover:text-slate-900 transition-all" title="Edit Penghuni"><UserCog size={22} /></button>
                                 <button onClick={() => openPaymentModal(room)} className="bg-blue-600 text-white px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 shadow-lg shadow-blue-50 transition-all flex items-center gap-2">
                                    <CreditCard size={18}/> Bayar
                                 </button>
                                 <button onClick={() => openCheckoutModal(room)} className="p-3 bg-red-50 text-red-600 rounded-2xl hover:bg-red-500 hover:text-white transition-all" title="Checkout"><DoorOpen size={22} /></button>
                               </>
                            )}
                         </div>
                      </div>
                    ))}
                </div>
            </div>
          )}

          {/* ARSIP LAPORAN & RIWAYAT (GRID VIEW) */}
          {(activeTab === 'history' || activeTab === 'reports') && reportViewMode === 'grid' && (
            <div className="space-y-8 animate-in fade-in duration-500">
               <div className="flex justify-between items-center bg-white p-8 rounded-[35px] border shadow-sm">
                  <div className="flex items-center gap-4">
                     <div className="p-3 bg-slate-900 text-white rounded-2xl"><Calendar size={24}/></div>
                     <h3 className="font-black text-2xl text-slate-800 tracking-tight uppercase">Arsip Tahun {selectedYear}</h3>
                  </div>
                  <div className="flex gap-3 bg-slate-100 p-2 rounded-2xl">
                    <button onClick={() => setSelectedYear(selectedYear - 1)} className="p-2.5 bg-white rounded-xl shadow-sm hover:text-blue-600 font-black transition-all">&laquo;</button>
                    <span className="px-6 py-2.5 font-black text-slate-700">{selectedYear}</span>
                    <button onClick={() => setSelectedYear(selectedYear + 1)} className="p-2.5 bg-white rounded-xl shadow-sm hover:text-blue-600 font-black transition-all">&raquo;</button>
                  </div>
               </div>

               <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {MONTH_NAMES.map((month, index) => {
                  const income = getMonthlyIncome(index, selectedYear);
                  const isDeposited = depositStatus[`${selectedYear}-${index}`];
                  const dColor = isDeposited ? 'bg-green-100 text-green-700 border-green-200' : 'bg-yellow-100 text-yellow-700 border-yellow-200';
                  
                  return (
                    <button 
                      key={month} 
                      onClick={() => { setSelectedMonthIndex(index); setReportViewMode('detail'); }}
                      className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm hover:border-blue-500 hover:shadow-xl hover:-translate-y-2 text-left transition-all relative overflow-hidden group"
                    >
                       <div className="flex justify-between items-start mb-6">
                          <span className="text-3xl font-black text-slate-100 group-hover:text-blue-50 transition-colors">{index + 1 < 10 ? `0${index + 1}` : index + 1}</span>
                          <ChevronRight className="text-slate-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
                       </div>
                       <h4 className="text-lg font-black text-slate-800 uppercase tracking-tight mb-2">{month}</h4>
                       <p className="text-xl font-black text-slate-700 mb-6">{formatIDR(income)}</p>
                       <div className={`text-[9px] font-black px-3 py-1.5 rounded-full border inline-flex items-center gap-1.5 ${dColor}`}>
                          {isDeposited ? <CheckCircle2 size={12}/> : <Clock size={12} className="animate-pulse" />} 
                          {isDeposited ? 'DISETORKAN' : 'BELUM SETOR'}
                       </div>
                    </button>
                  );
                })}
               </div>
            </div>
          )}

          {/* DETAIL LAPORAN A4 VIEW */}
          {reportViewMode === 'detail' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
               <div className="flex flex-col md:flex-row justify-between items-center gap-6 mb-8 print:hidden">
                  <button onClick={() => setReportViewMode('grid')} className="flex items-center gap-3 text-slate-600 font-black hover:text-blue-600 transition-colors uppercase tracking-widest text-xs">
                    <ArrowLeft size={20} /> Kembali ke Arsip
                  </button>
                  <div className="flex gap-3">
                     {userRole === 'admin' && (
                       <button onClick={toggleDepositStatus} className={`px-6 py-4 rounded-2xl text-xs font-black uppercase tracking-widest flex items-center gap-2 shadow-lg transition-all ${depositStatus[`${selectedYear}-${selectedMonthIndex}`] ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' : 'bg-slate-900 text-white hover:bg-black'}`}>
                        <Stamp size={20} /> {depositStatus[`${selectedYear}-${selectedMonthIndex}`] ? 'Batalkan Setor' : 'Tandai Sudah Setor'}
                       </button>
                     )}
                     <button onClick={() => window.print()} className="bg-white border-2 border-slate-200 text-slate-800 px-6 py-4 rounded-2xl text-xs font-black uppercase tracking-widest flex items-center gap-2 hover:bg-slate-50 transition-all">
                        <Printer size={20} /> Print
                     </button>
                     <button onClick={handleDownloadPDF} className="bg-blue-600 text-white px-8 py-4 rounded-2xl text-xs font-black uppercase tracking-widest flex items-center gap-2 shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all">
                        <Download size={20} /> Simpan PDF
                     </button>
                  </div>
               </div>

               {/* KERTAS LAPORAN A4 CLEAN */}
               <div className="flex justify-center p-2 md:p-0">
                <div ref={reportContentRef} className="bg-white p-10 md:p-16 w-full md:w-[210mm] mx-auto min-h-0 relative shadow-none md:shadow-2xl">
                    {/* KOP LAPORAN */}
                    <div className="text-center border-b-[6px] border-slate-900 pb-8 mb-10 relative">
                        <h1 className="text-4xl font-black text-slate-900 tracking-tighter uppercase mb-1">PRO-KOS REPORT</h1>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-[0.4em] mb-4">Financial Records System</p>
                        <div className="inline-block px-8 py-2 bg-slate-900 text-white rounded-full font-black text-sm uppercase tracking-widest">
                          PERIODE: {MONTH_NAMES[selectedMonthIndex]} {selectedYear}
                        </div>
                        {depositStatus[`${selectedYear}-${selectedMonthIndex}`] && (
                          <div className="absolute top-0 right-0 border-[6px] border-green-600 text-green-600 font-black text-3xl px-6 py-3 rounded-2xl rotate-[-12deg] opacity-60 print:opacity-100 scale-75">SUDAH DISETOR</div>
                        )}
                    </div>

                    {/* SUMMARY BOX */}
                    <div className="grid grid-cols-2 gap-8 mb-12">
                        <div className="bg-slate-50 p-6 border-2 border-slate-100 rounded-3xl">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Total Pemasukan</p>
                            <p className="text-3xl font-black text-slate-900 tracking-tighter">{formatIDR(getMonthlyIncome(selectedMonthIndex, selectedYear))}</p>
                        </div>
                        <div className="bg-slate-50 p-6 border-2 border-slate-100 rounded-3xl">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Jumlah Transaksi</p>
                            <p className="text-3xl font-black text-slate-900 tracking-tighter">{getFilteredPayments().length} <span className="text-sm font-bold text-slate-400 uppercase tracking-normal">Data</span></p>
                        </div>
                    </div>

                    {/* TABLE DATA */}
                    <div className="mb-16">
                        <h4 className="text-xs font-black text-slate-900 uppercase tracking-[0.3em] mb-6 flex items-center gap-3">
                          <div className="w-8 h-1 bg-blue-600 rounded-full"></div> RINCIAN PEMBAYARAN
                        </h4>
                        <table className="w-full text-[11px] text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-900 text-white">
                                    <th className="p-4 rounded-tl-xl font-black uppercase tracking-widest border-r border-slate-700">Tgl</th>
                                    <th className="p-4 font-black uppercase tracking-widest border-r border-slate-700">Kamar</th>
                                    <th className="p-4 font-black uppercase tracking-widest border-r border-slate-700">Penghuni</th>
                                    <th className="p-4 font-black uppercase tracking-widest border-r border-slate-700">Ket</th>
                                    <th className="p-4 rounded-tr-xl font-black uppercase tracking-widest text-right">Jumlah</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y-2 divide-slate-100 border-x-2 border-b-2 border-slate-100">
                                {getFilteredPayments().length > 0 ? (
                                  getFilteredPayments().map((pay, idx) => (
                                    <tr key={pay.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                                      <td className="p-4 font-bold text-slate-600">{formatDateIndo(pay.date)}</td>
                                      <td className="p-4 font-black text-slate-900">{pay.roomId}</td>
                                      <td className="p-4 font-bold text-slate-700 uppercase">{pay.residentName}</td>
                                      <td className="p-4 font-medium text-slate-500 italic">{pay.type} ({pay.method})</td>
                                      <td className="p-4 font-black text-slate-900 text-right">{formatIDR(pay.amount)}</td>
                                    </tr>
                                  ))
                                ) : (
                                  <tr><td colSpan="5" className="p-20 text-center text-slate-300 font-bold italic text-sm">Tidak ada data transaksi ditemukan pada periode ini.</td></tr>
                                )}
                            </tbody>
                            <tfoot className="bg-slate-100 font-black">
                                <tr>
                                    <td colSpan="4" className="p-5 text-right uppercase tracking-[0.2em]">Total Akumulasi</td>
                                    <td className="p-5 text-right text-lg text-blue-700">{formatIDR(getMonthlyIncome(selectedMonthIndex, selectedYear))}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    {/* TANDA TANGAN */}
                    <div className="grid grid-cols-2 gap-20 px-10 text-center break-inside-avoid mt-20">
                        <div className="space-y-24">
                            <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Disiapkan Oleh (Admin)</p>
                            <div className="space-y-1">
                              <p className="font-black text-slate-900 text-sm border-b-2 border-slate-900 inline-block px-10 pb-1">PETUGAS LAPANGAN</p>
                              <p className="text-[10px] font-bold text-slate-400">Dicetak: {new Date().toLocaleDateString()}</p>
                            </div>
                        </div>
                        <div className="space-y-24">
                            <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Disahkan Oleh (Owner)</p>
                            <div className="space-y-1">
                              <p className="font-black text-slate-900 text-sm border-b-2 border-slate-900 inline-block px-10 pb-1">PEMILIK KOS</p>
                              <p className="text-[10px] font-bold text-slate-400 italic">Official Approval</p>
                            </div>
                        </div>
                    </div>
                    
                    {/* FOOTER PDF */}
                    <div className="mt-20 pt-8 border-t border-slate-100 text-center">
                        <p className="text-[8px] font-black text-slate-300 uppercase tracking-[0.5em]">Auto-Generated Report By Pro-Kos Digital System • MF Group</p>
                    </div>
                </div>
               </div>
            </div>
          )}

          {/* MODAL CHECKOUT */}
          {showCheckoutModal && checkoutData && (
            <div className="fixed inset-0 bg-slate-900/70 z-[100] flex items-center justify-center p-4 backdrop-blur-md">
              <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-sm overflow-hidden text-center animate-in zoom-in duration-300">
                  <div className="bg-red-50 p-10 flex flex-col items-center border-b border-red-100">
                    <div className="w-24 h-24 bg-red-100 text-red-500 rounded-full flex items-center justify-center mb-6 shadow-xl shadow-red-50 animate-bounce"><LogOut size={48} /></div>
                    <h3 className="text-2xl font-black text-red-600 tracking-tighter">KONFIRMASI KELUAR</h3>
                    <p className="text-slate-500 font-medium text-sm mt-3 leading-relaxed px-4">Apakah Anda yakin ingin memproses checkout untuk penghuni <b>{checkoutData.resident}</b> di Kamar <b>{checkoutData.number}</b>?</p>
                  </div>
                  <div className="p-8 bg-white flex flex-col gap-3 px-10">
                    <button onClick={handleConfirmCheckout} className="w-full py-4 bg-red-600 text-white rounded-2xl font-black text-lg shadow-xl shadow-red-100 hover:bg-red-700 active:scale-95 transition-all">YA, PROSES KELUAR</button>
                    <button onClick={() => setShowCheckoutModal(false)} className="w-full py-2 font-black text-slate-400 hover:text-slate-600 text-sm tracking-widest uppercase transition-colors">TIDAK, KEMBALI</button>
                  </div>
              </div>
            </div>
          )}

          {/* DETAIL PENGHUNI (MODAL DATA DIRI) */}
          {showResidentDetail && selectedRoomForResident && (
            <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                  <div className="bg-slate-900 p-8 text-white flex justify-between items-start">
                    <div>
                        <h2 className="text-3xl font-black tracking-tighter">{selectedRoomForResident.number}</h2>
                        <p className="opacity-60 text-xs font-bold uppercase tracking-widest mt-1">Status: Aktif Menghuni</p>
                    </div>
                    <button onClick={() => setShowResidentDetail(false)} className="p-2 hover:bg-white/20 rounded-full transition-colors"><X size={24}/></button>
                  </div>
                  <div className="p-8 space-y-6">
                    <div className="flex items-center gap-5 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <div className="bg-blue-600 p-3 rounded-xl text-white shadow-lg shadow-blue-100"><Users size={28} /></div>
                        <div><h3 className="font-black text-xl text-slate-800 leading-tight uppercase tracking-tighter">{selectedRoomForResident.resident}</h3><span className="text-[10px] bg-green-500 text-white px-2 py-0.5 rounded-full font-black uppercase">Verified Tenant</span></div>
                    </div>
                    <div className="grid grid-cols-2 gap-6 text-sm">
                        <div className="space-y-1">
                            <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Terdaftar Sejak</p>
                            <p className="font-black text-slate-800">{selectedRoomForResident.entryDate || '-'}</p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Siklus Tagihan</p>
                            <p className="font-black text-blue-600">{selectedRoomForResident.nextPaymentDate || '-'}</p>
                        </div>
                    </div>
                    <div className="space-y-3 pt-4 border-t border-slate-100">
                        <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest flex items-center gap-2"><FileText size={14}/> Lampiran Identitas (KTP)</p>
                        {selectedRoomForResident.ktpPhoto ? (
                            <img src={selectedRoomForResident.ktpPhoto} alt="KTP" className="w-full h-48 object-cover rounded-2xl border-2 border-slate-200 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => window.open(selectedRoomForResident.ktpPhoto, '_blank')} />
                        ) : (
                            <div className="w-full h-40 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center text-slate-300 gap-2">
                                <Info size={32} />
                                <p className="text-xs font-bold italic">Belum ada foto KTP terlampir</p>
                            </div>
                        )}
                    </div>
                  </div>
                  <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-center">
                    <button onClick={() => setShowResidentDetail(false)} className="w-full py-3.5 bg-white border border-slate-200 rounded-2xl text-xs font-black text-slate-500 uppercase tracking-widest hover:bg-slate-100 transition-all shadow-sm">Tutup Profil</button>
                  </div>
              </div>
            </div>
          )}

          {/* PENGATURAN USER & PASSWORD */}
          {activeTab === 'settings' && (
              <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in duration-500">
                  <div className="bg-white p-10 rounded-[40px] border shadow-sm space-y-10">
                      <div className="flex items-center gap-5 border-b border-slate-100 pb-8">
                        <div className="bg-blue-600 p-4 rounded-3xl text-white shadow-xl shadow-blue-100"><Lock size={32}/></div>
                        <div>
                            <h3 className="font-black text-2xl text-slate-800 tracking-tighter">KEAMANAN AKSES</h3>
                            <p className="text-sm text-slate-400 font-medium">Gunakan kode unik untuk akses login Owner dan Admin.</p>
                        </div>
                      </div>
                      <div className="space-y-8">
                        <div className="space-y-3">
                            <label className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Kode Akses Owner (Pemilik)</label>
                            <input type="text" className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-slate-700 tracking-widest focus:ring-4 focus:ring-blue-100 outline-none transition-all" value={config.ownerCode} onChange={(e) => setConfig({...config, ownerCode: e.target.value})} />
                        </div>
                        <div className="space-y-3">
                            <label className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Kode Akses Admin (Petugas)</label>
                            <input type="text" className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-slate-700 tracking-widest focus:ring-4 focus:ring-blue-100 outline-none transition-all" value={config.adminCode} onChange={(e) => setConfig({...config, adminCode: e.target.value})} />
                        </div>
                        <div className="pt-4">
                            <button onClick={handleSaveSettings} className="w-full bg-slate-900 text-white font-black py-5 rounded-[25px] shadow-2xl shadow-slate-200 hover:bg-black active:scale-[0.98] transition-all flex items-center justify-center gap-3 text-lg">
                                <Save size={24} /> SIMPAN PERUBAHAN
                            </button>
                        </div>
                      </div>
                  </div>
              </div>
          )}

        </div>
      </main>

      {/* BOTTOM NAV FOR MOBILE */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-lg border-t border-slate-200 flex justify-around p-3 z-50 print:hidden shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.1)]">
        {userRole === 'admin' ? (
          <>
            <NavItem id="dashboard" icon={LayoutDashboard} label="Status" />
            <NavItem id="rooms" icon={Bed} label="Kamar" />
            <NavItem id="history" icon={History} label="Rekap" />
            <NavItem id="settings" icon={Settings} label="Akses" />
          </>
        ) : (
          <>
            <NavItem id="monitor" icon={LayoutDashboard} label="Monitor" />
            <NavItem id="reports" icon={Printer} label="Cetak" />
            <button onClick={handleLogout} className="flex flex-col items-center gap-1 p-2 text-red-500 transition-active active:scale-90">
                <LogOut size={24} />
                <span className="text-[9px] font-black uppercase tracking-tighter">Keluar</span>
            </button>
          </>
        )}
      </nav>
    </div>
  );
};

export default App;