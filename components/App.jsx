'use client';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Clock, LogIn, LogOut, Plus, Trash2, Users, CalendarDays, TrendingUp, Stethoscope, Sun, Loader2, ShieldCheck, User, Eye, EyeOff, RotateCcw, ArrowLeft, LogOutIcon, Printer, X, Pencil } from 'lucide-react';

// Nadomestek za window.storage (deluje samo znotraj Claude artefaktov) -
// tukaj kličemo naš lasten API, ki podatke shrani v pravo bazo (Vercel KV).
async function kvGet(key) {
  const res = await fetch(`/api/kv/${key}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data && data.value != null ? { value: data.value } : null;
}
async function kvSet(key, value) {
  await fetch(`/api/kv/${key}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value }),
  });
}

const PALETTE = ['#A83A2C', '#3E6F63', '#C08829', '#5B6C8F', '#7A4E9E', '#4C7A3F', '#B05A7A', '#4A8B8B'];
const PAPER = '#F5F1E8';
const INK = '#262420';
const STAMP = '#A83A2C';
const TEAL = '#3E6F63';
const AMBER = '#C08829';
const LINE = '#DDD6C7';
const CARD = '#FFFFFF';

function uid(prefix) {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fmtTime(iso) {
  if (!iso) return '--:--';
  return new Date(iso).toLocaleTimeString('sl-SI', { hour: '2-digit', minute: '2-digit' });
}
function fmtDate(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${d}.${m}.${y}`;
}
function hoursBetween(startIso, endIso) {
  const ms = new Date(endIso) - new Date(startIso);
  return Math.max(0, ms / 1000 / 60 / 60);
}
function timeInputValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function combineDateTime(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0).toISOString();
}
function fmtHours(h) {
  const sign = h < -0.01 ? '-' : '';
  const abs = Math.abs(h);
  const hh = Math.floor(abs);
  const mm = Math.round((abs - hh) * 60);
  return `${sign}${hh} h ${mm.toString().padStart(2, '0')} min`;
}
// Vse spodnje funkcije delajo izključno z lokalnimi datumskimi komponentami
// (brez pretvorbe v UTC ISO niz), da ne pride do zamika datuma zaradi časovnega pasu.
function dowOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).getDay(); // 0 = nedelja, 6 = sobota
}
function isWeekend(dateStr) {
  const day = dowOf(dateStr);
  return day === 0 || day === 6;
}
function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
// Redni delovni čas: ponedeljek-petek 7:00-15:00. Vse prej/pozneje ter sobote in
// nedelje se štejejo kot nadure.
const WORK_START_HOUR = 7;
const WORK_END_HOUR = 15;
// Nadure se zaokrožujejo navzdol na celo uro, razen če je znotraj tekoče ure
// doseženih vsaj 82 % (torej ~49+ minut) - takrat se zaokroži navzgor na celo uro.
// Tako majhni presežki (npr. 10 min prej na delo ali 10 min dlje v službi) ne štejejo kot nadura.
// Nadure se štejejo natančno na minuto. Ob robovih delovnega okvira (7:00-15:00)
// velja toleranca: prihod do 15 minut prej in odhod do 10 minut pozneje se NE
// šteje kot nadura. Vse izven te tolerance se šteje natančno, minuto za minuto.
// Nadure se štejejo natančno na minuto. Toleranca: prihod med 6:50 in 7:00 ter
// odhod med 15:00 in 15:10 se NE šteje kot nadura (torej okno 6:50-15:10 = brez nadur).
// Če je prihod/odhod izven tega okna, se šteje CEL čas od uradne meje (7:00 oz. 15:00) -
// npr. prihod ob 6:30 pomeni 30 min nadure, odhod ob 15:25 pomeni 25 min nadure.
const GRACE_MIN = 10;
function splitHours(clockInIso, clockOutIso, dateStr) {
  const start = new Date(clockInIso);
  const end = new Date(clockOutIso);
  const totalMs = Math.max(0, end - start);
  const totalHours = totalMs / 1000 / 60 / 60;
  const dow = dowOf(dateStr);
  if (dow === 0 || dow === 6) {
    return { regular: 0, overtime: totalHours };
  }
  const [y, m, d] = dateStr.split('-').map(Number);
  const winStart = new Date(y, m - 1, d, WORK_START_HOUR, 0, 0);
  const winEnd = new Date(y, m - 1, d, WORK_END_HOUR, 0, 0);
  const graceStart = new Date(winStart.getTime() - GRACE_MIN * 60000);
  const graceEnd = new Date(winEnd.getTime() + GRACE_MIN * 60000);

  const overlapMs = Math.max(0, Math.min(end.getTime(), winEnd.getTime()) - Math.max(start.getTime(), winStart.getTime()));
  const regular = overlapMs / 1000 / 60 / 60;

  let overtimeMs = 0;
  // Zgodnji del: samo dejansko oddelan čas pred 7:00 (omejen z dejanskim odhodom)
  const earlyEnd = Math.min(end.getTime(), winStart.getTime());
  if (start.getTime() < graceStart.getTime() && earlyEnd > start.getTime()) {
    overtimeMs += earlyEnd - start.getTime();
  }
  // Pozni del: samo dejansko oddelan čas po 15:00 (omejen z dejanskim prihodom)
  const lateStart = Math.max(start.getTime(), winEnd.getTime());
  if (end.getTime() > graceEnd.getTime() && end.getTime() > lateStart) {
    overtimeMs += end.getTime() - lateStart;
  }
  const overtime = overtimeMs / 1000 / 60 / 60;

  return { regular, overtime };
}
function randomPin() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

const TYPE_LABEL = { delo: 'Delo', dopust: 'Dopust', bolniska: 'Bolniška' };
const SLO_MONTHS = ['Januar', 'Februar', 'Marec', 'April', 'Maj', 'Junij', 'Julij', 'Avgust', 'September', 'Oktober', 'November', 'December'];
function monthLabel(yearMonth) {
  const [y, m] = yearMonth.split('-').map(Number);
  return `${SLO_MONTHS[m - 1]} ${y}`;
}

const inputStyle = { border: `1px solid ${LINE}`, background: PAPER };

export default function App() {
  const [employees, setEmployees] = useState([]);
  const [entries, setEntries] = useState([]);
  const [adminPassword, setAdminPassword] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const [currentUser, setCurrentUser] = useState(null); // {type:'admin'} | {type:'employee', id}
  const [loginMode, setLoginMode] = useState('choose'); // choose | employee | admin
  const [loginEmployeeId, setLoginEmployeeId] = useState(null);
  const [pinInput, setPinInput] = useState('');
  const [adminPassInput, setAdminPassInput] = useState('');
  const [loginError, setLoginError] = useState('');

  const [setupPass, setSetupPass] = useState('');
  const [setupConfirm, setSetupConfirm] = useState('');
  const [setupError, setSetupError] = useState('');

  const [tab, setTab] = useState('ura');
  const [now, setNow] = useState(new Date());
  const [animatingId, setAnimatingId] = useState(null);
  const [confirmDelId, setConfirmDelId] = useState(null);
  const [confirmEntryId, setConfirmEntryId] = useState(null);
  const [visiblePinId, setVisiblePinId] = useState(null);
  const [pendingPunchEmployee, setPendingPunchEmployee] = useState(null);
  const [pendingKind, setPendingKind] = useState(null); // 'delo' | 'dopust' | 'bolniska'
  const [pendingLocationType, setPendingLocationType] = useState(null);
  const [pendingSite, setPendingSite] = useState('');
  const [pendingAbsStart, setPendingAbsStart] = useState(todayStr());
  const [pendingAbsEnd, setPendingAbsEnd] = useState(todayStr());
  const [pendingAbsMsg, setPendingAbsMsg] = useState('');

  const [newName, setNewName] = useState('');
  const [newVacDays, setNewVacDays] = useState(20);
  const [newPin, setNewPin] = useState(randomPin());

  const [absEmployee, setAbsEmployee] = useState('');
  const [absType, setAbsType] = useState('dopust');
  const [absStart, setAbsStart] = useState(todayStr());
  const [absEnd, setAbsEnd] = useState(todayStr());
  const [absMsg, setAbsMsg] = useState('');

  const [overviewMonth, setOverviewMonth] = useState(todayStr().slice(0, 7));
  const [printTarget, setPrintTarget] = useState(null);
  const [uraViewDate, setUraViewDate] = useState(todayStr());
  const [detailEmployeeId, setDetailEmployeeId] = useState(null);
  const [editEntryId, setEditEntryId] = useState(null);
  const [editDate, setEditDate] = useState('');
  const [editLocationType, setEditLocationType] = useState('delavnica');
  const [editSite, setEditSite] = useState('');
  const [editClockIn, setEditClockIn] = useState('');
  const [editClockOut, setEditClockOut] = useState('');
  const [editAbsType, setEditAbsType] = useState('dopust');
  const [editError, setEditError] = useState('');
  const [newAdminPass, setNewAdminPass] = useState('');
  const [adminPassMsg, setAdminPassMsg] = useState('');

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    (async () => {
      let emp = [];
      let ent = [];
      let pass = null;
      try {
        const r = await kvGet('employees');
        if (r && r.value) emp = JSON.parse(r.value);
      } catch (e) { /* ne obstaja še */ }
      try {
        const r2 = await kvGet('entries');
        if (r2 && r2.value) ent = JSON.parse(r2.value);
      } catch (e) { /* ne obstaja še */ }
      try {
        const r3 = await kvGet('admin_password');
        if (r3 && r3.value) pass = r3.value;
      } catch (e) { /* ne obstaja še */ }
      setEmployees(emp);
      setEntries(ent);
      setAdminPassword(pass);
      setLoaded(true);
    })().catch(() => {
      setLoadError('Nalaganje podatkov ni uspelo. Poskusi osvežiti aplikacijo.');
      setLoaded(true);
    });
  }, []);

  const persistEmployees = useCallback(async (list) => {
    setEmployees(list);
    try { await kvSet('employees', JSON.stringify(list)); }
    catch (e) { console.error('Napaka pri shranjevanju zaposlenih', e); }
  }, []);

  const persistEntries = useCallback(async (list) => {
    setEntries(list);
    try { await kvSet('entries', JSON.stringify(list)); }
    catch (e) { console.error('Napaka pri shranjevanju vnosov', e); }
  }, []);

  const persistAdminPassword = useCallback(async (pass) => {
    setAdminPassword(pass);
    try { await kvSet('admin_password', pass); }
    catch (e) { console.error('Napaka pri shranjevanju gesla', e); }
  }, []);

  // ---- Prijava ----
  const doSetup = () => {
    setSetupError('');
    if (setupPass.length < 4) { setSetupError('Geslo naj ima vsaj 4 znake.'); return; }
    if (setupPass !== setupConfirm) { setSetupError('Gesli se ne ujemata.'); return; }
    persistAdminPassword(setupPass);
    setCurrentUser({ type: 'admin' });
  };

  const doEmployeeLogin = () => {
    setLoginError('');
    const emp = employees.find((e) => e.id === loginEmployeeId);
    if (!emp) { setLoginError('Izberi ime.'); return; }
    if (pinInput !== emp.pin) { setLoginError('Napačen PIN.'); return; }
    setCurrentUser({ type: 'employee', id: emp.id });
    setTab('ura');
    setPinInput('');
    setLoginMode('choose');
  };

  const doAdminLogin = () => {
    setLoginError('');
    if (adminPassInput !== adminPassword) { setLoginError('Napačno geslo.'); return; }
    setCurrentUser({ type: 'admin' });
    setTab('ura');
    setAdminPassInput('');
    setLoginMode('choose');
  };

  const logout = () => {
    setCurrentUser(null);
    setLoginMode('choose');
    setLoginEmployeeId(null);
    setPinInput('');
    setAdminPassInput('');
    setLoginError('');
  };

  // ---- Zaposleni ----
  const addEmployee = () => {
    if (!newName.trim()) return;
    const pin = /^[0-9]{4}$/.test(newPin) ? newPin : randomPin();
    const emp = {
      id: uid('emp'),
      name: newName.trim(),
      color: PALETTE[employees.length % PALETTE.length],
      vacationDaysPerYear: Number(newVacDays) || 20,
      pin,
    };
    persistEmployees([...employees, emp]);
    setNewName('');
    setNewVacDays(20);
    setNewPin(randomPin());
  };

  const resetPin = (id) => {
    const pin = randomPin();
    persistEmployees(employees.map((e) => (e.id === id ? { ...e, pin } : e)));
    setVisiblePinId(id);
  };

  const deleteEmployee = (id) => {
    if (confirmDelId !== id) {
      setConfirmDelId(id);
      setTimeout(() => setConfirmDelId((c) => (c === id ? null : c)), 3000);
      return;
    }
    persistEmployees(employees.filter((e) => e.id !== id));
    persistEntries(entries.filter((e) => e.employeeId !== id));
    setConfirmDelId(null);
  };

  const changeAdminPassword = () => {
    setAdminPassMsg('');
    if (newAdminPass.length < 4) { setAdminPassMsg('Geslo naj ima vsaj 4 znake.'); return; }
    persistAdminPassword(newAdminPass);
    setNewAdminPass('');
    setAdminPassMsg('Geslo spremenjeno.');
    setTimeout(() => setAdminPassMsg(''), 3000);
  };

  // ---- Štemplanje ----
  const openEntryFor = (employeeId) =>
    entries.find((e) => e.employeeId === employeeId && e.type === 'delo' && !e.clockOut);

  const punch = (employeeId, location) => {
    const open = openEntryFor(employeeId);
    const nowIso = new Date().toISOString();
    if (open) {
      const hours = hoursBetween(open.clockIn, nowIso);
      persistEntries(entries.map((e) => (e.id === open.id ? { ...e, clockOut: nowIso, hours } : e)));
    } else {
      const locationType = location?.type === 'teren' ? 'teren' : 'delavnica';
      const site = locationType === 'teren' ? (location.site || '').trim() || 'Neimenovan objekt' : null;
      const entry = { id: uid('e'), employeeId, type: 'delo', date: todayStr(), clockIn: nowIso, clockOut: null, hours: 0, locationType, site };
      persistEntries([...entries, entry]);
    }
    setAnimatingId(employeeId);
    setTimeout(() => setAnimatingId((a) => (a === employeeId ? null : a)), 400);
  };

  const startPunchIn = (employeeId) => {
    setPendingPunchEmployee(employeeId);
    setPendingKind(null);
    setPendingLocationType(null);
    setPendingSite('');
    setPendingAbsStart(todayStr());
    setPendingAbsEnd(todayStr());
    setPendingAbsMsg('');
  };

  const cancelPunchPanel = () => {
    setPendingPunchEmployee(null);
    setPendingKind(null);
    setPendingLocationType(null);
    setPendingSite('');
    setPendingAbsMsg('');
  };

  const confirmPunchIn = (employeeId, location) => {
    punch(employeeId, location);
    cancelPunchPanel();
  };

  const confirmAbsenceInline = (employeeId) => {
    const { newEntries, error } = buildAbsenceEntries(employeeId, pendingKind, pendingAbsStart, pendingAbsEnd);
    if (error) { setPendingAbsMsg(error); return; }
    persistEntries([...entries, ...newEntries]);
    cancelPunchPanel();
  };

  const deleteEntry = (id) => {
    if (!isAdmin) return;
    if (confirmEntryId !== id) {
      setConfirmEntryId(id);
      setTimeout(() => setConfirmEntryId((c) => (c === id ? null : c)), 3000);
      return;
    }
    persistEntries(entries.filter((e) => e.id !== id));
    setConfirmEntryId(null);
  };

  const startEdit = (entry) => {
    if (!isAdmin) return;
    setEditEntryId(entry.id);
    setEditDate(entry.date);
    setEditError('');
    if (entry.type === 'delo') {
      setEditLocationType(entry.locationType || 'delavnica');
      setEditSite(entry.site || '');
      setEditClockIn(timeInputValue(entry.clockIn));
      setEditClockOut(timeInputValue(entry.clockOut));
    } else {
      setEditAbsType(entry.type);
    }
  };

  const cancelEdit = () => {
    setEditEntryId(null);
    setEditError('');
  };

  const saveEdit = () => {
    if (!isAdmin) return;
    const entry = entries.find((e) => e.id === editEntryId);
    if (!entry) return;
    if (!editDate) { setEditError('Vnesi datum.'); return; }

    if (entry.type === 'delo') {
      if (!editClockIn) { setEditError('Vnesi uro prihoda.'); return; }
      const clockInIso = combineDateTime(editDate, editClockIn);
      const clockOutIso = editClockOut ? combineDateTime(editDate, editClockOut) : null;
      if (clockOutIso && clockOutIso <= clockInIso) { setEditError('Odhod mora biti za prihodom.'); return; }
      const hours = clockOutIso ? hoursBetween(clockInIso, clockOutIso) : 0;
      const locationType = editLocationType === 'teren' ? 'teren' : 'delavnica';
      const site = locationType === 'teren' ? (editSite || '').trim() || 'Neimenovan objekt' : null;
      persistEntries(entries.map((e) => (e.id === editEntryId ? { ...e, date: editDate, clockIn: clockInIso, clockOut: clockOutIso, hours, locationType, site } : e)));
    } else {
      persistEntries(entries.map((e) => (e.id === editEntryId ? { ...e, date: editDate, type: editAbsType } : e)));
    }
    cancelEdit();
  };

  const buildAbsenceEntries = (employeeId, type, start, end) => {
    if (!employeeId) return { newEntries: [], error: 'Izberi zaposlenega.' };
    if (end < start) return { newEntries: [], error: 'Končni datum je pred začetnim.' };
    const newEntries = [];
    let d = start;
    let guard = 0;
    while (d <= end && guard < 400) {
      if (!isWeekend(d)) {
        newEntries.push({ id: uid('a'), employeeId, type, date: d, clockIn: null, clockOut: null, hours: 8 });
      }
      d = addDays(d, 1);
      guard++;
    }
    if (newEntries.length === 0) return { newEntries: [], error: 'Izbrano obdobje ne vsebuje delovnih dni.' };
    return { newEntries, error: null };
  };

  const addAbsence = (forcedEmployeeId) => {
    const employeeId = forcedEmployeeId || absEmployee;
    const { newEntries, error } = buildAbsenceEntries(employeeId, absType, absStart, absEnd);
    if (error) { setAbsMsg(error); return; }
    persistEntries([...entries, ...newEntries]);
    setAbsMsg(`Dodanih ${newEntries.length} dni.`);
    setTimeout(() => setAbsMsg(''), 3000);
  };

  const currentYear = new Date().getFullYear();

  const summarize = (employeeId, yearMonth) => {
    const emp = employees.find((e) => e.id === employeeId);
    if (!emp) return null;
    const monthEntries = entries.filter((e) => e.employeeId === employeeId && e.date.startsWith(yearMonth));
    const workEntries = monthEntries.filter((e) => e.type === 'delo' && e.clockOut);
    const totals = workEntries.reduce((acc, e) => {
      const s = splitHours(e.clockIn, e.clockOut, e.date);
      return { regular: acc.regular + s.regular, overtime: acc.overtime + s.overtime };
    }, { regular: 0, overtime: 0 });
    const workDays = workEntries.length;
    const dopustDays = monthEntries.filter((e) => e.type === 'dopust').length;
    const bolniskaDays = monthEntries.filter((e) => e.type === 'bolniska').length;
    const yearDopustUsed = entries.filter((e) => e.employeeId === employeeId && e.type === 'dopust' && e.date.startsWith(String(currentYear))).length;
    const vacationRemaining = emp.vacationDaysPerYear - yearDopustUsed;
    return { regularHours: totals.regular, overtimeHours: totals.overtime, workDays, dopustDays, bolniskaDays, yearDopustUsed, vacationRemaining };
  };

  const empName = (id) => employees.find((e) => e.id === id)?.name || '—';
  const empColor = (id) => employees.find((e) => e.id === id)?.color || INK;

  const isAdmin = currentUser?.type === 'admin';
  const selfId = currentUser?.type === 'employee' ? currentUser.id : null;

  const dayEntries = useMemo(() => {
    const src = isAdmin ? entries : entries.filter((e) => e.employeeId === selfId);
    return [...src]
      .filter((e) => e.date === uraViewDate)
      .sort((a, b) => (b.clockIn || '').localeCompare(a.clockIn || ''));
  }, [entries, isAdmin, selfId, uraViewDate]);

  const absenceEntries = useMemo(() => {
    const src = isAdmin ? entries : entries.filter((e) => e.employeeId === selfId);
    return [...src].filter((e) => e.type !== 'delo').sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
  }, [entries, isAdmin, selfId]);

  const globalStyle = (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500;700&display=swap');
      .font-display { font-family: 'Oswald', sans-serif; }
      .font-mono { font-family: 'JetBrains Mono', monospace; }
      @keyframes stampThunk {
        0% { transform: scale(1) rotate(0deg); }
        30% { transform: scale(0.86) rotate(-4deg); }
        62% { transform: scale(1.05) rotate(2deg); }
        100% { transform: scale(1) rotate(0deg); }
      }
      .stamp-hit { animation: stampThunk 0.4s ease; }
      .ink-badge {
        font-family: 'Oswald', sans-serif;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        border: 2px solid currentColor;
        display: inline-block;
        transform: rotate(-2deg);
        opacity: 0.9;
      }
      button:focus-visible, input:focus-visible, select:focus-visible {
        outline: 2px solid ${STAMP};
        outline-offset: 2px;
      }
      @media print {
        body * { visibility: hidden; }
        #print-area, #print-area * { visibility: visible; }
        #print-area {
          position: absolute; top: 0; left: 0; width: 100%;
          margin: 0; padding: 24px; max-height: none; overflow: visible;
        }
      }
    `}</style>
  );

  // ---------------- NALAGANJE ----------------
  if (!loaded) {
    return (
      <div style={{ background: PAPER, color: INK, minHeight: '100vh', fontFamily: "'Inter', sans-serif" }} className="flex items-center justify-center">
        {globalStyle}
        <div className="flex items-center gap-3" style={{ color: '#6B6459' }}><Loader2 className="animate-spin" size={20} /> Nalagam …</div>
      </div>
    );
  }

  // ---------------- PRVA NASTAVITEV GESLA ----------------
  if (adminPassword === null) {
    return (
      <div style={{ background: PAPER, color: INK, minHeight: '100vh', fontFamily: "'Inter', sans-serif" }} className="flex items-center justify-center px-4">
        {globalStyle}
        <div className="w-full max-w-sm p-6" style={{ background: CARD, border: `1px solid ${LINE}` }}>
          <h1 className="font-display text-2xl uppercase tracking-wide mb-1">Delovne ure Kamnoseštvo Čakš</h1>
          <p className="text-sm mb-6" style={{ color: '#6B6459' }}>Prva uporaba — nastavi geslo za administratorja. To geslo boš potreboval/a za pregled vseh zaposlenih.</p>
          <label className="block text-xs mb-1" style={{ color: '#6B6459' }}>Novo geslo</label>
          <input type="password" value={setupPass} onChange={(e) => setSetupPass(e.target.value)} className="w-full p-2 text-sm mb-3" style={inputStyle} />
          <label className="block text-xs mb-1" style={{ color: '#6B6459' }}>Ponovi geslo</label>
          <input type="password" value={setupConfirm} onChange={(e) => setSetupConfirm(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doSetup()} className="w-full p-2 text-sm mb-4" style={inputStyle} />
          {setupError && <p className="text-xs mb-3" style={{ color: STAMP }}>{setupError}</p>}
          <button onClick={doSetup} className="w-full py-2.5 font-display uppercase tracking-wide text-sm" style={{ background: INK, color: PAPER }}>Nastavi in nadaljuj</button>
        </div>
      </div>
    );
  }

  // ---------------- PRIJAVA ----------------
  if (!currentUser) {
    return (
      <div style={{ background: PAPER, color: INK, minHeight: '100vh', fontFamily: "'Inter', sans-serif" }} className="flex items-center justify-center px-4">
        {globalStyle}
        <div className="w-full max-w-sm p-6" style={{ background: CARD, border: `1px solid ${LINE}` }}>
          <h1 className="font-display text-2xl uppercase tracking-wide mb-6 text-center">Delovne ure Kamnoseštvo Čakš</h1>

          {loginMode === 'choose' && (
            <div className="flex flex-col gap-3">
              <button onClick={() => setLoginMode('employee')} className="flex items-center justify-center gap-2 py-3 font-display uppercase tracking-wide text-sm" style={{ background: STAMP, color: '#fff' }}>
                <User size={16} /> Sem zaposlen/a
              </button>
              <button onClick={() => setLoginMode('admin')} className="flex items-center justify-center gap-2 py-3 font-display uppercase tracking-wide text-sm" style={{ background: INK, color: PAPER }}>
                <ShieldCheck size={16} /> Sem administrator/ka
              </button>
              {employees.length === 0 && <p className="text-xs text-center mt-2" style={{ color: '#9A917E' }}>Zaposlenih še ni — prijavi se kot administrator in jih dodaj.</p>}
            </div>
          )}

          {loginMode === 'employee' && (
            <div>
              <button onClick={() => { setLoginMode('choose'); setLoginError(''); }} className="flex items-center gap-1 text-xs mb-4" style={{ color: '#6B6459' }}><ArrowLeft size={13} /> Nazaj</button>
              {!loginEmployeeId ? (
                <div className="grid grid-cols-2 gap-2">
                  {employees.map((emp) => (
                    <button key={emp.id} onClick={() => { setLoginEmployeeId(emp.id); setLoginError(''); }} className="flex items-center gap-2 p-3 text-sm" style={{ border: `1px solid ${LINE}` }}>
                      <span style={{ width: 9, height: 9, borderRadius: '50%', background: emp.color, display: 'inline-block' }} />
                      {emp.name}
                    </button>
                  ))}
                </div>
              ) : (
                <div>
                  <p className="text-sm mb-3">Pozdravljen/a, <strong>{empName(loginEmployeeId)}</strong>. Vnesi svoj PIN.</p>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                    onKeyDown={(e) => e.key === 'Enter' && doEmployeeLogin()}
                    className="w-full p-3 text-center text-2xl font-mono tracking-[0.5em] mb-3"
                    style={inputStyle}
                    autoFocus
                  />
                  {loginError && <p className="text-xs mb-3" style={{ color: STAMP }}>{loginError}</p>}
                  <button onClick={doEmployeeLogin} className="w-full py-2.5 font-display uppercase tracking-wide text-sm" style={{ background: STAMP, color: '#fff' }}>Prijava</button>
                  <button onClick={() => { setLoginEmployeeId(null); setPinInput(''); setLoginError(''); }} className="w-full py-2 text-xs mt-2" style={{ color: '#6B6459' }}>Nisem jaz — nazaj na izbiro</button>
                </div>
              )}
            </div>
          )}

          {loginMode === 'admin' && (
            <div>
              <button onClick={() => { setLoginMode('choose'); setLoginError(''); }} className="flex items-center gap-1 text-xs mb-4" style={{ color: '#6B6459' }}><ArrowLeft size={13} /> Nazaj</button>
              <label className="block text-xs mb-1" style={{ color: '#6B6459' }}>Geslo administratorja</label>
              <input type="password" value={adminPassInput} onChange={(e) => setAdminPassInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doAdminLogin()} className="w-full p-2 text-sm mb-3" style={inputStyle} autoFocus />
              {loginError && <p className="text-xs mb-3" style={{ color: STAMP }}>{loginError}</p>}
              <button onClick={doAdminLogin} className="w-full py-2.5 font-display uppercase tracking-wide text-sm" style={{ background: INK, color: PAPER }}>Prijava</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------------- GLAVNA APLIKACIJA ----------------
  const tabsList = isAdmin
    ? [
        { id: 'ura', label: 'Ura', icon: Clock },
        { id: 'odsotnost', label: 'Odsotnost', icon: CalendarDays },
        { id: 'pregled', label: 'Pregled', icon: TrendingUp },
        { id: 'zaposleni', label: 'Zaposleni', icon: Users },
      ]
    : [
        { id: 'ura', label: 'Ura', icon: Clock },
        { id: 'odsotnost', label: 'Moja odsotnost', icon: CalendarDays },
        { id: 'pregled', label: 'Moj pregled', icon: TrendingUp },
      ];

  const visibleEmployees = isAdmin ? employees : employees.filter((e) => e.id === selfId);

  return (
    <div style={{ background: PAPER, color: INK, minHeight: '100vh', fontFamily: "'Inter', sans-serif" }}>
      {globalStyle}
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-10">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8 pb-6" style={{ borderBottom: `2px solid ${INK}` }}>
          <div>
            <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-wide uppercase">Delovne ure Kamnoseštvo Čakš</h1>
            <p className="text-sm mt-1" style={{ color: '#6B6459' }}>
              {isAdmin ? 'Administratorski pregled — vidiš podatke vseh zaposlenih' : `Prijavljen/a kot ${empName(selfId)}`}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="font-mono text-right">
              <div className="text-2xl md:text-3xl font-bold tabular-nums" style={{ color: STAMP }}>{now.toLocaleTimeString('sl-SI')}</div>
              <div className="text-xs mt-0.5" style={{ color: '#6B6459' }}>{now.toLocaleDateString('sl-SI', { day: '2-digit', month: '2-digit', year: 'numeric' })}</div>
            </div>
            <button onClick={logout} className="flex items-center gap-1 text-xs px-3 py-2" style={{ border: `1px solid ${LINE}`, color: '#6B6459' }}>
              <LogOutIcon size={14} /> Odjava
            </button>
          </div>
        </div>

        {loadError && (
          <div className="mb-6 p-3 text-sm" style={{ background: '#F6E3DF', border: `1px solid ${STAMP}`, color: STAMP }}>{loadError}</div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-8 flex-wrap">
          {tabsList.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} className="flex items-center gap-2 px-4 py-2.5 font-display text-sm uppercase tracking-wide" style={{ background: active ? INK : 'transparent', color: active ? PAPER : INK, border: `1px solid ${INK}` }}>
                <Icon size={15} /> {t.label}
              </button>
            );
          })}
        </div>

        {/* TAB: URA */}
        {tab === 'ura' && (
          <div>
            {visibleEmployees.length === 0 ? (
              <p className="text-sm py-10 text-center" style={{ color: '#9A917E' }}>Ni podatkov.</p>
            ) : (
              <div className={`grid gap-4 mb-10 ${isAdmin ? 'sm:grid-cols-2 lg:grid-cols-3' : 'max-w-xs'}`}>
                {visibleEmployees.map((emp) => {
                  const open = openEntryFor(emp.id);
                  const todaySplit = entries
                    .filter((e) => e.employeeId === emp.id && e.type === 'delo' && e.date === todayStr() && e.clockOut)
                    .reduce((acc, e) => {
                      const s = splitHours(e.clockIn, e.clockOut, e.date);
                      return { regular: acc.regular + s.regular, overtime: acc.overtime + s.overtime };
                    }, { regular: 0, overtime: 0 });
                  if (open) {
                    const s = splitHours(open.clockIn, now.toISOString(), open.date);
                    todaySplit.regular += s.regular;
                    todaySplit.overtime += s.overtime;
                  }
                  return (
                    <div key={emp.id} className="p-5 flex flex-col items-center gap-3" style={{ background: CARD, border: `1px solid ${LINE}` }}>
                      <div className="flex items-center gap-2 self-start">
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: emp.color, display: 'inline-block' }} />
                        <span className="font-display text-lg tracking-wide">{emp.name}</span>
                      </div>
                      {open ? (
                        <span className="ink-badge text-xs px-2 py-1" style={{ color: TEAL }}>
                          Prisoten od {fmtTime(open.clockIn)} · {open.locationType === 'teren' ? `Teren: ${open.site}` : 'Delavnica'}
                        </span>
                      ) : (
                        <span className="text-xs" style={{ color: '#6B6459' }}>Trenutno ni prisoten/na</span>
                      )}
                      {!open && pendingPunchEmployee === emp.id ? (
                        <div className="flex flex-col items-center gap-2 w-full">
                          {pendingKind === null && (
                            <>
                              <p className="text-xs" style={{ color: '#6B6459' }}>Kaj rabiš vpisati?</p>
                              <div className="flex flex-wrap justify-center gap-2">
                                <button onClick={() => setPendingKind('delo')} className="px-3 py-2 text-xs font-display uppercase tracking-wide" style={{ background: STAMP, color: '#fff' }}>Delavni dan</button>
                                <button onClick={() => setPendingKind('bolniska')} className="px-3 py-2 text-xs font-display uppercase tracking-wide" style={{ background: AMBER, color: '#fff' }}>Bolniška</button>
                                <button onClick={() => setPendingKind('dopust')} className="px-3 py-2 text-xs font-display uppercase tracking-wide" style={{ background: TEAL, color: '#fff' }}>Dopust</button>
                              </div>
                              <button onClick={cancelPunchPanel} className="text-xs" style={{ color: '#9A917E' }}>Prekliči</button>
                            </>
                          )}

                          {pendingKind === 'delo' && (
                            pendingLocationType !== 'teren' ? (
                              <>
                                <p className="text-xs" style={{ color: '#6B6459' }}>Kje boš delal/a?</p>
                                <div className="flex gap-2">
                                  <button onClick={() => confirmPunchIn(emp.id, { type: 'delavnica' })} className="px-3 py-2 text-xs font-display uppercase tracking-wide" style={{ background: TEAL, color: '#fff' }}>Delavnica</button>
                                  <button onClick={() => setPendingLocationType('teren')} className="px-3 py-2 text-xs font-display uppercase tracking-wide" style={{ background: AMBER, color: '#fff' }}>Teren</button>
                                </div>
                                <button onClick={cancelPunchPanel} className="text-xs" style={{ color: '#9A917E' }}>Prekliči</button>
                              </>
                            ) : (
                              <>
                                <input
                                  autoFocus
                                  value={pendingSite}
                                  onChange={(e) => setPendingSite(e.target.value)}
                                  onKeyDown={(e) => e.key === 'Enter' && confirmPunchIn(emp.id, { type: 'teren', site: pendingSite })}
                                  placeholder="Naziv objekta"
                                  className="w-full p-2 text-sm"
                                  style={inputStyle}
                                />
                                <div className="flex gap-2">
                                  <button onClick={() => confirmPunchIn(emp.id, { type: 'teren', site: pendingSite })} className="px-3 py-2 text-xs font-display uppercase tracking-wide" style={{ background: AMBER, color: '#fff' }}>Potrdi vpis</button>
                                  <button onClick={cancelPunchPanel} className="text-xs" style={{ color: '#9A917E' }}>Prekliči</button>
                                </div>
                              </>
                            )
                          )}

                          {(pendingKind === 'dopust' || pendingKind === 'bolniska') && (
                            <>
                              <p className="text-xs" style={{ color: '#6B6459' }}>{pendingKind === 'dopust' ? 'Dopust' : 'Bolniška'} — od katerega do katerega dne?</p>
                              <div className="flex gap-2 w-full">
                                <div className="flex-1">
                                  <label className="block text-[10px] mb-1" style={{ color: '#9A917E' }}>Od</label>
                                  <input type="date" value={pendingAbsStart} onChange={(e) => setPendingAbsStart(e.target.value)} className="w-full p-2 text-xs font-mono" style={inputStyle} />
                                </div>
                                <div className="flex-1">
                                  <label className="block text-[10px] mb-1" style={{ color: '#9A917E' }}>Do</label>
                                  <input type="date" value={pendingAbsEnd} onChange={(e) => setPendingAbsEnd(e.target.value)} className="w-full p-2 text-xs font-mono" style={inputStyle} />
                                </div>
                              </div>
                              {pendingAbsMsg && <p className="text-xs" style={{ color: STAMP }}>{pendingAbsMsg}</p>}
                              <div className="flex gap-2">
                                <button onClick={() => confirmAbsenceInline(emp.id)} className="px-3 py-2 text-xs font-display uppercase tracking-wide" style={{ background: pendingKind === 'dopust' ? TEAL : AMBER, color: '#fff' }}>Potrdi</button>
                                <button onClick={cancelPunchPanel} className="text-xs" style={{ color: '#9A917E' }}>Prekliči</button>
                              </div>
                            </>
                          )}
                        </div>
                      ) : (
                        <button onClick={() => (open ? punch(emp.id) : startPunchIn(emp.id))} className={`w-24 h-24 rounded-full flex flex-col items-center justify-center gap-1 font-display text-xs uppercase tracking-wide ${animatingId === emp.id ? 'stamp-hit' : ''}`} style={{ background: open ? INK : STAMP, color: '#fff', border: 'none', cursor: 'pointer' }}>
                          {open ? <LogOut size={20} /> : <LogIn size={20} />}
                          {open ? 'Izpis' : 'Vpis'}
                        </button>
                      )}
                      <div className="text-xs font-mono text-center" style={{ color: '#6B6459' }}>
                        <div>Redno danes: <span style={{ color: INK }}>{fmtHours(todaySplit.regular)}</span></div>
                        {todaySplit.overtime > 0.005 && <div>Nadure danes: <span style={{ color: AMBER, fontWeight: 700 }}>{fmtHours(todaySplit.overtime)}</span></div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h2 className="font-display uppercase text-sm tracking-wide" style={{ color: '#6B6459' }}>Vnosi za dan</h2>
                <div className="flex items-center gap-2">
                  <button onClick={() => setUraViewDate(addDays(uraViewDate, -1))} className="p-1.5" style={{ border: `1px solid ${LINE}`, color: '#6B6459' }} title="Prejšnji dan">
                    <ArrowLeft size={15} />
                  </button>
                  <span className="font-mono text-sm min-w-[110px] text-center">{fmtDate(uraViewDate)}</span>
                  <button
                    onClick={() => setUraViewDate(addDays(uraViewDate, 1))}
                    disabled={uraViewDate >= todayStr()}
                    className="p-1.5"
                    style={{ border: `1px solid ${LINE}`, color: uraViewDate >= todayStr() ? '#DDD6C7' : '#6B6459', cursor: uraViewDate >= todayStr() ? 'default' : 'pointer' }}
                    title="Naslednji dan"
                  >
                    <ArrowLeft size={15} style={{ transform: 'rotate(180deg)' }} />
                  </button>
                  {uraViewDate !== todayStr() && (
                    <button onClick={() => setUraViewDate(todayStr())} className="text-xs px-2 py-1.5" style={{ border: `1px solid ${LINE}`, color: '#6B6459' }}>Danes</button>
                  )}
                </div>
              </div>
              {dayEntries.length === 0 ? (
                <p className="text-sm py-6 text-center" style={{ color: '#9A917E' }}>Za ta dan ni vnosov.</p>
              ) : (
                <div className="overflow-x-auto" style={{ border: `1px solid ${LINE}`, background: CARD }}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="font-display uppercase text-xs tracking-wide" style={{ borderBottom: `1px solid ${LINE}`, color: '#6B6459' }}>
                        {isAdmin && <td className="py-2 px-3">Zaposleni</td>}
                        <td className="py-2 px-3">Vrsta</td>
                        <td className="py-2 px-3">Lokacija</td>
                        <td className="py-2 px-3">Prihod</td>
                        <td className="py-2 px-3">Odhod</td>
                        <td className="py-2 px-3">Redne ure</td>
                        <td className="py-2 px-3">Nadure</td>
                        <td className="py-2 px-3"></td>
                      </tr>
                    </thead>
                    <tbody className="font-mono">
                      {dayEntries.map((e) => {
                        const split = e.type === 'delo' && e.clockOut ? splitHours(e.clockIn, e.clockOut, e.date) : null;
                        return (
                          <tr key={e.id} style={{ borderBottom: `1px solid ${LINE}` }}>
                            {isAdmin && <td className="py-2 px-3 font-sans" style={{ color: empColor(e.employeeId) }}>{empName(e.employeeId)}</td>}
                            <td className="py-2 px-3 font-sans">{TYPE_LABEL[e.type]}</td>
                            <td className="py-2 px-3 font-sans">
                              {e.type === 'delo' ? (
                                e.locationType === 'teren' ? <span style={{ color: AMBER }}>Teren: {e.site}</span> : <span style={{ color: TEAL }}>Delavnica</span>
                              ) : '—'}
                            </td>
                            <td className="py-2 px-3">{e.type === 'delo' ? fmtTime(e.clockIn) : '—'}</td>
                            <td className="py-2 px-3">{e.type === 'delo' ? fmtTime(e.clockOut) : '—'}</td>
                            <td className="py-2 px-3">{split ? fmtHours(split.regular) : e.type !== 'delo' ? '8 h' : '—'}</td>
                            <td className="py-2 px-3" style={{ color: split && split.overtime > 0.005 ? AMBER : undefined }}>{split ? (split.overtime > 0.005 ? fmtHours(split.overtime) : '—') : '—'}</td>
                            <td className="py-2 px-3 text-right">
                              {isAdmin && (
                                <span className="inline-flex items-center gap-2">
                                  <button onClick={() => startEdit(e)} style={{ color: '#B5AE9E' }} title="Uredi">
                                    <Pencil size={14} />
                                  </button>
                                  <button onClick={() => deleteEntry(e.id)} style={{ color: confirmEntryId === e.id ? STAMP : '#B5AE9E' }} title="Izbriši">
                                    {confirmEntryId === e.id ? <span className="text-xs font-sans">Potrdi</span> : <Trash2 size={14} />}
                                  </button>
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB: ODSOTNOST */}
        {tab === 'odsotnost' && (
          <div>
            <div className="p-5 mb-8" style={{ background: CARD, border: `1px solid ${LINE}` }}>
              <h2 className="font-display uppercase text-sm tracking-wide mb-4" style={{ color: '#6B6459' }}>Dodaj odsotnost</h2>
              <div className={`grid gap-3 items-end ${isAdmin ? 'sm:grid-cols-2 lg:grid-cols-5' : 'sm:grid-cols-3'}`}>
                {isAdmin && (
                  <div className="lg:col-span-2">
                    <label className="block text-xs mb-1" style={{ color: '#6B6459' }}>Zaposleni</label>
                    <select value={absEmployee} onChange={(e) => setAbsEmployee(e.target.value)} className="w-full p-2 text-sm" style={inputStyle}>
                      <option value="">Izberi …</option>
                      {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-xs mb-1" style={{ color: '#6B6459' }}>Vrsta</label>
                  <select value={absType} onChange={(e) => setAbsType(e.target.value)} className="w-full p-2 text-sm" style={inputStyle}>
                    <option value="dopust">Dopust</option>
                    <option value="bolniska">Bolniška</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs mb-1" style={{ color: '#6B6459' }}>Od</label>
                  <input type="date" value={absStart} onChange={(e) => setAbsStart(e.target.value)} className="w-full p-2 text-sm font-mono" style={inputStyle} />
                </div>
                <div>
                  <label className="block text-xs mb-1" style={{ color: '#6B6459' }}>Do</label>
                  <input type="date" value={absEnd} onChange={(e) => setAbsEnd(e.target.value)} className="w-full p-2 text-sm font-mono" style={inputStyle} />
                </div>
              </div>
              <div className="flex items-center gap-3 mt-4">
                <button onClick={() => addAbsence(isAdmin ? null : selfId)} className="flex items-center gap-2 px-4 py-2 font-display text-sm uppercase tracking-wide" style={{ background: absType === 'dopust' ? TEAL : AMBER, color: '#fff' }}>
                  <Plus size={15} /> Dodaj
                </button>
                {absMsg && <span className="text-xs" style={{ color: '#6B6459' }}>{absMsg}</span>}
              </div>
              <p className="text-xs mt-3" style={{ color: '#9A917E' }}>Vikendi se samodejno preskočijo.</p>
            </div>

            <h2 className="font-display uppercase text-sm tracking-wide mb-3" style={{ color: '#6B6459' }}>Evidenca odsotnosti</h2>
            {absenceEntries.length === 0 ? (
              <p className="text-sm" style={{ color: '#9A917E' }}>Ni vnesenih odsotnosti.</p>
            ) : (
              <div className="overflow-x-auto" style={{ border: `1px solid ${LINE}`, background: CARD }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="font-display uppercase text-xs tracking-wide" style={{ borderBottom: `1px solid ${LINE}`, color: '#6B6459' }}>
                      {isAdmin && <td className="py-2 px-3">Zaposleni</td>}
                      <td className="py-2 px-3">Datum</td>
                      <td className="py-2 px-3">Vrsta</td>
                      <td className="py-2 px-3"></td>
                    </tr>
                  </thead>
                  <tbody>
                    {absenceEntries.map((e) => (
                      <tr key={e.id} style={{ borderBottom: `1px solid ${LINE}` }}>
                        {isAdmin && <td className="py-2 px-3" style={{ color: empColor(e.employeeId) }}>{empName(e.employeeId)}</td>}
                        <td className="py-2 px-3 font-mono">{fmtDate(e.date)}</td>
                        <td className="py-2 px-3">
                          <span className="inline-flex items-center gap-1">
                            {e.type === 'dopust' ? <Sun size={13} style={{ color: TEAL }} /> : <Stethoscope size={13} style={{ color: AMBER }} />}
                            {TYPE_LABEL[e.type]}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right">
                          {isAdmin && (
                            <span className="inline-flex items-center gap-2">
                              <button onClick={() => startEdit(e)} style={{ color: '#B5AE9E' }} title="Uredi">
                                <Pencil size={14} />
                              </button>
                              <button onClick={() => deleteEntry(e.id)} style={{ color: confirmEntryId === e.id ? STAMP : '#B5AE9E' }} title="Izbriši">
                                {confirmEntryId === e.id ? <span className="text-xs">Potrdi</span> : <Trash2 size={14} />}
                              </button>
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB: PREGLED */}
        {tab === 'pregled' && (
          <div>
            {visibleEmployees.length === 0 ? (
              <p className="text-sm py-10 text-center" style={{ color: '#9A917E' }}>Ni podatkov.</p>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-6">
                  <label className="text-xs" style={{ color: '#6B6459' }}>Mesec</label>
                  <input type="month" value={overviewMonth} onChange={(e) => setOverviewMonth(e.target.value)} className="p-2 text-sm font-mono" style={{ border: `1px solid ${LINE}`, background: CARD }} />
                </div>
                <div className="overflow-x-auto" style={{ border: `1px solid ${LINE}`, background: CARD }}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="font-display uppercase text-xs tracking-wide" style={{ borderBottom: `1px solid ${LINE}`, color: '#6B6459' }}>
                        <td className="py-2 px-3">Zaposleni</td>
                        <td className="py-2 px-3">Delovnih dni</td>
                        <td className="py-2 px-3">Redne ure</td>
                        <td className="py-2 px-3">Nadure</td>
                        <td className="py-2 px-3">Dopust (mesec)</td>
                        <td className="py-2 px-3">Dopust preostanek ({currentYear})</td>
                        <td className="py-2 px-3">Bolniška (mesec)</td>
                        <td className="py-2 px-3"></td>
                      </tr>
                    </thead>
                    <tbody className="font-mono">
                      {visibleEmployees.map((emp) => {
                        const s = summarize(emp.id, overviewMonth);
                        return (
                          <tr key={emp.id} style={{ borderBottom: `1px solid ${LINE}` }}>
                            <td className="py-2 px-3 font-sans">
                              <button onClick={() => setDetailEmployeeId(emp.id)} className="underline decoration-dotted" style={{ color: emp.color }} title="Prikaži vse podatke">
                                {emp.name}
                              </button>
                            </td>
                            <td className="py-2 px-3">{s.workDays}</td>
                            <td className="py-2 px-3">{fmtHours(s.regularHours)}</td>
                            <td className="py-2 px-3" style={{ color: s.overtimeHours > 0.005 ? AMBER : INK, fontWeight: s.overtimeHours > 0.005 ? 700 : 400 }}>{fmtHours(s.overtimeHours)}</td>
                            <td className="py-2 px-3">{s.dopustDays} dni</td>
                            <td className="py-2 px-3">{s.vacationRemaining} / {emp.vacationDaysPerYear} dni</td>
                            <td className="py-2 px-3">{s.bolniskaDays} dni</td>
                            <td className="py-2 px-3 text-right">
                              <button onClick={() => setPrintTarget(emp.id)} className="flex items-center gap-1 text-xs font-sans" style={{ color: '#6B6459' }} title="Izvozi v PDF">
                                <Printer size={15} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs mt-3" style={{ color: '#9A917E' }}>Redne ure: ponedeljek–petek med 7:00 in 15:00. Nadure: natančno na minuto. Okno 6:50–15:10 se ne šteje kot nadura; izven tega okna se šteje cel čas od 7:00 oz. do 15:00. Sobota in nedelja: cel čas dela = nadura.</p>
              </>
            )}
          </div>
        )}

        {/* TAB: ZAPOSLENI (samo admin) */}
        {tab === 'zaposleni' && isAdmin && (
          <div>
            <div className="p-5 mb-8" style={{ background: CARD, border: `1px solid ${LINE}` }}>
              <h2 className="font-display uppercase text-sm tracking-wide mb-4" style={{ color: '#6B6459' }}>Dodaj zaposlenega</h2>
              <div className="grid sm:grid-cols-4 gap-3 items-end">
                <div className="sm:col-span-2">
                  <label className="block text-xs mb-1" style={{ color: '#6B6459' }}>Ime in priimek</label>
                  <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addEmployee()} placeholder="npr. Ana Novak" className="w-full p-2 text-sm" style={inputStyle} />
                </div>
                <div>
                  <label className="block text-xs mb-1" style={{ color: '#6B6459' }}>Letni dopust (dni)</label>
                  <input type="number" min="0" value={newVacDays} onChange={(e) => setNewVacDays(e.target.value)} className="w-full p-2 text-sm font-mono" style={inputStyle} />
                </div>
                <div>
                  <label className="block text-xs mb-1" style={{ color: '#6B6459' }}>PIN (4 mesta)</label>
                  <input value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))} className="w-full p-2 text-sm font-mono" style={inputStyle} />
                </div>
              </div>
              <button onClick={addEmployee} className="flex items-center gap-2 px-4 py-2 mt-4 font-display text-sm uppercase tracking-wide" style={{ background: INK, color: PAPER }}>
                <Plus size={15} /> Dodaj zaposlenega
              </button>
              <p className="text-xs mt-3" style={{ color: '#9A917E' }}>PIN je zaposlenemu potreben za prijavo v aplikacijo — mu ga sporoči osebno.</p>
            </div>

            {employees.length === 0 ? (
              <p className="text-sm" style={{ color: '#9A917E' }}>Še ni dodanih zaposlenih.</p>
            ) : (
              <div style={{ border: `1px solid ${LINE}`, background: CARD }}>
                {employees.map((emp, i) => (
                  <div key={emp.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3" style={{ borderBottom: i < employees.length - 1 ? `1px solid ${LINE}` : 'none' }}>
                    <div className="flex items-center gap-3">
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: emp.color, display: 'inline-block' }} />
                      <span className="font-display tracking-wide">{emp.name}</span>
                      <span className="text-xs" style={{ color: '#9A917E' }}>{emp.vacationDaysPerYear} dni dopusta / leto</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono flex items-center gap-1" style={{ color: '#6B6459' }}>
                        PIN: {visiblePinId === emp.id ? emp.pin : '••••'}
                        <button onClick={() => setVisiblePinId(visiblePinId === emp.id ? null : emp.id)} title="Prikaži/skrij PIN">
                          {visiblePinId === emp.id ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                      </span>
                      <button onClick={() => resetPin(emp.id)} className="flex items-center gap-1 text-xs" style={{ color: '#6B6459' }} title="Nov PIN"><RotateCcw size={13} /> Nov PIN</button>
                      <button onClick={() => deleteEmployee(emp.id)} className="flex items-center gap-1 text-xs" style={{ color: confirmDelId === emp.id ? STAMP : '#B5AE9E' }}>
                        <Trash2 size={14} /> {confirmDelId === emp.id ? 'Klikni znova za potrditev' : 'Izbriši'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="p-5 mt-8" style={{ background: CARD, border: `1px solid ${LINE}` }}>
              <h2 className="font-display uppercase text-sm tracking-wide mb-4" style={{ color: '#6B6459' }}>Spremeni geslo administratorja</h2>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-xs mb-1" style={{ color: '#6B6459' }}>Novo geslo</label>
                  <input type="password" value={newAdminPass} onChange={(e) => setNewAdminPass(e.target.value)} className="p-2 text-sm" style={inputStyle} />
                </div>
                <button onClick={changeAdminPassword} className="px-4 py-2 font-display text-sm uppercase tracking-wide" style={{ background: INK, color: PAPER }}>Shrani</button>
                {adminPassMsg && <span className="text-xs" style={{ color: '#6B6459' }}>{adminPassMsg}</span>}
              </div>
            </div>
          </div>
        )}

        <div className="mt-14 pt-4 text-xs" style={{ borderTop: `1px solid ${LINE}`, color: '#9A917E' }}>
          Podatki so shranjeni skupno za vso ekipo. PIN in geslo nudita osnovno ločevanje pogledov, nista pa namenjena varovanju občutljivih podatkov.
        </div>
      </div>

      {detailEmployeeId && (() => {
        const emp = employees.find((e) => e.id === detailEmployeeId);
        if (!emp) return null;
        const allEmpEntries = entries.filter((e) => e.employeeId === detailEmployeeId);
        const workAll = allEmpEntries.filter((e) => e.type === 'delo' && e.clockOut);
        const totals = workAll.reduce((acc, e) => {
          const s = splitHours(e.clockIn, e.clockOut, e.date);
          return { regular: acc.regular + s.regular, overtime: acc.overtime + s.overtime };
        }, { regular: 0, overtime: 0 });
        const dopustAllTime = allEmpEntries.filter((e) => e.type === 'dopust').length;
        const bolniskaAllTime = allEmpEntries.filter((e) => e.type === 'bolniska').length;
        const dopustThisYear = allEmpEntries.filter((e) => e.type === 'dopust' && e.date.startsWith(String(currentYear))).length;
        const vacationRemaining = emp.vacationDaysPerYear - dopustThisYear;
        const history = [...allEmpEntries].sort((a, b) => b.date.localeCompare(a.date) || (b.clockIn || '').localeCompare(a.clockIn || ''));

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(38,36,32,0.6)' }}>
            <div className="w-full max-w-3xl max-h-[90vh] flex flex-col" style={{ background: CARD }}>
              <div className="p-6 pb-0">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span style={{ width: 12, height: 12, borderRadius: '50%', background: emp.color, display: 'inline-block' }} />
                    <h2 className="font-display text-xl uppercase tracking-wide">{emp.name}</h2>
                  </div>
                  <button onClick={() => setDetailEmployeeId(null)}><X size={20} style={{ color: '#6B6459' }} /></button>
                </div>
                <p className="text-xs mb-4" style={{ color: '#9A917E' }}>Celotna zgodovina — vse ure, dopust in bolniška od začetka uporabe.</p>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5 text-sm">
                  <div className="p-3" style={{ border: `1px solid ${LINE}` }}>
                    <div className="text-xs" style={{ color: '#9A917E' }}>Redne ure skupaj</div>
                    <div className="font-mono">{fmtHours(totals.regular)}</div>
                  </div>
                  <div className="p-3" style={{ border: `1px solid ${LINE}` }}>
                    <div className="text-xs" style={{ color: '#9A917E' }}>Nadure skupaj</div>
                    <div className="font-mono" style={{ color: totals.overtime > 0.005 ? AMBER : INK }}>{fmtHours(totals.overtime)}</div>
                  </div>
                  <div className="p-3" style={{ border: `1px solid ${LINE}` }}>
                    <div className="text-xs" style={{ color: '#9A917E' }}>Dopust ({currentYear})</div>
                    <div className="font-mono">{vacationRemaining} / {emp.vacationDaysPerYear} dni</div>
                  </div>
                  <div className="p-3" style={{ border: `1px solid ${LINE}` }}>
                    <div className="text-xs" style={{ color: '#9A917E' }}>Bolniška skupaj</div>
                    <div className="font-mono">{bolniskaAllTime} dni</div>
                  </div>
                </div>
              </div>

              <div className="px-6 pb-6 overflow-y-auto">
                {history.length === 0 ? (
                  <p className="text-sm py-6 text-center" style={{ color: '#9A917E' }}>Za tega zaposlenega še ni nobenega vnosa.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="font-display uppercase text-xs tracking-wide" style={{ borderBottom: `1px solid ${LINE}`, color: '#6B6459' }}>
                        <td className="py-2">Datum</td>
                        <td className="py-2">Vrsta</td>
                        <td className="py-2">Lokacija</td>
                        <td className="py-2">Prihod</td>
                        <td className="py-2">Odhod</td>
                        <td className="py-2">Redne</td>
                        <td className="py-2">Nadure</td>
                      </tr>
                    </thead>
                    <tbody className="font-mono">
                      {history.map((e) => {
                        const split = e.type === 'delo' && e.clockOut ? splitHours(e.clockIn, e.clockOut, e.date) : null;
                        return (
                          <tr key={e.id} style={{ borderBottom: `1px solid ${LINE}` }}>
                            <td className="py-1.5">{fmtDate(e.date)}</td>
                            <td className="py-1.5 font-sans">{TYPE_LABEL[e.type]}</td>
                            <td className="py-1.5 font-sans">
                              {e.type === 'delo' ? (e.locationType === 'teren' ? `Teren: ${e.site}` : 'Delavnica') : '—'}
                            </td>
                            <td className="py-1.5">{e.type === 'delo' ? fmtTime(e.clockIn) : '—'}</td>
                            <td className="py-1.5">{e.type === 'delo' ? fmtTime(e.clockOut) : '—'}</td>
                            <td className="py-1.5">{split ? fmtHours(split.regular) : e.type !== 'delo' ? '8 h' : '—'}</td>
                            <td className="py-1.5" style={{ color: split && split.overtime > 0.005 ? AMBER : undefined }}>{split && split.overtime > 0.005 ? fmtHours(split.overtime) : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {isAdmin && editEntryId && (() => {
        const entry = entries.find((e) => e.id === editEntryId);
        if (!entry) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(38,36,32,0.6)' }}>
            <div className="w-full max-w-sm p-6" style={{ background: CARD }}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display uppercase text-lg tracking-wide">Uredi vnos</h2>
                <button onClick={cancelEdit}><X size={18} style={{ color: '#6B6459' }} /></button>
              </div>
              <p className="text-xs mb-4" style={{ color: '#6B6459' }}>{empName(entry.employeeId)} · {TYPE_LABEL[entry.type]}</p>

              <label className="block text-xs mb-1" style={{ color: '#6B6459' }}>Datum</label>
              <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="w-full p-2 text-sm font-mono mb-3" style={inputStyle} />

              {entry.type === 'delo' ? (
                <>
                  <label className="block text-xs mb-1" style={{ color: '#6B6459' }}>Lokacija</label>
                  <select value={editLocationType} onChange={(e) => setEditLocationType(e.target.value)} className="w-full p-2 text-sm mb-3" style={inputStyle}>
                    <option value="delavnica">Delavnica</option>
                    <option value="teren">Teren</option>
                  </select>
                  {editLocationType === 'teren' && (
                    <>
                      <label className="block text-xs mb-1" style={{ color: '#6B6459' }}>Naziv objekta</label>
                      <input value={editSite} onChange={(e) => setEditSite(e.target.value)} className="w-full p-2 text-sm mb-3" style={inputStyle} />
                    </>
                  )}
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="block text-xs mb-1" style={{ color: '#6B6459' }}>Prihod</label>
                      <input type="time" value={editClockIn} onChange={(e) => setEditClockIn(e.target.value)} className="w-full p-2 text-sm font-mono" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-xs mb-1" style={{ color: '#6B6459' }}>Odhod</label>
                      <input type="time" value={editClockOut} onChange={(e) => setEditClockOut(e.target.value)} className="w-full p-2 text-sm font-mono" style={inputStyle} />
                    </div>
                  </div>
                  <p className="text-xs mb-3" style={{ color: '#9A917E' }}>Prazen odhod pomeni, da je zaposleni še vedno prisoten.</p>
                </>
              ) : (
                <>
                  <label className="block text-xs mb-1" style={{ color: '#6B6459' }}>Vrsta</label>
                  <select value={editAbsType} onChange={(e) => setEditAbsType(e.target.value)} className="w-full p-2 text-sm mb-3" style={inputStyle}>
                    <option value="dopust">Dopust</option>
                    <option value="bolniska">Bolniška</option>
                  </select>
                </>
              )}

              {editError && <p className="text-xs mb-3" style={{ color: STAMP }}>{editError}</p>}

              <div className="flex gap-3">
                <button onClick={saveEdit} className="flex-1 py-2.5 font-display uppercase tracking-wide text-sm" style={{ background: INK, color: PAPER }}>Shrani</button>
                <button onClick={cancelEdit} className="flex-1 py-2.5 font-display uppercase tracking-wide text-sm" style={{ border: `1px solid ${LINE}`, color: '#6B6459' }}>Prekliči</button>
              </div>
            </div>
          </div>
        );
      })()}

      {printTarget && (() => {
        const emp = employees.find((e) => e.id === printTarget);
        if (!emp) return null;
        const s = summarize(printTarget, overviewMonth);
        const workRows = entries
          .filter((e) => e.employeeId === printTarget && e.type === 'delo' && e.date.startsWith(overviewMonth) && e.clockOut)
          .sort((a, b) => a.date.localeCompare(b.date));
        const absRows = entries
          .filter((e) => e.employeeId === printTarget && e.type !== 'delo' && e.date.startsWith(overviewMonth))
          .sort((a, b) => a.date.localeCompare(b.date));
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(38,36,32,0.6)' }}>
            <div className="w-full max-w-2xl max-h-[90vh] flex flex-col" style={{ background: CARD }}>
              <div id="print-area" className="p-8 overflow-y-auto">
                <div className="flex items-center justify-between mb-1">
                  <h1 className="font-display text-2xl uppercase tracking-wide">Kamnoseštvo Čakš</h1>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: emp.color, display: 'inline-block' }} />
                </div>
                <p className="text-sm mb-6" style={{ color: '#6B6459' }}>Poročilo o urah, dopustu in bolniški — <strong>{emp.name}</strong> — {monthLabel(overviewMonth)}</p>

                <table className="w-full text-sm mb-8 font-mono">
                  <tbody>
                    <tr style={{ borderBottom: `1px solid ${LINE}` }}><td className="py-1.5 font-sans" style={{ color: '#6B6459' }}>Delovnih dni</td><td className="py-1.5 text-right">{s.workDays}</td></tr>
                    <tr style={{ borderBottom: `1px solid ${LINE}` }}><td className="py-1.5 font-sans" style={{ color: '#6B6459' }}>Redne ure</td><td className="py-1.5 text-right">{fmtHours(s.regularHours)}</td></tr>
                    <tr style={{ borderBottom: `1px solid ${LINE}` }}><td className="py-1.5 font-sans" style={{ color: '#6B6459' }}>Nadure</td><td className="py-1.5 text-right" style={{ color: s.overtimeHours > 0.005 ? AMBER : INK }}>{fmtHours(s.overtimeHours)}</td></tr>
                    <tr style={{ borderBottom: `1px solid ${LINE}` }}><td className="py-1.5 font-sans" style={{ color: '#6B6459' }}>Dopust izkoriščen ta mesec</td><td className="py-1.5 text-right">{s.dopustDays} dni</td></tr>
                    <tr style={{ borderBottom: `1px solid ${LINE}` }}><td className="py-1.5 font-sans" style={{ color: '#6B6459' }}>Dopust preostanek ({currentYear})</td><td className="py-1.5 text-right">{s.vacationRemaining} / {emp.vacationDaysPerYear} dni</td></tr>
                    <tr><td className="py-1.5 font-sans" style={{ color: '#6B6459' }}>Bolniška ta mesec</td><td className="py-1.5 text-right">{s.bolniskaDays} dni</td></tr>
                  </tbody>
                </table>

                <h2 className="font-display uppercase text-sm tracking-wide mb-2" style={{ color: '#6B6459' }}>Dnevna evidenca dela</h2>
                {workRows.length === 0 ? (
                  <p className="text-xs mb-6" style={{ color: '#9A917E' }}>Ni vnosov za izbrani mesec.</p>
                ) : (
                  <table className="w-full text-xs mb-8 font-mono">
                    <thead>
                      <tr className="font-display uppercase" style={{ borderBottom: `1px solid ${LINE}`, color: '#6B6459' }}>
                        <td className="py-1.5">Datum</td>
                        <td className="py-1.5 font-sans">Lokacija</td>
                        <td className="py-1.5">Prihod</td>
                        <td className="py-1.5">Odhod</td>
                        <td className="py-1.5">Redne</td>
                        <td className="py-1.5">Nadure</td>
                      </tr>
                    </thead>
                    <tbody>
                      {workRows.map((e) => {
                        const split = splitHours(e.clockIn, e.clockOut, e.date);
                        return (
                          <tr key={e.id} style={{ borderBottom: `1px solid ${LINE}` }}>
                            <td className="py-1.5">{fmtDate(e.date)}</td>
                            <td className="py-1.5 font-sans">{e.locationType === 'teren' ? `Teren: ${e.site}` : 'Delavnica'}</td>
                            <td className="py-1.5">{fmtTime(e.clockIn)}</td>
                            <td className="py-1.5">{fmtTime(e.clockOut)}</td>
                            <td className="py-1.5">{fmtHours(split.regular)}</td>
                            <td className="py-1.5">{split.overtime > 0.005 ? fmtHours(split.overtime) : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}

                <h2 className="font-display uppercase text-sm tracking-wide mb-2" style={{ color: '#6B6459' }}>Dopust in bolniška</h2>
                {absRows.length === 0 ? (
                  <p className="text-xs" style={{ color: '#9A917E' }}>Ni vnesenih odsotnosti za izbrani mesec.</p>
                ) : (
                  <table className="w-full text-xs font-mono">
                    <tbody>
                      {absRows.map((e) => (
                        <tr key={e.id} style={{ borderBottom: `1px solid ${LINE}` }}>
                          <td className="py-1.5">{fmtDate(e.date)}</td>
                          <td className="py-1.5 font-sans">{TYPE_LABEL[e.type]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                <p className="text-xs mt-8" style={{ color: '#9A917E' }}>Natisnjeno: {now.toLocaleDateString('sl-SI')} {now.toLocaleTimeString('sl-SI')}</p>
              </div>
              <div className="p-4 flex gap-3" style={{ borderTop: `1px solid ${LINE}` }}>
                <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 font-display text-sm uppercase tracking-wide" style={{ background: INK, color: PAPER }}>
                  <Printer size={15} /> Natisni / Shrani kot PDF
                </button>
                <button onClick={() => setPrintTarget(null)} className="flex items-center gap-2 px-4 py-2 font-display text-sm uppercase tracking-wide" style={{ border: `1px solid ${LINE}`, color: '#6B6459' }}>
                  <X size={15} /> Zapri
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
