const API_BASE = '/api';

// State
// Initialize with local date YYYY-MM-DD
const d = new Date();
const offsetMs = d.getTimezoneOffset() * 60 * 1000;
const localIso = new Date(d.getTime() - offsetMs).toISOString().split('T')[0];
let currentDate = localIso;
let currentEvents = []; // Store events locally for inline editing
let currentMeta = null; // Store metadata (title, topics)

// DOM Elements
const els = {
  title: document.getElementById('app-title'),
  dateInput: document.getElementById('current-date'),
  prevDate: document.getElementById('prev-date'),
  nextDate: document.getElementById('next-date'),
  noteInput: document.getElementById('note-input'),
  submitBtn: document.getElementById('submit-btn'),
  quickActions: document.querySelectorAll('.quick-actions button'),
  feedList: document.getElementById('feed-list'),
  feedFilter: document.getElementById('feed-filter'),
  themeToggle: document.getElementById('theme-toggle'),
  compileBtn: document.getElementById('compile-btn'),
  editModeBtn: document.getElementById('edit-mode-btn'),
  compileModal: document.getElementById('compile-modal'),
  compileTitleSuffix: document.getElementById('compile-title-suffix'),
  compileTopics: document.getElementById('compile-topics'),
  compileTopicsHelp: document.getElementById('compile-topics-help'),
  compileCancelBtn: document.getElementById('compile-cancel-btn'),
  compileConfirmBtn: document.getElementById('compile-confirm-btn'),
};

// State
let isEditMode = false;

// Init
async function init() {
  // Theme Setup
  const savedTheme = localStorage.getItem('theme') || 'dark';
  setTheme(savedTheme);

  els.dateInput.value = currentDate;
  
  // Load Config
  const cfg = await fetch(`${API_BASE}/config`).then(r => r.json());
  if (cfg.title) els.title.textContent = cfg.title;

  // Load Initial Data
  loadInbox();

  // Event Listeners
  els.submitBtn.addEventListener('click', submitNote);
  els.compileBtn.addEventListener('click', openCompileModal);
  els.editModeBtn.addEventListener('click', toggleEditMode);
  els.themeToggle.addEventListener('click', toggleTheme);
  els.dateInput.addEventListener('change', (e) => setDate(e.target.value));
  els.prevDate.addEventListener('click', () => adjustDate(-1));
  els.nextDate.addEventListener('click', () => adjustDate(1));
  els.feedFilter.addEventListener('change', () => renderFeed(currentEvents));
  
  // Feed Delegation for Inline Edit
  els.feedList.addEventListener('click', handleFeedClick);

  // Quick Actions (Prefixes)
  els.quickActions.forEach(btn => {
    btn.addEventListener('click', () => {
      const prefix = btn.dataset.prefix;
      const currentVal = els.noteInput.value;
      
      // Add newline if there is existing text and it doesn't already end with one
      if (currentVal.length > 0 && !currentVal.endsWith('\n')) {
        els.noteInput.value = currentVal + '\n' + prefix;
      } else {
        els.noteInput.value = currentVal + prefix;
      }
      
      els.noteInput.focus();
      // Move cursor to end
      els.noteInput.scrollTop = els.noteInput.scrollHeight;
    });
  });

  // Ctrl+Enter to submit
  els.noteInput.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') submitNote();
  });

  // Compile modal
  if (els.compileModal && els.compileCancelBtn && els.compileConfirmBtn) {
    els.compileCancelBtn.addEventListener('click', closeCompileModal);
    els.compileConfirmBtn.addEventListener('click', compileFromModal);

    els.compileModal.addEventListener('click', (e) => {
      if (e.target === els.compileModal) closeCompileModal();
    });

    document.addEventListener('keydown', (e) => {
      if (els.compileModal.classList.contains('hidden')) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        closeCompileModal();
      } else if (e.key === 'Enter') {
        const active = document.activeElement;
        const isTextInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
        if (!isTextInput) return;
        e.preventDefault();
        compileFromModal();
      }
    });
  }
}

function setDate(dateStr) {
  currentDate = dateStr;
  els.dateInput.value = currentDate;
  loadInbox();
}

function adjustDate(days) {
  const d = new Date(currentDate);
  d.setDate(d.getDate() + days);
  setDate(d.toISOString().split('T')[0]);
}

async function loadInbox() {
  els.feedList.innerHTML = '<p class="loading">Loading...</p>';
  try {
    const res = await fetch(`${API_BASE}/inbox?date=${currentDate}`);
    const data = await res.json();
    currentEvents = data.events || [];
    currentMeta = data.meta || null;
    renderFeed(currentEvents);
  } catch (err) {
    els.feedList.innerHTML = `<p class="error">Error loading inbox: ${err.message}</p>`;
  }
}

function renderFeed(events) {
  if (!events || events.length === 0) {
    els.feedList.innerHTML = '<p class="empty">No notes for this date.</p>';
    return;
  }

  const filter = els.feedFilter ? els.feedFilter.value : 'all';

  function formatLocalTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }

  els.feedList.innerHTML = events.map((e, index) => {
    // Filter check
    if (filter !== 'all' && e.section !== filter) return '';

    // Map standard sections to short prefixes for reconstruction
    const map = { context: 'ctx:', actions: 'act:', observations: 'obs:', openThreads: 'open:' };
    const prefix = map[e.section] || 'act:';
    
    const time = formatLocalTime(e.ts) || e.ts;
    return `
      <div class="feed-item ${e.section}" id="event-${index}" data-index="${index}" data-raw="${prefix} ${escapeHtml(e.text)}">
        <div class="meta">
          <span class="time">${time}</span>
          <div style="display:flex; align-items:center; gap:0.5rem;">
            <span class="section">${e.section}</span>
            <button class="edit-btn" data-index="${index}" title="Edit this entry">✎</button>
          </div>
        </div>
        <div class="content">${escapeHtml(e.text)}</div>
      </div>
    `;
  }).join('');
}

function handleFeedClick(e) {
  const btn = e.target.closest('button');
  if (!btn) return;

  if (btn.classList.contains('edit-btn')) {
    const index = parseInt(btn.dataset.index, 10);
    enterItemEditMode(index);
  } else if (btn.classList.contains('save-btn')) {
    const index = parseInt(btn.dataset.index, 10);
    saveItem(index);
  } else if (btn.classList.contains('cancel-btn')) {
    const index = parseInt(btn.dataset.index, 10);
    cancelItemEdit(index);
  }
}

function enterItemEditMode(index) {
  const itemEl = document.getElementById(`event-${index}`);
  if (!itemEl) return;

  const event = currentEvents[index];
  const contentEl = itemEl.querySelector('.content');
  
  // Replace content with textarea
  contentEl.innerHTML = 
    `<textarea class="inline-editor" id="editor-${index}">${event.text}</textarea>
    <div class="inline-actions">
        <button class="cancel-btn" data-index="${index}">Cancel</button>
        <button class="save-btn" data-index="${index}">💾 Save</button>
    </div>
  `;
  
  // Hide the main edit button to avoid confusion
  const editBtn = itemEl.querySelector('.edit-btn');
  if (editBtn) editBtn.style.display = 'none';

  // Focus textarea
  const textarea = contentEl.querySelector('textarea');
  textarea.focus();
}

function cancelItemEdit(index) {
  // Just re-render everything to restore state
  renderFeed(currentEvents);
}

async function saveItem(index) {
  const itemEl = document.getElementById(`event-${index}`);
  const textarea = itemEl.querySelector('textarea');
  const newText = textarea.value.trim();

  if (!newText) {
    if(!confirm("Saving empty text will remove this entry. Continue?")) return;
    // Remove item
    currentEvents.splice(index, 1);
  } else {
    // Update item
    currentEvents[index].text = newText;
  }

  try {
    // Use the PUT endpoint to update the whole list
    await fetch(`${API_BASE}/inbox`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: currentEvents, date: currentDate })
    });
    
    loadInbox(); // Reload to confirm state
  } catch (err) {
    alert('Failed to save entry: ' + err.message);
  }
}


async function toggleEditMode() {
  if (isEditMode) {
    // Cancel Edit Mode
    exitEditMode();
    return;
  }

  // Enter Edit Mode
  const items = document.querySelectorAll('.feed-item');
  if (items.length === 0) {
    alert("Nothing to edit!");
    return;
  }
  
  const confirmLoad = confirm("This will load all entries into the main editor for BULK editing. Continue?");
  if (!confirmLoad) return;

  isEditMode = true;
  els.editModeBtn.textContent = 'Cancel Edit';
  els.editModeBtn.classList.add('active');
  els.submitBtn.textContent = 'Overwrite Inbox (Ctrl+Enter)';
  els.submitBtn.classList.add('warning-btn'); 
  
  // Reconstruct text
  const rawTexts = Array.from(items).map(el => el.dataset.raw).join('\n');
  els.noteInput.value = rawTexts;
  els.noteInput.focus();
}

function exitEditMode() {
  isEditMode = false;
  els.editModeBtn.textContent = 'Edit Existing';
  els.editModeBtn.classList.remove('active');
  els.submitBtn.textContent = 'Add Note (Ctrl+Enter)';
  els.submitBtn.classList.remove('warning-btn');
  els.noteInput.value = '';
}

async function submitNote() {
  const fullText = els.noteInput.value.trim();
  if (!fullText) {
    if (isEditMode) {
        if(!confirm("Saving empty text will clear the inbox for this day. Are you sure?")) return;
    } else {
        return;
    }
  }

  // Split into separate entries based on prefixes
  const entries = parseEntries(fullText);

  try {
    els.submitBtn.disabled = true;
    els.submitBtn.textContent = 'Saving...';
    
    if (isEditMode) {
        // OVERWRITE MODE
        // Convert plain strings back to objects with section
        const eventObjects = entries.map(txt => {
            const { section, cleaned } = parseSection(txt);
            return { section, text: cleaned };
        });

        await fetch(`${API_BASE}/inbox`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ events: eventObjects, date: currentDate })
        });
        
        exitEditMode();
    } else {
        // APPEND MODE
        for (const text of entries) {
          await fetch(`${API_BASE}/inbox`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, date: currentDate })
          });
        }
    }

    els.noteInput.value = '';
    loadInbox();
  } catch (err) {
    alert('Failed to save note(s)');
    console.error(err);
  } finally {
    els.submitBtn.disabled = false;
    els.submitBtn.textContent = isEditMode ? 'Overwrite Inbox (Ctrl+Enter)' : 'Add Note (Ctrl+Enter)';
  }
}

function parseSection(text) {
    // Simple helper to extract section from text like "ctx: hello"
    const lower = text.toLowerCase();
    if (lower.startsWith('ctx:') || lower.startsWith('context:')) return { section: 'context', cleaned: text.replace(/^ctx:|context:/i, '').trim() };
    if (lower.startsWith('obs:') || lower.startsWith('observation:')) return { section: 'observations', cleaned: text.replace(/^obs:|observation:/i, '').trim() };
    if (lower.startsWith('open:') || lower.startsWith('thread:')) return { section: 'openThreads', cleaned: text.replace(/^open:|thread:/i, '').trim() };
    return { section: 'actions', cleaned: text.replace(/^act:|action:/i, '').trim() }; // Default
}


function openCompileModal() {
  if (!els.compileModal || !els.compileTitleSuffix || !els.compileTopics) {
    alert("Compile UI not available (missing modal elements).");
    return;
  }

  // Defaults or from Meta
  if (currentMeta) {
    els.compileTitleSuffix.value = currentMeta.titleSuffix || '';
    els.compileTopics.value = currentMeta.topicsCsv || 'tooling';
  } else {
    els.compileTitleSuffix.value = '';
    // Only reset topics if empty, otherwise keep previous value or default
    if (!els.compileTopics.value) els.compileTopics.value = 'tooling';
  }

  // Fetch config to show allowed topics (best effort)
  (async () => {
    try {
      const cfg = await fetch(`${API_BASE}/config`).then(r => r.json());
      if (els.compileTopicsHelp) {
        if (Array.isArray(cfg.topicsAllowed) && cfg.topicsAllowed.length) {
          els.compileTopicsHelp.textContent = `Allowed topics: ${cfg.topicsAllowed.join(", ")}`;
        } else {
          els.compileTopicsHelp.textContent = '';
        }
      }
    } catch (e) {
      if (els.compileTopicsHelp) els.compileTopicsHelp.textContent = '';
    }
  })();

  els.compileModal.classList.remove('hidden');
  els.compileTitleSuffix.focus();
}

function closeCompileModal() {
  if (!els.compileModal) return;
  els.compileModal.classList.add('hidden');
}

async function compileFromModal() {
  if (!els.compileTitleSuffix || !els.compileTopics) return;

  const defaultTitle = `Dev-Diary Entry ${currentDate}`;
  const suffix = String(els.compileTitleSuffix.value || '').trim();
  const finalTitle = suffix ? `${defaultTitle} - ${suffix}` : defaultTitle;
  const topics = String(els.compileTopics.value || '').trim() || 'tooling';

  closeCompileModal();

  try {
    els.compileBtn.disabled = true;
    els.compileBtn.textContent = 'Compiling...';

    const res = await fetch(`${API_BASE}/compile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: currentDate, title: finalTitle, topics })
    });

    const raw = await res.text();
    let data = null;
    try { data = JSON.parse(raw); } catch (e) {}

    if (!res.ok) {
      const msg = data?.message || data?.error || raw || `HTTP ${res.status}`;
      throw new Error(msg);
    }

    if (data?.success) {
      alert(`Entry compiled successfully!\nSaved to: ${data.path}`);
      return;
    }

    const msg = data?.message || 'Compile failed';
    throw new Error(msg);
  } catch (err) {
    alert('Error compiling entry: ' + err.message);
  } finally {
    els.compileBtn.disabled = false;
    els.compileBtn.textContent = 'Compile Entry';
  }
}

function parseEntries(text) {
  const lines = text.split(/\r?\n/);
  const blocks = [];
  let currentBlock = [];
  
  // Regex to detect start of a new section
  const prefixRegex = /^(ctx:|act:|obs:|open:|context:|action:|observation:|thread:|threads:)/i;

  for (const line of lines) {
    const isNewSection = prefixRegex.test(line.trim());
    
    if (isNewSection && currentBlock.length > 0) {
      // Push previous block
      blocks.push(currentBlock.join('\n').trim());
      currentBlock = [];
    }
    currentBlock.push(line);
  }
  
  // Push final block
  if (currentBlock.length > 0) {
    blocks.push(currentBlock.join('\n').trim());
  }
  
  return blocks;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  els.themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
}

function toggleTheme() {
  const current = localStorage.getItem('theme') || 'dark';
  setTheme(current === 'dark' ? 'light' : 'dark');
}

init();
