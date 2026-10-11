/**
 * NOVA NOTES AI - MAIN APPLICATION CONTROLLER
 * State management, note CRUD, filtering, pinning, archiving,
 * search, AI integrations, flashcards, and UI events.
 */

class NotesApp {
  constructor() {
    this.STORAGE_KEY = 'nova_notes_data_v2';
    this.THEME_KEY = 'nova_notes_theme';
    
    this.notes = [];
    this.activeCategory = 'all';
    this.activeView = 'all'; // 'all', 'pinned', 'archived', 'trash'
    this.activeTag = null;
    this.searchQuery = '';
    this.sortBy = 'updated';
    this.viewMode = 'grid'; // 'grid' | 'list'
    this.currentEditingId = null;

    // Daily Notes tracker state
    this.activeDay = null; // 'Monday', 'Tuesday', ... or null
    this.dailyTimeframe = 'thisWeek'; // 'thisWeek' | 'allTime'
    this.dailyCardCollapsed = false;
    this.targetDayForNewNote = null;

    // Flashcard deck state
    this.currentFlashcards = [];
    this.currentCardIndex = 0;
    this.isCardFlipped = false;

    this.init();
  }

  init() {
    this.loadNotes();
    this.loadTheme();
    this.loadUserSession();
    this.syncWithBackend();
    this.bindEvents();
    this.render();
  }

  getApiBase() {
    return (window.location.origin && window.location.origin.startsWith('http')) ? window.location.origin : 'http://localhost:5000';
  }

  getAuthHeaders(extraHeaders = {}) {
    const token = localStorage.getItem('nova_jwt_token');
    const headers = { 'Content-Type': 'application/json', ...extraHeaders };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  async syncWithBackend() {
    try {
      const API_BASE = this.getApiBase();
      let userEmail = '';
      try {
        const userSession = JSON.parse(localStorage.getItem('nova_user_session') || '{}');
        if (userSession.email) userEmail = userSession.email;
      } catch (e) {}

      // 0. Fetch latest user account details from MongoDB backend
      if (userEmail) {
        try {
          const userRes = await fetch(`${API_BASE}/api/auth/login`, {
            method: 'POST',
            headers: this.getAuthHeaders(),
            body: JSON.stringify({ email: userEmail })
          });
          const userData = await userRes.json();
          if (userRes.ok && userData.success && userData.user) {
            if (userData.token) localStorage.setItem('nova_jwt_token', userData.token);
            localStorage.setItem('nova_user_session', JSON.stringify(userData.user));
            this.renderUserSession(userData.user);
          }
        } catch (e) {
          console.log('MongoDB profile sync error:', e);
        }
      }

      // 1. Auto-upload any local notes that were created offline/via file protocol
      if (Array.isArray(this.notes)) {
        for (const note of this.notes) {
          if (!note._id || (typeof note.id === 'string' && note.id.startsWith('note-'))) {
            try {
              const res = await fetch(`${API_BASE}/api/notes`, {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify({ ...note, userEmail: note.userEmail || userEmail })
              });
              const data = await res.json();
              if (data.success && data.data?._id) {
                note._id = data.data._id;
                note.id = data.data._id;
              }
            } catch (e) {
              console.error('Offline upload note error:', e);
            }
          }
        }
        this.saveNotes(false);
      }

      // 2. Fetch fresh notes from MongoDB for this user
      const url = userEmail ? `${API_BASE}/api/notes?userEmail=${encodeURIComponent(userEmail)}` : `${API_BASE}/api/notes`;
      const response = await fetch(url, { headers: this.getAuthHeaders() });
      if (response.ok) {
        const data = await response.json();
        if (data.success && Array.isArray(data.data)) {
          this.notes = data.data.map(n => ({
            ...n,
            id: n._id || n.id
          }));
          this.saveNotes(false);
          this.render();
          this.checkReminderAlerts();
        }
      }
    } catch (err) {
      console.error('Backend sync error:', err);
    }
  }

  checkReminderAlerts() {
    if (!Array.isArray(this.notes) || this.notes.length === 0) return;

    const activeReminders = [];
    const now = new Date();

    for (const note of this.notes) {
      if (note.isTrash || note.isArchived) continue;

      let remDate = null;
      let textMatch = null;

      // 1. Explicit reminderDate
      if (note.reminderDate) {
        remDate = new Date(note.reminderDate);
      }
      
      // 2. Auto-detect date strings in note text (e.g. 24-09-26, 25-09-2026, 24/09/2026)
      const dateRegex = /\b(\d{1,2}[-/\.]\d{1,2}[-/\.]\d{2,4})\b/;
      const contentMatch = (note.content || '').match(dateRegex) || (note.title || '').match(dateRegex);
      if (!remDate && contentMatch) {
        textMatch = contentMatch[1];
        const parts = textMatch.split(/[-/\.]/);
        if (parts.length === 3) {
          let day = parseInt(parts[0], 10);
          let month = parseInt(parts[1], 10) - 1;
          let year = parseInt(parts[2], 10);
          if (year < 100) year += 2000;
          remDate = new Date(year, month, day, 23, 59, 59);
        }
      }

      if (remDate && !isNaN(remDate.getTime())) {
        const diffDays = (remDate - now) / (1000 * 60 * 60 * 24);
        // Alert if due within next 7 days or overdue
        if (diffDays <= 7) {
          activeReminders.push({
            note,
            remDate,
            textMatch,
            isOverdue: remDate < now
          });
        }
      }
    }

    if (activeReminders.length > 0) {
      setTimeout(() => this.showReminderAlertModal(activeReminders), 500);
    }
  }

  showReminderAlertModal(reminders) {
    const modal = document.getElementById('reminder-alert-modal');
    const body = document.getElementById('reminder-alert-body');
    if (!modal || !body) return;

    let userSession = {};
    try { userSession = JSON.parse(localStorage.getItem('nova_user_session') || '{}'); } catch(e){}
    const userName = userSession.name || 'User';

    let html = `
      <p style="font-size:0.9rem; color:var(--text-secondary); margin-bottom:4px;">
        Welcome back, <strong>${this._escapeHtml(userName)}</strong>!
      </p>
      <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:12px;">
        You have <strong>${reminders.length}</strong> active / due reminder(s) found in your notes:
      </p>
      <div style="display:flex; flex-direction:column; gap:10px;">
    `;

    for (const item of reminders) {
      const formatted = item.remDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
      html += `
        <div style="padding:12px 14px; border-radius:8px; background:rgba(255,255,255,0.04); border-left:4px solid ${item.isOverdue ? '#ef4444' : '#f59e0b'};">
          <div style="font-weight:700; color:var(--text-primary); font-size:0.95rem;">
            ${this._escapeHtml(item.note.title || 'Untitled Note')}
          </div>
          ${item.note.content ? `
            <div style="font-size:0.84rem; color:var(--text-secondary); margin-top:4px;">
              ${this._escapeHtml(item.note.content.slice(0, 100))}
            </div>
          ` : ''}
          <div style="font-size:0.8rem; font-weight:600; color:${item.isOverdue ? '#f87171' : '#fbbf24'}; margin-top:6px; display:flex; align-items:center; gap:6px;">
            <i data-lucide="clock" style="width:14px; height:14px;"></i>
            <span>${item.isOverdue ? 'Overdue: ' : 'Reminder: '}${formatted}</span>
            ${item.textMatch ? `<span style="font-size:0.75rem; color:var(--text-muted); font-weight:normal;">(In text: "${this._escapeHtml(item.textMatch)}")</span>` : ''}
          </div>
        </div>
      `;
    }

    html += `</div>`;
    body.innerHTML = html;
    modal.classList.add('active');
    if (window.lucide) lucide.createIcons();
  }

  closeReminderAlertModal() {
    const modal = document.getElementById('reminder-alert-modal');
    if (modal) modal.classList.remove('active');
  }

  loadUserSession() {
    const raw = localStorage.getItem('nova_user_session');
    let user = null;
    if (raw) {
      try {
        user = JSON.parse(raw);
      } catch (e) {}
    }

    if (!user) {
      // Redirect to login if unauthenticated
      window.location.href = 'login.html';
      return;
    }

    this.renderUserSession(user);
  }

  renderUserSession(user) {
    if (!user) return;
    const nameEl = document.getElementById('user-name-display');
    const roleEl = document.getElementById('user-role-display');
    const avatarEl = document.getElementById('user-avatar-display');

    if (nameEl) nameEl.textContent = user.name || 'User';
    if (roleEl) roleEl.textContent = user.role || 'Member';
    if (avatarEl) avatarEl.textContent = (user.avatar || (user.name || 'U').charAt(0)).toUpperCase();
  }

  logoutUser() {
    localStorage.removeItem('nova_user_session');
    localStorage.removeItem(this.STORAGE_KEY);
    this.showToast('Logged out. Redirecting to login...', 'info');
    setTimeout(() => {
      window.location.href = 'login.html';
    }, 600);
  }

  /* --- Persistence & Data Loading --- */
  loadNotes() {
    const raw = localStorage.getItem(this.STORAGE_KEY);
    if (raw) {
      try {
        this.notes = JSON.parse(raw);
      } catch (e) {
        console.error('Failed to parse stored notes:', e);
        this.notes = [];
      }
    } else {
      this.notes = [];
      this.saveNotes();
    }
  }

  saveNotes(syncToServer = true) {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.notes));
    this.updateCategoryBadges();
  }

  loadTheme() {
    const theme = localStorage.getItem(this.THEME_KEY) || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    const themeIcon = document.getElementById('theme-toggle-icon');
    if (themeIcon) {
      themeIcon.setAttribute('data-lucide', theme === 'dark' ? 'sun' : 'moon');
      if (window.lucide) lucide.createIcons();
    }
  }

  toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem(this.THEME_KEY, next);
    this.loadTheme();
    this.showToast(`Switched to ${next} mode`, 'info');
  }

  /* --- Note CRUD Operations --- */
  createNote({ title, content, category = 'general', tags = [], priority = 'medium', isPinned = false, attachments = [], reminderDate = null, noteDay = null }) {
    let userEmail = '';
    try {
      const userSession = JSON.parse(localStorage.getItem('nova_user_session') || '{}');
      if (userSession.email) userEmail = userSession.email;
    } catch (e) {}

    let createdAtVal = new Date().toISOString();
    if (noteDay && noteDay !== 'auto') {
      const d = this.getDateForDayOfWeek(noteDay);
      if (d) createdAtVal = d.toISOString();
    }

    const newNote = {
      id: 'note-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      title: title.trim() || 'Untitled Note',
      content: content.trim(),
      category: category.toLowerCase(),
      tags: Array.isArray(tags) ? tags : this._parseTags(tags),
      priority: priority.toLowerCase(),
      isPinned: Boolean(isPinned),
      isArchived: false,
      isTrash: false,
      userEmail: userEmail,
      attachments: Array.isArray(attachments) ? attachments : [],
      reminderDate: reminderDate || null,
      noteDay: noteDay || null,
      createdAt: createdAtVal,
      updatedAt: new Date().toISOString(),
      colorTheme: 'default'
    };

    this.notes.unshift(newNote);
    this.saveNotes();
    this.render();
    this.showToast('Note created & saved to MongoDB!', 'success');

    const API_BASE = this.getApiBase();
    fetch(`${API_BASE}/api/notes`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(newNote)
    }).then(res => res.json()).then(data => {
      if (data.success && data.data?._id) {
        newNote._id = data.data._id;
        newNote.id = data.data._id;
        this.saveNotes();
      }
    }).catch(err => console.error('Failed to save note to MongoDB:', err));

    return newNote;
  }

  updateNote(id, data) {
    const idx = this.notes.findIndex(n => n.id === id || n._id === id);
    if (idx === -1) return;

    this.notes[idx] = {
      ...this.notes[idx],
      ...data,
      tags: Array.isArray(data.tags) ? data.tags : this._parseTags(data.tags || ''),
      updatedAt: new Date().toISOString()
    };

    const target = this.notes[idx];
    this.saveNotes();
    this.render();
    this.showToast('Note updated', 'success');

    const API_BASE = this.getApiBase();
    const targetId = target._id || target.id;
    if (targetId && !targetId.startsWith('note-')) {
      fetch(`${API_BASE}/api/notes/${targetId}`, {
        method: 'PUT',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(target)
      }).catch(() => {});
    }
  }

  togglePin(id, event) {
    if (event) event.stopPropagation();
    const note = this.notes.find(n => n.id === id || n._id === id);
    if (!note) return;

    note.isPinned = !note.isPinned;
    note.updatedAt = new Date().toISOString();
    this.saveNotes();
    this.render();
    this.showToast(note.isPinned ? '📌 Note pinned to top' : 'Note unpinned', 'info');

    const API_BASE = this.getApiBase();
    const targetId = note._id || note.id;
    if (targetId && !targetId.startsWith('note-')) {
      fetch(`${API_BASE}/api/notes/${targetId}`, {
        method: 'PUT',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ isPinned: note.isPinned })
      }).catch(err => console.error('Failed to sync pin status:', err));
    }
  }

  toggleArchive(id, event) {
    if (event) event.stopPropagation();
    const note = this.notes.find(n => n.id === id || n._id === id);
    if (!note) return;

    note.isArchived = !note.isArchived;
    note.isPinned = false; // Cannot be pinned while archived
    note.updatedAt = new Date().toISOString();
    this.saveNotes();
    this.render();
    this.showToast(note.isArchived ? '📦 Note moved to Archive' : 'Note unarchived', 'info');

    const API_BASE = this.getApiBase();
    const targetId = note._id || note.id;
    if (targetId && !targetId.startsWith('note-')) {
      fetch(`${API_BASE}/api/notes/${targetId}`, {
        method: 'PUT',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ isArchived: note.isArchived, isPinned: note.isPinned })
      }).catch(err => console.error('Failed to sync archive status:', err));
    }
  }

  moveToTrash(id, event) {
    if (event) event.stopPropagation();
    const note = this.notes.find(n => n.id === id || n._id === id);
    if (!note) return;

    note.isTrash = true;
    note.isPinned = false;
    note.updatedAt = new Date().toISOString();
    this.saveNotes();
    this.render();
    this.showToast('🗑️ Note moved to Trash', 'warning');

    const API_BASE = this.getApiBase();
    const targetId = note._id || note.id;
    if (targetId && !targetId.startsWith('note-')) {
      fetch(`${API_BASE}/api/notes/${targetId}`, {
        method: 'PUT',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ isTrash: true, isPinned: false })
      }).catch(err => console.error('Failed to sync trash status:', err));
    }
  }

  restoreFromTrash(id, event) {
    if (event) event.stopPropagation();
    const note = this.notes.find(n => n.id === id || n._id === id);
    if (!note) return;

    note.isTrash = false;
    note.updatedAt = new Date().toISOString();
    this.saveNotes();
    this.render();
    this.showToast('Note restored from Trash', 'success');

    const API_BASE = this.getApiBase();
    const targetId = note._id || note.id;
    if (targetId && !targetId.startsWith('note-')) {
      fetch(`${API_BASE}/api/notes/${targetId}`, {
        method: 'PUT',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ isTrash: false })
      }).catch(err => console.error('Failed to sync restore status:', err));
    }
  }

  permanentDelete(id, event) {
    if (event) event.stopPropagation();
    if (!confirm('Are you sure you want to permanently delete this note?')) return;

    this.notes = this.notes.filter(n => n.id !== id && n._id !== id);
    this.saveNotes();
    this.render();
    this.showToast('Note permanently deleted', 'warning');

    const API_BASE = this.getApiBase();
    if (id && !id.startsWith('note-')) {
      fetch(`${API_BASE}/api/notes/${id}`, {
        method: 'DELETE',
        headers: this.getAuthHeaders()
      }).catch(() => {});
    }
  }

  duplicateNote(id, event) {
    if (event) event.stopPropagation();
    const note = this.notes.find(n => n.id === id);
    if (!note) return;

    const duplicate = {
      ...note,
      id: 'note-' + Date.now(),
      title: `${note.title} (Copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.notes.unshift(duplicate);
    this.saveNotes();
    this.render();
    this.showToast('Note duplicated', 'info');
  }

  toggleChecklistItem(noteId, lineIndex, event) {
    if (event) event.stopPropagation();
    const note = this.notes.find(n => n.id === noteId || n._id === noteId);
    if (!note) return;

    const lines = note.content.split('\n');
    let currentChecklistIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      if (/^[-*]\s*\[[ x]\]/.test(lines[i])) {
        if (currentChecklistIndex === lineIndex) {
          if (lines[i].includes('[ ]')) {
            lines[i] = lines[i].replace('[ ]', '[x]');
          } else {
            lines[i] = lines[i].replace('[x]', '[ ]');
          }
          break;
        }
        currentChecklistIndex++;
      }
    }

    note.content = lines.join('\n');
    note.updatedAt = new Date().toISOString();
    this.saveNotes();
    this.render();

    const API_BASE = this.getApiBase();
    const targetId = note._id || note.id;
    if (targetId && !targetId.startsWith('note-')) {
      fetch(`${API_BASE}/api/notes/${targetId}`, {
        method: 'PUT',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ content: note.content })
      }).catch(err => console.error('Failed to sync checklist change:', err));
    }
  }

  /* --- Filtering, Searching & Sorting --- */
  getFilteredNotes() {
    let list = this.notes.filter(note => {
      // Trash view vs Active views
      if (this.activeView === 'trash') {
        return note.isTrash;
      }
      if (note.isTrash) return false;

      // Archived view vs Active workspace
      if (this.activeView === 'archived') {
        return note.isArchived;
      }
      if (note.isArchived) return false;

      // Pinned view
      if (this.activeView === 'pinned' && !note.isPinned) {
        return false;
      }

      // Category filter (case-insensitive)
      if (this.activeCategory && this.activeCategory !== 'all') {
        const cat = (note.category || 'general').toLowerCase();
        if (cat !== this.activeCategory.toLowerCase()) {
          return false;
        }
      }

      // Tag filter
      if (this.activeTag && (!Array.isArray(note.tags) || !note.tags.includes(this.activeTag))) {
        return false;
      }

      // Day filter (e.g. Monday, Tuesday...)
      if (this.activeDay) {
        const DAYS_ORDER = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        let targetDay = note.noteDay;
        if (!targetDay || targetDay === 'auto') {
          const d = new Date(note.createdAt || note.updatedAt);
          if (!isNaN(d.getTime())) {
            targetDay = DAYS_ORDER[d.getDay()];
          }
        }
        if (targetDay !== this.activeDay) return false;
      }

      // Search query
      if (this.searchQuery && this.searchQuery.trim()) {
        const q = this.searchQuery.toLowerCase();
        const matchTitle = (note.title || '').toLowerCase().includes(q);
        const matchContent = (note.content || '').toLowerCase().includes(q);
        const matchTags = Array.isArray(note.tags) && note.tags.some(t => String(t).toLowerCase().includes(q));
        const matchCat = (note.category || '').toLowerCase().includes(q);
        return matchTitle || matchContent || matchTags || matchCat;
      }

      return true;
    });

    // Sorting
    list.sort((a, b) => {
      if (this.sortBy === 'updated') {
        return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
      } else if (this.sortBy === 'created') {
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      } else if (this.sortBy === 'title') {
        return (a.title || '').localeCompare(b.title || '');
      } else if (this.sortBy === 'priority') {
        const prioMap = { high: 3, medium: 2, low: 1 };
        return (prioMap[(b.priority || '').toLowerCase()] || 2) - (prioMap[(a.priority || '').toLowerCase()] || 2);
      }
      return 0;
    });

    return list;
  }

  /* --- Daily Notes Tracker Helpers & Actions --- */
  getDateForDayOfWeek(dayName) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const targetIndex = days.indexOf(dayName);
    if (targetIndex === -1) return new Date();

    const now = new Date();
    const currentJsDay = now.getDay();
    const distanceToMonday = (currentJsDay === 0 ? -6 : 1 - currentJsDay);
    const mondayDate = new Date(now);
    mondayDate.setDate(now.getDate() + distanceToMonday);

    const targetDayOffset = (targetIndex === 0 ? 6 : targetIndex - 1);
    const resultDate = new Date(mondayDate);
    resultDate.setDate(mondayDate.getDate() + targetDayOffset);
    return resultDate;
  }

  getNotesForDay(dayName, timeframe = this.dailyTimeframe) {
    const DAYS_ORDER = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return this.notes.filter(n => {
      if (n.isTrash) return false;

      let targetDay = n.noteDay;
      if (!targetDay || targetDay === 'auto') {
        const d = new Date(n.createdAt || n.updatedAt);
        if (!isNaN(d.getTime())) {
          targetDay = DAYS_ORDER[d.getDay()];
        }
      }
      if (targetDay !== dayName) return false;

      if (timeframe === 'thisWeek') {
        const date = new Date(n.createdAt || n.updatedAt);
        if (!isNaN(date.getTime())) {
          const now = new Date();
          const currentJsDay = now.getDay();
          const distanceToMonday = (currentJsDay === 0 ? -6 : 1 - currentJsDay);
          const startOfWeek = new Date(now);
          startOfWeek.setDate(now.getDate() + distanceToMonday);
          startOfWeek.setHours(0, 0, 0, 0);

          const endOfWeek = new Date(startOfWeek);
          endOfWeek.setDate(startOfWeek.getDate() + 6);
          endOfWeek.setHours(23, 59, 59, 999);

          return date >= startOfWeek && date <= endOfWeek;
        }
      }
      return true;
    });
  }

  renderDailyNotesCard() {
    const container = document.getElementById('daily-notes-widget-container');
    if (!container) return;

    const daysList = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const DAYS_ORDER = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const todayJs = new Date().getDay();
    const todayName = DAYS_ORDER[todayJs];

    let totalWeeklyCount = 0;
    daysList.forEach(d => {
      totalWeeklyCount += this.getNotesForDay(d, this.dailyTimeframe).length;
    });

    let rowsHtml = '';
    daysList.forEach(day => {
      const dayNotes = this.getNotesForDay(day, this.dailyTimeframe);
      const count = dayNotes.length;
      const isToday = (day === todayName);
      const isActiveFilter = (this.activeDay === day);

      let squaresHtml = '';
      if (count > 0) {
        squaresHtml = dayNotes.map(n => {
          const noteId = n._id || n.id;
          const title = this._escapeHtml(n.title || 'Untitled');
          const cat = (n.category || 'general').toUpperCase();
          const timeStr = n.createdAt ? new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
          const tooltip = `${title} [${cat}] ${timeStr}`;
          return `<span class="daily-note-square" title="${tooltip}" onclick="app.openEditorModal('${noteId}')">■</span>`;
        }).join('');
      } else {
        squaresHtml = `<span class="daily-no-notes-text">No notes</span>`;
      }

      rowsHtml += `
        <div class="daily-day-row ${isToday ? 'is-today' : ''} ${isActiveFilter ? 'is-active-filter' : ''}">
          <div class="daily-day-left" onclick="app.setDayFilter('${day}')" title="Click to filter notes recorded on ${day}">
            <span class="daily-day-name">${day}</span>
            ${isToday ? '<span class="today-badge">TODAY</span>' : ''}
          </div>
          <div class="daily-day-squares">
            ${squaresHtml}
          </div>
          <div class="daily-day-right">
            <span class="daily-day-count-badge">${count} ${count === 1 ? 'note' : 'notes'}</span>
            <button class="btn-add-day-note" onclick="app.openEditorForDay('${day}')" title="Add note for ${day}">
              <i data-lucide="plus" style="width: 12px; height: 12px;"></i> Add
            </button>
          </div>
        </div>
      `;
    });

    const cardHtml = `
      <div class="daily-notes-card">
        <div class="daily-notes-card-header">
          <div class="daily-notes-card-title">
            <i data-lucide="calendar" style="width: 20px; height: 20px;"></i>
            <span>📅 Daily Notes</span>
            <span class="daily-notes-badge-count">${totalWeeklyCount} ${totalWeeklyCount === 1 ? 'note' : 'notes'}</span>
          </div>
          <div class="daily-notes-card-controls">
            <select class="form-select" style="padding: 4px 8px; font-size: 0.8rem; width: auto;" onchange="app.setDailyTimeframe(this.value)">
              <option value="thisWeek" ${this.dailyTimeframe === 'thisWeek' ? 'selected' : ''}>This Week</option>
              <option value="allTime" ${this.dailyTimeframe === 'allTime' ? 'selected' : ''}>All Time</option>
            </select>
            <button class="btn-secondary" style="padding: 4px 10px; font-size: 0.8rem; display: flex; align-items: center; gap: 4px;" onclick="app.toggleDailyCardCollapse()">
              <i data-lucide="${this.dailyCardCollapsed ? 'chevron-down' : 'chevron-up'}" style="width: 14px; height: 14px;"></i>
              <span>${this.dailyCardCollapsed ? 'Expand' : 'Collapse'}</span>
            </button>
          </div>
        </div>

        ${!this.dailyCardCollapsed ? `
          <div class="daily-notes-card-body">
            ${rowsHtml}
          </div>
        ` : ''}
      </div>
    `;

    container.innerHTML = cardHtml;
  }

  renderSidebarDailyWidget() {
    const container = document.getElementById('sidebar-daily-notes-container');
    const badgeEl = document.getElementById('sidebar-daily-total-badge');
    if (!container) return;

    const daysList = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const DAYS_ORDER = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const todayJs = new Date().getDay();
    const todayName = DAYS_ORDER[todayJs];

    let totalCount = 0;
    daysList.forEach(d => {
      totalCount += this.getNotesForDay(d, 'thisWeek').length;
    });

    if (badgeEl) {
      badgeEl.textContent = `${totalCount}`;
    }

    let rowsHtml = '';
    daysList.forEach(day => {
      const dayNotes = this.getNotesForDay(day, 'thisWeek');
      const count = dayNotes.length;
      const isToday = (day === todayName);
      const isActiveFilter = (this.activeDay === day);

      let squaresHtml = '';
      if (count > 0) {
        squaresHtml = dayNotes.map(n => {
          const noteId = n._id || n.id;
          const title = this._escapeHtml(n.title || 'Untitled Note');
          const cat = (n.category || 'general').toUpperCase();
          const timeStr = n.createdAt ? new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
          const tooltip = `${title} [${cat}] ${timeStr}`;
          return `<span class="sidebar-note-square" title="${tooltip}" onclick="event.stopPropagation(); app.openEditorModal('${noteId}')">■</span>`;
        }).join('');
      }

      rowsHtml += `
        <div class="sidebar-day-row ${isToday ? 'is-today' : ''} ${isActiveFilter ? 'is-active-filter' : ''}">
          <div class="sidebar-day-left" onclick="app.setDayFilter('${day}')" title="Filter notes for ${day}">
            <span class="sidebar-day-name">${day}</span>
            ${isToday ? '<span class="sidebar-today-pill">TODAY</span>' : ''}
          </div>
          
          <div class="sidebar-day-squares">
            ${squaresHtml}
          </div>

          <button class="sidebar-btn-add-day" onclick="app.openEditorForDay('${day}')" title="Add note for ${day}">
            +
          </button>
        </div>
      `;
    });

    container.innerHTML = rowsHtml;
  }

  setDayFilter(dayName) {
    if (this.activeDay === dayName) {
      this.activeDay = null; // Toggle off
    } else {
      this.activeDay = dayName;
    }
    this.render();
  }

  setDailyTimeframe(tf) {
    this.dailyTimeframe = tf;
    this.render();
  }

  toggleDailyCardCollapse() {
    this.dailyCardCollapsed = !this.dailyCardCollapsed;
    this.render();
  }

  openEditorForDay(dayName) {
    this.targetDayForNewNote = dayName;
    this.openEditorModal();
  }

  /* --- Rendering UI --- */
  render() {
    this.renderDailyNotesCard();
    this.renderSidebarDailyWidget();
    this.renderNotesList();
    this.updateCategoryBadges();
    this.renderTagCloud();
    this.updateHeadingTitle();
    if (window.lucide) lucide.createIcons();
  }

  updateHeadingTitle() {
    const headingEl = document.getElementById('current-view-heading');
    const badgeEl = document.getElementById('current-view-count');
    const filtered = this.getFilteredNotes();

    let title = 'All Notes';
    let icon = 'layers';

    if (this.activeView === 'pinned') {
      title = 'Pinned Notes';
      icon = 'pin';
    } else if (this.activeView === 'archived') {
      title = 'Archived Notes';
      icon = 'archive';
    } else if (this.activeView === 'trash') {
      title = 'Trash';
      icon = 'trash-2';
    } else if (this.activeView === 'daily') {
      title = '📅 Daily Notes Dashboard';
      icon = 'calendar';
    } else if (this.activeCategory !== 'all') {
      const catNames = { general: 'General Notes', study: 'Study Notes', personal: 'Personal Notes', job: 'Job & Career' };
      title = catNames[this.activeCategory] || `${this.activeCategory.toUpperCase()} Notes`;
      icon = 'folder';
    }

    if (this.activeDay) {
      title = `📅 Daily Notes: ${this.activeDay}`;
      icon = 'calendar';
    }

    if (this.activeTag) {
      title = `Tag: #${this.activeTag}`;
      icon = 'hash';
    }

    if (this.searchQuery) {
      title = `Search: "${this.searchQuery}"`;
      icon = 'search';
    }

    if (headingEl) {
      headingEl.innerHTML = `<i data-lucide="${icon}"></i> ${title}`;
    }
    if (badgeEl) {
      badgeEl.textContent = `${filtered.length} ${filtered.length === 1 ? 'note' : 'notes'}`;
    }
  }

  renderNotesList() {
    const container = document.getElementById('notes-scroll-container');
    if (!container) return;

    const filtered = this.getFilteredNotes();

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">
            <i data-lucide="file-question" style="width:32px; height:32px;"></i>
          </div>
          <h3 class="empty-state-title">No notes found</h3>
          <p class="empty-state-desc">
            ${this.searchQuery ? `No results matching "${this.searchQuery}". Try a different keyword.` : 'Create your first note or use AI to generate structured ideas instantly!'}
          </p>
          <div style="display:flex; gap:10px;">
            <button class="btn-primary" onclick="app.openEditorModal()">
              <i data-lucide="plus"></i> Create Note
            </button>
            <button class="btn-primary btn-ai" onclick="app.openAIModal()">
              <i data-lucide="sparkles"></i> AI Generator
            </button>
          </div>
        </div>
      `;
      return;
    }

    // Split pinned vs others if viewing main notes
    const showPinnedSeparate = this.activeView === 'all' && !this.searchQuery && !this.activeTag;
    const pinnedNotes = filtered.filter(n => n.isPinned);
    const regularNotes = showPinnedSeparate ? filtered.filter(n => !n.isPinned) : filtered;

    let html = '';

    if (showPinnedSeparate && pinnedNotes.length > 0) {
      html += `
        <div class="notes-section">
          <div class="section-label">
            <i data-lucide="pin" style="width:14px; height:14px;"></i> PINNED (${pinnedNotes.length})
          </div>
          <div class="notes-grid ${this.viewMode === 'list' ? 'list-view' : ''}">
            ${pinnedNotes.map(n => this._renderNoteCard(n)).join('')}
          </div>
        </div>
      `;
    }

    if (regularNotes.length > 0 || !showPinnedSeparate) {
      html += `
        <div class="notes-section">
          ${showPinnedSeparate && pinnedNotes.length > 0 ? `
            <div class="section-label">
              <i data-lucide="file-text" style="width:14px; height:14px;"></i> OTHER NOTES (${regularNotes.length})
            </div>
          ` : ''}
          <div class="notes-grid ${this.viewMode === 'list' ? 'list-view' : ''}">
            ${(showPinnedSeparate ? regularNotes : filtered).map(n => this._renderNoteCard(n)).join('')}
          </div>
        </div>
      `;
    }

    container.innerHTML = html;
  }

  _renderNoteCard(note) {
    const isTrash = Boolean(note.isTrash);
    const isArchived = Boolean(note.isArchived);
    const catLower = (note.category || 'general').toLowerCase();
    const formattedDate = this._formatRelativeDate(note.updatedAt);
    const categoryClass = `badge-${catLower}`;
    const tags = Array.isArray(note.tags) ? note.tags : [];
    
    // Parse content preview
    const { previewHtml, checklistHtml } = this._formatNotePreview(note);

    let attachmentsHtml = '';
    if (Array.isArray(note.attachments) && note.attachments.length > 0) {
      attachmentsHtml = `<div class="note-attachments-grid">`;
      for (const att of note.attachments) {
        if (att.fileType === 'image' || (att.fileUrl && att.fileUrl.startsWith('data:image'))) {
          attachmentsHtml += `
            <div class="attachment-item-img">
              <img src="${att.fileUrl}" alt="${this._escapeHtml(att.fileName || 'Attachment')}" loading="lazy">
            </div>
          `;
        } else {
          attachmentsHtml += `
            <a class="attachment-item-doc" href="${att.fileUrl}" download="${this._escapeHtml(att.fileName || 'document')}" onclick="event.stopPropagation()">
              <i data-lucide="file-text" style="width:14px; height:14px;"></i>
              <span>${this._escapeHtml(att.fileName || 'Document')}</span>
            </a>
          `;
        }
      }
      attachmentsHtml += `</div>`;
    }
    let reminderHtml = '';
    if (note.reminderDate) {
      const remDate = new Date(note.reminderDate);
      if (!isNaN(remDate.getTime())) {
        const now = new Date();
        const isOverdue = remDate < now;
        const remFormatted = remDate.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        reminderHtml = `
          <div class="card-reminder-badge ${isOverdue ? 'reminder-overdue' : 'reminder-active'}">
            <i data-lucide="clock" style="width:12px; height:12px;"></i>
            <span>${isOverdue ? 'Overdue: ' : 'Reminder: '}${remFormatted}</span>
          </div>
        `;
      }
    }

    const noteId = note._id || note.id;

    return `
      <div class="note-card ${note.isPinned ? 'is-pinned' : ''}" data-cat="${catLower}" onclick="app.openEditorModal('${noteId}')">
        <div class="card-header">
          <h4 class="card-title">${this._escapeHtml(note.title || 'Untitled')}</h4>
          ${!isTrash ? `
            <button class="card-pin-btn ${note.isPinned ? 'active' : ''}" title="${note.isPinned ? 'Unpin note' : 'Pin note to top'}" onclick="app.togglePin('${noteId}', event)">
              <i data-lucide="pin" style="width:16px; height:16px;"></i>
            </button>
          ` : ''}
        </div>

        <div class="card-body">
          ${previewHtml}
          ${checklistHtml}
          ${attachmentsHtml}
          ${reminderHtml}
        </div>

        ${tags.length > 0 ? `
          <div class="card-tags">
            ${tags.map(tag => `<span class="card-tag" onclick="app.setTagFilter('${this._escapeHtml(tag)}', event)">#${this._escapeHtml(tag)}</span>`).join('')}
          </div>
        ` : ''}

        <div class="card-footer">
          <span class="card-category-badge ${categoryClass}">
            <span class="cat-dot ${catLower}"></span>
            ${catLower.toUpperCase()}
          </span>

          <div class="card-meta-right">
            <span class="card-date">${formattedDate}</span>
            <div class="card-actions-menu">
              ${isTrash ? `
                <button class="card-action-btn restore" title="Restore Note" onclick="app.restoreFromTrash('${noteId}', event)">
                  <i data-lucide="rotate-ccw" style="width:15px; height:15px;"></i>
                </button>
                <button class="card-action-btn delete" title="Delete Permanently" onclick="app.permanentDelete('${noteId}', event)">
                  <i data-lucide="trash-2" style="width:15px; height:15px;"></i>
                </button>
              ` : `
                <button class="card-action-btn ai" title="AI Suite (Summarize, Polish, Flashcards)" onclick="app.openNoteAIDrawer('${noteId}', event)">
                  <i data-lucide="sparkles" style="width:15px; height:15px;"></i>
                </button>
                <button class="card-action-btn archive" title="${isArchived ? 'Unarchive Note' : 'Archive Note'}" onclick="app.toggleArchive('${noteId}', event)">
                  <i data-lucide="${isArchived ? 'archive-restore' : 'archive'}" style="width:15px; height:15px;"></i>
                </button>
                <button class="card-action-btn copy" title="Duplicate Note" onclick="app.duplicateNote('${noteId}', event)">
                  <i data-lucide="copy" style="width:15px; height:15px;"></i>
                </button>
                <button class="card-action-btn delete" title="Move to Trash" onclick="app.moveToTrash('${noteId}', event)">
                  <i data-lucide="trash-2" style="width:15px; height:15px;"></i>
                </button>
              `}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  _formatNotePreview(note) {
    const lines = note.content.split('\n');
    const textLines = [];
    const checklistItems = [];

    let checklistCounter = 0;
    for (const line of lines) {
      if (/^[-*]\s*\[([ x])\]\s*(.+)/.test(line)) {
        const match = line.match(/^[-*]\s*\[([ x])\]\s*(.+)/);
        const isDone = match[1] === 'x';
        const itemText = match[2];
        if (checklistItems.length < 3) {
          const idx = checklistCounter;
          checklistItems.push(`
            <div class="checklist-item-preview ${isDone ? 'done' : ''}" onclick="app.toggleChecklistItem('${note.id}', ${idx}, event)">
              <i data-lucide="${isDone ? 'check-square' : 'square'}" style="width:14px; height:14px; color:${isDone ? 'var(--cat-study)' : 'var(--text-muted)'};"></i>
              <span>${this._escapeHtml(itemText)}</span>
            </div>
          `);
        }
        checklistCounter++;
      } else if (line.trim().length > 0 && textLines.length < 3) {
        textLines.push(line.replace(/^[#\-*`>]\s*/, ''));
      }
    }

    const previewHtml = textLines.length > 0 ? `<p>${this._escapeHtml(textLines.join(' '))}</p>` : '';
    const checklistHtml = checklistItems.length > 0 ? `<div class="checklist-preview">${checklistItems.join('')}</div>` : '';

    return { previewHtml, checklistHtml };
  }

  updateCategoryBadges() {
    const counts = {
      all: this.notes.filter(n => !n.isTrash && !n.isArchived).length,
      daily: this.notes.filter(n => !n.isTrash && !n.isArchived).length,
      general: this.notes.filter(n => !n.isTrash && !n.isArchived && (n.category || '').toLowerCase() === 'general').length,
      study: this.notes.filter(n => !n.isTrash && !n.isArchived && (n.category || '').toLowerCase() === 'study').length,
      personal: this.notes.filter(n => !n.isTrash && !n.isArchived && (n.category || '').toLowerCase() === 'personal').length,
      job: this.notes.filter(n => !n.isTrash && !n.isArchived && (n.category || '').toLowerCase() === 'job').length,
      pinned: this.notes.filter(n => !n.isTrash && !n.isArchived && n.isPinned).length,
      archived: this.notes.filter(n => !n.isTrash && n.isArchived).length,
      trash: this.notes.filter(n => n.isTrash).length
    };

    for (const [key, count] of Object.entries(counts)) {
      const el = document.getElementById(`badge-count-${key}`);
      if (el) el.textContent = count;
    }
  }

  renderTagCloud() {
    const container = document.getElementById('sidebar-tag-cloud');
    if (!container) return;

    const allTags = new Set();
    this.notes.filter(n => !n.isTrash).forEach(n => n.tags.forEach(t => allTags.add(t)));

    if (allTags.size === 0) {
      container.innerHTML = '<span style="font-size:0.75rem; color:var(--text-muted); padding:0 8px;">No tags yet</span>';
      return;
    }

    container.innerHTML = Array.from(allTags).map(tag => `
      <span class="tag-pill ${this.activeTag === tag ? 'active' : ''}" onclick="app.setTagFilter('${this._escapeHtml(tag)}')">
        #${this._escapeHtml(tag)}
      </span>
    `).join('');
  }

  /* --- Nav & Filter Actions --- */
  setCategory(category) {
    this.activeCategory = category;
    this.activeView = 'all';
    this.activeTag = null;
    this.activeDay = null;
    this._updateNavHighlight();
    this.render();
  }

  setView(view) {
    this.activeView = view;
    this.activeCategory = 'all';
    this.activeTag = null;
    if (view !== 'daily') this.activeDay = null;
    this._updateNavHighlight();
    this.render();
  }

  setTagFilter(tag, event) {
    if (event) event.stopPropagation();
    if (this.activeTag === tag) {
      this.activeTag = null; // Toggle off
    } else {
      this.activeTag = tag;
    }
    this.render();
  }

  setSearchQuery(q) {
    this.searchQuery = q;
    this.render();
  }

  setSortBy(sort) {
    this.sortBy = sort;
    this.render();
  }

  setViewMode(mode) {
    this.viewMode = mode;
    document.querySelectorAll('.view-mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    this.render();
  }

  _updateNavHighlight() {
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.remove('active');
    });

    if (this.activeView !== 'all') {
      const activeEl = document.getElementById(`nav-${this.activeView}`);
      if (activeEl) activeEl.classList.add('active');
    } else {
      const activeEl = document.getElementById(`nav-cat-${this.activeCategory}`);
      if (activeEl) activeEl.classList.add('active');
    }
  }

  /* --- Note Editor Modal --- */
  openEditorModal(id = null) {
    this.currentEditingId = id;
    const modal = document.getElementById('editor-modal');
    const titleInput = document.getElementById('editor-title-input');
    const contentInput = document.getElementById('editor-content-input');
    const categorySelect = document.getElementById('editor-category-select');
    const prioritySelect = document.getElementById('editor-priority-select');
    const tagsInput = document.getElementById('editor-tags-input');
    const pinCheck = document.getElementById('editor-pin-checkbox');
    const modalTitle = document.getElementById('editor-modal-title');

    const reminderInput = document.getElementById('editor-reminder-input');
    const daySelect = document.getElementById('editor-day-select');

    if (id) {
      const note = this.notes.find(n => n.id === id || n._id === id);
      if (!note) return;
      modalTitle.textContent = 'Edit Note';
      titleInput.value = note.title;
      contentInput.value = note.content;
      categorySelect.value = note.category;
      prioritySelect.value = note.priority;
      tagsInput.value = note.tags ? note.tags.join(', ') : '';
      pinCheck.checked = note.isPinned;
      if (daySelect) daySelect.value = note.noteDay || 'auto';
      if (reminderInput) {
        reminderInput.value = note.reminderDate ? new Date(note.reminderDate).toISOString().slice(0, 16) : '';
      }
      this.currentAttachments = Array.isArray(note.attachments) ? [...note.attachments] : [];
    } else {
      modalTitle.textContent = 'Create New Note';
      titleInput.value = '';
      contentInput.value = '';
      categorySelect.value = this.activeCategory !== 'all' ? this.activeCategory : 'general';
      prioritySelect.value = 'medium';
      tagsInput.value = '';
      pinCheck.checked = false;
      if (daySelect) daySelect.value = this.targetDayForNewNote || 'auto';
      if (reminderInput) reminderInput.value = '';
      this.currentAttachments = [];
    }

    this.renderEditorAttachments();
    modal.classList.add('active');
    setTimeout(() => titleInput.focus(), 100);
  }

  closeEditorModal() {
    const modal = document.getElementById('editor-modal');
    modal.classList.remove('active');
    this.currentEditingId = null;
    this.targetDayForNewNote = null;
    this.currentAttachments = [];
  }

  saveEditorModal() {
    const title = document.getElementById('editor-title-input').value;
    const content = document.getElementById('editor-content-input').value;
    const category = document.getElementById('editor-category-select').value;
    const priority = document.getElementById('editor-priority-select').value;
    const tags = document.getElementById('editor-tags-input').value;
    const isPinned = document.getElementById('editor-pin-checkbox').checked;
    const reminderVal = document.getElementById('editor-reminder-input')?.value;
    const reminderDate = reminderVal ? new Date(reminderVal).toISOString() : null;
    const noteDay = document.getElementById('editor-day-select')?.value;

    if (!title.trim() && !content.trim() && (!this.currentAttachments || this.currentAttachments.length === 0)) {
      this.showToast('Please enter title/content or attach a photo/document', 'warning');
      return;
    }

    if (this.currentEditingId) {
      this.updateNote(this.currentEditingId, {
        title: title || 'Untitled Note',
        content,
        category,
        priority,
        tags,
        isPinned,
        attachments: this.currentAttachments,
        reminderDate: reminderDate,
        noteDay: noteDay
      });
    } else {
      this.createNote({
        title,
        content,
        category,
        priority,
        tags,
        isPinned,
        attachments: this.currentAttachments,
        reminderDate: reminderDate,
        noteDay: noteDay
      });
    }

    this.closeEditorModal();
  }

  handleHeaderPhotoUpload(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    this.openEditorModal();
    this.handleFileUpload(event);
    this.showToast('Photo/Document attached! Enter title and click Save.', 'info');
  }

  handleFileUpload(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    if (!Array.isArray(this.currentAttachments)) {
      this.currentAttachments = [];
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > 5 * 1024 * 1024) {
        this.showToast(`File ${file.name} is too large (max 5MB)`, 'warning');
        continue;
      }

      const isImage = file.type.startsWith('image/');
      const reader = new FileReader();
      reader.onload = (e) => {
        const fileUrl = e.target.result;
        this.currentAttachments.push({
          fileName: file.name,
          fileType: isImage ? 'image' : 'document',
          fileUrl: fileUrl,
          fileSize: file.size
        });
        this.renderEditorAttachments();
      };
      reader.readAsDataURL(file);
    }
    event.target.value = '';
  }

  renderEditorAttachments() {
    const container = document.getElementById('editor-attachments-preview');
    if (!container) return;

    if (!Array.isArray(this.currentAttachments) || this.currentAttachments.length === 0) {
      container.innerHTML = '';
      return;
    }

    let html = '';
    this.currentAttachments.forEach((att, idx) => {
      if (att.fileType === 'image' || (att.fileUrl && att.fileUrl.startsWith('data:image'))) {
        html += `
          <div class="attachment-item-img" style="width:100px; height:80px; display:inline-block; margin-right:6px;">
            <img src="${att.fileUrl}" alt="${this._escapeHtml(att.fileName)}">
            <button type="button" class="attachment-remove-btn" onclick="app.removeAttachment(${idx})">×</button>
          </div>
        `;
      } else {
        html += `
          <div class="attachment-item-doc">
            <i data-lucide="file-text" style="width:14px; height:14px;"></i>
            <span>${this._escapeHtml(att.fileName)}</span>
            <button type="button" class="attachment-remove-btn" style="position:static; margin-left:4px;" onclick="app.removeAttachment(${idx})">×</button>
          </div>
        `;
      }
    });

    container.innerHTML = html;
    if (window.lucide) lucide.createIcons();
  }

  removeAttachment(index) {
    if (Array.isArray(this.currentAttachments)) {
      this.currentAttachments.splice(index, 1);
      this.renderEditorAttachments();
    }
  }

  insertMarkdown(syntax) {
    const textarea = document.getElementById('editor-content-input');
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.substring(start, end);

    let replacement = '';
    switch (syntax) {
      case 'bold': replacement = `**${selected || 'bold text'}**`; break;
      case 'italic': replacement = `*${selected || 'italic text'}*`; break;
      case 'heading': replacement = `\n### ${selected || 'Heading'}\n`; break;
      case 'checklist': replacement = `\n- [ ] ${selected || 'Task item'}\n`; break;
      case 'bullet': replacement = `\n- ${selected || 'List item'}\n`; break;
      case 'code': replacement = `\`${selected || 'code'}\``; break;
      case 'quote': replacement = `\n> ${selected || 'Quote'}\n`; break;
    }

    textarea.setRangeText(replacement, start, end, 'end');
    textarea.focus();
  }

  /* --- AI Generator & Assistant Modal --- */
  openAIModal() {
    const modal = document.getElementById('ai-modal');
    const promptInput = document.getElementById('ai-prompt-input');
    const responseBox = document.getElementById('ai-result-box');
    const actionBtns = document.getElementById('ai-action-buttons');

    if (promptInput) promptInput.value = '';
    if (responseBox) {
      responseBox.innerHTML = '<span style="color:var(--text-muted);">Choose a template below or type any topic/task, and AI will construct a structured note draft...</span>';
    }
    if (actionBtns) actionBtns.style.display = 'none';

    modal.classList.add('active');
    if (promptInput) setTimeout(() => promptInput.focus(), 100);
  }

  closeAIModal() {
    document.getElementById('ai-modal').classList.remove('active');
  }

  async runAIGenerator(customPrompt = null) {
    const promptInput = document.getElementById('ai-prompt-input');
    const prompt = customPrompt || (promptInput ? promptInput.value : '');
    const categorySelect = document.getElementById('ai-category-select');
    const category = categorySelect ? categorySelect.value : 'general';
    const responseBox = document.getElementById('ai-result-box');
    const actionBtns = document.getElementById('ai-action-buttons');

    if (!prompt.trim()) {
      this.showToast('Please enter a prompt or topic', 'warning');
      return;
    }

    if (promptInput) promptInput.value = prompt;
    responseBox.classList.add('loading');
    responseBox.innerHTML = '';

    try {
      const generated = await window.aiService.generateNoteDraft(prompt, category);
      responseBox.classList.remove('loading');
      
      this._lastGeneratedNote = generated;

      responseBox.innerHTML = `
        <h4 style="color:var(--accent-primary); margin-bottom:8px;">${this._escapeHtml(generated.title)}</h4>
        <pre style="white-space:pre-wrap; font-size:0.88rem; color:var(--text-secondary);">${this._escapeHtml(generated.content)}</pre>
        <div style="margin-top:10px; display:flex; gap:6px;">
          ${generated.tags.map(t => `<span class="card-tag">#${t}</span>`).join('')}
        </div>
      `;

      if (actionBtns) actionBtns.style.display = 'flex';
      this.showToast('AI draft generated!', 'ai');
    } catch (err) {
      responseBox.classList.remove('loading');
      responseBox.innerHTML = `<span style="color:var(--prio-high);">Error generating note: ${err.message}</span>`;
    }
  }

  applyGeneratedNote() {
    if (!this._lastGeneratedNote) return;
    this.createNote(this._lastGeneratedNote);
    this.closeAIModal();
  }

  /* --- Note AI Suite Drawer (Summarize, Action Items, Tone, Flashcards) --- */
  openNoteAIDrawer(id, event) {
    if (event) event.stopPropagation();
    const note = this.notes.find(n => n.id === id);
    if (!note) return;

    this._activeAINote = note;
    const modal = document.getElementById('note-ai-suite-modal');
    const noteTitleEl = document.getElementById('ai-suite-note-title');
    const outputBox = document.getElementById('ai-suite-output');

    if (noteTitleEl) noteTitleEl.textContent = note.title;
    if (outputBox) {
      outputBox.innerHTML = '<p style="color:var(--text-muted);">Select an AI action below to analyze or transform this note.</p>';
    }

    modal.classList.add('active');
  }

  closeNoteAIDrawer() {
    document.getElementById('note-ai-suite-modal').classList.remove('active');
  }

  async runNoteAISummary() {
    if (!this._activeAINote) return;
    const outputBox = document.getElementById('ai-suite-output');
    outputBox.classList.add('loading');
    outputBox.innerHTML = '';

    const summary = await window.aiService.summarizeNote(this._activeAINote.title, this._activeAINote.content);
    outputBox.classList.remove('loading');
    outputBox.innerHTML = `<div style="white-space:pre-wrap;">${this._escapeHtml(summary)}</div>`;
    this.showToast('Summary created', 'ai');
  }

  async runNoteActionItems() {
    if (!this._activeAINote) return;
    const outputBox = document.getElementById('ai-suite-output');
    outputBox.classList.add('loading');
    outputBox.innerHTML = '';

    const items = await window.aiService.extractActionItems(this._activeAINote.content);
    outputBox.classList.remove('loading');

    outputBox.innerHTML = `
      <h4 style="margin-bottom:8px; color:var(--cat-study);">⚡ Extracted Action Items</h4>
      <div style="display:flex; flex-direction:column; gap:6px;">
        ${items.map(item => `
          <div style="display:flex; align-items:center; gap:8px; font-size:0.88rem;">
            <i data-lucide="check-circle" style="width:16px; height:16px; color:var(--cat-study);"></i>
            <span>${this._escapeHtml(item)}</span>
          </div>
        `).join('')}
      </div>
      <button class="btn-secondary" style="margin-top:14px;" onclick="app.appendActionItemsToNote()">
        <i data-lucide="plus"></i> Append to Note
      </button>
    `;
    this._lastExtractedItems = items;
    if (window.lucide) lucide.createIcons();
    this.showToast('Action items extracted', 'ai');
  }

  appendActionItemsToNote() {
    if (!this._activeAINote || !this._lastExtractedItems) return;
    const checklistStr = '\n\n### AI Action Items\n' + this._lastExtractedItems.map(i => `- [ ] ${i}`).join('\n');
    this.updateNote(this._activeAINote.id, {
      content: this._activeAINote.content + checklistStr
    });
    this.closeNoteAIDrawer();
  }

  async runNoteToneRewrite(tone) {
    if (!this._activeAINote) return;
    const outputBox = document.getElementById('ai-suite-output');
    outputBox.classList.add('loading');
    outputBox.innerHTML = '';

    const rewritten = await window.aiService.rewriteTone(this._activeAINote.content, tone);
    outputBox.classList.remove('loading');
    outputBox.innerHTML = `
      <div style="white-space:pre-wrap;">${this._escapeHtml(rewritten)}</div>
      <button class="btn-primary" style="margin-top:14px;" onclick="app.replaceNoteContentWithAI('${this._escapeHtml(rewritten)}')">
        <i data-lucide="check"></i> Replace Note Content
      </button>
    `;
    if (window.lucide) lucide.createIcons();
    this.showToast(`Rewritten in ${tone} tone`, 'ai');
  }

  replaceNoteContentWithAI(newContent) {
    if (!this._activeAINote) return;
    this.updateNote(this._activeAINote.id, { content: newContent });
    this.closeNoteAIDrawer();
  }

  /* --- Interactive Flashcards Revision Deck --- */
  async openFlashcardsStudyMode() {
    if (!this._activeAINote) return;
    this.closeNoteAIDrawer();

    const modal = document.getElementById('flashcard-modal');
    modal.classList.add('active');

    this.currentFlashcards = await window.aiService.generateFlashcards(this._activeAINote.title, this._activeAINote.content);
    this.currentCardIndex = 0;
    this.isCardFlipped = false;
    this.renderFlashcard();
  }

  closeFlashcardsModal() {
    document.getElementById('flashcard-modal').classList.remove('active');
  }

  toggleFlipCard() {
    this.isCardFlipped = !this.isCardFlipped;
    const wrapper = document.getElementById('flashcard-wrapper');
    if (wrapper) {
      wrapper.classList.toggle('flipped', this.isCardFlipped);
    }
  }

  nextFlashcard() {
    if (this.currentCardIndex < this.currentFlashcards.length - 1) {
      this.currentCardIndex++;
      this.isCardFlipped = false;
      this.renderFlashcard();
    }
  }

  prevFlashcard() {
    if (this.currentCardIndex > 0) {
      this.currentCardIndex--;
      this.isCardFlipped = false;
      this.renderFlashcard();
    }
  }

  renderFlashcard() {
    const card = this.currentFlashcards[this.currentCardIndex];
    const wrapper = document.getElementById('flashcard-wrapper');
    const frontEl = document.getElementById('flashcard-front-text');
    const backEl = document.getElementById('flashcard-back-text');
    const counterEl = document.getElementById('flashcard-counter');

    if (wrapper) wrapper.classList.remove('flipped');
    if (frontEl && card) frontEl.textContent = card.question;
    if (backEl && card) backEl.textContent = card.answer;
    if (counterEl) counterEl.textContent = `Card ${this.currentCardIndex + 1} of ${this.currentFlashcards.length}`;
  }

  /* --- Toast Notifications --- */
  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let icon = 'info';
    if (type === 'success') icon = 'check-circle';
    if (type === 'ai') icon = 'sparkles';
    if (type === 'warning') icon = 'alert-triangle';

    toast.innerHTML = `
      <i data-lucide="${icon}" style="width:18px; height:18px;"></i>
      <span>${this._escapeHtml(message)}</span>
    `;

    container.appendChild(toast);
    if (window.lucide) lucide.createIcons();

    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  /* --- Quick Note Capture --- */
  quickCapture() {
    const input = document.getElementById('quick-note-input');
    const select = document.getElementById('quick-category-select');
    const reminderInput = document.getElementById('quick-reminder-input');
    if (!input || !input.value.trim()) return;

    const reminderDate = reminderInput && reminderInput.value ? new Date(reminderInput.value).toISOString() : null;

    this.createNote({
      title: input.value.trim(),
      content: '',
      category: select ? select.value : 'general',
      reminderDate: reminderDate
    });

    input.value = '';
    if (reminderInput) reminderInput.value = '';
  }

  /* --- Export / Backup --- */
  exportNotes() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.notes, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `nova_notes_backup_${new Date().toISOString().slice(0,10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    this.showToast('Notes exported to JSON', 'info');
  }

  /* --- Event Listeners Binding --- */
  bindEvents() {
    // Search bar input
    const searchInput = document.getElementById('global-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => this.setSearchQuery(e.target.value));
    }

    // Keyboard shortcuts (Ctrl+K / Cmd+K for search, Alt+N for new note)
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchInput?.focus();
      }
      if (e.altKey && e.key === 'n') {
        e.preventDefault();
        this.openEditorModal();
      }
    });

    // Mobile sidebar toggle
    const menuBtn = document.getElementById('mobile-menu-toggle');
    const sidebar = document.querySelector('.sidebar');
    if (menuBtn && sidebar) {
      menuBtn.addEventListener('click', () => {
        sidebar.classList.toggle('open');
      });
    }

    // Close modals on outside click
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) {
          backdrop.classList.remove('active');
        }
      });
    });
  }

  /* --- Utilities --- */
  _parseTags(tagsInput) {
    if (!tagsInput) return [];
    return tagsInput
      .split(/[,#\s]+/)
      .map(t => t.trim().replace(/^#/, ''))
      .filter(t => t.length > 0);
  }

  _formatRelativeDate(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    const now = new Date();
    const diffHours = (now - date) / (1000 * 60 * 60);

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${Math.floor(diffHours)}h ago`;
    if (diffHours < 48) return 'Yesterday';
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  _escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

// Initialize Application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new NotesApp();
});
