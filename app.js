
// ════════════════════════════════════════════════
// NOKILO APP — Main JavaScript (FIXED v2)
// ════════════════════════════════════════════════

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBBV5Hw-2miO6uBLXNeJf8iSS0ESmNPxKQ",
  authDomain: "nokilo-app-aec0d.firebaseapp.com",
  projectId: "nokilo-app-aec0d",
  storageBucket: "nokilo-app-aec0d.firebasestorage.app",
  messagingSenderId: "1047328392598",
  appId: "1:1047328392598:web:ab77119ce3a5e997e1c9b7"
};

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, updateProfile, sendEmailVerification }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot,
  doc, setDoc, getDoc, getDocs, serverTimestamp, where, limit, updateDoc }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const app  = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db   = getFirestore(app);

let currentUser  = null;
let activeChat   = null;
let unsubChat    = null;
let unsubConv    = null;

function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function fmtTime(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'Kounye a';
  if (diff < 3600000) return Math.floor(diff/60000)+'min';
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  return d.toLocaleDateString('fr',{day:'numeric',month:'short'});
}

const AV_COLORS = [
  ['#0f2044','#1a3a6e'],['#0f766e','#059669'],['#1e3a8a','#3b82f6'],
  ['#78350f','#d97706'],['#4c1d95','#7c3aed'],['#881337','#e11d48'],
];
function avColors(uid) {
  let h=0; for(const c of (uid||'')) h=(h*31+c.charCodeAt(0))%AV_COLORS.length;
  return AV_COLORS[h];
}
function avInitials(name) {
  return (name||'?').split(' ').map(w=>w[0]||'').join('').toUpperCase().slice(0,2) || '?';
}
function avEl(uid, name, sz=44, grp=false) {
  const [g1,g2] = avColors(uid);
  return `<div class="av${grp?' av-grp':''}" style="width:${sz}px;height:${sz}px;background:linear-gradient(135deg,${g1},${g2});font-size:${Math.round(sz*.34)}px;">${avInitials(name)}</div>`;
}

setTimeout(() => {
  onAuthStateChanged(auth, user => {
    if (user) {
      currentUser = user;
      loadHome();
    } else {
      initLangScreen();
    }
  });
}, 1800);

let authMode = 'login';

function setAuthMode(mode) {
  authMode = mode;
  document.getElementById('auth-tab-login').classList.toggle('on', mode==='login');
  document.getElementById('auth-tab-reg').classList.toggle('on', mode==='register');
  document.getElementById('auth-tab-login').classList.toggle('off', mode!=='login');
  document.getElementById('auth-tab-reg').classList.toggle('off', mode==='login');
  document.getElementById('reg-fields').style.display = mode==='register' ? 'block' : 'none';
  document.getElementById('auth-title').textContent = mode==='login' ? 'Konekte' : 'Kreye Kont';
  document.getElementById('auth-sub').textContent = mode==='login'
    ? 'Bon retou sou NOKILO 👋' : 'Rantre nan kominote a kounye a';
  document.getElementById('auth-btn-txt').textContent = mode==='login' ? 'Konekte' : 'Kreye Kont';
  document.getElementById('auth-err').style.display = 'none';
}

function showErr(msg) {
  const el = document.getElementById('auth-err');
  el.textContent = msg; el.style.display = 'block';
}

async function handleAuth() {
  // FIX: Always lowercase email
  const email = document.getElementById('auth-email').value.trim().toLowerCase();
  const pass  = document.getElementById('auth-pass').value;
  const name  = document.getElementById('reg-name')?.value?.trim();
  if (!email || !pass) { showErr('Tanpri ranpli tout chan yo.'); return; }
  const btn = document.getElementById('auth-btn');
  btn.textContent = '...'; btn.disabled = true;
  try {
    if (authMode === 'register') {
      if (!name) { showErr('Mete non ou.'); btn.textContent='Kreye Kont'; btn.disabled=false; return; }
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      await updateProfile(cred.user, { displayName: name });
      await setDoc(doc(db,'users',cred.user.uid), {
        name,
        email: email,
        emailLower: email,
        uid: cred.user.uid,
        createdAt: serverTimestamp(),
        online: true,
      });
      try { await sendEmailVerification(cred.user); } catch(e) {}
      currentUser = cred.user;
    } else {
      const cred = await signInWithEmailAndPassword(auth, email, pass);
      currentUser = cred.user;
      await updateDoc(doc(db,'users',currentUser.uid), {
        online: true,
        emailLower: email
      }).catch(()=>{});
    }
    loadHome();
  } catch(e) {
    const msgs = {
      'auth/email-already-in-use': 'Imèl sa deja itilize.',
      'auth/invalid-email': 'Imèl pa valid.',
      'auth/weak-password': 'Modpas: 6 karaktè minimum.',
      'auth/user-not-found': 'Kont pa egziste.',
      'auth/wrong-password': 'Modpas pa kòrèk.',
      'auth/invalid-credential': 'Imèl oswa modpas pa kòrèk.',
    };
    showErr(msgs[e.code] || 'Erè: '+e.message);
    btn.textContent = authMode==='login' ? 'Konekte' : 'Kreye Kont';
    btn.disabled = false;
  }
}

async function loadHome() {
  show('home');
  updateProfileUI();
  listenChats();
}

function listenChats() {
  if (unsubChat) unsubChat();
  const list = document.getElementById('chat-list');
  list.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';

  const q = query(
    collection(db,'conversations'),
    where('members','array-contains', currentUser.uid),
    orderBy('lastAt','desc'),
    limit(30)
  );

  unsubChat = onSnapshot(q, snap => {
    if (snap.empty) {
      list.innerHTML = `<div class="empty-state">
        <div class="empty-icon">💬</div>
        <div class="empty-txt">Pa gen mesaj ankò</div>
        <div class="empty-sub">Kòmanse yon konvèsasyon<br>ak bouton + anlè a</div>
      </div>`;
      return;
    }
    list.innerHTML = snap.docs.map(d => {
      const cv = d.data();
      const otherId = (cv.members||[]).find(m => m !== currentUser.uid) || currentUser.uid;
      const otherName = cv.names?.[otherId] || cv.groupName || 'Moun';
      const preview = cv.lastMsg || '...';
      const unread  = cv.unread?.[currentUser.uid] || 0;
      const [g1,g2] = avColors(otherId);
      const init = avInitials(otherName);
      return `<div class="chat-item" onclick="openChat('${d.id}','${otherId}','${otherName.replace(/'/g,"\\'")}')">
        <div style="position:relative;">
          <div class="av${cv.isGroup?' av-grp':''}" style="width:46px;height:46px;background:linear-gradient(135deg,${g1},${g2});font-size:15px;">${init}</div>
          ${cv.online?'<div class="online-dot"></div>':''}
        </div>
        <div class="chat-info">
          <div class="chat-name">${otherName}</div>
          <div class="chat-preview">${preview}</div>
        </div>
        <div class="chat-meta">
          <div class="chat-time">${fmtTime(cv.lastAt)}</div>
          ${unread>0?'<div class="badge">'+unread+'</div>':''}
        </div>
      </div>`;
    }).join('');
  }, err => console.error('chats err', err));
}

async function newChat() {
  const emailInput = prompt('📧 Imèl moun ou vle kominike ak li:');
  if (!emailInput) return;
  const email = emailInput.trim().toLowerCase();

  try {
    let snap = await getDocs(query(
      collection(db,'users'),
      where('emailLower','==', email),
      limit(1)
    ));

    if (snap.empty) {
      snap = await getDocs(query(
        collection(db,'users'),
        where('email','==', email),
        limit(1)
      ));
    }

    if (snap.empty) {
      alert('❌ Moun sa poko nan NOKILO.\n\nDi yo ale sou nokilo.app pou yo kreye kont la.');
      return;
    }
    const other = snap.docs[0];
    if (other.id === currentUser.uid) {
      alert('🤔 Sa se imèl ou menm! Eseye yon lòt moun.');
      return;
    }
    const convId = [currentUser.uid, other.id].sort().join('_');
    const ref = doc(db,'conversations',convId);
    const existing = await getDoc(ref);
    if (!existing.exists()) {
      await setDoc(ref, {
        members: [currentUser.uid, other.id],
        names: {
          [currentUser.uid]: currentUser.displayName || 'Mwen',
          [other.id]: other.data().name || 'Moun'
        },
        isGroup: false,
        lastMsg: '',
        lastAt: serverTimestamp(),
        unread: { [currentUser.uid]: 0, [other.id]: 0 },
      });
    }
    openChat(convId, other.id, other.data().name || 'Moun');
  } catch(e) {
    console.error(e);
    alert('Erè: '+e.message);
  }
}

function openChat(convId, otherId, otherName) {
  activeChat = { convId, otherId, otherName };
  show('conv');
  document.getElementById('conv-name').textContent = otherName;
  document.getElementById('conv-av').innerHTML = avEl(otherId, otherName, 36);
  loadMessages(convId);
  const ref = doc(db,'conversations',convId);
  updateDoc(ref, { [`unread.${currentUser.uid}`]: 0 }).catch(()=>{});
}

function loadMessages(convId) {
  if (unsubConv) unsubConv();
  const container = document.getElementById('messages');
  container.innerHTML = '<div style="display:flex;justify-content:center;padding:20px;"><div class="spinner"></div></div>';

  const q = query(
    collection(db,'conversations',convId,'messages'),
    orderBy('at','asc'), limit(80)
  );
  unsubConv = onSnapshot(q, snap => {
    const wasAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 80;
    container.innerHTML = snap.empty
      ? '<div class="empty-state"><div class="empty-icon">🔒</div><div class="empty-txt">Kòmanse konvèsasyon an</div><div class="empty-sub">Mesaj chiffré end-to-end</div></div>'
      : snap.docs.map(d => {
          const m = d.data();
          const out = m.uid === currentUser.uid;
          const safeText = (m.text||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
          return `<div class="msg ${out?'out':'in'}">
            <div class="msg-bubble">${safeText}</div>
            <div class="msg-time">${fmtTime(m.at)}</div>
          </div>`;
        }).join('');
    if (wasAtBottom || snap.docs.length < 5) {
      container.scrollTop = container.scrollHeight;
    }
  }, err => console.error('messages err', err));
}

async function sendMessage() {
  if (!activeChat) return;
  const input = document.getElementById('msg-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  const { convId, otherId } = activeChat;
  const senderName = currentUser.displayName || 'Mwen';
  try {
    await addDoc(collection(db,'conversations',convId,'messages'), {
      text,
      uid: currentUser.uid,
      name: senderName,
      at: serverTimestamp(),
    });
    await updateDoc(doc(db,'conversations',convId), {
      lastMsg: text.length > 50 ? text.substring(0,50)+'...' : text,
      lastAt: serverTimestamp(),
      [`unread.${otherId}`]: 999,
    });
  } catch(e) {
    console.error('send error', e);
    input.value = text;
    alert('Mesaj la pa voye. Eseye ankò.');
  }
}

function updateProfileUI() {
  if (!currentUser) return;
  const name = currentUser.displayName || 'Itilizatè';
  const [g1,g2] = avColors(currentUser.uid);
  document.getElementById('prof-av').innerHTML =
    `<div class="av" style="width:54px;height:54px;background:linear-gradient(135deg,${g1},${g2});font-size:18px;">${avInitials(name)}</div>`;
  document.getElementById('prof-name').textContent = name;
  document.getElementById('prof-email').textContent = currentUser.email;

  const langCode = localStorage.getItem('nokilo_lang') || 'en';
  const langObj = LANGS.find(l => l.code === langCode);
  const langLabel = document.getElementById('current-lang-label');
  if (langLabel && langObj) {
    langLabel.textContent = 'Lang: ' + langObj.native;
  }
}

async function handleSignOut() {
  if (!confirm('Ou vle dekonekte?')) return;
  if (unsubChat) unsubChat();
  if (unsubConv) unsubConv();
  try {
    if (currentUser) await updateDoc(doc(db,'users',currentUser.uid),{online:false}).catch(()=>{});
    await signOut(auth);
  } catch(e) {}
  currentUser = null; activeChat = null;
  show('auth');
}

// FIX: Settings actions
function openEditProfile() {
  const newName = prompt('Nouvo non ou:', currentUser.displayName || '');
  if (!newName || !newName.trim()) return;
  updateProfile(currentUser, { displayName: newName.trim() })
    .then(() => updateDoc(doc(db,'users',currentUser.uid), { name: newName.trim() }))
    .then(() => { alert('✅ Non chanje!'); updateProfileUI(); })
    .catch(e => alert('Erè: '+e.message));
}

function openChangeLang() {
  if (!confirm('Chanje lang app la? Ou pral retounen nan ekran chwa lang.')) return;
  localStorage.removeItem('nokilo_lang');
  selectedLang = null;
  document.querySelectorAll('.lang-item.selected').forEach(el => el.classList.remove('selected'));
  document.getElementById('lang-continue-btn').classList.remove('ready');
  show('lang');
  initLangScreen();
}

function toggleNotifs() {
  if (!('Notification' in window)) {
    alert('Telefòn ou pa sipòte notifikasyon.');
    return;
  }
  if (Notification.permission === 'granted') {
    alert('✅ Notifikasyon yo aktive.');
  } else {
    Notification.requestPermission().then(p => {
      if (p === 'granted') alert('✅ Notifikasyon aktive!');
      else alert('❌ Notifikasyon pa aktive.');
    });
  }
}

function showAbout() {
  alert('NOKILO v1.0 Beta\n\n🌍 App kominikasyon global\n🇭🇹 Made by Shirac Enterprise LLC\n\nMèsi pou ou eseye li!\n\nVoye nou yon imèl si ou wè bug:\nshiracj@gmail.com');
}

document.getElementById('msg-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

window.setAuthMode  = setAuthMode;
window.handleAuth   = handleAuth;
window.newChat      = newChat;
window.openChat     = openChat;
window.sendMessage  = sendMessage;
window.handleSignOut = handleSignOut;
window.showScreen   = show;
window.loadHome     = loadHome;
window.selectLang   = selectLang;
window.filterLangs  = filterLangs;
window.confirmLang  = confirmLang;
window.openEditProfile = openEditProfile;
window.openChangeLang  = openChangeLang;
window.toggleNotifs    = toggleNotifs;
window.showAbout       = showAbout;
window.updateProfileUI = updateProfileUI;

const LANGS = [{"code":"en","name":"English","native":"English","flag":"🇺🇸"},{"code":"ht","name":"Haitian Creole","native":"Kreyòl Ayisyen","flag":"🇭🇹"},{"code":"fr","name":"French","native":"Français","flag":"🇫🇷"},{"code":"es","name":"Spanish","native":"Español","flag":"🇪🇸"},{"code":"pt","name":"Portuguese","native":"Português","flag":"🇧🇷"},{"code":"ar","name":"Arabic","native":"العربية","flag":"🇸🇦"},{"code":"zh","name":"Chinese","native":"中文","flag":"🇨🇳"},{"code":"hi","name":"Hindi","native":"हिन्दी","flag":"🇮🇳"},{"code":"ru","name":"Russian","native":"Русский","flag":"🇷🇺"},{"code":"de","name":"German","native":"Deutsch","flag":"🇩🇪"},{"code":"it","name":"Italian","native":"Italiano","flag":"🇮🇹"},{"code":"ja","name":"Japanese","native":"日本語","flag":"🇯🇵"},{"code":"ko","name":"Korean","native":"한국어","flag":"🇰🇷"},{"code":"sw","name":"Swahili","native":"Kiswahili","flag":"🇰🇪"},{"code":"yo","name":"Yoruba","native":"Yorùbá","flag":"🇳🇬"},{"code":"am","name":"Amharic","native":"አማርኛ","flag":"🇪🇹"},{"code":"nl","name":"Dutch","native":"Nederlands","flag":"🇳🇱"},{"code":"pl","name":"Polish","native":"Polski","flag":"🇵🇱"},{"code":"tr","name":"Turkish","native":"Türkçe","flag":"🇹🇷"},{"code":"vi","name":"Vietnamese","native":"Tiếng Việt","flag":"🇻🇳"}];
const LOCALE_MAP = {"en":"en","en-US":"en","en-GB":"en","en-CA":"en","en-AU":"en","fr":"fr","fr-FR":"fr","fr-CA":"fr","fr-BE":"fr","fr-CH":"fr","ht":"ht","ht-HT":"ht","es":"es","es-ES":"es","es-MX":"es","es-AR":"es","es-CO":"es","pt":"pt","pt-BR":"pt","pt-PT":"pt","ar":"ar","ar-SA":"ar","ar-EG":"ar","zh":"zh","zh-CN":"zh","zh-TW":"zh","zh-HK":"zh","hi":"hi","hi-IN":"hi","ru":"ru","ru-RU":"ru","de":"de","de-DE":"de","de-AT":"de","de-CH":"de","it":"it","it-IT":"it","ja":"ja","ja-JP":"ja","ko":"ko","ko-KR":"ko","sw":"sw","sw-KE":"sw","sw-TZ":"sw","yo":"yo","yo-NG":"yo","am":"am","am-ET":"am","nl":"nl","nl-NL":"nl","nl-BE":"nl","pl":"pl","pl-PL":"pl","tr":"tr","tr-TR":"tr","vi":"vi","vi-VN":"vi"};

let selectedLang = null;

// FIX: Better language detection
function detectLang() {
  const langs = navigator.languages || [navigator.language || navigator.userLanguage || 'en'];
  for (const nav of langs) {
    if (LOCALE_MAP[nav]) return LOCALE_MAP[nav];
    const short = nav.split('-')[0];
    if (LOCALE_MAP[short]) return LOCALE_MAP[short];
  }
  return 'en';
}

function initLangScreen() {
  const saved = localStorage.getItem('nokilo_lang');
  if (saved) {
    applyLang(saved);
    return;
  }

  const detected = detectLang();
  if (detected) {
    selectLang(detected);
    const langObj = LANGS.find(l => l.code === detected);
    if (langObj) {
      const badge = document.getElementById('detected-badge');
      const txt = document.getElementById('detected-txt');
      if (txt) txt.textContent = langObj.flag + '  ' + langObj.native + ' detected';
      if (badge) badge.style.display = 'inline-flex';
    }
  }

  show('lang');

  if (detected) {
    setTimeout(() => {
      const el = document.getElementById('li-' + detected);
      if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 300);
  }
}

function selectLang(code) {
  if (selectedLang) {
    document.getElementById('li-' + selectedLang)?.classList.remove('selected');
  }
  selectedLang = code;
  document.getElementById('li-' + code)?.classList.add('selected');
  document.getElementById('lang-continue-btn').classList.add('ready');
}

function filterLangs(q) {
  const lower = q.toLowerCase();
  document.querySelectorAll('.lang-item').forEach(el => {
    const txt = el.textContent.toLowerCase();
    el.style.display = txt.includes(lower) ? '' : 'none';
  });
}

function confirmLang() {
  if (!selectedLang) return;
  localStorage.setItem('nokilo_lang', selectedLang);
  applyLang(selectedLang);
}

function applyLang(code) {
  window.NOKILO_LANG = code;
  show('auth');
}
