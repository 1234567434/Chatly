// ============================================================================
//  CHATLY MESSENGER v3.0 — FULL SERVER
//  Express + Socket.IO + JWT Auth + SQLite-like JSON Storage
//  Deploy-ready for Render.com (no readline, no process.exit, binds 0.0.0.0)
// ============================================================================

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

// ============================================================================
//  INITIALIZATION
// ============================================================================
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 1e8,            // 100MB max for file transfers
  pingTimeout: 60000,                // 60s before disconnect
  pingInterval: 25000,               // ping every 25s
  cors: { origin: '*' }              // allow all origins for development
});

// ============================================================================
//  CONFIGURATION
// ============================================================================
const JWT_SECRET = 'chatly-secret-key-2024-super-secure';
const DATA_FILE = path.join(__dirname, 'data.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'chatly-admin-2024';
const MAX_MESSAGES_DM = 500;         // max messages per DM chat
const MAX_MESSAGES_GROUP = 1000;     // max messages per group
const MAX_FILE_SIZE_FREE = 500 * 1024 * 1024;  // 500MB
const MAX_FILE_SIZE_PRO = 5 * 1024 * 1024 * 1024; // 5GB
const SAVE_INTERVAL = 10000;         // save DB every 10s
const RATE_LIMIT_WINDOW = 5000;      // 5 seconds between messages
const MAX_LOGIN_ATTEMPTS = 5;        // max failed login attempts
const LOGIN_BAN_TIME = 300000;       // 5 min ban after too many attempts

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// ============================================================================
//  DATABASE
// ============================================================================
let db = {
  users: {},          // username -> user object
  messages: {},       // chatId -> array of messages
  groups: {},         // groupId -> group object
  proRequests: [],    // array of PRO requests
  blockedUsers: {},   // username -> array of blocked usernames
  bannedUsers: [],    // array of banned usernames
  activityLog: [],    // array of activity entries
  reports: []         // array of user reports
};

/**
 * Load database from JSON file
 */
function loadDB() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      db = JSON.parse(raw);
      // Ensure all fields exist (migration support)
      if (!db.groups) db.groups = {};
      if (!db.proRequests) db.proRequests = [];
      if (!db.blockedUsers) db.blockedUsers = {};
      if (!db.bannedUsers) db.bannedUsers = [];
      if (!db.activityLog) db.activityLog = [];
      if (!db.reports) db.reports = [];
      // Ensure all users have required fields
      Object.keys(db.users).forEach(function(un) {
        if (!db.users[un].createdAt) db.users[un].createdAt = new Date().toISOString();
        if (!db.users[un].lastSeen) db.users[un].lastSeen = new Date().toISOString();
        if (db.users[un].isPro === undefined) db.users[un].isPro = false;
        if (!db.users[un].theme) db.users[un].theme = 'default';
        if (!db.users[un].font) db.users[un].font = 'default';
        if (!db.users[un].bio) db.users[un].bio = '';
        if (!db.users[un].status) db.users[un].status = 'offline';
        if (!db.blockedUsers[un]) db.blockedUsers[un] = [];
      });
      const userCount = Object.keys(db.users).length;
      const groupCount = Object.keys(db.groups).length;
      const msgCount = Object.keys(db.messages).length;
      console.log('📂 Database loaded');
      console.log('   Users: ' + userCount + '  Groups: ' + groupCount + '  Chats: ' + msgCount);
    } else {
      console.log('📂 No database found — creating new one');
    }
  } catch (e) {
    console.error('❌ Database load error:', e.message);
    console.log('📂 Starting with fresh database');
  }
}

/**
 * Save database to JSON file
 */
function saveDB() {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    // Write to temp file first, then rename (atomic write)
    const tmpFile = DATA_FILE + '.tmp';
    fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2));
    fs.renameSync(tmpFile, DATA_FILE);
  } catch (e) {
    console.error('❌ Save error:', e.message);
  }
}

// Auto-save periodically
setInterval(saveDB, SAVE_INTERVAL);

/**
 * Log activity for admin review
 */
function logActivity(type, username, details) {
  var entry = {
    id: uuidv4(),
    type: type,            // 'login', 'register', 'message', 'call', 'group_create', etc.
    username: username,
    details: details || '',
    timestamp: new Date().toISOString()
  };
  db.activityLog.push(entry);
  // Keep only last 500 entries
  if (db.activityLog.length > 500) {
    db.activityLog = db.activityLog.slice(-500);
  }
}

// ============================================================================
//  FILE UPLOAD (Multer)
// ============================================================================
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, UPLOADS_DIR);
  },
  filename: function(req, file, cb) {
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext).substring(0, 30);
    const uniqueName = Date.now() + '-' + uuidv4() + ext;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: MAX_FILE_SIZE_PRO },  // max possible size (check per-user later)
  fileFilter: function(req, file, cb) {
    // Block dangerous file types
    const blocked = ['.exe', '.bat', '.cmd', '.sh', '.ps1', '.vbs', '.js', '.html'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (blocked.includes(ext)) {
      return cb(new Error('File type not allowed'));
    }
    cb(null, true);
  }
});

// ============================================================================
//  MIDDLEWARE
// ============================================================================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

/**
 * JWT Authentication middleware
 */
function auth(req, res, next) {
  const token = req.headers['authorization'] ? req.headers['authorization'].split(' ')[1] : null;
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Check if user still exists
    if (!db.users[decoded.username]) {
      return res.status(403).json({ error: 'User account not found' });
    }
    // Check if user is banned
    if (db.bannedUsers.includes(decoded.username)) {
      return res.status(403).json({ error: 'Account is banned' });
    }
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Rate limiting middleware — prevents spam
 */
const rateLimiter = {};
function rateLimit(req, res, next) {
  const key = req.user ? req.user.username : req.ip;
  const now = Date.now();
  if (!rateLimiter[key]) rateLimiter[key] = [];
  // Clean old entries
  rateLimiter[key] = rateLimiter[key].filter(function(t) { return now - t < RATE_LIMIT_WINDOW; });
  if (rateLimiter[key].length > 10) {
    return res.status(429).json({ error: 'Too many requests, slow down' });
  }
  rateLimiter[key].push(now);
  next();
}

/**
 * Sanitize user object — remove sensitive fields
 */
function sanitizeUser(u) {
  if (!u) return null;
  return {
    id: u.id || '',
    username: u.username || '',
    displayName: u.displayName || '',
    avatar: u.avatar || null,
    bio: u.bio || '',
    status: u.status || 'offline',
    isPro: u.isPro || false,
    proExpiry: u.proExpiry || null,
    theme: u.theme || 'default',
    customColor: u.customColor || null,
    font: u.font || 'default',
    lastSeen: u.lastSeen || null,
    createdAt: u.createdAt || null
  };
}

/**
 * Sanitize message object
 */
function sanitizeMessage(msg) {
  return {
    id: msg.id,
    from: msg.from,
    to: msg.to || null,
    text: msg.text || '',
    type: msg.type || 'text',
    fileInfo: msg.fileInfo || null,
    time: msg.time,
    read: msg.read || false,
    reactions: msg.reactions || [],
    pinned: msg.pinned || false,
    edited: msg.edited || false,
    deleted: msg.deleted || false,
    rank: msg.rank || null
  };
}

// ============================================================================
//  TRACKING
// ============================================================================
const onlineUsers = new Map();        // username -> socket.id
const loginAttempts = {};             // username -> { count, lastAttempt }
const typingUsers = {};               // chatId -> { username, timeout }

// ============================================================================
//  AUTH ROUTES
// ============================================================================

/**
 * POST /api/register
 * Register a new user account
 */
app.post('/api/register', function(req, res) {
  const { username, password, displayName } = req.body;

  // Validation
  if (!username || !password || !displayName) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  const un = username.toLowerCase().trim();
  const dn = displayName.trim();

  if (un.length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters' });
  }
  if (un.length > 20) {
    return res.status(400).json({ error: 'Username must be 20 characters or less' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' });
  }
  if (dn.length < 1) {
    return res.status(400).json({ error: 'Display name is required' });
  }
  if (dn.length > 30) {
    return res.status(400).json({ error: 'Display name must be 30 characters or less' });
  }

  // Check username format (alphanumeric + underscore)
  if (!/^[a-z0-9_]+$/.test(un)) {
    return res.status(400).json({ error: 'Username can only contain letters, numbers, and underscores' });
  }

  // Check if username taken (double check for race conditions)
  if (db.users[un] || db.users[un.toLowerCase()]) {
    return res.status(400).json({ error: 'Username is already taken' });
  }
  // Also check case-insensitive across ALL existing users
  var existingNames = Object.keys(db.users).map(function(k) { return k.toLowerCase(); });
  if (existingNames.indexOf(un.toLowerCase()) !== -1) {
    return res.status(400).json({ error: 'Username is already taken' });
  }

  // Check if banned
  if (db.bannedUsers.includes(un)) {
    return res.status(400).json({ error: 'This username is not available' });
  }

  // Create user
  const hashedPassword = bcrypt.hashSync(password, 10);
  db.users[un] = {
    id: uuidv4(),
    username: un,
    displayName: dn,
    password: hashedPassword,
    avatar: null,
    bio: '',
    status: 'online',
    isPro: false,
    proExpiry: null,
    theme: 'default',
    customColor: null,
    font: 'default',
    createdAt: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
    settings: {
      notifications: true,
      soundEnabled: true,
      showOnlineStatus: true,
      showLastSeen: true
    }
  };

  // Initialize blocked list
  db.blockedUsers[un] = [];

  saveDB();

  // Generate JWT token
  const token = jwt.sign({ username: un }, JWT_SECRET, { expiresIn: '30d' });

  logActivity('register', un, 'New account created');
  console.log('🆕 New user: @' + un + ' (' + dn + ')');

  res.json({
    token: token,
    user: sanitizeUser(db.users[un])
  });
});

/**
 * POST /api/login
 * Login to existing account
 */
app.post('/api/login', function(req, res) {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const un = username.toLowerCase().trim();
  const user = db.users[un];

  // Check if user exists
  if (!user) {
    return res.status(400).json({ error: 'Invalid username or password' });
  }

  // Check if banned
  if (db.bannedUsers.includes(un)) {
    return res.status(403).json({ error: 'This account has been banned' });
  }

  // Check login attempts (brute force protection)
  if (!loginAttempts[un]) loginAttempts[un] = { count: 0, lastAttempt: 0 };

  if (loginAttempts[un].count >= MAX_LOGIN_ATTEMPTS) {
    const timeSince = Date.now() - loginAttempts[un].lastAttempt;
    if (timeSince < LOGIN_BAN_TIME) {
      const remaining = Math.ceil((LOGIN_BAN_TIME - timeSince) / 1000);
      return res.status(429).json({
        error: 'Too many failed attempts. Try again in ' + remaining + ' seconds'
      });
    } else {
      // Reset after ban period
      loginAttempts[un].count = 0;
    }
  }

  // Verify password
  if (!bcrypt.compareSync(password, user.password)) {
    loginAttempts[un].count++;
    loginAttempts[un].lastAttempt = Date.now();
    return res.status(400).json({ error: 'Invalid username or password' });
  }

  // Reset login attempts on success
  loginAttempts[un].count = 0;

  // Update user status
  user.status = 'online';
  user.lastSeen = new Date().toISOString();
  saveDB();

  // Generate JWT token
  const token = jwt.sign({ username: un }, JWT_SECRET, { expiresIn: '30d' });

  logActivity('login', un, 'Logged in');
  console.log('🔑 Login: @' + un + ' (' + user.displayName + ')');

  res.json({
    token: token,
    user: sanitizeUser(user)
  });
});

// ============================================================================
//  USER ROUTES
// ============================================================================

/**
 * GET /api/users
 * Get all users except the current one
 */
app.get('/api/users', auth, function(req, res) {
  const currentUn = req.user.username;
  const blocked = db.blockedUsers[currentUn] || [];

  const users = Object.values(db.users)
    .filter(function(u) {
      return u.username !== currentUn && !blocked.includes(u.username);
    })
    .map(sanitizeUser);

  res.json(users);
});

/**
 * GET /api/me
 * Get current user info
 */
app.get('/api/me', auth, function(req, res) {
  const u = db.users[req.user.username];
  if (!u) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json(sanitizeUser(u));
});

/**
 * PUT /api/profile
 * Update current user profile
 */
app.put('/api/profile', auth, function(req, res) {
  const u = db.users[req.user.username];
  if (!u) {
    return res.status(404).json({ error: 'User not found' });
  }

  const { displayName, bio, avatar, theme, customColor, font } = req.body;

  // Update fields with validation
  if (displayName && displayName.trim().length > 0) {
    if (displayName.trim().length > 30) {
      return res.status(400).json({ error: 'Display name too long (max 30)' });
    }
    u.displayName = displayName.trim();
  }

  if (bio !== undefined) {
    if (bio.length > 200) {
      return res.status(400).json({ error: 'Bio too long (max 200)' });
    }
    u.bio = bio;
  }

  if (avatar !== undefined) {
    u.avatar = avatar;
  }

  // PRO-only features
  if (theme && u.isPro) {
    u.theme = theme;
  }

  if (customColor && u.isPro) {
    u.customColor = customColor;
  }

  if (font && u.isPro) {
    u.font = font;
  }

  // Notify other users about profile change
  io.emit('user:profileUpdate', sanitizeUser(u));

  saveDB();
  logActivity('profile_update', u.username, 'Updated profile');
  res.json(sanitizeUser(u));
});

/**
 * POST /api/request-pro
 * Request PRO status
 */
app.post('/api/request-pro', auth, function(req, res) {
  const u = db.users[req.user.username];

  if (u.isPro) {
    return res.status(400).json({ error: 'Already PRO' });
  }

  // Check if already has pending request
  const existing = db.proRequests.find(function(r) {
    return r.username === u.username && r.status === 'pending';
  });
  if (existing) {
    return res.status(400).json({ error: 'Request already pending' });
  }

  // Create request
  const request = {
    id: uuidv4(),
    username: u.username,
    displayName: u.displayName,
    requestedAt: new Date().toISOString(),
    status: 'pending'
  };

  db.proRequests.push(request);
  saveDB();

  logActivity('pro_request', u.username, 'Requested PRO');
  console.log('\n💎 NEW PRO REQUEST: @' + u.username + ' (' + u.displayName + ')');
  console.log('   → Admin command: POST /admin/' + ADMIN_SECRET + '/pro/' + u.username + '\n');

  res.json({ message: 'PRO request sent', request: request });
});

/**
 * GET /api/users/search?q=query
 * Search users by name or username
 */
app.get('/api/users/search', auth, function(req, res) {
  const query = (req.query.q || '').toLowerCase().trim();
  if (!query || query.length < 1) {
    return res.json([]);
  }

  const currentUn = req.user.username;
  const blocked = db.blockedUsers[currentUn] || [];

  const results = Object.values(db.users)
    .filter(function(u) {
      if (u.username === currentUn) return false;
      if (blocked.includes(u.username)) return false;
      return u.username.toLowerCase().includes(query) ||
             u.displayName.toLowerCase().includes(query);
    })
    .map(sanitizeUser)
    .slice(0, 20);

  res.json(results);
});

/**
 * POST /api/block/:username
 * Block a user
 */
app.post('/api/block/:username', auth, function(req, res) {
  const target = req.params.username.toLowerCase();
  const current = req.user.username;

  if (target === current) {
    return res.status(400).json({ error: 'Cannot block yourself' });
  }
  if (!db.users[target]) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (!db.blockedUsers[current]) db.blockedUsers[current] = [];
  if (!db.blockedUsers[current].includes(target)) {
    db.blockedUsers[current].push(target);
    saveDB();
  }

  logActivity('block', current, 'Blocked @' + target);
  res.json({ success: true, message: 'Blocked @' + target });
});

/**
 * POST /api/unblock/:username
 * Unblock a user
 */
app.post('/api/unblock/:username', auth, function(req, res) {
  const target = req.params.username.toLowerCase();
  const current = req.user.username;

  if (db.blockedUsers[current]) {
    db.blockedUsers[current] = db.blockedUsers[current].filter(function(u) { return u !== target; });
    saveDB();
  }

  logActivity('unblock', current, 'Unblocked @' + target);
  res.json({ success: true, message: 'Unblocked @' + target });
});

/**
 * GET /api/blocked
 * Get list of blocked users
 */
app.get('/api/blocked', auth, function(req, res) {
  const blocked = db.blockedUsers[req.user.username] || [];
  const users = blocked.map(function(un) {
    const u = db.users[un];
    return u ? sanitizeUser(u) : { username: un, displayName: un };
  });
  res.json(users);
});

/**
 * POST /api/report/:username
 * Report a user
 */
app.post('/api/report/:username', auth, function(req, res) {
  const target = req.params.username.toLowerCase();
  const reason = req.body.reason || 'No reason provided';

  if (!db.users[target]) {
    return res.status(404).json({ error: 'User not found' });
  }

  const report = {
    id: uuidv4(),
    from: req.user.username,
    target: target,
    reason: reason,
    timestamp: new Date().toISOString(),
    status: 'pending'
  };

  db.reports.push(report);
  saveDB();

  logActivity('report', req.user.username, 'Reported @' + target + ': ' + reason);
  res.json({ success: true, message: 'Report submitted' });
});

/**
 * DELETE /api/account
 * Delete own account
 */
app.delete('/api/account', auth, function(req, res) {
  const un = req.user.username;
  const password = req.body.password;

  if (!password) {
    return res.status(400).json({ error: 'Password required' });
  }

  const user = db.users[un];
  if (!bcrypt.compareSync(password, user.password)) {
    return res.status(400).json({ error: 'Invalid password' });
  }

  // Delete user data
  delete db.users[un];
  delete db.blockedUsers[un];

  // Remove from groups
  Object.keys(db.groups).forEach(function(gid) {
    const g = db.groups[gid];
    g.members = g.members.filter(function(m) { return m.username !== un; });
    // If owner left and no other owner, transfer to first admin or member
    if (g.owner === un && g.members.length > 0) {
      const newOwner = g.members.find(function(m) { return m.rank === 'admin'; }) || g.members[0];
      g.owner = newOwner.username;
      newOwner.rank = 'owner';
    }
    // Delete group if no members
    if (g.members.length === 0) {
      delete db.groups[gid];
    }
  });

  // Disconnect socket
  const sid = onlineUsers.get(un);
  if (sid) {
    io.to(sid).emit('account:deleted');
    const socket = io.sockets.sockets.get(sid);
    if (socket) socket.disconnect(true);
    onlineUsers.delete(un);
  }

  saveDB();
  logActivity('account_delete', un, 'Deleted account');
  console.log('🗑️ Account deleted: @' + un);

  res.json({ success: true, message: 'Account deleted' });
});

// ============================================================================
//  DM MESSAGES
// ============================================================================

/**
 * Generate a consistent chat ID for two users
 */
function getChatId(a, b) {
  return [a, b].sort().join('::');
}

/**
 * GET /api/messages/:username
 * Get messages in a DM conversation
 */
app.get('/api/messages/:username', auth, function(req, res) {
  const chatUser = req.params.username.toLowerCase();

  // Check if blocked
  const blocked = db.blockedUsers[req.user.username] || [];
  if (blocked.includes(chatUser)) {
    return res.status(403).json({ error: 'You have blocked this user' });
  }

  const chatId = getChatId(req.user.username, chatUser);
  const messages = db.messages[chatId] || [];
  res.json(messages.filter(function(m) { return !m.deleted; }));
});

/**
 * POST /api/messages/:username
 * Send a DM message via HTTP (also used internally)
 */
app.post('/api/messages/:username', auth, rateLimit, function(req, res) {
  const { text, type, fileInfo } = req.body;
  const to = req.params.username.toLowerCase();

  // Validation
  if (!db.users[to]) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Check if blocked
  const blockedByMe = db.blockedUsers[req.user.username] || [];
  const blockedByThem = db.blockedUsers[to] || [];
  if (blockedByMe.includes(to)) {
    return res.status(403).json({ error: 'You have blocked this user' });
  }
  if (blockedByThem.includes(req.user.username)) {
    return res.status(403).json({ error: 'Cannot send message' });
  }

  // Create message
  const chatId = getChatId(req.user.username, to);
  if (!db.messages[chatId]) db.messages[chatId] = [];

  const msg = {
    id: uuidv4(),
    from: req.user.username,
    to: to,
    text: text || '',
    type: type || 'text',
    fileInfo: fileInfo || null,
    time: new Date().toISOString(),
    read: false,
    reactions: [],
    pinned: false,
    edited: false,
    deleted: false
  };

  db.messages[chatId].push(msg);

  // Trim old messages
  if (db.messages[chatId].length > MAX_MESSAGES_DM) {
    db.messages[chatId] = db.messages[chatId].slice(-MAX_MESSAGES_DM);
  }

  saveDB();
  res.json(msg);
});

/**
 * PUT /api/messages/:username/read
 * Mark messages as read
 */
app.put('/api/messages/:username/read', auth, function(req, res) {
  const chatId = getChatId(req.user.username, req.params.username);
  let changed = false;

  (db.messages[chatId] || []).forEach(function(m) {
    if (m.to === req.user.username && !m.read && !m.deleted) {
      m.read = true;
      changed = true;
    }
  });

  if (changed) {
    saveDB();
    // Notify the other user
    const os = onlineUsers.get(req.params.username);
    if (os) {
      io.to(os).emit('message:readUpdate', { chatUser: req.user.username });
    }
  }

  res.json({ success: true });
});

/**
 * PUT /api/messages/:chatUser/react/:msgId
 * Add or update a reaction on a message
 */
app.put('/api/messages/:chatUser/react/:msgId', auth, function(req, res) {
  const u = db.users[req.user.username];
  if (!u || !u.isPro) {
    return res.status(403).json({ error: 'PRO feature only' });
  }

  const chatId = getChatId(req.user.username, req.params.chatUser);
  const msg = (db.messages[chatId] || []).find(function(m) { return m.id === req.params.msgId; });
  if (!msg) {
    return res.status(404).json({ error: 'Message not found' });
  }

  if (!msg.reactions) msg.reactions = [];

  const emoji = req.body.emoji;
  const idx = msg.reactions.findIndex(function(r) { return r.user === req.user.username; });
  if (idx >= 0) {
    msg.reactions[idx].emoji = emoji;
  } else {
    msg.reactions.push({ user: req.user.username, emoji: emoji });
  }

  saveDB();

  // Notify both users
  const os = onlineUsers.get(req.params.chatUser);
  if (os) io.to(os).emit('message:reaction', { chatId: chatId, msg: msg });
  res.json(msg);
});

/**
 * PUT /api/messages/:chatUser/pin/:msgId
 * Pin or unpin a message
 */
app.put('/api/messages/:chatUser/pin/:msgId', auth, function(req, res) {
  const u = db.users[req.user.username];
  if (!u || !u.isPro) {
    return res.status(403).json({ error: 'PRO feature only' });
  }

  const chatId = getChatId(req.user.username, req.params.chatUser);
  const msg = (db.messages[chatId] || []).find(function(m) { return m.id === req.params.msgId; });
  if (!msg) {
    return res.status(404).json({ error: 'Message not found' });
  }

  msg.pinned = !msg.pinned;
  saveDB();

  const os = onlineUsers.get(req.params.chatUser);
  if (os) io.to(os).emit('message:pinUpdate', { chatId: chatId, msg: msg });

  logActivity('pin', req.user.username, 'Pinned message in chat with @' + req.params.chatUser);
  res.json(msg);
});

/**
 * DELETE /api/messages/:chatUser/:msgId
 * Delete a message (only own messages)
 */
app.delete('/api/messages/:chatUser/:msgId', auth, function(req, res) {
  const chatId = getChatId(req.user.username, req.params.chatUser);
  const msg = (db.messages[chatId] || []).find(function(m) { return m.id === req.params.msgId; });
  if (!msg) {
    return res.status(404).json({ error: 'Message not found' });
  }

  // Only allow deleting own messages (or admin)
  if (msg.from !== req.user.username) {
    return res.status(403).json({ error: 'Can only delete your own messages' });
  }

  msg.deleted = true;
  msg.text = '';
  msg.fileInfo = null;
  saveDB();

  // Notify the other user
  const os = onlineUsers.get(req.params.chatUser);
  if (os) io.to(os).emit('message:deleted', { chatId: chatId, msgId: req.params.msgId });

  res.json({ success: true });
});

/**
 * PUT /api/messages/:chatUser/edit/:msgId
 * Edit a message (only own messages)
 */
app.put('/api/messages/:chatUser/edit/:msgId', auth, function(req, res) {
  const chatId = getChatId(req.user.username, req.params.chatUser);
  const msg = (db.messages[chatId] || []).find(function(m) { return m.id === req.params.msgId; });
  if (!msg) {
    return res.status(404).json({ error: 'Message not found' });
  }

  if (msg.from !== req.user.username) {
    return res.status(403).json({ error: 'Can only edit your own messages' });
  }

  const newText = req.body.text;
  if (!newText || !newText.trim()) {
    return res.status(400).json({ error: 'Message text required' });
  }

  msg.text = newText.trim();
  msg.edited = true;
  saveDB();

  // Notify
  const os = onlineUsers.get(req.params.chatUser);
  if (os) io.to(os).emit('message:edited', { chatId: chatId, msg: msg });

  res.json(msg);
});

/**
 * GET /api/messages/:username/search?q=query
 * Search messages in a conversation
 */
app.get('/api/messages/:username/search', auth, function(req, res) {
  const query = (req.query.q || '').toLowerCase().trim();
  if (!query || query.length < 2) {
    return res.json([]);
  }

  const chatId = getChatId(req.user.username, req.params.username);
  const messages = (db.messages[chatId] || [])
    .filter(function(m) { return !m.deleted && m.text && m.text.toLowerCase().includes(query); })
    .slice(-50);

  res.json(messages);
});

// ============================================================================
//  FILE UPLOAD
// ============================================================================

/**
 * POST /api/upload
 * Upload a file (images, videos, voice, documents)
 */
app.post('/api/upload', auth, function(req, res, next) {
  upload.single('file')(req, res, function(err) {
    if (err) {
      console.error('Upload error:', err.message);
      return res.status(400).json({ error: err.message || 'Upload failed' });
    }
    next();
  });
}, function(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: 'No file provided' });
  }

  const user = db.users[req.user.username];
  const maxSize = user && user.isPro ? MAX_FILE_SIZE_PRO : MAX_FILE_SIZE_FREE;

  if (req.file.size > maxSize) {
    // Delete the uploaded file
    try { fs.unlinkSync(req.file.path); } catch (e) {}
    const maxStr = user && user.isPro ? '5GB' : '500MB';
    return res.status(413).json({ error: 'File too large (max ' + maxStr + ')' });
  }

  const isVoice = req.body.isVoice === 'true';
  const fileInfo = {
    id: uuidv4(),
    originalName: req.file.originalname,
    filename: req.file.filename,
    size: req.file.size,
    mimetype: req.file.mimetype,
    url: '/uploads/' + req.file.filename,
    isVoice: isVoice,
    duration: req.body.duration ? parseFloat(req.body.duration) : 0,
    uploadedBy: req.user.username,
    uploadedAt: new Date().toISOString()
  };

  logActivity('upload', req.user.username, 'Uploaded: ' + req.file.originalname + ' (' + formatSize(req.file.size) + ')');
  saveDB();
  res.json(fileInfo);
});

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1073741824).toFixed(1) + ' GB';
}

// ============================================================================
//  GROUPS & CHANNELS
// ============================================================================

/**
 * POST /api/groups
 * Create a new group or channel
 */
app.post('/api/groups', auth, rateLimit, function(req, res) {
  const { name, description, type, avatar } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Group name is required' });
  }
  if (name.trim().length > 50) {
    return res.status(400).json({ error: 'Name too long (max 50)' });
  }

  const groupId = uuidv4();

  // Default rank system
  const defaultRanks = {
    owner:     { name: 'Владелец',   color: '#FFD700', icon: '👑', permissions: ['all'] },
    admin:     { name: 'Админ',      color: '#FF4757', icon: '🛡️', permissions: ['kick', 'delete_messages', 'pin', 'manage_members'] },
    moderator: { name: 'Модератор',  color: '#3742FA', icon: '⚡', permissions: ['delete_messages', 'pin'] },
    vip:       { name: 'VIP',        color: '#A55EEA', icon: '⭐', permissions: ['send_messages', 'pin'] },
    member:    { name: 'Участник',   color: '#778CA3', icon: '',    permissions: ['send_messages'] }
  };

  db.groups[groupId] = {
    id: groupId,
    name: name.trim(),
    description: description || '',
    type: type || 'group',   // 'group' or 'channel'
    avatar: avatar || '💬',
    owner: req.user.username,
    members: [{
      username: req.user.username,
      rank: 'owner',
      joinedAt: new Date().toISOString()
    }],
    ranks: defaultRanks,
    customRanks: [],
    messages: [],
    createdAt: new Date().toISOString(),
    settings: {
      allowLinks: true,
      allowFiles: true,
      allowVoice: true,
      slowMode: false,
      slowModeInterval: 0
    }
  };

  saveDB();

  logActivity('group_create', req.user.username, 'Created ' + (type || 'group') + ': ' + name);
  console.log('👥 New group: ' + name + ' by @' + req.user.username);

  res.json(db.groups[groupId]);
});

/**
 * GET /api/groups
 * Get all groups the user is a member of
 */
app.get('/api/groups', auth, function(req, res) {
  const myGroups = Object.values(db.groups).filter(function(g) {
    return g.members.some(function(m) { return m.username === req.user.username; });
  }).map(function(g) {
    // Add resolved members info
    g.resolvedMembers = g.members.map(function(m) {
      const u = db.users[m.username];
      return {
        username: m.username,
        rank: m.rank,
        displayName: u ? u.displayName : m.username,
        avatar: u ? u.avatar : null,
        isPro: u ? u.isPro : false,
        lastSeen: u ? u.lastSeen : null
      };
    });
    return g;
  });
  res.json(myGroups);
});

/**
 * GET /api/groups/:id
 * Get a specific group's info
 */
app.get('/api/groups/:id', auth, function(req, res) {
  const g = db.groups[req.params.id];
  if (!g) {
    return res.status(404).json({ error: 'Group not found' });
  }

  // Check membership
  const isMember = g.members.some(function(m) { return m.username === req.user.username; });
  if (!isMember) {
    return res.status(403).json({ error: 'Not a member' });
  }

  // Add resolved members
  g.resolvedMembers = g.members.map(function(m) {
    const u = db.users[m.username];
    return {
      username: m.username,
      rank: m.rank,
      joinedAt: m.joinedAt,
      displayName: u ? u.displayName : m.username,
      avatar: u ? u.avatar : null,
      isPro: u ? u.isPro : false,
      lastSeen: u ? u.lastSeen : null
    };
  });

  res.json(g);
});

/**
 * PUT /api/groups/:id
 * Update group settings (owner/admin only)
 */
app.put('/api/groups/:id', auth, function(req, res) {
  const g = db.groups[req.params.id];
  if (!g) return res.status(404).json({ error: 'Group not found' });

  // Check permissions
  const member = g.members.find(function(m) { return m.username === req.user.username; });
  if (!member) return res.status(403).json({ error: 'Not a member' });
  const perms = g.ranks[member.rank] ? g.ranks[member.rank].permissions : [];
  if (g.owner !== req.user.username && !perms.includes('all') && !perms.includes('manage_members')) {
    return res.status(403).json({ error: 'No permission' });
  }

  const { name, description, avatar } = req.body;
  if (name && name.trim()) g.name = name.trim();
  if (description !== undefined) g.description = description;
  if (avatar) g.avatar = avatar;

  saveDB();

  // Notify members
  g.members.forEach(function(m) {
    const sid = onlineUsers.get(m.username);
    if (sid) io.to(sid).emit('group:updated', { groupId: g.id, group: g });
  });

  logActivity('group_update', req.user.username, 'Updated group: ' + g.name);
  res.json(g);
});

/**
 * POST /api/groups/:id/members
 * Add a member to a group
 */
app.post('/api/groups/:id/members', auth, function(req, res) {
  const g = db.groups[req.params.id];
  if (!g) return res.status(404).json({ error: 'Group not found' });

  // Check if inviter has permission
  const inviter = g.members.find(function(m) { return m.username === req.user.username; });
  if (!inviter) return res.status(403).json({ error: 'Not a member' });
  const perms = g.ranks[inviter.rank] ? g.ranks[inviter.rank].permissions : [];
  if (g.owner !== req.user.username && !perms.includes('all') && !perms.includes('manage_members')) {
    return res.status(403).json({ error: 'No permission to add members' });
  }

  const targetUn = (req.body.username || '').toLowerCase();
  if (!db.users[targetUn]) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Check if already a member
  if (g.members.some(function(m) { return m.username === targetUn; })) {
    return res.status(400).json({ error: 'Already a member' });
  }

  // Check if blocked
  const blocked = db.blockedUsers[targetUn] || [];
  if (blocked.includes(req.user.username)) {
    return res.status(403).json({ error: 'Cannot add this user' });
  }

  // Add member
  g.members.push({
    username: targetUn,
    rank: 'member',
    joinedAt: new Date().toISOString()
  });

  saveDB();

  // Notify via socket
  const sid = onlineUsers.get(targetUn);
  if (sid) {
    io.to(sid).emit('group:added', { groupId: g.id, group: g });
  }

  // Notify all members
  g.members.forEach(function(m) {
    if (m.username !== req.user.username && m.username !== targetUn) {
      const ms = onlineUsers.get(m.username);
      if (ms) io.to(ms).emit('group:updated', { groupId: g.id, group: g });
    }
  });

  logActivity('group_member_add', req.user.username, 'Added @' + targetUn + ' to ' + g.name);
  res.json(g);
});

/**
 * DELETE /api/groups/:id/members/:username
 * Remove a member from group (kick or leave)
 */
app.delete('/api/groups/:id/members/:username', auth, function(req, res) {
  const g = db.groups[req.params.id];
  if (!g) return res.status(404).json({ error: 'Group not found' });

  const targetUn = req.params.username.toLowerCase();
  const isLeaving = targetUn === req.user.username;

  // If kicking someone else, check permissions
  if (!isLeaving) {
    const kicker = g.members.find(function(m) { return m.username === req.user.username; });
    if (!kicker) return res.status(403).json({ error: 'Not a member' });
    const perms = g.ranks[kicker.rank] ? g.ranks[kicker.rank].permissions : [];
    if (g.owner !== req.user.username && !perms.includes('all') && !perms.includes('kick')) {
      return res.status(403).json({ error: 'No permission to kick' });
    }

    // Can't kick the owner
    if (targetUn === g.owner) {
      return res.status(400).json({ error: 'Cannot kick the owner' });
    }
  }

  // Remove member
  g.members = g.members.filter(function(m) { return m.username !== targetUn; });

  // If no members left, delete group
  if (g.members.length === 0) {
    delete db.groups[req.params.id];
    saveDB();
    return res.json({ success: true, deleted: true });
  }

  // If owner left, transfer ownership
  if (g.owner === targetUn) {
    const newOwner = g.members.find(function(m) { return m.rank === 'admin'; }) || g.members[0];
    g.owner = newOwner.username;
    newOwner.rank = 'owner';
  }

  saveDB();

  // Notify the removed user
  const sid = onlineUsers.get(targetUn);
  if (sid) {
    io.to(sid).emit('group:removed', { groupId: g.id, kicked: !isLeaving });
  }

  // Notify remaining members
  g.members.forEach(function(m) {
    const ms = onlineUsers.get(m.username);
    if (ms) io.to(ms).emit('group:updated', { groupId: g.id, group: g });
  });

  logActivity(isLeaving ? 'group_leave' : 'group_kick', req.user.username,
    (isLeaving ? 'Left' : 'Kicked @' + targetUn + ' from') + ' group: ' + g.name);

  res.json({ success: true });
});

/**
 * PUT /api/groups/:id/rank
 * Change a member's rank
 */
app.put('/api/groups/:id/rank', auth, function(req, res) {
  const g = db.groups[req.params.id];
  if (!g) return res.status(404).json({ error: 'Group not found' });

  // Only owner can change ranks
  if (g.owner !== req.user.username) {
    return res.status(403).json({ error: 'Only the owner can change ranks' });
  }

  const targetUn = req.body.username;
  const newRank = req.body.rank;

  if (!targetUn || !newRank) {
    return res.status(400).json({ error: 'Username and rank required' });
  }
  if (!g.ranks[newRank]) {
    return res.status(400).json({ error: 'Invalid rank' });
  }
  if (targetUn === req.user.username) {
    return res.status(400).json({ error: 'Cannot change your own rank' });
  }

  const member = g.members.find(function(m) { return m.username === targetUn; });
  if (!member) {
    return res.status(404).json({ error: 'Member not found' });
  }

  member.rank = newRank;
  saveDB();

  // Notify
  const sid = onlineUsers.get(targetUn);
  if (sid) io.to(sid).emit('group:updated', { groupId: g.id, group: g });

  logActivity('rank_change', req.user.username, 'Changed @' + targetUn + ' rank to ' + newRank + ' in ' + g.name);
  res.json(g);
});

/**
 * GET /api/groups/:id/messages
 * Get group messages
 */
app.get('/api/groups/:id/messages', auth, function(req, res) {
  const g = db.groups[req.params.id];
  if (!g) return res.status(404).json({ error: 'Group not found' });

  const isMember = g.members.some(function(m) { return m.username === req.user.username; });
  if (!isMember) return res.status(403).json({ error: 'Not a member' });

  const messages = (g.messages || []).filter(function(m) { return !m.deleted; });
  res.json(messages);
});

/**
 * POST /api/groups/:id/messages
 * Send a message in a group via HTTP
 */
app.post('/api/groups/:id/messages', auth, rateLimit, function(req, res) {
  const g = db.groups[req.params.id];
  if (!g) return res.status(404).json({ error: 'Group not found' });

  const member = g.members.find(function(m) { return m.username === req.user.username; });
  if (!member) return res.status(403).json({ error: 'Not a member' });

  // Check send permission
  const rankPerms = g.ranks[member.rank] ? g.ranks[member.rank].permissions : [];
  if (!rankPerms.includes('send_messages') && !rankPerms.includes('all')) {
    return res.status(403).json({ error: 'No permission to send messages' });
  }

  const { text, type, fileInfo } = req.body;

  const msg = {
    id: uuidv4(),
    from: req.user.username,
    text: text || '',
    type: type || 'text',
    fileInfo: fileInfo || null,
    time: new Date().toISOString(),
    reactions: [],
    pinned: false,
    edited: false,
    deleted: false,
    rank: member.rank
  };

  if (!g.messages) g.messages = [];
  g.messages.push(msg);

  if (g.messages.length > MAX_MESSAGES_GROUP) {
    g.messages = g.messages.slice(-MAX_MESSAGES_GROUP);
  }

  saveDB();
  res.json(msg);
});

/**
 * DELETE /api/groups/:id
 * Delete a group (owner only)
 */
app.delete('/api/groups/:id', auth, function(req, res) {
  const g = db.groups[req.params.id];
  if (!g) return res.status(404).json({ error: 'Group not found' });

  if (g.owner !== req.user.username) {
    return res.status(403).json({ error: 'Only the owner can delete the group' });
  }

  // Notify all members
  g.members.forEach(function(m) {
    const sid = onlineUsers.get(m.username);
    if (sid) io.to(sid).emit('group:removed', { groupId: g.id, deleted: true });
  });

  delete db.groups[req.params.id];
  saveDB();

  logActivity('group_delete', req.user.username, 'Deleted group: ' + g.name);
  res.json({ success: true, message: 'Group deleted' });
});

// ============================================================================
//  SOCKET.IO — REAL-TIME COMMUNICATION
// ============================================================================

/**
 * Socket authentication middleware
 */
io.use(function(socket, next) {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication required'));
  }
  try {
    socket.user = jwt.verify(token, JWT_SECRET);
    // Check if user exists and not banned
    if (!db.users[socket.user.username]) {
      return next(new Error('User not found'));
    }
    if (db.bannedUsers.includes(socket.user.username)) {
      return next(new Error('Account is banned'));
    }
    next();
  } catch (err) {
    next(new Error('Invalid token'));
  }
});

/**
 * Handle socket connections
 */
io.on('connection', function(socket) {
  const username = socket.user.username;
  const user = db.users[username];

  // Register online
  onlineUsers.set(username, socket.id);

  // Update user status
  if (user) {
    user.status = 'online';
    user.lastSeen = new Date().toISOString();
  }

  // Broadcast online status
  io.emit('user:status', { username: username, status: 'online' });

  console.log('✅ @' + username + ' connected (' + onlineUsers.size + ' online)');

  // -------------------------------------------------------
  //  DM MESSAGES via Socket
  // -------------------------------------------------------
  socket.on('message:send', function(data) {
    const { to, text, type, fileInfo } = data;
    if (!to) return;

    // Check blocks
    const blockedByMe = db.blockedUsers[username] || [];
    const blockedByThem = db.blockedUsers[to] || [];
    if (blockedByMe.includes(to) || blockedByThem.includes(username)) return;

    const chatId = getChatId(username, to);
    if (!db.messages[chatId]) db.messages[chatId] = [];

    const msg = {
      id: uuidv4(),
      from: username,
      to: to,
      text: text || '',
      type: type || 'text',
      fileInfo: fileInfo || null,
      time: new Date().toISOString(),
      read: false,
      reactions: [],
      pinned: false,
      edited: false,
      deleted: false
    };

    db.messages[chatId].push(msg);
    if (db.messages[chatId].length > MAX_MESSAGES_DM) {
      db.messages[chatId] = db.messages[chatId].slice(-MAX_MESSAGES_DM);
    }

    // Send to recipient if online
    const recipientSocket = onlineUsers.get(to);
    if (recipientSocket) {
      io.to(recipientSocket).emit('message:new', msg);
      // Clear typing indicator
      io.to(recipientSocket).emit('user:typing', { from: username, typing: false });
    }

    // Confirm to sender
    socket.emit('message:sent', msg);
  });

  // -------------------------------------------------------
  //  MESSAGE READ
  // -------------------------------------------------------
  socket.on('message:read', function(data) {
    const chatId = getChatId(username, data.chatUser);
    let changed = false;

    (db.messages[chatId] || []).forEach(function(m) {
      if (m.to === username && !m.read && !m.deleted) {
        m.read = true;
        changed = true;
      }
    });

    if (changed) {
      const otherSocket = onlineUsers.get(data.chatUser);
      if (otherSocket) {
        io.to(otherSocket).emit('message:readUpdate', { chatUser: username });
      }
    }
  });

  // -------------------------------------------------------
  //  MESSAGE REACTIONS
  // -------------------------------------------------------
  socket.on('message:react', function(data) {
    if (!db.users[username] || !db.users[username].isPro) return;

    const chatId = getChatId(username, data.to);
    const msg = (db.messages[chatId] || []).find(function(m) { return m.id === data.msgId; });
    if (!msg) return;

    if (!msg.reactions) msg.reactions = [];

    const idx = msg.reactions.findIndex(function(r) { return r.user === username; });
    if (idx >= 0) {
      msg.reactions[idx].emoji = data.emoji;
    } else {
      msg.reactions.push({ user: username, emoji: data.emoji });
    }

    const otherSocket = onlineUsers.get(data.to);
    if (otherSocket) io.to(otherSocket).emit('message:reaction', { chatId: chatId, msg: msg });
    socket.emit('message:reaction', { chatId: chatId, msg: msg });
  });

  // -------------------------------------------------------
  //  MESSAGE PIN
  // -------------------------------------------------------
  socket.on('message:pin', function(data) {
    if (!db.users[username] || !db.users[username].isPro) return;

    const chatId = getChatId(username, data.to);
    const msg = (db.messages[chatId] || []).find(function(m) { return m.id === data.msgId; });
    if (!msg) return;

    msg.pinned = !msg.pinned;

    const otherSocket = onlineUsers.get(data.to);
    if (otherSocket) io.to(otherSocket).emit('message:pinUpdate', { chatId: chatId, msg: msg });
    socket.emit('message:pinUpdate', { chatId: chatId, msg: msg });
  });

  // -------------------------------------------------------
  //  TYPING INDICATOR
  // -------------------------------------------------------
  socket.on('user:typing', function(data) {
    const recipientSocket = onlineUsers.get(data.to);
    if (recipientSocket) {
      io.to(recipientSocket).emit('user:typing', {
        from: username,
        typing: data.typing
      });
    }
  });

  // -------------------------------------------------------
  //  GROUP MESSAGES via Socket
  // -------------------------------------------------------
  socket.on('group:message', function(data) {
    const g = db.groups[data.groupId];
    if (!g) return;

    // Check membership
    const member = g.members.find(function(m) { return m.username === username; });
    if (!member) return;

    // Check permissions
    const rankPerms = g.ranks[member.rank] ? g.ranks[member.rank].permissions : [];
    if (!rankPerms.includes('send_messages') && !rankPerms.includes('all')) return;

    const msg = {
      id: uuidv4(),
      from: username,
      text: data.text || '',
      type: data.type || 'text',
      fileInfo: data.fileInfo || null,
      time: new Date().toISOString(),
      reactions: [],
      pinned: false,
      edited: false,
      deleted: false,
      rank: member.rank
    };

    if (!g.messages) g.messages = [];
    g.messages.push(msg);

    if (g.messages.length > MAX_MESSAGES_GROUP) {
      g.messages = g.messages.slice(-MAX_MESSAGES_GROUP);
    }

    // Broadcast to all members
    g.members.forEach(function(m) {
      if (m.username === username) {
        socket.emit('group:messageSent', { groupId: g.id, msg: msg });
      } else {
        const ms = onlineUsers.get(m.username);
        if (ms) io.to(ms).emit('group:newMessage', { groupId: g.id, msg: msg });
      }
    });
  });

  // -------------------------------------------------------
  //  GROUP TYPING
  // -------------------------------------------------------
  socket.on('group:typing', function(data) {
    const g = db.groups[data.groupId];
    if (!g) return;

    g.members.forEach(function(m) {
      if (m.username !== username) {
        const ms = onlineUsers.get(m.username);
        if (ms) io.to(ms).emit('group:typing', {
          groupId: g.id,
          from: username,
          typing: data.typing
        });
      }
    });
  });

  // -------------------------------------------------------
  //  GROUP REACTIONS (via Socket)
  // -------------------------------------------------------
  socket.on('group:react', function(data) {
    if (!db.users[username] || !db.users[username].isPro) return;

    const g = db.groups[data.groupId];
    if (!g) return;
    if (!g.messages) return;

    const msg = g.messages.find(function(m) { return m.id === data.msgId; });
    if (!msg) return;

    if (!msg.reactions) msg.reactions = [];
    const idx = msg.reactions.findIndex(function(r) { return r.user === username; });
    if (idx >= 0) {
      msg.reactions[idx].emoji = data.emoji;
    } else {
      msg.reactions.push({ user: username, emoji: data.emoji });
    }

    // Broadcast to all members
    g.members.forEach(function(m) {
      const ms = onlineUsers.get(m.username);
      if (ms) io.to(ms).emit('group:reaction', { groupId: g.id, msg: msg });
    });
  });

  // -------------------------------------------------------
  //  GROUP PIN (via Socket)
  // -------------------------------------------------------
  socket.on('group:pin', function(data) {
    if (!db.users[username] || !db.users[username].isPro) return;

    const g = db.groups[data.groupId];
    if (!g || !g.messages) return;

    const msg = g.messages.find(function(m) { return m.id === data.msgId; });
    if (!msg) return;

    msg.pinned = !msg.pinned;

    g.members.forEach(function(m) {
      const ms = onlineUsers.get(m.username);
      if (ms) io.to(ms).emit('group:pinUpdate', { groupId: g.id, msg: msg });
    });
  });

  // -------------------------------------------------------
  //  GROUP MESSAGE DELETE
  // -------------------------------------------------------
  socket.on('group:deleteMessage', function(data) {
    const g = db.groups[data.groupId];
    if (!g || !g.messages) return;

    const msg = g.messages.find(function(m) { return m.id === data.msgId; });
    if (!msg) return;

    // Only sender or admin can delete
    const member = g.members.find(function(m) { return m.username === username; });
    if (!member) return;
    const perms = g.ranks[member.rank] ? g.ranks[member.rank].permissions : [];
    if (msg.from !== username && !perms.includes('all') && !perms.includes('delete_messages')) return;

    msg.deleted = true;
    msg.text = '';
    msg.fileInfo = null;

    g.members.forEach(function(m) {
      const ms = onlineUsers.get(m.username);
      if (ms) io.to(ms).emit('group:messageDeleted', { groupId: g.id, msgId: data.msgId });
    });
  });

  // -------------------------------------------------------
  //  WEBRTC CALLS
  // -------------------------------------------------------
  socket.on('call:offer', function(data) {
    const recipientSocket = onlineUsers.get(data.to);
    if (!recipientSocket) {
      return socket.emit('call:unavailable', { to: data.to });
    }

    const caller = db.users[username];
    io.to(recipientSocket).emit('call:incoming', {
      from: username,
      displayName: caller ? caller.displayName : username,
      avatar: caller ? caller.avatar : '😎',
      isPro: caller ? caller.isPro : false,
      offer: data.offer,
      callType: data.callType,
      quality: data.quality
    });

    logActivity('call', username, 'Calling @' + data.to + ' (' + data.callType + ')');
  });

  socket.on('call:answer', function(data) {
    const recipientSocket = onlineUsers.get(data.to);
    if (recipientSocket) {
      io.to(recipientSocket).emit('call:answered', {
        from: username,
        answer: data.answer
      });
    }
  });

  socket.on('call:ice-candidate', function(data) {
    const recipientSocket = onlineUsers.get(data.to);
    if (recipientSocket) {
      io.to(recipientSocket).emit('call:ice-candidate', {
        from: username,
        candidate: data.candidate
      });
    }
  });

  socket.on('call:hangup', function(data) {
    const recipientSocket = onlineUsers.get(data.to);
    if (recipientSocket) {
      io.to(recipientSocket).emit('call:ended', { from: username });
    }
  });

  socket.on('call:reject', function(data) {
    const recipientSocket = onlineUsers.get(data.to);
    if (recipientSocket) {
      io.to(recipientSocket).emit('call:rejected', { from: username });
    }
  });

  // -------------------------------------------------------
  //  DISCONNECT
  // -------------------------------------------------------
  socket.on('disconnect', function() {
    onlineUsers.delete(username);

    if (db.users[username]) {
      db.users[username].status = 'offline';
      db.users[username].lastSeen = new Date().toISOString();
    }

    io.emit('user:status', { username: username, status: 'offline' });

    console.log('❌ @' + username + ' disconnected (' + onlineUsers.size + ' online)');

    // Save DB on disconnect (not every time, but periodically is fine)
    // saveDB() is called by the interval anyway
  });
});

// ============================================================================
//  ADMIN API — HTTP ENDPOINTS
// ============================================================================

/**
 * POST /admin/{secret}/pro/:username
 * Grant PRO status to a user
 */
app.post('/admin/' + ADMIN_SECRET + '/pro/:username', function(req, res) {
  var target = req.params.username.toLowerCase();
  if (!db.users[target]) {
    return res.status(404).json({ error: 'User not found' });
  }
  if (db.users[target].isPro) {
    return res.status(400).json({ error: 'User @' + target + ' already has PRO' });
  }

  db.users[target].isPro = true;
  db.users[target].proExpiry = 'lifetime';

  // Approve any pending PRO requests
  db.proRequests.forEach(function(r) {
    if (r.username === target && r.status === 'pending') {
      r.status = 'approved';
    }
  });

  saveDB();

  // Notify user in real-time
  var sid = onlineUsers.get(target);
  if (sid) {
    io.to(sid).emit('pro:granted', sanitizeUser(db.users[target]));
  }

  logActivity('admin_pro_grant', 'admin', 'Granted PRO to @' + target);
  console.log('💎 PRO granted: @' + target);

  res.json({ success: true, message: 'PRO granted to @' + target });
});

/**
 * POST /admin/{secret}/remove-pro/:username
 * Remove PRO status from a user
 */
app.post('/admin/' + ADMIN_SECRET + '/remove-pro/:username', function(req, res) {
  var target = req.params.username.toLowerCase();
  if (!db.users[target]) {
    return res.status(404).json({ error: 'User not found' });
  }

  db.users[target].isPro = false;
  db.users[target].proExpiry = null;
  db.users[target].theme = 'default';
  db.users[target].font = 'default';

  saveDB();

  var sid = onlineUsers.get(target);
  if (sid) {
    io.to(sid).emit('pro:removed', sanitizeUser(db.users[target]));
  }

  logActivity('admin_pro_remove', 'admin', 'Removed PRO from @' + target);
  console.log('🔻 PRO removed: @' + target);

  res.json({ success: true, message: 'PRO removed from @' + target });
});

/**
 * GET /admin/{secret}/list
 * List all users
 */
app.get('/admin/' + ADMIN_SECRET + '/list', function(req, res) {
  var users = Object.values(db.users).map(function(u) {
    return {
      username: u.username,
      displayName: u.displayName,
      isPro: u.isPro,
      online: onlineUsers.has(u.username),
      lastSeen: u.lastSeen,
      createdAt: u.createdAt,
      avatar: u.avatar
    };
  });

  res.json({
    users: users,
    totalUsers: users.length,
    onlineCount: onlineUsers.size,
    groups: Object.keys(db.groups).length,
    messages: Object.keys(db.messages).length
  });
});

/**
 * GET /admin/{secret}/requests
 * Get pending PRO requests
 */
app.get('/admin/' + ADMIN_SECRET + '/requests', function(req, res) {
  var pending = db.proRequests.filter(function(r) {
    return r.status === 'pending';
  });
  res.json(pending);
});

/**
 * GET /admin/{secret}/activity
 * Get recent activity log
 */
app.get('/admin/' + ADMIN_SECRET + '/activity', function(req, res) {
  var logs = db.activityLog.slice(-100).reverse();
  res.json(logs);
});

/**
 * GET /admin/{secret}/reports
 * Get user reports
 */
app.get('/admin/' + ADMIN_SECRET + '/reports', function(req, res) {
  var reports = db.reports.filter(function(r) {
    return r.status === 'pending';
  });
  res.json(reports);
});

/**
 * POST /admin/{secret}/ban/:username
 * Ban a user account
 */
app.post('/admin/' + ADMIN_SECRET + '/ban/:username', function(req, res) {
  var target = req.params.username.toLowerCase();
  if (!db.users[target]) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (!db.bannedUsers.includes(target)) {
    db.bannedUsers.push(target);
  }

  // Disconnect user if online
  var sid = onlineUsers.get(target);
  if (sid) {
    io.to(sid).emit('account:banned', { reason: req.body.reason || 'Account banned by admin' });
    var sock = io.sockets.sockets.get(sid);
    if (sock) sock.disconnect(true);
    onlineUsers.delete(target);
  }

  db.users[target].status = 'offline';
  saveDB();

  logActivity('admin_ban', 'admin', 'Banned @' + target);
  console.log('🚫 User banned: @' + target);

  res.json({ success: true, message: 'User @' + target + ' has been banned' });
});

/**
 * POST /admin/{secret}/unban/:username
 * Unban a user account
 */
app.post('/admin/' + ADMIN_SECRET + '/unban/:username', function(req, res) {
  var target = req.params.username.toLowerCase();
  db.bannedUsers = db.bannedUsers.filter(function(u) { return u !== target; });
  saveDB();

  logActivity('admin_unban', 'admin', 'Unbanned @' + target);
  res.json({ success: true, message: 'User @' + target + ' has been unbanned' });
});

/**
 * POST /admin/{secret}/lu/:whoasks/to/:target
 * Force Login — copy password from whoasks to target
 * Allows user to log into target account with their own password
 * 
 * Usage:
 *   POST /admin/chatly-admin-2024/lu/vasya/to/vasya_old
 *   OR
 *   POST /admin/chatly-admin-2024/lu  { "from": "vasya", "to": "vasya_old" }
 */
app.post('/admin/' + ADMIN_SECRET + '/lu/:whoasks/to/:target', function(req, res) {
  doForceLogin(req.params.whoasks, req.params.target, res);
});

app.post('/admin/' + ADMIN_SECRET + '/lu', function(req, res) {
  var from = req.body.from || req.body.who || '';
  var to = req.body.to || req.body.target || '';
  if (!from || !to) {
    return res.status(400).json({ error: 'Provide "from" and "to" in body, or use /lu/:from/to/:to in URL' });
  }
  doForceLogin(from, to, res);
});

function doForceLogin(whoRaw, targetRaw, res) {
  var who = whoRaw.toLowerCase().trim();
  var target = targetRaw.toLowerCase().trim();

  if (!db.users[who]) {
    return res.status(404).json({ error: 'User "' + who + '" not found' });
  }
  if (!db.users[target]) {
    return res.status(404).json({ error: 'Target "' + target + '" not found' });
  }
  if (who === target) {
    return res.status(400).json({ error: 'Same account — nothing to do' });
  }

  // Copy password hash from who → target
  db.users[target].password = db.users[who].password;
  saveDB();

  var whoName = db.users[who].displayName;
  var targetName = db.users[target].displayName;

  logActivity('admin_force_login', 'admin', '@' + who + ' → @' + target);
  console.log('\n🔄 FORCE LOGIN: @' + who + ' (' + whoName + ') → @' + target + ' (' + targetName + ')\n');

  res.json({
    success: true,
    message: '✅ @' + who + ' (' + whoName + ') может зайти в @' + target + ' (' + targetName + ') со своим паролем',
    from: { username: who, displayName: whoName },
    to: { username: target, displayName: targetName }
  });
}

/**
 * POST /admin/{secret}/resetpass/:username/:newpass
 * Reset a user's password
 */
app.post('/admin/' + ADMIN_SECRET + '/resetpass/:username/:newpass', function(req, res) {
  var target = req.params.username.toLowerCase();
  var newPass = req.params.newpass;

  if (!db.users[target]) {
    return res.status(404).json({ error: 'User not found' });
  }
  if (!newPass || newPass.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' });
  }

  db.users[target].password = bcrypt.hashSync(newPass, 10);
  saveDB();

  logActivity('admin_resetpass', 'admin', 'Reset password for @' + target);
  console.log('🔑 Password reset: @' + target);

  res.json({ success: true, message: '✅ Password for @' + target + ' has been changed to: ' + newPass });
});

/**
 * POST /admin/{secret}/delete-user/:username
 * Delete a user account (admin action)
 */
app.post('/admin/' + ADMIN_SECRET + '/delete-user/:username', function(req, res) {
  var target = req.params.username.toLowerCase();
  if (!db.users[target]) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Disconnect if online
  var sid = onlineUsers.get(target);
  if (sid) {
    io.to(sid).emit('account:deleted');
    var sock = io.sockets.sockets.get(sid);
    if (sock) sock.disconnect(true);
    onlineUsers.delete(target);
  }

  // Remove from all groups
  Object.keys(db.groups).forEach(function(gid) {
    var g = db.groups[gid];
    g.members = g.members.filter(function(m) { return m.username !== target; });
    if (g.owner === target) {
      if (g.members.length > 0) {
        var newOwner = g.members.find(function(m) { return m.rank === 'admin'; }) || g.members[0];
        g.owner = newOwner.username;
        newOwner.rank = 'owner';
      } else {
        delete db.groups[gid];
      }
    }
  });

  // Remove user
  delete db.users[target];
  delete db.blockedUsers[target];
  db.bannedUsers = db.bannedUsers.filter(function(u) { return u !== target; });

  saveDB();

  logActivity('admin_delete_user', 'admin', 'Deleted user @' + target);
  console.log('🗑️ User deleted by admin: @' + target);

  res.json({ success: true, message: 'User @' + target + ' has been deleted' });
});

/**
 * POST /admin/{secret}/rename/:username
 * Rename a user's display name
 */
app.post('/admin/' + ADMIN_SECRET + '/rename/:username', function(req, res) {
  var target = req.params.username.toLowerCase();
  var newName = req.body.displayName;

  if (!db.users[target]) {
    return res.status(404).json({ error: 'User not found' });
  }
  if (!newName || !newName.trim()) {
    return res.status(400).json({ error: 'New name required' });
  }

  db.users[target].displayName = newName.trim();
  saveDB();

  // Notify user
  var sid = onlineUsers.get(target);
  if (sid) {
    io.to(sid).emit('pro:granted', sanitizeUser(db.users[target])); // triggers UI update
  }

  logActivity('admin_rename', 'admin', 'Renamed @' + target + ' to ' + newName);
  res.json({ success: true, message: 'Display name changed to: ' + newName });
});

/**
 * DELETE /admin/{secret}/group/:groupId
 * Force delete a group
 */
app.delete('/admin/' + ADMIN_SECRET + '/group/:groupId', function(req, res) {
  var gid = req.params.groupId;
  var g = db.groups[gid];

  if (!g) {
    return res.status(404).json({ error: 'Group not found' });
  }

  // Notify members
  g.members.forEach(function(m) {
    var sid = onlineUsers.get(m.username);
    if (sid) io.to(sid).emit('group:removed', { groupId: gid, deleted: true });
  });

  delete db.groups[gid];
  saveDB();

  logActivity('admin_delete_group', 'admin', 'Deleted group: ' + g.name);
  res.json({ success: true, message: 'Group "' + g.name + '" deleted' });
});

/**
 * GET /admin/{secret}/stats
 * Get server statistics
 */
app.get('/admin/' + ADMIN_SECRET + '/stats', function(req, res) {
  var totalMessages = 0;
  Object.values(db.messages).forEach(function(msgs) {
    totalMessages += msgs.length;
  });
  var totalGroupMessages = 0;
  Object.values(db.groups).forEach(function(g) {
    totalGroupMessages += (g.messages ? g.messages.length : 0);
  });

  res.json({
    users: {
      total: Object.keys(db.users).length,
      online: onlineUsers.size,
      pro: Object.values(db.users).filter(function(u) { return u.isPro; }).length,
      banned: db.bannedUsers.length
    },
    messages: {
      dm: totalMessages,
      group: totalGroupMessages,
      total: totalMessages + totalGroupMessages
    },
    groups: {
      total: Object.keys(db.groups).length,
      typeGroup: Object.values(db.groups).filter(function(g) { return g.type !== 'channel'; }).length,
      typeChannel: Object.values(db.groups).filter(function(g) { return g.type === 'channel'; }).length
    },
    system: {
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      nodeVersion: process.version,
      dbSize: fs.existsSync(DATA_FILE) ? fs.statSync(DATA_FILE).size : 0,
      uploadsSize: getDirSize(UPLOADS_DIR)
    }
  });
});

function getDirSize(dirPath) {
  var size = 0;
  try {
    var files = fs.readdirSync(dirPath);
    files.forEach(function(file) {
      var filePath = path.join(dirPath, file);
      var stats = fs.statSync(filePath);
      if (stats.isFile()) size += stats.size;
    });
  } catch (e) {}
  return size;
}

// ============================================================================
//  HEALTH CHECK
// ============================================================================
app.get('/health', function(req, res) {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    online: onlineUsers.size,
    users: Object.keys(db.users).length,
    timestamp: new Date().toISOString()
  });
});

// ============================================================================
//  STARTUP
// ============================================================================

// Load database
loadDB();

// Crash prevention
process.on('uncaughtException', function(err) {
  console.error('⚠️ Uncaught Exception:', err.message);
  console.error('   Stack:', err.stack);
});

process.on('unhandledRejection', function(err) {
  console.error('⚠️ Unhandled Rejection:', err);
});

// Start server
var PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', function() {
  console.log('');
  console.log('  ╔══════════════════════════════════════╗');
  console.log('  ║     💬 CHATLY MESSENGER v3.0 💬      ║');
  console.log('  ╠══════════════════════════════════════╣');
  console.log('  ║  Running on 0.0.0.0:' + PORT);
  console.log('  ║  Users: ' + Object.keys(db.users).length + '  Groups: ' + Object.keys(db.groups).length);
  console.log('  ║  Admin: /admin/' + ADMIN_SECRET + '/list');
  console.log('  ╚══════════════════════════════════════╝');
  console.log('');
});

// Heartbeat to keep Render alive
setInterval(function() {
  // heartbeat — prevents Render from sleeping
}, 60000);

// ============================================================================
//  END server.js
// ============================================================================
