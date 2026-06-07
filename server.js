const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e8 });

const JWT_SECRET = 'chatly-secret-key-2024-super-secure';
const DATA_FILE = path.join(__dirname, 'data.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ========== DATA ==========
let db = { users: {}, messages: {}, proRequests: [], groups: {} };

function loadDB() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      if (!db.groups) db.groups = {};
      if (!db.proRequests) db.proRequests = [];
      console.log('📂 Database loaded');
    }
  } catch (e) { console.log('⚠️ New database'); }
}
function saveDB() {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
  } catch (e) { console.error('Save error:', e.message); }
}
setInterval(saveDB, 10000);

// ========== MULTER ==========
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 * 1024 } });

// ========== MIDDLEWARE ==========
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

function auth(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { return res.status(403).json({ error: 'Invalid token' }); }
}

function sanitizeUser(u) {
  if (!u) return null;
  return { id: u.id, username: u.username, displayName: u.displayName, avatar: u.avatar,
    bio: u.bio, status: u.status, isPro: u.isPro, proExpiry: u.proExpiry,
    theme: u.theme, customColor: u.customColor, font: u.font, lastSeen: u.lastSeen, createdAt: u.createdAt };
}

// ========== AUTH ==========
app.post('/api/register', (req, res) => {
  const { username, password, displayName } = req.body;
  if (!username || !password || !displayName) return res.status(400).json({ error: 'All fields required' });
  if (username.length < 3) return res.status(400).json({ error: 'Username min 3 chars' });
  if (password.length < 4) return res.status(400).json({ error: 'Password min 4 chars' });
  if (db.users[username.toLowerCase()]) return res.status(400).json({ error: 'Username taken' });
  const hashedPassword = bcrypt.hashSync(password, 10);
  db.users[username.toLowerCase()] = {
    id: uuidv4(), username: username.toLowerCase(), displayName, password: hashedPassword,
    avatar: null, bio: '', status: 'online', isPro: false, proExpiry: null,
    theme: 'default', customColor: null, font: 'default',
    createdAt: new Date().toISOString(), lastSeen: new Date().toISOString()
  };
  saveDB();
  const token = jwt.sign({ username: username.toLowerCase() }, JWT_SECRET);
  res.json({ token, user: sanitizeUser(db.users[username.toLowerCase()]) });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.users[username.toLowerCase()];
  if (!user || !bcrypt.compareSync(password, user.password)) return res.status(400).json({ error: 'Invalid credentials' });
  user.status = 'online'; user.lastSeen = new Date().toISOString(); saveDB();
  const token = jwt.sign({ username: user.username }, JWT_SECRET);
  res.json({ token, user: sanitizeUser(user) });
});

// ========== USERS ==========
app.get('/api/users', auth, (req, res) => {
  res.json(Object.values(db.users).filter(u => u.username !== req.user.username).map(sanitizeUser));
});
app.get('/api/me', auth, (req, res) => {
  const u = db.users[req.user.username];
  if (!u) return res.status(404).json({ error: 'Not found' });
  res.json(sanitizeUser(u));
});
app.put('/api/profile', auth, (req, res) => {
  const u = db.users[req.user.username]; if (!u) return res.status(404).json({ error: 'Not found' });
  const { displayName, bio, avatar, theme, customColor, font } = req.body;
  if (displayName) u.displayName = displayName;
  if (bio !== undefined) u.bio = bio;
  if (avatar !== undefined) u.avatar = avatar;
  if (theme && u.isPro) u.theme = theme;
  if (customColor && u.isPro) u.customColor = customColor;
  if (font && u.isPro) u.font = font;
  saveDB(); res.json(sanitizeUser(u));
});
app.post('/api/request-pro', auth, (req, res) => {
  const u = db.users[req.user.username];
  if (u.isPro) return res.status(400).json({ error: 'Already PRO' });
  if (db.proRequests.find(r => r.username === u.username && r.status === 'pending'))
    return res.status(400).json({ error: 'Request already pending' });
  db.proRequests.push({ id: uuidv4(), username: u.username, displayName: u.displayName, requestedAt: new Date().toISOString(), status: 'pending' });
  saveDB();
  console.log(`\n💎 NEW PRO REQUEST: @${u.username} (${u.displayName}) → type: pro ${u.username}\n`);
  res.json({ message: 'PRO request sent' });
});

// ========== DM MESSAGES ==========
function getChatId(a, b) { return [a, b].sort().join('::'); }

app.get('/api/messages/:username', auth, (req, res) => {
  res.json(db.messages[getChatId(req.user.username, req.params.username)] || []);
});

app.post('/api/messages/:username', auth, (req, res) => {
  const { text, type = 'text', fileInfo } = req.body;
  const to = req.params.username;
  if (!db.users[to]) return res.status(404).json({ error: 'User not found' });
  const chatId = getChatId(req.user.username, to);
  if (!db.messages[chatId]) db.messages[chatId] = [];
  const msg = { id: uuidv4(), from: req.user.username, to, text: text || '', type, fileInfo: fileInfo || null,
    time: new Date().toISOString(), read: false, reactions: [], pinned: false };
  db.messages[chatId].push(msg);
  if (db.messages[chatId].length > 500) db.messages[chatId] = db.messages[chatId].slice(-500);
  saveDB(); res.json(msg);
});

app.put('/api/messages/:username/read', auth, (req, res) => {
  const chatId = getChatId(req.user.username, req.params.username);
  (db.messages[chatId] || []).forEach(m => { if (m.to === req.user.username && !m.read) m.read = true; });
  saveDB(); res.json({ success: true });
});

app.put('/api/messages/:chatUser/react/:msgId', auth, (req, res) => {
  const u = db.users[req.user.username]; if (!u?.isPro) return res.status(403).json({ error: 'PRO only' });
  const chatId = getChatId(req.user.username, req.params.chatUser);
  const msg = (db.messages[chatId] || []).find(m => m.id === req.params.msgId);
  if (!msg) return res.status(404).json({ error: 'Not found' });
  if (!msg.reactions) msg.reactions = [];
  const idx = msg.reactions.findIndex(r => r.user === req.user.username);
  if (idx >= 0) msg.reactions[idx].emoji = req.body.emoji;
  else msg.reactions.push({ user: req.user.username, emoji: req.body.emoji });
  saveDB(); res.json(msg);
});

app.put('/api/messages/:chatUser/pin/:msgId', auth, (req, res) => {
  const u = db.users[req.user.username]; if (!u?.isPro) return res.status(403).json({ error: 'PRO only' });
  const chatId = getChatId(req.user.username, req.params.chatUser);
  const msg = (db.messages[chatId] || []).find(m => m.id === req.params.msgId);
  if (!msg) return res.status(404).json({ error: 'Not found' });
  msg.pinned = !msg.pinned; saveDB(); res.json(msg);
});

// ========== FILE UPLOAD ==========
app.post('/api/upload', auth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const user = db.users[req.user.username];
  const maxSize = user?.isPro ? 5 * 1024 * 1024 * 1024 : 500 * 1024 * 1024;
  if (req.file.size > maxSize) {
    fs.unlinkSync(req.file.path);
    return res.status(413).json({ error: user?.isPro ? 'Max 5GB for PRO' : 'Max 500MB, upgrade to PRO for more' });
  }
  const isVoice = req.body.isVoice === 'true';
  const fileInfo = {
    id: uuidv4(), originalName: req.file.originalname, filename: req.file.filename,
    size: req.file.size, mimetype: req.file.mimetype, url: `/uploads/${req.file.filename}`,
    isVoice, duration: req.body.duration ? parseFloat(req.body.duration) : 0,
    uploadedBy: req.user.username, uploadedAt: new Date().toISOString()
  };
  saveDB();
  res.json(fileInfo);
});

// ========== GROUPS & CHANNELS ==========
app.post('/api/groups', auth, (req, res) => {
  const { name, description, type, avatar } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const groupId = uuidv4();
  const defaultRanks = {
    owner:     { name: 'Владелец',   color: '#FFD700', icon: '👑', permissions: ['all'] },
    admin:     { name: 'Админ',      color: '#FF4757', icon: '🛡️', permissions: ['kick','delete_messages','pin','manage_members'] },
    moderator: { name: 'Модератор',  color: '#3742FA', icon: '⚡', permissions: ['delete_messages','pin'] },
    vip:       { name: 'VIP',        color: '#A55EEA', icon: '⭐', permissions: ['send_messages','pin'] },
    member:    { name: 'Участник',   color: '#778CA3', icon: '',    permissions: ['send_messages'] }
  };
  db.groups[groupId] = {
    id: groupId, name, description: description || '', type: type || 'group',
    avatar: avatar || '💬', owner: req.user.username,
    members: [{ username: req.user.username, rank: 'owner', joinedAt: new Date().toISOString() }],
    ranks: defaultRanks, customRanks: [],
    messages: [], createdAt: new Date().toISOString()
  };
  saveDB(); res.json(db.groups[groupId]);
});

app.get('/api/groups', auth, (req, res) => {
  const groups = Object.values(db.groups).filter(g =>
    g.members.some(m => m.username === req.user.username)
  );
  res.json(groups);
});

app.get('/api/groups/:id', auth, (req, res) => {
  const g = db.groups[req.params.id];
  if (!g) return res.status(404).json({ error: 'Not found' });
  if (!g.members.some(m => m.username === req.user.username))
    return res.status(403).json({ error: 'Not a member' });
  // Resolve member info
  const resolvedMembers = g.members.map(m => {
    const u = db.users[m.username];
    return { ...m, displayName: u?.displayName || m.username, avatar: u?.avatar || '😎', isPro: u?.isPro || false };
  });
  res.json({ ...g, resolvedMembers });
});

app.put('/api/groups/:id', auth, (req, res) => {
  const g = db.groups[req.params.id];
  if (!g) return res.status(404).json({ error: 'Not found' });
  if (g.owner !== req.user.username) return res.status(403).json({ error: 'Owner only' });
  const { name, description, avatar, ranks } = req.body;
  if (name) g.name = name;
  if (description !== undefined) g.description = description;
  if (avatar) g.avatar = avatar;
  if (ranks) g.ranks = ranks;
  saveDB(); res.json(g);
});

app.post('/api/groups/:id/members', auth, (req, res) => {
  const g = db.groups[req.params.id];
  if (!g) return res.status(404).json({ error: 'Not found' });
  const { username } = req.body;
  if (!db.users[username]) return res.status(404).json({ error: 'User not found' });
  if (g.members.some(m => m.username === username)) return res.status(400).json({ error: 'Already member' });
  // Check permission
  const member = g.members.find(m => m.username === req.user.username);
  if (!member) return res.status(403).json({ error: 'Not a member' });
  const rankPerms = g.ranks[member.rank]?.permissions || [];
  if (g.owner !== req.user.username && !rankPerms.includes('manage_members') && !rankPerms.includes('all'))
    return res.status(403).json({ error: 'No permission' });
  g.members.push({ username, rank: 'member', joinedAt: new Date().toISOString() });
  saveDB(); res.json(g);

  // Notify via socket
  const socketId = onlineUsers.get(username);
  if (socketId) io.to(socketId).emit('group:added', g.id);
});

app.delete('/api/groups/:id/members/:username', auth, (req, res) => {
  const g = db.groups[req.params.id];
  if (!g) return res.status(404).json({ error: 'Not found' });
  if (g.owner === req.params.username) return res.status(400).json({ error: 'Cannot remove owner' });
  const member = g.members.find(m => m.username === req.user.username);
  if (!member) return res.status(403).json({ error: 'Not a member' });
  const rankPerms = g.ranks[member.rank]?.permissions || [];
  if (g.owner !== req.user.username && !rankPerms.includes('kick') && !rankPerms.includes('all'))
    return res.status(403).json({ error: 'No permission' });
  // Allow self-leave
  if (req.params.username !== req.user.username && g.owner !== req.user.username && !rankPerms.includes('kick'))
    return res.status(403).json({ error: 'No permission' });

  g.members = g.members.filter(m => m.username !== req.params.username);
  saveDB(); res.json(g);

  const socketId = onlineUsers.get(req.params.username);
  if (socketId) io.to(socketId).emit('group:removed', g.id);
});

app.put('/api/groups/:id/rank', auth, (req, res) => {
  const g = db.groups[req.params.id];
  if (!g) return res.status(404).json({ error: 'Not found' });
  if (g.owner !== req.user.username) return res.status(403).json({ error: 'Owner only' });
  const { username, rank } = req.body;
  const member = g.members.find(m => m.username === username);
  if (!member) return res.status(404).json({ error: 'Member not found' });
  if (username === req.user.username) return res.status(400).json({ error: 'Cannot change own rank' });
  member.rank = rank; saveDB(); res.json(g);
});

// Group messages
app.get('/api/groups/:id/messages', auth, (req, res) => {
  const g = db.groups[req.params.id];
  if (!g) return res.status(404).json({ error: 'Not found' });
  if (!g.members.some(m => m.username === req.user.username))
    return res.status(403).json({ error: 'Not a member' });
  res.json(g.messages || []);
});

app.post('/api/groups/:id/messages', auth, (req, res) => {
  const g = db.groups[req.params.id];
  if (!g) return res.status(404).json({ error: 'Not found' });
  const member = g.members.find(m => m.username === req.user.username);
  if (!member) return res.status(403).json({ error: 'Not a member' });
  const rankPerms = g.ranks[member.rank]?.permissions || [];
  if (!rankPerms.includes('send_messages') && !rankPerms.includes('all'))
    return res.status(403).json({ error: 'No permission to send' });
  const { text, type = 'text', fileInfo } = req.body;
  const msg = { id: uuidv4(), from: req.user.username, text: text || '', type, fileInfo: fileInfo || null,
    time: new Date().toISOString(), reactions: [], pinned: false, rank: member.rank };
  if (!g.messages) g.messages = [];
  g.messages.push(msg);
  if (g.messages.length > 1000) g.messages = g.messages.slice(-1000);
  saveDB(); res.json(msg);
});

// ========== SOCKET.IO ==========
const onlineUsers = new Map();

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('No token'));
  try { socket.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { next(new Error('Invalid token')); }
});

io.on('connection', (socket) => {
  const username = socket.user.username;
  onlineUsers.set(username, socket.id);
  if (db.users[username]) { db.users[username].status = 'online'; db.users[username].lastSeen = new Date().toISOString(); }
  io.emit('user:status', { username, status: 'online' });
  console.log(`✅ @${username} connected (${onlineUsers.size} online)`);

  // DM messages
  socket.on('message:send', (data) => {
    const { to, text, type = 'text', fileInfo } = data;
    if (!to) return;
    const chatId = getChatId(username, to);
    if (!db.messages[chatId]) db.messages[chatId] = [];
    const msg = { id: uuidv4(), from: username, to, text: text || '', type, fileInfo: fileInfo || null,
      time: new Date().toISOString(), read: false, reactions: [], pinned: false };
    db.messages[chatId].push(msg);
    if (db.messages[chatId].length > 500) db.messages[chatId] = db.messages[chatId].slice(-500);
    const rs = onlineUsers.get(to);
    if (rs) io.to(rs).emit('message:new', msg);
    socket.emit('message:sent', msg);
    if (rs) io.to(rs).emit('user:typing', { from: username, typing: false });
  });

  socket.on('message:read', (data) => {
    const chatId = getChatId(username, data.chatUser);
    let changed = false;
    (db.messages[chatId] || []).forEach(m => { if (m.to === username && !m.read) { m.read = true; changed = true; } });
    if (changed) {
      const os = onlineUsers.get(data.chatUser);
      if (os) io.to(os).emit('message:readUpdate', { chatUser: username });
    }
  });

  socket.on('message:react', (data) => {
    if (!db.users[username]?.isPro) return;
    const chatId = getChatId(username, data.to);
    const msg = (db.messages[chatId] || []).find(m => m.id === data.msgId);
    if (!msg) return;
    if (!msg.reactions) msg.reactions = [];
    const idx = msg.reactions.findIndex(r => r.user === username);
    if (idx >= 0) msg.reactions[idx].emoji = data.emoji;
    else msg.reactions.push({ user: username, emoji: data.emoji });
    const os = onlineUsers.get(data.to);
    if (os) io.to(os).emit('message:reaction', { chatId, msg });
    socket.emit('message:reaction', { chatId, msg });
  });

  socket.on('message:pin', (data) => {
    if (!db.users[username]?.isPro) return;
    const chatId = getChatId(username, data.to);
    const msg = (db.messages[chatId] || []).find(m => m.id === data.msgId);
    if (!msg) return;
    msg.pinned = !msg.pinned;
    const os = onlineUsers.get(data.to);
    if (os) io.to(os).emit('message:pinUpdate', { chatId, msg });
    socket.emit('message:pinUpdate', { chatId, msg });
  });

  socket.on('user:typing', (data) => {
    const rs = onlineUsers.get(data.to);
    if (rs) io.to(rs).emit('user:typing', { from: username, typing: data.typing });
  });

  // Group messages
  socket.on('group:message', (data) => {
    const g = db.groups[data.groupId];
    if (!g) return;
    const member = g.members.find(m => m.username === username);
    if (!member) return;
    const rankPerms = g.ranks[member.rank]?.permissions || [];
    if (!rankPerms.includes('send_messages') && !rankPerms.includes('all')) return;
    const msg = { id: uuidv4(), from: username, text: data.text || '', type: data.type || 'text',
      fileInfo: data.fileInfo || null, time: new Date().toISOString(), reactions: [], pinned: false, rank: member.rank };
    if (!g.messages) g.messages = [];
    g.messages.push(msg);
    if (g.messages.length > 1000) g.messages = g.messages.slice(-1000);
    g.members.forEach(m => {
      if (m.username === username) { socket.emit('group:messageSent', { groupId: g.id, msg }); }
      else { const ms = onlineUsers.get(m.username); if (ms) io.to(ms).emit('group:newMessage', { groupId: g.id, msg }); }
    });
  });

  socket.on('group:typing', (data) => {
    const g = db.groups[data.groupId];
    if (!g) return;
    g.members.forEach(m => {
      if (m.username !== username) {
        const ms = onlineUsers.get(m.username);
        if (ms) io.to(ms).emit('group:typing', { groupId: g.id, from: username, typing: data.typing });
      }
    });
  });

  // WebRTC Calls
  socket.on('call:offer', (data) => {
    const rs = onlineUsers.get(data.to);
    if (!rs) return socket.emit('call:unavailable', { to: data.to });
    const caller = db.users[username];
    io.to(rs).emit('call:incoming', {
      from: username, displayName: caller?.displayName || username,
      avatar: caller?.avatar || '😎', isPro: caller?.isPro || false,
      offer: data.offer, callType: data.callType, quality: data.quality
    });
  });

  socket.on('call:answer', (data) => {
    const rs = onlineUsers.get(data.to);
    if (rs) io.to(rs).emit('call:answered', { from: username, answer: data.answer });
  });

  socket.on('call:ice-candidate', (data) => {
    const rs = onlineUsers.get(data.to);
    if (rs) io.to(rs).emit('call:ice-candidate', { from: username, candidate: data.candidate });
  });

  socket.on('call:hangup', (data) => {
    const rs = onlineUsers.get(data.to);
    if (rs) io.to(rs).emit('call:ended', { from: username });
  });

  socket.on('call:reject', (data) => {
    const rs = onlineUsers.get(data.to);
    if (rs) io.to(rs).emit('call:rejected', { from: username });
  });

  socket.on('disconnect', () => {
    onlineUsers.delete(username);
    if (db.users[username]) { db.users[username].status = 'offline'; db.users[username].lastSeen = new Date().toISOString(); }
    io.emit('user:status', { username, status: 'offline' });
    console.log(`❌ @${username} disconnected (${onlineUsers.size} online)`);
    saveDB();
  });
});

// ========== ADMIN CONSOLE (local only) ==========
loadDB(); // ← LOAD DATABASE FIRST!
const IS_PRODUCTION = !process.stdin.isTTY;

function showHelp() {
  console.log('\n📡 Chatly Admin Console:');
  console.log('  pro <username>         - Grant PRO');
  console.log('  remove-pro <username>  - Remove PRO');
  console.log('  list                   - List users');
  console.log('  requests               - PRO requests');
  console.log('  online                 - Online users');
  console.log('  help                   - This help\n');
}

function startWithoutConsole() {
  const P = process.env.PORT || 3000;
  server.listen(P, '0.0.0.0', () => {
    console.log('\n  ╔═══════════════════════════════════════╗');
    console.log('  ║     💬 CHATLY MESSENGER v2.0 💬       ║');
    console.log('  ║     Production Mode                   ║');
    console.log(`  ║  Port: ${P}                             ║`);
    console.log(`  ║  Users: ${Object.keys(db.users).length}  Groups: ${Object.keys(db.groups).length}         ║`);
    console.log('  ╚═══════════════════════════════════════╝\n');
  });
}

if (!IS_PRODUCTION) {
  try {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.on('line', (cmd) => {
      const parts = cmd.trim().split(/\s+/);
      const command = parts[0]?.toLowerCase();
      switch (command) {
        case 'pro': {
          const target = parts[1]?.toLowerCase();
          if (!target || !db.users[target]) { console.log('❌ User not found'); break; }
          db.users[target].isPro = true; db.users[target].proExpiry = 'lifetime';
          db.proRequests.forEach(r => { if (r.username === target && r.status === 'pending') r.status = 'approved'; });
          saveDB();
          const sid = onlineUsers.get(target);
          if (sid) io.to(sid).emit('pro:granted', sanitizeUser(db.users[target]));
          console.log(`💎 PRO granted to @${target}`); break;
        }
        case 'remove-pro': {
          const target = parts[1]?.toLowerCase();
          if (!target || !db.users[target]) { console.log('❌ User not found'); break; }
          db.users[target].isPro = false; db.users[target].proExpiry = null;
          db.users[target].theme = 'default'; db.users[target].font = 'default';
          saveDB();
          const sid = onlineUsers.get(target);
          if (sid) io.to(sid).emit('pro:removed', sanitizeUser(db.users[target]));
          console.log(`🔻 PRO removed from @${target}`); break;
        }
        case 'list': {
          console.log('\n👥 Users:');
          Object.values(db.users).forEach(u => {
            const pro = u.isPro ? ' 💎' : '';
            const on = onlineUsers.has(u.username) ? ' 🟢' : ' ⚫';
            console.log(`  ${on} @${u.username} (${u.displayName})${pro}`);
          });
          console.log(`\n📂 Groups: ${Object.keys(db.groups).length}`); break;
        }
        case 'requests': {
          const pending = db.proRequests.filter(r => r.status === 'pending');
          if (!pending.length) console.log('📭 No pending requests');
          else { console.log('\n📬 Pending:'); pending.forEach(r => console.log(`  @${r.username} (${r.displayName})`)); }
          break;
        }
        case 'online': {
          console.log(`\n🟢 Online: ${onlineUsers.size}`);
          onlineUsers.forEach((_, u) => console.log(`  @${u}`)); break;
        }
        case 'help': showHelp(); break;
        default: if (cmd.trim()) console.log('❓ Unknown. Type "help"');
      }
      rl.prompt();
    });
    rl.on('close', () => { saveDB(); process.exit(0); });

    const P = process.env.PORT || 3000;
    server.listen(P, '0.0.0.0', () => {
      console.log('\n  ╔═══════════════════════════════════════╗');
      console.log('  ║     💬 CHATLY MESSENGER v2.0 💬       ║');
      console.log(`  ║  http://localhost:${P}                  ║`);
      console.log(`  ║  Users: ${Object.keys(db.users).length}  Groups: ${Object.keys(db.groups).length}         ║`);
      console.log('  ╚═══════════════════════════════════════╝\n');
      rl.prompt();
    });
  } catch (e) {
    console.log('⚠️ Console admin not available');
    startWithoutConsole();
  }
} else {
  // PRODUCTION: admin via HTTP
  const ADMIN_SECRET = process.env.ADMIN_SECRET || 'chatly-admin-2024';

  app.post('/admin/' + ADMIN_SECRET + '/pro/:username', (req, res) => {
    const target = req.params.username.toLowerCase();
    if (!db.users[target]) return res.status(404).json({ error: 'User not found' });
    db.users[target].isPro = true; db.users[target].proExpiry = 'lifetime';
    db.proRequests.forEach(r => { if (r.username === target && r.status === 'pending') r.status = 'approved'; });
    saveDB();
    const sid = onlineUsers.get(target);
    if (sid) io.to(sid).emit('pro:granted', sanitizeUser(db.users[target]));
    res.json({ success: true, message: 'PRO granted to @' + target });
  });

  app.post('/admin/' + ADMIN_SECRET + '/remove-pro/:username', (req, res) => {
    const target = req.params.username.toLowerCase();
    if (!db.users[target]) return res.status(404).json({ error: 'User not found' });
    db.users[target].isPro = false; db.users[target].proExpiry = null;
    db.users[target].theme = 'default'; db.users[target].font = 'default';
    saveDB();
    const sid = onlineUsers.get(target);
    if (sid) io.to(sid).emit('pro:removed', sanitizeUser(db.users[target]));
    res.json({ success: true, message: 'PRO removed from @' + target });
  });

  app.get('/admin/' + ADMIN_SECRET + '/list', (req, res) => {
    const users = Object.values(db.users).map(u => ({
      username: u.username, displayName: u.displayName, isPro: u.isPro,
      online: onlineUsers.has(u.username)
    }));
    res.json({ users, groups: Object.keys(db.groups).length, online: onlineUsers.size });
  });

  app.get('/admin/' + ADMIN_SECRET + '/requests', (req, res) => {
    res.json(db.proRequests.filter(r => r.status === 'pending'));
  });

  startWithoutConsole();
}
