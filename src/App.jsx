import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, Bed, History, Settings, LogOut, Plus, 
  Printer, Home, CreditCard, AlertCircle, UserPlus, Pencil, 
  X, Users, ChevronRight, Info, Upload, FileText, DoorOpen, 
  CalendarCheck, Wallet, CheckCircle2, Calendar, ArrowLeft, 
  Stamp, Clock, Save, Lock, TrendingUp
} from 'lucide-react';

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

// Format Mata Uang IDR
const formatIDR = (amount) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
  }).format(amount);
};

// Helper: Tambah Bulan untuk Next Payment
const addMonths = (dateStr, months) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  date.setMonth(date.getMonth() + months);
  return date.toISOString().split('T')[0];
};

// Helper: Hitung selisih hari (untuk status telat)
const getDaysOverdue = (dueDate) => {
  if (!dueDate) return 0;
  const today = new Date();
  const due = new Date(dueDate);
  // Reset jam agar hitungan murni hari
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  
  const diffTime = today - due;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
  return diffDays > 0 ? diffDays : 0;
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
  const [selectedRoom, setSelectedRoom] = useState(null); // Untuk detail dashboard
  const [editingId, setEditingId] = useState(null); 
  const [showRoomForm, setShowRoomForm] = useState(false); // Edit Fisik Kamar
  
  const [showResidentForm, setShowResidentForm] = useState(false); // Tambah Penghuni
  const [showResidentDetail, setShowResidentDetail] = useState(false); // Detail Penghuni
  const [selectedRoomForResident, setSelectedRoomForResident] = useState(null); 

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentFormData, setPaymentFormData] = useState({ roomId: null, amount: 0, date: '', method: 'Transfer', nextDueDate: '' });
  
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [checkoutData, setCheckoutData] = useState(null);

  // --- STATE LAPORAN ---
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [reportViewMode, setReportViewMode] = useState('grid'); // 'grid' atau 'detail'
  const [selectedMonthIndex, setSelectedMonthIndex] = useState(null); // 0-11
  const [depositStatus, setDepositStatus] = useState({}); // { "2024-0": true } -> Format YYYY-MonthIndex

  // --- CONFIG ---
  const [config, setConfig] = useState({
    ownerCode: 'OWNER123',
    adminCode: 'ADMIN456'
  });

  // --- INITIAL DATA GENERATOR (BERSIH / KOSONG) ---
  const generateInitialRooms = () => {
    return Array.from({ length: 20 }, (_, i) => {
      const num = i + 1;
      const roomNumber = `ROOM ${num < 10 ? '0' + num : num}`;
      const isFloor1 = num <= 10;
      
      return {
        id: num,
        number: roomNumber,
        price: isFloor1 ? 1500000 : 1300000,
        type: isFloor1 ? 'Standard' : 'Ekonomis',
        floor: isFloor1 ? '1' : '2',
        bathroom: isFloor1 ? 'Dalam' : 'Luar',
        desc: isFloor1 ? 'AC, Kasur, Lemari' : 'Kipas, Kasur, Meja',
        resident: '', 
        entryDate: '',
        nextPaymentDate: '',
        ktpPhoto: null,
        status: 'Available',
        debt: 0
      };
    });
  };

  const [rooms, setRooms] = useState([]); 
  const [payments, setPayments] = useState([]); // Riwayat transaksi

  // --- USE EFFECT: LOAD DATA DARI FIREBASE (AUTO RUN) ---
  useEffect(() => {
    const fetchData = async () => {
      try {
        // 1. Ambil Data Kamar
        const snapshot = await getDocs(collection(db, "rooms"));
        
        if (snapshot.empty) {
          // Kalau kosong, buat data awal otomatis
          const dataAwal = generateInitialRooms();
          setRooms(dataAwal);
          dataAwal.forEach(async (room) => {
            await setDoc(doc(db, "rooms", room.number), room);
          });
        } else {
          // Kalau ada, pakai data Firebase
          const dataDariDB = snapshot.docs.map(doc => doc.data());
          dataDariDB.sort((a, b) => a.id - b.id);
          setRooms(dataDariDB);
        }

        // 2. Ambil Riwayat Pembayaran (Payments)
        const paySnapshot = await getDocs(collection(db, "payments"));
        const payData = paySnapshot.docs.map(doc => doc.data());
        // Urutkan dari yang terbaru
        payData.sort((a, b) => b.id - a.id);
        setPayments(payData);

        // 3. Ambil Konfigurasi Password
        const configSnap = await getDoc(doc(db, "settings", "access_codes"));
        if (configSnap.exists()) {
          setConfig(configSnap.data());
        }

        // 4. Ambil Status Setor Laporan
        const depositSnap = await getDoc(doc(db, "settings", "deposits"));
        if (depositSnap.exists()) {
          setDepositStatus(depositSnap.data());
        }

      } catch (error) {
        console.error("Error loading data:", error);
      }
    };

    fetchData();
  }, []);

  // --- FORM STATES ---
  const initialRoomState = { number: '', price: '', type: '', floor: '', bathroom: 'Dalam', desc: '' };
  const [roomFormData, setRoomFormData] = useState(initialRoomState);

  const initialResidentState = { name: '', entryDate: '', nextPaymentDate: '', ktpPhoto: null };
  const [residentFormData, setResidentFormData] = useState(initialResidentState);

  // --- LOGIC AUTH ---
  const handleLogin = () => {
    if (loginCode === config.ownerCode) {
      setUserRole('owner');
      setIsLoggedIn(true);
      setActiveTab('monitor');
    } else if (loginCode === config.adminCode) {
      setUserRole('admin');
      setIsLoggedIn(true);
      setActiveTab('dashboard');
    } else {
      alert("Kode akses salah!");
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setUserRole(null);
    setLoginCode('');
    setActiveTab('dashboard');
  };

  // --- LOGIC ROOMS (ADMIN) ---
  const openEditRoomForm = (room) => {
    setRoomFormData({
      number: room.number, price: room.price, type: room.type, 
      floor: room.floor, bathroom: room.bathroom, desc: room.desc
    });
    setEditingId(room.id);
    setShowRoomForm(true);
  };

  // --- [FIXED] SIMPAN EDIT KAMAR KE FIREBASE ---
  const handleSaveRoom = async () => {
    if (editingId) {
      try {
        // Cari kamar yang sedang diedit
        const roomToUpdate = rooms.find(r => r.id === editingId);
        if (roomToUpdate) {
            // Update ke Firebase
            await updateDoc(doc(db, "rooms", roomToUpdate.number), {
                price: roomFormData.price,
                desc: roomFormData.desc
            });

            // Update ke Layar
            setRooms(rooms.map(room => room.id === editingId ? { ...room, ...roomFormData } : room));
            alert("Perubahan kamar berhasil disimpan!");
        }
      } catch (error) {
          console.error("Gagal update kamar:", error);
          alert("Gagal update: " + error.message);
      }
    } 
    setShowRoomForm(false);
  };

  // --- LOGIC RESIDENT (ADMIN) ---
  const openResidentRegistration = (room) => {
    const today = new Date().toISOString().split('T')[0];
    const nextMonth = addMonths(today, 1);
    
    setSelectedRoomForResident(room);
    setResidentFormData({ ...initialResidentState, entryDate: today, nextPaymentDate: nextMonth });
    setShowResidentForm(true);
  };

  const openResidentDetail = (room) => {
    setSelectedRoomForResident(room);
    setShowResidentDetail(true);
  };

  const handleKtpUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const imageUrl = URL.createObjectURL(file);
      setResidentFormData({ ...residentFormData, ktpPhoto: imageUrl });
    }
  };

  // --- SIMPAN PENGHUNI KE FIREBASE ---
  const handleSaveResident = async () => {
    if (!residentFormData.name || !residentFormData.entryDate) {
      alert("Nama dan Tanggal Masuk wajib diisi!");
      return;
    }

    try {
      const dataUpdate = {
        resident: residentFormData.name,
        entryDate: residentFormData.entryDate,
        nextPaymentDate: residentFormData.nextPaymentDate,
        ktpPhoto: residentFormData.ktpPhoto || "",
        status: 'Unpaid',
        debt: 0
      };

      await updateDoc(doc(db, "rooms", selectedRoomForResident.number), dataUpdate);

      const updatedRooms = rooms.map(room => {
        if (room.id === selectedRoomForResident.id) {
          return { ...room, ...dataUpdate };
        }
        return room;
      });
      setRooms(updatedRooms);
      setShowResidentForm(false);
      alert("Penghuni berhasil disimpan!");

    } catch (error) {
      console.error(error);
      alert("Gagal simpan: " + error.message);
    }
  };

  // --- LOGIC PAYMENT (ADMIN) ---
  const openPaymentModal = (room) => {
    const today = new Date().toISOString().split('T')[0];
    const baseDate = room.nextPaymentDate || today;
    const nextDue = addMonths(baseDate, 1);

    setPaymentFormData({
      roomId: room.id,
      roomNumber: room.number,
      resident: room.resident,
      amount: room.price + room.debt, 
      date: today,
      method: 'Transfer',
      nextDueDate: nextDue
    });
    setShowPaymentModal(true);
  };

  // --- SIMPAN PEMBAYARAN KE FIREBASE ---
  const handleConfirmPayment = async () => {
    try {
      await updateDoc(doc(db, "rooms", paymentFormData.roomNumber), {
        status: 'Paid',
        debt: 0,
        nextPaymentDate: paymentFormData.nextDueDate 
      });

      const newPayment = {
        id: Date.now(),
        roomId: paymentFormData.roomNumber,
        amount: paymentFormData.amount,
        date: paymentFormData.date,
        type: 'Sewa Bulanan',
        method: paymentFormData.method
      };
      await addDoc(collection(db, "payments"), newPayment);

      setRooms(rooms.map(room => {
        if (room.id === paymentFormData.roomId) {
          return { 
            ...room, 
            status: 'Paid', 
            debt: 0, 
            nextPaymentDate: paymentFormData.nextDueDate 
          };
        }
        return room;
      }));

      setPayments([newPayment, ...payments]);
      setShowPaymentModal(false);
      alert("Pembayaran berhasil disimpan!");

    } catch (error) {
      console.error(error);
      alert("Gagal bayar: " + error.message);
    }
  };

  // --- LOGIC CHECKOUT (ADMIN) ---
  const openCheckoutModal = (room) => {
    setCheckoutData(room);
    setShowCheckoutModal(true);
  };

  // --- SIMPAN CHECKOUT KE FIREBASE ---
  const handleConfirmCheckout = async () => {
    if (!checkoutData) return;

    try {
      await updateDoc(doc(db, "rooms", checkoutData.number), {
        resident: '',
        entryDate: '',
        nextPaymentDate: '',
        ktpPhoto: null,
        status: 'Available',
        debt: 0
      });

      const checkoutLog = {
        id: Date.now(),
        roomId: checkoutData.number,
        amount: 0,
        date: new Date().toISOString().split('T')[0],
        type: 'Checkout / Keluar',
        method: '-'
      };
      await addDoc(collection(db, "payments"), checkoutLog);

      setRooms(rooms.map(room => {
        if(room.id === checkoutData.id) {
          return {
            ...room,
            resident: '',
            entryDate: '',
            nextPaymentDate: '',
            ktpPhoto: null,
            status: 'Available',
            debt: 0
          }
        }
        return room;
      }));

      setPayments([checkoutLog, ...payments]);
      setShowCheckoutModal(false);
      setCheckoutData(null);
      setShowResidentDetail(false); 
      alert("Checkout berhasil diproses!");

    } catch (error) {
      console.error(error);
      alert("Gagal checkout: " + error.message);
    }
  };

  // --- LOGIC GLOBAL (NAVIGATION) ---
  const handleCheckResidentFromDashboard = () => {
    if (selectedRoom) {
      setSelectedRoomForResident(selectedRoom);
      setSelectedRoom(null); 
      setShowResidentDetail(true); 
    }
  };

  // --- SIMPAN SETTINGS KE FIREBASE ---
  const handleSaveSettings = async () => {
    try {
      await setDoc(doc(db, "settings", "access_codes"), config);
      alert("Kode akses berhasil disimpan permanen!");
    } catch (error) {
      console.error("Error:", error);
      alert("Gagal menyimpan: " + error.message);
    }
  };

  // --- LOGIC REPORT ---
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

  // --- SIMPAN STATUS SETOR KE FIREBASE ---
  const toggleDepositStatus = async () => {
    const key = `${selectedYear}-${selectedMonthIndex}`;
    const newStatus = !depositStatus[key];

    // 1. Update State Lokal
    const updatedStatus = { ...depositStatus, [key]: newStatus };
    setDepositStatus(updatedStatus);

    // 2. Simpan ke Firebase
    try {
        await setDoc(doc(db, "settings", "deposits"), {
            [key]: newStatus
        }, { merge: true }); 
    } catch (error) {
        console.error("Gagal simpan status:", error);
        alert("Gagal menyimpan status setor ke database!");
    }
  };

  // --- LOGIC OWNER MONITOR ---
  const occupiedRooms = rooms.filter(r => r.resident).length;
  const overdueRooms = rooms.filter(r => r.resident && (r.status === 'Unpaid' || getDaysOverdue(r.nextPaymentDate) > 0));
  const currentMonthIncome = getMonthlyIncome(new Date().getMonth(), new Date().getFullYear());


  // --- VIEW LOGIN ---
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <div className="bg-blue-600 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 text-white shadow-lg">
              <Home size={32} />
            </div>
            <h1 className="text-2xl font-bold text-slate-800">Manajemen Kos-an</h1>
            <p className="text-slate-500">Silakan masukkan kode akses Anda</p>
          </div>
          <div className="space-y-4">
            <input 
              type="password" 
              placeholder="Masukkan Kode (Default: ADMIN456)" 
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              value={loginCode}
              onChange={(e) => setLoginCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            />
            <button 
              onClick={handleLogin}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl shadow-md active:scale-95 transition-all"
            >
              Masuk
            </button>
          </div>
          <div className="mt-6 text-center text-xs text-slate-400">
            <p>Kode Default:</p>
            <p>Admin: ADMIN456 | Owner: OWNER123</p>
          </div>
        </div>
      </div>
    );
  }

  // Helper Component: Sidebar/Mobile Nav Item
  const NavItem = ({ id, icon: Icon, label }) => (
    <button 
      onClick={() => {
        setActiveTab(id);
        if(id !== 'reports') {
           setReportViewMode('grid');
           setSelectedMonthIndex(null);
        }
      }}
      className={`flex flex-col items-center gap-1 p-2 flex-1 md:flex-row md:gap-4 md:px-6 md:py-3 md:rounded-xl transition-all print:hidden ${
        activeTab === id ? 'text-blue-600 md:bg-blue-50' : 'text-slate-400 hover:text-slate-600'
      }`}
    >
      <Icon size={22} />
      <span className="text-[10px] md:text-sm font-medium">{label}</span>
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row print:block">
      {/* CSS untuk Cetak A4 */}
      <style>{`
        @media print {
          @page { size: A4; margin: 10mm; }
          body { 
            -webkit-print-color-adjust: exact; 
            print-color-adjust: exact; 
            background: white; 
            font-family: 'Times New Roman', Times, serif; 
          }
          .print\\:hidden { display: none !important; }
          .print\\:block { display: block !important; }
          .print\\:w-full { width: 100% !important; margin: 0 !important; padding: 0 !important; }
          .print\\:shadow-none { box-shadow: none !important; border: none !important; }
          .print\\:text-black { color: black !important; }
          
          .bg-slate-100 { background-color: #f1f5f9 !important; }
          .bg-slate-800 { background-color: #1e293b !important; color: white !important; }
          
          table { width: 100%; border-collapse: collapse; }
          th, td { padding: 4px 8px !important; font-size: 11px !important; } 
          th { background-color: #e2e8f0 !important; }
          h1 { font-size: 18px !important; }
          h2 { font-size: 14px !important; }
        }
      `}</style>

      {/* --- SIDEBAR DESKTOP --- */}
      <aside className="hidden md:flex flex-col w-64 bg-white border-r border-slate-200 p-6 sticky top-0 h-screen print:hidden">
        <div className="flex items-center gap-3 mb-10 px-2">
          <div className="bg-blue-600 p-2 rounded-lg text-white">
            <Home size={24} />
          </div>
          <span className="font-bold text-xl text-slate-800 tracking-tight">Pro-Kos</span>
        </div>

        <nav className="space-y-2 flex-1">
          {userRole === 'admin' ? (
            <>
              <NavItem id="dashboard" icon={LayoutDashboard} label="Dashboard" />
              <NavItem id="rooms" icon={Bed} label="Input & Kamar" />
              <NavItem id="history" icon={History} label="Riwayat & Laporan" />
              <NavItem id="settings" icon={Settings} label="Pengaturan" />
            </>
          ) : (
            <>
              <NavItem id="monitor" icon={LayoutDashboard} label="Pantau Kos" />
              <NavItem id="reports" icon={Printer} label="Laporan" />
            </>
          )}
        </nav>

        <button onClick={handleLogout} className="flex items-center gap-4 px-6 py-3 text-red-500 hover:bg-red-50 rounded-xl transition-all">
          <LogOut size={22} />
          <span className="font-medium">Keluar</span>
        </button>
      </aside>

      {/* --- KONTEN UTAMA --- */}
      <main className="flex-1 pb-24 md:pb-0 overflow-y-auto print:w-full print:h-auto print:overflow-visible">
        {/* HEADER MOBILE & DESKTOP */}
        <header className="bg-white border-b border-slate-200 p-4 md:p-6 sticky top-0 z-10 flex justify-between items-center print:hidden">
          <div>
            <h2 className="text-xl font-bold text-slate-800 capitalize">
              {activeTab === 'monitor' ? 'Pantau Kos' : activeTab === 'reports' ? 'Laporan' : activeTab.replace(/([A-Z])/g, ' $1')}
            </h2>
            <p className="text-sm text-slate-500">Selamat datang, {userRole === 'admin' ? 'Pengelola' : 'Pemilik'}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold border border-slate-200">
              {userRole === 'admin' ? 'A' : 'P'}
            </div>
          </div>
        </header>

        <div className="p-4 md:p-8 max-w-7xl mx-auto print:w-full print:p-0 print:max-w-none">
          
          {/* ================= MODAL GLOBAL ================= */}
          
          {/* 1. Modal Edit Fisik Kamar (Admin Only) */}
          {showRoomForm && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm print:hidden">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                  <h4 className="font-bold text-slate-800 flex items-center gap-2">
                    <Pencil size={18}/> Edit Fisik Kamar {roomFormData.number}
                  </h4>
                  <button onClick={() => setShowRoomForm(false)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
                </div>
                <div className="p-6 grid grid-cols-2 gap-4">
                  <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">No. Kamar</label><input className="w-full px-3 py-2 border rounded-lg bg-slate-100 text-slate-500" value={roomFormData.number} disabled /></div>
                  <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Harga</label><input type="number" className="w-full px-3 py-2 border rounded-lg" value={roomFormData.price} onChange={e => setRoomFormData({...roomFormData, price: parseInt(e.target.value) || 0})} /></div>
                  <div className="col-span-2"><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Fasilitas</label><input className="w-full px-3 py-2 border rounded-lg" value={roomFormData.desc} onChange={e => setRoomFormData({...roomFormData, desc: e.target.value})} /></div>
                </div>
                <div className="p-4 bg-slate-50 flex justify-end gap-2">
                    <button onClick={() => setShowRoomForm(false)} className="px-4 py-2 rounded-lg text-slate-600 font-bold hover:bg-slate-200">Batal</button>
                    <button onClick={handleSaveRoom} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700">Simpan Perubahan</button>
                </div>
              </div>
            </div>
          )}

          {/* 2. Modal Registrasi Penghuni */}
          {showResidentForm && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm print:hidden">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="bg-green-600 p-6 flex justify-between items-center text-white">
                    <div><h4 className="font-bold text-lg flex items-center gap-2"><UserPlus size={20}/> Registrasi Penghuni Baru</h4><p className="text-xs opacity-90 mt-1">Kamar {selectedRoomForResident?.number}</p></div>
                    <button onClick={() => setShowResidentForm(false)} className="hover:bg-green-700 p-1 rounded-full"><X size={20}/></button>
                </div>
                <div className="p-6 space-y-4">
                    <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nama Lengkap</label><input className="w-full px-3 py-2 border rounded-lg" value={residentFormData.name} onChange={e => setResidentFormData({...residentFormData, name: e.target.value})} /></div>
                    <div className="grid grid-cols-2 gap-4">
                      <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Tanggal Masuk</label><input type="date" className="w-full px-3 py-2 border rounded-lg" value={residentFormData.entryDate} onChange={e => setResidentFormData({...residentFormData, entryDate: e.target.value})} /></div>
                      <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Jadwal Bayar Selanjutnya</label><input type="date" className="w-full px-3 py-2 border rounded-lg" value={residentFormData.nextPaymentDate} onChange={e => setResidentFormData({...residentFormData, nextPaymentDate: e.target.value})} /></div>
                    </div>
                    <div className="border-t border-slate-100 pt-4">
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Upload Foto KTP</label>
                      <div className="flex items-start gap-4">
                        <label className="cursor-pointer bg-slate-100 hover:bg-slate-200 px-4 py-3 rounded-lg flex items-center gap-2 text-sm font-medium"><Upload size={16} /> Pilih File<input type="file" className="hidden" accept="image/*" onChange={handleKtpUpload} /></label>
                        {residentFormData.ktpPhoto && <img src={residentFormData.ktpPhoto} alt="Preview" className="h-20 w-32 object-cover rounded-lg border" />}
                      </div>
                    </div>
                </div>
                <div className="p-4 bg-slate-50 flex justify-end gap-2 border-t border-slate-100">
                    <button onClick={() => setShowResidentForm(false)} className="px-4 py-2 rounded-lg text-slate-600 font-bold hover:bg-slate-200">Batal</button>
                    <button onClick={handleSaveResident} className="px-6 py-2 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700">Simpan</button>
                </div>
              </div>
            </div>
          )}

          {/* 3. Modal Detail Penghuni (KTP & Status) */}
          {showResidentDetail && selectedRoomForResident && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm print:hidden" style={{ zIndex: 100 }}>
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                  <div className="bg-slate-800 p-6 text-white flex justify-between items-start">
                    <div><h2 className="text-2xl font-black">{selectedRoomForResident.number}</h2><p className="opacity-80 text-sm">Data Penghuni Aktif</p></div>
                    <button onClick={() => setShowResidentDetail(false)} className="hover:bg-slate-700 p-1 rounded-full"><X size={20}/></button>
                  </div>
                  <div className="p-6 space-y-4">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="bg-blue-100 p-3 rounded-full text-blue-600"><Users size={24} /></div>
                        <div><h3 className="font-bold text-lg text-slate-800">{selectedRoomForResident.resident}</h3><span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded font-bold">Aktif</span></div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div><p className="text-slate-500 text-xs font-bold uppercase">Tgl Masuk</p><p className="font-medium text-slate-800">{selectedRoomForResident.entryDate || '-'}</p></div>
                        <div><p className="text-slate-500 text-xs font-bold uppercase">Bayar Berikutnya</p><p className="font-medium text-slate-800">{selectedRoomForResident.nextPaymentDate || '-'}</p></div>
                    </div>
                    <div className="border-t border-slate-100 pt-4">
                        <p className="text-slate-500 text-xs font-bold uppercase mb-2 flex items-center gap-2"><FileText size={12}/> KTP</p>
                        {selectedRoomForResident.ktpPhoto ? (<img src={selectedRoomForResident.ktpPhoto} alt="KTP" className="w-full h-48 object-cover rounded-xl border border-slate-200" onClick={() => window.open(selectedRoomForResident.ktpPhoto, '_blank')} />) : <p className="text-xs text-slate-400 italic">Tidak ada foto KTP</p>}
                    </div>
                  </div>
                  <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
                    <button onClick={() => setShowResidentDetail(false)} className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-100">Tutup</button>
                  </div>
              </div>
            </div>
          )}

          {/* 4. Modal Pembayaran */}
          {showPaymentModal && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm print:hidden">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="bg-blue-600 p-6 flex justify-between items-center text-white">
                    <h4 className="font-bold text-lg flex items-center gap-2"><Wallet size={20}/> Pembayaran Sewa</h4>
                    <button onClick={() => setShowPaymentModal(false)} className="hover:bg-blue-700 p-1 rounded-full"><X size={20}/></button>
                </div>
                <div className="p-6 space-y-4">
                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 mb-4">
                      <p className="text-xs font-bold text-blue-500 uppercase mb-1">{paymentFormData.roomNumber}</p>
                      <h3 className="text-xl font-bold text-blue-700">{paymentFormData.resident}</h3>
                    </div>
                    <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Jumlah Bayar</label><input type="number" className="w-full px-3 py-2 border rounded-lg font-bold text-lg" value={paymentFormData.amount} onChange={e => setPaymentFormData({...paymentFormData, amount: parseInt(e.target.value) || 0})} /></div>
                    <div className="grid grid-cols-2 gap-4">
                      <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Metode</label><select className="w-full px-3 py-2 border rounded-lg bg-white" value={paymentFormData.method} onChange={e => setPaymentFormData({...paymentFormData, method: e.target.value})}><option value="Transfer">Transfer</option><option value="Tunai">Tunai</option><option value="QRIS">QRIS</option></select></div>
                      <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Tanggal Bayar</label><input type="date" className="w-full px-3 py-2 border rounded-lg" value={paymentFormData.date} onChange={e => setPaymentFormData({...paymentFormData, date: e.target.value})} /></div>
                    </div>
                    <div className="pt-2 border-t border-slate-100 mt-2">
                      <label className="block text-xs font-bold text-green-600 uppercase mb-1">Perpanjang Sampai</label>
                      <input type="date" className="w-full px-3 py-2 border border-green-200 bg-green-50 rounded-lg text-green-700 font-bold" value={paymentFormData.nextDueDate} onChange={e => setPaymentFormData({...paymentFormData, nextDueDate: e.target.value})} />
                    </div>
                </div>
                <div className="p-4 bg-slate-50 flex justify-end gap-2 border-t border-slate-100">
                    <button onClick={() => setShowPaymentModal(false)} className="px-4 py-2 rounded-lg text-slate-600 font-bold hover:bg-slate-200">Batal</button>
                    <button onClick={handleConfirmPayment} className="px-6 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 shadow-md">Konfirmasi Bayar</button>
                </div>
              </div>
            </div>
          )}

          {/* 5. Modal Checkout */}
          {showCheckoutModal && checkoutData && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm print:hidden">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
                  <div className="bg-red-50 p-6 text-center border-b border-red-100">
                    <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4"><LogOut size={32} /></div>
                    <h3 className="text-xl font-bold text-red-600 mb-2">Konfirmasi Keluar</h3>
                    <p className="text-sm text-slate-600">Apakah Anda yakin ingin memproses checkout untuk <span className="font-bold">{checkoutData.resident}</span>?</p>
                  </div>
                  <div className="p-4 bg-white flex justify-center gap-3">
                    <button onClick={() => setShowCheckoutModal(false)} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 font-bold hover:bg-slate-50">Batal</button>
                    <button onClick={handleConfirmCheckout} className="px-6 py-2 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 shadow-lg shadow-red-200">Ya, Checkout</button>
                  </div>
              </div>
            </div>
          )}

          {/* 6. Modal Detail Dashboard (View Info & History per Kamar) */}
          {selectedRoom && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 print:hidden backdrop-blur-sm">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="bg-slate-800 p-6 flex justify-between items-start text-white">
                  <div>
                    <p className="text-slate-400 text-xs uppercase font-bold mb-1">Detail Kamar</p>
                    <h2 className="text-3xl font-black">{selectedRoom.number}</h2>
                    <p className="text-sm opacity-80">{selectedRoom.type} • Lantai {selectedRoom.floor}</p>
                  </div>
                  <button onClick={() => setSelectedRoom(null)} className="p-1 hover:bg-slate-700 rounded-full transition-colors"><X size={24} /></button>
                </div>
                
                <div className="p-6 space-y-6">
                    <div className={`p-4 rounded-xl border ${selectedRoom.status === 'Paid' ? 'bg-green-50 border-green-200' : (getDaysOverdue(selectedRoom.nextPaymentDate) > 0 && selectedRoom.resident) ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
                        <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-2"><CreditCard size={18}/> Status Pembayaran</h4>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div><p className="text-slate-500 text-xs">Penghuni</p><p className="font-bold">{selectedRoom.resident || '-'}</p></div>
                          <div><p className="text-slate-500 text-xs">Jatuh Tempo</p><p className={`font-bold ${getDaysOverdue(selectedRoom.nextPaymentDate) > 0 ? 'text-red-600' : 'text-slate-800'}`}>{selectedRoom.nextPaymentDate || '-'}</p></div>
                        </div>
                        <div className="mt-3 pt-3 border-t border-dashed border-slate-300">
                           {selectedRoom.resident ? (
                             selectedRoom.status === 'Paid' ? <p className="text-green-600 font-bold flex items-center gap-1"><CheckCircle2 size={16}/> Sudah Terbayar</p> : <p className="text-red-600 font-bold flex items-center gap-1"><AlertCircle size={16}/> {getDaysOverdue(selectedRoom.nextPaymentDate) > 0 ? `Belum Terbayar (Telat ${getDaysOverdue(selectedRoom.nextPaymentDate)} hari)` : 'Belum Terbayar'}</p>
                           ) : <p className="text-slate-400 italic">Kamar Kosong</p>}
                        </div>
                    </div>

                    <div>
                        <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2"><History size={18}/> Riwayat Pembayaran</h4>
                        <div className="bg-slate-50 rounded-xl border border-slate-200 max-h-40 overflow-y-auto">
                          {payments.filter(p => p.roomId === selectedRoom.number).length > 0 ? (
                            payments.filter(p => p.roomId === selectedRoom.number).map(p => (
                              <div key={p.id} className="p-3 border-b border-slate-100 last:border-0 flex justify-between items-center text-sm">
                                 <div><p className="font-bold text-slate-700">{p.date}</p><p className="text-xs text-slate-500">{p.type} via {p.method}</p></div>
                                 <span className="font-bold text-green-600 bg-green-50 px-2 py-1 rounded text-xs">{formatIDR(p.amount)}</span>
                              </div>
                            ))
                          ) : <div className="p-4 text-center text-slate-400 text-xs italic">Belum ada riwayat pembayaran untuk kamar ini.</div>}
                        </div>
                    </div>

                    {selectedRoom.resident && (
                        <button onClick={handleCheckResidentFromDashboard} className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-200 flex items-center justify-center gap-2 transition-all">
                           <Users size={18} /> Cek Data Penghuni Lengkap &raquo;
                        </button>
                    )}
                </div>
              </div>
            </div>
          )}

          
          {/* ================= VIEW OWNER ================= */}
          {userRole === 'owner' && (
            <div className="space-y-6">
              
              {/* MENU 1: PANTAU KOS (Owner Dashboard) */}
              {activeTab === 'monitor' && (
                <>
                  {/* Rekap Header Owner */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                     {/* Kamar Terisi */}
                     <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                        <div>
                           <p className="text-sm font-bold text-slate-500 mb-1">Kamar Terisi</p>
                           <h3 className="text-3xl font-black text-slate-800">{occupiedRooms} <span className="text-sm font-medium text-slate-400">/ {rooms.length}</span></h3>
                        </div>
                        <div className="bg-blue-50 p-3 rounded-xl text-blue-600"><Bed size={28} /></div>
                     </div>

                     {/* Total Pendapatan */}
                     <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                        <div>
                           <p className="text-sm font-bold text-slate-500 mb-1">Pendapatan Bulan Ini</p>
                           <h3 className="text-2xl font-black text-green-600">{formatIDR(currentMonthIncome)}</h3>
                        </div>
                        <div className="bg-green-50 p-3 rounded-xl text-green-600"><TrendingUp size={28} /></div>
                     </div>

                     {/* Kamar Nunggak */}
                     <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm md:col-span-1">
                        <div className="flex justify-between items-start mb-2">
                           <p className="text-sm font-bold text-slate-500">Nunggak / Belum Bayar</p>
                           <div className="bg-red-50 p-2 rounded-lg text-red-600"><AlertCircle size={20}/></div>
                        </div>
                        {overdueRooms.length > 0 ? (
                           <div className="space-y-2 max-h-24 overflow-y-auto pr-1">
                              {overdueRooms.map(r => (
                                 <div key={r.id} className="flex justify-between items-center text-xs p-2 bg-red-50 rounded-lg border border-red-100">
                                    <span className="font-bold text-slate-700">{r.number}</span>
                                    <span className="text-red-600 font-bold">{r.nextPaymentDate}</span>
                                 </div>
                              ))}
                           </div>
                        ) : (
                           <p className="text-xs text-slate-400 italic mt-2">Tidak ada yang menunggak.</p>
                        )}
                     </div>
                  </div>

                  {/* Grid Dashboard */}
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm mt-6">
                     <h3 className="font-bold text-lg text-slate-800 mb-6">Status Kamar Real-time</h3>
                     <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                        {rooms.map(room => {
                           const isOccupied = !!room.resident;
                           const overdueDays = getDaysOverdue(room.nextPaymentDate);
                           const isOverdue = isOccupied && overdueDays > 0;
                           const isPaid = room.status === 'Paid';

                           let cardClass = 'bg-white border-slate-200 hover:border-blue-300';
                           let statusBadge = null;

                           if (isOccupied) {
                             if (isOverdue) {
                                 cardClass = 'bg-red-50 border-red-300 hover:border-red-500';
                                 statusBadge = <span className="text-[10px] font-bold text-white bg-red-500 px-2 py-0.5 rounded-full">TELAT</span>;
                             } else if (isPaid) {
                                 cardClass = 'bg-green-50 border-green-300 hover:border-green-500';
                                 statusBadge = <span className="text-[10px] font-bold text-white bg-green-500 px-2 py-0.5 rounded-full">LUNAS</span>;
                             } else {
                                 cardClass = 'bg-yellow-50 border-yellow-300 hover:border-yellow-500';
                                 statusBadge = <span className="text-[10px] font-bold text-yellow-700 bg-yellow-200 px-2 py-0.5 rounded-full">TAGIH</span>;
                             }
                           }

                           return (
                             <div 
                                key={room.id} 
                                onClick={() => setSelectedRoom(room)}
                                className={`p-4 rounded-2xl border-2 transition-all cursor-pointer shadow-sm hover:shadow-md relative overflow-hidden ${cardClass}`}
                             >
                                <div className="flex justify-between items-start mb-2">
                                   <span className="font-black text-xl text-slate-800">{room.number.replace('ROOM ', '')}</span>
                                   {isOverdue && <AlertCircle size={18} className="text-red-500" />}
                                   {isPaid && <CheckCircle2 size={18} className="text-green-500" />}
                                </div>
                                <div className="space-y-1 relative z-10">
                                   <p className="text-xs font-bold text-slate-700 truncate">
                                      {room.resident || <span className="text-slate-400 font-normal">Kosong</span>}
                                   </p>
                                   <div className="flex items-center justify-between">
                                      <p className="text-[10px] text-slate-500">{formatIDR(room.price)}</p>
                                      {statusBadge}
                                   </div>
                                </div>
                             </div>
                           );
                        })}
                     </div>
                  </div>
                </>
              )}

              {/* MENU 2: LAPORAN (Owner View - Read Only but Printable) */}
              {activeTab === 'reports' && (
                <div className="space-y-6">
                   {reportViewMode === 'grid' ? (
                     <>
                        <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                           <h3 className="font-bold text-lg text-slate-800">Arsip Laporan {selectedYear}</h3>
                           <div className="flex gap-2">
                             <button onClick={() => setSelectedYear(selectedYear - 1)} className="p-2 bg-slate-100 rounded-lg hover:bg-slate-200 font-bold">&laquo;</button>
                             <span className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg font-bold">{selectedYear}</span>
                             <button onClick={() => setSelectedYear(selectedYear + 1)} className="p-2 bg-slate-100 rounded-lg hover:bg-slate-200 font-bold">&raquo;</button>
                           </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                           {MONTH_NAMES.map((month, index) => {
                             const income = getMonthlyIncome(index, selectedYear);
                             const isDeposited = depositStatus[`${selectedYear}-${index}`];
                             const statusColor = isDeposited ? 'bg-green-100 text-green-700 border-green-200' : 'bg-white text-slate-500 border-slate-200';
                             const statusText = isDeposited ? 'SUDAH DISETOR' : 'BELUM DISETOR';

                             return (
                               <div key={month} className={`p-4 rounded-2xl border-2 shadow-sm transition-all relative group hover:shadow-md ${statusColor}`}>
                                  <div className="flex justify-between items-start mb-2">
                                     <h4 className="text-sm font-bold uppercase tracking-wider">{month}</h4>
                                     <button 
                                       onClick={(e) => {
                                          e.stopPropagation();
                                          setSelectedMonthIndex(index);
                                          setReportViewMode('detail');
                                          setTimeout(() => window.print(), 100);
                                       }}
                                       className="p-1.5 bg-white rounded-lg text-slate-700 hover:text-blue-600 shadow-sm border border-slate-100"
                                       title="Print Laporan"
                                     >
                                       <Printer size={16} />
                                     </button>
                                  </div>
                                  <p className="text-lg font-black mb-3">{formatIDR(income)}</p>
                                  <div className="flex items-center gap-1 text-[10px] font-bold uppercase opacity-80">
                                     {isDeposited ? <CheckCircle2 size={12}/> : <Clock size={12}/>} {statusText}
                                  </div>
                                  <button 
                                     className="absolute inset-0 z-0" 
                                     onClick={() => {
                                        setSelectedMonthIndex(index);
                                        setReportViewMode('detail');
                                     }}
                                  ></button>
                               </div>
                             );
                           })}
                        </div>
                     </>
                   ) : (
                     /* Detail Laporan A4 (Shared UI) */
                     <>
                        <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6 print:hidden">
                          <button onClick={() => setReportViewMode('grid')} className="flex items-center gap-2 text-slate-600 font-bold hover:text-blue-600 transition-colors"><ArrowLeft size={20} /> Kembali</button>
                          <button onClick={() => window.print()} className="bg-slate-800 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-slate-900 transition-all shadow-lg"><Printer size={18} /> Cetak PDF</button>
                        </div>
                        {/* Kertas A4 */}
                        <div className="bg-white p-8 md:p-12 rounded-none md:rounded-2xl border border-slate-200 shadow-xl print:shadow-none print:border-none print:w-full max-w-[210mm] mx-auto min-h-[297mm] relative print:p-0">
                          <div className="text-center border-b-4 border-slate-800 pb-4 mb-6 relative">
                             <h1 className="text-2xl font-black text-slate-800 tracking-wide uppercase">Laporan Keuangan Kos</h1>
                             <p className="text-slate-500 text-sm font-medium mt-1">Periode Laporan</p>
                             <h2 className="text-lg font-bold text-blue-600 mt-1 uppercase border-2 border-blue-100 inline-block px-4 py-1 rounded bg-blue-50">{MONTH_NAMES[selectedMonthIndex]} {selectedYear}</h2>
                             {depositStatus[`${selectedYear}-${selectedMonthIndex}`] && (<div className="absolute top-0 right-0 border-4 border-green-600 text-green-600 font-black text-xl px-4 py-2 rounded rotate-[-15deg] opacity-80 print:opacity-100">SUDAH DISETOR</div>)}
                          </div>
                          {/* Isi Laporan sama dengan Admin */}
                          <div className="grid grid-cols-2 gap-4 mb-6 print:grid-cols-2">
                             <div className="bg-slate-50 p-3 border border-slate-200 rounded-xl print:border-black"><p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Total Pemasukan</p><p className="text-xl font-black text-slate-800">{formatIDR(getMonthlyIncome(selectedMonthIndex, selectedYear))}</p></div>
                             <div className="bg-slate-50 p-3 border border-slate-200 rounded-xl print:border-black"><p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Total Transaksi</p><p className="text-xl font-black text-slate-800">{getFilteredPayments().length} <span className="text-xs font-normal text-slate-500">transaksi</span></p></div>
                          </div>
                          <div className="mb-8">
                            <h3 className="font-bold text-slate-800 mb-2 text-sm border-l-4 border-blue-500 pl-3">Rincian Transaksi</h3>
                            <div className="overflow-hidden border border-slate-300 rounded-lg">
                              <table className="w-full text-[10px] text-left">
                                <thead className="bg-slate-100 text-slate-700 font-bold uppercase border-b border-slate-300 print:bg-slate-200">
                                  <tr><th className="px-2 py-2 border-r border-slate-300 w-1/6">Tanggal</th><th className="px-2 py-2 border-r border-slate-300 w-1/6">Kamar</th><th className="px-2 py-2 border-r border-slate-300 w-2/6">Keterangan</th><th className="px-2 py-2 text-right w-2/6">Jumlah</th></tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200">
                                  {getFilteredPayments().length > 0 ? (getFilteredPayments().map((pay, index) => (<tr key={pay.id} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}><td className="px-2 py-1 border-r border-slate-200 font-medium">{pay.date}</td><td className="px-2 py-1 border-r border-slate-200 font-bold">{pay.roomId}</td><td className="px-2 py-1 border-r border-slate-200 text-slate-600">{pay.type} ({pay.method})</td><td className="px-2 py-1 text-right font-bold text-slate-800">{formatIDR(pay.amount)}</td></tr>))) : (<tr><td colSpan="4" className="px-4 py-8 text-center text-slate-400 italic">Tidak ada transaksi pada bulan ini.</td></tr>)}
                                </tbody>
                                <tfoot className="bg-slate-100 border-t-2 border-slate-300 font-bold print:bg-slate-200"><tr><td colSpan="3" className="px-2 py-2 text-right uppercase">Total Bulan Ini</td><td className="px-2 py-2 text-right text-blue-800 text-sm">{formatIDR(getMonthlyIncome(selectedMonthIndex, selectedYear))}</td></tr></tfoot>
                              </table>
                            </div>
                          </div>
                          <div className="flex justify-between mt-12 px-8 break-inside-avoid"><div className="text-center"><p className="text-xs font-medium text-slate-600 mb-12">Diserahkan Oleh,</p><p className="font-bold text-sm text-slate-800 border-b border-slate-400 pb-1 px-4">Pengelola Kos</p></div><div className="text-center"><p className="text-xs font-medium text-slate-600 mb-12">Diterima Oleh,</p><p className="font-bold text-sm text-slate-800 border-b border-slate-400 pb-1 px-4">Pemilik Kos</p></div></div>
                          <div className="mt-8 text-center text-[8px] text-slate-400 border-t border-slate-100 pt-2 print:fixed print:bottom-4 print:left-0 print:right-0">Dicetak otomatis oleh Sistem Manajemen Pro-Kos pada {new Date().toLocaleString('id-ID')}</div>
                       </div>
                     </>
                   )}
                </div>
              )}
            </div>
          )}

          {/* ================= VIEW PENGELOLA (ADMIN) ================= */}
          {userRole === 'admin' && (
            <div className="space-y-8">
              
              {/* MENU 1: DASHBOARD */}
              {activeTab === 'dashboard' && (
                <div className="space-y-6">
                  {/* Legend Warna Grid */}
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center print:hidden gap-4">
                    <h3 className="font-bold text-lg text-slate-800">Status Grid Kamar</h3>
                    <div className="flex flex-wrap gap-3">
                       <span className="flex items-center gap-1 text-xs text-slate-600 bg-white px-2 py-1 rounded border"><div className="w-3 h-3 bg-white border border-slate-300 rounded-full"></div> Kosong</span>
                       <span className="flex items-center gap-1 text-xs text-slate-600 bg-white px-2 py-1 rounded border"><div className="w-3 h-3 bg-yellow-400 rounded-full"></div> Terisi</span>
                       <span className="flex items-center gap-1 text-xs text-slate-600 bg-white px-2 py-1 rounded border"><div className="w-3 h-3 bg-green-500 rounded-full"></div> Lunas</span>
                       <span className="flex items-center gap-1 text-xs text-slate-600 bg-white px-2 py-1 rounded border"><div className="w-3 h-3 bg-red-500 rounded-full"></div> Telat Bayar</span>
                    </div>
                  </div>

                  {/* GRID KAMAR */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {rooms.map(room => {
                      const isOccupied = !!room.resident;
                      const overdueDays = getDaysOverdue(room.nextPaymentDate);
                      const isOverdue = isOccupied && overdueDays > 0;
                      const isPaid = room.status === 'Paid';

                      let cardClass = 'bg-white border-slate-200 hover:border-blue-300';
                      let statusBadge = null;

                      if (isOccupied) {
                        if (isOverdue) {
                          cardClass = 'bg-red-50 border-red-300 hover:border-red-500';
                          statusBadge = <span className="text-[10px] font-bold text-white bg-red-500 px-2 py-0.5 rounded-full">TELAT {overdueDays} HARI</span>;
                        } else if (isPaid) {
                          cardClass = 'bg-green-50 border-green-300 hover:border-green-500';
                          statusBadge = <span className="text-[10px] font-bold text-white bg-green-500 px-2 py-0.5 rounded-full">LUNAS</span>;
                        } else {
                          cardClass = 'bg-yellow-50 border-yellow-300 hover:border-yellow-500';
                          statusBadge = <span className="text-[10px] font-bold text-yellow-700 bg-yellow-200 px-2 py-0.5 rounded-full">BELUM BAYAR</span>;
                        }
                      }

                      return (
                        <div 
                          key={room.id} 
                          onClick={() => setSelectedRoom(room)}
                          className={`p-4 rounded-2xl border-2 transition-all cursor-pointer shadow-sm hover:shadow-md relative overflow-hidden ${cardClass}`}
                        >
                           <div className="flex justify-between items-start mb-2">
                            <span className="font-black text-xl text-slate-800">{room.number.replace('ROOM ', '')}</span>
                            {isOverdue && <AlertCircle size={18} className="text-red-500 animate-pulse" />}
                            {isPaid && <CheckCircle2 size={18} className="text-green-500" />}
                          </div>
                          <div className="space-y-1 relative z-10">
                            <p className="text-xs font-bold text-slate-700 truncate">
                              {room.resident || <span className="text-slate-400 font-normal">Kosong</span>}
                            </p>
                            <div className="flex items-center justify-between">
                              <p className="text-[10px] text-slate-500">{formatIDR(room.price)}</p>
                              {statusBadge}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* MENU 2: INPUT & KAMAR */}
              {activeTab === 'rooms' && (
                <div className="space-y-8">
                  <div className="bg-white p-6 rounded-2xl border border-slate-200">
                    <div className="flex justify-between items-center mb-6">
                      <h3 className="font-bold text-lg">Kelola Kamar (Data Paten)</h3>
                    </div>
                    {/* LIST KAMAR */}
                    <div className="space-y-4">
                       {rooms.map(room => (
                         <div key={room.id} className="flex flex-col md:flex-row md:items-center justify-between p-4 border border-slate-100 rounded-xl hover:border-blue-200 transition-all break-inside-avoid">
                            <div className="flex items-center gap-4 mb-4 md:mb-0">
                               <div className="h-12 w-12 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 font-black">{room.number.replace('ROOM ', '')}</div>
                               <div><h4 className="font-bold text-slate-800">{room.resident ? room.resident : <span className="text-slate-400 italic">Belum ada penghuni</span>}</h4><p className="text-xs text-slate-500">{room.type} • {formatIDR(room.price)}</p></div>
                            </div>
                            <div className="flex items-center gap-3 print:hidden">
                               <button onClick={() => openEditRoomForm(room)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all" title="Edit Fisik Kamar"><Pencil size={18} /></button>
                               {room.status === 'Available' ? (
                                  <button onClick={() => openResidentRegistration(room)} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-green-700 shadow-md transition-all"><UserPlus size={16} /> Tambah Penghuni</button>
                               ) : (
                                  <>
                                    <button onClick={() => openResidentDetail(room)} className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-all" title="Info Penghuni"><Info size={18} /></button>
                                    <button onClick={() => openPaymentModal(room)} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-md shadow-blue-100 hover:shadow-none hover:bg-blue-700 transition-all flex items-center gap-2"><CreditCard size={16}/> Bayar</button>
                                    <button onClick={() => openCheckoutModal(room)} className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-all" title="Penghuni Keluar"><DoorOpen size={18} /></button>
                                  </>
                               )}
                            </div>
                         </div>
                       ))}
                    </div>
                  </div>
                </div>
              )}

              {/* MENU 3: RIWAYAT & LAPORAN */}
              {activeTab === 'history' && (
                <div className="space-y-6">
                   {reportViewMode === 'grid' ? (
                     <>
                        <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-slate-200">
                           <h3 className="font-bold text-lg text-slate-800">Laporan Keuangan {selectedYear}</h3>
                           <div className="flex gap-2">
                             <button onClick={() => setSelectedYear(selectedYear - 1)} className="p-2 bg-slate-100 rounded-lg hover:bg-slate-200 font-bold">&laquo;</button>
                             <span className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg font-bold">{selectedYear}</span>
                             <button onClick={() => setSelectedYear(selectedYear + 1)} className="p-2 bg-slate-100 rounded-lg hover:bg-slate-200 font-bold">&raquo;</button>
                           </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                           {MONTH_NAMES.map((month, index) => {
                             const income = getMonthlyIncome(index, selectedYear);
                             const isDeposited = depositStatus[`${selectedYear}-${index}`];
                             const statusColor = isDeposited ? 'bg-green-100 text-green-700 border-green-200' : 'bg-yellow-50 text-yellow-700 border-yellow-200';
                             const statusText = isDeposited ? 'SUDAH DISETORKAN' : 'BELUM SETOR';

                             return (
                               <button 
                                 key={month} 
                                 onClick={() => {
                                   setSelectedMonthIndex(index);
                                   setReportViewMode('detail');
                                 }}
                                 className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-300 transition-all text-left relative overflow-hidden"
                               >
                                  <div className="flex justify-between items-start mb-4">
                                     <span className="text-xl font-black text-slate-800 opacity-30">{index + 1 < 10 ? `0${index + 1}` : index + 1}</span>
                                     <Calendar size={20} className="text-blue-500 opacity-50" />
                                  </div>
                                  <h4 className="text-lg font-bold text-slate-800 mb-1">{month}</h4>
                                  <p className="text-xl font-black text-slate-700 mb-4">{formatIDR(income)}</p>
                                  
                                  <div className={`text-[10px] font-bold px-2 py-1 rounded border inline-flex items-center gap-1 ${statusColor}`}>
                                     {isDeposited ? <CheckCircle2 size={10} /> : <Clock size={10} />} {statusText}
                                  </div>
                               </button>
                             );
                           })}
                        </div>
                     </>
                   ) : (
                     <>
                       {/* Header Detail Admin (Ada Tombol Toggle Setor) */}
                       <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6 print:hidden">
                          <button onClick={() => setReportViewMode('grid')} className="flex items-center gap-2 text-slate-600 font-bold hover:text-blue-600 transition-colors"><ArrowLeft size={20} /> Kembali ke Grid</button>
                          <div className="flex gap-2 w-full md:w-auto">
                             <button 
                                onClick={toggleDepositStatus}
                                className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-md ${depositStatus[`${selectedYear}-${selectedMonthIndex}`] ? 'bg-yellow-50 text-yellow-700 border border-yellow-200 hover:bg-yellow-100' : 'bg-green-600 text-white hover:bg-green-700'}`}
                             >
                                <Stamp size={18} /> 
                                {depositStatus[`${selectedYear}-${selectedMonthIndex}`] ? 'Batalkan Status Setor' : 'Tandai Sudah Setor'}
                             </button>
                             <button onClick={() => window.print()} className="bg-slate-800 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-slate-900 transition-all shadow-lg"><Printer size={18} /> Cetak / PDF</button>
                          </div>
                       </div>
                       
                       {/* Konten Laporan A4 (Sama dengan Owner) */}
                       <div className="bg-white p-8 md:p-12 rounded-none md:rounded-2xl border border-slate-200 shadow-xl print:shadow-none print:border-none print:w-full max-w-[210mm] mx-auto min-h-[297mm] relative print:p-0">
                          {/* (Kop Laporan) */}
                          <div className="text-center border-b-4 border-slate-800 pb-4 mb-6 relative">
                             <h1 className="text-2xl font-black text-slate-800 tracking-wide uppercase">Laporan Keuangan Kos</h1>
                             <p className="text-slate-500 text-sm font-medium mt-1">Periode Laporan</p>
                             <h2 className="text-lg font-bold text-blue-600 mt-1 uppercase border-2 border-blue-100 inline-block px-4 py-1 rounded bg-blue-50">{MONTH_NAMES[selectedMonthIndex]} {selectedYear}</h2>
                             {depositStatus[`${selectedYear}-${selectedMonthIndex}`] && (<div className="absolute top-0 right-0 border-4 border-green-600 text-green-600 font-black text-xl px-4 py-2 rounded rotate-[-15deg] opacity-80 print:opacity-100">SUDAH DISETOR</div>)}
                          </div>
                          {/* (Summary) */}
                          <div className="grid grid-cols-2 gap-4 mb-6 print:grid-cols-2">
                             <div className="bg-slate-50 p-3 border border-slate-200 rounded-xl print:border-black"><p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Total Pemasukan</p><p className="text-xl font-black text-slate-800">{formatIDR(getMonthlyIncome(selectedMonthIndex, selectedYear))}</p></div>
                             <div className="bg-slate-50 p-3 border border-slate-200 rounded-xl print:border-black"><p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Total Transaksi</p><p className="text-xl font-black text-slate-800">{getFilteredPayments().length} <span className="text-xs font-normal text-slate-500">transaksi</span></p></div>
                          </div>
                          {/* (Tabel) */}
                          <div className="mb-8">
                            <h3 className="font-bold text-slate-800 mb-2 text-sm border-l-4 border-blue-500 pl-3">Rincian Transaksi</h3>
                            <div className="overflow-hidden border border-slate-300 rounded-lg">
                              <table className="w-full text-[10px] text-left">
                                <thead className="bg-slate-100 text-slate-700 font-bold uppercase border-b border-slate-300 print:bg-slate-200">
                                  <tr><th className="px-2 py-2 border-r border-slate-300 w-1/6">Tanggal</th><th className="px-2 py-2 border-r border-slate-300 w-1/6">Kamar</th><th className="px-2 py-2 border-r border-slate-300 w-2/6">Keterangan</th><th className="px-2 py-2 text-right w-2/6">Jumlah</th></tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200">
                                  {getFilteredPayments().length > 0 ? (getFilteredPayments().map((pay, index) => (<tr key={pay.id} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}><td className="px-2 py-1 border-r border-slate-200 font-medium">{pay.date}</td><td className="px-2 py-1 border-r border-slate-200 font-bold">{pay.roomId}</td><td className="px-2 py-1 border-r border-slate-200 text-slate-600">{pay.type} ({pay.method})</td><td className="px-2 py-1 text-right font-bold text-slate-800">{formatIDR(pay.amount)}</td></tr>))) : (<tr><td colSpan="4" className="px-4 py-8 text-center text-slate-400 italic">Tidak ada transaksi pada bulan ini.</td></tr>)}
                                </tbody>
                                <tfoot className="bg-slate-100 border-t-2 border-slate-300 font-bold print:bg-slate-200"><tr><td colSpan="3" className="px-2 py-2 text-right uppercase">Total Bulan Ini</td><td className="px-2 py-2 text-right text-blue-800 text-sm">{formatIDR(getMonthlyIncome(selectedMonthIndex, selectedYear))}</td></tr></tfoot>
                              </table>
                            </div>
                          </div>
                          {/* (Footer) */}
                          <div className="flex justify-between mt-12 px-8 break-inside-avoid"><div className="text-center"><p className="text-xs font-medium text-slate-600 mb-12">Diserahkan Oleh,</p><p className="font-bold text-sm text-slate-800 border-b border-slate-400 pb-1 px-4">Pengelola Kos</p></div><div className="text-center"><p className="text-xs font-medium text-slate-600 mb-12">Diterima Oleh,</p><p className="font-bold text-sm text-slate-800 border-b border-slate-400 pb-1 px-4">Pemilik Kos</p></div></div>
                          <div className="mt-8 text-center text-[8px] text-slate-400 border-t border-slate-100 pt-2 print:fixed print:bottom-4 print:left-0 print:right-0">Dicetak otomatis oleh Sistem Manajemen Pro-Kos pada {new Date().toLocaleString('id-ID')}</div>
                       </div>
                     </>
                   )}
                </div>
              )}

              {/* MENU 4: PENGATURAN */}
              {activeTab === 'settings' && (
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 max-w-lg">
                      <div className="flex items-center gap-3 mb-6 border-b border-slate-100 pb-4">
                        <div className="bg-blue-100 p-2 rounded-lg text-blue-600"><Lock size={24}/></div>
                        <div><h3 className="font-bold text-lg text-slate-800">Pengaturan Keamanan</h3><p className="text-xs text-slate-500">Kelola kode akses untuk masuk ke aplikasi.</p></div>
                      </div>
                      <div className="space-y-5">
                        <div><label className="block text-sm font-bold text-slate-700 mb-2">Kode Akses Pemilik (Owner)</label><div className="relative"><input type="text" className="w-full pl-4 pr-10 py-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium" value={config.ownerCode} onChange={(e) => setConfig({...config, ownerCode: e.target.value})} /><div className="absolute right-3 top-3 text-slate-400"><Lock size={18}/></div></div></div>
                        <div><label className="block text-sm font-bold text-slate-700 mb-2">Kode Akses Pengelola (Admin)</label><div className="relative"><input type="text" className="w-full pl-4 pr-10 py-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium" value={config.adminCode} onChange={(e) => setConfig({...config, adminCode: e.target.value})} /><div className="absolute right-3 top-3 text-slate-400"><Lock size={18}/></div></div></div>
                        <button onClick={handleSaveSettings} className="w-full bg-slate-800 text-white font-bold py-3 rounded-xl hover:bg-slate-900 transition-all flex items-center justify-center gap-2 mt-2 shadow-lg"><Save size={18} /> Simpan Perubahan</button>
                      </div>
                  </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* --- BOTTOM NAV MOBILE --- */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex justify-around p-2 z-20 print:hidden shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
        {userRole === 'admin' ? (
          <>
            <NavItem id="dashboard" icon={LayoutDashboard} label="Status" />
            <NavItem id="rooms" icon={Bed} label="Kamar" />
            <NavItem id="history" icon={History} label="Riwayat" />
            <NavItem id="settings" icon={Settings} label="Admin" />
          </>
        ) : (
          <>
            <NavItem id="monitor" icon={LayoutDashboard} label="Pantau" />
            <NavItem id="reports" icon={Printer} label="Laporan" />
            <button onClick={handleLogout} className="flex flex-col items-center gap-1 p-2 text-red-500"><LogOut size={22} /><span className="text-[10px] font-medium">Keluar</span></button>
          </>
        )}
      </nav>
    </div>
  );
};

export default App;