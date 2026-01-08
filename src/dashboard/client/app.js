const API_BASE = '/api';

// State
// Initialize with local date YYYY-MM-DD
const d = new Date();
const offsetMs = d.getTimezoneOffset() * 60 * 1000;
const localIso = new Date(d.getTime() - offsetMs).toISOString().split('T')[0];
let currentDate = localIso;

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
  themeToggle: document.getElementById('theme-toggle'),
  compileBtn: document.getElementById('compile-btn'),
  editModeBtn: document.getElementById('edit-mode-btn'),
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
  els.compileBtn.addEventListener('click', compileEntry);
  els.editModeBtn.addEventListener('click', toggleEditMode);
  els.themeToggle.addEventListener('click', toggleTheme);
  els.dateInput.addEventListener('change', (e) => setDate(e.target.value));
  els.prevDate.addEventListener('click', () => adjustDate(-1));
  els.nextDate.addEventListener('click', () => adjustDate(1));
  
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
    renderFeed(data.events);
  } catch (err) {
    els.feedList.innerHTML = `<p class="error">Error loading inbox: ${err.message}</p>`;
  }
}

function renderFeed(events) {
  if (!events || events.length === 0) {
    els.feedList.innerHTML = '<p class="empty">No notes for this date.</p>';
    return;
  }

  els.feedList.innerHTML = events.map(e => {
    // Map standard sections to short prefixes for reconstruction
    const map = { context: 'ctx:', actions: 'act:', observations: 'obs:', openThreads: 'open:' };
    const prefix = map[e.section] || 'act:';
    
    const time = e.ts.includes('T') ? e.ts.split('T')[1].slice(0, 5) : e.ts;
    return `
      <div class="feed-item ${e.section}" data-raw="${prefix} ${escapeHtml(e.text)}">
        <div class="meta">
          <span class="time">${time}</span>
          <span class="section">${e.section}</span>
        </div>
        <div class="content">${escapeHtml(e.text)}</div>
      </div>
    `;
  }).join('');
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
  
  const confirmLoad = confirm("This will load all entries into the editor and overwrite the current day's inbox upon saving. Continue?");
  if (!confirmLoad) return;

  isEditMode = true;
  els.editModeBtn.textContent = 'Cancel Edit';
  els.editModeBtn.classList.add('active');
  els.submitBtn.textContent = 'Overwrite Inbox (Ctrl+Enter)';
  els.submitBtn.classList.add('warning-btn'); // You might want to add style for this
  
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


async function compileEntry() {
  // Simple prompt for now (could be a modal later)
  const defaultTitle = `Dev-Diary Entry ${currentDate}`;
  const userSuffix = prompt("Entry Title Suffix (optional):", "");
  
  if (userSuffix === null) return; // cancelled

  const finalTitle = userSuffix ? `${defaultTitle} - ${userSuffix}` : defaultTitle;
  
  // Fetch config to show allowed topics
  let allowedTopics = "tooling, prompts, automation, site-build, content-pipeline, experiments, failures, learnings, open-threads, research";
  try {
    const cfg = await fetch(`${API_BASE}/config`).then(r => r.json());
    // Assuming backend config API might expose rules later, but for now we hardcode or rely on known list.
    // Actually, let's just make the prompt helpful.
  } catch (e) {}

  const topics = prompt(
    `Topics (comma separated):\n\nAllowed: ${allowedTopics}`, 
    "tooling"
  );
  if (topics === null) return;

  try {
    els.compileBtn.disabled = true;
    els.compileBtn.textContent = 'Compiling...';

    const res = await fetch(`${API_BASE}/compile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        date: currentDate,
        title: finalTitle,
        topics: topics || "tooling"
      })
    });
    
    const data = await res.json();
    if (data.success) {
      alert(`Entry compiled successfully!\nSaved to: ${data.path}`);
    } else {
      alert('Compile failed');
    }
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
