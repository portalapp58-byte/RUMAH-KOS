import React, { useState, useEffect, useRef } from 'react';
import { 
  LayoutDashboard, Bed, History, Settings, LogOut, Plus, 
  Printer, Home, CreditCard, AlertCircle, UserPlus, Pencil, 
  X, Users, ChevronRight, Info, Upload, FileText, DoorOpen, 
  CalendarCheck, Wallet, CheckCircle2, Calendar, ArrowLeft, 
  Stamp, Clock, Save, Lock, TrendingUp, Calculator, UserCog, Download,
  Menu, Search, Filter, MoreHorizontal, UserCheck, MapPin, Check, ListChecks, 
  AlertTriangle, TrendingDown, Receipt, DollarSign, ChevronLeft, Trash2, RefreshCw
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
  getDoc,
  onSnapshot, 
  query, 
  orderBy, 
  deleteDoc
} from "firebase/firestore";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "firebase/auth";

// ============================================================================
// ⚠️ [AREA EDIT 1] KONFIGURASI FIREBASE ANDA
// ============================================================================
const firebaseConfig = {
  apiKey: "AIzaSyCQorCh1PaYdspqcnoGVfdz9OOdqMd13Q0",
  authDomain: "management-kos.firebaseapp.com",
  projectId: "management-kos",
  storageBucket: "management-kos.firebasestorage.app",
  messagingSenderId: "661524860034",
  appId: "1:661524860034:web:277dbf69b555b0a688389b"
};
   
// Inisialisasi Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const getCollectionRef = (collName) => {
  return collection(db, collName);
};
// ============================================================================

// Load html2pdf script dynamically
const loadHtml2Pdf = () => {
  if (!document.getElementById('html2pdf-script')) {
    const script = document.createElement('script');
    script.id = 'html2pdf-script';
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
    document.body.appendChild(script);
  }
};

// --- HELPER FUNCTIONS ---

const formatIDR = (amount) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
};

const formatDateIndo = (dateStr) => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
};

// Helper: Tambah Bulan
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
    
  const diffTime = today.getTime() - due.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
  return diffDays; 
};

const getDebtCalculation = (room) => {
  if (!room.resident || !room.nextPaymentDate) {
    return { months: 0, totalDebt: 0 };
  }

  const today = new Date();
  today.setHours(0,0,0,0);
  
  const dueDate = new Date(room.nextPaymentDate);
  dueDate.setHours(0,0,0,0);
    
  if (dueDate >= today) return { months: 0, totalDebt: 0 };

  let diffMonths = (today.getFullYear() - dueDate.getFullYear()) * 12 + (today.getMonth() - dueDate.getMonth());

  if (today.getDate() >= dueDate.getDate()) {
    diffMonths += 1; 
  }

  const debtMonths = diffMonths > 0 ? diffMonths : 1;
  const totalDebt = (debtMonths * room.price) + (room.debt || 0);

  return { months: debtMonths, totalDebt: totalDebt };
};

const getOverdueMonthsList = (room) => {
    if (!room.resident || !room.nextPaymentDate) return [];
    const today = new Date();
    today.setHours(0,0,0,0);
    const due = new Date(room.nextPaymentDate);
    due.setHours(0,0,0,0);
    if (due >= today) return [];
    const list = [];
    let current = new Date(due);
    while (current <= today) {
        list.push(current.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }));
        current.setMonth(current.getMonth() + 1);
        if (list.length > 60) break; 
    }
    return list;
};

const MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

// --- MAIN COMPONENT ---

export default function App() {
  // --- STATE ---
  const [user, setUser] = useState(null);
  const [isAppLoggedIn, setIsAppLoggedIn] = useState(false);
  const [userRole, setUserRole] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loginCode, setLoginCode] = useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Data State
  const [rooms, setRooms] = useState([]);
  const [payments, setPayments] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false); 
  const [refreshTrigger, setRefreshTrigger] = useState(0); 

  // UI States
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
  
  // Modal & Form State
  const [selectedRoom, setSelectedRoom] = useState(null); 
  const [showRoomForm, setShowRoomForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [showResidentForm, setShowResidentForm] = useState(false);
  const [showEditResidentForm, setShowEditResidentForm] = useState(false);
  const [showResidentDetail, setShowResidentDetail] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  
  // Custom Confirmation Modal State (Pengganti confirm() bawaan)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null); // { id: '...', type: 'expense' | 'other' }
  
  // Expense Modal State & Filters
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [expenseFormData, setExpenseFormData] = useState({ description: '', amount: 0, date: '', category: 'Operasional' });
  
  // Expenses Filter State (Arsip Pengeluaran)
  const [expenseYear, setExpenseYear] = useState(new Date().getFullYear());
  const [expenseMonth, setExpenseMonth] = useState(new Date().getMonth());

  // Form Data
  const [roomFormData, setRoomFormData] = useState({ number: '', price: 0, type: '', floor: '', bathroom: 'Dalam', desc: '' });
  const [residentFormData, setResidentFormData] = useState({ name: '', entryDate: '', address: '', ktpPhoto: '' }); 
  const [editResidentData, setEditResidentData] = useState({ roomId: null, name: '', entryDate: '', address: '', nextPaymentDate: '' });
  const [paymentFormData, setPaymentFormData] = useState({ roomId: null, amount: 0, date: '', method: 'Transfer', nextDueDate: '', currentDueDateRaw: '' });
  const [checkoutData, setCheckoutData] = useState(null);
  
  const [selectedRoomForResident, setSelectedRoomForResident] = useState(null);
  
  // Report State
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [reportViewMode, setReportViewMode] = useState('grid');
  const [selectedMonthIndex, setSelectedMonthIndex] = useState(null);
  const [depositStatus, setDepositStatus] = useState({});
  
  // Config State
  const [config, setConfig] = useState({
    ownerCode: 'OWNER123',
    adminCode: 'ADMIN456'
  });

  const reportContentRef = useRef(null);

  // --- INITIALIZATION ---
  useEffect(() => {
    loadHtml2Pdf();
    
    const initAuth = async () => {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        await signInWithCustomToken(auth, __initial_auth_token);
      } else {
        await signInAnonymously(auth);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast(prev => ({ ...prev, show: false }));
    }, 3000);
  };

  // --- DATA FETCHING ---
  useEffect(() => {
    if (!user) return;
    setLoading(true);

    const roomsRef = getCollectionRef('rooms');
    const unsubRooms = onSnapshot(roomsRef, (snapshot) => {
      if (snapshot.empty) {
        const initialRooms = Array.from({ length: 20 }, (_, i) => {
          const num = i + 1;
          const isFloor1 = num <= 10;
          return {
            id: num,
            number: `ROOM ${num < 10 ? '0' + num : num}`,
            price: isFloor1 ? 1500000 : 1200000,
            type: isFloor1 ? 'Standard' : 'Ekonomis',
            floor: isFloor1 ? '1' : '2',
            bathroom: isFloor1 ? 'Dalam' : 'Luar',
            desc: isFloor1 ? 'Lantai Bawah' : 'Lantai Atas',
            resident: '', address: '', entryDate: '', nextPaymentDate: '', ktpPhoto: null, status: 'Available', debt: 0
          };
        });
        initialRooms.forEach(r => addDoc(roomsRef, r));
      } else {
        const roomList = snapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id }));
        roomList.sort((a, b) => a.id - b.id);
        setRooms(roomList);
      }
      setLoading(false);
    }, (err) => console.error("Err Rooms:", err));

    const paymentsRef = getCollectionRef('payments');
    const qPayments = query(paymentsRef);
    const unsubPayments = onSnapshot(qPayments, (snapshot) => {
      const payList = snapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id }));
      payList.sort((a, b) => b.id - a.id);
      setPayments(payList);
    }, (err) => console.error("Err Payments:", err));

    const expensesRef = getCollectionRef('expenses');
    const qExpenses = query(expensesRef);
    const unsubExpenses = onSnapshot(qExpenses, (snapshot) => {
      const expList = snapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id }));
      expList.sort((a, b) => b.id - a.id);
      setExpenses(expList);
    }, (err) => console.error("Err Expenses:", err));

    const settingsRef = getCollectionRef('settings');
    const unsubSettings = onSnapshot(settingsRef, (snapshot) => {
      snapshot.forEach(doc => {
        if (doc.id === 'access_codes' || doc.data().type === 'access_codes') {
          setConfig(prev => ({ ...prev, ...doc.data() }));
        }
        if (doc.id === 'deposits' || doc.data().type === 'deposits') {
          setDepositStatus(doc.data());
        }
      });
    });

    return () => {
      unsubRooms(); unsubPayments(); unsubExpenses(); unsubSettings();
    };
  }, [user, refreshTrigger]);

  // --- LOGIC AUTH & CORE ---
  const handleLogin = () => {
    if (loginCode === config.ownerCode) {
      setUserRole('owner');
      setIsAppLoggedIn(true);
      setActiveTab('monitor');
    } else if (loginCode === config.adminCode) {
      setUserRole('admin');
      setIsAppLoggedIn(true);
      setActiveTab('dashboard');
    } else {
      showToast("Kode akses salah!", "error");
    }
  };

  const handleLogout = () => {
    setIsAppLoggedIn(false);
    setUserRole(null);
    setLoginCode('');
    setActiveTab('dashboard');
  };

  const handleSoftRefresh = () => {
      setLoading(true);
      setRefreshTrigger(prev => prev + 1);
      showToast("Menyinkronkan data terbaru...", "success");
      setTimeout(() => { setLoading(false); }, 1000);
  };

  // --- LOGIC EXPENSES (EDIT, ADD, DELETE) ---
  const handleSaveExpense = async () => {
    if (!expenseFormData.description || !expenseFormData.amount || !expenseFormData.date || !user) {
        showToast("Mohon lengkapi data pengeluaran", "error");
        return;
    }
    try {
        if (editingExpenseId) {
            await updateDoc(doc(db, getCollectionRef('expenses').path, editingExpenseId), {
                description: expenseFormData.description,
                amount: parseInt(String(expenseFormData.amount)),
                date: expenseFormData.date,
                category: expenseFormData.category,
                lastUpdated: new Date().toISOString()
            });
            showToast("Pengeluaran berhasil diperbarui!");
        } else {
            await addDoc(getCollectionRef('expenses'), {
                id: Date.now(),
                description: expenseFormData.description,
                amount: parseInt(String(expenseFormData.amount)),
                date: expenseFormData.date,
                category: expenseFormData.category,
                timestamp: new Date().toISOString()
            });
            showToast("Pengeluaran berhasil dicatat!");
        }
        setShowExpenseModal(false);
        setExpenseFormData({ description: '', amount: 0, date: '', category: 'Operasional' });
        setEditingExpenseId(null);
    } catch (e) {
        showToast("Gagal simpan: " + e.message, "error");
    }
  };

  const openEditExpense = (exp) => {
      setExpenseFormData({
          description: exp.description,
          amount: exp.amount,
          date: exp.date,
          category: exp.category
      });
      setEditingExpenseId(exp.docId);
      setShowExpenseModal(true);
  };

  // Trigger Delete Confirmation Modal
  const requestDeleteExpense = (docId) => {
      setDeleteTarget({ id: docId, type: 'expense' });
      setShowDeleteConfirm(true);
  };

  // Execute Delete after Confirmation
  const executeDelete = async () => {
      if (!deleteTarget) return;

      try {
          if (deleteTarget.type === 'expense') {
             await deleteDoc(doc(db, getCollectionRef('expenses').path, deleteTarget.id));
             showToast("Data pengeluaran berhasil dihapus");
          }
      } catch (e) {
          showToast("Gagal menghapus data", "error");
      } finally {
          setShowDeleteConfirm(false);
          setDeleteTarget(null);
      }
  };

  // --- LOGIC REPORTING ---
  const getMonthlyIncome = (monthIndex, year) => {
    return payments.filter(p => {
      const d = new Date(p.date);
      return d.getMonth() === monthIndex && d.getFullYear() === year;
    }).reduce((acc, curr) => acc + curr.amount, 0);
  };

  const getMonthlyExpense = (monthIndex, year) => {
    return expenses.filter(e => {
        const d = new Date(e.date);
        return d.getMonth() === monthIndex && d.getFullYear() === year;
    }).reduce((acc, curr) => acc + curr.amount, 0);
  };

  const getExpensesForView = () => {
      return expenses.filter(e => {
          const d = new Date(e.date);
          return d.getMonth() === expenseMonth && d.getFullYear() === expenseYear;
      });
  };

  const getFilteredPayments = () => {
    if (selectedMonthIndex === null) return [];
    return payments.filter(p => {
      const d = new Date(p.date);
      return d.getMonth() === selectedMonthIndex && d.getFullYear() === selectedYear;
    });
  };

  const getFilteredExpenses = () => {
    if (selectedMonthIndex === null) return [];
    return expenses.filter(e => {
        const d = new Date(e.date);
        return d.getMonth() === selectedMonthIndex && d.getFullYear() === selectedYear;
    });
  };

  // --- ACTIONS LOGIC ---
  const handleSaveRoom = async () => { if (!editingId || !user) return; try { const roomToUpdate = rooms.find(r => r.id === editingId); if (roomToUpdate) { await updateDoc(doc(db, getCollectionRef('rooms').path, roomToUpdate.docId), { price: roomFormData.price, desc: roomFormData.desc }); showToast("Perubahan kamar berhasil disimpan!"); } } catch (error) { showToast("Gagal update: " + error.message, "error"); } setShowRoomForm(false); };
  const handleKtpUpload = (e) => { const file = e.target.files[0]; if (file) { const imageUrl = URL.createObjectURL(file); setResidentFormData({ ...residentFormData, ktpPhoto: imageUrl }); } };
  const handleSaveResident = async () => { if (!residentFormData.name || !residentFormData.entryDate || !user) { showToast("Nama dan Tanggal Masuk wajib diisi!", "error"); return; } try { const dataUpdate = { resident: residentFormData.name, entryDate: residentFormData.entryDate, address: residentFormData.address, nextPaymentDate: residentFormData.entryDate, ktpPhoto: residentFormData.ktpPhoto || "", status: 'Unpaid', debt: 0 }; await updateDoc(doc(db, getCollectionRef('rooms').path, selectedRoomForResident.docId), dataUpdate); setShowResidentForm(false); setSelectedRoom(null); showToast(`Penghuni ${residentFormData.name} berhasil didaftarkan!`); } catch (error) { showToast("Gagal simpan: " + error.message, "error"); } };
  const handleSaveEditedResident = async () => { if (!user) return; try { const room = rooms.find(r => r.id === editResidentData.roomId); if (room) { await updateDoc(doc(db, getCollectionRef('rooms').path, room.docId), { resident: editResidentData.name, entryDate: editResidentData.entryDate, address: editResidentData.address, nextPaymentDate: editResidentData.nextPaymentDate }); setShowEditResidentForm(false); setSelectedRoom(null); showToast("Data penghuni berhasil diperbarui!"); } } catch (error) { showToast("Gagal update: " + error.message, "error"); } };
  
  const calculatePaymentPreview = () => { const price = paymentFormData.roomPrice || 1; const amount = parseInt(paymentFormData.amount) || 0; const monthsPaid = Math.floor(amount / price); const remainder = amount % price; const currentDue = new Date(paymentFormData.currentDueDateRaw); const newDueObj = new Date(currentDue); newDueObj.setMonth(newDueObj.getMonth() + monthsPaid); const newDueDateStr = newDueObj.toISOString().split('T')[0]; return { months: monthsPaid, remainder: remainder, newDate: newDueDateStr, isValid: monthsPaid > 0 }; };
  
  const handleConfirmPayment = async () => {
    if (!user || isSubmitting) return; 
    const preview = calculatePaymentPreview();
    if (!preview.isValid) { showToast("Nominal pembayaran minimal 1 bulan sewa.", "error"); return; }
    setIsSubmitting(true); 
    try {
      const today = new Date(); today.setHours(0,0,0,0);
      const newDue = new Date(preview.newDate); newDue.setHours(0,0,0,0);
      const newStatus = newDue >= today ? 'Paid' : 'Unpaid';
      const room = rooms.find(r => r.id === paymentFormData.roomId);
      if(room) { await updateDoc(doc(db, getCollectionRef('rooms').path, room.docId), { status: newStatus, debt: 0, nextPaymentDate: preview.newDate }); }
      const newPayment = { id: Date.now(), roomId: paymentFormData.roomNumber, residentName: paymentFormData.resident, amount: paymentFormData.amount, date: paymentFormData.date, type: `Sewa (${preview.months} Bulan)`, method: paymentFormData.method };
      await addDoc(getCollectionRef('payments'), newPayment);
      setShowPaymentModal(false); setSelectedRoom(null); showToast("Pembayaran berhasil! Masa sewa diperpanjang.");
    } catch (error) { showToast("Gagal bayar: " + error.message, "error"); } finally { setIsSubmitting(false); }
  };

  const handleConfirmCheckout = async () => { if (!checkoutData || !user) return; try { await updateDoc(doc(db, getCollectionRef('rooms').path, checkoutData.docId), { resident: '', entryDate: '', nextPaymentDate: '', address: '', ktpPhoto: null, status: 'Available', debt: 0 }); const checkoutLog = { id: Date.now(), roomId: checkoutData.number, residentName: checkoutData.resident, amount: 0, date: new Date().toISOString().split('T')[0], type: 'Checkout / Keluar', method: '-' }; await addDoc(getCollectionRef('payments'), checkoutLog); setShowCheckoutModal(false); setCheckoutData(null); setSelectedRoom(null); showToast("Checkout berhasil diproses."); } catch (error) { showToast("Gagal checkout: " + error.message, "error"); } };
  const toggleDepositStatus = async () => { if (!user) return; const key = `${selectedYear}-${selectedMonthIndex}`; const newStatus = !depositStatus[key]; setDepositStatus({...depositStatus, [key]: newStatus}); try { const settingsRef = getCollectionRef('settings'); const snapshot = await getDocs(settingsRef); let docId = ''; snapshot.forEach(d => { if(d.id === 'deposits' || d.data().type === 'deposits') docId = d.id; }); if (docId) { await updateDoc(doc(db, settingsRef.path, docId), { [key]: newStatus }); } else { await setDoc(doc(db, settingsRef.path, 'deposits'), { [key]: newStatus, type: 'deposits' }); } showToast("Status setor diperbarui!"); } catch (e) { console.error(e); showToast("Gagal simpan status", "error"); } };
  const handleSaveSettings = async () => { if (!user) return; try { const settingsRef = getCollectionRef('settings'); const snapshot = await getDocs(settingsRef); let docId = ''; snapshot.forEach(d => { if(d.id === 'access_codes' || d.data().type === 'access_codes') docId = d.id; }); if (docId) { await updateDoc(doc(db, settingsRef.path, docId), config); } else { await setDoc(doc(db, settingsRef.path, 'access_codes'), { ...config, type: 'access_codes' }); } showToast("Kode akses disimpan!"); } catch (err) { showToast("Gagal simpan", "error"); } };
  const handleDownloadPDF = () => { const element = reportContentRef.current; if (!element || !window.html2pdf) { alert("Library PDF sedang dimuat atau tidak tersedia. Coba print biasa."); return; } const opt = { margin: 10, filename: `Laporan-${MONTH_NAMES[selectedMonthIndex]}-${selectedYear}.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { unit:'mm', format:'a4', orientation:'portrait' }, pagebreak: { mode:['css','legacy'] } }; window.html2pdf().set(opt).from(element).save(); };

  // --- ACTIONS HELPERS ---
  const openEditRoom = (room) => { setRoomFormData(room); setEditingId(room.id); setShowRoomForm(true); };
  const openRegister = (room) => { const today = new Date().toISOString().split('T')[0]; setSelectedRoomForResident(room); setResidentFormData({ name: '', entryDate: today, address: '', ktpPhoto: '' }); setShowResidentForm(true); };
  const openPay = (room) => { const today = new Date().toISOString().split('T')[0]; const baseDueDate = room.nextPaymentDate || room.entryDate || today; setPaymentFormData({ roomId: room.id, roomNumber: room.number, resident: room.resident, roomPrice: room.price, amount: 0, date: today, method: 'Transfer', nextDueDate: baseDueDate, currentDueDateRaw: baseDueDate }); setShowPaymentModal(true); };
  const openEditResident = (room) => { setEditResidentData({ roomId: room.id, roomNumber: room.number, name: room.resident, entryDate: room.entryDate, address: room.address || '', nextPaymentDate: room.nextPaymentDate }); setShowEditResidentForm(true); };
  const openDetail = (room) => { setSelectedRoomForResident(room); setShowResidentDetail(true); };
  const openCheckout = (room) => { setCheckoutData(room); setShowCheckoutModal(true); };

  // --- DASHBOARD STATS ---
  const occupiedRooms = rooms.filter(r => r.resident).length;
  const overdueRooms = rooms.filter(r => { const overdueDays = getDaysOverdue(r.nextPaymentDate); return r.resident && overdueDays > 0 && r.status !== 'Paid'; });
  const currentMonthIncome = getMonthlyIncome(new Date().getMonth(), new Date().getFullYear());
  const currentMonthExpense = getMonthlyExpense(new Date().getMonth(), new Date().getFullYear());
  const currentMonthNet = currentMonthIncome - currentMonthExpense;

  // --- RENDER HELPERS ---
  const NavItem = ({ id, icon: Icon, label }) => (
    <button onClick={() => { setActiveTab(id); setIsMobileMenuOpen(false); if(id !== 'reports') { setReportViewMode('grid'); setSelectedMonthIndex(null); } }} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all w-full text-left font-medium ${activeTab === id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'text-slate-500 hover:bg-slate-50 hover:text-indigo-600'}`}>
      <Icon size={20} /><span>{label}</span>
    </button>
  );

// --- LOGIN VIEW ---
if (!isAppLoggedIn) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center p-6">
      {toast.show && (
        <div className="fixed top-10 left-1/2 transform -translate-x-1/2 bg-red-600 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-2 z-[100] animate-in slide-in-from-top-5">
          <AlertCircle size={20} />
          <span className="font-bold">{toast.message}</span>
        </div>
      )}
      <div className="max-w-md w-full bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl p-8 border border-white">
        <div className="text-center mb-10">
          <div className="bg-gradient-to-tr from-indigo-600 to-violet-600 w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6 text-white shadow-xl shadow-indigo-200 rotate-3">
            <Home size={40} strokeWidth={1.5} />
          </div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">CBR-KOS Manager</h1>
          <p className="text-slate-400 font-medium">System By Malang Florist Group</p>
        </div>
        <div className="space-y-6">
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none"><Lock size={20} className="text-indigo-400 group-focus-within:text-indigo-600 transition-colors" /></div>
            <input type="password" placeholder="Masukkan Kode Akses" className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all font-bold text-slate-700 placeholder:font-normal" value={loginCode} onChange={(e) => setLoginCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleLogin()} />
          </div>
          <button onClick={handleLogin} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-2xl shadow-xl shadow-indigo-200 active:scale-95 transition-all flex items-center justify-center gap-2">Masuk Aplikasi <ChevronRight size={20} /></button>
          <div className="text-center space-y-0.5"><p className="text-xs text-slate-400">Versi 7.6.1 — CBR-KOS Manager</p><p className="text-[11px] font-bold text-slate-500">Dikembangkan oleh Malang Florist Group</p></div>
        </div>
      </div>
    </div>
  );
}


  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row print:bg-white text-sans relative">
        {/* --- GLOBAL TOAST --- */}
        {toast.show && (<div className="fixed bottom-10 left-1/2 transform -translate-x-1/2 bg-slate-800/90 backdrop-blur-md text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 z-[100] animate-in zoom-in slide-in-from-bottom-5 duration-300"><div className={`p-1 rounded-full ${toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>{toast.type === 'success' ? <Check size={16} strokeWidth={3} /> : <X size={16} strokeWidth={3} />}</div><span className="font-bold text-sm tracking-wide">{toast.message}</span></div>)}

        {/* --- MOBILE HEADER --- */}
        <div className="md:hidden bg-white p-4 flex justify-between items-center shadow-sm sticky top-0 z-30">
            <div className="flex items-center gap-2"><div className="bg-indigo-600 p-2 rounded-lg text-white"><Home size={20}/></div><span className="font-bold text-lg text-slate-800">CBR-Kos</span></div>
            <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 text-slate-600 bg-slate-100 rounded-lg"><Menu size={24} /></button>
        </div>

        {/* --- SIDEBAR OVERLAY (Mobile) --- */}
        {isMobileMenuOpen && (
            <div 
                className="fixed inset-0 bg-black/50 z-30 md:hidden backdrop-blur-sm transition-opacity"
                onClick={() => setIsMobileMenuOpen(false)}
            />
        )}

        {/* --- SIDEBAR --- */}
        <aside className={`fixed inset-y-0 left-0 z-40 w-72 bg-white border-r border-slate-200 transform ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 transition-transform duration-300 ease-in-out md:static md:h-screen print:hidden flex flex-col shadow-2xl md:shadow-none`}>
            <div className="p-8">
                <div className="flex items-center gap-3 mb-10"><div className="bg-gradient-to-br from-indigo-600 to-violet-600 p-2.5 rounded-xl text-white shadow-lg shadow-indigo-200"><Home size={26} strokeWidth={2} /></div><div><h1 className="font-black text-2xl text-slate-800 tracking-tight leading-none">CBR-Kos</h1><p className="text-xs text-indigo-500 font-bold tracking-wider">Management By MFG</p></div></div>
                <nav className="space-y-2">
                    {userRole === 'admin' ? (
                        <><div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 mt-2 px-4">Menu Utama</div><NavItem id="dashboard" icon={LayoutDashboard} label="Dashboard (Utama)" /><NavItem id="expenses" icon={Receipt} label="Pengeluaran" /><NavItem id="history" icon={History} label="Riwayat & Laporan" /><div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 mt-6 px-4">Sistem</div><NavItem id="settings" icon={Settings} label="Pengaturan" /></>
                    ) : (
                        <><NavItem id="monitor" icon={LayoutDashboard} label="Pantau Kos" /><NavItem id="reports" icon={Printer} label="Laporan Keuangan" /></>
                    )}
                </nav>
            </div>
            <div className="mt-auto p-8 border-t border-slate-100"><button onClick={handleLogout} className="flex items-center gap-3 text-red-500 hover:bg-red-50 px-4 py-3 rounded-xl transition-all w-full font-medium"><LogOut size={20} /><span>Keluar</span></button></div>
        </aside>

        {/* --- MAIN CONTENT --- */}
        <main className="flex-1 overflow-y-auto h-screen print:h-auto print:overflow-visible relative">
            <header className="print:hidden bg-white/80 backdrop-blur-md border-b border-slate-200 px-8 py-5 sticky top-0 z-20 hidden md:flex justify-between items-center">
                <div><h2 className="text-2xl font-bold text-slate-800 capitalize tracking-tight">{activeTab === 'monitor' ? 'Pantau Kos' : activeTab === 'reports' ? 'Laporan' : activeTab.replace(/([A-Z])/g, ' $1')}</h2><p className="text-sm text-slate-500 font-medium mt-1">Selamat datang, <span className="text-indigo-600">{userRole === 'admin' ? 'Pengelola Utama' : 'Pemilik Properti'}</span></p></div>
                <div className="flex items-center gap-4"><div className="bg-slate-100 px-4 py-2 rounded-full text-sm font-bold text-slate-600 flex items-center gap-2"><div className={`w-2 h-2 rounded-full ${loading ? 'bg-yellow-400 animate-pulse' : 'bg-green-500'}`}></div>{loading ? 'Sinkronisasi...' : 'Online'}</div><div className="h-10 w-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-lg border-2 border-white shadow-sm">{userRole === 'admin' ? 'A' : 'P'}</div></div>
            </header>

            <div className="p-4 md:p-8 max-w-7xl mx-auto print:p-0 print:max-w-none">
                {(activeTab === 'dashboard' || activeTab === 'monitor') && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {/* Summary Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-6 rounded-3xl text-white shadow-xl shadow-blue-200 relative overflow-hidden"><div className="relative z-10"><p className="text-blue-100 font-medium mb-1">Kamar Terisi</p><h3 className="text-4xl font-black">{occupiedRooms} <span className="text-lg font-medium opacity-70">/ {rooms.length}</span></h3></div><Bed className="absolute right-4 bottom-4 text-white opacity-20" size={80} /></div>
                            
                            {/* UPDATED SUMMARY FOR OWNER */}
                            {userRole === 'owner' || activeTab === 'monitor' ? (
                                <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-6 rounded-3xl text-white shadow-xl shadow-emerald-200 relative overflow-hidden">
                                    <div className="relative z-10">
                                        <p className="text-emerald-100 font-medium mb-1">Profit Bersih Bulan Ini</p>
                                        <h3 className="text-3xl font-black">{formatIDR(currentMonthNet)}</h3>
                                        <div className="flex gap-4 mt-2 text-xs opacity-90">
                                            <span>Masuk: {formatIDR(currentMonthIncome)}</span>
                                            <span>Keluar: {formatIDR(currentMonthExpense)}</span>
                                        </div>
                                    </div>
                                    <Wallet className="absolute right-4 bottom-4 text-white opacity-20" size={80} />
                                </div>
                            ) : (
                                <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-6 rounded-3xl text-white shadow-xl shadow-emerald-200 relative overflow-hidden">
                                    <div className="relative z-10">
                                        <p className="text-emerald-100 font-medium mb-1">Pendapatan Bulan Ini</p>
                                        <h3 className="text-3xl font-black">{formatIDR(currentMonthIncome)}</h3>
                                    </div>
                                    <Wallet className="absolute right-4 bottom-4 text-white opacity-20" size={80} />
                                </div>
                            )}

                            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden group hover:border-red-200 transition-colors">
                                <div className="flex justify-between items-start mb-4"><div><p className="text-slate-500 font-bold text-sm">Tagihan Nunggak</p><h3 className={`text-3xl font-black ${overdueRooms.length > 0 ? 'text-red-600' : 'text-slate-800'}`}>{overdueRooms.length} <span className="text-sm font-medium text-slate-400">Kamar</span></h3></div><div className="bg-red-50 p-3 rounded-2xl text-red-500"><AlertCircle size={24} /></div></div>
                                {overdueRooms.length > 0 ? (<div className="space-y-2 mt-2">{overdueRooms.slice(0, 2).map(r => (<div key={r.id} className="text-xs flex justify-between items-center bg-red-50 p-2 rounded-lg text-red-700 font-medium"><span>{r.number}</span><span>{formatDateIndo(r.nextPaymentDate)}</span></div>))}</div>) : <p className="text-xs text-slate-400 italic">Semua pembayaran aman.</p>}
                            </div>
                        </div>

                        {/* Room Grid (Same as before) */}
                        <div>
                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end mb-6">
                                <div><h3 className="text-xl font-bold text-slate-900">DAFTAR KAMAR - SATUS KAMAR</h3>{userRole === 'admin' && <p className="text-sm text-slate-300">Pilih Kotak Untuk Membuka Menu Aksi.</p>}</div>
                                <div className="flex gap-2 text-xs font-bold"><span className="flex items-center gap-1.5 bg-white border px-3 py-1.5 rounded-lg text-slate-600"><div className="w-2.5 h-2.5 rounded-full bg-slate-200"></div> Kosong</span><span className="flex items-center gap-1.5 bg-white border px-3 py-1.5 rounded-lg text-slate-600"><div className="w-2.5 h-2.5 rounded-full bg-green-500"></div> Lunas</span><span className="flex items-center gap-1.5 bg-white border px-3 py-1.5 rounded-lg text-slate-600"><div className="w-2.5 h-2.5 rounded-full bg-yellow-400"></div> Jatuh Tempo</span><span className="flex items-center gap-1.5 bg-white border px-3 py-1.5 rounded-lg text-slate-600"><div className="w-2.5 h-2.5 rounded-full bg-red-500"></div> Telat</span></div>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                                {rooms.map(room => {
                                    const isOccupied = !!room.resident; const isPaid = room.status === 'Paid'; const rawDiffDays = getDaysOverdue(room.nextPaymentDate); let bgClass = 'bg-white hover:border-indigo-300'; let statusIndicator = <span className="bg-slate-100 text-slate-500 px-2 py-1 rounded text-[10px] font-bold">AVAILABLE</span>; let icon = <div className="text-slate-300"><Bed size={24}/></div>;
                                    if (isOccupied) { if (isPaid) { bgClass = 'bg-green-50 border-green-200 hover:border-green-400'; statusIndicator = <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-[10px] font-bold">LUNAS</span>; icon = <div className="text-green-500"><CheckCircle2 size={24}/></div>; } else { if (rawDiffDays > 3) { bgClass = 'bg-red-50 border-red-200 hover:border-red-400'; let lateText = `TELAT ${rawDiffDays} HARI`; if (rawDiffDays > 30) { const lateMonths = Math.floor(rawDiffDays / 30); lateText = `TELAT ${lateMonths} BULAN`; } statusIndicator = <span className="bg-red-100 text-red-600 px-2 py-1 rounded text-[10px] font-bold animate-pulse">{lateText}</span>; icon = <div className="text-red-400"><AlertCircle size={24}/></div>; } else if (rawDiffDays >= 0) { bgClass = 'bg-yellow-50 border-yellow-200 hover:border-yellow-400'; statusIndicator = <span className="bg-yellow-100 text-yellow-700 px-2 py-1 rounded text-[10px] font-bold">JATUH TEMPO</span>; icon = <div className="text-yellow-500"><AlertTriangle size={24}/></div>; } else { bgClass = 'bg-white border-slate-200 hover:border-indigo-300'; statusIndicator = <span className="bg-slate-100 text-slate-500 px-2 py-1 rounded text-[10px] font-bold">BELUM BAYAR</span>; icon = <div className="text-slate-400"><Clock size={24}/></div>; } } }
                                    return (
                                        <div key={room.id} onClick={() => setSelectedRoom(room)} className={`relative p-5 rounded-2xl border transition-all cursor-pointer shadow-sm hover:shadow-lg group ${bgClass}`}>
                                            <div className="flex justify-between items-start mb-3"><span className="font-black text-xl text-slate-700">{room.number.replace('ROOM ', '')}</span>{icon}</div>
                                            <div className="min-h-[40px]">{isOccupied ? (<div><p className="font-bold text-sm text-slate-800 truncate mb-0.5">{room.resident}</p>{rawDiffDays > 0 && !isPaid && <p className="text-xs text-red-600 font-bold">-{formatIDR(getDebtCalculation(room).totalDebt)}</p>}</div>) : (<p className="text-sm text-slate-400 font-medium">Kosong</p>)}</div>
                                            <div className="mt-4 pt-3 border-t border-black/5 flex justify-between items-center"><span className="text-[10px] font-medium text-slate-500">{room.floor === '1' ? 'Lantai 1' : 'Lantai 2'}</span>{statusIndicator}</div>
                                            {userRole === 'admin' && (<div className="absolute inset-0 bg-indigo-900/0 group-hover:bg-indigo-900/5 transition-all rounded-2xl flex items-center justify-center opacity-0 group-hover:opacity-100"><span className="bg-white shadow-sm border px-3 py-1 rounded-full text-xs font-bold text-indigo-600">Buka Menu</span></div>)}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {/* --- NEW CONTENT: EXPENSES MANAGEMENT WITH FILTERS --- */}
                {activeTab === 'expenses' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {/* Header & Controls */}
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <div>
                                <h3 className="font-bold text-2xl text-slate-800">Pengeluaran Operasional</h3>
                                <p className="text-slate-500">Catat biaya operasional bulanan.</p>
                            </div>
                            <div className="flex gap-2">
                                {/* Year Selector */}
                                <div className="flex items-center bg-white border border-slate-200 rounded-xl px-2">
                                    <button onClick={() => setExpenseYear(expenseYear - 1)} className="p-2 text-slate-500 hover:text-indigo-600"><ChevronLeft size={16}/></button>
                                    <span className="font-bold text-slate-700 px-2">{expenseYear}</span>
                                    <button onClick={() => setExpenseYear(expenseYear + 1)} className="p-2 text-slate-500 hover:text-indigo-600"><ChevronRight size={16}/></button>
                                </div>
                                {/* Month Selector */}
                                <select 
                                    className="bg-white border border-slate-200 rounded-xl px-4 py-2 font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                                    value={expenseMonth}
                                    onChange={(e) => setExpenseMonth(parseInt(e.target.value))}
                                >
                                    {MONTH_NAMES.map((m, i) => (
                                        <option key={i} value={i}>{m}</option>
                                    ))}
                                </select>
                                <button onClick={() => {setEditingExpenseId(null); setExpenseFormData({description:'', amount:0, date:'', category:'Operasional'}); setShowExpenseModal(true);}} className="bg-red-600 text-white px-5 py-2 rounded-xl font-bold shadow-lg hover:bg-red-700 flex items-center gap-2">
                                    <Plus size={20} /> <span className="hidden md:inline">Catat Baru</span>
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Summary Card Expense */}
                            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
                                <div className="flex items-center gap-3 mb-4 relative z-10">
                                    <div className="bg-red-50 p-2 rounded-xl text-red-600"><TrendingDown size={24} /></div>
                                    <div>
                                        <h4 className="font-bold text-lg text-slate-800">Total Pengeluaran</h4>
                                        <p className="text-xs text-slate-400 font-medium">Periode {MONTH_NAMES[expenseMonth]} {expenseYear}</p>
                                    </div>
                                </div>
                                <p className="text-4xl font-black text-slate-800 relative z-10">{formatIDR(getMonthlyExpense(expenseMonth, expenseYear))}</p>
                                <div className="absolute -right-6 -bottom-6 text-red-50 opacity-50"><Receipt size={140} /></div>
                            </div>
                            
                            {/* Filtered List */}
                            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm h-full max-h-[500px] overflow-y-auto">
                                <h4 className="font-bold text-lg text-slate-800 mb-4 sticky top-0 bg-white pb-2 border-b border-slate-100 flex justify-between items-center">
                                    <span>Rincian Pengeluaran</span>
                                    <span className="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded-lg">{getExpensesForView().length} Data</span>
                                </h4>
                                <div className="space-y-3">
                                    {getExpensesForView().length > 0 ? (
                                        getExpensesForView().map(exp => (
                                            <div key={exp.docId} className="flex justify-between items-center p-3 hover:bg-slate-50 rounded-xl border border-slate-100 transition-colors group">
                                                <div className="flex items-center gap-3">
                                                    <div className="bg-slate-100 p-2 rounded-lg text-slate-500"><Receipt size={20}/></div>
                                                    <div>
                                                        <p className="font-bold text-slate-800">{exp.description}</p>
                                                        <p className="text-xs text-slate-500">{formatDateIndo(exp.date)} • {exp.category}</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span className="font-bold text-red-600">-{formatIDR(exp.amount)}</span>
                                                    {/* TOMBOL EDIT & HAPUS (Dengan Modal Cantik) */}
                                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                                        <button onClick={() => openEditExpense(exp)} className="p-1.5 text-slate-300 hover:text-amber-500 hover:bg-amber-50 rounded-lg"><Pencil size={16}/></button>
                                                        <button onClick={() => requestDeleteExpense(exp.docId)} className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={16}/></button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                                            <Receipt size={48} className="mb-2 opacity-20"/>
                                            <p className="italic">Tidak ada data pengeluaran di bulan ini.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* --- CONTENT: HISTORY & REPORTS (UPDATED for Fit to Screen) --- */}
                {(activeTab === 'history' || activeTab === 'reports') && (
                    <div className="space-y-6">
                        {reportViewMode === 'grid' ? (
                            <div className="animate-in slide-in-from-bottom-8 duration-500">
                                <div className="flex justify-between items-center bg-white p-5 rounded-3xl border border-slate-200 shadow-sm mb-6">
                                    <div className="flex items-center gap-4">
                                        <div className="bg-indigo-50 p-3 rounded-2xl text-indigo-600"><Calendar size={24} /></div>
                                        <div><h3 className="font-bold text-lg text-slate-800">Arsip Laporan Keuangan</h3><p className="text-sm text-slate-500">Pilih bulan untuk melihat detail laba rugi.</p></div>
                                    </div>
                                    <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
                                        <button onClick={() => setSelectedYear(selectedYear - 1)} className="p-2 hover:bg-white rounded-lg transition-all text-slate-600"><ArrowLeft size={16} /></button>
                                        <span className="font-bold text-slate-800 px-2">{selectedYear}</span>
                                        <button onClick={() => setSelectedYear(selectedYear + 1)} className="p-2 hover:bg-white rounded-lg transition-all text-slate-600"><ChevronRight size={16} /></button>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                    {MONTH_NAMES.map((month, index) => {
                                        const income = getMonthlyIncome(index, selectedYear);
                                        const expense = getMonthlyExpense(index, selectedYear);
                                        const net = income - expense;
                                        const isDeposited = depositStatus[`${selectedYear}-${index}`];
                                        return (
                                            <div key={month} onClick={() => { setSelectedMonthIndex(index); setReportViewMode('detail'); }} className={`group p-6 rounded-3xl border-2 transition-all cursor-pointer relative overflow-hidden ${isDeposited ? 'bg-emerald-50 border-emerald-200 hover:border-emerald-400' : 'bg-white border-slate-100 hover:border-indigo-300 shadow-sm hover:shadow-lg'}`}>
                                                    <div className="flex justify-between items-start mb-4 relative z-10"><span className="font-bold text-lg text-slate-700">{month}</span>{isDeposited ? <div className="bg-emerald-200 p-1.5 rounded-full text-emerald-700"><CheckCircle2 size={16} /></div> : <div className="bg-slate-100 p-1.5 rounded-full text-slate-400 group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-colors"><ChevronRight size={16} /></div>}</div>
                                                    <div className="relative z-10 space-y-1">
                                                        <div className="flex justify-between text-xs text-slate-500 font-bold"><span>Masuk</span><span className="text-green-600">{formatIDR(income)}</span></div>
                                                        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden"><div className="bg-green-500 h-full" style={{ width: '100%' }}></div></div>
                                                        <div className="flex justify-between text-xs text-slate-500 font-bold mt-1"><span>Keluar</span><span className="text-red-500">{formatIDR(expense)}</span></div>
                                                        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden"><div className="bg-red-500 h-full" style={{ width: income > 0 ? `${Math.min((expense/income)*100, 100)}%` : '0%' }}></div></div>
                                                        <div className="pt-2 border-t border-slate-100 mt-2">
                                                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Bersih (Net)</p>
                                                            <h4 className={`text-xl font-black ${net >= 0 ? 'text-slate-800' : 'text-red-600'}`}>{formatIDR(net)}</h4>
                                                        </div>
                                                    </div>
                                                    {isDeposited && <div className="absolute -bottom-6 -right-6 text-emerald-100 rotate-12"><Stamp size={100} /></div>}
                                                </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : (
                            <div className="animate-in zoom-in-95 duration-300">
                                <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-8 print:hidden">
                                    <button onClick={() => setReportViewMode('grid')} className="flex items-center gap-2 text-slate-600 font-bold hover:text-indigo-600 transition-colors bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm"><ArrowLeft size={20} /> Kembali</button>
                                    <div className="flex gap-2">
                                        {userRole === 'admin' && (
                                            <button onClick={toggleDepositStatus} className={`px-5 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-md ${depositStatus[`${selectedYear}-${selectedMonthIndex}`] ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}><Stamp size={18} /> {depositStatus[`${selectedYear}-${selectedMonthIndex}`] ? 'Batalkan Setor' : 'Tandai Setor'}</button>
                                        )}
                                        <button onClick={() => window.print()} className="bg-white border border-slate-300 text-slate-700 px-5 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-slate-50 transition-all shadow-sm"><Printer size={18} /> Print</button>
                                        <button onClick={handleDownloadPDF} className="bg-slate-800 text-white px-5 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-slate-900 transition-all shadow-lg"><Download size={18} /> PDF</button>
                                    </div>
                                </div>
                                
                                {/* UPDATE: Fit To Screen Logic 
                                    - w-full: Agar di HP mengikuti lebar layar (responsive)
                                    - md:w-[210mm]: Agar di PC tetap seukuran A4
                                    - md:min-h-[297mm]: Tinggi A4
                                */}
                                <div className="w-full md:w-[210mm] mx-auto bg-white shadow-2xl md:min-h-[297mm] print:w-[210mm] print:min-h-[297mm] print:shadow-none print:border-none overflow-hidden rounded-xl md:rounded-none">

                                    <div ref={reportContentRef} className="p-4 md:p-10 print:p-6 relative">

                                            <div className="flex justify-between items-end border-b-4 border-slate-800 pb-6 mb-8">
                                                <div><h1 className="text-xl md:text-3xl font-black text-slate-800 tracking-tight uppercase">Laporan Management Kos</h1><p className="text-slate-500 font-medium text-xs md:text-base">By MFG-System</p></div>
                                                <div className="text-right"><p className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Periode</p><h2 className="text-sm md:text-xl font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-lg border border-indigo-100">{MONTH_NAMES[selectedMonthIndex]} {selectedYear}</h2></div>
                                            </div>
                                            {depositStatus[`${selectedYear}-${selectedMonthIndex}`] && (<div className="absolute top-10 right-10 opacity-20 rotate-[-15deg] border-4 border-green-600 text-green-600 font-black text-2xl md:text-4xl px-4 md:px-6 py-2 rounded-xl uppercase">SUDAH DISETOR</div>)}
                                            
                                            {/* Financial Summary */}
                                            <div className="grid grid-cols-3 gap-2 md:gap-4 mb-8">
                                                <div className="bg-green-50 p-3 md:p-4 rounded-xl border border-green-100 text-center"><p className="text-[10px] md:text-xs font-bold text-green-600 uppercase mb-1">Total Pemasukan</p><p className="text-sm md:text-xl font-black text-green-700">{formatIDR(getMonthlyIncome(selectedMonthIndex, selectedYear))}</p></div>
                                                <div className="bg-red-50 p-3 md:p-4 rounded-xl border border-red-100 text-center"><p className="text-[10px] md:text-xs font-bold text-red-600 uppercase mb-1">Total Pengeluaran</p><p className="text-sm md:text-xl font-black text-red-700">{formatIDR(getMonthlyExpense(selectedMonthIndex, selectedYear))}</p></div>
                                                <div className="bg-slate-800 p-3 md:p-4 rounded-xl border border-slate-700 text-center text-white"><p className="text-[10px] md:text-xs font-bold text-slate-400 uppercase mb-1">Laba Bersih</p><p className="text-lg md:text-2xl font-black">{formatIDR(getMonthlyIncome(selectedMonthIndex, selectedYear) - getMonthlyExpense(selectedMonthIndex, selectedYear))}</p></div>
                                            </div>

                                            {/* Two Column Grid for Income and Expense */}
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                                                {/* Left Column: Expenses */}
                                                <div>
                                                    <h3 className="font-bold text-slate-800 mb-2 flex items-center gap-2 border-b pb-2"><TrendingDown size={18} className="text-red-600"/> Rincian Pengeluaran</h3>
                                                    <div className="overflow-x-auto">
                                                        <table className="w-full text-[10px] text-left">
                                                            <thead className="bg-slate-100 text-slate-600 font-bold uppercase"><tr><th className="px-2 py-1.5">Tanggal</th><th className="px-2 py-1.5">Keterangan</th><th className="px-2 py-1.5 text-right">Jumlah</th></tr></thead>
                                                            <tbody className="divide-y divide-slate-100">
                                                                {getFilteredExpenses().length > 0 ? (getFilteredExpenses().map((exp) => (
                                                                    <tr key={exp.id} className="group hover:bg-slate-50">
                                                                        <td className="px-2 py-1">{formatDateIndo(exp.date)}</td>
                                                                        <td className="px-2 py-1">{exp.description} <span className="text-[9px] text-slate-400">({exp.category})</span></td>
                                                                        <td className="px-2 py-1 text-right font-bold text-red-600">{formatIDR(exp.amount)}</td>
                                                                    </tr>
                                                                ))) : (<tr><td colSpan={3} className="px-2 py-4 text-center text-slate-400 italic">Tidak ada pengeluaran.</td></tr>)}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>

                                                {/* Right Column: Income */}
                                                <div>
                                                    <h3 className="font-bold text-slate-800 mb-2 flex items-center gap-2 border-b pb-2"><TrendingUp size={18} className="text-green-600"/> Rincian Pemasukan</h3>
                                                    <div className="overflow-x-auto">
                                                        <table className="w-full text-[10px] text-left">
                                                            <thead className="bg-slate-100 text-slate-600 font-bold uppercase"><tr><th className="px-2 py-1.5">Tanggal</th><th className="px-2 py-1.5">Sumber</th><th className="px-2 py-1.5 text-right">Jumlah</th></tr></thead>
                                                            <tbody className="divide-y divide-slate-100">
                                                                {getFilteredPayments().length > 0 ? (getFilteredPayments().map((pay) => (
                                                                    <tr key={pay.id}>
                                                                        <td className="px-2 py-1">{formatDateIndo(pay.date)}</td>
                                                                        <td className="px-2 py-1">{pay.roomId} - {pay.residentName}</td>
                                                                        <td className="px-2 py-1 text-right font-bold">
                                                                            {pay.amount === 0 ? (
                                                                                <span className="text-red-500 italic text-[9px] uppercase font-bold">Penghuni Check Out</span>
                                                                            ) : (
                                                                                formatIDR(pay.amount)
                                                                            )}
                                                                        </td>
                                                                    </tr>
                                                                ))) : (<tr><td colSpan={3} className="px-2 py-4 text-center text-slate-400 italic">Tidak ada pemasukan.</td></tr>)}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex justify-between px-10 mt-12 break-inside-avoid"><div className="text-center"><p className="text-xs font-bold text-slate-400 uppercase mb-16">Diserahkan Oleh</p><p className="font-bold text-slate-800 border-b border-slate-300 pb-2 px-8">Pengelola</p></div><div className="text-center"><p className="text-xs font-bold text-slate-400 uppercase mb-16">Diterima Oleh</p><p className="font-bold text-slate-800 border-b border-slate-300 pb-2 px-8">Owner</p></div></div>
                                            <div className="mt-8 pt-4 border-t border-slate-100 text-center"><p className="text-[10px] text-slate-400">Dicetak otomatis pada {new Date().toLocaleString('id-ID')}</p></div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* --- CONTENT: SETTINGS --- */}
                {activeTab === 'settings' && (
                    <div className="max-w-2xl mx-auto bg-white rounded-3xl border border-slate-200 shadow-sm p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="flex items-center gap-4 mb-8"><div className="bg-slate-800 p-3 rounded-2xl text-white"><Lock size={24} /></div><div><h3 className="font-bold text-xl text-slate-800">Keamanan Akses</h3><p className="text-sm text-slate-500">Ubah kode akses untuk masuk ke aplikasi.</p></div></div>
                        <div className="space-y-6">
                            <div><label className="block text-sm font-bold text-slate-700 mb-2">Kode Akses Owner</label><input type="text" className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all font-bold text-slate-800" value={config.ownerCode} onChange={(e) => setConfig({...config, ownerCode: e.target.value})} /></div>
                            <div><label className="block text-sm font-bold text-slate-700 mb-2">Kode Akses Admin</label><input type="text" className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all font-bold text-slate-800" value={config.adminCode} onChange={(e) => setConfig({...config, adminCode: e.target.value})} /></div>
                            <div className="pt-4"><button onClick={handleSaveSettings} className="w-full bg-slate-800 text-white font-bold py-4 rounded-2xl shadow-lg hover:bg-slate-900 transition-all flex items-center justify-center gap-2"><Save size={20} /> Simpan Perubahan</button></div>
                        </div>
                    </div>
                )}
            </div>
        </main>

        {/* --- MODALS (Overlays) --- */}

        {/* 1. NEW DELETE CONFIRMATION MODAL (Popup Cantik) */}
        {showDeleteConfirm && (
             <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[80] flex items-center justify-center p-4">
                 <div className="bg-white rounded-3xl w-full max-w-sm p-8 shadow-2xl text-center animate-in zoom-in-95 duration-200">
                     <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4"><Trash2 size={32}/></div>
                     <h3 className="font-bold text-xl text-slate-800 mb-2">Hapus Data?</h3>
                     <p className="text-slate-500 text-sm mb-6">Data yang dihapus tidak dapat dikembalikan. Anda yakin?</p>
                     <div className="flex gap-3 justify-center">
                         <button onClick={() => setShowDeleteConfirm(false)} className="px-5 py-2.5 border rounded-xl font-bold text-slate-500 hover:bg-slate-50">Batal</button>
                         <button onClick={executeDelete} className="px-5 py-2.5 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 shadow-lg shadow-red-200">Ya, Hapus</button>
                     </div>
                 </div>
             </div>
        )}

        {/* 2. Modal Expense */}
        {showExpenseModal && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl animate-in zoom-in-95 duration-200">
                    <h3 className="font-bold text-xl mb-4 text-slate-800 flex items-center gap-2">
                        <TrendingDown className="text-red-600"/> {editingExpenseId ? 'Edit Pengeluaran' : 'Catat Pengeluaran'}
                    </h3>
                    <div className="space-y-4">
                        <div><label className="text-xs font-bold text-slate-500 uppercase">Keterangan Biaya</label><input className="w-full p-3 border rounded-xl mt-1 font-medium" placeholder="Contoh: Beli Lampu, Bayar Air" value={expenseFormData.description} onChange={e => setExpenseFormData({...expenseFormData, description: e.target.value})} autoFocus /></div>
                        <div className="grid grid-cols-2 gap-4">
                            <div><label className="text-xs font-bold text-slate-500 uppercase">Nominal (Rp)</label><input type="number" className="w-full p-3 border rounded-xl mt-1 font-bold text-red-600" value={expenseFormData.amount} onChange={e => setExpenseFormData({...expenseFormData, amount: parseInt(e.target.value) || 0})} /></div>
                            <div><label className="text-xs font-bold text-slate-500 uppercase">Tanggal</label><input type="date" className="w-full p-3 border rounded-xl mt-1" value={expenseFormData.date} onChange={e => setExpenseFormData({...expenseFormData, date: e.target.value})} /></div>
                        </div>
                        <div><label className="text-xs font-bold text-slate-500 uppercase">Kategori</label><select className="w-full p-3 border rounded-xl mt-1" value={expenseFormData.category} onChange={e => setExpenseFormData({...expenseFormData, category: e.target.value})}><option>Operasional</option><option>Perbaikan/Maintenance</option><option>Listrik & Air</option><option>Kebersihan</option><option>Lainnya</option></select></div>
                    </div>
                    <div className="flex justify-end gap-2 mt-6">
                        <button onClick={() => {setShowExpenseModal(false); setEditingExpenseId(null);}} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-100 rounded-xl">Batal</button>
                        <button onClick={handleSaveExpense} className="px-6 py-2 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 shadow-lg">{editingExpenseId ? 'Update' : 'Simpan'}</button>
                    </div>
                </div>
            </div>
        )}

        {/* Existing Modals */}
        {selectedRoom && (
             <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                 <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                     <div className="bg-slate-800 p-6 flex justify-between items-start text-white sticky top-0 z-10">
                         <div><p className="text-slate-400 text-xs uppercase font-bold mb-1">Menu Aksi Kamar</p><h2 className="text-3xl font-black">{selectedRoom.number}</h2><p className="text-sm opacity-80">{selectedRoom.type} • Lantai {selectedRoom.floor}</p></div>
                         <button onClick={() => setSelectedRoom(null)} className="p-2 bg-slate-700 hover:bg-slate-600 rounded-full transition-colors"><X size={20} /></button>
                     </div>
                     <div className="p-6">
                        <div className={`p-4 rounded-2xl border mb-6 ${selectedRoom.resident ? (selectedRoom.status === 'Paid' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200') : 'bg-slate-50 border-slate-200'}`}>
                             {selectedRoom.resident ? (
                                 <div className="flex justify-between items-center"><div><p className="text-xs font-bold uppercase text-slate-500 mb-1">Penghuni Saat Ini</p><h3 className="font-bold text-lg text-slate-800">{selectedRoom.resident}</h3></div><div className="text-right"><p className="text-xs font-bold uppercase text-slate-500 mb-1">Status</p>{selectedRoom.status === 'Paid' ? <span className="bg-green-500 text-white px-2 py-1 rounded-lg text-xs font-bold">LUNAS</span> : <span className="bg-red-500 text-white px-2 py-1 rounded-lg text-xs font-bold">BELUM BAYAR</span>}</div></div>
                             ) : (<div className="flex items-center gap-3 text-slate-500"><Info size={24} /><p className="font-medium text-sm">Kamar ini belum ada penghuninya.</p></div>)}
                        </div>
                        {selectedRoom.resident && (
                            <div className="mb-6 bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden">
                                <div className="bg-slate-100 px-4 py-2 border-b border-slate-200 flex items-center gap-2"><ListChecks size={16} className="text-slate-500"/><h4 className="text-xs font-bold text-slate-600 uppercase">Rincian Keuangan</h4></div>
                                <div className="p-4 space-y-4">
                                    <div><p className="text-xs font-bold text-slate-400 uppercase mb-2">Tunggakan / Belum Dibayar</p>{getOverdueMonthsList(selectedRoom).length > 0 ? (<div className="flex flex-wrap gap-2">{getOverdueMonthsList(selectedRoom).map((month, idx) => (<span key={idx} className="text-xs font-bold text-red-600 bg-red-50 border border-red-100 px-2 py-1 rounded-lg flex items-center gap-1"><AlertCircle size={10} /> {month}</span>))}</div>) : (<p className="text-xs text-green-600 font-bold flex items-center gap-1"><CheckCircle2 size={14}/> Tidak ada tunggakan. Pembayaran lancar.</p>)}</div>
                                    <div className="border-t border-slate-200"></div>
                                    <div><p className="text-xs font-bold text-slate-400 uppercase mb-2">Riwayat Pembayaran Terakhir</p><div className="space-y-2">{payments.filter(p => p.roomId === selectedRoom.number && p.residentName === selectedRoom.resident).length > 0 ? (payments.filter(p => p.roomId === selectedRoom.number && p.residentName === selectedRoom.resident).slice(0, 3).map(p => (<div key={p.id} className="flex justify-between items-center text-xs bg-white p-2 rounded border border-slate-100"><span className="text-slate-600 font-medium">{formatDateIndo(p.date)}</span><span className="font-bold text-slate-800">{formatIDR(p.amount)}</span></div>))) : (<p className="text-xs text-slate-400 italic">Belum ada riwayat pembayaran.</p>)}</div></div>
                                </div>
                            </div>
                        )}
                        {userRole === 'admin' ? (
                            <div className="grid grid-cols-2 gap-3">
                                {selectedRoom.resident ? (
                                    <>
                                        <button onClick={() => openPay(selectedRoom)} className="col-span-2 bg-emerald-600 hover:bg-emerald-700 text-white p-4 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-100 transition-all"><CreditCard size={20} /> Bayar / Perpanjang</button>
                                        <button onClick={() => openEditResident(selectedRoom)} className="bg-amber-100 hover:bg-amber-200 text-amber-800 p-4 rounded-2xl font-bold flex flex-col items-center gap-2 transition-all"><UserCog size={24} /> <span className="text-xs">Edit Data</span></button>
                                        <button onClick={() => openDetail(selectedRoom)} className="bg-blue-100 hover:bg-blue-200 text-blue-800 p-4 rounded-2xl font-bold flex flex-col items-center gap-2 transition-all"><FileText size={24} /> <span className="text-xs">Detail / KTP</span></button>
                                        <button onClick={() => openCheckout(selectedRoom)} className="bg-red-100 hover:bg-red-200 text-red-700 p-4 rounded-2xl font-bold flex flex-col items-center gap-2 transition-all"><DoorOpen size={24} /> <span className="text-xs">Checkout</span></button>
                                        <button onClick={() => openEditRoom(selectedRoom)} className="bg-slate-100 hover:bg-slate-200 text-slate-600 p-4 rounded-2xl font-bold flex flex-col items-center gap-2 transition-all"><Pencil size={24} /> <span className="text-xs">Edit Fisik</span></button>
                                    </>
                                ) : (
                                    <>
                                        <button onClick={() => openRegister(selectedRoom)} className="col-span-2 bg-indigo-600 hover:bg-indigo-700 text-white p-4 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-indigo-100 transition-all"><UserPlus size={20} /> Registrasi Penghuni Baru</button>
                                        <button onClick={() => openEditRoom(selectedRoom)} className="col-span-2 bg-slate-100 hover:bg-slate-200 text-slate-600 p-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all"><Pencil size={20} /> Edit Fisik Kamar</button>
                                    </>
                                )}
                            </div>
                        ) : (<p className="text-slate-400 italic text-sm text-center py-4">Menu aksi hanya untuk admin.</p>)}
                     </div>
                 </div>
             </div>
        )}
        {showResidentForm && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl w-full max-w-lg p-0 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                    <div className="bg-indigo-600 p-6 text-white flex justify-between items-center"><h3 className="font-bold text-xl flex items-center gap-2"><UserPlus size={22}/> Registrasi Penghuni</h3><button onClick={() => setShowResidentForm(false)} className="hover:bg-indigo-700 p-1 rounded-full"><X size={20}/></button></div>
                    <div className="p-6 space-y-4">
                        <div><label className="text-xs font-bold text-slate-500 uppercase">Nama Lengkap</label><input className="w-full p-3 border rounded-xl mt-1 bg-slate-50 font-bold text-slate-800" value={residentFormData.name} onChange={e => setResidentFormData({...residentFormData, name: e.target.value})} placeholder="Nama Sesuai KTP" /></div>
                        <div className="grid grid-cols-2 gap-4"><div><label className="text-xs font-bold text-slate-500 uppercase">Tanggal Masuk</label><input type="date" className="w-full p-3 border rounded-xl mt-1" value={residentFormData.entryDate} onChange={e => setResidentFormData({...residentFormData, entryDate: e.target.value})} /></div><div><label className="text-xs font-bold text-slate-500 uppercase">Alamat Asal</label><input className="w-full p-3 border rounded-xl mt-1" value={residentFormData.address} onChange={e => setResidentFormData({...residentFormData, address: e.target.value})} placeholder="Kota / Alamat" /></div></div>
                        <div className="border-t border-slate-100 pt-4"><label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Upload Foto / KTP</label><div className="flex items-center gap-4"><label className="cursor-pointer bg-indigo-50 text-indigo-600 px-4 py-3 rounded-xl font-bold text-sm hover:bg-indigo-100 transition-colors flex items-center gap-2"><Upload size={16}/> Pilih Foto <input type="file" className="hidden" accept="image/*" onChange={handleKtpUpload} /></label>{residentFormData.ktpPhoto && <span className="text-xs text-green-600 font-bold flex items-center gap-1"><Check size={12}/> Foto Terupload</span>}</div>{residentFormData.ktpPhoto && <img src={residentFormData.ktpPhoto} className="mt-3 h-24 rounded-lg border border-slate-200" />}</div>
                    </div>
                    <div className="p-4 bg-slate-50 flex justify-end gap-3"><button onClick={() => setShowResidentForm(false)} className="px-5 py-2.5 text-slate-500 font-bold hover:bg-slate-200 rounded-xl">Batal</button><button onClick={handleSaveResident} className="px-6 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200">Simpan Data</button></div>
                </div>
            </div>
        )}
        {showResidentDetail && selectedRoomForResident && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl animate-in zoom-in-95 duration-200">
                    <div className="flex justify-between items-start mb-6"><div><h3 className="font-bold text-2xl text-slate-800">{selectedRoomForResident.resident}</h3><span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-xs font-bold mt-1 inline-block flex items-center gap-1 w-fit"><MapPin size={12}/> {selectedRoomForResident.address || '-'}</span></div><div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600 font-black text-xl">{selectedRoomForResident.number.replace('ROOM ', '')}</div></div>
                    <div className="grid grid-cols-2 gap-4 mb-6"><div className="bg-slate-50 p-3 rounded-xl border border-slate-100"><p className="text-xs text-slate-400 uppercase font-bold">Tanggal Masuk</p><p className="font-bold text-slate-700">{formatDateIndo(selectedRoomForResident.entryDate)}</p></div><div className="bg-slate-50 p-3 rounded-xl border border-slate-100"><p className="text-xs text-slate-400 uppercase font-bold">Jatuh Tempo</p><p className="font-bold text-slate-700">{formatDateIndo(selectedRoomForResident.nextPaymentDate)}</p></div></div>
                    <div className="border-t border-slate-100 pt-4"><p className="text-xs text-slate-400 uppercase font-bold mb-3 flex items-center gap-2"><FileText size={14}/> Dokumen / Foto Penghuni</p>{selectedRoomForResident.ktpPhoto ? (<div className="rounded-xl overflow-hidden border border-slate-200"><img src={selectedRoomForResident.ktpPhoto} className="w-full object-cover" /></div>) : <p className="text-sm text-slate-400 italic">Tidak ada foto terlampir.</p>}</div>
                    <button onClick={() => setShowResidentDetail(false)} className="mt-6 w-full py-3 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-900 shadow-lg">Tutup</button>
                </div>
            </div>
        )}
        {showPaymentModal && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                    <div className="bg-emerald-600 p-6 text-white"><p className="opacity-80 text-xs font-bold uppercase tracking-wider mb-1">Aktivasi & Pembayaran</p><h3 className="font-black text-2xl">{paymentFormData.roomNumber} - {paymentFormData.resident}</h3></div>
                    <div className="p-6 space-y-6">
                        <div className="flex justify-between items-end border-b border-dashed border-slate-200 pb-4"><div><p className="text-xs text-slate-500 mb-1">Jatuh Tempo (Sesuai Tgl Masuk)</p><p className={`text-lg font-bold ${getDaysOverdue(paymentFormData.currentDueDateRaw) > 0 ? 'text-red-500' : 'text-slate-800'}`}>{formatDateIndo(paymentFormData.currentDueDateRaw)}</p></div><div className="text-right"><p className="text-xs text-slate-500 mb-1">Harga Sewa</p><p className="text-lg font-bold text-slate-800">{formatIDR(paymentFormData.roomPrice)}/bln</p></div></div>
                        <div><label className="block text-xs font-bold text-slate-500 uppercase mb-2">Nominal Diterima (Rp)</label><input type="number" className="w-full p-4 text-2xl font-black text-slate-800 border-2 border-slate-200 rounded-2xl focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 outline-none transition-all placeholder:text-slate-200" placeholder="0" value={paymentFormData.amount} onChange={e => setPaymentFormData({...paymentFormData, amount: parseInt(e.target.value) || 0})} autoFocus /><div className="flex gap-2 mt-3"><select className="w-1/2 p-2 border rounded-xl text-sm" value={paymentFormData.method} onChange={e => setPaymentFormData({...paymentFormData, method: e.target.value})}><option>Transfer</option><option>Tunai</option><option>QRIS</option></select><input type="date" className="w-1/2 p-2 border rounded-xl text-sm" value={paymentFormData.date} onChange={e => setPaymentFormData({...paymentFormData, date: e.target.value})} /></div></div>
                        {(() => { const preview = calculatePaymentPreview(); return preview.isValid ? (<div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100"><div className="flex justify-between text-sm mb-1"><span className="text-emerald-800">Perpanjangan</span><span className="font-bold text-emerald-800">{preview.months} Bulan</span></div><div className="flex justify-between text-sm mb-1"><span className="text-emerald-800">Jatuh Tempo Baru</span><span className="font-bold text-emerald-800">{formatDateIndo(preview.newDate)}</span></div></div>) : <p className="text-center text-xs text-slate-400 italic">Masukkan minimal {formatIDR(paymentFormData.roomPrice)}</p> })()}
                    </div>
                    <div className="p-4 bg-slate-50 flex justify-end gap-3"><button onClick={() => setShowPaymentModal(false)} className="px-5 py-2.5 text-slate-500 font-bold hover:bg-slate-200 rounded-xl">Batal</button>
                    <button 
                        onClick={handleConfirmPayment} 
                        disabled={isSubmitting}
                        className={`px-6 py-2.5 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 shadow-lg shadow-emerald-200 flex items-center gap-2 ${isSubmitting ? 'opacity-70 cursor-wait' : ''}`}
                    >
                        {isSubmitting ? 'Memproses...' : <><CheckCircle2 size={18}/> Konfirmasi Aktif</>}
                    </button></div>
                </div>
            </div>
        )}
        {showEditResidentForm && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl w-full max-w-lg p-6 shadow-2xl animate-in zoom-in-95 duration-200">
                     <h3 className="font-bold text-xl mb-4 text-slate-800 flex items-center gap-2"><UserCog className="text-amber-500"/> Edit Data Penghuni</h3>
                     <div className="space-y-4">
                        <div><label className="text-xs font-bold text-slate-500 uppercase">Nama</label><input className="w-full p-3 border rounded-xl mt-1 font-bold" value={editResidentData.name} onChange={e => setEditResidentData({...editResidentData, name: e.target.value})} /></div>
                        <div><label className="text-xs font-bold text-slate-500 uppercase">Alamat</label><input className="w-full p-3 border rounded-xl mt-1" value={editResidentData.address} onChange={e => setEditResidentData({...editResidentData, address: e.target.value})} /></div>
                        <div className="grid grid-cols-2 gap-4"><div><label className="text-xs font-bold text-slate-500 uppercase">Tanggal Masuk</label><input type="date" className="w-full p-3 border rounded-xl mt-1" value={editResidentData.entryDate} onChange={e => setEditResidentData({...editResidentData, entryDate: e.target.value})} /></div><div><label className="text-xs font-bold text-slate-500 uppercase">Jatuh Tempo (Manual)</label><input type="date" className="w-full p-3 border border-amber-200 bg-amber-50 rounded-xl mt-1" value={editResidentData.nextPaymentDate} onChange={e => setEditResidentData({...editResidentData, nextPaymentDate: e.target.value})} /></div></div>
                     </div>
                     <div className="flex justify-end gap-2 mt-6"><button onClick={() => setShowEditResidentForm(false)} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-100 rounded-xl">Batal</button><button onClick={handleSaveEditedResident} className="px-6 py-2 bg-amber-500 text-white font-bold rounded-xl hover:bg-amber-600">Simpan Perubahan</button></div>
                </div>
            </div>
        )}
        {showRoomForm && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl animate-in zoom-in-95 duration-200">
                    <h3 className="font-bold text-xl mb-4 text-slate-800">Edit Kamar {roomFormData.number}</h3>
                    <div className="space-y-4"><div><label className="text-xs font-bold text-slate-500 uppercase">Harga</label><input type="number" className="w-full p-3 border rounded-xl mt-1" value={roomFormData.price} onChange={e => setRoomFormData({...roomFormData, price: parseInt(e.target.value)})} /></div><div><label className="text-xs font-bold text-slate-500 uppercase">Fasilitas/Desc</label><input className="w-full p-3 border rounded-xl mt-1" value={roomFormData.desc} onChange={e => setRoomFormData({...roomFormData, desc: e.target.value})} /></div></div>
                    <div className="flex justify-end gap-2 mt-6"><button onClick={() => setShowRoomForm(false)} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-100 rounded-xl">Batal</button><button onClick={handleSaveRoom} className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700">Simpan</button></div>
                </div>
            </div>
        )}
        {showCheckoutModal && checkoutData && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl w-full max-w-sm p-8 shadow-2xl text-center animate-in zoom-in-95 duration-200">
                    <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4"><LogOut size={32}/></div>
                    <h3 className="font-bold text-xl text-slate-800 mb-2">Konfirmasi Checkout</h3>
                    <p className="text-slate-500 text-sm mb-6">Apakah Anda yakin ingin mengeluarkan <strong>{checkoutData.resident}</strong>? Data akan dihapus.</p>
                    <div className="flex gap-3 justify-center"><button onClick={() => setShowCheckoutModal(false)} className="px-5 py-2.5 border rounded-xl font-bold text-slate-500 hover:bg-slate-50">Batal</button><button onClick={handleConfirmCheckout} className="px-5 py-2.5 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 shadow-lg shadow-red-200">Ya, Checkout</button></div>
                </div>
            </div>
        )}

        {/* --- FLOATING REFRESH BUTTON --- */}
        {(userRole === 'owner' || activeTab === 'monitor') && (
            <button 
                onClick={handleSoftRefresh} 
                className="fixed bottom-8 right-8 bg-indigo-600 text-white p-4 rounded-full shadow-2xl hover:bg-indigo-700 transition-all z-[80] hover:scale-110 active:scale-95 group"
                title="Refresh Data"
            >
                <RefreshCw size={24} className={loading ? "animate-spin" : "group-hover:rotate-180 transition-transform duration-500"} />
            </button>
        )}
    </div>
  );
}