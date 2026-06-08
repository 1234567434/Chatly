// ===== CHATLY v2.2 CLIENT — COMPLETE REWRITE =====
var API = '';
var token = localStorage.getItem('chatly_token');
var currentUser = null, activeChat = null, activeChatType = 'dm';
var socket = null, typingTimeout = null;
var unreadCounts = {}, lastMessages = {}, onlineUsers = new Set();
var proRequestPending = false, allUsers = [], userGroups = [];
var voiceRecorder = null, voiceChunks = [], voiceStartTime = 0, voiceTimerInterval = null;
var peerConnection = null, localStream = null, callPartner = null, callTimerInterval = null, callStartTime = 0;
var _initialConnect = true;
var replyToMsg = null;
var editingMsgId = null;
var adminSecret = localStorage.getItem('chatly_admin_secret') || '';

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
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  { urls: 'stun:stun.stunprotocol.org:3478' },
  {
    urls: 'turn:global.relay.metered.ca:80',
    username: 'e8dd65b92f7ee8b646db8c7e',
    credential: 'mEq+drS8jO1y0tQl'
  },
  {
    urls: 'turn:global.relay.metered.ca:443',
    username: 'e8dd65b92f7ee8b646db8c7e',
    credential: 'mEq+drS8jO1y0tQl'
  },
  {
    urls: 'turn:global.relay.metered.ca:443?transport=tcp',
    username: 'e8dd65b92f7ee8b646db8c7e',
    credential: 'mEq+drS8jO1y0tQl'
  }
];

// ===== INIT =====
document.addEventListener('DOMContentLoaded', function() {
  if (token) {
    showApp();
    loadApp();
  } else {
    showAuth();
  }
  setupEventListeners();

  // Admin shortcut: Ctrl+Shift+A
  document.addEventListener('keydown', function(e) {
    if (e.ctrlKey && e.shiftKey && e.key === 'A') {
      e.preventDefault();
      if (currentUser) openAdminPanel();
    }
  });
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

  // Avatar emoji change
  document.getElementById('avatar-select').addEventListener('change', function() {
    if (this.value) {
      document.getElementById('settings-avatar').innerHTML = this.value;
    }
  });

  // Avatar photo upload
  document.getElementById('avatar-file-input').addEventListener('change', async function(e) {
    var file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('❌ Только картинки', 'error'); return; }
    if (file.size > 10 * 1024 * 1024) { showToast('❌ Макс. 10МБ', 'error'); return; }
    e.target.value = '';

    var fd = new FormData();
    fd.append('file', file);
    try {
      var res = await fetch(API + '/api/upload', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token }, body: fd });
      if (!res.ok) { showToast('❌ Ошибка загрузки', 'error'); return; }
      var fi = await res.json();
      // Save avatar URL to profile
      var pres = await fetch(API + '/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ avatar: fi.url })
      });
      if (!pres.ok) { showToast('❌ Ошибка сохранения', 'error'); return; }
      currentUser = await pres.json();
      // Update UI everywhere
      document.getElementById('settings-avatar').innerHTML = '<img src="' + fi.url + '" alt="avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%">';
      document.getElementById('avatar-select').value = '';
      updateUI();
      renderDMContacts();
      renderGroupContacts();
      // Re-render messages if in a chat so own avatar updates
      if (activeChat) {
        if (activeChatType === 'dm') loadMessages(activeChat);
        else loadGroupMessages(activeChat);
      }
      showToast('✅ Аватарка обновлена!', 'success');
    } catch (err) {
      showToast('❌ Ошибка: ' + err.message, 'error');
    }
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

  // Reply bar close
  document.getElementById('reply-bar-close').addEventListener('click', cancelReply);
  // Edit bar close
  document.getElementById('edit-bar-close').addEventListener('click', cancelEdit);

  // Admin panel
  document.getElementById('btn-admin-login').addEventListener('click', adminLogin);
  document.getElementById('close-admin').addEventListener('click', function() {
    document.getElementById('admin-modal').classList.add('hidden');
  });
  document.getElementById('admin-user-search').addEventListener('input', function() {
    // Re-render with search
    fetch(API + '/admin/' + adminSecret + '/list').then(function(r) { return r.json(); }).then(function(d) { renderAdminUsers(d.users || []); });
  });
  document.getElementById('admin-secret-input').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') adminLogin();
  });

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
    // Don't close reaction picker here — handled by reaction picker code itself
    if (!e.target.closest('#reaction-picker') && !e.target.closest('.msg-context-btn') && !e.target.closest('.msg-context-menu') && !e.target.closest('.reaction-btn')) {
      var rp = document.getElementById('reaction-picker');
      if (rp) rp.classList.add('hidden');
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
  _initialConnect = true;
  showApp();
  loadApp();
}

async function loadApp() {
  try {
    var res = await fetch(API + '/api/me', { headers: { 'Authorization': 'Bearer ' + token } });
    if (!res.ok) {
      // Token might be expired or server restarted — try retry once
      if (res.status === 403 || res.status === 401) {
        console.log('Token invalid, clearing...');
        token = null;
        localStorage.removeItem('chatly_token');
        showAuth();
        return;
      }
      // Server error — don't logout, just retry later
      console.log('Server error, will retry...');
      return;
    }
    currentUser = await res.json();
    updateUI();
    _initialConnect = true;
    connectSocket();
    loadUsers();
    loadGroups();
  } catch (err) {
    // Network error (server sleeping?) — don't logout, keep token
    console.log('Network error, keeping token for retry');
    showApp();
  }
}

// ===== UI UPDATE =====
function updateUI() {
  if (!currentUser) return;
  var av = currentUser.avatar || '😎';
  var isAvatarUrl = av && av.startsWith('/uploads/');

  // Helper: render avatar content
  function renderAvatar(el) {
    if (!el) return;
    if (isAvatarUrl) { el.innerHTML = '<img src="' + av + '" alt="avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%">'; }
    else { el.innerHTML = ''; el.textContent = av; }
  }

  // Sidebar footer
  renderAvatar(document.getElementById('my-avatar'));
  document.getElementById('my-name').textContent = currentUser.displayName;
  var proBadge = document.getElementById('my-pro-badge');
  if (currentUser.isPro) proBadge.classList.remove('hidden');
  else proBadge.classList.add('hidden');

  // Settings profile
  var settingsAvatar = document.getElementById('settings-avatar');
  if (settingsAvatar) renderAvatar(settingsAvatar);
  var editDisplayName = document.getElementById('edit-displayname');
  if (editDisplayName) editDisplayName.value = currentUser.displayName || '';
  var editBio = document.getElementById('edit-bio');
  if (editBio) editBio.value = currentUser.bio || '';
  var editUsername = document.getElementById('edit-username');
  if (editUsername) editUsername.value = currentUser.username || '';
  var avatarSelect = document.getElementById('avatar-select');
  if (avatarSelect && currentUser.avatar && !isAvatarUrl) avatarSelect.value = currentUser.avatar;
  else if (avatarSelect) avatarSelect.value = '';

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

  // Update chat header avatar if in DM
  updateChatHeader();

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

  // Periodic user list refresh as safety net (every 30s)
  clearInterval(window._userRefreshInterval);
  window._userRefreshInterval = setInterval(function() {
    if (token && currentUser) {
      loadUsers();
    }
  }, 30000);

  socket.on('connect', function() {
    console.log('🔌 Socket connected');
    if (_initialConnect) {
      _initialConnect = false;
    } else {
      // Reconnection — refresh all data to stay in sync
      console.log('🔄 Reconnected — refreshing data');
      loadUsers();
      loadGroups();
      if (activeChat) {
        if (activeChatType === 'dm') loadMessages(activeChat);
        else loadGroupMessages(activeChat);
      }
    }
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
      loadMessages(activeChat);
    }
  });

  socket.on('message:edited', function(data) {
    console.log('✏️ message:edited', data);
    if (activeChatType === 'dm') loadMessages(activeChat);
  });

  socket.on('message:deleted', function(data) {
    console.log('🗑️ message:deleted', data.msgId);
    var el = document.querySelector('[data-msg-id="' + data.msgId + '"]');
    if (el) { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(function() { el.remove(); }, 300); }
  });

  socket.on('group:messageEdited', function(data) {
    console.log('✏️ group:messageEdited');
    if (activeChat === data.groupId && activeChatType === 'group') loadGroupMessages(activeChat);
  });

  socket.on('message:reaction', function(data) {
    console.log('😍 message:reaction', data);
    if (activeChatType === 'dm' && data.msg) {
      // Update the specific message in DOM
      updateMsgReaction(data.msg.id, data.msg.reactions);
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
    // If full user data provided, ensure they are in allUsers
    if (data.user && currentUser && data.username !== currentUser.username) {
      var idx = allUsers.findIndex(function(u) { return u.username === data.username; });
      if (idx < 0) {
        // New user not in our list — add them
        allUsers.push(data.user);
      } else {
        // Update existing entry (name/avatar might have changed)
        allUsers[idx] = data.user;
      }
    }
    // Update chat header if viewing this user
    if (activeChat === data.username && activeChatType === 'dm') {
      updateChatHeader();
    }
    renderDMContacts();
    renderGroupContacts();
  });

  // When another user updates their profile (avatar, name, etc.)
  socket.on('user:profileUpdate', function(updatedUser) {
    console.log('👤 Profile update:', updatedUser.username);
    // Update currentUser if this is about self
    if (currentUser && updatedUser.username === currentUser.username) {
      currentUser = updatedUser;
      updateUI();
    }
    // Update in allUsers array
    var idx = allUsers.findIndex(function(u) { return u.username === updatedUser.username; });
    if (idx >= 0) {
      allUsers[idx] = updatedUser;
    } else {
      // User not in allUsers list — might be a new registration that came through profile update
      allUsers.push(updatedUser);
    }
    renderDMContacts();
    renderGroupContacts();
    // Update chat header if viewing this user
    if (activeChat === updatedUser.username && activeChatType === 'dm') {
      updateChatHeader();
    }
    // Re-render current messages to show updated avatar/name
    if (activeChat && activeChatType === 'dm') {
      // Update message avatars in real-time without full reload
      document.querySelectorAll('.message .msg-avatar').forEach(function(el) {
        var msgEl = el.closest('.message');
        if (!msgEl) return;
        // We don't know the username from DOM, so we just update if it matches the updated user
      });
    }
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
    // If currently viewing this group, go back to empty state
    if (activeChat === data.groupId && activeChatType === 'group') {
      activeChat = null;
      document.getElementById('active-chat').classList.add('hidden');
      document.getElementById('empty-state').classList.remove('hidden');
      document.getElementById('sidebar').classList.remove('mobile-hidden');
    }
  });

  // ===== Group Real-time Updates =====
  socket.on('group:updated', function(data) {
    console.log('🔄 group:updated', data.groupId);
    loadGroups();
    if (activeChat === data.groupId && activeChatType === 'group') {
      updateChatHeader();
    }
  });

  socket.on('group:reaction', function(data) {
    console.log('😍 group:reaction', data.groupId);
    if (activeChat === data.groupId && activeChatType === 'group' && data.msg) {
      updateMsgReaction(data.msg.id, data.msg.reactions);
    }
  });

  socket.on('group:pinUpdate', function(data) {
    console.log('📌 group:pinUpdate', data.groupId);
    if (activeChat === data.groupId && activeChatType === 'group') {
      loadGroupMessages(activeChat);
      if (data.msg) updatePinnedMessage(data.msg);
    }
  });

  socket.on('group:messageDeleted', function(data) {
    console.log('🗑️ group:messageDeleted', data.msgId);
    if (activeChat === data.groupId && activeChatType === 'group') {
      var el = document.querySelector('[data-msg-id="' + data.msgId + '"]');
      if (el) {
        el.style.opacity = '0';
        el.style.transition = 'opacity 0.3s';
        setTimeout(function() { el.remove(); }, 300);
      }
    }
  });

  // ===== New User Registered =====
  socket.on('user:registered', function(newUser) {
    console.log('🆕 user:registered', newUser.username);
    if (currentUser && newUser.username !== currentUser.username) {
      var exists = allUsers.some(function(u) { return u.username === newUser.username; });
      if (!exists) {
        allUsers.push(newUser);
        renderDMContacts();
        renderGroupContacts();
        showToast('🆕 ' + newUser.displayName + ' присоединился!', 'info');
      }
    }
  });

  // ===== Account Events =====
  socket.on('account:banned', function(data) {
    showToast('🚫 Аккаунт заблокирован: ' + (data.reason || ''), 'error');
    setTimeout(logout, 2000);
  });

  socket.on('account:deleted', function() {
    showToast('🚫 Аккаунт удалён администратором', 'error');
    setTimeout(logout, 2000);
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
    renderDMContacts();
    renderGroupContacts();
    showToast(t('pro_granted_toast'), 'success');
  });

  socket.on('pro:removed', function(user) {
    console.log('🔻 PRO removed');
    currentUser = user;
    updateUI();
    renderDMContacts();
    renderGroupContacts();
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
    var avHtml = renderAvatarHTML(u.avatar);

    var html = '<div class="contact-item' + (isActive ? ' active' : '') + '" onclick="openDM(\'' + u.username + '\')">';
    html += '<div class="avatar">' + avHtml + '</div>';
    html += '<div class="status-dot ' + (isOnline ? 'online' : 'offline') + '"></div>';
    html += '<div class="contact-info">';
    html += '<div class="contact-name-row">';
    html += '<span class="contact-name">' + esc(u.displayName) + '</span>';
    if (u.isPro) html += '<span class="contact-pro-badge">💎 PRO</span>';
    html += '</div>';
    if (lastMsg) {
      var preview = lastMsg.text || t('msg_file');
      if (lastMsg.type === 'voice') preview = '🎙️ ' + t('voice_msg');
      else if (lastMsg.type === 'file' && lastMsg.fileInfo) {
        if (lastMsg.fileInfo.mimetype && lastMsg.fileInfo.mimetype.startsWith('image/')) preview = '🖼️ Фото';
        else if (lastMsg.fileInfo.mimetype && lastMsg.fileInfo.mimetype.startsWith('video/')) preview = '🎬 Видео';
        else preview = '📎 ' + (lastMsg.fileInfo.originalName || t('msg_file'));
      }
      html += '<div class="contact-last-msg">' + esc(preview).substring(0, 40) + '</div>';
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
        if (lastMsg.type === 'voice') preview = '🎙️ ' + t('voice_msg');
        else if (lastMsg.type === 'file' && lastMsg.fileInfo) {
          if (lastMsg.fileInfo.mimetype && lastMsg.fileInfo.mimetype.startsWith('image/')) preview = '🖼️ Фото';
          else preview = '📎 Файл';
        }
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

  if (!avatarEl || !activeChat) return;

  if (activeChatType === 'dm') {
    var user = allUsers.find(function(u) { return u.username === activeChat; });
    if (user) {
      var av = user.avatar || '😎';
      if (av.startsWith('/uploads/')) {
        avatarEl.innerHTML = '<img src="' + av + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%">';
      } else {
        avatarEl.innerHTML = '';
        avatarEl.textContent = av;
      }
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
      avatarEl.innerHTML = '';
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
  var avContent = '😎';
  // Check current user first (they are NOT in allUsers array)
  if (isOwn && currentUser && currentUser.avatar) {
    if (currentUser.avatar.startsWith('/uploads/')) {
      avContent = '<img src="' + currentUser.avatar + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%">';
    } else {
      avContent = currentUser.avatar;
    }
  } else if (user && user.avatar) {
    if (user.avatar.startsWith('/uploads/')) {
      avContent = '<img src="' + user.avatar + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%">';
    } else {
      avContent = user.avatar;
    }
  }
  html += '<div class="msg-avatar">' + avContent + '</div>';
  html += '<div class="msg-content">';
  // Reply quote
  if (msg.replyTo) {
    var replyMsg = null;
    if (type === 'dm' && activeChat) {
      // Find from currently loaded messages
      var replyEl = document.querySelector('[data-msg-id="' + msg.replyTo + '"] .msg-text');
      var replySenderEl = document.querySelector('[data-msg-id="' + msg.replyTo + '"] .msg-sender');
      var replyText = replyEl ? replyEl.textContent.substring(0, 60) : '💬 Сообщение';
      var replySender = replySenderEl ? replySenderEl.textContent : getDisplayName(msg.replyTo);
      html += '<div class="msg-reply-quote" onclick="scrollToMsg(\'' + msg.replyTo + '\')">';
      html += '<div class="reply-quote-bar"></div>';
      html += '<div class="reply-quote-content">';
      html += '<span class="reply-quote-name">' + esc(replySender) + '</span>';
      html += '<span class="reply-quote-text">' + esc(replyText) + '</span>';
      html += '</div></div>';
    } else {
      html += '<div class="msg-reply-quote"><div class="reply-quote-bar"></div><div class="reply-quote-content"><span class="reply-quote-text">💬 Сообщение</span></div></div>';
    }
  }
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
    // Waveform bars (decorative)
    html += '<div class="voice-waveform">';
    var barCount = 24;
    for (var bi = 0; bi < barCount; bi++) {
      var h = Math.floor(Math.random() * 16) + 4;
      html += '<div class="bar" style="height:' + h + 'px"></div>';
    }
    html += '</div>';
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

  if (msg.edited) {
    html += '<span class="msg-edited-label">ред.</span>';
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

  // Double click for reaction
  {
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
  var voiceEl = btn.closest('.msg-voice');
  var waveform = voiceEl ? voiceEl.querySelector('.voice-waveform') : null;

  // Stop any currently playing audio
  if (currentAudio && currentPlayBtn && currentPlayBtn !== btn) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentPlayBtn.textContent = '▶️';
    currentPlayBtn.dataset.state = 'paused';
    // Stop old waveform animation
    var oldVoice = currentPlayBtn.closest('.msg-voice');
    var oldWave = oldVoice ? oldVoice.querySelector('.voice-waveform') : null;
    if (oldWave) oldWave.classList.remove('playing');
    currentAudio = null;
    currentPlayBtn = null;
  }

  if (state === 'paused') {
    // Start playing
    currentAudio = new Audio(url);
    currentPlayBtn = btn;
    currentAudio.onended = function() {
      btn.textContent = '▶️';
      btn.dataset.state = 'paused';
      if (waveform) waveform.classList.remove('playing');
      currentAudio = null;
      currentPlayBtn = null;
    };
    currentAudio.onerror = function() {
      btn.textContent = '▶️';
      btn.dataset.state = 'paused';
      if (waveform) waveform.classList.remove('playing');
      currentAudio = null;
      currentPlayBtn = null;
    };
    btn.textContent = '⏸️';
    btn.dataset.state = 'playing';
    if (waveform) waveform.classList.add('playing');
    currentAudio.play().catch(function() {
      btn.textContent = '▶️';
      btn.dataset.state = 'paused';
      if (waveform) waveform.classList.remove('playing');
    });
  } else {
    // Pause
    if (currentAudio) {
      currentAudio.pause();
    }
    btn.textContent = '▶️';
    btn.dataset.state = 'paused';
    if (waveform) waveform.classList.remove('playing');
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

  // Edit mode
  if (editingMsgId) {
    if (activeChatType === 'dm') {
      socket.emit('message:edit', { to: activeChat, msgId: editingMsgId, text: text });
    } else if (activeChatType === 'group') {
      socket.emit('group:editMessage', { groupId: activeChat, msgId: editingMsgId, text: text });
    }
    cancelEdit();
    input.value = '';
    autoResize(input);
    document.getElementById('emoji-picker').classList.add('hidden');
    return;
  }

  input.value = '';
  autoResize(input);

  if (activeChatType === 'dm') {
    socket.emit('message:send', { to: activeChat, text: text, type: 'text', replyTo: replyToMsg || null });
  } else if (activeChatType === 'group') {
    socket.emit('group:message', { groupId: activeChat, text: text, type: 'text', replyTo: replyToMsg || null });
  }

  cancelReply();
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
      '<div class="avatar">' + renderAvatarHTML(u.avatar) + '</div>' +
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
      html += '<div class="avatar">' + renderAvatarHTML(u.avatar) + '</div>' + esc(u.displayName) + ' ＋</button>';
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
// ICE candidate buffer — stores candidates until peer connection is ready
var _pendingICE = [];

function startCall(callType) {
  if (!activeChat || activeChatType !== 'dm') {
    return showToast(t('calls_dm_only'), 'info');
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return showToast(t('no_camera'), 'error');
  }
  // Prevent double calls
  if (peerConnection || callPartner) {
    endCallUI();
  }

  callPartner = activeChat;
  _pendingICE = [];
  var savedPartner = callPartner;
  var user = allUsers.find(function(u) { return u.username === savedPartner; });
  var isPro = currentUser && currentUser.isPro;

  var constraints = callType === 'video'
    ? { video: { width: isPro ? { ideal: 1920 } : { ideal: 640 } }, audio: true }
    : { audio: true };

  navigator.mediaDevices.getUserMedia(constraints)
    .then(function(stream) {
      if (callPartner !== savedPartner) { stream.getTracks().forEach(function(t) { t.stop(); }); return; }

      localStream = stream;
      peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });

      stream.getTracks().forEach(function(track) {
        peerConnection.addTrack(track, stream);
      });

      peerConnection.ontrack = function(e) {
        console.log('📺 Got remote track');
        document.getElementById('remote-video').srcObject = e.streams[0];
        document.getElementById('call-no-video').classList.add('hidden');
      };

      peerConnection.onicecandidate = function(e) {
        if (e.candidate && callPartner) {
          socket.emit('call:ice-candidate', { to: callPartner, candidate: e.candidate });
        }
      };

      peerConnection.oniceconnectionstatechange = function() {
        if (!peerConnection) return;
        var state = peerConnection.iceConnectionState;
        console.log('ICE state:', state);
        if (state === 'failed' || state === 'disconnected') {
          setTimeout(function() {
            if (peerConnection) endCallUI(t('call_ended'));
          }, 1500);
        }
      };

      return peerConnection.createOffer();
    })
    .then(function(offer) {
      if (!offer) return;
      return peerConnection.setLocalDescription(offer);
    })
    .then(function() {
      if (!peerConnection) return;
      socket.emit('call:offer', {
        to: savedPartner,
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
  console.log('Incoming call from', data.from);
  if (peerConnection) {
    socket.emit('call:reject', { to: data.from });
    return;
  }

  _pendingICE = [];
  callPartner = data.from;
  window._incomingOffer = data.offer;
  window._incomingCallType = data.callType;

  document.getElementById('call-overlay').classList.remove('hidden');
  document.getElementById('call-incoming').classList.remove('hidden');
  var cc = document.getElementById('call-controls');
  if (cc) cc.style.display = 'none';
  var pip = document.getElementById('call-pip');
  if (pip) pip.classList.add('hidden');
  document.getElementById('call-timer').textContent = '';

  document.getElementById('incoming-name').textContent = data.displayName;
  document.getElementById('incoming-type').textContent = data.callType === 'video' ? t('call_video') : t('call_audio');
  var avEl = document.getElementById('incoming-avatar');
  if (avEl) {
    if (data.avatar && data.avatar.startsWith('/uploads/')) {
      avEl.innerHTML = '<img src="' + data.avatar + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%">';
    } else {
      avEl.innerHTML = '';
      avEl.textContent = data.avatar || '😎';
    }
  }
}

function acceptCall() {
  console.log('Accept call');
  if (!callPartner || !window._incomingOffer) { endCallUI(); return; }

  document.getElementById('call-incoming').classList.add('hidden');
  var cc = document.getElementById('call-controls');
  if (cc) cc.style.display = '';

  var savedPartner = callPartner;
  var callType = window._incomingCallType || 'audio';
  var isPro = currentUser && currentUser.isPro;

  var constraints = callType === 'video'
    ? { video: { width: isPro ? { ideal: 1920 } : { ideal: 640 } }, audio: true }
    : { audio: true };

  navigator.mediaDevices.getUserMedia(constraints)
    .then(function(stream) {
      if (callPartner !== savedPartner) { stream.getTracks().forEach(function(t) { t.stop(); }); return; }

      localStream = stream;
      peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });

      stream.getTracks().forEach(function(track) {
        peerConnection.addTrack(track, stream);
      });

      peerConnection.ontrack = function(e) {
        console.log('Got remote track');
        document.getElementById('remote-video').srcObject = e.streams[0];
        document.getElementById('call-no-video').classList.add('hidden');
      };

      peerConnection.onicecandidate = function(e) {
        if (e.candidate && callPartner) {
          socket.emit('call:ice-candidate', { to: callPartner, candidate: e.candidate });
        }
      };

      peerConnection.oniceconnectionstatechange = function() {
        if (!peerConnection) return;
        var state = peerConnection.iceConnectionState;
        console.log('ICE state:', state);
        if (state === 'failed' || state === 'disconnected') {
          setTimeout(function() {
            if (peerConnection) endCallUI(t('call_ended'));
          }, 1500);
        }
      };

      return peerConnection.setRemoteDescription(window._incomingOffer);
    })
    .then(function() {
      if (!peerConnection) return;
      // Flush buffered ICE candidates
      console.log('Flushing', _pendingICE.length, 'buffered ICE candidates');
      _pendingICE.forEach(function(c) {
        peerConnection.addIceCandidate(c).catch(function() {});
      });
      _pendingICE = [];
      return peerConnection.createAnswer();
    })
    .then(function(answer) {
      if (!answer) return;
      return peerConnection.setLocalDescription(answer);
    })
    .then(function() {
      if (!peerConnection) return;
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
  var partner = callPartner;
  if (socket && partner) {
    socket.emit('call:reject', { to: partner });
  }
  endCallUI();
}

function handleCallAnswered(data) {
  console.log('Call answered');
  if (!peerConnection) { console.warn('No peerConnection for answer'); return; }
  peerConnection.setRemoteDescription(data.answer)
    .then(function() {
      console.log('Remote description set');
      // Flush buffered ICE candidates
      console.log('Flushing', _pendingICE.length, 'buffered ICE candidates');
      _pendingICE.forEach(function(c) {
        peerConnection.addIceCandidate(c).catch(function() {});
      });
      _pendingICE = [];
      startCallTimer();
    })
    .catch(function(e) {
      console.error('setRemote err:', e);
    });
}

function handleRemoteICE(data) {
  if (!data.candidate) return;
  if (peerConnection && peerConnection.remoteDescription && peerConnection.remoteDescription.type) {
    peerConnection.addIceCandidate(data.candidate).catch(function() {});
  } else {
    // Buffer — will flush after setRemoteDescription
    console.log('Buffering ICE candidate');
    _pendingICE.push(data.candidate);
  }
}

function hangupCall() {
  var partner = callPartner;
  if (socket && partner) {
    socket.emit('call:hangup', { to: partner });
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
  var avEl = document.getElementById('call-avatar');
  var av = user ? (user.avatar || '😎') : '😎';
  if (av && av.startsWith('/uploads/')) {
    avEl.innerHTML = '<img src="' + av + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%">';
  } else {
    avEl.innerHTML = '';
    avEl.textContent = av;
  }
  document.getElementById('call-name').textContent = user ? user.displayName : (callPartner || 'User');
  if (callType !== 'video' || !localStream || !localStream.getVideoTracks().length) {
    document.getElementById('call-no-video').classList.remove('hidden');
  }
}

function startCallTimer() {
  callStartTime = Date.now();
  clearInterval(callTimerInterval);
  callTimerInterval = setInterval(function() {
    var s = Math.floor((Date.now() - callStartTime) / 1000);
    document.getElementById('call-timer').textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }, 1000);
}

function endCallUI(msg) {
  console.log('endCallUI');
  if (localStream) { localStream.getTracks().forEach(function(t) { t.stop(); }); localStream = null; }
  if (peerConnection) { try { peerConnection.close(); } catch(e) {} peerConnection = null; }
  clearInterval(callTimerInterval);
  _pendingICE = [];

  var rv = document.getElementById('remote-video'); if (rv) rv.srcObject = null;
  var lv = document.getElementById('local-video'); if (lv) lv.srcObject = null;

  document.getElementById('call-overlay').classList.add('hidden');
  document.getElementById('call-incoming').classList.add('hidden');
  var cc = document.getElementById('call-controls'); if (cc) cc.style.display = 'none';
  var pip = document.getElementById('call-pip'); if (pip) pip.classList.add('hidden');
  document.getElementById('call-timer').textContent = '0:00';

  var micBtn = document.getElementById('btn-toggle-mic');
  if (micBtn) { micBtn.textContent = '🎙️'; micBtn.classList.remove('muted'); }
  var camBtn = document.getElementById('btn-toggle-cam');
  if (camBtn) { camBtn.textContent = '📹'; camBtn.classList.remove('muted'); }

  callPartner = null;
  callStartTime = 0;
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

// ===== REACTION UPDATE IN DOM =====
function updateMsgReaction(msgId, reactions) {
  var el = document.querySelector('[data-msg-id="' + msgId + '"]');
  if (!el) return;
  var container = el.querySelector('.msg-reactions');
  if (!container) {
    // Create reactions container
    var content = el.querySelector('.msg-content');
    if (!content) return;
    container = document.createElement('div');
    container.className = 'msg-reactions';
    // Insert after msg-text or at end
    var textEl = content.querySelector('.msg-text');
    if (textEl && textEl.nextSibling) {
      content.insertBefore(container, textEl.nextSibling);
    } else {
      content.appendChild(container);
    }
  }
  if (!reactions || reactions.length === 0) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = reactions.map(function(r) {
    return '<span class="msg-reaction">' + r.emoji + '</span>';
  }).join('');
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

  // Reply — always available
  menu.innerHTML += '<button class="msg-context-btn" onclick="startReply(\'' + msgId + '\')">↩️ Ответить</button>';
  // Reactions — always available
  menu.innerHTML += '<button class="msg-context-btn" onclick="reactToMsg(\'' + msgId + '\')">😍 Реакция</button>';
  // Pin — always available
  menu.innerHTML += '<button class="msg-context-btn" onclick="pinMsg(\'' + msgId + '\')">📌 Закрепить</button>';
  // Copy
  menu.innerHTML += '<button class="msg-context-btn" onclick="copyMsg(\'' + msgId + '\')">📋 Копировать</button>';
  // Edit & Delete — only own messages
  if (isOwn) {
    menu.innerHTML += '<button class="msg-context-btn" onclick="startEdit(\'' + msgId + '\')">✏️ Редактировать</button>';
    menu.innerHTML += '<button class="msg-context-btn" style="color:var(--danger)" onclick="deleteMsg(\'' + msgId + '\')">🗑️ Удалить</button>';
  }

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
  var msgEl = document.querySelector('[data-msg-id="' + msgId + '"]');
  if (!msgEl) return;
  var picker = document.getElementById('reaction-picker');
  if (!picker) return;

  // Position relative to message
  var rect = msgEl.getBoundingClientRect();
  picker.classList.remove('hidden');
  picker.style.position = 'fixed';
  picker.style.top = (rect.top - 52) + 'px';
  picker.style.left = Math.max(10, Math.min(rect.left, window.innerWidth - 300)) + 'px';
  picker.style.zIndex = '500';

  // Use mousedown instead of click to avoid race with document click handler
  var handler = function(e) {
    var emoji = e.target.closest('.reaction-btn');
    if (emoji) {
      e.preventDefault();
      e.stopPropagation();
      var em = emoji.dataset.emoji;
      if (activeChatType === 'dm') {
        socket.emit('message:react', { to: activeChat, msgId: msgId, emoji: em });
      } else if (activeChatType === 'group') {
        socket.emit('group:react', { groupId: activeChat, msgId: msgId, emoji: em });
      }
      picker.classList.add('hidden');
      picker.removeEventListener('click', handler);
    } else if (!e.target.closest('#reaction-picker')) {
      picker.classList.add('hidden');
      picker.removeEventListener('click', handler);
    }
  };
  // Remove old handlers by removing and re-adding
  picker.onclick = null;
  picker.addEventListener('click', handler);
}

function pinMsg(msgId) {
  closeContextMenu();
  if (activeChatType === 'dm') {
    socket.emit('message:pin', { to: activeChat, msgId: msgId });
  } else if (activeChatType === 'group') {
    socket.emit('group:pin', { groupId: activeChat, msgId: msgId });
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

// ===== REPLY =====
function startReply(msgId) {
  closeContextMenu();
  // Find the message text
  var msgEl = document.querySelector('[data-msg-id="' + msgId + '"]');
  var msgTextEl = msgEl ? msgEl.querySelector('.msg-text') : null;
  var senderEl = msgEl ? msgEl.querySelector('.msg-sender') : null;
  if (!msgEl) return;

  replyToMsg = msgId;
  editingMsgId = null; // cancel any edit

  document.getElementById('reply-bar').classList.remove('hidden');
  document.getElementById('edit-bar').classList.add('hidden');
  document.getElementById('reply-bar-name').textContent = senderEl ? senderEl.textContent : 'User';
  document.getElementById('reply-bar-text').textContent = msgTextEl ? msgTextEl.textContent.substring(0, 80) : '...';
  document.getElementById('message-input').focus();
}

function cancelReply() {
  replyToMsg = null;
  document.getElementById('reply-bar').classList.add('hidden');
}

// ===== EDIT =====
function startEdit(msgId) {
  closeContextMenu();
  var msgEl = document.querySelector('[data-msg-id="' + msgId + '"]');
  var msgTextEl = msgEl ? msgEl.querySelector('.msg-text') : null;
  if (!msgEl || !msgTextEl) return;

  editingMsgId = msgId;
  replyToMsg = null;

  document.getElementById('edit-bar').classList.remove('hidden');
  document.getElementById('reply-bar').classList.add('hidden');
  document.getElementById('edit-bar-text').textContent = msgTextEl.textContent.substring(0, 80);
  
  var input = document.getElementById('message-input');
  input.value = msgTextEl.textContent;
  input.focus();
  autoResize(input);
}

function cancelEdit() {
  editingMsgId = null;
  document.getElementById('edit-bar').classList.add('hidden');
  document.getElementById('message-input').value = '';
}

// ===== DELETE =====
function deleteMsg(msgId) {
  closeContextMenu();
  if (!confirm('Удалить сообщение?')) return;
  if (activeChatType === 'dm') {
    socket.emit('message:delete', { to: activeChat, msgId: msgId });
  } else if (activeChatType === 'group') {
    socket.emit('group:deleteMessage', { groupId: activeChat, msgId: msgId });
  }
  // Remove from DOM
  var el = document.querySelector('[data-msg-id="' + msgId + '"]');
  if (el) { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(function() { el.remove(); }, 300); }
}

function showReactionPicker(e, msgId) {
  e.preventDefault();
  e.stopPropagation();
  var msgEl = document.querySelector('[data-msg-id="' + msgId + '"]');
  if (!msgEl) return;
  var picker = document.getElementById('reaction-picker');
  if (!picker) return;

  var rect = msgEl.getBoundingClientRect();
  picker.classList.remove('hidden');
  picker.style.position = 'fixed';
  picker.style.top = (rect.top - 52) + 'px';
  picker.style.left = Math.max(10, Math.min(rect.left, window.innerWidth - 300)) + 'px';
  picker.style.zIndex = '500';

  var handler = function(ev) {
    var emoji = ev.target.closest('.reaction-btn');
    if (emoji) {
      ev.preventDefault();
      ev.stopPropagation();
      var em = emoji.dataset.emoji;
      if (activeChatType === 'dm') {
        socket.emit('message:react', { to: activeChat, msgId: msgId, emoji: em });
      } else if (activeChatType === 'group') {
        socket.emit('group:react', { groupId: activeChat, msgId: msgId, emoji: em });
      }
      picker.classList.add('hidden');
      picker.removeEventListener('click', handler);
    } else if (!ev.target.closest('#reaction-picker')) {
      picker.classList.add('hidden');
      picker.removeEventListener('click', handler);
    }
  };
  picker.onclick = null;
  picker.addEventListener('click', handler);
}

// ===== ADMIN PANEL =====
function openAdminPanel() {
  document.getElementById('admin-modal').classList.remove('hidden');
  if (adminSecret) {
    adminLogin();
  }
}

function adminLogin() {
  var secret = document.getElementById('admin-secret-input').value.trim();
  if (!secret && !adminSecret) { showToast('Введите ключ', 'error'); return; }
  if (secret) adminSecret = secret;
  localStorage.setItem('chatly_admin_secret', adminSecret);

  // Verify by fetching user list
  fetch(API + '/admin/' + adminSecret + '/list').then(function(r) {
    if (!r.ok) { showToast('❌ Неверный ключ', 'error'); adminSecret = ''; localStorage.removeItem('chatly_admin_secret'); return; }
    document.getElementById('admin-login-section').classList.add('hidden');
    document.getElementById('admin-dashboard').classList.remove('hidden');
    loadAdminData();
  }).catch(function() { showToast('❌ Ошибка подключения', 'error'); });
}

async function loadAdminData() {
  try {
    // Stats
    var statsRes = await fetch(API + '/admin/' + adminSecret + '/stats');
    var stats = await statsRes.json();
    document.getElementById('admin-stats').innerHTML =
      '<div class="stat-card"><div class="stat-value">' + stats.users.total + '</div><div class="stat-label">Пользователей</div></div>' +
      '<div class="stat-card"><div class="stat-value">' + stats.users.online + '</div><div class="stat-label">Онлайн</div></div>' +
      '<div class="stat-card"><div class="stat-value">' + stats.messages.total + '</div><div class="stat-label">Сообщений</div></div>' +
      '<div class="stat-card"><div class="stat-value">' + stats.groups.total + '</div><div class="stat-label">Групп</div></div>';

    // Users
    var usersRes = await fetch(API + '/admin/' + adminSecret + '/list');
    var usersData = await usersRes.json();
    renderAdminUsers(usersData.users || []);

    // PRO requests
    var proRes = await fetch(API + '/admin/' + adminSecret + '/requests');
    var proReqs = await proRes.json();
    var proHtml = proReqs.length === 0 ? '<div style="padding:10px;color:var(--text-3)">Нет запросов</div>' :
      proReqs.map(function(r) {
        return '<div class="admin-user-item"><span>' + esc(r.displayName) + ' (@' + r.username + ')</span><button class="btn-primary" style="font-size:11px;padding:5px 12px" onclick="adminGrantPROTo(\'' + r.username + '\')">💎 Дать PRO</button></div>';
      }).join('');
    document.getElementById('admin-pro-requests').innerHTML = proHtml;

    // Reports
    var repRes = await fetch(API + '/admin/' + adminSecret + '/reports');
    var reports = await repRes.json();
    var repHtml = reports.length === 0 ? '<div style="padding:10px;color:var(--text-3)">Нет жалоб</div>' :
      reports.map(function(r) {
        return '<div class="admin-user-item"><span>🚨 @' + r.from + ' → @' + r.target + ': ' + esc(r.reason) + '</span></div>';
      }).join('');
    document.getElementById('admin-reports').innerHTML = repHtml;

    // Activity
    var actRes = await fetch(API + '/admin/' + adminSecret + '/activity');
    var activity = await actRes.json();
    var actHtml = activity.slice(0, 30).map(function(a) {
      return '<div class="admin-log-item"><span class="log-time">' + formatTime(a.timestamp) + '</span><span class="log-type">' + a.type + '</span><span class="log-user">@' + a.username + '</span><span class="log-details">' + esc(a.details) + '</span></div>';
    }).join('');
    document.getElementById('admin-activity').innerHTML = actHtml || '<div style="padding:10px;color:var(--text-3)">Пусто</div>';
  } catch (err) {
    showToast('❌ Ошибка загрузки', 'error');
  }
}

function renderAdminUsers(users) {
  var search = (document.getElementById('admin-user-search').value || '').toLowerCase();
  var filtered = users.filter(function(u) {
    return u.username.includes(search) || u.displayName.toLowerCase().includes(search);
  });
  document.getElementById('admin-user-list').innerHTML = filtered.map(function(u) {
    var badge = u.isPro ? ' 💎' : '';
    var online = u.online ? '🟢' : '⚫';
    return '<div class="admin-user-item">' +
      '<div class="admin-user-info"><span>' + online + ' ' + esc(u.displayName) + badge + '</span><span class="admin-user-un">@' + u.username + '</span></div>' +
      '<div class="admin-user-actions">' +
      (u.isPro ? '<button class="btn-secondary" style="font-size:10px;padding:3px 10px" onclick="adminRemovePROFrom(\'' + u.username + '\')">❌ PRO</button>' :
        '<button class="btn-primary" style="font-size:10px;padding:3px 10px" onclick="adminGrantPROTo(\'' + u.username + '\')">💎 PRO</button>') +
      '</div></div>';
  }).join('');
}

function adminGrantPROTo(username) {
  fetch(API + '/admin/' + adminSecret + '/pro/' + username, { method: 'POST' }).then(function(r) { return r.json(); }).then(function(d) {
    showToast(d.success ? '✅ PRO выдан @' + username : '❌ ' + d.error, d.success ? 'success' : 'error');
    loadAdminData();
  });
}

function adminRemovePROFrom(username) {
  fetch(API + '/admin/' + adminSecret + '/remove-pro/' + username, { method: 'POST' }).then(function(r) { return r.json(); }).then(function(d) {
    showToast(d.success ? '✅ PRO снят' : '❌ ' + d.error, d.success ? 'success' : 'error');
    loadAdminData();
  });
}

function adminGrantPRO() {
  var u = document.getElementById('admin-quick-user').value.trim().toLowerCase();
  if (!u) return showToast('Введите username', 'error');
  adminGrantPROTo(u);
}

function adminRemovePRO() {
  var u = document.getElementById('admin-quick-user').value.trim().toLowerCase();
  if (!u) return showToast('Введите username', 'error');
  adminRemovePROFrom(u);
}

function adminBanUser() {
  var u = document.getElementById('admin-quick-user').value.trim().toLowerCase();
  if (!u) return showToast('Введите username', 'error');
  if (!confirm('Забанить @' + u + '?')) return;
  fetch(API + '/admin/' + adminSecret + '/ban/' + u, { method: 'POST' }).then(function(r) { return r.json(); }).then(function(d) {
    showToast(d.success ? '🚫 @' + u + ' забанен' : '❌ ' + d.error, d.success ? 'success' : 'error');
    loadAdminData();
  });
}

function adminUnbanUser() {
  var u = document.getElementById('admin-quick-user').value.trim().toLowerCase();
  if (!u) return showToast('Введите username', 'error');
  fetch(API + '/admin/' + adminSecret + '/unban/' + u, { method: 'POST' }).then(function(r) { return r.json(); }).then(function(d) {
    showToast(d.success ? '✅ @' + u + ' разбанен' : '❌ ' + d.error, d.success ? 'success' : 'error');
    loadAdminData();
  });
}

function adminResetPassword() {
  var u = document.getElementById('admin-reset-user').value.trim().toLowerCase();
  var p = document.getElementById('admin-reset-pass').value;
  if (!u || !p) return showToast('Заполните оба поля', 'error');
  fetch(API + '/admin/' + adminSecret + '/resetpass/' + u + '/' + p, { method: 'POST' }).then(function(r) { return r.json(); }).then(function(d) {
    showToast(d.success ? '🔑 Пароль сброшен' : '❌ ' + d.error, d.success ? 'success' : 'error');
  });
}

function adminDeleteUser() {
  var u = document.getElementById('admin-delete-user').value.trim().toLowerCase();
  if (!u) return showToast('Введите username', 'error');
  if (!confirm('⚠️ УДАЛИТЬ аккаунт @' + u + '? Это необратимо!')) return;
  fetch(API + '/admin/' + adminSecret + '/delete-user/' + u, { method: 'POST' }).then(function(r) { return r.json(); }).then(function(d) {
    showToast(d.success ? '🗑️ @' + u + ' удалён' : '❌ ' + d.error, d.success ? 'success' : 'error');
    loadAdminData();
  });
}

function scrollToMsg(msgId) {
  var el = document.querySelector('[data-msg-id="' + msgId + '"]');
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.style.background = 'rgba(124,58,237,.2)';
    setTimeout(function() { el.style.background = ''; }, 1500);
  }
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
    var avatarValue = document.getElementById('avatar-select').value;
    // If no emoji selected and current avatar is a photo URL, preserve it
    if (!avatarValue && currentUser.avatar && currentUser.avatar.startsWith('/uploads/')) {
      avatarValue = currentUser.avatar;
    }
    // If no emoji and no photo, preserve current emoji avatar
    if (!avatarValue && currentUser.avatar) {
      avatarValue = currentUser.avatar;
    }
    var res = await fetch(API + '/api/profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({
        displayName: document.getElementById('edit-displayname').value.trim(),
        bio: document.getElementById('edit-bio').value.trim(),
        avatar: avatarValue || undefined
      })
    });
    currentUser = await res.json();
    updateUI();
    renderDMContacts();
    renderGroupContacts();
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
  clearInterval(window._userRefreshInterval);
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  showAuth();
  document.body.className = '';
}

// ===== UTILITIES =====
function renderAvatarHTML(avatar) {
  if (avatar && avatar.startsWith('/uploads/')) {
    return '<img src="' + avatar + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%">';
  }
  return avatar || '😎';
}

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
