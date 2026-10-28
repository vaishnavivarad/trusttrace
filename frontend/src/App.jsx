import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity, AlertCircle, ArrowDownRight, ArrowLeft, ArrowRight, BadgeCheck, Boxes, Camera,
  Check, CheckCircle2, ChevronDown, Clock3, Eye, EyeOff, Factory, LayoutDashboard, LoaderCircle,
  LogOut, MapPin, Menu, Package, PackageCheck, Plus, QrCode, RefreshCw, ScanLine, Shield,
  ShieldAlert, ShieldCheck, Sparkles, UploadCloud, User, UserRound, Users, X
} from 'lucide-react';
import './App.css';

const API = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api').replace(/\/$/, '');
const API_ORIGIN = API.replace(/\/api$/, '');
const categoryLabels = { food: 'Food', cosmetics: 'Cosmetics & Personal Care', medicine: 'Medicine' };

function initialRoute() {
  const pathname = window.location.pathname.replace(/\/+$/, '') || '/';
  const match = pathname.match(/^\/verify\/([^/]+)$/);
  if (match) return { page: 'verify', productId: decodeURIComponent(match[1]) };
  const routeMap = {
    '/': 'home', '/home': 'home', '/login': 'login', '/signup': 'signup',
    '/manufacturer': 'manufacturer', '/customer': 'customer', '/admin': 'admin', '/profile': 'profile', '/verify': 'verify'
  };
  return { page: routeMap[pathname] || 'home', productId: '' };
}
function getStoredUser() {
  try { return JSON.parse(localStorage.getItem('trusttrace_user') || 'null'); } catch { return null; }
}
function getStoredToken() { return localStorage.getItem('trusttrace_token') || ''; }
async function apiRequest(path, { token, ...options } = {}) {
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${API}${path}`, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) {
    const error = new Error(body.message || `Request failed (${response.status}).`);
    error.code = body.code || 'REQUEST_FAILED'; error.status = response.status;
    throw error;
  }
  return body;
}
function initials(name = '') { return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'TT'; }
function formatDate(value) { if (!value) return '—'; const date = new Date(value); return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString(); }
function StatusBadge({ status = 'PENDING' }) {
  const value = String(status).toLowerCase();
  const kind = value.includes('suspicious') || value.includes('mismatch') || value.includes('fail') || value.includes('counterfeit') || value.includes('unregistered') ? 'danger' : value.includes('pass') || value.includes('registered') || value.includes('approved') || value.includes('match') || value.includes('no_suspicious') ? 'success' : value.includes('partial') || value.includes('uncertain') || value.includes('pending') || value.includes('unavailable') ? 'warning' : 'neutral';
  return <span className={`status-badge ${kind}`}><span className="status-dot" />{String(status).replaceAll('_', ' ')}</span>;
}
function SectionHeading({ eyebrow, title, description, action }) {
  return <div className="section-heading"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</div>;
}
function GateCard({ number, title, description, icon: Icon, state = 'ready' }) {
  return <div className={`gate-card ${state}`}><div className="gate-top"><span className="gate-number">0{number}</span><span className="gate-icon"><Icon size={21} /></span></div><h3>{title}</h3><p>{description}</p><div className="gate-footer"><span className="gate-line" /><span className="gate-tag">{state === 'planned' ? 'MODEL SETUP REQUIRED' : 'VERIFICATION LAYER'}</span></div></div>;
}
function App() {
  const [route, setRoute] = useState(initialRoute);
  const [user, setUser] = useState(getStoredUser);
  const [token, setToken] = useState(getStoredToken);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [notice, setNotice] = useState(null);

  const navigate = (page, productId = '') => {
    const path = page === 'verify' && productId ? `/verify/${encodeURIComponent(productId)}` : page === 'home' ? '/' : `/${page}`;
    window.history.pushState({}, '', path);
    setRoute({ page, productId });
    setMobileMenu(false);
    setNotice(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  useEffect(() => {
    const pop = () => setRoute(initialRoute());
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, []);
  const setSession = (data) => {
    localStorage.setItem('trusttrace_token', data.token);
    localStorage.setItem('trusttrace_user', JSON.stringify(data.user));
    setToken(data.token); setUser(data.user);
  };
  const signOut = () => { localStorage.removeItem('trusttrace_token'); localStorage.removeItem('trusttrace_user'); setToken(''); setUser(null); navigate('home'); };
  const notify = (type, message) => { setNotice({ type, message }); window.setTimeout(() => setNotice(null), 6500); };
  const goDashboard = (currentUser = user) => navigate(currentUser?.role === 'manufacturer' ? 'manufacturer' : currentUser?.role === 'admin' ? 'admin' : 'customer');

  const page = route.page;
  const isAppPage = ['manufacturer', 'customer', 'admin', 'verify', 'profile'].includes(page);

  return <div className="app-shell">
    <header className="topbar">
      <button className="brand-lockup" onClick={() => navigate('home')} aria-label="TrustTrace home">
        <span className="brand-symbol"><ShieldCheck size={25} strokeWidth={2.2} /></span>
        <span className="brand-text"><strong>TrustTrace</strong><small>PRODUCT INTEGRITY NETWORK</small></span>
      </button>
      <button className="mobile-menu-toggle" onClick={() => setMobileMenu(v => !v)} aria-label="Toggle navigation"><Menu size={22} /></button>
      <nav className={`top-nav ${mobileMenu ? 'open' : ''}`}>
        <button className={page === 'home' ? 'nav-link active' : 'nav-link'} onClick={() => navigate('home')}>Home</button>
        <button className="nav-link" onClick={() => document.getElementById('how-it-works') ? document.getElementById('how-it-works').scrollIntoView({ behavior: 'smooth' }) : navigate('home')}>How it works</button>
        <button className="nav-link" onClick={() => navigate('verify')}>Verify product</button>
      </nav>
      <div className="top-actions">
        {user ? <>
          <button className="btn btn-soft user-pill" onClick={() => goDashboard()}><span className="avatar-mini">{initials(user.name)}</span><span>{user.name.split(' ')[0]}</span><ChevronDown size={14} /></button>
          <button className="icon-button" onClick={signOut} title="Sign out"><LogOut size={18} /></button>
        </> : <>
          <button className="btn btn-quiet top-manufacturer" onClick={() => navigate('login')}>Manufacturer login</button>
          <button className="btn btn-outline top-customer" onClick={() => navigate('login')}>Customer login</button>
          <button className="btn btn-primary top-signup" onClick={() => navigate('signup')}>Create account <ArrowRight size={16} /></button>
        </>}
      </div>
    </header>

    {notice && <div className={`toast ${notice.type}`} role="status"><AlertCircle size={18} />{notice.message}<button onClick={() => setNotice(null)}><X size={15} /></button></div>}

    {!isAppPage && page === 'home' && <HomePage navigate={navigate} />}
    {page === 'login' && <LoginPage navigate={navigate} setSession={setSession} notify={notify} />}
    {page === 'signup' && <SignupPage navigate={navigate} setSession={setSession} notify={notify} />}
    {page === 'manufacturer' && <ManufacturerPage user={user} token={token} navigate={navigate} notify={notify} />}
    {page === 'customer' && <CustomerPage user={user} token={token} navigate={navigate} notify={notify} />}
    {page === 'admin' && <AdminPage user={user} token={token} navigate={navigate} notify={notify} />}
    {page === 'verify' && <VerifyPage user={user} token={token} productId={route.productId} navigate={navigate} notify={notify} />}
    {page === 'profile' && <ProfilePage user={user} navigate={navigate} signOut={signOut} />}

    <footer className="site-footer"><div className="footer-brand"><span className="brand-symbol small"><ShieldCheck size={18} /></span><strong>TrustTrace</strong></div><span>Blockchain records · AI image checks · Location-aware verification</span><span className="footer-note">Suspicious signals are warnings, not conclusive proof.</span></footer>
  </div>;
}

function HomePage({ navigate }) {
  return <main>
    <section className="hero-section page-container">
      <div className="hero-copy"><div className="hero-kicker"><span className="live-dot" /> THREE-LAYER PRODUCT VERIFICATION</div>
        <h1>Trust the product.<br /><span>Verify the evidence.</span></h1>
        <p className="hero-description">A copied QR code can look real. TrustTrace checks the blockchain record, compares the product packaging, and reviews scan location and time to help spot suspicious products.</p>
        <div className="hero-buttons"><button className="btn btn-primary btn-lg" onClick={() => navigate('verify')}>Verify a product <ArrowRight size={17} /></button><button className="btn btn-outline btn-lg" onClick={() => navigate('signup')}>Register as manufacturer <Factory size={17} /></button></div>
        <div className="hero-trust-row"><div className="avatar-stack"><span>B</span><span>AI</span><span>GPS</span></div><div><strong>Three independent checks</strong><small>One clear, reasoned result</small></div></div>
      </div>
      <div className="hero-visual"><div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" /><div className="hero-center"><ShieldCheck size={49} /><span>TRUSTTRACE</span><small>VERIFICATION ENGINE</small></div>
        <div className="floating-chip chip-blockchain"><span className="chip-icon blue"><Boxes size={17} /></span><span><strong>Blockchain</strong><small>Product record</small></span><CheckCircle2 size={16} className="chip-check" /></div>
        <div className="floating-chip chip-ai"><span className="chip-icon purple"><ScanLine size={17} /></span><span><strong>Siamese CNN</strong><small>Image comparison</small></span><Activity size={16} className="chip-meter" /></div>
        <div className="floating-chip chip-gps"><span className="chip-icon teal"><MapPin size={17} /></span><span><strong>CASPG</strong><small>Location & time</small></span><ArrowDownRight size={16} className="chip-check" /></div>
        <div className="visual-caption"><span className="caption-pulse" /> Three gates. Layered evidence.</div>
      </div>
    </section>
    <section className="proof-strip"><div className="page-container proof-strip-inner"><div><ShieldCheck size={19} /><span>Immutable registration record</span></div><div><ScanLine size={19} /><span>Reference image comparison</span></div><div><MapPin size={19} /><span>Location-aware scan check</span></div></div></section>
    <section className="page-container section-block" id="how-it-works"><SectionHeading eyebrow="HOW TRUSTTRACE WORKS" title="Three layers. One verification flow." description="A registered QR is only the starting point. Each layer checks a different source of evidence." />
      <div className="gate-grid"><GateCard number={1} title="Blockchain record" description="Check that this exact Product ID was registered by an authorized manufacturer." icon={Boxes} /><GateCard number={2} title="Packaging image check" description="Compare the customer's product photo with the manufacturer's reference image using a Siamese CNN." icon={ScanLine} state="planned" /><GateCard number={3} title="CASPG location & time" description="Use permitted GPS location and server time to check if movement between scans is physically plausible." icon={MapPin} /></div>
    </section>
    <section className="why-section"><div className="page-container why-grid"><div><span className="eyebrow">WHY IT MATTERS</span><h2>A QR code can be copied.<br />A product needs more than a scan.</h2><p>TrustTrace does not treat one matching QR as proof of authenticity. It combines registration, visual evidence, and scan movement checks, then explains why a warning was raised.</p><button className="btn btn-dark" onClick={() => navigate('verify')}>Start a verification <ArrowRight size={16} /></button></div><div className="why-cards"><div className="why-card"><span className="why-number">01</span><h3>Trace the record</h3><p>Read the product identity from the configured blockchain contract.</p></div><div className="why-card"><span className="why-number">02</span><h3>Compare the packaging</h3><p>Look for a strong visual difference from the enrolled reference photo.</p></div><div className="why-card"><span className="why-number">03</span><h3>Check the journey</h3><p>Flag movement that crosses the configured speed threshold.</p></div></div></div></section>
    <section className="page-container final-cta"><div className="cta-icon"><QrCode size={27} /></div><div><h2>Check a product before you trust its QR.</h2><p>Start with a product QR code or enter its Product ID manually.</p></div><button className="btn btn-primary" onClick={() => navigate('verify')}>Verify product <ArrowRight size={16} /></button></section>
  </main>;
}

function AuthFrame({ title, description, children, sideTitle = 'Better checks. Clearer answers.', sideText = 'TrustTrace brings blockchain records, AI image comparison and location-aware checks into one simple verification flow.' }) {
  return <main className="auth-page"><div className="auth-shell"><aside className="auth-aside"><div className="auth-aside-top"><span className="brand-symbol"><ShieldCheck size={24} /></span><strong>TrustTrace</strong></div><div className="auth-aside-content"><span className="eyebrow light">PRODUCT INTEGRITY</span><h2>{sideTitle}</h2><p>{sideText}</p><div className="auth-mini-flow"><div><Boxes size={17} /><span>Blockchain</span></div><i /><div><ScanLine size={17} /><span>Image check</span></div><i /><div><MapPin size={17} /><span>CASPG</span></div></div></div><div className="auth-aside-bottom">Three layers of verification. No single signal tells the whole story.</div></aside><section className="auth-form-panel"><span className="eyebrow">WELCOME TO TRUSTTRACE</span><h1>{title}</h1><p className="auth-description">{description}</p>{children}</section></div></main>;
}
function LoginPage({ navigate, setSession, notify }) {
  const [form, setForm] = useState({ email: '', password: '' }); const [show, setShow] = useState(false); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const submit = async (event) => {
    event.preventDefault(); setLoading(true); setError('');
    try {
      const data = await apiRequest('/auth/login', { method: 'POST', body: JSON.stringify(form) });
      setSession(data); notify('success', data.message);
      const pendingProductId = sessionStorage.getItem('trusttrace_pending_verification_product');
      if (pendingProductId) {
        sessionStorage.removeItem('trusttrace_pending_verification_product');
        navigate('verify', pendingProductId);
      } else {
        navigate(data.user.role === 'admin' ? 'admin' : data.user.role === 'manufacturer' ? 'manufacturer' : 'customer');
      }
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };
  return <AuthFrame title="Sign in to your account" description="Use your registered account to access your TrustTrace workspace."><form className="form-stack" onSubmit={submit}><label>Email address<input type="email" autoComplete="email" required placeholder="you@company.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></label><label>Password<span className="password-wrap"><input type={show ? 'text' : 'password'} autoComplete="current-password" required placeholder="Enter your password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /><button type="button" className="password-toggle" onClick={() => setShow(v => !v)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label>{error && <div className="inline-error"><AlertCircle size={17} />{error}</div>}<button className="btn btn-primary btn-block" disabled={loading}>{loading ? <><LoaderCircle className="spin" size={17} /> Signing in...</> : <>Sign in <ArrowRight size={17} /></>}</button><div className="auth-helper">Manufacturer accounts need admin approval and on-chain wallet authorization before registering products.</div></form><div className="auth-bottom">New to TrustTrace? <button onClick={() => navigate('signup')}>Create an account</button></div></AuthFrame>;
}
const LOCAL_HARDHAT_PUBLIC_WALLETS = [
  { label: 'Hardhat Account #1 (0x7099...79C8)', address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' },
  { label: 'Hardhat Account #2 (0x3C44...93BC)', address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' },
  { label: 'Hardhat Account #3 (0x90F7...b906)', address: '0x90F79bf6EB2c4f870365E785982E1f101E93b906' },
  { label: 'Hardhat Account #4 (0x15d3...6A65)', address: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65' },
  { label: 'Hardhat Account #5 (0x9965...A4dc)', address: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc' },
  { label: 'Hardhat Account #6 (0x976E...0aa9)', address: '0x976EA74026E726554dB657fA54763abd0C3a0aa9' }
];
// Hardhat demo addresses are only meaningful against a local chain (31337); never offer them on deployed builds.
const SHOW_LOCAL_WALLET_HELPERS = import.meta.env.DEV || import.meta.env.VITE_SHOW_LOCAL_WALLET_HELPERS === 'true';

function SignupPage({ navigate, setSession, notify }) {
  const [role, setRole] = useState('customer'); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', email: '', password: '', companyName: '', businessEmail: '', contactName: '', category: 'food', walletAddress: '' });
  const update = (key, value) => setForm(v => ({ ...v, [key]: value }));
  const submit = async e => {
    e.preventDefault(); setLoading(true); setError('');
    try {
      const data = await apiRequest('/auth/signup', { method: 'POST', body: JSON.stringify({ ...form, role }) });
      setSession(data); notify('success', data.message);
      const pendingProductId = sessionStorage.getItem('trusttrace_pending_verification_product');
      if (pendingProductId && role === 'customer') {
        sessionStorage.removeItem('trusttrace_pending_verification_product');
        navigate('verify', pendingProductId);
      } else {
        navigate(role === 'manufacturer' ? 'manufacturer' : 'customer');
      }
    } catch (e2) { setError(e2.message); } finally { setLoading(false); }
  };
  return <AuthFrame title="Create your account" description="Choose how you want to use the product verification platform." sideTitle="Bring more trust to every scan." sideText="Manufacturers create product records. Customers verify the products in their hands."><div className="role-switch"><button className={role === 'customer' ? 'selected' : ''} onClick={() => setRole('customer')} type="button"><UserRound size={17} />Customer</button><button className={role === 'manufacturer' ? 'selected' : ''} onClick={() => setRole('manufacturer')} type="button"><Factory size={17} />Manufacturer</button></div><form className="form-stack signup-form" onSubmit={submit}><label>Full name<input required minLength="2" placeholder="Your name" value={form.name} onChange={e => update('name', e.target.value)} /></label><label>Email address<input type="email" required placeholder="you@example.com" value={form.email} onChange={e => update('email', e.target.value)} /></label><label>Password<input type="password" required minLength="8" placeholder="At least 8 characters" value={form.password} onChange={e => update('password', e.target.value)} /></label>{role === 'manufacturer' && <div className="form-section"><div className="form-section-heading">Company details <span>Approval required</span></div><label>Company / brand name<input required placeholder="Company name" value={form.companyName} onChange={e => update('companyName', e.target.value)} /></label><label>Business email<input type="email" required placeholder="business@company.com" value={form.businessEmail} onChange={e => update('businessEmail', e.target.value)} /></label><label>Contact name<input required placeholder="Authorized contact" value={form.contactName} onChange={e => update('contactName', e.target.value)} /></label><label>Product category<select value={form.category} onChange={e => update('category', e.target.value)}><option value="food">Packaged food</option><option value="cosmetics">Cosmetics & personal care</option><option value="medicine">Medicine</option></select></label><label>Public blockchain wallet address (42-char 0x... address)<input required placeholder="0x... (your public wallet address)" pattern="0x[a-fA-F0-9]{40}" value={form.walletAddress} onChange={e => update('walletAddress', e.target.value)} />{SHOW_LOCAL_WALLET_HELPERS && <select value="" onChange={e => { if (e.target.value) update('walletAddress', e.target.value); }} style={{ marginTop: '6px' }}><option value="">Optional local dev helper: Pick a standard Hardhat public test address...</option>{LOCAL_HARDHAT_PUBLIC_WALLETS.map(w => <option key={w.address} value={w.address}>{w.label}</option>)}</select>}<small className="field-hint">Enter only your public EVM wallet address (42 characters starting with 0x). Never enter a private key or seed phrase. Once registered, this wallet is permanently stored with your manufacturer account.</small></label></div>}{error && <div className="inline-error"><AlertCircle size={17} />{error}</div>}<button className="btn btn-primary btn-block" disabled={loading}>{loading ? <><LoaderCircle className="spin" size={17} /> Creating account...</> : <>Create account <ArrowRight size={17} /></>}</button></form><div className="auth-bottom">Already have an account? <button onClick={() => navigate('login')}>Sign in</button></div></AuthFrame>;
}

function DashboardLayout({ user, title, navItems, active, onNavigate, children, sideLabel }) {
  return <main className="dashboard-layout"><aside className="dashboard-sidebar"><div className="sidebar-brand"><span className="brand-symbol"><ShieldCheck size={23} /></span><span><strong>TrustTrace</strong><small>{sideLabel}</small></span></div><div className="sidebar-profile"><span className="profile-avatar">{initials(user?.name)}</span><span><strong>{user?.name || 'Guest'}</strong><small>{user?.role || 'visitor'}</small></span><span className="profile-status" /></div><div className="sidebar-label">WORKSPACE</div><nav className="sidebar-nav">{navItems.map(item => <button key={item.id} className={active === item.id ? 'active' : ''} onClick={() => onNavigate(item.id)}><item.icon size={18} /><span>{item.label}</span>{item.count > 0 && <em>{item.count}</em>}</button>)}</nav><div className="sidebar-bottom"><div className="help-card"><Shield size={18} /><strong>Your data, checked.</strong><p>Every verification shows what was checked and what remains uncertain.</p></div><button className="sidebar-logout" onClick={() => { localStorage.removeItem('trusttrace_token'); localStorage.removeItem('trusttrace_user'); window.location.href = '/'; }}><LogOut size={17} />Sign out</button></div></aside><section className="dashboard-main"><div className="dashboard-top"><div className="breadcrumb"><span>TrustTrace</span><span>/</span><strong>{title}</strong></div><div className="dashboard-top-actions"><span className="network-pill"><span className="network-dot" /> Local / configured network</span><span className="avatar-mini">{initials(user?.name)}</span></div></div><div className="dashboard-content">{children}</div></section></main>;
}
function AuthRequired({ navigate, role }) {
  return <div className="auth-required"><div className="empty-icon"><ShieldAlert size={28} /></div><h2>Sign in to continue</h2><p>This workspace requires an authenticated {role} account.</p><button className="btn btn-primary" onClick={() => navigate('login')}>Go to login <ArrowRight size={16} /></button></div>;
}

function ManufacturerPage({ user, token, navigate, notify }) {
  const [tab, setTab] = useState('overview'); const [products, setProducts] = useState([]); const [loading, setLoading] = useState(false); const [appStatus, setAppStatus] = useState(null); const [meError, setMeError] = useState('');
  const [refImageFile, setRefImageFile] = useState(null); const [refImagePreview, setRefImagePreview] = useState('');
  const fileInputRef = useRef(null);
  const loadProducts = useCallback(async () => { if (!token) return; try { const d = await apiRequest('/products/mine', { token }); setProducts(d.products || []); } catch (e) { setMeError(e.message); } }, [token]);
  useEffect(() => {
    if (!token || user?.role !== 'manufacturer') return;
    apiRequest('/auth/me', { token }).then(d => setAppStatus(d.manufacturerApplication)).catch(e => setMeError(e.message));
    loadProducts();
  }, [token, user?.role, loadProducts]);
  useEffect(() => () => { if (refImagePreview) URL.revokeObjectURL(refImagePreview); }, [refImagePreview]);
  if (!user || user.role !== 'manufacturer') return <AuthRequired navigate={navigate} role="manufacturer" />;
  const navItems = [{ id: 'overview', label: 'Overview', icon: LayoutDashboard }, { id: 'register', label: 'Register product', icon: Plus }, { id: 'products', label: 'My products', icon: Package }, { id: 'profile', label: 'Company profile', icon: User }];
  const handleRefImageChange = (event) => {
    const file = event.target.files?.[0] || null;
    setMeError('');
    if (!file) {
      setRefImageFile(null);
      setRefImagePreview('');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setMeError('Use JPEG, PNG or WebP for the reference image.');
      event.target.value = '';
      setRefImageFile(null);
      setRefImagePreview('');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setMeError('Reference image must be 8 MB or smaller.');
      event.target.value = '';
      setRefImageFile(null);
      setRefImagePreview('');
      return;
    }
    setRefImageFile(file);
    setRefImagePreview(URL.createObjectURL(file));
  };
  const clearRefImage = () => {
    setRefImageFile(null);
    setRefImagePreview('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };
  const doRegister = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!refImageFile) {
      setMeError('Upload a clear manufacturing-time packaging photo.');
      return;
    }
    const formData = new FormData(form);
    formData.set('referenceImage', refImageFile, refImageFile.name);
    setLoading(true);
    setMeError('');
    try {
      const result = await apiRequest('/products/register', { method: 'POST', token, body: formData });
      notify('success', result.message);
      form.reset();
      clearRefImage();
      await loadProducts();
      setTab('products');
    } catch (e) {
      setMeError(e.message);
    } finally {
      setLoading(false);
    }
  };
  return <DashboardLayout user={user} title="Manufacturer dashboard" sideLabel="MANUFACTURER" navItems={navItems} active={tab} onNavigate={id => id === 'profile' ? navigate('profile') : setTab(id)}>
    {appStatus && <div className="content-card" style={{ marginBottom: '18px', padding: '16px 20px', display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'space-between', alignItems: 'center' }}>
      <div>
        <span className="eyebrow">STORED MANUFACTURER WALLET & AUTHORIZATION</span>
        <strong style={{ display: 'block', fontSize: '15px', marginTop: '4px' }}>{appStatus.companyName} · <code className="mono">{appStatus.walletAddress || user.walletAddress}</code></strong>
        <small style={{ color: '#64748b' }}>Your public wallet address is saved with your account and used automatically during product registration.</small>
      </div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <StatusBadge status={appStatus.status || 'PENDING'} />
        <StatusBadge status={appStatus.onChainAuthorized === true ? 'AUTHORIZED_ON_CHAIN' : appStatus.onChainAuthorized === false ? 'NOT_AUTHORIZED_ON_CHAIN' : 'CHAIN_STATUS_PENDING'} />
      </div>
    </div>}
    {appStatus && appStatus.status !== 'APPROVED' && <div className="callout warning"><Clock3 size={20} /><div><strong>Manufacturer approval is {String(appStatus.status).toLowerCase()}.</strong><p>You can prepare product details, but registration stays locked until admin approval and on-chain wallet authorization are complete.</p></div><StatusBadge status={appStatus.status} /></div>}
    {meError && <div className="callout danger"><AlertCircle size={19} /><div><strong>Action needs attention</strong><p>{meError}</p></div><button className="icon-button" onClick={() => setMeError('')}><X size={16} /></button></div>}
    {tab === 'overview' && <><SectionHeading eyebrow="MANUFACTURER WORKSPACE" title={`Welcome back, ${user.name.split(' ')[0]}`} description="Register product units, manage QR codes, and review recent verification activity." action={<button className="btn btn-primary" onClick={() => setTab('register')}><Plus size={17} /> Register product</button>} /><div className="stats-grid"><StatCard icon={PackageCheck} label="Registered products" value={products.filter(p => p.status === 'REGISTERED').length} note="Confirmed on blockchain" color="blue" /><StatCard icon={ScanLine} label="Reference images" value={products.filter(p => p.referenceImageCID).length} note="CID stored with record" color="violet" /><StatCard icon={AlertCircle} label="Registration issues" value={products.filter(p => p.status !== 'REGISTERED').length} note="Review incomplete records" color="amber" /></div><div className="content-card table-card"><div className="card-heading"><div><h3>Recent products</h3><p>Your latest registrations</p></div><button className="text-button" onClick={() => setTab('products')}>View all <ArrowRight size={15} /></button></div><ProductTable products={products.slice(0, 5)} onRefresh={loadProducts} navigate={navigate} token={token} notify={notify} /></div><div className="info-callout"><Sparkles size={18} /><div><strong>Registration flow</strong><p>The reference photo is uploaded first. A QR code is issued only after a confirmed blockchain registration transaction.</p></div></div></>}
    {tab === 'register' && <><SectionHeading eyebrow="NEW PRODUCT UNIT" title="Register a product" description="Enter the unit-level details and upload a clear photo of the packaging as it leaves manufacturing." /><form className="content-card product-form" onSubmit={doRegister}><div className="form-section-heading"><span>Product details</span><small>Fields marked * are required</small></div><div className="form-grid"><label>Product name *<input name="name" required placeholder="e.g. Herbal shampoo 200 ml" /></label><label>Brand *<input name="brand" required placeholder="Brand name" /></label><label>Product category *<select name="category" required><option value="food">Packaged food</option><option value="cosmetics">Cosmetics & personal care</option><option value="medicine">Medicine</option></select></label><label>SKU / model<input name="sku" placeholder="e.g. SH-200" /></label><label>Batch number *<input name="batchNumber" required placeholder="e.g. BATCH-2026-01" /></label><label>Unique unit serial *<input name="unitSerial" required placeholder="Unique serial for this unit" /></label><label>Manufacturing date<input name="manufactureDate" type="date" /></label><label>Expiry date (if applicable)<input name="expiryDate" type="date" /></label></div><div className="upload-section">{refImagePreview ? <img src={refImagePreview} alt="Selected reference packaging" style={{ width: '56px', height: '56px', objectFit: 'cover', borderRadius: '10px', border: '1px solid rgba(15, 23, 42, 0.12)' }} /> : <div className="upload-icon"><Camera size={22} /></div>}<div className="upload-copy"><strong>{refImageFile ? `Selected: ${refImageFile.name}` : 'Manufacturing-time reference photo *'}</strong><p>{refImageFile ? `${(refImageFile.size / 1024).toFixed(1)} KB · ${refImageFile.type} — Ready to upload to IPFS` : 'Take a clear front-facing photo of the packaging. JPEG, PNG or WebP, up to 8 MB.'}</p></div><div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}><label className="btn btn-outline upload-button"><UploadCloud size={16} /> {refImageFile ? 'Change photo' : 'Choose photo'}<input ref={fileInputRef} type="file" name="referenceImage" accept="image/jpeg,image/png,image/webp" hidden onChange={handleRefImageChange} /></label>{refImageFile && <button type="button" className="btn btn-quiet" onClick={clearRefImage} title="Remove selected photo"><X size={16} /> Remove</button>}</div></div><div className="registration-note"><ShieldCheck size={18} /><span>Only an approved manufacturer wallet can register a product. The reference image must be available through IPFS before blockchain registration starts.</span></div><button className="btn btn-primary btn-lg" disabled={loading || appStatus?.status !== 'APPROVED'}>{loading ? <><LoaderCircle className="spin" size={17} /> Registering on blockchain...</> : <>Register product & generate QR <ArrowRight size={17} /></>}</button>{appStatus?.status !== 'APPROVED' && <p className="field-hint">Registration is disabled until your application is approved.</p>}</form></>}
    {tab === 'products' && <><SectionHeading eyebrow="PRODUCT CATALOGUE" title="My products" description="Only products associated with your account are shown here." action={<button className="btn btn-primary" onClick={() => setTab('register')}><Plus size={17} /> Add product</button>} /><div className="content-card table-card"><ProductTable products={products} onRefresh={loadProducts} navigate={navigate} token={token} notify={notify} /></div></>}
  </DashboardLayout>;
}
function StatCard({ icon: Icon, label, value, note, color = 'blue' }) { return <div className="stat-card"><div className={`stat-icon ${color}`}><Icon size={20} /></div><span className="stat-label">{label}</span><strong>{value}</strong><small>{note}</small></div>; }
function ProductTable({ products = [], onRefresh, navigate, token, notify }) {
  const [regenId, setRegenId] = useState('');
  const handleRegenQr = async (pid) => {
    if (!token || !pid) return;
    setRegenId(pid);
    try {
      const res = await apiRequest(`/products/${encodeURIComponent(pid)}/qr`, { token });
      if (notify) notify('success', `QR code regenerated for ${pid} (${res.verificationUrl})`);
      if (onRefresh) await onRefresh();
    } catch (e) {
      if (notify) notify('danger', e.message);
    } finally {
      setRegenId('');
    }
  };
  return products.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Product</th><th>Category</th><th>Batch / Serial</th><th>Registered</th><th>Status</th><th>QR & Details</th></tr></thead><tbody>{products.map(p => { const pid = p.productId || p.product_id; return <tr key={p.id || pid}><td><div className="product-cell">{p.referenceImageCID && p.status === 'REGISTERED' && pid ? <img key={pid} src={`${API_ORIGIN}/api/products/${encodeURIComponent(pid)}/image`} alt={`${p.name || pid} saved reference`} title={`Saved reference image (CID ${p.referenceImageCID})`} style={{ width: '44px', height: '44px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #e2e8f0', flexShrink: 0 }} onError={e => { e.currentTarget.style.visibility = 'hidden'; }} /> : <span className="product-cell-icon"><Package size={18} /></span>}<div><strong>{p.name || p.product_name}</strong><small>{pid}</small></div></div></td><td>{categoryLabels[p.category] || p.category || '—'}</td><td><span className="mono">{p.batchNumber || p.batch_number || '—'}</span><small className="table-subline">{p.unitSerial || 'Unit serial not provided'}</small></td><td>{formatDate(p.createdAt || p.created_at)}</td><td><StatusBadge status={p.status || 'REGISTERED'} /></td><td><div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>{p.qrUrl ? <a className="qr-link" href={`${API_ORIGIN}${p.qrUrl}`} target="_blank" rel="noreferrer"><QrCode size={16} /> Open QR</a> : <span className="muted-text">—</span>}{token && pid && <button type="button" className="text-button" disabled={regenId === pid} onClick={() => handleRegenQr(pid)} title="Regenerate QR image using current FRONTEND_PUBLIC_URL"><RefreshCw size={13} className={regenId === pid ? 'spin' : ''} /> {regenId === pid ? 'Updating...' : 'Regenerate QR'}</button>}{pid && navigate && <button type="button" className="text-button" onClick={() => navigate('verify', pid)}>Product page <ArrowRight size={14} /></button>}</div></td></tr>; })}</tbody></table></div> : <div className="empty-state"><div className="empty-icon"><Package size={27} /></div><h3>No products registered yet</h3><p>After an approved wallet successfully registers a product on-chain, it will appear here.</p>{onRefresh && <button className="btn btn-outline" onClick={onRefresh}><RefreshCw size={15} /> Refresh products</button>}</div>;
}

function CustomerPage({ user, navigate }) {
  const [productId, setProductId] = useState(''); const [error, setError] = useState('');
  if (!user || user.role !== 'customer') return <AuthRequired navigate={navigate} role="customer" />;
  const start = async e => { e?.preventDefault(); setError(''); if (!productId.trim()) return setError('Enter a Product ID or scan a product QR.'); navigate('verify', productId.trim()); };
  return <DashboardLayout user={user} title="Customer dashboard" sideLabel="CUSTOMER" navItems={[{ id: 'overview', label: 'Overview', icon: LayoutDashboard }, { id: 'verify', label: 'Scan a product', icon: ScanLine }, { id: 'history', label: 'Scan history', icon: Clock3 }, { id: 'profile', label: 'Profile', icon: User }]} active="overview" onNavigate={id => id === 'verify' ? navigate('verify') : id === 'profile' ? navigate('profile') : id === 'history' ? setError('Your scan history is available after successful verification requests have been saved by the backend.') : setError('')}>
    <SectionHeading eyebrow="CUSTOMER WORKSPACE" title="Verify before you trust" description="Scan a product QR or enter its Product ID to start the three-layer check." />
    <div className="customer-hero-card"><div className="customer-hero-copy"><span className="hero-kicker"><span className="live-dot" /> PRODUCT CHECK</span><h2>What are you buying today?</h2><p>We check its blockchain record first, then compare the packaging photo and review scan location/time.</p><form className="product-id-form" onSubmit={start}><div className="input-with-icon"><QrCode size={19} /><input value={productId} onChange={e => setProductId(e.target.value)} placeholder="Enter Product ID (e.g. PROD-...)" /></div><button className="btn btn-primary">Verify <ArrowRight size={16} /></button></form>{error && <p className="inline-error"><AlertCircle size={16} />{error}</p>}</div><div className="customer-illustration"><div className="scan-ring"><QrCode size={54} /><span className="scan-line" /></div><span className="scan-caption">SCAN · CHECK · VERIFY</span></div></div>
    <div className="section-subheading"><h3>How your scan is checked</h3><p>Each layer has a separate result.</p></div><div className="gate-grid compact"><GateCard number={1} title="Blockchain record" description="Is this Product ID registered?" icon={Boxes} /><GateCard number={2} title="Packaging photo" description="Does the image match the saved reference?" icon={ScanLine} state="planned" /><GateCard number={3} title="Location & time" description="Could this movement happen in the time available?" icon={MapPin} /></div>
  </DashboardLayout>;
}

// Shows ONLY this product's registered reference image (same CID via API proxy, then the IPFS gateway).
// Never substitutes another image: if both fail, an explicit "unavailable" state is shown.
function ReferenceImage({ src, fallbackSrc, alt }) {
  const [current, setCurrent] = useState(src); const [failed, setFailed] = useState(false);
  if (failed) return <div className="inline-error" style={{ minHeight: '120px', justifyContent: 'center' }}><AlertCircle size={17} />Reference image unavailable right now (IPFS retrieval failed). Retry later; no substitute image is shown.</div>;
  return <img src={current} alt={alt} onError={() => { if (fallbackSrc && current !== fallbackSrc) setCurrent(fallbackSrc); else setFailed(true); }} style={{ width: '100%', maxHeight: '240px', objectFit: 'contain', borderRadius: '10px', background: '#fff' }} />;
}

function VerifyPage({ user, token, productId: initialId, navigate, notify }) {
  const [productId, setProductId] = useState(initialId || ''); const [session, setSession] = useState(null); const [product, setProduct] = useState(null); const [step, setStep] = useState(initialId ? 'start' : 'entry'); const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const [result, setResult] = useState(null); const [imageFile, setImageFile] = useState(null); const [imagePreview, setImagePreview] = useState(''); const [scanMode, setScanMode] = useState(false);
  const videoRef = useRef(null); const streamRef = useRef(null); const detectorFrame = useRef(null); const loadedInitialId = useRef(''); const productRequestSeq = useRef(0);
  const stopCamera = () => { if (detectorFrame.current) cancelAnimationFrame(detectorFrame.current); if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; setScanMode(false); };
  useEffect(() => () => stopCamera(), []);

  const loadProductDetails = async (idOverride) => {
    const id = String(idOverride || productId).trim();
    if (!id) { setError('Scan a product QR or enter a Product ID.'); return; }
    setProductId(id); setError(''); setLoading(true); setResult(null); setProduct(null); setSession(null); setStep('start');
    const requestSeq = ++productRequestSeq.current;
    try {
      const data = await apiRequest(`/products/${encodeURIComponent(id)}`);
      // Ignore late responses for a previously requested product so Product A can never render over Product B.
      if (requestSeq !== productRequestSeq.current || data?.product?.productId !== id) return;
      setProduct(data.product);
      setStep('details');
    } catch (e) {
      if (requestSeq !== productRequestSeq.current) return;
      setError(e.message);
      if (e.code === 'UNREGISTERED_PRODUCT' || e.status === 404) {
        setStep('final');
        setResult({ status: 'UNREGISTERED_LIKELY_COUNTERFEIT', title: 'Product Not Found / Unregistered Product', message: e.message || 'This Product ID was not found on the configured blockchain.' });
      } else {
        setStep('entry');
        setResult({ status: 'VERIFICATION_UNAVAILABLE', title: 'Could not verify the blockchain record', message: e.message });
      }
    } finally { setLoading(false); stopCamera(); }
  };

  const startVerificationSession = async (idOverride) => {
    const id = String(idOverride || product?.productId || productId).trim();
    if (!id) { setError('Scan a product QR or enter a Product ID.'); return; }
    if (!token || !user) {
      sessionStorage.setItem('trusttrace_pending_verification_product', id);
      notify('warning', 'Please sign in to start the Gate 2 & Gate 3 authenticity verification session.');
      navigate('login');
      return;
    }
    setError(''); setLoading(true);
    try {
      const data = await apiRequest('/verification/start', { method: 'POST', token, body: JSON.stringify({ productId: id }) });
      setSession(data.sessionId);
      setProduct(prev => ({ ...(prev || {}), ...(data.product || {}) }));
      setStep('image');
      notify('success', 'Gate 1 verified. Upload or capture a packaging photo for Gate 2 comparison.');
    } catch (e) {
      setError(e.message);
      if (e.code === 'UNREGISTERED_PRODUCT' || (e.status === 404 && e.code === 'NOT_FOUND')) {
        setStep('final');
        setResult({ status: 'UNREGISTERED_LIKELY_COUNTERFEIT', title: 'Unregistered product', message: e.message });
      }
    } finally { setLoading(false); stopCamera(); }
  };

  useEffect(() => {
    if (!initialId) return;
    setProductId(initialId);
    if (loadedInitialId.current === initialId) return;
    loadedInitialId.current = initialId;
    loadProductDetails(initialId);
    // loadProductDetails is intentionally omitted: the ref prevents duplicate fetches on re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialId]);

  const startScanner = async () => {
    setError('');
    if (!('BarcodeDetector' in window)) { setError('This browser does not support direct QR scanning. Enter the Product ID manually or open the camera app to read the QR.'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      streamRef.current = stream; setScanMode(true);
      setTimeout(() => {
        if (!videoRef.current) return;
        videoRef.current.srcObject = stream; videoRef.current.play().catch(() => {});
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        const tick = async () => {
          if (!videoRef.current || !streamRef.current) return;
          try { const codes = await detector.detect(videoRef.current); if (codes?.[0]?.rawValue) { const raw = codes[0].rawValue; const m = raw.match(/\/verify\/([^/?#]+)/); const id = m ? decodeURIComponent(m[1]) : raw; stopCamera(); setProductId(id); navigate('verify', id); loadProductDetails(id); return; } } catch { /* continue camera scan */ }
          detectorFrame.current = requestAnimationFrame(tick);
        };
        detectorFrame.current = requestAnimationFrame(tick);
      }, 100);
    } catch (e) { setError(`Camera could not be opened: ${e.message}. You can enter the Product ID manually.`); }
  };
  const submitImage = async e => {
    e.preventDefault(); if (!session || !imageFile) return setError('Please select or capture a clear product photo.'); setLoading(true); setError('');
    const fd = new FormData(); fd.append('image', imageFile);
    try {
      const data = await apiRequest(`/verification/${session}/image`, { method: 'POST', token, body: fd });
      if (data.gate2?.status === 'PASS') { setStep('location'); notify('success', 'Packaging check complete. Continue to location and time verification.'); }
      else if (data.final) { setResult(data.final); setStep('final'); }
      else if (data.gate2?.status === 'NEED_RETAKE' || data.gate2?.status === 'UNCERTAIN') { setStep('image'); setError(data.gate2.message); }
      else { setError(data.message || 'Image comparison could not be completed.'); }
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };
  const submitLocation = async () => {
    setLoading(true); setError('');
    const send = async payload => apiRequest(`/verification/${session}/location`, { method: 'POST', token, body: JSON.stringify(payload) });
    if (!navigator.geolocation) {
      try { const d = await send({ locationConsent: false }); setResult(d.final); setStep('final'); } catch (e) { setError(e.message); } finally { setLoading(false); } return;
    }
    navigator.geolocation.getCurrentPosition(async pos => {
      try { const d = await send({ locationConsent: true, latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracyMeters: pos.coords.accuracy }); setResult(d.final); setStep('final'); }
      catch (e) { setError(e.message); } finally { setLoading(false); }
    }, async geoError => {
      try { const d = await send({ locationConsent: false }); setResult({ ...d.final, message: `${d.final.message} (${geoError.message})` }); setStep('final'); }
      catch (e) { setError(e.message); } finally { setLoading(false); }
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
  };
  const reset = () => { stopCamera(); loadedInitialId.current = ''; setSession(null); setProduct(null); setResult(null); setImageFile(null); setImagePreview(''); setError(''); setStep('entry'); setProductId(''); navigate('verify'); };
  const refImgSrc = product?.referenceImageUrl ? `${API_ORIGIN}${product.referenceImageUrl}` : product?.referenceImageGatewayUrl || '';
  return <main className="verification-page page-container"><div className="verify-breadcrumb"><button onClick={() => navigate(user?.role === 'customer' ? 'customer' : 'home')}><ArrowLeft size={15} /> Back</button><span>PRODUCT DETAILS & VERIFICATION</span></div><div className="verify-title"><span className="eyebrow">TRUSTTRACE PRODUCT REGISTRY</span><h1>{step === 'details' && product ? product.name : "Product lookup & verification"}</h1><p>{step === 'details' ? 'Review the official blockchain registration record and manufacturer details below.' : 'Scan a product QR code or enter a Product ID to view its registration details and verify authenticity.'}</p></div>
    <div className="verify-stepper">{[{id:'details',label:'Product & Blockchain',n:1},{id:'image',label:'Packaging image',n:2},{id:'location',label:'Location & time',n:3}].map((s,i) => <div key={s.id} className={`stepper-item ${(step===s.id || (step==='start' && i===0)) ? 'current' : ['details','image','location','final'].includes(step) && i===0 && step!=='details' || step==='location' && i===1 || step==='final' ? 'done' : ''}`}><span>{(['image','location','final'].includes(step) && i===0) || (step==='location'&&i===1) || step==='final' ? <Check size={15}/> : s.n}</span><strong>{s.label}</strong></div>)}</div>
    {step === 'entry' && <div className="verify-card"><div className="verify-card-icon"><QrCode size={26} /></div><h2>Scan a product QR code</h2><p>Use your camera or enter the Product ID printed on the product label to view its product details.</p><button className="btn btn-primary btn-lg" onClick={startScanner}><ScanLine size={18} /> Open QR scanner</button>{scanMode && <div className="camera-panel"><video ref={videoRef} playsInline muted /><button className="btn btn-outline" onClick={stopCamera}>Stop camera</button></div>}<div className="form-divider"><span>OR ENTER ID MANUALLY</span></div><form className="product-id-form" onSubmit={e => { e.preventDefault(); if (productId.trim()) { navigate('verify', productId.trim()); loadProductDetails(productId.trim()); } else { loadProductDetails(); } }}><div className="input-with-icon"><QrCode size={18} /><input value={productId} onChange={e => setProductId(e.target.value)} placeholder="e.g. PROD-ABC123-4DEF" /></div><button className="btn btn-primary" disabled={loading}>{loading ? <LoaderCircle size={16} className="spin" /> : 'View product'}</button></form>{error && <div className="inline-error"><AlertCircle size={17}/>{error}</div>}<p className="fine-print">Product details are publicly accessible without signing in. Sign-in is only required if you start a Gate 2 & 3 verification session.</p></div>}
    {step === 'start' && <div className="verify-card centered"><LoaderCircle size={31} className="spin accent-icon" /><h2>Loading product details</h2><p>Reading blockchain record from ProductAuth for {productId || 'the selected product'}...</p>{error && <div className="inline-error"><AlertCircle size={16}/>{error}</div>}<button className="btn btn-primary" onClick={() => loadProductDetails()} disabled={loading}>{loading ? 'Loading...' : 'Retry lookup'}</button></div>}
    {step === 'details' && product && <div className="verify-stage">
      <div className="product-summary-card">
        <div className="product-summary-icon"><PackageCheck size={26} /></div>
        <div className="summary-info">
          <span className="eyebrow">GATE 1 VERIFIED · REGISTERED ON BLOCKCHAIN</span>
          <h2>{product.name}</h2>
          <p>{product.brand || 'Brand not recorded'} · {categoryLabels[product.category] || product.category || 'Product'}</p>
          <div className="summary-meta">
            <span>Product ID <strong>{product.productId}</strong></span>
            <span>Manufacturer <strong>{product.manufacturerName || product.brand || 'Authorized Manufacturer'}</strong></span>
            <span>Batch <strong>{product.batchNumber || '—'}</strong></span>
          </div>
        </div>
        <StatusBadge status={product.status || 'REGISTERED_ON_BLOCKCHAIN'} />
      </div>

      <div className="verify-card" style={{ textAlign: 'left' }}>
        <div className="stage-heading" style={{ marginBottom: '18px' }}>
          <span className="stage-count">01</span>
          <div>
            <span className="eyebrow">OFFICIAL PRODUCT RECORD</span>
            <h2>Product & Registration Details</h2>
            <p>Canonical registration facts retrieved from the ProductAuth smart contract and manufacturer registry.</p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: refImgSrc ? 'repeat(auto-fit, minmax(220px, 1fr))' : '1fr', gap: '24px', alignItems: 'start' }}>
          {refImgSrc && (
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '12px', textAlign: 'center' }}>
              <ReferenceImage key={product.productId} src={refImgSrc} fallbackSrc={product.referenceImageGatewayUrl} alt={`${product.name} reference packaging`} />
              <small style={{ display: 'block', marginTop: '8px', color: '#64748b', fontSize: '12px' }}>Manufacturer Reference Packaging Image</small>
            </div>
          )}

          <div className="profile-data" style={{ margin: 0 }}>
            <div><span>Product Name</span><strong>{product.name}</strong></div>
            <div><span>Brand</span><strong>{product.brand || '—'}</strong></div>
            <div><span>Manufacturer / Company</span><strong>{product.manufacturerName || product.brand || '—'}</strong></div>
            <div><span>Category</span><strong>{categoryLabels[product.category] || product.category || '—'}</strong></div>
            <div><span>Product ID</span><strong className="mono">{product.productId}</strong></div>
            <div><span>SKU / Model</span><strong>{product.sku || '—'}</strong></div>
            <div><span>Batch Number</span><strong className="mono">{product.batchNumber || '—'}</strong></div>
            <div><span>Unit Serial</span><strong className="mono">{product.unitSerial || '—'}</strong></div>
            <div><span>Manufacturing Date</span><strong>{formatDate(product.manufactureDate)}</strong></div>
            <div><span>Expiry Date</span><strong>{formatDate(product.expiryDate)}</strong></div>
            <div><span>Registered At</span><strong>{formatDate(product.createdAt || (product.registeredAt ? Number(product.registeredAt) * 1000 : null))}</strong></div>
            <div><span>Manufacturer Wallet</span><strong className="mono" style={{ wordBreak: 'break-all' }}>{product.manufacturerWallet || '—'}</strong></div>
            {product.transactionHash && <div><span>Blockchain Tx Hash</span><strong className="mono" style={{ wordBreak: 'break-all' }}>{product.transactionHash}</strong></div>}
            {product.referenceImageCID && <div><span>Reference Image CID</span><strong className="mono" style={{ wordBreak: 'break-all' }}>{product.referenceImageCID}</strong></div>}
            <div><span>Recorded Scans</span><strong>{product.scanCount ?? 0}</strong></div>
          </div>
        </div>

        {error && <div className="inline-error" style={{ marginTop: '16px' }}><AlertCircle size={17}/>{error}</div>}

        <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid #e2e8f0', display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <strong style={{ display: 'block', fontSize: '14px', color: '#0f172a' }}>Want to verify the physical package in your hand?</strong>
            <span className="fine-print">Run Gate 2 (packaging photo comparison) and Gate 3 (CASPG scan movement check).</span>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-outline" onClick={reset}><QrCode size={16} /> Look up another product</button>
            <button type="button" className="btn btn-primary" onClick={() => startVerificationSession(product.productId)} disabled={loading}>
              {loading ? <><LoaderCircle size={16} className="spin" /> Starting...</> : <>Start Authenticity Verification (Gate 2 & 3) <ArrowRight size={16} /></>}
            </button>
          </div>
        </div>
      </div>
    </div>}
    {step === 'image' && product && <div className="verify-stage"><div className="product-summary-card"><div className="product-summary-icon"><PackageCheck size={26} /></div><div className="summary-info"><span className="eyebrow">GATE 1 PASSED</span><h2>{product.name}</h2><p>{product.brand || 'Brand not recorded'} · {categoryLabels[product.category] || product.category || 'Product'}</p><div className="summary-meta"><span>Product ID <strong>{product.productId}</strong></span><span>Batch <strong>{product.batchNumber || '—'}</strong></span><span>Manufacturer <strong>{String(product.manufacturerWallet || '').slice(0, 9)}…</strong></span></div></div><StatusBadge status="BLOCKCHAIN_PASS" /></div><div className="verify-card image-upload-card"><div className="stage-heading"><span className="stage-count">02</span><div><span className="eyebrow">GATE 2 · SIAMESE CNN</span><h2>Take a photo of the packaging</h2><p>Capture the same front/label area as the manufacturer's reference image. The comparison runs in the backend.</p></div></div><form onSubmit={submitImage}><label className="image-dropzone">{imagePreview ? <img src={imagePreview} alt="Selected product packaging" /> : <><span className="upload-icon large"><Camera size={25} /></span><strong>Choose or capture product photo</strong><small>Use camera or choose from your device · Max 8 MB</small></>}<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={e => { const file = e.target.files?.[0]; setImageFile(file || null); setImagePreview(file ? URL.createObjectURL(file) : ''); setError(''); }} /></label><div className="image-form-actions"><button type="button" className="btn btn-outline" onClick={() => setStep('details')}><ArrowLeft size={16}/> Back to product details</button><button className="btn btn-primary" disabled={loading || !imageFile}>{loading ? <><LoaderCircle size={16} className="spin" /> Comparing...</> : <>Compare image <ArrowRight size={16}/></>}</button></div></form>{error && <div className="inline-error"><AlertCircle size={17}/>{error}</div>}</div></div>}
    {step === 'location' && product && <div className="verify-card location-card"><div className="verify-card-icon teal"><MapPin size={26}/></div><span className="eyebrow">GATE 3 · CASPG</span><h2>Check scan location and time</h2><p>TrustTrace uses your location only if you allow it. The server records when the scan request arrives and compares this scan with the previous usable scan for this Product ID.</p><div className="privacy-points"><div><CheckCircle2 size={17}/><span>Location is requested only now, for Gate 3.</span></div><div><CheckCircle2 size={17}/><span>If permission is denied, the location check is shown as unavailable.</span></div><div><CheckCircle2 size={17}/><span>Movement above the configured threshold is a warning, not conclusive proof.</span></div></div><button className="btn btn-primary btn-lg" onClick={submitLocation} disabled={loading}>{loading ? <><LoaderCircle size={17} className="spin" /> Checking location...</> : <>Allow location & continue <MapPin size={17}/></>}</button>{error && <div className="inline-error"><AlertCircle size={17}/>{error}</div>}<p className="fine-print">Precise coordinates are kept off the public blockchain; the application records the verification evidence with access controls.</p></div>}
    {step === 'final' && <FinalResult result={result} reset={reset} navigate={navigate} />}
  </main>;
}
function FinalResult({ result, reset, navigate }) {
  const status = String(result?.status || 'VERIFICATION_UNAVAILABLE'); const suspicious = status.includes('SUSPICIOUS') || status.includes('COUNTERFEIT') || status.includes('UNREGISTERED'); const complete = status === 'NO_SUSPICIOUS_SIGNALS_DETECTED';
  return <div className={`final-result-card ${suspicious ? 'danger' : complete ? 'success' : 'warning'}`}><div className="final-result-icon">{suspicious ? <ShieldAlert size={32}/> : complete ? <ShieldCheck size={32}/> : <AlertCircle size={32}/>}</div><span className="eyebrow">VERIFICATION SUMMARY</span><h2>{result?.title || 'Verification could not be completed'}</h2><p>{result?.message || 'No final result was returned. Retry after checking service configuration.'}</p><div className="result-status-line"><span>System status</span><StatusBadge status={status}/></div>{result?.explanation && <div className="final-result-note"><strong>CASPG Movement Evidence</strong><p>{result.explanation}</p></div>}{result?.audit?.txHash && <div className="final-result-note"><strong>Immutable On-Chain Scan Audit</strong><p className="mono" style={{ wordBreak: 'break-all' }}>Tx: {result.audit.txHash}</p></div>}<div className="final-result-note"><strong>What this means</strong><p>{complete ? 'No suspicious signals were found in the checks that ran. This does not guarantee the product is genuine.' : suspicious ? 'A suspicious signal needs attention. Check the reason and contact the manufacturer. The system cannot conclusively prove every counterfeit from these checks alone.' : 'One or more checks could not be completed. Do not treat an unavailable check as a pass.'}</p></div><div className="final-actions"><button className="btn btn-primary" onClick={reset}><RefreshCw size={16}/> Verify another product</button><button className="btn btn-outline" onClick={() => navigate('customer')}>Back to dashboard</button></div></div>;
}

function AdminPage({ user, token, navigate, notify }) {
  const [applications, setApplications] = useState([]);
  const [stats, setStats] = useState(null);
  const [diagnostics, setDiagnostics] = useState(null);
  const [error, setError] = useState('');
  const [loadingId, setLoadingId] = useState('');
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const [apps, overview] = await Promise.all([
        apiRequest('/admin/manufacturers?status=PENDING', { token }),
        apiRequest('/admin/overview', { token })
      ]);
      setApplications(apps.applications || []);
      setStats(overview.stats);
      setDiagnostics(overview.diagnostics || null);
    } catch (e) {
      setError(e.message);
    }
  }, [token]);

  useEffect(() => { if (token && user?.role === 'admin') load(); }, [token, user?.role, load]);
  if (!user || user.role !== 'admin') return <AuthRequired navigate={navigate} role="admin" />;

  const review = async (id, action) => {
    setLoadingId(id); setError('');
    try {
      const d = await apiRequest(`/admin/manufacturers/${id}/${action}`, { method: 'POST', token, body: JSON.stringify({ note: action === 'reject' ? 'Application did not meet review requirements.' : '' }) });
      notify('success', d.message);
      await load();
    } catch (e) { setError(e.message); }
    finally { setLoadingId(''); }
  };

  const syncLocalChain = async () => {
    setSyncing(true); setError('');
    try {
      const d = await apiRequest('/admin/sync-local-chain', { method: 'POST', token });
      notify('success', d.message);
      await load();
    } catch (e) { setError(e.message); }
    finally { setSyncing(false); }
  };

  return <DashboardLayout user={user} title="Admin console" sideLabel="ADMIN" navItems={[{ id: 'overview', label: 'Overview', icon: LayoutDashboard }, { id: 'manufacturers', label: 'Manufacturer approvals', icon: Users }, { id: 'profile', label: 'Profile', icon: User }]} active="overview" onNavigate={id => id === 'profile' ? navigate('profile') : load()}>
    <SectionHeading eyebrow="PLATFORM ADMINISTRATION" title="TrustTrace overview" description="Review manufacturer requests, inspect blockchain diagnostics, and monitor registration activity." action={<div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>{diagnostics?.expectedChainId === '31337' && <button className="btn btn-primary" onClick={syncLocalChain} disabled={syncing}>{syncing ? <><LoaderCircle size={15} className="spin" /> Syncing chain...</> : <><RefreshCw size={15} /> Deploy & Sync Local Chain</>}</button>}<button className="btn btn-outline" onClick={load}><RefreshCw size={15} /> Refresh</button></div>} />
    {error && <div className="callout danger"><AlertCircle size={18} /><p>{error}</p></div>}

    {diagnostics && (
      <div className="content-card" style={{ marginBottom: '20px', padding: '20px' }}>
        <div className="card-heading" style={{ marginBottom: '14px' }}>
          <div>
            <h3>Blockchain & Smart Contract Diagnostics</h3>
            <p>Live RPC chain ID, ProductAuth bytecode verification, and local deployment status.</p>
          </div>
          <StatusBadge status={diagnostics.contractBytecodeExists && diagnostics.chainIdMatches ? 'CONTRACT_VERIFIED' : diagnostics.needsLocalDeployment ? 'NEEDS_LOCAL_DEPLOYMENT' : 'CHAIN_ATTENTION_REQUIRED'} />
        </div>
        <div className="profile-data" style={{ margin: 0 }}>
          <div><span>Configured RPC URL</span><strong className="mono">{diagnostics.rpcUrl || 'Not set'}</strong></div>
          <div><span>Expected Chain ID</span><strong className="mono">{diagnostics.expectedChainId || '—'}</strong></div>
          <div><span>Actual RPC Chain ID</span><strong className="mono">{diagnostics.actualChainId ? `${diagnostics.actualChainId} ${diagnostics.chainIdMatches ? '(Matches)' : '(Mismatch!)'}` : 'RPC Unreachable'}</strong></div>
          <div><span>Configured Contract Address</span><strong className="mono" style={{ wordBreak: 'break-all' }}>{diagnostics.configuredContractAddress || 'Not set'}</strong></div>
          <div><span>Contract Bytecode Exists</span><strong>{diagnostics.contractBytecodeExists ? `Yes (${diagnostics.contractBytecodeBytes} bytes at block #${diagnostics.blockNumber ?? '—'})` : 'No bytecode found at configured address'}</strong></div>
          <div><span>Local Contract Needs Deployment</span><strong>{diagnostics.needsLocalDeployment ? 'Yes — Local Hardhat node was reset' : 'No'}</strong></div>
        </div>
        {(diagnostics.error || diagnostics.needsLocalDeployment) && (
          <div className="callout warning" style={{ marginTop: '14px' }}>
            <AlertCircle size={19} />
            <div>
              <strong>{diagnostics.error || 'Local Hardhat node reset detected'}</strong>
              <p>{diagnostics.recoveryInstruction} Command: <code className="mono">{diagnostics.recoveryCommand}</code></p>
            </div>
            {diagnostics.expectedChainId === '31337' && (
              <button className="btn btn-primary" onClick={syncLocalChain} disabled={syncing}>
                {syncing ? <><LoaderCircle size={15} className="spin" /> Recovering...</> : 'Deploy & Sync Now'}
              </button>
            )}
          </div>
        )}
      </div>
    )}

    <div className="stats-grid">{['users','manufacturersPending','manufacturersApproved','products','scans','suspiciousScans'].map((key,i)=><StatCard key={key} icon={[Users,Clock3,BadgeCheck,Package,ScanLine,ShieldAlert][i]} label={key.replace(/([A-Z])/g,' $1').replace(/^./,s=>s.toUpperCase())} value={stats?.[key] ?? '—'} note="Current application records" color={['blue','amber','teal','violet','blue','amber'][i]} />)}</div>

    <div className="content-card table-card" style={{ marginBottom: '20px' }}>
      <div className="card-heading"><div><h3>Pending manufacturer applications</h3><p>Approval requires on-chain authorization to succeed.</p></div><StatusBadge status={`${applications.length} PENDING`} /></div>
      {applications.length ? <div className="application-list">{applications.map(app => <div className="application-row" key={app.id}><div className="application-company"><span className="company-avatar"><Factory size={19}/></span><div><strong>{app.companyName}</strong><small>{app.businessEmail} · {app.category}</small><code>{app.walletAddress}</code></div></div><div className="application-actions"><button className="btn btn-outline danger-button" disabled={loadingId===app.id} onClick={() => review(app.id,'reject')}>Reject</button><button className="btn btn-primary" disabled={loadingId===app.id} onClick={() => review(app.id,'approve')}>{loadingId===app.id ? <LoaderCircle size={15} className="spin"/> : <Check size={15}/>} Approve & authorize</button></div></div>)}</div> : <div className="empty-state"><div className="empty-icon"><Users size={26}/></div><h3>No pending applications</h3><p>New manufacturer applications will appear here for review.</p></div>}
    </div>

    {diagnostics?.manufacturers?.length > 0 && (
      <div className="content-card table-card">
        <div className="card-heading">
          <div>
            <h3>Registered Manufacturer Wallets & On-Chain Status</h3>
            <p>Stored PostgreSQL manufacturer records compared with live ProductAuth contract authorization.</p>
          </div>
          <StatusBadge status={`${diagnostics.manufacturers.length} ACCOUNTS`} />
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Company / User</th>
                <th>Public Wallet Address</th>
                <th>DB Status</th>
                <th>On-Chain Authorized</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {diagnostics.manufacturers.map(m => (
                <tr key={m.id}>
                  <td>
                    <div>
                      <strong>{m.companyName}</strong>
                      <small style={{ display: 'block', color: '#64748b' }}>{m.userName} ({m.userEmail})</small>
                    </div>
                  </td>
                  <td><code className="mono">{m.walletAddress}</code></td>
                  <td><StatusBadge status={m.status} /></td>
                  <td><StatusBadge status={m.onChainAuthorized === true ? 'AUTHORIZED' : m.onChainAuthorized === false ? 'NOT_AUTHORIZED' : 'UNAVAILABLE'} /></td>
                  <td>
                    {(m.status === 'PENDING' || (m.status === 'APPROVED' && m.onChainAuthorized === false)) ? (
                      <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '13px' }} disabled={loadingId === m.id} onClick={() => review(m.id, 'approve')}>
                        {loadingId === m.id ? <LoaderCircle size={14} className="spin" /> : <Check size={14} />} {m.status === 'PENDING' ? 'Approve & authorize' : 'Re-authorize wallet'}
                      </button>
                    ) : <span className="muted-text">Verified</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )}
  </DashboardLayout>;
}
function ProfilePage({ user, navigate, signOut }) {
  return <main className="page-container profile-page"><button className="back-link" onClick={() => navigate(user?.role === 'manufacturer' ? 'manufacturer' : user?.role === 'admin' ? 'admin' : 'customer')}><ArrowLeft size={16}/> Back to workspace</button><div className="profile-card"><span className="profile-avatar large">{initials(user?.name)}</span><span className="eyebrow">ACCOUNT PROFILE</span><h1>{user?.name || 'Signed out'}</h1><p>{user?.email || 'No account session found'}</p><div className="profile-data"><div><span>Role</span><strong>{user?.role || '—'}</strong></div><div><span>Account status</span><StatusBadge status={user?.status || 'SIGNED_OUT'}/></div><div><span>Wallet</span><strong className="mono">{user?.walletAddress || 'Not connected'}</strong></div></div><button className="btn btn-outline" onClick={signOut}><LogOut size={16}/> Sign out</button></div></main>;
}

export default App;
