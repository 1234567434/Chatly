// ===== CHATLY v2.2 CLIENT — COMPLETE REWRITE =====
var API = '';
var token = localStorage.getItem('chatly_token');
var currentUser = null, activeChat = null, activeChatType = 'dm';
var socket = null, typingTimeout = null;
var unreadCounts = {}, lastMessages = {}, onlineUsers = new Set();
var proRequestPending = false, allUsers = [], userGroups = [];
var voiceRecorder = null, voiceChunks = [], voiceStartTime = 0, voiceTimerInterval = null;
var peerConnection = null, localStream = null, callPartner = null, callTimerInterval = null, callStartTime = 0;

// ===== EMOJI DATA =====
var EMOJIS = {
  smileys: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🥴','😵','🤯','🤠','🥳','😎','🤓','🧐','😕','😟','🙁','😮','😯','😲','😳','🥺','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','💩','🤡','👻','👽','👾','🤖'],
  hearts: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','💕','💞','💓','💗','💖','💘','💝','💟','♥️','🫶','👍','👎','👊','✊','🤛','🤜','👏','🙌','🤝','🙏','✌️','🤞','🤟','🤘','👌','🤌','💪'],
  hands: ['👍','👎','👊','✊','🤛','🤜','👏','🙌','🤝','🙏','✌️','🤞','🤟','🤘','👌','💪','💃','🕺'],
  objects: ['🎉','🎊','🎈','🎁','🏆','🥇','⚽','🏀','🎮','🎯','🎲','🎭','🎨','🎬','🎤','🎧','🎵','🎶','🎹','🎸','🔮','✨','⭐','🌟','💫','🔥','💧','🌊','⚡','💥','☀️','🌙','🌈','🦋','🌸'],
  nature: ['🌟','✨','💫','⭐','🌙','☀️','🌈','🔥','💧','🌊','⚡','❄️','🌸','🌺','🌻','🌹','🌷','💐','🦋','🐝','🦊','🐺','🐱','🐶','🐼','🐨','🦁','🐯','🐸','🐵','🐧','🐬','🐳','🦄']
};

// ICE Servers for WebRTC
var ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  }
];

// ===== INIT =====
document.addEventListener('DOMContentLoaded', function() {
  if (token) {
    loadApp();
  } else {
    showAuth();
  }
  setupEventListeners();
});

function showAuth() {
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('app-screen').classList.add('hidden');
}

function showApp() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app-screen').classList.remove('hidden');
}

// ===== EVENT LISTENERS =====
function setupEventListeners() {
  // Auth tabs
  document.querySelectorAll('.auth-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      document.querySelectorAll('.auth-tab').forEach(function(t) { t.classList.remove('active'); });
      tab.classList.add('active');
      document.getElementById('login-form').classList.toggle('hidden', tab.dataset.tab !== 'login');
      document.getElementById('register-form').classList.toggle('hidden', tab.dataset.tab !== 'register');
      document.getElementById('auth-error').classList.add('hidden');
    });
  });

  // Login form
  document.getElementById('login-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    var username = document.getElementById('login-username').value.trim();
    var password = document.getElementById('login-password').value;
    if (!username || !password) return showError(t('err_invalid'));
    try {
      var res = await fetch(API + '/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username, password: password })
      });
      var data = await res.json();
      if (!res.ok) return showError(data.error || t('err_invalid'));
      handleLogin(data);
    } catch (err) {
      showError(t('err_connection'));
    }
  });

  // Register form
  document.getElementById('register-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    var displayName = document.getElementById('reg-displayname').value.trim();
    var username = document.getElementById('reg-username').value.trim().toLowerCase();
    var password = document.getElementById('reg-password').value;
    if (!displayName || !username || !password) return showError(t('err_invalid'));
    if (username.length < 3) return showError(t('err_invalid'));
    if (password.length < 4) return showError(t('err_invalid'));
    try {
      var res = await fetch(API + '/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: displayName, username: username, password: password })
      });
      var data = await res.json();
      if (!res.ok) return showError(data.error || t('err_taken'));
      handleLogin(data);
    } catch (err) {
      showError(t('err_connection'));
    }
  });

  // Sidebar tabs (DM / Groups / Channels)
  document.querySelectorAll('.sidebar-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      document.querySelectorAll('.sidebar-tab').forEach(function(t) { t.classList.remove('active'); });
      tab.classList.add('active');
      document.querySelectorAll('.sidebar-content').forEach(function(c) { c.classList.remove('active'); });
      var target = tab.dataset.stab;
      if (target === 'dms') {
        document.getElementById('contacts-dms').classList.add('active');
      } else if (target === 'groups') {
        document.getElementById('contacts-groups').classList.add('active');
      } else if (target === 'channels') {
        document.getElementById('contacts-channels').classList.add('active');
      }
    });
  });

  // Settings
  document.getElementById('btn-settings').addEventListener('click', openSettings);
  document.getElementById('close-settings').addEventListener('click', closeSettings);
  document.getElementById('btn-logout').addEventListener('click', logout);

  // Settings tabs
  document.querySelectorAll('.settings-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      document.querySelectorAll('.settings-tab').forEach(function(t) { t.classList.remove('active'); });
      document.querySelectorAll('.settings-content').forEach(function(c) { c.classList.remove('active'); });
      tab.classList.add('active');
      document.getElementById('stab-' + tab.dataset.stab).classList.add('active');
    });
  });

  // Save profile
  document.getElementById('btn-save-profile').addEventListener('click', saveProfile);

  // Avatar preview
  document.getElementById('avatar-select').addEventListener('change', function() {
    document.getElementById('settings-avatar').textContent = this.value;
  });

  // Themes
  document.querySelectorAll('.theme-option').forEach(function(opt) {
    opt.addEventListener('click', function() { selectTheme(opt); });
  });

  // Fonts
  document.querySelectorAll('.font-option').forEach(function(opt) {
    opt.addEventListener('click', function() { selectFont(opt); });
  });

  // PRO request
  document.getElementById('btn-request-pro').addEventListener('click', requestPro);

  // Search
  document.getElementById('search-users').addEventListener('input', filterCurrentList);

  // Message input
  var msgInput = document.getElementById('message-input');
  msgInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  msgInput.addEventListener('input', function() {
    autoResize(msgInput);
    handleTyping();
  });
  document.getElementById('btn-send').addEventListener('click', sendMessage);

  // Emoji picker
  document.getElementById('btn-emoji').addEventListener('click', function() {
    document.getElementById('emoji-picker').classList.toggle('hidden');
  });
  populateEmojis('smileys');
  document.querySelectorAll('.emoji-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      document.querySelectorAll('.emoji-tab').forEach(function(t) { t.classList.remove('active'); });
      tab.classList.add('active');
      populateEmojis(tab.dataset.cat);
    });
  });

  // File upload
  document.getElementById('btn-attach').addEventListener('click', function() {
    document.getElementById('file-input').click();
  });
  document.getElementById('file-input').addEventListener('change', handleFileUpload);

  // Voice recording
  document.getElementById('btn-voice').addEventListener('click', startVoiceRecording);
  document.getElementById('btn-voice-stop').addEventListener('click', stopVoiceRecording);
  document.getElementById('btn-voice-cancel').addEventListener('click', cancelVoiceRecording);

  // Groups
  document.getElementById('btn-create-group').addEventListener('click', openCreateGroup);
  document.getElementById('btn-create-group-submit').addEventListener('click', createGroup);
  document.getElementById('btn-group-info').addEventListener('click', openGroupInfo);

  // Calls
  document.getElementById('btn-audio-call').addEventListener('click', function() { startCall('audio'); });
  document.getElementById('btn-video-call').addEventListener('click', function() { startCall('video'); });
  document.getElementById('btn-hangup').addEventListener('click', hangupCall);
  document.getElementById('btn-reject-call').addEventListener('click', rejectCall);
  document.getElementById('btn-accept-call').addEventListener('click', acceptCall);
  document.getElementById('btn-toggle-mic').addEventListener('click', toggleMic);
  document.getElementById('btn-toggle-cam').addEventListener('click', toggleCam);

  // Mobile back button
  document.getElementById('btn-back').addEventListener('click', function() {
    document.getElementById('sidebar').classList.remove('mobile-hidden');
    document.getElementById('active-chat').classList.add('hidden');
    document.getElementById('empty-state').classList.remove('hidden');
    activeChat = null;
  });

  // Close pickers on outside click
  document.addEventListener('click', function(e) {
    if (!e.target.closest('#emoji-picker') && !e.target.closest('#btn-emoji')) {
      document.getElementById('emoji-picker').classList.add('hidden');
    }
    if (!e.target.closest('#reaction-picker')) {
      document.getElementById('reaction-picker').classList.add('hidden');
    }
    closeContextMenu();
  });

  // Close settings modal on overlay click
  document.getElementById('settings-modal').addEventListener('click', function(e) {
    if (e.target.id === 'settings-modal') closeSettings();
  });
}

// ===== AUTH =====
function showError(msg) {
  var el = document.getElementById('auth-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function handleLogin(data) {
  token = data.token;
  currentUser = data.user;
  localStorage.setItem('chatly_token', token);
  showApp();
  loadApp();
}

async function loadApp() {
  try {
    var res = await fetch(API + '/api/me', { headers: { 'Authorization': 'Bearer ' + token } });
    if (!res.ok) { logout(); return; }
    currentUser = await res.json();
    updateUI();
    connectSocket();
    loadUsers();
    loadGroups();
  } catch (err) {
    logout();
  }
}

// ===== UI UPDATE =====
function updateUI() {
  if (!currentUser) return;
  var av = currentUser.avatar || '😎';

  // Sidebar footer
  document.getElementById('my-avatar').textContent = av;
  document.getElementById('my-name').textContent = currentUser.displayName;
  var proBadge = document.getElementById('my-pro-badge');
  if (currentUser.isPro) {
    proBadge.classList.remove('hidden');
  } else {
    proBadge.classList.add('hidden');
  }

  // Settings profile
  var settingsAvatar = document.getElementById('settings-avatar');
  if (settingsAvatar) settingsAvatar.textContent = av;
  var editDisplayName = document.getElementById('edit-displayname');
  if (editDisplayName) editDisplayName.value = currentUser.displayName || '';
  var editBio = document.getElementById('edit-bio');
  if (editBio) editBio.value = currentUser.bio || '';
  var editUsername = document.getElementById('edit-username');
  if (editUsername) editUsername.value = currentUser.username || '';
  var avatarSelect = document.getElementById('avatar-select');
  if (avatarSelect && currentUser.avatar) avatarSelect.value = currentUser.avatar;

  // Apply theme
  if (currentUser.theme && currentUser.theme !== 'default') {
    applyTheme(currentUser.theme);
  } else {
    document.body.className = document.body.className.replace(/theme-\w+/g, '').trim();
  }

  // Apply font to messages
  if (currentUser.font && currentUser.font !== 'default') {
    document.documentElement.style.setProperty('--msg-font', currentUser.font);
  } else {
    document.documentElement.style.removeProperty('--msg-font');
  }

  updateProStatus();
  updateThemeGrid();
  updateFontGrid();
}

function applyTheme(theme) {
  // Remove old theme classes
  document.body.className = document.body.className.replace(/theme-\w+/g, '').trim();
  if (theme && theme !== 'default') {
    document.body.classList.add('theme-' + theme);
  }
}

function updateProStatus() {
  var area = document.getElementById('pro-status-area');
  if (!area || !currentUser) return;
  var btn = document.getElementById('btn-request-pro');
  var noteFree = document.getElementById('theme-note-free');
  var notePro = document.getElementById('theme-note-pro');
  var fontNoteFree = document.getElementById('font-note-free');
  var fontNotePro = document.getElementById('font-note-pro');

  if (currentUser.isPro) {
    area.className = 'pro-status active-pro';
    area.innerHTML = '<div>' + t('pro_active') + '</div><div style="font-size:12px;margin-top:4px">' + t('pro_active_sub') + '</div>';
    if (btn) { btn.style.display = 'none'; }
    if (noteFree) noteFree.classList.add('hidden');
    if (notePro) notePro.classList.remove('hidden');
    if (fontNoteFree) fontNoteFree.classList.add('hidden');
    if (fontNotePro) fontNotePro.classList.remove('hidden');
  } else if (proRequestPending) {
    area.className = 'pro-status pending-pro';
    area.innerHTML = '<div>' + t('pro_pending') + '</div><div style="font-size:12px;margin-top:4px">' + t('pro_pending_sub') + '</div>';
    if (btn) { btn.disabled = true; btn.textContent = t('pro_already_pending'); }
    if (noteFree) noteFree.classList.remove('hidden');
    if (notePro) notePro.classList.add('hidden');
    if (fontNoteFree) fontNoteFree.classList.remove('hidden');
    if (fontNotePro) fontNotePro.classList.add('hidden');
  } else {
    area.className = 'pro-status no-pro';
    area.innerHTML = '<div>' + t('pro_free') + '</div><div style="font-size:12px;margin-top:4px">' + t('pro_free_sub') + '</div>';
    if (btn) { btn.style.display = ''; btn.disabled = false; }
    if (noteFree) noteFree.classList.remove('hidden');
    if (notePro) notePro.classList.add('hidden');
    if (fontNoteFree) fontNoteFree.classList.remove('hidden');
    if (fontNotePro) fontNotePro.classList.add('hidden');
  }
}

function updateThemeGrid() {
  document.querySelectorAll('.theme-option').forEach(function(opt) {
    opt.classList.toggle('selected', opt.dataset.theme === (currentUser.theme || 'default'));
  });
}

function updateFontGrid() {
  document.querySelectorAll('.font-option').forEach(function(opt) {
    opt.classList.toggle('selected', opt.dataset.font === (currentUser.font || 'default'));
  });
}

// ===== SOCKET CONNECTION =====
function connectSocket() {
  // Disconnect old socket if exists (fix for double messages)
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }

  socket = io({ auth: { token: token } });

  socket.on('connect', function() {
    console.log('🔌 Socket connected');
  });

  socket.on('disconnect', function() {
    console.log('🔌 Socket disconnected');
  });

  // ===== DM Messages =====
  socket.on('message:new', function(msg) {
    console.log('📨 message:new', msg);
    // Update last message for contact list
    var from = msg.from;
    lastMessages[from] = msg;
    if (activeChat === from && activeChatType === 'dm') {
      // Already in this chat, append message
      appendMessageToDOM(msg, 'dm');
      scrollToBottom();
      markAsRead(from);
    } else {
      // Not in this chat, increase unread count
      if (!unreadCounts[from]) unreadCounts[from] = 0;
      unreadCounts[from]++;
      showToast(getDisplayName(from) + ': ' + (msg.text || t('msg_file')), 'info');
    }
    renderDMContacts();
  });

  socket.on('message:sent', function(msg) {
    console.log('✅ message:sent', msg);
    var to = msg.to;
    lastMessages[to] = msg;
    if (activeChat === to && activeChatType === 'dm') {
      appendMessageToDOM(msg, 'dm');
      scrollToBottom();
    }
    renderDMContacts();
  });

  socket.on('message:readUpdate', function(data) {
    console.log('👁️ message:readUpdate', data);
    if (activeChat === data.chatUser && activeChatType === 'dm') {
      // Re-render messages to show read status
      loadMessages(activeChat);
    }
  });

  socket.on('message:reaction', function(data) {
    console.log('😍 message:reaction', data);
    if (activeChatType === 'dm') {
      loadMessages(activeChat);
    }
  });

  socket.on('message:pinUpdate', function(data) {
    console.log('📌 message:pinUpdate', data);
    if (activeChatType === 'dm') {
      loadMessages(activeChat);
      // Update pinned bar
      updatePinnedMessage(data.msg);
    }
  });

  // ===== User Status =====
  socket.on('user:status', function(data) {
    console.log('👤 user:status', data);
    if (data.status === 'online') {
      onlineUsers.add(data.username);
    } else {
      onlineUsers.delete(data.username);
    }
    // Update chat header if viewing this user
    if (activeChat === data.username && activeChatType === 'dm') {
      updateChatHeader();
    }
    renderDMContacts();
  });

  // ===== Typing =====
  socket.on('user:typing', function(data) {
    if (activeChat === data.from && activeChatType === 'dm') {
      var indicator = document.getElementById('typing-indicator');
      var nameEl = document.getElementById('typing-name');
      if (data.typing) {
        nameEl.textContent = getDisplayName(data.from);
        indicator.classList.remove('hidden');
      } else {
        indicator.classList.add('hidden');
      }
    }
  });

  // ===== Group Messages =====
  socket.on('group:newMessage', function(data) {
    console.log('👥 group:newMessage', data);
    var gid = data.groupId;
    var msg = data.msg;
    lastMessages[gid] = msg;
    if (activeChat === gid && activeChatType === 'group') {
      appendMessageToDOM(msg, 'group');
      scrollToBottom();
    } else {
      if (!unreadCounts[gid]) unreadCounts[gid] = 0;
      unreadCounts[gid]++;
      var group = userGroups.find(function(g) { return g.id === gid; });
      showToast((group ? group.name : 'Group') + ': ' + (msg.text || t('msg_file')), 'info');
    }
    renderGroupContacts();
  });

  socket.on('group:messageSent', function(data) {
    console.log('✅ group:messageSent', data);
    var gid = data.groupId;
    var msg = data.msg;
    lastMessages[gid] = msg;
    if (activeChat === gid && activeChatType === 'group') {
      appendMessageToDOM(msg, 'group');
      scrollToBottom();
    }
    renderGroupContacts();
  });

  socket.on('group:typing', function(data) {
    if (activeChat === data.groupId && activeChatType === 'group') {
      var indicator = document.getElementById('typing-indicator');
      var nameEl = document.getElementById('typing-name');
      if (data.typing) {
        nameEl.textContent = getDisplayName(data.from);
        indicator.classList.remove('hidden');
      } else {
        indicator.classList.add('hidden');
      }
    }
  });

  socket.on('group:added', function(data) {
    console.log('➕ group:added', data);
    loadGroups();
    showToast(t('member_added'), 'success');
  });

  socket.on('group:removed', function(data) {
    console.log('➖ group:removed', data);
    loadGroups();
  });

  // ===== WebRTC Calls =====
  socket.on('call:incoming', function(data) {
    console.log('📞 Incoming call from', data.from);
    handleIncomingCall(data);
  });

  socket.on('call:answered', function(data) {
    console.log('📞 Call answered');
    handleCallAnswered(data);
  });

  socket.on('call:ice-candidate', function(data) {
    handleRemoteICE(data);
  });

  socket.on('call:ended', function(data) {
    console.log('📞 Call ended by remote');
    endCallUI(t('call_ended'));
  });

  socket.on('call:rejected', function(data) {
    console.log('📞 Call rejected');
    endCallUI(t('call_rejected'));
  });

  socket.on('call:unavailable', function(data) {
    console.log('📞 User unavailable');
    endCallUI(t('call_unavailable'));
  });

  // ===== PRO Updates =====
  socket.on('pro:granted', function(user) {
    console.log('💎 PRO granted!');
    currentUser = user;
    updateUI();
    showToast(t('pro_granted_toast'), 'success');
  });

  socket.on('pro:removed', function(user) {
    console.log('🔻 PRO removed');
    currentUser = user;
    updateUI();
    showToast(t('pro_removed_toast'), 'info');
  });
}

// ===== USERS & CONTACTS =====
async function loadUsers() {
  try {
    var res = await fetch(API + '/api/users', { headers: { 'Authorization': 'Bearer ' + token } });
    allUsers = await res.json();
    renderDMContacts();
  } catch (err) {
    console.error('Load users error:', err);
  }
}

async function loadGroups() {
  try {
    var res = await fetch(API + '/api/groups', { headers: { 'Authorization': 'Bearer ' + token } });
    userGroups = await res.json();
    renderGroupContacts();
  } catch (err) {
    console.error('Load groups error:', err);
  }
}

function renderDMContacts() {
  var list = document.getElementById('contacts-dms');
  if (!list) return;
  var search = (document.getElementById('search-users').value || '').toLowerCase();

  var filtered = allUsers.filter(function(u) {
    return u.displayName.toLowerCase().includes(search) || u.username.toLowerCase().includes(search);
  });

  // Sort: online first, then alphabetically
  filtered.sort(function(a, b) {
    var aOnline = onlineUsers.has(a.username);
    var bOnline = onlineUsers.has(b.username);
    if (aOnline && !bOnline) return -1;
    if (!aOnline && bOnline) return 1;
    return a.displayName.localeCompare(b.displayName);
  });

  list.innerHTML = filtered.map(function(u) {
    var isOnline = onlineUsers.has(u.username);
    var lastMsg = lastMessages[u.username];
    var unread = unreadCounts[u.username] || 0;
    var isActive = activeChat === u.username && activeChatType === 'dm';

    var html = '<div class="contact-item' + (isActive ? ' active' : '') + '" onclick="openDM(\'' + u.username + '\')">';
    html += '<div class="avatar">' + (u.avatar || '😎') + '</div>';
    html += '<div class="status-dot ' + (isOnline ? 'online' : 'offline') + '"></div>';
    html += '<div class="contact-info">';
    html += '<div class="contact-name-row">';
    html += '<span class="contact-name">' + esc(u.displayName) + '</span>';
    if (u.isPro) html += '<span class="contact-pro-badge">💎 PRO</span>';
    html += '</div>';
    if (lastMsg) {
      html += '<div class="contact-last-msg">' + esc(lastMsg.text || t('msg_file')).substring(0, 40) + '</div>';
    }
    html += '</div>';
    html += '<div class="contact-meta">';
    if (lastMsg) html += '<span class="contact-time">' + formatTimeShort(lastMsg.time) + '</span>';
    if (unread > 0) html += '<span class="contact-unread">' + unread + '</span>';
    html += '</div>';
    html += '</div>';
    return html;
  }).join('');
}

function renderGroupContacts() {
  var groupsList = document.getElementById('contacts-groups');
  var channelsList = document.getElementById('contacts-channels');
  if (!groupsList || !channelsList) return;
  var search = (document.getElementById('search-users').value || '').toLowerCase();

  var groups = userGroups.filter(function(g) { return g.type !== 'channel' && g.name.toLowerCase().includes(search); });
  var channels = userGroups.filter(function(g) { return g.type === 'channel' && g.name.toLowerCase().includes(search); });

  var renderItems = function(items, type) {
    return items.map(function(g) {
      var lastMsg = lastMessages[g.id] || (g.messages && g.messages.length > 0 ? g.messages[g.messages.length - 1] : null);
      var unread = unreadCounts[g.id] || 0;
      var isActive = activeChat === g.id && activeChatType === 'group';
      var memberCount = g.members ? g.members.length : 0;

      var html = '<div class="contact-item' + (isActive ? ' active' : '') + '" onclick="openGroupChat(\'' + g.id + '\')">';
      html += '<div class="avatar">' + (g.avatar || '💬') + '</div>';
      html += '<div class="contact-info">';
      html += '<div class="contact-name-row">';
      html += '<span class="contact-name">' + esc(g.name) + '</span>';
      html += '<span class="contact-type-badge type-' + type + '">' + (type === 'channel' ? '📢' : '👥') + '</span>';
      html += '</div>';
      if (lastMsg) {
        var preview = lastMsg.text || t('msg_file');
        if (lastMsg.from) preview = getDisplayName(lastMsg.from) + ': ' + preview;
        html += '<div class="contact-last-msg">' + esc(preview).substring(0, 40) + '</div>';
      } else {
        html += '<div class="contact-last-msg">' + memberCount + ' ' + t('members') + '</div>';
      }
      html += '</div>';
      html += '<div class="contact-meta">';
      if (lastMsg) html += '<span class="contact-time">' + formatTimeShort(lastMsg.time) + '</span>';
      if (unread > 0) html += '<span class="contact-unread">' + unread + '</span>';
      html += '</div>';
      html += '</div>';
      return html;
    }).join('');
  };

  groupsList.innerHTML = renderItems(groups, 'group');
  channelsList.innerHTML = renderItems(channels, 'channel');
}

function renderCurrentContacts() {
  renderDMContacts();
  renderGroupContacts();
}

function filterCurrentList() {
  renderDMContacts();
  renderGroupContacts();
}

// ===== DM CHAT =====
async function openDM(username) {
  activeChat = username;
  activeChatType = 'dm';
  unreadCounts[username] = 0;

  document.getElementById('empty-state').classList.add('hidden');
  document.getElementById('active-chat').classList.remove('hidden');
  document.getElementById('sidebar').classList.add('mobile-hidden');

  updateChatHeader();
  await loadMessages(username);
  renderDMContacts();

  document.getElementById('message-input').focus();
}

function updateChatHeader() {
  var avatarEl = document.getElementById('chat-avatar');
  var nameEl = document.getElementById('chat-user-name');
  var statusEl = document.getElementById('chat-user-status');
  var groupInfoBtn = document.getElementById('btn-group-info');
  var audioCallBtn = document.getElementById('btn-audio-call');
  var videoCallBtn = document.getElementById('btn-video-call');

  if (activeChatType === 'dm') {
    var user = allUsers.find(function(u) { return u.username === activeChat; });
    if (user) {
      avatarEl.textContent = user.avatar || '😎';
      nameEl.textContent = user.displayName;
      if (user.isPro) nameEl.textContent += ' 💎';
      var isOnline = onlineUsers.has(activeChat);
      statusEl.textContent = isOnline ? t('online') : t('offline');
      statusEl.style.color = isOnline ? 'var(--success)' : 'var(--text-muted)';
    }
    if (groupInfoBtn) groupInfoBtn.style.display = 'none';
    if (audioCallBtn) audioCallBtn.style.display = '';
    if (videoCallBtn) videoCallBtn.style.display = '';
  } else if (activeChatType === 'group') {
    var group = userGroups.find(function(g) { return g.id === activeChat; });
    if (group) {
      avatarEl.textContent = group.avatar || '💬';
      nameEl.textContent = group.name;
      var memberCount = group.members ? group.members.length : 0;
      statusEl.textContent = memberCount + ' ' + t('members');
      statusEl.style.color = 'var(--text-secondary)';
    }
    if (groupInfoBtn) groupInfoBtn.style.display = '';
    if (audioCallBtn) audioCallBtn.style.display = 'none';
    if (videoCallBtn) videoCallBtn.style.display = 'none';
  }
}

async function loadMessages(username) {
  try {
    var res = await fetch(API + '/api/messages/' + username, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    var msgs = await res.json();
    renderMessages(msgs, 'dm');
    scrollToBottom();
  } catch (err) {
    console.error('Load messages error:', err);
  }
}

async function loadGroupMessages(groupId) {
  try {
    var res = await fetch(API + '/api/groups/' + groupId + '/messages', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    var msgs = await res.json();
    renderMessages(msgs, 'group');
    scrollToBottom();
  } catch (err) {
    console.error('Load group messages error:', err);
  }
}

// ===== RENDER MESSAGES =====
function renderMessages(msgs, type) {
  var container = document.getElementById('messages-container');
  container.innerHTML = '';

  // Check for pinned message
  var pinned = null;

  var lastDate = '';
  msgs.forEach(function(msg) {
    // Date separator
    var msgDate = formatDate(msg.time);
    if (msgDate !== lastDate) {
      var sep = document.createElement('div');
      sep.className = 'date-separator';
      sep.textContent = msgDate;
      container.appendChild(sep);
      lastDate = msgDate;
    }
    appendMessageToDOM(msg, type);
    if (msg.pinned) pinned = msg;
  });

  // Show pinned bar
  updatePinnedMessage(pinned);
  attachMsgEvents(container);
}

function buildMsgHTML(msg, type) {
  var isOwn = msg.from === currentUser.username;
  var user = allUsers.find(function(u) { return u.username === msg.from; });
  var font = getUserFont(msg.from);
  var fontAttr = font ? ' style="font-family:\'' + font + '\'"' : '';
  var name = user ? user.displayName : msg.from;
  var rank = msg.rank || '';
  var ranks = {};

  if (type === 'group' && activeChat) {
    var g = userGroups.find(function(g) { return g.id === activeChat; });
    if (g) ranks = g.ranks || {};
  }

  var html = '<div class="message' + (isOwn ? ' own' : '') + '" data-msg-id="' + msg.id + '">';
  html += '<div class="msg-avatar">' + (user ? (user.avatar || '😎') : '😎') + '</div>';
  html += '<div class="msg-content">';
  html += '<div class="msg-header">';
  html += '<span class="msg-sender">' + esc(name) + '</span>';

  // Show rank badge in groups
  if (type === 'group' && rank && ranks[rank]) {
    var r = ranks[rank];
    html += '<span class="msg-rank-badge" style="background:' + r.color + '">' + (r.icon || '') + ' ' + r.name + '</span>';
  }

  html += '<span class="msg-time">' + formatTime(msg.time) + '</span>';
  html += '</div>';

  // Message text or file/voice
  if (msg.type === 'voice' && msg.fileInfo) {
    html += '<div class="msg-voice"' + fontAttr + '>';
    html += '<button class="voice-play-btn" data-url="' + msg.fileInfo.url + '" data-state="paused" onclick="toggleVoicePlay(this)">▶️</button>';
    html += '<span class="voice-duration">' + formatDuration(msg.fileInfo.duration) + '</span>';
    html += '</div>';
  } else if (msg.type === 'file' && msg.fileInfo) {
    html += '<div class="msg-file">';
    if (msg.fileInfo.mimetype && msg.fileInfo.mimetype.startsWith('image/')) {
      html += '<a href="' + msg.fileInfo.url + '" target="_blank"><img src="' + msg.fileInfo.url + '" class="msg-image" loading="lazy"></a>';
    } else if (msg.fileInfo.mimetype && msg.fileInfo.mimetype.startsWith('video/')) {
      html += '<video src="' + msg.fileInfo.url + '" controls class="msg-video"></video>';
    } else {
      html += '<a href="' + msg.fileInfo.url + '" target="_blank" class="file-link">';
      html += fileIcon(msg.fileInfo.mimetype) + ' ' + esc(msg.fileInfo.originalName || t('msg_file'));
      html += ' <span class="file-size">(' + formatSize(msg.fileInfo.size) + ')</span>';
      html += '</a>';
    }
    html += '</div>';
  }

  if (msg.text) {
    html += '<div class="msg-text"' + fontAttr + '>' + formatMsgText(msg.text) + '</div>';
  }

  // Reactions
  if (msg.reactions && msg.reactions.length > 0) {
    html += '<div class="msg-reactions">';
    msg.reactions.forEach(function(r) {
      html += '<span class="msg-reaction">' + r.emoji + '</span>';
    });
    html += '</div>';
  }

  // Read status (DM only)
  if (type === 'dm' && isOwn) {
    html += '<span class="msg-read-status">' + (msg.read ? '✓✓' : '✓') + '</span>';
  }

  // Pinned indicator
  if (msg.pinned) {
    html += '<span class="msg-pinned-indicator">📌 ' + t('pinned') + '</span>';
  }

  html += '</div></div>';
  return html;
}

function appendMessageToDOM(msg, type) {
  var container = document.getElementById('messages-container');
  var div = document.createElement('div');
  div.innerHTML = buildMsgHTML(msg, type);
  var msgEl = div.firstElementChild;
  container.appendChild(msgEl);
  attachSingleMsgEvents(msgEl, msg.from === currentUser.username);
}

function attachMsgEvents(container) {
  container.querySelectorAll('.message').forEach(function(el) {
    attachSingleMsgEvents(el, el.classList.contains('own'));
  });
}

function attachSingleMsgEvents(el, isOwn) {
  // Long press / right click for context menu
  el.addEventListener('contextmenu', function(e) {
    showContextMenu(e, el.dataset.msgId, isOwn);
  });

  // Double click for reaction (PRO only)
  if (currentUser && currentUser.isPro) {
    el.addEventListener('dblclick', function(e) {
      e.preventDefault();
      showReactionPicker(e, el.dataset.msgId);
    });
  }
}

// ===== VOICE PLAYER =====
var currentAudio = null;
var currentPlayBtn = null;

function toggleVoicePlay(btn) {
  var url = btn.dataset.url;
  var state = btn.dataset.state;

  // Stop any currently playing audio
  if (currentAudio && currentPlayBtn && currentPlayBtn !== btn) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentPlayBtn.textContent = '▶️';
    currentPlayBtn.dataset.state = 'paused';
    currentAudio = null;
    currentPlayBtn = null;
  }

  if (state === 'paused') {
    // Start playing
    if (!currentAudio) {
      currentAudio = new Audio(url);
      currentAudio.onended = function() {
        btn.textContent = '▶️';
        btn.dataset.state = 'paused';
        currentAudio = null;
        currentPlayBtn = null;
      };
      currentAudio.onerror = function() {
        btn.textContent = '▶️';
        btn.dataset.state = 'paused';
        currentAudio = null;
        currentPlayBtn = null;
      };
    }
    currentPlayBtn = btn;
    btn.textContent = '⏸️';
    btn.dataset.state = 'playing';
    currentAudio.play().catch(function() {
      btn.textContent = '▶️';
      btn.dataset.state = 'paused';
    });
  } else {
    // Pause
    if (currentAudio) {
      currentAudio.pause();
    }
    btn.textContent = '▶️';
    btn.dataset.state = 'paused';
  }
}

function formatDuration(seconds) {
  if (!seconds) return '0:00';
  var mins = Math.floor(seconds / 60);
  var secs = Math.floor(seconds % 60);
  return mins + ':' + String(secs).padStart(2, '0');
}

function getUserFont(username) {
  if (username === currentUser.username) {
    return currentUser.font && currentUser.font !== 'default' ? currentUser.font : null;
  }
  var user = allUsers.find(function(u) { return u.username === username; });
  return user && user.font && user.font !== 'default' ? user.font : null;
}

function formatMsgText(text) {
  var s = esc(text);
  // Bold
  s = s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  // Italic
  s = s.replace(/\*(.+?)\*/g, '<i>$1</i>');
  // Links
  s = s.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline">$1</a>');
  return s;
}

function updatePinnedMessage(msg) {
  var bar = document.getElementById('pinned-bar');
  var text = document.getElementById('pinned-text');
  if (!bar || !text) return;
  if (msg && msg.pinned) {
    text.textContent = (msg.text || t('msg_file')).substring(0, 80);
    bar.classList.remove('hidden');
  } else {
    bar.classList.add('hidden');
  }
}

// ===== SEND MESSAGES =====
function sendMessage() {
  if (!activeChat) return;
  var input = document.getElementById('message-input');
  var text = input.value.trim();
  if (!text) return;

  input.value = '';
  autoResize(input);

  if (activeChatType === 'dm') {
    socket.emit('message:send', { to: activeChat, text: text, type: 'text' });
  } else if (activeChatType === 'group') {
    socket.emit('group:message', { groupId: activeChat, text: text, type: 'text' });
  }

  // Hide emoji picker
  document.getElementById('emoji-picker').classList.add('hidden');
}

function handleTyping() {
  if (!socket || !activeChat) return;
  clearTimeout(typingTimeout);
  if (activeChatType === 'dm') {
    socket.emit('user:typing', { to: activeChat, typing: true });
    typingTimeout = setTimeout(function() {
      socket.emit('user:typing', { to: activeChat, typing: false });
    }, 2000);
  } else if (activeChatType === 'group') {
    socket.emit('group:typing', { groupId: activeChat, typing: true });
    typingTimeout = setTimeout(function() {
      socket.emit('group:typing', { groupId: activeChat, typing: false });
    }, 2000);
  }
}

async function markAsRead(username) {
  try {
    await fetch(API + '/api/messages/' + username + '/read', {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer ' + token }
    });
    socket.emit('message:read', { chatUser: username });
  } catch (err) {}
}

// ===== FILE UPLOAD =====
async function handleFileUpload(e) {
  var file = e.target.files[0];
  if (!file) return;
  e.target.value = '';

  // Check file size
  var maxSize = currentUser && currentUser.isPro ? 5 * 1024 * 1024 * 1024 : 500 * 1024 * 1024;
  if (file.size > maxSize) {
    showToast(currentUser && currentUser.isPro ? t('file_too_big_pro') : t('file_too_big'), 'error');
    return;
  }

  var uploadId = 'upload-' + Date.now();
  showUploadProgress(uploadId, file.name);

  var fd = new FormData();
  fd.append('file', file);

  var xhr = new XMLHttpRequest();
  xhr.open('POST', API + '/api/upload', true);
  xhr.setRequestHeader('Authorization', 'Bearer ' + token);

  xhr.upload.onprogress = function(e) {
    if (e.lengthComputable) {
      var pct = Math.round((e.loaded / e.total) * 100);
      updateUploadProgress(uploadId, pct);
    }
  };

  xhr.onload = function() {
    removeUploadProgress(uploadId);
    if (xhr.status === 200) {
      try {
        var fileInfo = JSON.parse(xhr.responseText);
        sendFileMessage(fileInfo);
      } catch (err) {
        showToast('❌ Upload error', 'error');
      }
    } else {
      showToast('❌ Upload failed', 'error');
    }
  };

  xhr.onerror = function() {
    removeUploadProgress(uploadId);
    showToast('❌ Upload error', 'error');
  };

  xhr.send(fd);
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
  div.innerHTML = '<div style="font-size:12px;color:var(--text-secondary)">' + t('upload_progress') + '</div>' +
    '<div style="font-size:13px;font-weight:600">' + esc(name) + '</div>' +
    '<div class="upload-progress-bar"><div class="upload-progress-fill" id="' + id + '-bar" style="width:0%"></div></div>';
  container.appendChild(div);
}

function updateUploadProgress(id, pct) {
  var bar = document.getElementById(id + '-bar');
  if (bar) bar.style.width = pct + '%';
}

function removeUploadProgress(id) {
  var el = document.getElementById(id);
  if (el) el.remove();
}

// ===== VOICE RECORDING =====
async function startVoiceRecording() {
  try {
    var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    voiceRecorder = new MediaRecorder(stream);
    voiceChunks = [];

    voiceRecorder.ondataavailable = function(e) {
      voiceChunks.push(e.data);
    };

    voiceRecorder.onstop = async function() {
      stream.getTracks().forEach(function(t) { t.stop(); });
      var blob = new Blob(voiceChunks, { type: 'audio/webm' });
      var duration = (Date.now() - voiceStartTime) / 1000;
      if (duration < 1) return;
      await uploadVoice(blob, duration);
    };

    voiceRecorder.start();
    voiceStartTime = Date.now();

    // Show recording UI
    document.getElementById('voice-bar').classList.remove('hidden');
    document.getElementById('message-input-area').classList.add('hidden');
    document.getElementById('btn-voice').classList.add('recording');

    voiceTimerInterval = setInterval(function() {
      var elapsed = Math.floor((Date.now() - voiceStartTime) / 1000);
      document.getElementById('voice-timer').textContent = formatDuration(elapsed);
    }, 500);
  } catch (err) {
    showToast(t('no_camera'), 'error');
  }
}

function stopVoiceRecording() {
  if (voiceRecorder && voiceRecorder.state !== 'inactive') {
    voiceRecorder.stop();
  }
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
  var fd = new FormData();
  fd.append('file', blob, 'voice_' + Date.now() + '.webm');
  fd.append('isVoice', 'true');
  fd.append('duration', String(duration));

  try {
    var res = await fetch(API + '/api/upload', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: fd
    });
    if (!res.ok) return showToast('❌ Voice upload error', 'error');
    var fileInfo = await res.json();

    if (activeChatType === 'dm') {
      socket.emit('message:send', { to: activeChat, text: '', type: 'voice', fileInfo: fileInfo });
    } else {
      socket.emit('group:message', { groupId: activeChat, text: '', type: 'voice', fileInfo: fileInfo });
    }
    showToast(t('voice_sent'), 'success');
  } catch (err) {
    showToast('❌ Voice upload error', 'error');
  }
}

// ===== GROUPS =====
function openCreateGroup() {
  document.getElementById('create-group-modal').classList.remove('hidden');
  document.getElementById('create-group-title').textContent = '＋ ' + t('type_group');

  var picker = document.getElementById('member-picker');
  picker.innerHTML = allUsers.map(function(u) {
    return '<div class="member-pick-item" data-username="' + u.username + '" onclick="this.classList.toggle(\'selected\')">' +
      '<div class="avatar">' + (u.avatar || '😎') + '</div>' +
      esc(u.displayName) + '</div>';
  }).join('');
}

async function createGroup() {
  var name = document.getElementById('cg-name').value.trim();
  if (!name) return;
  var desc = document.getElementById('cg-desc').value.trim();
  var type = document.getElementById('cg-type').value;
  var avatar = document.getElementById('cg-avatar').value;

  var selectedMembers = [];
  document.querySelectorAll('.member-pick-item.selected').forEach(function(el) {
    selectedMembers.push(el.dataset.username);
  });

  try {
    var res = await fetch(API + '/api/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ name: name, description: desc, type: type, avatar: avatar })
    });
    var group = await res.json();

    // Add selected members
    for (var i = 0; i < selectedMembers.length; i++) {
      await fetch(API + '/api/groups/' + group.id + '/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ username: selectedMembers[i] })
      });
    }

    document.getElementById('create-group-modal').classList.add('hidden');
    document.getElementById('cg-name').value = '';
    document.getElementById('cg-desc').value = '';
    showToast(type === 'channel' ? t('channel_created') : t('group_created'), 'success');
    await loadGroups();
    openGroupChat(group.id);
  } catch (err) {
    showToast('❌ Error creating group', 'error');
  }
}

async function openGroupChat(gid) {
  activeChat = gid;
  activeChatType = 'group';
  unreadCounts[gid] = 0;

  document.getElementById('empty-state').classList.add('hidden');
  document.getElementById('active-chat').classList.remove('hidden');
  document.getElementById('sidebar').classList.add('mobile-hidden');

  updateChatHeader();
  await loadGroupMessages(gid);
  renderGroupContacts();
  document.getElementById('message-input').focus();
}

// ===== GROUP INFO =====
async function openGroupInfo() {
  if (activeChatType !== 'group') return;
  try {
    var res = await fetch(API + '/api/groups/' + activeChat, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    var group = await res.json();
    renderGroupInfo(group);
    document.getElementById('group-info-modal').classList.remove('hidden');
  } catch (err) {
    showToast('❌ Error loading group info', 'error');
  }
}

function renderGroupInfo(g) {
  var isOwner = g.owner === currentUser.username;
  var member = g.members.find(function(m) { return m.username === currentUser.username; });
  var myRank = member ? member.rank : 'member';
  var rankData = g.ranks[myRank] || {};
  var canManage = isOwner || (rankData.permissions && (rankData.permissions.includes('manage_members') || rankData.permissions.includes('all')));
  var ranks = g.ranks || {};

  // Resolved members (with user data)
  var resolvedMembers = g.members.map(function(m) {
    var user = allUsers.find(function(u) { return u.username === m.username; });
    return {
      username: m.username,
      rank: m.rank || 'member',
      displayName: user ? user.displayName : m.username,
      avatar: user ? (user.avatar || '😎') : '😎',
      isPro: user ? user.isPro : false
    };
  });

  var memberUsernames = g.members.map(function(m) { return m.username; });
  var available = allUsers.filter(function(u) { return memberUsernames.indexOf(u.username) === -1; });

  // Header
  var html = '<div class="group-info-header">';
  html += '<div class="avatar avatar-lg">' + (g.avatar || '💬') + '</div>';
  html += '<div>';
  html += '<div class="group-info-name">' + esc(g.name) + '</div>';
  html += '<div class="group-info-desc">' + esc(g.description || '') + '</div>';
  html += '<span class="group-info-type type-' + g.type + '">' + (g.type === 'channel' ? '📢 ' + t('type_channel') : '👥 ' + t('type_group')) + '</span>';
  html += '</div></div>';

  // Members section
  html += '<div class="gi-section">';
  html += '<div class="gi-section-title">' + t('members') + ' (' + g.members.length + ')</div>';

  resolvedMembers.forEach(function(m) {
    var rk = m.rank;
    var rkd = ranks[rk] || {};
    var rankColor = rkd.color || '#778CA3';
    var rankName = rkd.name || rk;
    var rankIcon = rkd.icon || '';

    html += '<div class="gi-member">';
    html += '<div class="avatar">' + m.avatar + '</div>';
    html += '<div class="gi-member-info">';
    html += '<div class="gi-member-name">' + esc(m.displayName);
    if (m.isPro) html += ' 💎';
    html += '</div>';
    html += '<span class="gi-member-rank" style="background:' + rankColor + '">' + rankIcon + ' ' + rankName + '</span>';
    html += '</div>';

    // Rank change dropdown (only for owner)
    if (isOwner && m.username !== currentUser.username) {
      html += '<select class="gi-rank-select" onchange="changeRank(\'' + g.id + '\',\'' + m.username + '\',this.value)">';
      Object.keys(ranks).forEach(function(k) {
        html += '<option value="' + k + '"' + (k === rk ? ' selected' : '') + '>' + (ranks[k].icon || '') + ' ' + ranks[k].name + '</option>';
      });
      html += '</select>';
    }

    // Kick button
    if (canManage && m.username !== currentUser.username && m.username !== g.owner) {
      html += '<button class="btn-danger" style="font-size:11px;padding:4px 10px" onclick="kickMember(\'' + g.id + '\',\'' + m.username + '\')">' + t('kick_user') + '</button>';
    }

    html += '</div>';
  });
  html += '</div>';

  // Add members section
  if (canManage && available.length > 0) {
    html += '<div class="gi-section" style="margin-top:16px">';
    html += '<div class="gi-section-title">➕ ' + t('add_members') + '</div>';
    html += '<div style="display:flex;flex-wrap:wrap;gap:6px">';
    available.forEach(function(u) {
      html += '<button class="member-pick-item" onclick="addMemberToGroup(\'' + g.id + '\',\'' + u.username + '\',this)">';
      html += '<div class="avatar">' + (u.avatar || '😎') + '</div>' + esc(u.displayName) + ' ＋</button>';
    });
    html += '</div></div>';
  }

  document.getElementById('gi-title').textContent = t('group_info');
  document.getElementById('gi-body').innerHTML = html;

  // Footer
  var footerHTML = '';
  if (g.owner !== currentUser.username) {
    footerHTML += '<button class="btn-leave" onclick="leaveGroup(\'' + g.id + '\')">' + t('leave_group') + '</button>';
  }
  document.getElementById('gi-footer').innerHTML = footerHTML;
}

async function addMemberToGroup(gid, username, btn) {
  try {
    var res = await fetch(API + '/api/groups/' + gid + '/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ username: username })
    });
    if (res.ok) {
      btn.remove();
      showToast(t('member_added'), 'success');
      openGroupInfo();
    } else {
      var data = await res.json();
      showToast('❌ ' + data.error, 'error');
    }
  } catch (err) {
    showToast('❌ Error', 'error');
  }
}

async function changeRank(gid, username, rank) {
  try {
    await fetch(API + '/api/groups/' + gid + '/rank', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ username: username, rank: rank })
    });
    showToast(t('rank_changed'), 'success');
  } catch (err) {
    showToast('❌ Error', 'error');
  }
}

async function kickMember(gid, username) {
  if (!confirm(t('kick_user') + ' @' + username + '?')) return;
  try {
    await fetch(API + '/api/groups/' + gid + '/members/' + username, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + token }
    });
    showToast(t('member_removed'), 'success');
    openGroupInfo();
  } catch (err) {}
}

async function leaveGroup(gid) {
  if (!confirm(t('leave_group') + '?')) return;
  try {
    await fetch(API + '/api/groups/' + gid + '/members/' + currentUser.username, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + token }
    });
    document.getElementById('group-info-modal').classList.add('hidden');
    activeChat = null;
    document.getElementById('active-chat').classList.add('hidden');
    document.getElementById('empty-state').classList.remove('hidden');
    loadGroups();
    showToast(t('left_group'), 'success');
  } catch (err) {}
}

// ===== WEBRTC CALLS =====
function startCall(callType) {
  if (!activeChat || activeChatType !== 'dm') {
    return showToast(t('calls_dm_only'), 'info');
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return showToast(t('no_camera'), 'error');
  }

  callPartner = activeChat;
  var user = allUsers.find(function(u) { return u.username === callPartner; });
  var isPro = currentUser && currentUser.isPro;

  var constraints = callType === 'video'
    ? { video: { width: isPro ? { ideal: 1920 } : { ideal: 640 } }, audio: true }
    : { audio: true };

  navigator.mediaDevices.getUserMedia(constraints)
    .then(function(stream) {
      localStream = stream;
      peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });

      stream.getTracks().forEach(function(track) {
        peerConnection.addTrack(track, stream);
      });

      peerConnection.ontrack = function(e) {
        document.getElementById('remote-video').srcObject = e.streams[0];
        document.getElementById('call-no-video').classList.add('hidden');
      };

      peerConnection.onicecandidate = function(e) {
        if (e.candidate) {
          socket.emit('call:ice-candidate', { to: callPartner, candidate: e.candidate });
        }
      };

      peerConnection.oniceconnectionstatechange = function() {
        if (peerConnection && (peerConnection.iceConnectionState === 'failed' || peerConnection.iceConnectionState === 'disconnected')) {
          endCallUI(t('call_ended'));
        }
      };

      return peerConnection.createOffer();
    })
    .then(function(offer) {
      return peerConnection.setLocalDescription(offer);
    })
    .then(function() {
      socket.emit('call:offer', {
        to: callPartner,
        offer: peerConnection.localDescription,
        callType: callType,
        quality: isPro ? 'hd' : 'sd'
      });

      showCallOverlay(callType, user);
      showToast(t('call_connecting'), 'info');
    })
    .catch(function(err) {
      console.error('Call error:', err);
      endCallUI();
      showToast(t('call_error'), 'error');
    });
}

function handleIncomingCall(data) {
  console.log('📞 Incoming from', data.from);
  callPartner = data.from;
  window._incomingOffer = data.offer;
  window._incomingCallType = data.callType;

  // Show incoming call UI
  document.getElementById('call-overlay').classList.remove('hidden');
  document.getElementById('call-incoming').classList.remove('hidden');
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
  console.log('📞 Accept');
  document.getElementById('call-incoming').classList.add('hidden');
  var cc = document.getElementById('call-controls');
  if (cc) cc.style.display = '';

  var callType = window._incomingCallType || 'audio';
  var isPro = currentUser && currentUser.isPro;

  var constraints = callType === 'video'
    ? { video: { width: isPro ? { ideal: 1920 } : { ideal: 640 } }, audio: true }
    : { audio: true };

  navigator.mediaDevices.getUserMedia(constraints)
    .then(function(stream) {
      localStream = stream;
      peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });

      stream.getTracks().forEach(function(track) {
        peerConnection.addTrack(track, stream);
      });

      peerConnection.ontrack = function(e) {
        document.getElementById('remote-video').srcObject = e.streams[0];
        document.getElementById('call-no-video').classList.add('hidden');
      };

      peerConnection.onicecandidate = function(e) {
        if (e.candidate) {
          socket.emit('call:ice-candidate', { to: callPartner, candidate: e.candidate });
        }
      };

      peerConnection.oniceconnectionstatechange = function() {
        if (peerConnection && (peerConnection.iceConnectionState === 'failed' || peerConnection.iceConnectionState === 'disconnected')) {
          endCallUI('Connection lost');
        }
      };

      return peerConnection.setRemoteDescription(window._incomingOffer);
    })
    .then(function() {
      return peerConnection.createAnswer();
    })
    .then(function(answer) {
      return peerConnection.setLocalDescription(answer);
    })
    .then(function() {
      socket.emit('call:answer', { to: callPartner, answer: peerConnection.localDescription });
      var user = allUsers.find(function(u) { return u.username === callPartner; });
      updateCallAvatar(callType, user);
      startCallTimer();
    })
    .catch(function(err) {
      console.error('Accept error:', err);
      endCallUI();
      showToast(t('call_error'), 'error');
    });
}

function rejectCall() {
  socket.emit('call:reject', { to: callPartner });
  endCallUI();
}

function handleCallAnswered(data) {
  console.log('📞 Answered');
  if (peerConnection) {
    peerConnection.setRemoteDescription(data.answer)
      .then(function() {
        startCallTimer();
      })
      .catch(function(e) {
        console.error('setRemote err:', e);
      });
  }
}

function handleRemoteICE(data) {
  if (peerConnection && data.candidate) {
    peerConnection.addIceCandidate(data.candidate).catch(function() {});
  }
}

function hangupCall() {
  if (socket && callPartner) {
    socket.emit('call:hangup', { to: callPartner });
  }
  endCallUI(t('call_ended'));
}

function showCallOverlay(callType, user) {
  document.getElementById('call-overlay').classList.remove('hidden');
  document.getElementById('call-incoming').classList.add('hidden');
  var cc = document.getElementById('call-controls');
  if (cc) cc.style.display = '';
  updateCallAvatar(callType, user);

  var isPro = currentUser && currentUser.isPro;
  var qualityEl = document.getElementById('call-quality');
  if (qualityEl) {
    if (isPro) {
      qualityEl.classList.remove('hidden');
      qualityEl.textContent = '💎 HD';
    } else {
      qualityEl.classList.add('hidden');
    }
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
    document.getElementById('call-timer').textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }, 1000);
}

function endCallUI(msg) {
  // Stop local stream
  if (localStream) {
    localStream.getTracks().forEach(function(t) { t.stop(); });
    localStream = null;
  }
  // Close peer connection
  if (peerConnection) {
    try { peerConnection.close(); } catch (e) {}
    peerConnection = null;
  }
  clearInterval(callTimerInterval);

  // Reset UI
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
    var btn = document.getElementById('btn-toggle-mic');
    btn.classList.toggle('muted', !track.enabled);
    btn.textContent = track.enabled ? '🎙️' : '🔇';
  }
}

function toggleCam() {
  if (!localStream) return;
  var track = localStream.getVideoTracks()[0];
  if (track) {
    track.enabled = !track.enabled;
    var btn = document.getElementById('btn-toggle-cam');
    btn.classList.toggle('muted', !track.enabled);
    btn.textContent = track.enabled ? '📹' : '🚫';
    if (!track.enabled) {
      document.getElementById('call-no-video').classList.remove('hidden');
    } else {
      document.getElementById('call-no-video').classList.add('hidden');
    }
  }
}

// ===== CONTEXT MENU =====
function showContextMenu(e, msgId, isOwn) {
  e.preventDefault();
  closeContextMenu();

  var msgEl = document.querySelector('[data-msg-id="' + msgId + '"]');
  if (!msgEl) return;

  var menu = document.createElement('div');
  menu.className = 'msg-context-menu show';
  menu.id = 'context-menu';

  if (currentUser && currentUser.isPro) {
    menu.innerHTML += '<button class="msg-context-btn pro-only" onclick="reactToMsg(\'' + msgId + '\')">' + t('ctx_react') + '</button>';
    menu.innerHTML += '<button class="msg-context-btn pro-only" onclick="pinMsg(\'' + msgId + '\')">' + t('ctx_pin') + '</button>';
  }
  menu.innerHTML += '<button class="msg-context-btn" onclick="copyMsg(\'' + msgId + '\')">' + t('ctx_copy') + '</button>';

  msgEl.style.position = 'relative';
  msgEl.appendChild(menu);
  menu.style[isOwn ? 'right' : 'left'] = '10px';
  menu.style.top = '-10px';
}

function closeContextMenu() {
  var el = document.getElementById('context-menu');
  if (el) el.remove();
}

function reactToMsg(msgId) {
  closeContextMenu();
  var btn = document.querySelector('[data-msg-id="' + msgId + '"]');
  if (!btn) return;
  var picker = document.getElementById('reaction-picker');
  if (!picker) return;

  picker.classList.remove('hidden');
  var rect = btn.getBoundingClientRect();
  picker.style.top = (rect.top - 50) + 'px';
  picker.style.left = rect.left + 'px';

  picker.querySelectorAll('.reaction-btn').forEach(function(btn) {
    btn.onclick = function() {
      if (activeChatType === 'dm') {
        socket.emit('message:react', { to: activeChat, msgId: msgId, emoji: btn.dataset.emoji });
      } else if (activeChatType === 'group') {
        socket.emit('group:react', { groupId: activeChat, msgId: msgId, emoji: btn.dataset.emoji });
      }
      picker.classList.add('hidden');
    };
  });
}

function pinMsg(msgId) {
  closeContextMenu();
  if (activeChatType === 'dm') {
    socket.emit('message:pin', { to: activeChat, msgId: msgId });
  } else if (activeChatType === 'group') {
    socket.emit('message:pin', { to: activeChat, msgId: msgId });
  }
}

function copyMsg(msgId) {
  closeContextMenu();
  var msgText = document.querySelector('[data-msg-id="' + msgId + '"] .msg-text');
  if (msgText) {
    navigator.clipboard.writeText(msgText.textContent).then(function() {
      showToast(t('copied'), 'success');
    });
  }
}

function showReactionPicker(e, msgId) {
  e.preventDefault();
  var btn = document.querySelector('[data-msg-id="' + msgId + '"]');
  if (!btn) return;
  var picker = document.getElementById('reaction-picker');
  if (!picker) return;

  picker.classList.remove('hidden');
  var rect = btn.getBoundingClientRect();
  picker.style.top = (rect.top - 50) + 'px';
  picker.style.left = rect.left + 'px';

  picker.querySelectorAll('.reaction-btn').forEach(function(btn) {
    btn.onclick = function() {
      if (activeChatType === 'dm') {
        socket.emit('message:react', { to: activeChat, msgId: msgId, emoji: btn.dataset.emoji });
      } else if (activeChatType === 'group') {
        socket.emit('group:react', { groupId: activeChat, msgId: msgId, emoji: btn.dataset.emoji });
      }
      picker.classList.add('hidden');
    };
  });

  // Close on outside click
  document.addEventListener('click', function hide(ev) {
    if (!picker.contains(ev.target)) {
      picker.classList.add('hidden');
      document.removeEventListener('click', hide);
    }
  });
}

// ===== EMOJI =====
function populateEmojis(category) {
  var grid = document.getElementById('emoji-grid');
  var emojis = EMOJIS[category] || [];
  grid.innerHTML = emojis.map(function(e) {
    return '<button class="emoji-item" onclick="insertEmoji(\'' + e + '\')">' + e + '</button>';
  }).join('');
}

function insertEmoji(emoji) {
  var input = document.getElementById('message-input');
  input.value += emoji;
  input.focus();
  autoResize(input);
}

// ===== SETTINGS =====
function openSettings() {
  document.getElementById('settings-modal').classList.remove('hidden');
  updateUI();
}

function closeSettings() {
  document.getElementById('settings-modal').classList.add('hidden');
}

async function saveProfile() {
  try {
    var res = await fetch(API + '/api/profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({
        displayName: document.getElementById('edit-displayname').value.trim(),
        bio: document.getElementById('edit-bio').value.trim(),
        avatar: document.getElementById('avatar-select').value
      })
    });
    currentUser = await res.json();
    updateUI();
    renderDMContacts();
    showToast(t('profile_saved'), 'success');
  } catch (err) {
    showToast(t('profile_error'), 'error');
  }
}

function selectTheme(opt) {
  if (opt.dataset.theme !== 'default' && !(currentUser && currentUser.isPro)) {
    return showToast(t('theme_need_pro'), 'info');
  }
  document.querySelectorAll('.theme-option').forEach(function(o) { o.classList.remove('selected'); });
  opt.classList.add('selected');
  applyTheme(opt.dataset.theme);

  fetch(API + '/api/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    body: JSON.stringify({ theme: opt.dataset.theme })
  }).then(function(r) { return r.json(); }).then(function(d) { currentUser = d; });
}

function selectFont(opt) {
  if (opt.dataset.font !== 'default' && !(currentUser && currentUser.isPro)) {
    return showToast(t('font_need_pro'), 'info');
  }
  document.querySelectorAll('.font-option').forEach(function(o) { o.classList.remove('selected'); });
  opt.classList.add('selected');

  fetch(API + '/api/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    body: JSON.stringify({ font: opt.dataset.font })
  }).then(function(r) { return r.json(); }).then(function(d) {
    currentUser = d;
    updateUI();
  });
  showToast(t('font_change'), 'success');
}

async function requestPro() {
  try {
    var res = await fetch(API + '/api/request-pro', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token }
    });
    var data = await res.json();
    if (res.ok) {
      proRequestPending = true;
      document.getElementById('pro-request-msg').textContent = t('pro_request_sent');
      document.getElementById('pro-request-msg').className = 'pro-request-msg info';
      document.getElementById('pro-request-msg').classList.remove('hidden');
      document.getElementById('btn-request-pro').disabled = true;
      updateProStatus();
      showToast(t('pro_request_sent'), 'info');
    } else {
      if (data.error === 'Request already pending') {
        proRequestPending = true;
        updateProStatus();
      }
    }
  } catch (err) {
    showToast(t('err_connection'), 'error');
  }
}

function logout() {
  token = null;
  currentUser = null;
  activeChat = null;
  localStorage.removeItem('chatly_token');
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  showAuth();
  document.body.className = '';
}

// ===== UTILITIES =====
function esc(s) {
  if (!s) return '';
  var d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
}

function formatTimeShort(timestamp) {
  return formatTime(timestamp);
}

function formatDate(timestamp) {
  var d = new Date(timestamp);
  var now = new Date();
  if (d.toDateString() === now.toDateString()) return t('today');
  var yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return t('yesterday');
  return d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' });
}

function getDisplayName(username) {
  var user = allUsers.find(function(u) { return u.username === username; });
  return user ? user.displayName : username;
}

function autoResize(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
}

function scrollToBottom() {
  var container = document.getElementById('messages-container');
  setTimeout(function() {
    container.scrollTop = container.scrollHeight;
  }, 50);
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1073741824).toFixed(1) + ' GB';
}

function fileIcon(mimetype) {
  if (!mimetype) return '📄';
  if (mimetype.startsWith('image/')) return '🖼️';
  if (mimetype.startsWith('video/')) return '🎬';
  if (mimetype.startsWith('audio/')) return '🎵';
  if (mimetype.includes('pdf')) return '📕';
  if (mimetype.includes('zip') || mimetype.includes('rar')) return '📦';
  return '📄';
}

function showToast(msg, type) {
  type = type || 'info';
  var container = document.getElementById('toast-container');
  var toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.textContent = msg;
  container.appendChild(toast);
  // Fade in
  toast.style.opacity = '1';
  setTimeout(function() {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(function() { toast.remove(); }, 300);
  }, 3500);
}

// ===== END app.js =====
