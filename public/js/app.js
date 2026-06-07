// ===== CHATLY v2.0 CLIENT — FIXED =====
const API = '';
let token = localStorage.getItem('chatly_token');
let currentUser = null, activeChat = null, activeChatType = 'dm';
let socket = null, typingTimeout = null;
let unreadCounts = {}, lastMessages = {}, onlineUsers = new Set();
let proRequestPending = false, allUsers = [], userGroups = [];
let voiceRecorder = null, voiceChunks = [], voiceStartTime = 0, voiceTimerInterval = null;
let peerConnection = null, localStream = null, callPartner = null, callTimerInterval = null, callStartTime = 0;

const EMOJIS = {
  smileys:['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🥴','😵','🤯','🤠','🥳','😎','🤓','🧐','😕','😟','🙁','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','💩','🤡','👻','👽','👾','🤖'],
  hearts:['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','💕','💞','💓','💗','💖','💘','💝','💟','♥️','🫶','👍','👎','👊','✊','🤛','🤜','👏','🙌','🤝','🙏','✌️','🤞','🤟','🤘','👌','🤌','💪','🦾'],
  hands:['👍','👎','👊','✊','🤛','🤜','👏','🙌','🤝','🙏','✌️','🤞','🤟','🤘','👌','🤌','💪','💃','🕺'],
  objects:['🎉','🎊','🎈','🎁','🏆','🥇','⚽','🏀','🎮','🎯','🎲','🎭','🎨','🎬','🎤','🎧','🎵','🎶','🎹','🎸','🎺','🥁','🔮','✨','⭐','🌟','💫','🔥','💧','🌊','⚡','💥','☀️','🌙','🌈','🦋','🌸'],
  nature:['🌟','✨','💫','⭐','🌙','☀️','🌈','🔥','💧','🌊','⚡','❄️','🌸','🌺','🌻','🌹','🌷','💐','🦋','🐝','🦊','🐺','🐱','🐶','🐼','🐨','🦁','🐯','🐮','🐷','🐸','🐵','🐧','🐬','🐳','🦄']
};

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  if (token) loadApp(); else showAuth();
  setupEventListeners();
});

function showAuth() { document.getElementById('auth-screen').classList.remove('hidden'); document.getElementById('app-screen').classList.add('hidden'); }
function showApp() { document.getElementById('auth-screen').classList.add('hidden'); document.getElementById('app-screen').classList.remove('hidden'); }

function setupEventListeners() {
  // Auth tabs
  document.querySelectorAll('.auth-tab').forEach(tab => tab.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('login-form').classList.toggle('hidden', tab.dataset.tab !== 'login');
    document.getElementById('register-form').classList.toggle('hidden', tab.dataset.tab !== 'register');
    document.getElementById('auth-error').classList.add('hidden');
  }));

  // Login
  document.getElementById('login-form').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const res = await fetch(`${API}/api/login`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ username:document.getElementById('login-username').value.trim(), password:document.getElementById('login-password').value }) });
      const data = await res.json();
      if (!res.ok) return showError(data.error);
      handleLogin(data);
    } catch { showError(t('err_connection')); }
  });

  // Register
  document.getElementById('register-form').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const res = await fetch(`${API}/api/register`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ displayName:document.getElementById('reg-displayname').value.trim(), username:document.getElementById('reg-username').value.trim().toLowerCase(), password:document.getElementById('reg-password').value }) });
      const data = await res.json();
      if (!res.ok) return showError(data.error);
      handleLogin(data);
    } catch { showError(t('err_connection')); }
  });

  // Sidebar tabs
  document.querySelectorAll('.sidebar-tab').forEach(tab => tab.addEventListener('click', () => {
    document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.querySelectorAll('.sidebar-content').forEach(c => c.classList.remove('active'));
    document.getElementById(`contacts-${tab.dataset.stab === 'dms' ? 'dms' : tab.dataset.stab}`).classList.add('active');
  }));

  // Settings
  document.getElementById('btn-settings').addEventListener('click', openSettings);
  document.getElementById('close-settings').addEventListener('click', closeSettings);
  document.getElementById('btn-logout').addEventListener('click', logout);

  document.querySelectorAll('.settings-tab').forEach(tab => tab.addEventListener('click', () => {
    document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.settings-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`stab-${tab.dataset.stab}`).classList.add('active');
  }));

  document.getElementById('btn-save-profile').addEventListener('click', saveProfile);
  document.getElementById('avatar-select').addEventListener('change', function() {
    document.getElementById('settings-avatar').textContent = this.value;
  });
  document.querySelectorAll('.theme-option').forEach(opt => opt.addEventListener('click', () => selectTheme(opt)));
  document.querySelectorAll('.font-option').forEach(opt => opt.addEventListener('click', () => selectFont(opt)));
  document.getElementById('btn-request-pro').addEventListener('click', requestPro);
  document.getElementById('search-users').addEventListener('input', filterCurrentList);

  // Message input
  const msgInput = document.getElementById('message-input');
  msgInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
  msgInput.addEventListener('input', () => { autoResize(msgInput); handleTyping(); });
  document.getElementById('btn-send').addEventListener('click', sendMessage);

  // Emoji
  document.getElementById('btn-emoji').addEventListener('click', () => document.getElementById('emoji-picker').classList.toggle('hidden'));
  populateEmojis('smileys');
  document.querySelectorAll('.emoji-tab').forEach(tab => tab.addEventListener('click', () => {
    document.querySelectorAll('.emoji-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    populateEmojis(tab.dataset.cat);
  }));

  // File upload
  document.getElementById('btn-attach').addEventListener('click', () => document.getElementById('file-input').click());
  document.getElementById('file-input').addEventListener('change', handleFileUpload);

  // Voice
  document.getElementById('btn-voice').addEventListener('click', startVoiceRecording);
  document.getElementById('btn-voice-stop').addEventListener('click', stopVoiceRecording);
  document.getElementById('btn-voice-cancel').addEventListener('click', cancelVoiceRecording);

  // Group create
  document.getElementById('btn-create-group').addEventListener('click', openCreateGroup);
  document.getElementById('btn-create-group-submit').addEventListener('click', createGroup);

  // Group info
  document.getElementById('btn-group-info').addEventListener('click', openGroupInfo);

  // Calls
  document.getElementById('btn-audio-call').addEventListener('click', function() { startCall('audio'); });
  document.getElementById('btn-video-call').addEventListener('click', function() { startCall('video'); });
  document.getElementById('btn-hangup').addEventListener('click', hangupCall);
  document.getElementById('btn-reject-call').addEventListener('click', rejectCall);
  document.getElementById('btn-accept-call').addEventListener('click', acceptCall);
  document.getElementById('btn-toggle-mic').addEventListener('click', toggleMic);
  document.getElementById('btn-toggle-cam').addEventListener('click', toggleCam);

  // Back (mobile)
  document.getElementById('btn-back').addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('mobile-hidden');
    document.getElementById('active-chat').classList.add('hidden');
    document.getElementById('empty-state').classList.remove('hidden');
    activeChat = null;
  });

  // Close pickers
  document.addEventListener('click', e => {
    if (!e.target.closest('#emoji-picker') && !e.target.closest('#btn-emoji')) document.getElementById('emoji-picker').classList.add('hidden');
    if (!e.target.closest('#reaction-picker')) document.getElementById('reaction-picker').classList.add('hidden');
    closeContextMenu();
  });
  document.getElementById('settings-modal').addEventListener('click', e => { if (e.target.id === 'settings-modal') closeSettings(); });
}

function showError(msg) { const el = document.getElementById('auth-error'); el.textContent = msg; el.classList.remove('hidden'); }
function handleLogin(data) { token = data.token; currentUser = data.user; localStorage.setItem('chatly_token', token); showApp(); loadApp(); }

async function loadApp() {
  try {
    const res = await fetch(`${API}/api/me`, { headers:{'Authorization':`Bearer ${token}`} });
    if (!res.ok) { logout(); return; }
    currentUser = await res.json();
    updateUI(); connectSocket(); loadUsers(); loadGroups();
  } catch { logout(); }
}

function updateUI() {
  if (!currentUser) return;
  const av = currentUser.avatar || '😎';
  document.getElementById('my-avatar').textContent = av;
  document.getElementById('my-name').textContent = currentUser.displayName;
  document.getElementById('settings-avatar').textContent = av;
  document.getElementById('my-pro-badge').classList.toggle('hidden', !currentUser.isPro);
  applyTheme(currentUser.isPro ? (currentUser.theme || 'default') : 'default');
  document.getElementById('edit-displayname').value = currentUser.displayName;
  document.getElementById('edit-bio').value = currentUser.bio || '';
  document.getElementById('edit-username').value = currentUser.username;
  document.getElementById('avatar-select').value = currentUser.avatar || '😎';
  updateProStatus(); updateThemeGrid(); updateFontGrid();
}

function applyTheme(theme) {
  document.body.className = document.body.className.split(' ').filter(c => !c.startsWith('theme-')).join(' ').trim();
  if (theme && theme !== 'default') document.body.classList.add(`theme-${theme}`);
}

function updateProStatus() {
  const area = document.getElementById('pro-status-area');
  const btn = document.getElementById('btn-request-pro');
  if (currentUser.isPro) {
    area.className = 'pro-status active-pro';
    area.innerHTML = t('pro_active') + '<br><span style="font-size:11px;opacity:0.8">' + t('pro_active_sub') + '</span>';
    btn.classList.add('hidden');
  } else if (proRequestPending) {
    area.className = 'pro-status pending-pro';
    area.innerHTML = t('pro_pending') + '<br><span style="font-size:11px;opacity:0.8">' + t('pro_pending_sub') + '</span>';
    btn.classList.add('hidden');
  } else {
    area.className = 'pro-status no-pro';
    area.innerHTML = t('pro_free') + '<br><span style="font-size:11px;opacity:0.8">' + t('pro_free_sub') + '</span>';
    btn.classList.remove('hidden'); btn.disabled = false;
  }
}

function updateThemeGrid() {
  document.querySelectorAll('.theme-option').forEach(opt => {
    opt.classList.toggle('selected', opt.dataset.theme === currentUser.theme);
    if (currentUser.isPro && opt.dataset.theme !== 'default') { opt.classList.remove('pro-locked'); opt.classList.add('unlocked'); }
  });
  document.getElementById('theme-note-pro').classList.toggle('hidden', !currentUser.isPro);
  document.getElementById('theme-note-free').classList.toggle('hidden', currentUser.isPro);
}

function updateFontGrid() {
  document.querySelectorAll('.font-option').forEach(opt => {
    opt.classList.toggle('selected', opt.dataset.font === (currentUser.font || 'default'));
    if (currentUser.isPro && opt.dataset.font !== 'default') { opt.classList.remove('pro-locked'); opt.classList.add('unlocked'); }
  });
  document.getElementById('font-note-pro').classList.toggle('hidden', !currentUser.isPro);
  document.getElementById('font-note-free').classList.toggle('hidden', currentUser.isPro);
}

// ===== SOCKET — FIX: disconnect old before creating new =====
function connectSocket() {
  // Prevent duplicate connections
  if (socket) {
    try { socket.removeAllListeners(); socket.disconnect(); } catch(e) {}
  }

  socket = io({ auth:{ token } });

  socket.on('connect', function() { console.log('🔌 Connected, id:', socket.id); });
  socket.on('disconnect', function() { console.log('🔌 Disconnected'); });

  // === FIX #2: Sent messages appear immediately ===
  socket.on('message:sent', function(msg) {
    console.log('📨 message:sent received', msg);
    if (activeChat === msg.to && activeChatType === 'dm') {
      lastMessages[msg.to] = msg;
      appendMessageToDOM(msg, 'dm');
      scrollToBottom();
    }
    renderDMContacts();
  });

  socket.on('message:new', function(msg) {
    console.log('📨 message:new received', msg);
    if (msg.to !== currentUser.username) return;
    lastMessages[msg.from] = msg;
    if (activeChat === msg.from && activeChatType === 'dm') {
      appendMessageToDOM(msg, 'dm');
      scrollToBottom();
      markAsRead(msg.from);
    } else {
      unreadCounts[msg.from] = (unreadCounts[msg.from] || 0) + 1;
    }
    renderDMContacts();
  });

  socket.on('user:typing', function(data) {
    if (data.from === activeChat && activeChatType === 'dm') {
      document.getElementById('typing-name').textContent = getDisplayName(data.from);
      document.getElementById('typing-indicator').classList.toggle('hidden', !data.typing);
    }
  });

  socket.on('group:typing', function(data) {
    if (data.groupId === activeChat && activeChatType === 'group') {
      document.getElementById('typing-name').textContent = getDisplayName(data.from);
      document.getElementById('typing-indicator').classList.toggle('hidden', !data.typing);
    }
  });

  socket.on('user:status', function(data) {
    if (data.status === 'online') onlineUsers.add(data.username); else onlineUsers.delete(data.username);
    if (data.username === activeChat && activeChatType === 'dm') updateChatHeader();
    renderDMContacts();
  });

  socket.on('message:readUpdate', function(data) {
    if (data.chatUser === activeChat && activeChatType === 'dm') loadMessages(activeChat);
  });
  socket.on('message:reaction', function() { if (activeChat && activeChatType === 'dm') loadMessages(activeChat); });
  socket.on('message:pinUpdate', function() { if (activeChat && activeChatType === 'dm') loadMessages(activeChat); });

  socket.on('pro:granted', function(user) { currentUser = user; updateUI(); showToast(t('pro_granted_toast'), 'pro'); });
  socket.on('pro:removed', function(user) { currentUser = user; updateUI(); showToast(t('pro_removed_toast'), 'info'); });

  socket.on('group:newMessage', function(data) {
    if (data.groupId === activeChat && activeChatType === 'group') {
      appendMessageToDOM(data.msg, 'group');
      scrollToBottom();
    }
    loadGroups();
  });
  socket.on('group:messageSent', function(data) {
    console.log('📨 group:messageSent received', data);
    if (data.groupId === activeChat && activeChatType === 'group') {
      appendMessageToDOM(data.msg, 'group');
      scrollToBottom();
    }
    loadGroups();
  });
  socket.on('group:added', function() { loadGroups(); });
  socket.on('group:removed', function(gid) {
    if (gid === activeChat && activeChatType === 'group') {
      activeChat = null;
      document.getElementById('active-chat').classList.add('hidden');
      document.getElementById('empty-state').classList.remove('hidden');
    }
    loadGroups();
  });

  // === FIX #5: Calls ===
  socket.on('call:incoming', handleIncomingCall);
  socket.on('call:answered', handleCallAnswered);
  socket.on('call:ice-candidate', handleRemoteICE);
  socket.on('call:ended', function() { endCallUI(t('call_ended')); });
  socket.on('call:rejected', function() { endCallUI(t('call_rejected')); });
  socket.on('call:unavailable', function() { endCallUI(t('call_unavailable')); showToast(t('call_unavailable'), 'error'); });
}

// ===== USERS & CONTACTS =====
async function loadUsers() {
  try {
    const res = await fetch(`${API}/api/users`, { headers:{'Authorization':`Bearer ${token}`} });
    allUsers = await res.json();
    for (const u of allUsers) {
      try {
        const mr = await fetch(`${API}/api/messages/${u.username}`, { headers:{'Authorization':`Bearer ${token}`} });
        const msgs = await mr.json();
        if (msgs.length) lastMessages[u.username] = msgs[msgs.length - 1];
      } catch {}
    }
    renderDMContacts();
  } catch {}
}

async function loadGroups() {
  try {
    const res = await fetch(`${API}/api/groups`, { headers:{'Authorization':`Bearer ${token}`} });
    userGroups = await res.json();
    renderGroupContacts();
  } catch {}
}

function renderDMContacts() {
  const container = document.getElementById('contacts-dms');
  const search = document.getElementById('search-users').value.toLowerCase();
  let filtered = allUsers.filter(u => u.displayName.toLowerCase().includes(search) || u.username.toLowerCase().includes(search));
  filtered.sort((a, b) => (lastMessages[b.username]?.time || '').localeCompare(lastMessages[a.username]?.time || ''));

  container.innerHTML = filtered.map(u => {
    const lm = lastMessages[u.username];
    const preview = lm ? (lm.type === 'voice' ? '🎙️ ' + t('msg_voice') : lm.type === 'file' ? '📎 ' + (lm.fileInfo?.originalName || t('msg_file')) : lm.text) : t('no_messages');
    return '<div class="contact-item ' + (activeChat === u.username && activeChatType === 'dm' ? 'active' : '') + '" onclick="openDM(\'' + u.username + '\')">' +
      '<div class="avatar">' + (u.avatar||'😎') + '</div>' +
      '<span class="status-dot ' + (onlineUsers.has(u.username)?'online':'offline') + '"></span>' +
      '<div class="contact-info"><div class="contact-name-row"><span class="contact-name">' + esc(u.displayName) + '</span>' + (u.isPro?'<span class="contact-pro-badge">PRO</span>':'') + '</div>' +
      '<div class="contact-last-msg">' + esc(preview) + '</div></div>' +
      '<div class="contact-meta"><span class="contact-time">' + (lm?formatTime(lm.time):'') + '</span>' + (unreadCounts[u.username]>0?'<span class="contact-unread">'+unreadCounts[u.username]+'</span>':'') + '</div></div>';
  }).join('');
}

function renderGroupContacts() {
  const groups = userGroups.filter(g => g.type === 'group');
  const channels = userGroups.filter(g => g.type === 'channel');
  const search = document.getElementById('search-users').value.toLowerCase();

  function renderList(list, containerId, emptyMsg) {
    const el = document.getElementById(containerId);
    const filtered = list.filter(g => g.name.toLowerCase().includes(search));
    if (!filtered.length) { el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px">' + emptyMsg + '</div>'; return; }
    el.innerHTML = filtered.map(g => {
      const lastMsg = g.messages?.slice(-1)[0];
      const preview = lastMsg ? (lastMsg.type === 'voice' ? '🎙️ ' : lastMsg.type === 'file' ? '📎 ' : '') + (lastMsg.text || t('msg_file')) : t('no_messages');
      const mc = g.members?.length || 0;
      return '<div class="contact-item ' + (activeChat === g.id && activeChatType === 'group' ? 'active' : '') + '" onclick="openGroupChat(\'' + g.id + '\')">' +
        '<div class="avatar">' + (g.avatar||'💬') + '</div>' +
        '<div class="contact-info"><div class="contact-name-row"><span class="contact-name">' + esc(g.name) + '</span><span class="contact-type-badge type-' + g.type + '">' + (g.type === 'channel' ? '📢' : '👥') + '</span></div>' +
        '<div class="contact-last-msg">' + esc(preview) + '</div></div>' +
        '<div class="contact-meta"><span class="contact-time">' + (lastMsg?formatTime(lastMsg.time):'') + '</span><span class="contact-time">' + mc + ' 👤</span></div></div>';
    }).join('');
  }

  renderList(groups, 'contacts-groups', 'Нет групп');
  renderList(channels, 'contacts-channels', 'Нет каналов');
}

function renderCurrentContacts() { renderDMContacts(); renderGroupContacts(); }
function filterCurrentList() { renderDMContacts(); renderGroupContacts(); }

// ===== DM CHAT =====
async function openDM(username) {
  activeChat = username; activeChatType = 'dm';
  unreadCounts[username] = 0;
  document.getElementById('empty-state').classList.add('hidden');
  document.getElementById('active-chat').classList.remove('hidden');
  document.getElementById('sidebar').classList.add('mobile-hidden');
  updateChatHeader();
  await loadMessages(username);
  markAsRead(username);
  renderDMContacts();
  document.getElementById('message-input').focus();
}

function updateChatHeader() {
  if (!activeChat) return;
  if (activeChatType === 'dm') {
    const user = allUsers.find(u => u.username === activeChat);
    if (!user) return;
    document.getElementById('chat-avatar').textContent = user.avatar || '😎';
    document.getElementById('chat-user-name').textContent = user.displayName + (user.isPro ? ' 💎' : '');
    const on = onlineUsers.has(activeChat);
    const statusEl = document.getElementById('chat-user-status');
    statusEl.textContent = on ? t('online') : t('offline');
    statusEl.className = 'chat-user-status ' + (on ? '' : 'offline');
    document.getElementById('btn-group-info').classList.add('hidden');
    document.getElementById('btn-audio-call').classList.remove('hidden');
    document.getElementById('btn-video-call').classList.remove('hidden');
  } else {
    const g = userGroups.find(g => g.id === activeChat);
    if (!g) return;
    document.getElementById('chat-avatar').textContent = g.avatar || '💬';
    document.getElementById('chat-user-name').textContent = g.name;
    document.getElementById('chat-user-status').textContent = (g.members?.length || 0) + ' ' + t('members');
    document.getElementById('chat-user-status').className = 'chat-user-status';
    document.getElementById('btn-group-info').classList.remove('hidden');
    document.getElementById('btn-audio-call').classList.add('hidden');
    document.getElementById('btn-video-call').classList.add('hidden');
  }
}

async function loadMessages(username) {
  try {
    const res = await fetch(`${API}/api/messages/${username}`, { headers:{'Authorization':`Bearer ${token}`} });
    const msgs = await res.json();
    renderMessages(msgs, 'dm');
    scrollToBottom();
  } catch (e) { console.error('loadMessages error', e); }
}

async function loadGroupMessages(groupId) {
  try {
    const res = await fetch(`${API}/api/groups/${groupId}/messages`, { headers:{'Authorization':`Bearer ${token}`} });
    const msgs = await res.json();
    renderMessages(msgs, 'group');
    scrollToBottom();
  } catch (e) { console.error('loadGroupMessages error', e); }
}

// ===== RENDER MESSAGES =====
function renderMessages(messages, type) {
  const container = document.getElementById('messages-container');
  let html = '', lastDate = '';
  messages.forEach(function(msg) {
    const date = formatDate(msg.time);
    if (date !== lastDate) { html += '<div class="msg-date-divider"><span>' + date + '</span></div>'; lastDate = date; }
    html += buildMessageHTML(msg, type);
  });
  container.innerHTML = html;
  attachAllMessageEvents(container, type);
}

function buildMessageHTML(msg, type) {
  const isOwn = msg.from === currentUser.username;
  const time = formatTimeShort(msg.time);
  const read = isOwn && type === 'dm' ? (msg.read ? '<span class="msg-read">✓✓</span>' : '<span class="msg-read" style="opacity:0.4">✓</span>') : '';
  const pin = msg.pinned ? '<div class="msg-pin-indicator">' + t('pinned') + '</div>' : '';
  const font = getUserFont(msg.from);

  let sender = '';
  if (!isOwn) {
    const senderUser = allUsers.find(u => u.username === msg.from);
    const senderPro = senderUser?.isPro ? '<span class="contact-pro-badge" style="font-size:8px">PRO</span>' : '';
    let rankBadge = '';
    if (type === 'group' && msg.rank) {
      const g = userGroups.find(g => g.id === activeChat);
      if (g && g.ranks && g.ranks[msg.rank]) {
        const r = g.ranks[msg.rank];
        rankBadge = '<span class="msg-rank" style="background:' + r.color + '">' + (r.icon || '') + ' ' + esc(r.name) + '</span>';
      }
    }
    sender = '<div class="msg-sender">' + esc(getDisplayName(msg.from)) + ' ' + rankBadge + ' ' + senderPro + '</div>';
  }

  // Reactions
  let reactions = '';
  if (msg.reactions && msg.reactions.length) {
    const grouped = {};
    msg.reactions.forEach(function(r) { grouped[r.emoji] = (grouped[r.emoji] || 0) + 1; });
    reactions = '<div class="msg-reactions">';
    Object.keys(grouped).forEach(function(e) { reactions += '<span class="msg-reaction">' + e + ' <span class="reaction-count">' + grouped[e] + '</span></span>'; });
    reactions += '</div>';
  }

  // Content
  let content = '';
  if (msg.type === 'voice' && msg.fileInfo) {
    content = '<div class="msg-voice">' +
      '<button class="msg-voice-btn voice-play-btn" data-state="paused" onclick="toggleVoicePlay(this)">▶️</button>' +
      '<audio src="' + msg.fileInfo.url + '" preload="metadata" onended="voiceEnded(this.parentElement.querySelector(\'.voice-play-btn\'))"></audio>' +
      '<div class="msg-voice-wave">' + Array.from({length:20}, function(_,i) { return '<div class="msg-voice-bar" style="animation-delay:' + (i*0.05) + 's"></div>'; }).join('') + '</div>' +
      '<span class="msg-voice-duration">' + (msg.fileInfo.duration ? Math.round(msg.fileInfo.duration) + 'с' : '--') + '</span>' +
    '</div>';
  } else if (msg.type === 'file' && msg.fileInfo) {
    var isImg = msg.fileInfo.mimetype && msg.fileInfo.mimetype.startsWith('image/');
    if (isImg) {
      content = '<a href="' + msg.fileInfo.url + '" target="_blank"><img src="' + msg.fileInfo.url + '" style="max-width:250px;border-radius:8px;margin:4px 0"></a>';
    }
    content += '<a href="' + msg.fileInfo.url + '" target="_blank" download class="msg-file"><span class="msg-file-icon">' + fileIcon(msg.fileInfo.mimetype) + '</span><div class="msg-file-info"><div class="msg-file-name">' + esc(msg.fileInfo.originalName) + '</div><div class="msg-file-size">' + formatSize(msg.fileInfo.size) + '</div></div></a>';
  } else if (msg.text) {
    content = '<div class="msg-text">' + formatMsgText(msg.text) + '</div>';
  }

  var fontAttr = font ? ' style="font-family:\'' + font + '\'"' : '';
  return '<div class="message ' + (isOwn ? 'own' : 'other') + '" data-msg-id="' + msg.id + '" data-type="' + type + '"' + fontAttr + '>' +
    sender + content + '<div class="msg-time">' + time + ' ' + read + '</div>' + reactions + pin +
  '</div>';
}

// === FIX #2: Proper appendMessage ===
function appendMessageToDOM(msg, type) {
  var container = document.getElementById('messages-container');
  var temp = document.createElement('div');
  temp.innerHTML = buildMessageHTML(msg, type);
  var msgEl = temp.firstElementChild;
  if (msgEl) {
    container.appendChild(msgEl);
    attachSingleMessageEvents(msgEl, msg.from === currentUser.username, type);
  }
}

function attachAllMessageEvents(container, type) {
  container.querySelectorAll('.message').forEach(function(el) {
    var isOwn = el.classList.contains('own');
    attachSingleMessageEvents(el, isOwn, type);
  });
}

function attachSingleMessageEvents(el, isOwn, type) {
  // Remove old listeners by cloning
  if (currentUser && currentUser.isPro) {
    el.addEventListener('dblclick', function(e) { e.preventDefault(); showReactionPicker(e, el.dataset.msgId); });
  }
  el.addEventListener('contextmenu', function(e) { showContextMenu(e, el.dataset.msgId, isOwn); });
}

// === FIX #4: Voice player ===
function toggleVoicePlay(btn) {
  var audio = btn.parentElement.querySelector('audio');
  if (!audio) return;
  if (audio.paused) {
    audio.play().catch(function(e) { console.log('Audio play error:', e); });
    btn.textContent = '⏸';
    btn.dataset.state = 'playing';
  } else {
    audio.pause();
    btn.textContent = '▶️';
    btn.dataset.state = 'paused';
  }
}

function voiceEnded(btn) {
  if (btn) { btn.textContent = '▶️'; btn.dataset.state = 'paused'; }
}

function getUserFont(username) {
  if (username === currentUser.username) return currentUser.font && currentUser.font !== 'default' ? currentUser.font : null;
  var u = allUsers.find(function(u) { return u.username === username; });
  return (u && u.font && u.font !== 'default') ? u.font : null;
}

function formatMsgText(text) {
  var s = esc(text);
  s = s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  s = s.replace(/\*(.+?)\*/g, '<i>$1</i>');
  s = s.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline">$1</a>');
  return s;
}

// ===== SEND =====
function sendMessage() {
  var input = document.getElementById('message-input');
  var text = input.value.trim();
  if (!text || !activeChat || !socket) return;

  if (activeChatType === 'dm') {
    socket.emit('message:send', { to: activeChat, text: text, type: 'text' });
  } else {
    socket.emit('group:message', { groupId: activeChat, text: text, type: 'text' });
  }
  input.value = '';
  autoResize(input);
}

function handleTyping() {
  if (!socket || !activeChat) return;
  if (activeChatType === 'dm') {
    socket.emit('user:typing', { to: activeChat, typing: true });
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(function() { socket.emit('user:typing', { to: activeChat, typing: false }); }, 2000);
  } else {
    socket.emit('group:typing', { groupId: activeChat, typing: true });
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(function() { socket.emit('group:typing', { groupId: activeChat, typing: false }); }, 2000);
  }
}

async function markAsRead(username) {
  try { await fetch(`${API}/api/messages/${username}/read`, { method:'PUT', headers:{'Authorization':`Bearer ${token}`} }); } catch {}
}

// ===== FILE UPLOAD =====
async function handleFileUpload(e) {
  var file = e.target.files[0];
  if (!file) return;
  e.target.value = '';
  var maxSize = currentUser && currentUser.isPro ? 5*1024*1024*1024 : 500*1024*1024;
  if (file.size > maxSize) {
    showToast(currentUser && currentUser.isPro ? t('file_too_big_pro') : t('file_too_big'), 'error');
    return;
  }
  var progId = 'upload-' + Date.now();
  showUploadProgress(progId, file.name);
  var formData = new FormData();
  formData.append('file', file);
  var xhr = new XMLHttpRequest();
  xhr.open('POST', `${API}/api/upload`);
  xhr.setRequestHeader('Authorization', 'Bearer ' + token);
  xhr.upload.onprogress = function(ev) { if (ev.lengthComputable) updateUploadProgress(progId, Math.round(ev.loaded / ev.total * 100)); };
  xhr.onload = function() {
    removeUploadProgress(progId);
    if (xhr.status !== 200) return showToast('❌ Upload error', 'error');
    var fileInfo = JSON.parse(xhr.responseText);
    sendFileMessage(fileInfo);
  };
  xhr.onerror = function() { removeUploadProgress(progId); showToast('❌ Upload error', 'error'); };
  xhr.send(formData);
}

function sendFileMessage(fileInfo) {
  if (activeChatType === 'dm') {
    socket.emit('message:send', { to: activeChat, text: '', type: 'file', fileInfo: fileInfo });
  } else {
    socket.emit('group:message', { groupId: activeChat, text: '', type: 'file', fileInfo: fileInfo });
  }
}

function showUploadProgress(id, name) {
  var container = document.getElementById('toast-container');
  var div = document.createElement('div');
  div.id = id;
  div.className = 'upload-progress';
  div.innerHTML = '<div style="font-size:12px;color:var(--text-secondary)">' + t('upload_progress') + '</div><div style="font-size:13px;font-weight:600">' + esc(name) + '</div><div class="upload-progress-bar"><div class="upload-progress-fill" id="' + id + '-bar" style="width:0%"></div></div>';
  container.appendChild(div);
}
function updateUploadProgress(id, pct) { var bar = document.getElementById(id + '-bar'); if (bar) bar.style.width = pct + '%'; }
function removeUploadProgress(id) { var el = document.getElementById(id); if (el) el.remove(); }

// ===== VOICE RECORDING =====
async function startVoiceRecording() {
  try {
    var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    voiceRecorder = new MediaRecorder(stream);
    voiceChunks = [];
    voiceRecorder.ondataavailable = function(e) { voiceChunks.push(e.data); };
    voiceRecorder.onstop = async function() {
      stream.getTracks().forEach(function(t) { t.stop(); });
      var blob = new Blob(voiceChunks, { type: 'audio/webm' });
      var duration = (Date.now() - voiceStartTime) / 1000;
      if (duration < 1) return;
      await uploadVoice(blob, duration);
    };
    voiceRecorder.start();
    voiceStartTime = Date.now();
    document.getElementById('voice-bar').classList.remove('hidden');
    document.getElementById('message-input-area').classList.add('hidden');
    document.getElementById('btn-voice').classList.add('recording');
    voiceTimerInterval = setInterval(function() {
      var elapsed = Math.floor((Date.now() - voiceStartTime) / 1000);
      document.getElementById('voice-timer').textContent = Math.floor(elapsed/60) + ':' + String(elapsed%60).padStart(2,'0');
    }, 500);
  } catch(e) { showToast('❌ Нет доступа к микрофону', 'error'); }
}

function stopVoiceRecording() {
  if (voiceRecorder && voiceRecorder.state !== 'inactive') voiceRecorder.stop();
  clearInterval(voiceTimerInterval);
  document.getElementById('voice-bar').classList.add('hidden');
  document.getElementById('message-input-area').classList.remove('hidden');
  document.getElementById('btn-voice').classList.remove('recording');
}

function cancelVoiceRecording() {
  if (voiceRecorder && voiceRecorder.state !== 'inactive') {
    voiceRecorder.onstop = null;
    voiceRecorder.stop();
  }
  clearInterval(voiceTimerInterval);
  document.getElementById('voice-bar').classList.add('hidden');
  document.getElementById('message-input-area').classList.remove('hidden');
  document.getElementById('btn-voice').classList.remove('recording');
}

async function uploadVoice(blob, duration) {
  var formData = new FormData();
  formData.append('file', blob, 'voice_' + Date.now() + '.webm');
  formData.append('isVoice', 'true');
  formData.append('duration', String(duration));
  try {
    var res = await fetch(`${API}/api/upload`, { method:'POST', headers:{'Authorization':'Bearer '+token}, body: formData });
    if (!res.ok) return showToast('❌ Voice upload error', 'error');
    var fileInfo = await res.json();
    if (activeChatType === 'dm') socket.emit('message:send', { to: activeChat, text:'', type:'voice', fileInfo: fileInfo });
    else socket.emit('group:message', { groupId: activeChat, text:'', type:'voice', fileInfo: fileInfo });
  } catch(e) { showToast('❌ Voice error', 'error'); }
}

// ===== GROUPS =====
function openCreateGroup() {
  document.getElementById('create-group-modal').classList.remove('hidden');
  var picker = document.getElementById('member-picker');
  picker.innerHTML = allUsers.map(function(u) {
    return '<div class="member-pick-item" data-username="' + u.username + '" onclick="this.classList.toggle(\'selected\')"><div class="avatar">' + (u.avatar||'😎') + '</div>' + esc(u.displayName) + '</div>';
  }).join('');
}

async function createGroup() {
  var name = document.getElementById('cg-name').value.trim();
  if (!name) return;
  var desc = document.getElementById('cg-desc').value.trim();
  var type = document.getElementById('cg-type').value;
  var avatar = document.getElementById('cg-avatar').value;
  var selectedMembers = [];
  document.querySelectorAll('.member-pick-item.selected').forEach(function(el) { selectedMembers.push(el.dataset.username); });

  try {
    var res = await fetch(`${API}/api/groups`, { method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+token}, body:JSON.stringify({ name:name, description:desc, type:type, avatar:avatar }) });
    var group = await res.json();
    for (var i = 0; i < selectedMembers.length; i++) {
      await fetch(`${API}/api/groups/${group.id}/members`, { method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+token}, body:JSON.stringify({ username: selectedMembers[i] }) });
    }
    document.getElementById('create-group-modal').classList.add('hidden');
    document.getElementById('cg-name').value = '';
    document.getElementById('cg-desc').value = '';
    showToast(type === 'channel' ? t('channel_created') : t('group_created'), 'success');
    await loadGroups();
    openGroupChat(group.id);
  } catch(e) { showToast('❌ Error', 'error'); }
}

async function openGroupChat(groupId) {
  activeChat = groupId; activeChatType = 'group';
  document.getElementById('empty-state').classList.add('hidden');
  document.getElementById('active-chat').classList.remove('hidden');
  document.getElementById('sidebar').classList.add('mobile-hidden');
  updateChatHeader();
  await loadGroupMessages(groupId);
  renderGroupContacts();
  document.getElementById('message-input').focus();
}

// === FIX #3: Group/Channel Info with add member ===
async function openGroupInfo() {
  if (activeChatType !== 'group') return;
  try {
    var res = await fetch(`${API}/api/groups/${activeChat}`, { headers:{'Authorization':'Bearer '+token} });
    var g = await res.json();
    renderGroupInfo(g);
    document.getElementById('group-info-modal').classList.remove('hidden');
  } catch(e) { console.error(e); }
}

function renderGroupInfo(g) {
  var isOwner = g.owner === currentUser.username;
  var member = g.members.find(function(m) { return m.username === currentUser.username; });
  var memberRank = member ? member.rank : 'member';
  var rankData = g.ranks[memberRank] || {};
  var canManage = isOwner || (rankData.permissions && (rankData.permissions.includes('manage_members') || rankData.permissions.includes('all')));
  var ranks = g.ranks || {};

  // Find users not in group for adding
  var memberUsernames = (g.resolvedMembers || g.members).map(function(m) { return m.username; });
  var availableUsers = allUsers.filter(function(u) { return memberUsernames.indexOf(u.username) === -1; });

  var membersHTML = (g.resolvedMembers || g.members).map(function(m) {
    var rank = m.rank || 'member';
    var rd = ranks[rank] || {};
    var rankColor = rd.color || '#778CA3';
    var rankName = rd.name || rank;
    var rankIcon = rd.icon || '';

    var rankSelect = '';
    if (isOwner && m.username !== currentUser.username) {
      rankSelect = '<select class="gi-rank-select" onchange="changeRank(\'' + g.id + '\',\'' + m.username + '\',this.value)">';
      Object.keys(ranks).forEach(function(k) {
        rankSelect += '<option value="' + k + '"' + (k===rank?' selected':'') + '>' + (ranks[k].icon||'') + ' ' + ranks[k].name + '</option>';
      });
      rankSelect += '</select>';
    }

    var kickBtn = '';
    if (canManage && m.username !== currentUser.username && m.username !== g.owner) {
      kickBtn = '<button class="btn-danger" style="font-size:11px;padding:4px 10px" onclick="kickMember(\'' + g.id + '\',\'' + m.username + '\')">' + t('kick_user') + '</button>';
    }

    return '<div class="gi-member">' +
      '<div class="avatar">' + (m.avatar||'😎') + '</div>' +
      '<div class="gi-member-info"><div class="gi-member-name">' + esc(m.displayName||m.username) +
        (m.isPro?' <span class="contact-pro-badge" style="font-size:8px">PRO</span>':'') +
        (m.username===g.owner?' <span class="msg-rank" style="background:#FFD700">👑 '+t('rank_owner')+'</span>':'') +
      '</div>' + rankSelect + '</div>' +
      (rank && rank !== 'owner' ? '<span class="gi-member-rank" style="background:' + rankColor + '">' + rankIcon + ' ' + rankName + '</span>' : '') +
      kickBtn + '</div>';
  }).join('');

  // Add member section
  var addMemberHTML = '';
  if (canManage && availableUsers.length > 0) {
    addMemberHTML = '<div class="gi-section" style="margin-top:16px">' +
      '<div class="gi-section-title">➕ ' + t('add_members') + '</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:6px">' +
      availableUsers.map(function(u) {
        return '<button class="member-pick-item" style="border:1px solid var(--border);background:var(--bg-tertiary)" onclick="addMemberToGroup(\'' + g.id + '\',\'' + u.username + '\',this)">' +
          '<div class="avatar">' + (u.avatar||'😎') + '</div>' + esc(u.displayName) + ' ＋</button>';
      }).join('') +
      '</div></div>';
  }

  document.getElementById('gi-title').textContent = g.name;
  document.getElementById('gi-body').innerHTML =
    '<div class="group-info-header">' +
      '<div class="avatar" style="width:60px;height:60px;font-size:30px">' + (g.avatar||'💬') + '</div>' +
      '<div><div class="group-info-name">' + esc(g.name) + '</div>' +
      '<div class="group-info-desc">' + esc(g.description||'') + '</div>' +
      '<span class="group-info-type type-' + g.type + '">' + (g.type === 'channel' ? '📢 Канал' : '👥 Группа') + '</span></div>' +
    '</div>' +
    '<div class="gi-section"><div class="gi-section-title">' + t('members') + ' (' + (g.resolvedMembers||g.members).length + ')</div>' + membersHTML + '</div>' +
    addMemberHTML;

  var footer = document.getElementById('gi-footer');
  if (isOwner) {
    footer.innerHTML = '<button class="btn-danger" onclick="leaveGroup(\'' + g.id + '\')">' + t('delete_group') + '</button>';
  } else {
    footer.innerHTML = '<button class="btn-leave" onclick="leaveGroup(\'' + g.id + '\')">' + t('leave_group') + '</button>';
  }
}

async function addMemberToGroup(groupId, username, btn) {
  try {
    var res = await fetch(`${API}/api/groups/${groupId}/members`, { method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+token}, body:JSON.stringify({ username: username }) });
    if (res.ok) {
      btn.remove();
      showToast('✅ Участник добавлен', 'success');
      openGroupInfo(); // refresh
    } else {
      var data = await res.json();
      showToast('❌ ' + data.error, 'error');
    }
  } catch(e) { showToast('❌ Ошибка', 'error'); }
}

async function changeRank(groupId, username, rank) {
  try {
    await fetch(`${API}/api/groups/${groupId}/rank`, { method:'PUT', headers:{'Content-Type':'application/json','Authorization':'Bearer '+token}, body:JSON.stringify({ username: username, rank: rank }) });
    showToast('✅ Ранг изменён', 'success');
  } catch { showToast('❌ Ошибка', 'error'); }
}

async function kickMember(groupId, username) {
  try {
    await fetch(`${API}/api/groups/${groupId}/members/${username}`, { method:'DELETE', headers:{'Authorization':'Bearer '+token} });
    showToast('✅ Участник удалён', 'success');
    openGroupInfo();
  } catch {}
}

async function leaveGroup(groupId) {
  try {
    await fetch(`${API}/api/groups/${groupId}/members/${currentUser.username}`, { method:'DELETE', headers:{'Authorization':'Bearer '+token} });
    document.getElementById('group-info-modal').classList.add('hidden');
    activeChat = null;
    document.getElementById('active-chat').classList.add('hidden');
    document.getElementById('empty-state').classList.remove('hidden');
    loadGroups();
    showToast('✅ Вы покинули группу', 'success');
  } catch {}
}

// ===== WEBRTC CALLS — FIX #5 =====
var ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];

function startCall(callType) {
  console.log('📞 startCall', callType, 'activeChatType:', activeChatType, 'activeChat:', activeChat);

  if (activeChatType !== 'dm') {
    showToast('📞 Звонки только в ЛС', 'info');
    return;
  }
  if (!activeChat) {
    showToast('❌ Выберите чат', 'error');
    return;
  }

  callPartner = activeChat;
  var isPro = currentUser && currentUser.isPro;

  // Show connecting UI immediately
  var user = allUsers.find(function(u) { return u.username === callPartner; });
  showCallOverlay(callType, false, user);

  var constraints;
  if (callType === 'video') {
    constraints = {
      video: { width: isPro ? 1920 : 640, height: isPro ? 1080 : 480, frameRate: isPro ? 30 : 24 },
      audio: { echoCancellation: true, noiseSuppression: true }
    };
  } else {
    constraints = { audio: { echoCancellation: true, noiseSuppression: true } };
  }

  navigator.mediaDevices.getUserMedia(constraints).then(function(stream) {
    localStream = stream;

    peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    stream.getTracks().forEach(function(t) { peerConnection.addTrack(t, stream); });

    peerConnection.ontrack = function(e) {
      document.getElementById('remote-video').srcObject = e.streams[0];
      document.getElementById('call-no-video').classList.add('hidden');
    };
    peerConnection.onicecandidate = function(e) {
      if (e.candidate) socket.emit('call:ice-candidate', { to: callPartner, candidate: e.candidate });
    };

    peerConnection.createOffer().then(function(offer) {
      return peerConnection.setLocalDescription(offer);
    }).then(function() {
      socket.emit('call:offer', { to: callPartner, offer: peerConnection.localDescription, callType: callType, quality: isPro ? 'hd' : 'sd' });
      showToast(t('call_connecting'), 'info');
    });
  }).catch(function(e) {
    console.error('getUserMedia error:', e);
    endCallUI();
    showToast('❌ Нет доступа к камере/микрофону: ' + e.message, 'error');
  });
}

function handleIncomingCall(data) {
  console.log('📞 Incoming call from', data.from, data);

  callPartner = data.from;
  window._incomingOffer = data.offer;
  window._incomingCallType = data.callType;

  // Show incoming call overlay
  document.getElementById('call-overlay').classList.remove('hidden');
  document.getElementById('call-incoming').classList.remove('hidden');

  // Hide main call controls, show incoming controls
  var cc = document.getElementById('call-controls');
  if (cc) cc.style.display = 'none';
  var pip = document.getElementById('call-pip');
  if (pip) pip.classList.add('hidden');
  document.getElementById('call-timer').textContent = '';

  document.getElementById('incoming-avatar').textContent = data.avatar || '😎';
  document.getElementById('incoming-name').textContent = data.displayName;
  document.getElementById('incoming-type').textContent = data.callType === 'video' ? t('call_video') : t('call_audio');
}

function acceptCall() {
  console.log('📞 Accepting call');
  document.getElementById('call-incoming').classList.add('hidden');
  var cc = document.getElementById('call-controls');
  if (cc) cc.style.display = '';

  var callType = window._incomingCallType || 'audio';
  var isPro = currentUser && currentUser.isPro;

  var constraints;
  if (callType === 'video') {
    constraints = { video: { width: isPro ? 1920 : 640, height: isPro ? 1080 : 480 }, audio: true };
  } else {
    constraints = { audio: true };
  }

  navigator.mediaDevices.getUserMedia(constraints).then(function(stream) {
    localStream = stream;
    peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    stream.getTracks().forEach(function(t) { peerConnection.addTrack(t, stream); });

    peerConnection.ontrack = function(e) {
      document.getElementById('remote-video').srcObject = e.streams[0];
      document.getElementById('call-no-video').classList.add('hidden');
    };
    peerConnection.onicecandidate = function(e) {
      if (e.candidate) socket.emit('call:ice-candidate', { to: callPartner, candidate: e.candidate });
    };

    return peerConnection.setRemoteDescription(window._incomingOffer);
  }).then(function() {
    return peerConnection.createAnswer();
  }).then(function(answer) {
    return peerConnection.setLocalDescription(answer);
  }).then(function() {
    socket.emit('call:answer', { to: callPartner, answer: peerConnection.localDescription });
    var user = allUsers.find(function(u) { return u.username === callPartner; });
    updateCallAvatar(callType, user);
    startCallTimer();
  }).catch(function(e) {
    console.error('Accept call error:', e);
    endCallUI();
    showToast('❌ Ошибка звонка: ' + e.message, 'error');
  });
}

function rejectCall() {
  socket.emit('call:reject', { to: callPartner });
  endCallUI();
}

function handleCallAnswered(data) {
  console.log('📞 Call answered');
  if (peerConnection) {
    peerConnection.setRemoteDescription(data.answer).then(function() {
      startCallTimer();
    }).catch(function(e) { console.error('setRemoteDescription error:', e); });
  }
}

function handleRemoteICE(data) {
  if (peerConnection && data.candidate) {
    peerConnection.addIceCandidate(data.candidate).catch(function(e) { console.error('ICE error:', e); });
  }
}

function hangupCall() {
  if (socket && callPartner) socket.emit('call:hangup', { to: callPartner });
  endCallUI(t('call_ended'));
}

function showCallOverlay(callType, isIncoming, user) {
  document.getElementById('call-overlay').classList.remove('hidden');
  document.getElementById('call-incoming').classList.add('hidden');
  var cc = document.getElementById('call-controls');
  if (cc) cc.style.display = '';

  updateCallAvatar(callType, user);

  // Quality badge
  var isPro = currentUser && currentUser.isPro;
  var qualityEl = document.getElementById('call-quality');
  if (qualityEl) {
    if (isPro) { qualityEl.classList.remove('hidden'); qualityEl.textContent = '💎 HD'; }
    else { qualityEl.classList.add('hidden'); }
  }
}

function updateCallAvatar(callType, user) {
  if (callType === 'video' && localStream) {
    document.getElementById('local-video').srcObject = localStream;
    document.getElementById('call-pip').classList.remove('hidden');
  } else {
    document.getElementById('call-pip').classList.add('hidden');
  }

  if (callType !== 'video' || !localStream || !localStream.getVideoTracks().length) {
    document.getElementById('call-avatar').textContent = user ? (user.avatar || '😎') : '😎';
    document.getElementById('call-name').textContent = user ? user.displayName : (callPartner || 'User');
    document.getElementById('call-no-video').classList.remove('hidden');
  }
}

function startCallTimer() {
  callStartTime = Date.now();
  callTimerInterval = setInterval(function() {
    var s = Math.floor((Date.now() - callStartTime) / 1000);
    document.getElementById('call-timer').textContent = Math.floor(s/60) + ':' + String(s%60).padStart(2,'0');
  }, 1000);
}

function endCallUI(msg) {
  if (localStream) { localStream.getTracks().forEach(function(t) { t.stop(); }); localStream = null; }
  if (peerConnection) { try { peerConnection.close(); } catch(e){} peerConnection = null; }
  clearInterval(callTimerInterval);

  document.getElementById('call-overlay').classList.add('hidden');
  document.getElementById('call-incoming').classList.add('hidden');
  var cc = document.getElementById('call-controls');
  if (cc) cc.style.display = '';
  document.getElementById('remote-video').srcObject = null;
  document.getElementById('local-video').srcObject = null;
  document.getElementById('call-timer').textContent = '0:00';
  callPartner = null;

  if (msg) showToast(msg, 'info');
}

function toggleMic() {
  if (!localStream) return;
  var track = localStream.getAudioTracks()[0];
  if (track) {
    track.enabled = !track.enabled;
    document.getElementById('btn-toggle-mic').classList.toggle('muted', !track.enabled);
    document.getElementById('btn-toggle-mic').textContent = track.enabled ? '🎙️' : '🔇';
  }
}

function toggleCam() {
  if (!localStream) return;
  var track = localStream.getVideoTracks()[0];
  if (track) {
    track.enabled = !track.enabled;
    document.getElementById('btn-toggle-cam').classList.toggle('muted', !track.enabled);
    document.getElementById('btn-toggle-cam').textContent = track.enabled ? '📹' : '🚫';
    if (!track.enabled) document.getElementById('call-no-video').classList.remove('hidden');
    else document.getElementById('call-no-video').classList.add('hidden');
  }
}

// ===== CONTEXT MENU / REACTIONS =====
function showContextMenu(e, msgId, isOwn) {
  e.preventDefault(); closeContextMenu();
  var msg = document.querySelector('[data-msg-id="' + msgId + '"]');
  if (!msg) return;
  var menu = document.createElement('div');
  menu.className = 'msg-context-menu show'; menu.id = 'context-menu';
  if (currentUser && currentUser.isPro) {
    menu.innerHTML += '<button class="msg-context-btn pro-only" onclick="reactToMsg(\'' + msgId + '\')">' + t('ctx_react') + '</button>';
    menu.innerHTML += '<button class="msg-context-btn pro-only" onclick="pinMsg(\'' + msgId + '\')">' + t('ctx_pin') + '</button>';
  }
  menu.innerHTML += '<button class="msg-context-btn" onclick="copyMsg(\'' + msgId + '\')">' + t('ctx_copy') + '</button>';
  msg.style.position = 'relative'; msg.appendChild(menu);
  menu.style[isOwn ? 'right' : 'left'] = '10px'; menu.style.top = '-10px';
}

function closeContextMenu() { var el = document.getElementById('context-menu'); if (el) el.remove(); }

function reactToMsg(msgId) {
  closeContextMenu();
  var btn = document.querySelector('[data-msg-id="' + msgId + '"]');
  if (!btn) return;
  var picker = document.getElementById('reaction-picker');
  picker.classList.remove('hidden');
  var rect = btn.getBoundingClientRect();
  picker.style.top = (rect.top - 50) + 'px'; picker.style.left = rect.left + 'px';
  picker.querySelectorAll('.reaction-btn').forEach(function(b) {
    b.onclick = function() {
      if (activeChatType === 'dm') socket.emit('message:react', { to: activeChat, msgId: msgId, emoji: b.dataset.emoji });
      picker.classList.add('hidden');
    };
  });
}

function pinMsg(msgId) {
  closeContextMenu();
  if (activeChatType === 'dm') socket.emit('message:pin', { to: activeChat, msgId: msgId });
}

function copyMsg(msgId) {
  closeContextMenu();
  var msg = document.querySelector('[data-msg-id="' + msgId + '"] .msg-text');
  if (msg) navigator.clipboard.writeText(msg.textContent).then(function() { showToast(t('copied'), 'success'); });
}

function populateEmojis(cat) {
  document.getElementById('emoji-grid').innerHTML = (EMOJIS[cat]||[]).map(function(e) { return '<button class="emoji-item" onclick="insertEmoji(\'' + e + '\')">' + e + '</button>'; }).join('');
}
function insertEmoji(e) { var i = document.getElementById('message-input'); i.value += e; i.focus(); autoResize(i); }

// ===== SETTINGS =====
function openSettings() { document.getElementById('settings-modal').classList.remove('hidden'); updateUI(); }
function closeSettings() { document.getElementById('settings-modal').classList.add('hidden'); }

async function saveProfile() {
  try {
    var res = await fetch(`${API}/api/profile`, { method:'PUT', headers:{'Content-Type':'application/json','Authorization':'Bearer '+token}, body:JSON.stringify({ displayName:document.getElementById('edit-displayname').value.trim(), bio:document.getElementById('edit-bio').value.trim(), avatar:document.getElementById('avatar-select').value }) });
    currentUser = await res.json(); updateUI(); showToast(t('profile_saved'), 'success');
  } catch { showToast(t('profile_error'), 'error'); }
}

function selectTheme(opt) {
  if (opt.dataset.theme !== 'default' && !(currentUser && currentUser.isPro)) return showToast(t('theme_need_pro'), 'info');
  document.querySelectorAll('.theme-option').forEach(function(o) { o.classList.remove('selected'); });
  opt.classList.add('selected'); applyTheme(opt.dataset.theme);
  fetch(`${API}/api/profile`, { method:'PUT', headers:{'Content-Type':'application/json','Authorization':'Bearer '+token}, body:JSON.stringify({ theme:opt.dataset.theme }) }).then(function(r){return r.json()}).then(function(d){currentUser=d;});
}

function selectFont(opt) {
  if (opt.dataset.font !== 'default' && !(currentUser && currentUser.isPro)) return showToast('💎 Шрифты в PRO', 'info');
  document.querySelectorAll('.font-option').forEach(function(o) { o.classList.remove('selected'); });
  opt.classList.add('selected');
  fetch(`${API}/api/profile`, { method:'PUT', headers:{'Content-Type':'application/json','Authorization':'Bearer '+token}, body:JSON.stringify({ font:opt.dataset.font }) }).then(function(r){return r.json()}).then(function(d){currentUser=d; updateUI();});
  showToast('✅ Шрифт изменён', 'success');
}

async function requestPro() {
  try {
    var res = await fetch(`${API}/api/request-pro`, { method:'POST', headers:{'Authorization':'Bearer '+token} });
    var data = await res.json();
    if (res.ok) {
      proRequestPending = true;
      document.getElementById('pro-request-msg').textContent = t('pro_request_sent');
      document.getElementById('pro-request-msg').className = 'pro-request-msg info';
      document.getElementById('pro-request-msg').classList.remove('hidden');
      document.getElementById('btn-request-pro').disabled = true;
      updateProStatus(); showToast(t('pro_request_sent'), 'info');
    } else {
      if (data.error === 'Request already pending') { proRequestPending = true; updateProStatus(); }
    }
  } catch { showToast(t('err_connection'), 'error'); }
}

function logout() {
  token = null; currentUser = null; activeChat = null;
  localStorage.removeItem('chatly_token');
  if (socket) socket.disconnect();
  showAuth(); document.body.className = '';
}

// ===== UTILS =====
function esc(s) { if (!s) return ''; var d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; }
function formatTime(iso) { return new Date(iso).toLocaleTimeString('uk-UA',{hour:'2-digit',minute:'2-digit'}); }
function formatTimeShort(iso) { return formatTime(iso); }
function formatDate(iso) {
  var d = new Date(iso), now = new Date();
  if (d.toDateString() === now.toDateString()) return t('today');
  var y = new Date(now); y.setDate(y.getDate()-1);
  if (d.toDateString() === y.toDateString()) return t('yesterday');
  return d.toLocaleDateString('uk-UA',{day:'numeric',month:'long'});
}
function getDisplayName(un) { var u = allUsers.find(function(u){return u.username===un}); return u ? u.displayName : un; }
function autoResize(ta) { ta.style.height='auto'; ta.style.height=Math.min(ta.scrollHeight,120)+'px'; }
function scrollToBottom() { var c = document.getElementById('messages-container'); setTimeout(function(){c.scrollTop=c.scrollHeight},50); }

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + ' KB';
  if (bytes < 1024*1024*1024) return (bytes/1024/1024).toFixed(1) + ' MB';
  return (bytes/1024/1024/1024).toFixed(1) + ' GB';
}
function fileIcon(mime) {
  if (!mime) return '📄';
  if (mime.startsWith('image/')) return '🖼️';
  if (mime.startsWith('video/')) return '🎬';
  if (mime.startsWith('audio/')) return '🎵';
  if (mime.includes('pdf')) return '📕';
  if (mime.includes('zip') || mime.includes('rar')) return '📦';
  return '📄';
}

function showToast(message, type) {
  type = type || 'info';
  var c = document.getElementById('toast-container');
  var t = document.createElement('div');
  t.className = 'toast ' + type; t.textContent = message;
  c.appendChild(t); setTimeout(function(){t.remove()}, 4000);
}
