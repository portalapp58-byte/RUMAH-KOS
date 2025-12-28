import React, { useState, useEffect, useRef } from 'react';
import { 
  LayoutDashboard, Bed, History, Settings, LogOut, Plus, 
  Printer, Home, CreditCard, AlertCircle, UserPlus, Pencil, 
  X, Users, ChevronRight, Info, Upload, FileText, DoorOpen, 
  CalendarCheck, Wallet, CheckCircle2, Calendar, ArrowLeft, 
  Stamp, Clock, Save, Lock, TrendingUp, Calculator, UserCog, 
  Download, RefreshCw, AlertTriangle 
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

// Format Mata Uang IDR
const formatIDR = (amount) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
  }).format(amount);
};

// Format Tanggal Indo
const formatDateIndo = (dateStr) => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
};

// Helper: Tambah Bulan untuk Next Payment
const addMonths = (dateStr, months) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  date.setMonth(date.getMonth() + months);
  return date.toISOString().split('T')[0];
};

// [LOGIKA BARU] Helper: Hitung Status Hutang & Durasi Telat Detail
const getDebtCalculation = (room) => {
  if (!room.resident || !room.nextPaymentDate) {
    return { months: 0, totalDebt: 0, text: '' };
  }

  const today = new Date();
  today.setHours(0,0,0,0);
  
  const dueDate = new Date(room.nextPaymentDate);
  dueDate.setHours(0,0,0,0);
   
  // Jika belum jatuh tempo
  if (dueDate >= today) return { months: 0, totalDebt: 0, text: 'Aman' };

  // Hitung selisih hari absolut
  const diffTime = today - dueDate;
  const overdueDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  // Hitung bulan telat (Approximation 30 days)
  const monthsLate = Math.floor(overdueDays / 30);
  const daysLate = overdueDays % 30;

  // Logic Hutang: Telat 1 hari pun dihitung hutang 1 bulan berjalan + hutang masa lalu
  // Rumus: (Bulan Telat + 1 bulan berjalan) * Harga + Hutang Lama
  const multiplier = monthsLate + 1; 
  const totalDebt = (multiplier * room.price) + (room.debt || 0);

  // Format Text Telat Bertingkat
  let overdueText = "";
  if (monthsLate > 0) {
      overdueText = `Telat ${monthsLate} Bln ${daysLate} Hari`;
  } else {
      overdueText = `Telat ${daysLate} Hari`;
  }

  return { totalDebt, text: overdueText, overdueDays };
};

// [LOGIKA BARU] Helper: Status Pintar (Traffic Light)
// Menggabungkan Warna, Status Text, dan Hutang untuk UI
const getSmartRoomStatus = (room) => {
  if (!room.resident) {
    return { 
        code: 'empty', 
        color: 'bg-white border-slate-200 hover:border-blue-300', 
        badgeColor: 'bg-slate-100 text-slate-400',
        label: 'Kosong',
        subText: ''
    };
  }

  const today = new Date();
  today.setHours(0,0,0,0);
  const due = new Date(room.nextPaymentDate);
  due.setHours(0,0,0,0);

  const diffTime = due - today;
  // Positif = Sisa hari, Negatif = Lewat hari
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

  // 1. MERAH (Telat / Nunggak) - Sudah lewat jatuh tempo
  if (diffDays < 0) {
      const debtInfo = getDebtCalculation(room);
      return {
          code: 'overdue',
          color: 'bg-red-50 border-red-300 hover:border-red-500',
          badgeColor: 'bg-red-600 text-white animate-pulse',
          textColor: 'text-red-600',
          label: debtInfo.text, // "Telat X Bulan Y Hari"
          subText: `-${formatIDR(debtInfo.totalDebt)}`, // Nominal Hutang
          totalDebt: debtInfo.totalDebt
      };
  }

  // 2. KUNING (Tagih / Warning) - Rentang H-5 sampai Hari H
  if (diffDays >= 0 && diffDays <= 5) {
      return {
          code: 'warning',
          color: 'bg-yellow-50 border-yellow-300 hover:border-yellow-500',
          badgeColor: 'bg-yellow-400 text-yellow-900',
          textColor: 'text-yellow-700',
          label: diffDays === 0 ? 'HARI INI!' : `Tagih (H-${diffDays})`,
          subText: 'Siapkan Tagihan',
          totalDebt: 0
      };
  }

  // 3. HIJAU (Aman / Lunas) - Masih jauh (> 5 hari)
  return {
      code: 'safe',
      color: 'bg-green-50 border-green-300 hover:border-green-500',
      badgeColor: 'bg-green-500 text-white',
      textColor: 'text-green-700',
      label: 'Aman',
      subText: `Sisa ${diffDays} Hari`,
      totalDebt: 0
  };
};

const MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

const App = () => {
  // --- STATE UTAMA ---
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userRole, setUserRole] = useState(null); 
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loginCode, setLoginCode] = useState('');
  const [isLoading, setIsLoading] = useState(false); // State untuk loading refresh
   
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
  const reportContentRef = useRef(null); 

  // --- CONFIG ---
  const [config, setConfig] = useState({
    ownerCode: 'OWNER123',
    adminCode: 'ADMIN456'
  });

  const [rooms, setRooms] = useState([]); 
  const [payments, setPayments] = useState([]); 

  // --- FUNGSI FETCH DATA (DIPISAH AGAR BISA DI-REFRESH) ---
  const fetchData = async () => {
    setIsLoading(true);
    try {
      // 1. Ambil Data Kamar
      const snapshot = await getDocs(collection(db, "rooms"));
       
      if (snapshot.empty) {
        // Generator Data Awal jika kosong
        const generateInitialRooms = () => {
            return Array.from({ length: 20 }, (_, i) => {
            const num = i + 1;
            const roomNumber = `ROOM ${num < 10 ? '0' + num : num}`;
            const isFloor1 = num <= 10;
            
            return {
                id: num,
                number: roomNumber,
                price: isFloor1 ? 0 : 0,
                type: isFloor1 ? 'Standard' : 'Ekonomis',
                floor: isFloor1 ? '1' : '2',
                bathroom: isFloor1 ? 'Dalam' : 'Luar',
                desc: isFloor1 ? 'Lantai Bawah' : 'Lantai Atas',
                resident: '', 
                entryDate: '',
                nextPaymentDate: '',
                ktpPhoto: null,
                status: 'Available',
                debt: 0
            };
            });
        };
        const dataAwal = generateInitialRooms();
        setRooms(dataAwal);
        dataAwal.forEach(async (room) => {
          await setDoc(doc(db, "rooms", room.number), room);
        });
      } else {
        const dataDariDB = snapshot.docs.map(doc => doc.data());
        dataDariDB.sort((a, b) => a.id - b.id);
        setRooms(dataDariDB);
      }

      // 2. Ambil Riwayat Pembayaran
      const paySnapshot = await getDocs(collection(db, "payments"));
      const payData = paySnapshot.docs.map(doc => doc.data());
      payData.sort((a, b) => b.id - a.id);
      setPayments(payData);

      // 3. Ambil Konfigurasi
      const configSnap = await getDoc(doc(db, "settings", "access_codes"));
      if (configSnap.exists()) {
        setConfig(configSnap.data());
      }

      // 4. Ambil Status Setor
      const depositSnap = await getDoc(doc(db, "settings", "deposits"));
      if (depositSnap.exists()) {
        setDepositStatus(depositSnap.data());
      }

    } catch (error) {
      console.error("Error loading data:", error);
      alert("Gagal memuat data. Periksa koneksi internet.");
    } finally {
      setIsLoading(false);
    }
  };

  // --- USE EFFECT: LOAD DATA SAAT START ---
  useEffect(() => {
    fetchData();
  }, []);

  // --- FORM STATES ---
  const initialRoomState = { number: '', price: '', type: '', floor: '', bathroom: 'Dalam', desc: '' };
  const [roomFormData, setRoomFormData] = useState(initialRoomState);

  const initialResidentState = { name: '', entryDate: '', nextPaymentDate: '', ktpPhoto: null };
  const [residentFormData, setResidentFormData] = useState(initialResidentState);
  
  const [editResidentData, setEditResidentData] = useState({ roomId: null, name: '', entryDate: '', nextPaymentDate: '' });

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

  const handleSaveRoom = async () => {
    if (editingId) {
      try {
        const roomToUpdate = rooms.find(r => r.id === editingId);
        if (roomToUpdate) {
            await updateDoc(doc(db, "rooms", roomToUpdate.number), {
                price: roomFormData.price,
                desc: roomFormData.desc
            });
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

  // --- LOGIC RESIDENT REGISTRATION (ADMIN) ---
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

      const entry = new Date(residentFormData.entryDate);
      const nextDue = new Date(residentFormData.nextPaymentDate);
      const roomPrice = selectedRoomForResident.price || 0;
      let newPaymentLog = null;

      if (nextDue > entry && roomPrice > 0) {
          const monthsPaid = (nextDue.getFullYear() - entry.getFullYear()) * 12 + (nextDue.getMonth() - entry.getMonth());
          
          if (monthsPaid > 0) {
             const totalPaid = monthsPaid * roomPrice;
             
             newPaymentLog = {
                id: Date.now(),
                roomId: selectedRoomForResident.number,
                residentName: residentFormData.name,
                amount: totalPaid,
                date: residentFormData.entryDate,
                type: 'Pembayaran Awal (Registrasi)',
                method: 'Tunai'
             };
             
             await addDoc(collection(db, "payments"), newPaymentLog);
          }
      }

      const updatedRooms = rooms.map(room => {
        if (room.id === selectedRoomForResident.id) {
          return { ...room, ...dataUpdate };
        }
        return room;
      });
      setRooms(updatedRooms);

      if (newPaymentLog) {
          setPayments([newPaymentLog, ...payments]);
      }

      setShowResidentForm(false);
      
      if (newPaymentLog) {
          alert(`Penghuni berhasil disimpan & Pembayaran awal ${formatIDR(newPaymentLog.amount)} tercatat otomatis!`);
      } else {
          alert("Penghuni berhasil disimpan (Belum ada pembayaran dicatat).");
      }

    } catch (error) {
      console.error(error);
      alert("Gagal simpan: " + error.message);
    }
  };

  const openEditResidentForm = (room) => {
    setEditResidentData({
        roomId: room.id,
        roomNumber: room.number,
        name: room.resident,
        entryDate: room.entryDate,
        nextPaymentDate: room.nextPaymentDate
    });
    setShowEditResidentForm(true);
  };

  const handleSaveEditedResident = async () => {
    try {
        await updateDoc(doc(db, "rooms", editResidentData.roomNumber), {
            resident: editResidentData.name,
            entryDate: editResidentData.entryDate,
            nextPaymentDate: editResidentData.nextPaymentDate
        });

        setRooms(rooms.map(room => {
            if (room.id === editResidentData.roomId) {
                return { 
                    ...room, 
                    resident: editResidentData.name,
                    entryDate: editResidentData.entryDate,
                    nextPaymentDate: editResidentData.nextPaymentDate
                };
            }
            return room;
        }));
        
        setShowEditResidentForm(false);
        alert("Data penghuni berhasil diperbarui!");
    } catch (error) {
        console.error("Error editing resident:", error);
        alert("Gagal update data: " + error.message);
    }
  };

  // --- LOGIC PAYMENT (ADMIN) ---
  const openPaymentModal = (room) => {
    const today = new Date().toISOString().split('T')[0];
    const baseDueDate = room.nextPaymentDate || room.entryDate || today;

    setPaymentFormData({
      roomId: room.id,
      roomNumber: room.number,
      resident: room.resident, 
      roomPrice: room.price, 
      amount: 0, 
      date: today,
      method: 'Transfer',
      nextDueDate: baseDueDate, 
      currentDueDateRaw: baseDueDate 
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
    const newDueDateStr = newDueObj.toISOString().split('T')[0];

    return {
        months: monthsPaid,
        remainder: remainder,
        newDate: newDueDateStr,
        isValid: monthsPaid > 0
    };
  };

  const handleConfirmPayment = async () => {
    const preview = calculatePaymentPreview();

    if (!preview.isValid) {
        alert("Nominal pembayaran belum mencukupi untuk 1 bulan sewa.");
        return;
    }

    try {
      const today = new Date();
      today.setHours(0,0,0,0);
      const newDue = new Date(preview.newDate);
      newDue.setHours(0,0,0,0);

      const newStatus = newDue >= today ? 'Paid' : 'Unpaid';

      await updateDoc(doc(db, "rooms", paymentFormData.roomNumber), {
        status: newStatus, 
        debt: 0, // Hutang lunas
        nextPaymentDate: preview.newDate 
      });

      const newPayment = {
        id: Date.now(),
        roomId: paymentFormData.roomNumber,
        residentName: paymentFormData.resident,
        amount: paymentFormData.amount,
        date: paymentFormData.date,
        type: `Sewa (${preview.months} Bulan)`, 
        method: paymentFormData.method
      };
      await addDoc(collection(db, "payments"), newPayment);

      setRooms(rooms.map(room => {
        if (room.id === paymentFormData.roomId) {
          return { 
            ...room, 
            status: newStatus, 
            debt: 0, 
            nextPaymentDate: preview.newDate 
          };
        }
        return room;
      }));

      setPayments([newPayment, ...payments]);
      setShowPaymentModal(false);
      alert("Pembayaran berhasil! Jatuh tempo diperpanjang.");

    } catch (error) {
      console.error(error);
      alert("Gagal bayar: " + error.message);
    }
  };

  // --- LOGIC CHECKOUT ---
  const openCheckoutModal = (room) => {
    setCheckoutData(room);
    setShowCheckoutModal(true);
  };

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
        residentName: checkoutData.resident, 
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

  const handleDownloadPDF = () => {
    const element = reportContentRef.current;
    if (!element) return;

    const opt = {
      margin: 10,
      filename: `Laporan-Keuangan-${MONTH_NAMES[selectedMonthIndex]}-${selectedYear}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true }, 
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(element).save();
  };

  const handleCheckResidentFromDashboard = () => {
    if (selectedRoom) {
      setSelectedRoomForResident(selectedRoom);
      setSelectedRoom(null); 
      setShowResidentDetail(true); 
    }
  };

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

  const toggleDepositStatus = async () => {
    const key = `${selectedYear}-${selectedMonthIndex}`;
    const newStatus = !depositStatus[key];

    const updatedStatus = { ...depositStatus, [key]: newStatus };
    setDepositStatus(updatedStatus);

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
  // Filter untuk Header Owner: Yang statusnya Overdue (Merah)
  const overdueRooms = rooms.filter(r => {
    const status = getSmartRoomStatus(r);
    return r.resident && status.code === 'overdue';
  });
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
            <h1 className="text-2xl font-bold text-slate-800">Management Rumah Kos</h1>
            <p className="text-slate-500">Building By Malang Florist Group</p>
          </div>
          <div className="space-y-4">
            <input 
              type="password" 
              placeholder="Masukkan Kode User Anda" 
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
            <p>Aplikasi Kode V.6.0 (Smart Traffic & Auto Debt):</p>
            <p>Support By Malang Florist Group</p>
          </div>
        </div>
      </div>
    );
  }

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

          {showEditResidentForm && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm print:hidden">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="bg-indigo-600 p-6 flex justify-between items-center text-white">
                    <div><h4 className="font-bold text-lg flex items-center gap-2"><UserCog size={20}/> Edit Data Penghuni</h4><p className="text-xs opacity-90 mt-1">{editResidentData.roomNumber}</p></div>
                    <button onClick={() => setShowEditResidentForm(false)} className="hover:bg-indigo-700 p-1 rounded-full"><X size={20}/></button>
                </div>
                <div className="p-6 space-y-4">
                    <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nama Penghuni</label><input className="w-full px-3 py-2 border rounded-lg font-bold text-slate-700" value={editResidentData.name} onChange={e => setEditResidentData({...editResidentData, name: e.target.value})} /></div>
                    <div className="grid grid-cols-2 gap-4">
                      <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Tanggal Masuk</label><input type="date" className="w-full px-3 py-2 border rounded-lg" value={editResidentData.entryDate} onChange={e => setEditResidentData({...editResidentData, entryDate: e.target.value})} /></div>
                      <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Jadwal Tagihan (Jatuh Tempo)</label><input type="date" className="w-full px-3 py-2 border rounded-lg bg-yellow-50 border-yellow-200" value={editResidentData.nextPaymentDate} onChange={e => setEditResidentData({...editResidentData, nextPaymentDate: e.target.value})} /></div>
                    </div>
                    <div className="bg-blue-50 p-3 rounded-lg text-xs text-blue-700 flex gap-2 items-start"><Info size={16} className="shrink-0 mt-0.5" /> <span>Mengubah tanggal jatuh tempo di sini akan mempengaruhi status pembayaran secara manual. Gunakan dengan hati-hati.</span></div>
                </div>
                <div className="p-4 bg-slate-50 flex justify-end gap-2 border-t border-slate-100">
                    <button onClick={() => setShowEditResidentForm(false)} className="px-4 py-2 rounded-lg text-slate-600 font-bold hover:bg-slate-200">Batal</button>
                    <button onClick={handleSaveEditedResident} className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700">Simpan Perubahan</button>
                </div>
              </div>
            </div>
          )}

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

          {/* 5. [MODIFIKASI] Modal Pembayaran (Menampilkan Total Hutang Kumulatif) */}
          {showPaymentModal && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm print:hidden">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="bg-blue-600 p-6 flex justify-between items-center text-white">
                    <h4 className="font-bold text-lg flex items-center gap-2"><Wallet size={20}/> Pembayaran Sewa</h4>
                    <button onClick={() => setShowPaymentModal(false)} className="hover:bg-blue-700 p-1 rounded-full"><X size={20}/></button>
                </div>
                
                <div className="p-6 space-y-6">
                    {/* INFO TAGIHAN DENGAN STATUS PINTAR */}
                    <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
                         {(() => {
                            // Ambil object room asli dari state berdasarkan ID pembayaran
                            const currentRoomObj = rooms.find(r => r.id === paymentFormData.roomId) || {};
                            const statusInfo = getSmartRoomStatus(currentRoomObj);
                            
                            return (
                                <>
                                    <div className="flex justify-between items-center mb-2">
                                        <h5 className="text-xs font-black text-slate-400 uppercase tracking-wide">Info Tagihan - {paymentFormData.roomNumber}</h5>
                                        <span className="text-xs font-bold bg-white border border-slate-200 px-2 py-0.5 rounded text-slate-600">{paymentFormData.resident}</span>
                                    </div>
                                    <div className="flex justify-between items-end">
                                        <div>
                                            <p className="text-xs text-slate-500 mb-1">Jatuh Tempo Saat Ini:</p>
                                            <p className={`text-lg font-bold ${statusInfo.code === 'overdue' ? 'text-red-600' : 'text-slate-800'}`}>
                                                {formatDateIndo(paymentFormData.currentDueDateRaw)}
                                            </p>
                                            {statusInfo.code === 'overdue' && <span className="text-[10px] bg-red-100 text-red-600 px-1.5 rounded font-bold">SUDAH LEWAT JATUH TEMPO</span>}
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs text-slate-500 mb-1">Harga Sewa:</p>
                                            <p className="text-lg font-bold text-slate-800">{formatIDR(paymentFormData.roomPrice)} /bln</p>
                                        </div>
                                    </div>
                                    
                                    {/* Menampilkan Total Hutang Kumulatif Jika Ada */}
                                    {statusInfo.totalDebt > 0 && (
                                      <div className="mt-3 bg-red-50 border border-red-100 p-2 rounded-lg text-center animate-pulse">
                                          <p className="text-[10px] text-red-500 font-bold uppercase mb-1">Total Tunggakan Kumulatif (Estimasi)</p>
                                          <p className="text-xl font-black text-red-600">{formatIDR(statusInfo.totalDebt)}</p>
                                          <p className="text-[10px] text-red-400 font-medium mt-1">{statusInfo.label}</p>
                                      </div>
                                    )}
                                </>
                            );
                         })()}
                    </div>

                    <hr className="border-dashed border-slate-200" />

                    {/* INPUT PEMBAYARAN */}
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Masukkan Nominal Diterima</label>
                        <div className="relative">
                            <span className="absolute left-4 top-3.5 text-slate-400 font-bold">Rp</span>
                            <input 
                                type="number" 
                                className="w-full pl-12 pr-4 py-3 border-2 border-blue-100 rounded-xl font-bold text-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none transition-all"
                                placeholder="0"
                                value={paymentFormData.amount} 
                                onChange={e => setPaymentFormData({...paymentFormData, amount: parseInt(e.target.value) || 0})}
                                autoFocus
                            />
                        </div>
                         <div className="flex gap-2 mt-3">
                            <div className="w-1/2">
                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Metode</label>
                                <select className="w-full px-3 py-2 border rounded-lg bg-white text-sm" value={paymentFormData.method} onChange={e => setPaymentFormData({...paymentFormData, method: e.target.value})}><option value="Transfer">Transfer</option><option value="Tunai">Tunai</option><option value="QRIS">QRIS</option></select>
                            </div>
                            <div className="w-1/2">
                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Tanggal Transaksi</label>
                                <input type="date" className="w-full px-3 py-2 border rounded-lg text-sm" value={paymentFormData.date} onChange={e => setPaymentFormData({...paymentFormData, date: e.target.value})} />
                            </div>
                        </div>
                    </div>

                    {/* KALKULASI OTOMATIS (LIVE PREVIEW) */}
                    {(() => {
                        const preview = calculatePaymentPreview();
                        return (
                            <div className={`rounded-xl p-4 border transition-all ${preview.isValid ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200'}`}>
                                <h5 className="text-xs font-black uppercase tracking-wide mb-3 flex items-center gap-2">
                                    <Calculator size={14}/> Hasil Kalkulasi Otomatis
                                </h5>
                                {preview.isValid ? (
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-slate-600">Durasi Perpanjangan:</span>
                                            <span className="font-bold text-green-700">{preview.months} Bulan</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-slate-600">Jatuh Tempo BARU:</span>
                                            <span className="font-bold text-blue-700 bg-blue-100 px-2 rounded">{formatDateIndo(preview.newDate)}</span>
                                        </div>
                                        {preview.remainder > 0 && (
                                            <div className="flex justify-between text-xs mt-2 pt-2 border-t border-green-200">
                                                <span className="text-slate-500 italic">Lebih bayar / Kembalian:</span>
                                                <span className="font-bold text-slate-700">{formatIDR(preview.remainder)}</span>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <p className="text-xs text-slate-400 italic text-center py-2">Masukkan nominal minimal {formatIDR(paymentFormData.roomPrice)} untuk melihat hasil.</p>
                                )}
                            </div>
                        );
                    })()}
                </div>

                <div className="p-4 bg-slate-50 flex justify-end gap-2 border-t border-slate-100">
                    <button onClick={() => setShowPaymentModal(false)} className="px-4 py-2 rounded-lg text-slate-600 font-bold hover:bg-slate-200">Batal</button>
                    <button onClick={handleConfirmPayment} className="px-6 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 shadow-md flex items-center gap-2">
                        <CheckCircle2 size={18} /> Konfirmasi Bayar
                    </button>
                </div>
              </div>
            </div>
          )}

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

          {/* 7. Modal Detail Dashboard (View Info & History per Kamar) */}
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
                    {/* [MODIFIKASI] Tampilan Status di Detail menggunakan Logic Pintar */}
                    {(() => {
                        const status = getSmartRoomStatus(selectedRoom);
                        return (
                          <div className={`p-4 rounded-xl border ${status.color}`}>
                              <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-2"><CreditCard size={18}/> Status Pembayaran</h4>
                              <div className="grid grid-cols-2 gap-4 text-sm">
                                <div><p className="text-slate-500 text-xs">Penghuni</p><p className="font-bold">{selectedRoom.resident || '-'}</p></div>
                                <div><p className="text-slate-500 text-xs">Jatuh Tempo</p><p className={`font-bold`}>{formatDateIndo(selectedRoom.nextPaymentDate)}</p></div>
                              </div>
                              <div className="mt-3 pt-3 border-t border-dashed border-slate-300">
                                {selectedRoom.resident ? (
                                    <div className="flex justify-between items-center">
                                       <span className={`text-xs font-bold px-2 py-1 rounded-full ${status.badgeColor}`}>{status.label}</span>
                                       {status.code === 'overdue' && <span className="font-black text-red-600">{status.subText}</span>}
                                    </div>
                                ) : <p className="text-slate-400 italic">Kamar Kosong</p>}
                              </div>
                          </div>
                        );
                    })()}

                    <div>
                        <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2"><History size={18}/> Riwayat Pembayaran</h4>
                        <div className="bg-slate-50 rounded-xl border border-slate-200 max-h-40 overflow-y-auto">
                          {payments.filter(p => p.roomId === selectedRoom.number && p.residentName === selectedRoom.resident).length > 0 ? (
                            payments.filter(p => p.roomId === selectedRoom.number && p.residentName === selectedRoom.resident).map(p => (
                              <div key={p.id} className="p-3 border-b border-slate-100 last:border-0 flex justify-between items-center text-sm">
                                 <div><p className="font-bold text-slate-700">{formatDateIndo(p.date)}</p><p className="text-xs text-slate-500">{p.type} via {p.method}</p></div>
                                 <span className="font-bold text-green-600 bg-green-50 px-2 py-1 rounded text-xs">{formatIDR(p.amount)}</span>
                              </div>
                            ))
                          ) : <div className="p-4 text-center text-slate-400 text-xs italic">Belum ada riwayat pembayaran untuk penghuni ini.</div>}
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
                  {/* [BARU] HEADER DENGAN TOMBOL REFRESH */}
                  <div className="flex justify-between items-end mb-4">
                      <div>
                          <h3 className="font-bold text-xl text-slate-800">Ringkasan Hari Ini</h3>
                          <p className="text-sm text-slate-500">Pantau kondisi kos secara real-time.</p>
                      </div>
                      <button 
                        onClick={fetchData}
                        disabled={isLoading}
                        className={`flex items-center gap-2 bg-white border border-slate-200 text-slate-600 hover:text-blue-600 hover:border-blue-300 px-4 py-2 rounded-xl shadow-sm transition-all ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
                      >
                        <RefreshCw size={18} className={isLoading ? "animate-spin" : ""} />
                        <span className="font-bold text-sm">{isLoading ? 'Memuat...' : 'Refresh Data'}</span>
                      </button>
                  </div>

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
                           <p className="text-sm font-bold text-slate-500">Nunggak / Telat</p>
                           <div className="bg-red-50 p-2 rounded-lg text-red-600"><AlertCircle size={20}/></div>
                        </div>
                        {overdueRooms.length > 0 ? (
                           <div className="space-y-2 max-h-24 overflow-y-auto pr-1">
                              {overdueRooms.map(r => {
                                 const status = getSmartRoomStatus(r);
                                 return (
                                     <div key={r.id} className="flex justify-between items-center text-xs p-2 bg-red-50 rounded-lg border border-red-100">
                                        <span className="font-bold text-slate-700">{r.number}</span>
                                        <span className="text-red-600 font-bold">{status.label}</span>
                                     </div>
                                 );
                              })}
                           </div>
                        ) : (
                           <p className="text-xs text-slate-400 italic mt-2">Semua pembayaran lancar.</p>
                        )}
                      </div>
                  </div>

                  {/* Grid Dashboard Owner */}
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm mt-6">
                      <h3 className="font-bold text-lg text-slate-800 mb-6">Status Kamar Real-time</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                        {rooms.map(room => {
                           const status = getSmartRoomStatus(room);
                           
                           return (
                             <div 
                                key={room.id} 
                                onClick={() => setSelectedRoom(room)}
                                className={`p-4 rounded-2xl border-2 transition-all cursor-pointer shadow-sm hover:shadow-md relative overflow-hidden ${status.color}`}
                             >
                                <div className="flex justify-between items-start mb-2">
                                   <span className="font-black text-xl text-slate-800">{room.number.replace('ROOM ', '')}</span>
                                   {status.code === 'overdue' && <AlertCircle size={18} className="text-red-500" />}
                                   {status.code === 'safe' && <CheckCircle2 size={18} className="text-green-500" />}
                                   {status.code === 'warning' && <AlertTriangle size={18} className="text-yellow-500" />}
                                </div>
                                <div className="space-y-1 relative z-10">
                                   <p className="text-xs font-bold text-slate-700 truncate">
                                      {room.resident || <span className="text-slate-400 font-normal">Kosong</span>}
                                   </p>
                                   <div className="flex flex-col items-end">
                                      {room.resident && (
                                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full mb-1 ${status.badgeColor}`}>
                                              {status.label}
                                          </span>
                                      )}
                                      {status.code === 'overdue' && (
                                          <span className="text-xs font-black text-red-600">{status.subText}</span>
                                      )}
                                   </div>
                                </div>
                             </div>
                           );
                        })}
                      </div>
                  </div>
                </>
              )}

              {/* MENU 2: LAPORAN (Owner View) */}
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
                                        }}
                                        className="p-1.5 bg-white rounded-lg text-slate-700 hover:text-blue-600 shadow-sm border border-slate-100"
                                        title="Buka Laporan"
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
                          <div className="flex gap-2">
                             <button onClick={() => window.print()} className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-slate-50 transition-all shadow-sm"><Printer size={18} /> Print Biasa</button>
                             <button onClick={handleDownloadPDF} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-blue-700 transition-all shadow-lg"><Download size={18} /> Download PDF</button>
                          </div>
                        </div>
                        
                        <div ref={reportContentRef} className="bg-white p-8 md:p-12 w-full md:w-[210mm] mx-auto min-h-0 md:min-h-[297mm] relative print:p-0 print:w-full">
                          <div className="text-center border-b-4 border-slate-800 pb-4 mb-6 relative">
                             <h1 className="text-2xl font-black text-slate-800 tracking-wide uppercase">Laporan Keuangan Kos</h1>
                             <p className="text-slate-500 text-sm font-medium mt-1">Periode Laporan</p>
                             <h2 className="text-lg font-bold text-blue-600 mt-1 uppercase border-2 border-blue-100 inline-block px-4 py-1 rounded bg-blue-50">{MONTH_NAMES[selectedMonthIndex]} {selectedYear}</h2>
                             {depositStatus[`${selectedYear}-${selectedMonthIndex}`] && (<div className="absolute top-0 right-0 border-4 border-green-600 text-green-600 font-black text-xl px-4 py-2 rounded rotate-[-15deg] opacity-80 print:opacity-100">SUDAH DISETOR</div>)}
                          </div>
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
                                  {getFilteredPayments().length > 0 ? (getFilteredPayments().map((pay, index) => (<tr key={pay.id} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}><td className="px-2 py-1 border-r border-slate-200 font-medium">{formatDateIndo(pay.date)}</td><td className="px-2 py-1 border-r border-slate-200 font-bold">{pay.roomId}</td><td className="px-2 py-1 border-r border-slate-200 text-slate-600">{pay.type} ({pay.method})</td><td className="px-2 py-1 text-right font-bold text-slate-800">{formatIDR(pay.amount)}</td></tr>))) : (<tr><td colSpan="4" className="px-4 py-8 text-center text-slate-400 italic">Tidak ada transaksi pada bulan ini.</td></tr>)}
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
          
          {/* ================= VIEW PENGELOLA (ADMIN) ================= */}
          {userRole === 'admin' && activeTab === 'dashboard' && (
             <div className="space-y-6">
               {/* Legend Warna Grid */}
               <div className="flex flex-col md:flex-row justify-between items-start md:items-center print:hidden gap-4">
                 <h3 className="font-bold text-lg text-slate-800">Status Grid Kamar</h3>
                 <div className="flex flex-wrap gap-3">
                    <span className="flex items-center gap-1 text-xs text-slate-600 bg-white px-2 py-1 rounded border"><div className="w-3 h-3 bg-white border border-slate-300 rounded-full"></div> Kosong</span>
                    <span className="flex items-center gap-1 text-xs text-slate-600 bg-white px-2 py-1 rounded border"><div className="w-3 h-3 bg-green-500 rounded-full"></div> Aman (Lunas)</span>
                    <span className="flex items-center gap-1 text-xs text-slate-600 bg-white px-2 py-1 rounded border"><div className="w-3 h-3 bg-yellow-400 rounded-full"></div> Tagih (H-5)</span>
                    <span className="flex items-center gap-1 text-xs text-slate-600 bg-white px-2 py-1 rounded border"><div className="w-3 h-3 bg-red-500 rounded-full"></div> Telat</span>
                 </div>
               </div>

               {/* GRID KAMAR (ADMIN) */}
               <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                 {rooms.map(room => {
                   const status = getSmartRoomStatus(room);
                   return (
                     <div 
                       key={room.id} 
                       onClick={() => setSelectedRoom(room)}
                       className={`p-4 rounded-2xl border-2 transition-all cursor-pointer shadow-sm hover:shadow-md relative overflow-hidden ${status.color}`}
                     >
                        <div className="flex justify-between items-start mb-2">
                         <span className="font-black text-xl text-slate-800">{room.number.replace('ROOM ', '')}</span>
                         {status.code === 'overdue' && <AlertCircle size={18} className="text-red-500 animate-pulse" />}
                         {status.code === 'safe' && <CheckCircle2 size={18} className="text-green-500" />}
                         {status.code === 'warning' && <AlertTriangle size={18} className="text-yellow-500" />}
                       </div>
                       <div className="space-y-1 relative z-10">
                         <p className="text-xs font-bold text-slate-700 truncate">
                           {room.resident || <span className="text-slate-400 font-normal">Kosong</span>}
                         </p>
                         <div className="flex flex-col items-end">
                            {room.resident && (
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full mb-1 ${status.badgeColor}`}>
                                    {status.label}
                                </span>
                            )}
                            {/* Tampilkan Hutang jika telat */}
                            {status.code === 'overdue' && (
                                <span className="text-xs font-black text-red-600">{status.subText}</span>
                            )}
                         </div>
                       </div>
                     </div>
                   );
                 })}
               </div>
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