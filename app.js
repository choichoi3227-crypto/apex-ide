/* ===================================================
   APEX IDE — Complete Application Logic
   =================================================== */

'use strict';

// ===== STATE =====
const state = {
  files: {},           // path -> { content, language, modified }
  openTabs: [],        // [{path, name, icon}]
  activeTab: null,
  rootName: 'workspace',
  tree: {},            // virtual filesystem tree
  terminals: [],
  activeTerminal: 0,
  aiHistory: [],       // [{role, content}]
  settings: {},
  breakpoints: {},
  gitFiles: [],
  searchResults: [],
  deferredInstall: null,
  monacoEditor: null,
  monacoModels: {},
  termInstances: [],
  bottomVisible: true,
  aiVisible: false,
  sidebarVisible: true,
  editorFontSize: 14,
  theme: 'apex-dark',
  language: 'plaintext',
  extensions: [],
  recentFiles: [],
};

// ===== LANGUAGE MAP =====
const LANG_MAP = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript', jsx: 'javascript',
  html: 'html', htm: 'html', xml: 'xml', svg: 'xml',
  css: 'css', scss: 'scss', sass: 'scss', less: 'less',
  json: 'json', jsonc: 'json',
  py: 'python', pyw: 'python',
  rs: 'rust', go: 'go', java: 'java', kt: 'kotlin',
  c: 'c', cpp: 'cpp', cc: 'cpp', h: 'c', hpp: 'cpp',
  cs: 'csharp', vb: 'vb',
  php: 'php', rb: 'ruby', swift: 'swift', m: 'objective-c',
  sh: 'shell', bash: 'shell', zsh: 'shell', fish: 'shell',
  ps1: 'powershell', bat: 'bat', cmd: 'bat',
  sql: 'sql', mysql: 'sql', pgsql: 'pgsql',
  md: 'markdown', mdx: 'markdown',
  yaml: 'yaml', yml: 'yaml', toml: 'ini', ini: 'ini', env: 'ini',
  dockerfile: 'dockerfile', 'Dockerfile': 'dockerfile',
  r: 'r', R: 'r', dart: 'dart', lua: 'lua', ex: 'elixir', exs: 'elixir',
  hs: 'haskell', erl: 'erlang', fs: 'fsharp', clj: 'clojure',
  vue: 'html', svelte: 'html', astro: 'html',
  graphql: 'graphql', gql: 'graphql',
  tf: 'hcl', hcl: 'hcl', proto: 'proto',
  tex: 'latex', bib: 'latex',
  txt: 'plaintext', log: 'plaintext', gitignore: 'plaintext',
  wasm: 'plaintext', lock: 'plaintext',
};

const FILE_ICONS = {
  js: '🟨', mjs: '🟨', cjs: '🟨',
  ts: '🔷', tsx: '🔷', jsx: '🟧',
  html: '🌐', htm: '🌐',
  css: '🎨', scss: '🎨', less: '🎨',
  json: '📋', py: '🐍', rs: '🦀', go: '🐹', java: '☕',
  md: '📝', txt: '📄', sh: '⚡',
  vue: '💚', svelte: '🔥', php: '🐘', rb: '💎',
  c: '🔵', cpp: '🔵', cs: '🟣', swift: '🟠', kt: '🟣',
  yaml: '⚙', yml: '⚙', toml: '⚙', env: '🔑',
  sql: '🗄', dockerfile: '🐳', graphql: '🔮',
  git: '🔀', lock: '🔒',
};

function getExtension(path) {
  const parts = path.split('.');
  if (parts.length < 2) return '';
  return parts[parts.length - 1].toLowerCase();
}
function getLang(path) {
  const ext = getExtension(path);
  return LANG_MAP[ext] || LANG_MAP[path.split('/').pop()] || 'plaintext';
}
function getIcon(path) {
  const name = path.split('/').pop();
  if (name === 'Dockerfile' || name === 'dockerfile') return '🐳';
  if (name === '.gitignore' || name === '.gitattributes') return '🔀';
  if (name === 'package.json' || name === 'package-lock.json') return '📦';
  if (name === 'README.md') return '📖';
  const ext = getExtension(name);
  return FILE_ICONS[ext] || '📄';
}

// ===== SETTINGS =====
const DEFAULT_SETTINGS = {
  fontSize: 14,
  fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace",
  tabSize: 2,
  wordWrap: 'off',
  minimap: true,
  lineNumbers: 'on',
  formatOnSave: true,
  autoSave: true,
  theme: 'apex-dark',
  termFontSize: 13,
  aiModel: 'claude',
  aiKey: '',
  bracketPairs: true,
  stickyScroll: false,
  renderWhitespace: 'selection',
  cursorBlinking: 'smooth',
  cursorStyle: 'line',
  renderLineHighlight: 'all',
};
function loadSettings() {
  try {
    const s = localStorage.getItem('apex-settings');
    state.settings = s ? { ...DEFAULT_SETTINGS, ...JSON.parse(s) } : { ...DEFAULT_SETTINGS };
  } catch { state.settings = { ...DEFAULT_SETTINGS }; }
}
function saveSettings() {
  localStorage.setItem('apex-settings', JSON.stringify(state.settings));
}
function loadRecent() {
  try { state.recentFiles = JSON.parse(localStorage.getItem('apex-recent') || '[]'); } catch { state.recentFiles = []; }
}
function saveRecent() {
  localStorage.setItem('apex-recent', JSON.stringify(state.recentFiles.slice(0, 12)));
}

// ===== TOAST =====
function toast(msg, type = 'info', duration = 3500) {
  const icons = { info: 'ℹ', success: '✓', error: '✕', warning: '⚠' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${icons[type] || 'ℹ'}</span><span>${msg}</span>`;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(() => el.remove(), duration + 200);
}

// ===== SPLASH =====
async function runSplash() {
  const fill = document.getElementById('splashFill');
  const status = document.getElementById('splashStatus');
  const steps = [
    [10, 'Loading Monaco Editor...'],
    [30, 'Initializing language services...'],
    [55, 'Setting up terminal...'],
    [70, 'Loading extensions...'],
    [85, 'Applying theme...'],
    [95, 'Almost ready...'],
    [100, 'Welcome to Apex IDE'],
  ];
  for (const [pct, msg] of steps) {
    fill.style.width = pct + '%';
    status.textContent = msg;
    await sleep(180);
  }
  await sleep(300);
  document.getElementById('splash').style.opacity = '0';
  await sleep(400);
  document.getElementById('splash').remove();
  document.getElementById('app').classList.remove('hidden');
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ===== MONACO INIT =====
let monacoReady = false;
function initMonaco() {
  return new Promise(resolve => {
    require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' } });
    require(['vs/editor/editor.main'], function() {
      // Define custom dark theme
      monaco.editor.defineTheme('apex-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [
          { token: 'comment', foreground: '556070', fontStyle: 'italic' },
          { token: 'keyword', foreground: 'c792ea' },
          { token: 'string', foreground: 'c3e88d' },
          { token: 'number', foreground: 'f78c6c' },
          { token: 'type', foreground: 'ffcb6b' },
          { token: 'function', foreground: '82aaff' },
          { token: 'variable', foreground: 'eeffff' },
          { token: 'operator', foreground: '89ddff' },
          { token: 'identifier', foreground: 'eeffff' },
          { token: 'constant', foreground: 'f78c6c' },
        ],
        colors: {
          'editor.background': '#0d0d0f',
          'editor.foreground': '#eeeef5',
          'editor.lineHighlightBackground': '#1c1c2280',
          'editor.selectionBackground': '#7c3aed40',
          'editor.inactiveSelectionBackground': '#7c3aed20',
          'editorCursor.foreground': '#a78bfa',
          'editorLineNumber.foreground': '#44445a',
          'editorLineNumber.activeForeground': '#8888aa',
          'editorIndentGuide.background': '#2d2d38',
          'editorIndentGuide.activeBackground': '#7c3aed50',
          'editorBracketMatch.background': '#7c3aed30',
          'editorBracketMatch.border': '#7c3aed',
          'editorGutter.background': '#0d0d0f',
          'scrollbar.shadow': '#00000060',
          'scrollbarSlider.background': '#2d2d3880',
          'scrollbarSlider.hoverBackground': '#3d3d4880',
          'scrollbarSlider.activeBackground': '#7c3aed60',
          'editor.findMatchBackground': '#7c3aed40',
          'editor.findMatchHighlightBackground': '#7c3aed20',
          'editorWidget.background': '#16161a',
          'editorWidget.border': '#2d2d38',
          'editorSuggestWidget.background': '#16161a',
          'editorSuggestWidget.border': '#2d2d38',
          'editorSuggestWidget.selectedBackground': '#7c3aed25',
          'peekViewEditor.background': '#111114',
          'peekViewResult.background': '#16161a',
          'minimap.background': '#111114',
          'tab.activeBackground': '#0d0d0f',
          'tab.inactiveBackground': '#111114',
          'input.background': '#1c1c22',
          'input.border': '#2d2d38',
          'focusBorder': '#7c3aed',
        }
      });
      monaco.editor.defineTheme('apex-light', {
        base: 'vs',
        inherit: true,
        rules: [],
        colors: {
          'editor.background': '#fafafa',
          'editorCursor.foreground': '#7c3aed',
          'editor.selectionBackground': '#7c3aed20',
        }
      });
      monaco.editor.defineTheme('apex-monokai', {
        base: 'vs-dark', inherit: true,
        rules: [
          { token: 'keyword', foreground: 'f92672' },
          { token: 'string', foreground: 'e6db74' },
          { token: 'number', foreground: 'ae81ff' },
          { token: 'function', foreground: 'a6e22e' },
          { token: 'comment', foreground: '75715e', fontStyle: 'italic' },
        ],
        colors: { 'editor.background': '#272822', 'editorCursor.foreground': '#f8f8f0' }
      });
      monaco.editor.defineTheme('apex-nord', {
        base: 'vs-dark', inherit: true,
        rules: [
          { token: 'keyword', foreground: '81a1c1' },
          { token: 'string', foreground: 'a3be8c' },
          { token: 'number', foreground: 'b48ead' },
          { token: 'function', foreground: '88c0d0' },
        ],
        colors: { 'editor.background': '#2e3440', 'editorCursor.foreground': '#d8dee9' }
      });

      // Create editor instance
      state.monacoEditor = monaco.editor.create(document.getElementById('monacoContainer'), {
        value: '',
        language: 'plaintext',
        theme: state.settings.theme || 'apex-dark',
        fontSize: state.settings.fontSize,
        fontFamily: state.settings.fontFamily,
        fontLigatures: true,
        tabSize: state.settings.tabSize,
        insertSpaces: true,
        wordWrap: state.settings.wordWrap,
        minimap: { enabled: state.settings.minimap },
        lineNumbers: state.settings.lineNumbers,
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        cursorBlinking: state.settings.cursorBlinking,
        cursorStyle: state.settings.cursorStyle,
        renderLineHighlight: state.settings.renderLineHighlight,
        bracketPairColorization: { enabled: state.settings.bracketPairs },
        guides: { bracketPairs: true, indentation: true },
        suggest: {
          showKeywords: true, showSnippets: true, showClasses: true,
          showFunctions: true, showVariables: true, showModules: true,
          preview: true, previewMode: 'subwordSmart',
        },
        quickSuggestions: { other: true, comments: false, strings: true },
        parameterHints: { enabled: true },
        snippetSuggestions: 'top',
        tabCompletion: 'on',
        acceptSuggestionOnCommitCharacter: true,
        acceptSuggestionOnEnter: 'smart',
        hover: { enabled: true, delay: 300 },
        formatOnType: true,
        formatOnPaste: true,
        autoIndent: 'full',
        autoClosingBrackets: 'always',
        autoClosingQuotes: 'always',
        autoSurround: 'languageDefined',
        foldingHighlight: true,
        renderWhitespace: state.settings.renderWhitespace,
        stickyScroll: { enabled: state.settings.stickyScroll },
        accessibilitySupport: 'auto',
        linkedEditing: true,
        inlayHints: { enabled: 'on' },
        padding: { top: 8, bottom: 8 },
        'semanticHighlighting.enabled': true,
      });

      // Monaco event listeners
      state.monacoEditor.onDidChangeCursorPosition(e => {
        const pos = e.position;
        document.getElementById('sbCursor').textContent = `Ln ${pos.lineNumber}, Col ${pos.column}`;
      });

      state.monacoEditor.onDidChangeModelContent(() => {
        if (state.activeTab) {
          const tab = state.openTabs.find(t => t.path === state.activeTab);
          if (tab) {
            const el = document.querySelector(`.tab[data-path="${CSS.escape(state.activeTab)}"]`);
            if (el && !el.classList.contains('modified')) {
              el.classList.add('modified');
              state.files[state.activeTab].modified = true;
            }
          }
          if (state.settings.autoSave) {
            clearTimeout(state._autoSaveTimer);
            state._autoSaveTimer = setTimeout(() => saveCurrentFile(), 1500);
          }
        }
        updateProblems();
      });

      // Keyboard shortcuts
      state.monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveCurrentFile());
      state.monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyA, () => toggleAIPanel());
      state.monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyP, () => openCommandPalette());
      state.monacoEditor.addCommand(monaco.KeyCode.F1, () => openCommandPalette());

      // Context menu actions
      state.monacoEditor.addAction({
        id: 'apex.explain', label: '✦ Explain with AI',
        contextMenuGroupId: 'apex', contextMenuOrder: 1,
        run: () => explainCode(),
      });
      state.monacoEditor.addAction({
        id: 'apex.fix', label: '✦ Fix with AI',
        contextMenuGroupId: 'apex', contextMenuOrder: 2,
        run: () => fixCode(),
      });
      state.monacoEditor.addAction({
        id: 'apex.refactor', label: '✦ Refactor with AI',
        contextMenuGroupId: 'apex', contextMenuOrder: 3,
        run: () => refactorCode(),
      });
      state.monacoEditor.addAction({
        id: 'apex.comment', label: '✦ Generate Comments',
        contextMenuGroupId: 'apex', contextMenuOrder: 4,
        run: () => addComments(),
      });
      state.monacoEditor.addAction({
        id: 'apex.tests', label: '✦ Generate Tests',
        contextMenuGroupId: 'apex', contextMenuOrder: 5,
        run: () => generateTests(),
      });

      monacoReady = true;
      resolve();
    });
  });
}

// ===== TERMINAL =====
let fitAddon = null;
function initTerminal() {
  addTerminal();
}

function addTerminal() {
  const id = state.terminals.length;
  const name = `bash ${id + 1}`;

  const term = new Terminal({
    cursorBlink: true,
    cursorStyle: 'bar',
    fontFamily: state.settings.fontFamily || "'Cascadia Code', Consolas, monospace",
    fontSize: state.settings.termFontSize || 13,
    theme: {
      background: '#0d0d0f',
      foreground: '#eeeef5',
      cursor: '#a78bfa',
      cursorAccent: '#0d0d0f',
      selection: 'rgba(124,58,237,0.3)',
      black: '#16161a', red: '#ef4444', green: '#22c55e',
      yellow: '#f59e0b', blue: '#3b82f6', magenta: '#a78bfa',
      cyan: '#06b6d4', white: '#eeeef5',
      brightBlack: '#555570', brightRed: '#ff6b6b', brightGreen: '#4ade80',
      brightYellow: '#fcd34d', brightBlue: '#60a5fa', brightMagenta: '#c4b5fd',
      brightCyan: '#22d3ee', brightWhite: '#ffffff',
    },
    allowProposedApi: true,
    rightClickSelectsWord: true,
    macOptionIsMeta: true,
    scrollback: 10000,
  });

  const fa = new FitAddon.FitAddon();
  term.loadAddon(fa);

  const container = document.createElement('div');
  container.style.cssText = 'width:100%;height:100%;display:none;';
  container.id = `term-${id}`;
  document.getElementById('terminalContainer').appendChild(container);

  term.open(container);
  fa.fit();

  // Simulated shell
  const shell = new ShellSimulator(term, id);
  state.terminals.push({ term, fitAddon: fa, shell, container, name, id });

  // Tab
  const tabEl = document.createElement('div');
  tabEl.className = 'term-tab';
  tabEl.dataset.id = id;
  tabEl.innerHTML = `<span>⚡ ${name}</span><span class="term-tab-close" onclick="killTerminalById(${id})">✕</span>`;
  tabEl.addEventListener('click', () => switchTerminal(id));
  document.getElementById('terminalTabs').appendChild(tabEl);

  switchTerminal(id);

  window.addEventListener('resize', () => {
    state.terminals.forEach(t => { try { t.fitAddon.fit(); } catch {} });
  });
}

function switchTerminal(id) {
  state.activeTerminal = id;
  state.terminals.forEach(t => {
    t.container.style.display = t.id === id ? 'block' : 'none';
  });
  document.querySelectorAll('.term-tab').forEach(el => {
    el.classList.toggle('active', parseInt(el.dataset.id) === id);
  });
  try { state.terminals[id].fitAddon.fit(); } catch {}
}

function killTerminal() { killTerminalById(state.activeTerminal); }
function killTerminalById(id) {
  const t = state.terminals[id];
  if (!t) return;
  t.term.dispose();
  t.container.remove();
  document.querySelector(`.term-tab[data-id="${id}"]`)?.remove();
  state.terminals[id] = null;
  if (state.terminals.filter(Boolean).length === 0) addTerminal();
}

// ===== SHELL SIMULATOR =====
class ShellSimulator {
  constructor(term, id) {
    this.term = term;
    this.id = id;
    this.cwd = '/workspace';
    this.history = [];
    this.histIdx = -1;
    this.buf = '';
    this.env = { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: '/workspace', USER: 'dev', TERM: 'xterm-256color' };
    this.virtualFS = {
      '/workspace': { type: 'dir', children: {} },
      '/tmp': { type: 'dir', children: {} },
    };
    this.running = false;

    // Sync with IDE files
    Object.keys(state.files).forEach(p => { this.mkdirp(p.split('/').slice(0,-1).join('/')); });

    term.writeln('\x1b[38;5;141m  ___                  ___ ____  ___\x1b[0m');
    term.writeln('\x1b[38;5;141m / _ \\ _ __  _____  __/ _ \\___ \\/ __|\x1b[0m');
    term.writeln('\x1b[38;5;141m| | | | \'_ \\/ _ \\ \\/ /  __/|_ > (__\x1b[0m');
    term.writeln('\x1b[38;5;141m|_| |_| .__/\\___/\\__/_\\___\\___/\\___|\x1b[0m');
    term.writeln('\x1b[38;5;141m      |_|                             \x1b[0m');
    term.writeln('');
    term.writeln('\x1b[38;5;246mApex IDE Terminal  —  Simulated Bash Environment\x1b[0m');
    term.writeln('\x1b[38;5;246mType \x1b[38;5;141mhelp\x1b[38;5;246m for available commands.\x1b[0m');
    term.writeln('');
    this.prompt();

    term.onKey(e => this.handleKey(e));
    term.onData(d => {
      if (d.length > 1 && !d.startsWith('\x1b')) {
        // Paste
        this.buf += d;
        term.write(d);
      }
    });
  }

  prompt() {
    const cwdShort = this.cwd.replace('/workspace', '~');
    this.term.write(`\x1b[38;5;141m${this.env.USER}\x1b[0m\x1b[38;5;246m@\x1b[0m\x1b[38;5;75mapex\x1b[0m:\x1b[38;5;221m${cwdShort}\x1b[0m\x1b[38;5;75m$\x1b[0m `);
    this.buf = '';
  }

  handleKey({ key, domEvent }) {
    const ev = domEvent;
    if (ev.key === 'Enter') {
      this.term.writeln('');
      this.execute(this.buf.trim());
      this.buf = '';
    } else if (ev.key === 'Backspace') {
      if (this.buf.length > 0) {
        this.buf = this.buf.slice(0, -1);
        this.term.write('\b \b');
      }
    } else if (ev.key === 'ArrowUp') {
      if (this.histIdx < this.history.length - 1) {
        this.histIdx++;
        this.clearLine();
        this.buf = this.history[this.histIdx] || '';
        this.term.write(this.buf);
      }
    } else if (ev.key === 'ArrowDown') {
      if (this.histIdx > 0) {
        this.histIdx--;
        this.clearLine();
        this.buf = this.history[this.histIdx] || '';
        this.term.write(this.buf);
      } else { this.histIdx = -1; this.clearLine(); }
    } else if (ev.key === 'Tab') {
      this.autocomplete();
    } else if (ev.ctrlKey && ev.key === 'c') {
      this.term.writeln('^C');
      this.prompt();
    } else if (ev.ctrlKey && ev.key === 'l') {
      this.term.write('\x1b[2J\x1b[H');
      this.prompt();
    } else if (ev.ctrlKey && ev.key === 'a') {
      // home
    } else if (!ev.ctrlKey && !ev.metaKey && key.length === 1) {
      this.buf += key;
      this.term.write(key);
    }
  }

  clearLine() {
    this.term.write('\r\x1b[K');
    const cwdShort = this.cwd.replace('/workspace', '~');
    this.term.write(`\x1b[38;5;141m${this.env.USER}\x1b[0m\x1b[38;5;246m@\x1b[0m\x1b[38;5;75mapex\x1b[0m:\x1b[38;5;221m${cwdShort}\x1b[0m\x1b[38;5;75m$\x1b[0m `);
  }

  autocomplete() {
    const parts = this.buf.split(' ');
    const last = parts[parts.length - 1];
    const commands = ['ls', 'cd', 'pwd', 'cat', 'echo', 'mkdir', 'touch', 'rm', 'cp', 'mv', 'node', 'npm', 'python', 'python3', 'git', 'curl', 'grep', 'find', 'which', 'env', 'export', 'clear', 'help'];
    const matches = commands.filter(c => c.startsWith(last));
    if (matches.length === 1) {
      const add = matches[0].slice(last.length);
      this.buf += add;
      this.term.write(add);
    } else if (matches.length > 1) {
      this.term.writeln('');
      this.term.writeln(matches.join('  '));
      this.prompt();
      this.term.write(this.buf);
    }
  }

  mkdirp(path) {
    if (!path) return;
    const parts = path.split('/').filter(Boolean);
    let cur = '';
    parts.forEach(p => { cur += '/' + p; if (!this.virtualFS[cur]) this.virtualFS[cur] = { type: 'dir', children: {} }; });
  }

  execute(cmd) {
    if (!cmd) { this.prompt(); return; }
    this.history.unshift(cmd);
    this.histIdx = -1;

    const [prog, ...args] = this.parseArgs(cmd);
    const w = this.term.writeln.bind(this.term);
    const wr = this.term.write.bind(this.term);

    switch (prog) {
      case 'clear': case 'cls':
        this.term.write('\x1b[2J\x1b[H');
        break;
      case 'pwd':
        w(this.cwd); break;
      case 'echo':
        w(args.join(' ')); break;
      case 'env':
        Object.entries(this.env).forEach(([k,v]) => w(`${k}=${v}`)); break;
      case 'export': {
        const [k, v] = args[0]?.split('=') || [];
        if (k && v !== undefined) this.env[k] = v;
        break;
      }
      case 'ls': {
        const entries = Object.keys(state.tree || {});
        if (entries.length === 0) w('\x1b[38;5;246m(empty)\x1b[0m');
        else entries.forEach(e => {
          const isDir = typeof state.tree[e] === 'object' && !state.tree[e]?.content;
          w(isDir ? `\x1b[38;5;75m${e}/\x1b[0m` : e);
        });
        break;
      }
      case 'cd': {
        const target = args[0] || '/workspace';
        if (target === '~' || target === '') this.cwd = '/workspace';
        else if (target === '..') this.cwd = this.cwd.split('/').slice(0,-1).join('/') || '/';
        else this.cwd = target.startsWith('/') ? target : `${this.cwd}/${target}`;
        break;
      }
      case 'cat': {
        const path = args[0];
        const abs = path?.startsWith('/') ? path : `${this.cwd}/${path}`;
        const file = state.files[abs.replace(/^\/workspace\//, '')];
        if (file) w(file.content);
        else w(`\x1b[38;5;196mcat: ${path}: No such file or directory\x1b[0m`);
        break;
      }
      case 'touch': {
        const name = args[0];
        if (name && !state.files[name]) { state.files[name] = { content: '', language: getLang(name), modified: false }; refreshFileTree(); }
        break;
      }
      case 'mkdir': {
        const name = args[args.indexOf('-p') >= 0 ? args.indexOf('-p')+1 : 0];
        if (name) toast(`Folder '${name}' created`, 'success');
        break;
      }
      case 'rm': {
        const target = args.filter(a => !a.startsWith('-'))[0];
        if (target && state.files[target]) { delete state.files[target]; closeTab(target); refreshFileTree(); toast(`Deleted ${target}`, 'success'); }
        else w(`\x1b[38;5;196mrm: ${target}: No such file\x1b[0m`);
        break;
      }
      case 'node': {
        if (args[0] === '-e' || args[0] === '-p') {
          const code = args.slice(1).join(' ');
          try {
            const result = new Function('require', 'module', 'exports', `"use strict"; try { return (${code}); } catch(e) { return e.message; }`)(() => ({}), {}, {});
            if (result !== undefined) w(String(result));
          } catch(e) { w(`\x1b[38;5;196m${e.message}\x1b[0m`); }
        } else if (args[0]) {
          const file = state.files[args[0]];
          if (file) { w(`\x1b[38;5;246m[Running ${args[0]}...]\x1b[0m`); try { new Function(file.content)(); w('\x1b[38;5;82mDone.\x1b[0m'); } catch(e) { w(`\x1b[38;5;196m${e.message}\x1b[0m`); } }
          else w(`\x1b[38;5;196mError: Cannot find module '${args[0]}'\x1b[0m`);
        } else w('Welcome to Node.js v20.x\nType .exit to exit'); break;
      }
      case 'python': case 'python3': {
        if (args[0]) { const f = state.files[args[0]]; if (f) { w(`\x1b[38;5;246m[Python simulation: ${args[0]}]\x1b[0m`); w('\x1b[38;5;82m(Output would appear here in a real backend)\x1b[0m'); } else w(`python3: can't open file '${args[0]}'`); } else w(`Python 3.12.0\nType "exit()" to exit.`); break;
      }
      case 'npm': {
        if (args[0] === 'install' || args[0] === 'i') {
          const pkg = args[1] || 'dependencies';
          w(`\x1b[38;5;246m$ npm install ${pkg}\x1b[0m`);
          w(''); wr('\x1b[38;5;75m');
          let dots = 0;
          const interval = setInterval(() => { wr('█'); dots++; if (dots > 20) { clearInterval(interval); this.term.writeln('\x1b[0m'); w(`\x1b[38;5;82madded packages in 1.2s\x1b[0m`); this.prompt(); } }, 80);
          return;
        } else if (args[0] === 'run') {
          w(`\x1b[38;5;246m> ${args[1]}\x1b[0m`); w('\x1b[38;5;246mStarting...\x1b[0m');
        } else if (args[0] === 'init') {
          const pkg = { name: state.rootName || 'my-app', version: '1.0.0', description: '', main: 'index.js', scripts: { start: 'node index.js', test: 'jest' }, dependencies: {}, devDependencies: {} };
          state.files['package.json'] = { content: JSON.stringify(pkg, null, 2), language: 'json', modified: false };
          refreshFileTree();
          w('\x1b[38;5;82mWrote to package.json\x1b[0m');
        } else w(`npm ${args.join(' ')}`);
        break;
      }
      case 'git': {
        const sub = args[0];
        if (sub === 'init') { w('\x1b[38;5;82mInitialized empty Git repository in .git/\x1b[0m'); document.getElementById('sbBranch').textContent = '⎇ main'; }
        else if (sub === 'status') { w('On branch main\nnothing to commit, working tree clean'); }
        else if (sub === 'log') { w('\x1b[38;5;221mcommit a1b2c3d\x1b[0m\nAuthor: Dev <dev@apex.ide>\nDate:   Today\n\n    Initial commit'); }
        else if (sub === 'add') { w(`\x1b[38;5;82mStaged: ${args.slice(1).join(', ')}\x1b[0m`); }
        else if (sub === 'commit') { const m = args[args.indexOf('-m')+1] || 'commit'; w(`\x1b[38;5;82m[main a1b2c3d] ${m.replace(/^"|"$/g,'')}\x1b[0m`); }
        else if (sub === 'clone') { w(`Cloning into '${(args[1] || 'repo').split('/').pop()}'...`); w('remote: Enumerating objects: 100'); w('\x1b[38;5;82mDone.\x1b[0m'); }
        else if (sub === 'push') { w('Everything up-to-date'); }
        else if (sub === 'pull') { w('Already up to date.'); }
        else if (sub === 'branch') { w('* \x1b[38;5;82mmain\x1b[0m'); }
        else if (sub === 'checkout') { w(`Switched to branch '${args[1] || 'main'}'`); document.getElementById('sbBranch').textContent = `⎇ ${args[1] || 'main'}`; }
        else w(`git: '${sub}' not fully simulated`);
        break;
      }
      case 'grep': {
        const pattern = args[0]; const file = args[1];
        if (file && state.files[file] && pattern) {
          const lines = state.files[file].content.split('\n');
          lines.forEach((l, i) => { if (l.includes(pattern)) w(`\x1b[38;5;75m${file}:${i+1}:\x1b[0m ${l.replace(pattern, `\x1b[38;5;196m${pattern}\x1b[0m`)}`); });
        } else w(`\x1b[38;5;196mgrep: invalid usage\x1b[0m`);
        break;
      }
      case 'which': {
        const cmds = { node: '/usr/local/bin/node', npm: '/usr/local/bin/npm', python3: '/usr/bin/python3', git: '/usr/bin/git', bash: '/bin/bash' };
        w(cmds[args[0]] || `which: no ${args[0]} in (${this.env.PATH})`); break;
      }
      case 'curl': {
        w('\x1b[38;5;246m[curl: network access is simulated]\x1b[0m');
        w('{"status":"ok","message":"simulated response"}');
        break;
      }
      case 'find': {
        Object.keys(state.files).forEach(f => { if (!args[2] || f.includes(args[2].replace(/\*/g,''))) w(f); }); break;
      }
      case 'wc': {
        const f = state.files[args[args.length-1]];
        if (f) { const lines = f.content.split('\n').length; const words = f.content.split(/\s+/).length; const chars = f.content.length; w(`  ${lines}  ${words}  ${chars} ${args[args.length-1]}`); }
        break;
      }
      case 'help':
        w('\x1b[38;5;141mAvailable commands:\x1b[0m');
        ['ls','cd','pwd','cat','echo','touch','mkdir','rm','cp','mv','grep','find','wc','which','env','export','clear','node','python3','npm','git','curl','help'].forEach(c => wr(`  \x1b[38;5;75m${c.padEnd(12)}\x1b[0m`));
        this.term.writeln('');
        break;
      default:
        w(`\x1b[38;5;196mbash: ${prog}: command not found\x1b[0m`);
    }
    this.prompt();
  }

  parseArgs(cmd) {
    const result = [];
    let current = '';
    let inQuote = null;
    for (const ch of cmd) {
      if (inQuote) {
        if (ch === inQuote) inQuote = null;
        else current += ch;
      } else if (ch === '"' || ch === "'") {
        inQuote = ch;
      } else if (ch === ' ') {
        if (current) { result.push(current); current = ''; }
      } else { current += ch; }
    }
    if (current) result.push(current);
    return result;
  }
}

// ===== FILE SYSTEM =====
function openFolder() {
  if ('showDirectoryPicker' in window) {
    window.showDirectoryPicker({ mode: 'readwrite' }).then(handle => {
      state.rootName = handle.name;
      state.dirHandle = handle;
      loadDirectory(handle, '');
    }).catch(() => toast('Folder access denied or cancelled', 'warning'));
  } else {
    // Fallback: file input
    const input = document.createElement('input');
    input.type = 'file'; input.multiple = true; input.webkitdirectory = true;
    input.onchange = e => {
      const files = Array.from(e.target.files);
      files.forEach(f => {
        const reader = new FileReader();
        reader.onload = ev => {
          state.files[f.webkitRelativePath || f.name] = { content: ev.target.result, language: getLang(f.name), modified: false };
        };
        reader.readAsText(f);
      });
      setTimeout(() => { refreshFileTree(); toast(`Loaded ${files.length} files`, 'success'); }, 500);
    };
    input.click();
  }
}

async function loadDirectory(handle, prefix) {
  state.files = {};
  state.tree = {};
  state.openTabs = [];
  state.activeTab = null;
  updateTabs();
  for await (const [name, entry] of handle.entries()) {
    if (entry.kind === 'file') {
      const path = prefix ? `${prefix}/${name}` : name;
      const file = await entry.getFile();
      const text = await file.text().catch(() => '');
      state.files[path] = { content: text, language: getLang(name), modified: false, handle: entry };
    } else if (entry.kind === 'directory' && !name.startsWith('.') && name !== 'node_modules') {
      await loadDirectory(entry, prefix ? `${prefix}/${name}` : name);
    }
  }
  refreshFileTree();
  toast(`Opened: ${state.rootName}`, 'success');
  addRecentFile({ name: state.rootName, path: state.rootName, type: 'folder' });
}

function newProject() {
  const name = prompt('Project name:', 'my-app');
  if (!name) return;
  state.rootName = name;
  state.files = {};
  const defaults = {
    'index.html': `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  <title>${name}</title>\n  <link rel="stylesheet" href="style.css" />\n</head>\n<body>\n  <h1>Hello from ${name}!</h1>\n  <script src="app.js"><\/script>\n</body>\n</html>`,
    'style.css': `* { box-sizing: border-box; margin: 0; padding: 0; }\nbody { font-family: system-ui, sans-serif; line-height: 1.6; padding: 2rem; }\nh1 { color: #7c3aed; }`,
    'app.js': `'use strict';\n\nconsole.log('${name} loaded');\n`,
    'README.md': `# ${name}\n\nBuilt with Apex IDE.\n`,
  };
  Object.entries(defaults).forEach(([k,v]) => { state.files[k] = { content: v, language: getLang(k), modified: false }; });
  refreshFileTree();
  openTab('index.html');
  toast(`Project '${name}' created`, 'success');
}

function newFile(name) {
  const fname = name || prompt('File name:', 'untitled.txt');
  if (!fname) return;
  state.files[fname] = { content: '', language: getLang(fname), modified: false };
  refreshFileTree();
  openTab(fname);
  toast(`Created: ${fname}`, 'success');
}

function newFolder() {
  const name = prompt('Folder name:', 'new-folder');
  if (!name) return;
  if (!state.tree[name]) state.tree[name] = {};
  refreshFileTree();
}

function refreshFileTree() {
  const container = document.getElementById('fileTree');
  const paths = Object.keys(state.files).sort();
  // Build tree structure
  const treeData = {};
  paths.forEach(p => {
    const parts = p.split('/');
    let node = treeData;
    parts.forEach((part, i) => {
      if (i === parts.length - 1) { node[part] = { __file: p }; }
      else { if (!node[part]) node[part] = {}; node = node[part]; }
    });
  });
  container.innerHTML = '';
  renderTree(container, treeData, 0);
  updateRecentFiles();
}

function renderTree(container, node, depth) {
  Object.entries(node).sort(([a,av],[b,bv]) => {
    const aIsDir = !av.__file; const bIsDir = !bv.__file;
    if (aIsDir && !bIsDir) return -1;
    if (!aIsDir && bIsDir) return 1;
    return a.localeCompare(b);
  }).forEach(([name, val]) => {
    if (val.__file) {
      // File
      const el = document.createElement('div');
      el.className = 'tree-item' + (val.__file === state.activeTab ? ' active' : '');
      el.style.paddingLeft = (8 + depth * 16) + 'px';
      el.dataset.path = val.__file;
      el.innerHTML = `<span class="tree-icon">${getIcon(name)}</span><span class="tree-label">${name}</span>`;
      el.addEventListener('click', () => openTab(val.__file));
      el.addEventListener('contextmenu', e => showContextMenu(e, val.__file));
      container.appendChild(el);
    } else {
      // Folder
      const folderEl = document.createElement('div');
      folderEl.className = 'tree-item';
      folderEl.style.paddingLeft = (8 + depth * 16) + 'px';
      const chevron = document.createElement('span');
      chevron.className = 'tree-chevron open';
      chevron.textContent = '›';
      folderEl.innerHTML = `<span class="tree-icon">📁</span>`;
      folderEl.insertBefore(chevron, folderEl.firstChild);
      const label = document.createElement('span');
      label.className = 'tree-label';
      label.textContent = name;
      folderEl.appendChild(label);
      container.appendChild(folderEl);
      const children = document.createElement('div');
      children.className = 'tree-children';
      container.appendChild(children);
      renderTree(children, val, depth + 1);
      folderEl.addEventListener('click', () => {
        const open = chevron.classList.toggle('open');
        children.style.display = open ? '' : 'none';
      });
    }
  });
}

// ===== TABS =====
function openTab(path) {
  const existing = state.openTabs.find(t => t.path === path);
  if (!existing) {
    const name = path.split('/').pop();
    state.openTabs.push({ path, name, icon: getIcon(name) });
  }
  state.activeTab = path;
  updateTabs();
  loadIntoEditor(path);
  updateBreadcrumb(path);
  document.getElementById('welcomeScreen').classList.add('hidden');
  document.getElementById('monacoContainer').classList.remove('hidden');
  if (monacoReady) state.monacoEditor.focus();
}

function updateTabs() {
  const container = document.getElementById('tabs');
  container.innerHTML = '';
  state.openTabs.forEach(tab => {
    const el = document.createElement('div');
    el.className = 'tab' + (tab.path === state.activeTab ? ' active' : '') + (state.files[tab.path]?.modified ? ' modified' : '');
    el.dataset.path = tab.path;
    el.innerHTML = `<span class="tab-icon">${tab.icon}</span><span class="tab-name" title="${tab.path}">${tab.name}</span><span class="tab-close">✕</span>`;
    el.addEventListener('click', (e) => { if (!e.target.classList.contains('tab-close')) openTab(tab.path); });
    el.querySelector('.tab-close').addEventListener('click', (e) => { e.stopPropagation(); closeTab(tab.path); });
    container.appendChild(el);
  });
  // Highlight active in tree
  document.querySelectorAll('.tree-item').forEach(el => {
    el.classList.toggle('active', el.dataset.path === state.activeTab);
  });
}

function closeTab(path) {
  const idx = state.openTabs.findIndex(t => t.path === path);
  if (idx === -1) return;
  if (state.files[path]?.modified) {
    if (!confirm(`Save changes to ${path.split('/').pop()}?`)) {
      state.files[path].modified = false;
    } else { saveFile(path); }
  }
  state.openTabs.splice(idx, 1);
  if (state.monacoModels[path]) { state.monacoModels[path].dispose(); delete state.monacoModels[path]; }
  if (state.activeTab === path) {
    if (state.openTabs.length > 0) {
      const newIdx = Math.min(idx, state.openTabs.length - 1);
      openTab(state.openTabs[newIdx].path);
    } else {
      state.activeTab = null;
      if (monacoReady) { state.monacoEditor.setModel(null); }
      document.getElementById('welcomeScreen').classList.remove('hidden');
      document.getElementById('monacoContainer').classList.add('hidden');
      updateTabs();
    }
  } else { updateTabs(); }
}

function closeAllTabs() {
  [...state.openTabs].forEach(t => closeTab(t.path));
}

function loadIntoEditor(path) {
  if (!monacoReady) return;
  const file = state.files[path];
  if (!file) return;
  const lang = getLang(path);
  if (!state.monacoModels[path]) {
    state.monacoModels[path] = monaco.editor.createModel(file.content, lang, monaco.Uri.file('/' + path));
  }
  state.monacoEditor.setModel(state.monacoModels[path]);
  state.monacoEditor.updateOptions({ theme: state.settings.theme });
  document.getElementById('sbLang').textContent = lang.charAt(0).toUpperCase() + lang.slice(1);
  updateProblems();
}

function updateBreadcrumb(path) {
  const parts = path.split('/');
  const el = document.getElementById('breadcrumb');
  el.innerHTML = parts.map((p, i) => `<span style="color:${i===parts.length-1?'var(--text-1)':'var(--text-3)'}">${p}</span>`).join('<span style="color:var(--text-3);margin:0 4px">›</span>');
}

function saveCurrentFile() {
  if (!state.activeTab) return;
  saveFile(state.activeTab);
}

function saveFile(path) {
  if (!monacoReady || !state.monacoModels[path]) return;
  state.files[path].content = state.monacoModels[path].getValue();
  state.files[path].modified = false;
  if (state.files[path].handle) {
    state.files[path].handle.createWritable().then(w => { w.write(state.files[path].content); w.close(); }).catch(() => {});
  }
  document.querySelector(`.tab[data-path="${CSS.escape(path)}"]`)?.classList.remove('modified');
  toast(`Saved: ${path.split('/').pop()}`, 'success');
}

function splitEditor() { toast('Split editor view coming soon', 'info'); }

// ===== SEARCH =====
function doSearch() {
  const query = document.getElementById('searchInput').value;
  const useRegex = document.getElementById('searchRegex').checked;
  const caseSensitive = document.getElementById('searchCase').checked;
  const wholeWord = document.getElementById('searchWord').checked;
  if (!query) return;
  const results = document.getElementById('searchResults');
  results.innerHTML = '';
  let total = 0;
  Object.entries(state.files).forEach(([path, file]) => {
    const lines = file.content.split('\n');
    const matches = [];
    lines.forEach((line, i) => {
      let test;
      if (useRegex) { try { test = new RegExp(query, caseSensitive ? 'g' : 'gi').test(line); } catch { return; } }
      else { test = caseSensitive ? line.includes(query) : line.toLowerCase().includes(query.toLowerCase()); }
      if (wholeWord) { const wr = new RegExp(`\\b${query}\\b`, caseSensitive ? 'g' : 'gi'); test = wr.test(line); }
      if (test) matches.push({ line: i + 1, text: line.trim() });
    });
    if (matches.length > 0) {
      total += matches.length;
      const fileEl = document.createElement('div');
      fileEl.className = 'sr-file';
      fileEl.innerHTML = `<div class="sr-fname">${path} (${matches.length})</div>`;
      matches.forEach(m => {
        const matchEl = document.createElement('div');
        matchEl.className = 'sr-match';
        const text = m.text.slice(0, 80);
        matchEl.innerHTML = `${m.line}: ${text.replace(new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), caseSensitive?'g':'gi'), s => `<mark>${s}</mark>`)}`;
        matchEl.addEventListener('click', () => { openTab(path); setTimeout(() => { if (monacoReady) { state.monacoEditor.revealLineInCenter(m.line); state.monacoEditor.setPosition({ lineNumber: m.line, column: 1 }); } }, 100); });
        fileEl.appendChild(matchEl);
      });
      results.appendChild(fileEl);
    }
  });
  if (total === 0) results.innerHTML = '<div style="padding:12px;color:var(--text-3);font-size:12px">No results found</div>';
}

function doReplace() {
  const query = document.getElementById('searchInput').value;
  const replaceWith = document.getElementById('replaceInput').value;
  if (!query) return;
  let count = 0;
  Object.entries(state.files).forEach(([path, file]) => {
    const updated = file.content.split(query).join(replaceWith);
    if (updated !== file.content) {
      count += (file.content.split(query).length - 1);
      state.files[path].content = updated;
      if (state.monacoModels[path]) state.monacoModels[path].setValue(updated);
    }
  });
  toast(`Replaced ${count} occurrence${count !== 1 ? 's' : ''}`, 'success');
}

// ===== PROBLEMS =====
function updateProblems() {
  if (!monacoReady || !state.activeTab) return;
  const model = state.monacoModels[state.activeTab];
  if (!model) return;
  const markers = monaco.editor.getModelMarkers({ resource: model.uri });
  const errors = markers.filter(m => m.severity === monaco.MarkerSeverity.Error).length;
  const warnings = markers.filter(m => m.severity === monaco.MarkerSeverity.Warning).length;
  document.getElementById('sbErrors').textContent = `✕ ${errors}  ⚠ ${warnings}`;
  const list = document.getElementById('problemsList');
  if (markers.length === 0) { list.innerHTML = '<div class="empty-state">No problems detected</div>'; return; }
  list.innerHTML = '';
  markers.forEach(m => {
    const el = document.createElement('div');
    el.className = 'problem-item';
    const icon = m.severity === monaco.MarkerSeverity.Error ? '🔴' : m.severity === monaco.MarkerSeverity.Warning ? '🟡' : '🔵';
    el.innerHTML = `<span class="prob-icon">${icon}</span><div><div class="prob-msg">${m.message}</div><div class="prob-loc">${state.activeTab}:${m.startLineNumber}:${m.startColumn}</div></div>`;
    el.addEventListener('click', () => {
      openTab(state.activeTab);
      if (monacoReady) { state.monacoEditor.revealLineInCenter(m.startLineNumber); state.monacoEditor.setPosition({ lineNumber: m.startLineNumber, column: m.startColumn }); }
    });
    list.appendChild(el);
  });
}

// ===== AI PANEL =====
function toggleAIPanel() {
  state.aiVisible = !state.aiVisible;
  const panel = document.getElementById('aiPanelRight');
  panel.classList.toggle('hidden', !state.aiVisible);
  document.getElementById('sbAI').textContent = state.aiVisible ? '✦ AI Active' : '✦ AI Ready';
}

function clearAIChat() {
  state.aiHistory = [];
  document.getElementById('aiMessages').innerHTML = '';
  toast('AI chat cleared', 'info');
}

function appendAIMessage(role, content) {
  const container = document.getElementById('aiMessages');
  const el = document.createElement('div');
  el.className = `ai-msg ${role}`;
  if (role === 'ai') {
    el.innerHTML = formatAIContent(content);
    const actions = document.createElement('div');
    actions.className = 'ai-msg-actions';
    actions.innerHTML = `<button onclick="copyToClipboard('${encodeURIComponent(content)}')">Copy</button><button onclick="insertIntoEditor('${encodeURIComponent(content)}')">Insert</button>`;
    el.appendChild(actions);
    hljs.highlightAllUnder(el);
  } else { el.textContent = content; }
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
  return el;
}

function formatAIContent(text) {
  // Code blocks
  text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code class="language-${lang || 'plaintext'}">${escapeHtml(code.trim())}</code></pre>`;
  });
  // Inline code
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Bold
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Paragraphs
  text = text.split('\n\n').map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
  return text;
}

function escapeHtml(text) {
  return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showTyping() {
  const container = document.getElementById('aiMessages');
  const el = document.createElement('div');
  el.className = 'ai-typing';
  el.id = 'aiTyping';
  el.innerHTML = '<div class="ai-typing-dots"><span></span><span></span><span></span></div>';
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
  return el;
}

function getEditorContext() {
  if (!monacoReady || !state.activeTab) return '';
  const useSelection = document.getElementById('aiContextSelection')?.checked;
  if (useSelection) {
    const sel = state.monacoEditor.getSelection();
    const model = state.monacoEditor.getModel();
    if (model && !sel.isEmpty()) return model.getValueInRange(sel);
  }
  const useFile = document.getElementById('aiContextFile')?.checked;
  if (useFile && state.activeTab) {
    const model = state.monacoModels[state.activeTab];
    if (model) {
      const code = model.getValue();
      return code.length > 8000 ? code.slice(0, 8000) + '\n...[truncated]' : code;
    }
  }
  return '';
}

async function callAI(userMessage, systemMsg) {
  const model = document.getElementById('aiModelRight')?.value || 'claude';
  state.aiHistory.push({ role: 'user', content: userMessage });
  const typing = showTyping();

  try {
    let reply = '';
    if (model === 'claude') {
      // Use Anthropic API (via artifact proxy)
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1000,
          system: systemMsg || 'You are Apex IDE\'s built-in AI assistant. You are an expert programmer in all languages. Help the user with their code. Be concise but thorough.',
          messages: state.aiHistory.slice(-10),
        })
      });
      const data = await response.json();
      reply = data.content?.[0]?.text || data.error?.message || 'No response.';
    } else {
      // GLM-4 style (simulated with thoughtful response)
      reply = await simulateGLM(userMessage, systemMsg);
    }
    typing.remove();
    state.aiHistory.push({ role: 'assistant', content: reply });
    appendAIMessage('ai', reply);
  } catch (e) {
    typing.remove();
    const err = `Error: ${e.message}. Please check your connection.`;
    appendAIMessage('ai', err);
  }
}

async function simulateGLM(msg, sys) {
  // Thoughtful GLM-4 simulation
  await sleep(800 + Math.random() * 400);
  const ctx = getEditorContext();
  const lang = state.activeTab ? getLang(state.activeTab) : '';
  if (msg.toLowerCase().includes('explain')) return `**Code Explanation**\n\nThis ${lang} code:\n\`\`\`${lang}\n${ctx.slice(0,300)}\n\`\`\`\n\nThis code appears to be performing operations typical of ${lang} development. The structure follows standard conventions.`;
  if (msg.toLowerCase().includes('fix') || msg.toLowerCase().includes('bug') || msg.toLowerCase().includes('error')) return `**Fix Suggestion**\n\nI've analyzed the code and found potential issues:\n\n1. Check for proper error handling\n2. Ensure variables are declared before use\n3. Verify logic flow\n\nHere's a corrected version:\n\`\`\`${lang}\n// Fixed code would go here\n// Please use Claude model for real fixes\n\`\`\``;
  if (msg.toLowerCase().includes('test')) return `**Test Suite**\n\n\`\`\`javascript\ndescribe('${state.activeTab || 'module'}', () => {\n  test('should work correctly', () => {\n    // Add your test assertions here\n    expect(true).toBe(true);\n  });\n});\n\`\`\``;
  return `I'm the GLM-4 assistant mode. For best results, switch to **Claude Sonnet** in the model selector above.\n\nYour question: "${msg}"\n\nI can help with: code explanation, refactoring, debugging, documentation, and more. Please select Claude for full AI capabilities.`;
}

async function sendAI() {
  const input = document.getElementById('aiInput');
  const msg = input.value.trim();
  if (!msg) return;
  input.value = '';
  if (!state.aiVisible) toggleAIPanel();
  appendAIMessage('user', msg);
  const ctx = getEditorContext();
  const fullMsg = ctx ? `File: ${state.activeTab}\n\n\`\`\`${getLang(state.activeTab || '')}\n${ctx}\n\`\`\`\n\n${msg}` : msg;
  await callAI(fullMsg);
}

async function sendAIMessage() {
  const input = document.getElementById('aiInputMini');
  const msg = input.value.trim();
  if (!msg) return;
  input.value = '';
  document.querySelector('[data-panel="ai"]')?.click();
  appendAIMessage('user', msg);
  await callAI(msg);
}

async function explainCode() {
  if (!state.aiVisible) toggleAIPanel();
  const ctx = getEditorContext();
  if (!ctx) { toast('No code to explain', 'warning'); return; }
  appendAIMessage('user', `Explain this ${getLang(state.activeTab || '')} code:\n\`\`\`\n${ctx.slice(0,3000)}\n\`\`\``);
  await callAI(`Explain this code step by step:\n\`\`\`${getLang(state.activeTab||'')}\n${ctx.slice(0,3000)}\n\`\`\``, 'You are an expert code explainer. Break down code clearly and concisely.');
}

async function fixCode() {
  if (!state.aiVisible) toggleAIPanel();
  const ctx = getEditorContext();
  if (!ctx) { toast('No code selected', 'warning'); return; }
  appendAIMessage('user', `Fix bugs in this code:\n\`\`\`\n${ctx.slice(0,3000)}\n\`\`\``);
  await callAI(`Find and fix all bugs in this ${getLang(state.activeTab||'')} code. Return the fixed code:\n\`\`\`${getLang(state.activeTab||'')}\n${ctx.slice(0,3000)}\n\`\`\``, 'You are an expert debugger. Return fixed, working code.');
}

async function refactorCode() {
  if (!state.aiVisible) toggleAIPanel();
  const ctx = getEditorContext();
  if (!ctx) { toast('No code to refactor', 'warning'); return; }
  appendAIMessage('user', `Refactor this code for better readability and performance.`);
  await callAI(`Refactor this ${getLang(state.activeTab||'')} code for better readability, maintainability, and performance:\n\`\`\`${getLang(state.activeTab||'')}\n${ctx.slice(0,3000)}\n\`\`\``, 'You are a code quality expert. Refactor cleanly and explain improvements.');
}

async function generateTests() {
  if (!state.aiVisible) toggleAIPanel();
  const ctx = getEditorContext();
  if (!ctx) { toast('No code selected', 'warning'); return; }
  appendAIMessage('user', `Generate comprehensive tests for this code.`);
  await callAI(`Generate a comprehensive test suite for this ${getLang(state.activeTab||'')} code:\n\`\`\`${getLang(state.activeTab||'')}\n${ctx.slice(0,3000)}\n\`\`\``, 'You are a testing expert. Write thorough unit tests with edge cases.');
}

async function addComments() {
  if (!state.aiVisible) toggleAIPanel();
  const ctx = getEditorContext();
  if (!ctx) { toast('No code selected', 'warning'); return; }
  appendAIMessage('user', `Add documentation comments to this code.`);
  await callAI(`Add JSDoc/docstring comments to every function and complex block in this ${getLang(state.activeTab||'')} code:\n\`\`\`${getLang(state.activeTab||'')}\n${ctx.slice(0,3000)}\n\`\`\``, 'You are a documentation expert. Add clear, helpful comments.');
}

async function optimizeCode() {
  if (!state.aiVisible) toggleAIPanel();
  const ctx = getEditorContext();
  if (!ctx) { toast('No code selected', 'warning'); return; }
  appendAIMessage('user', `Optimize this code for performance.`);
  await callAI(`Optimize this ${getLang(state.activeTab||'')} code for maximum performance:\n\`\`\`${getLang(state.activeTab||'')}\n${ctx.slice(0,3000)}\n\`\`\``, 'You are a performance optimization expert. Explain each optimization.');
}

function insertIntoEditor(encoded) {
  if (!monacoReady) return;
  const text = decodeURIComponent(encoded);
  // Extract code blocks
  const match = text.match(/```[\w]*\n([\s\S]+?)```/);
  const toInsert = match ? match[1] : text;
  const model = state.monacoEditor.getModel();
  if (!model) return;
  const pos = state.monacoEditor.getPosition();
  const op = { range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column), text: toInsert, forceMoveMarkers: true };
  model.pushEditOperations([], [op], () => null);
  toast('Code inserted into editor', 'success');
}

function copyToClipboard(encoded) {
  navigator.clipboard.writeText(decodeURIComponent(encoded)).then(() => toast('Copied to clipboard', 'success'));
}

function attachFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.onchange = e => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = ev => {
      const aiInput = document.getElementById('aiInput');
      aiInput.value = (aiInput.value ? aiInput.value + '\n\n' : '') + `File: ${f.name}\n\`\`\`\n${ev.target.result.slice(0,4000)}\n\`\`\``;
    };
    r.readAsText(f);
  };
  input.click();
}

// ===== CONTEXT MENU =====
function showContextMenu(e, path) {
  e.preventDefault();
  const menu = document.getElementById('contextMenu');
  menu.style.left = Math.min(e.clientX, window.innerWidth - 180) + 'px';
  menu.style.top = Math.min(e.clientY, window.innerHeight - 200) + 'px';
  menu.classList.remove('hidden');
  menu.dataset.path = path;
}

document.getElementById('contextMenu').addEventListener('click', e => {
  const item = e.target.closest('.cm-item');
  if (!item) return;
  const path = document.getElementById('contextMenu').dataset.path;
  const action = item.dataset.action;
  if (action === 'delete') {
    if (confirm(`Delete ${path}?`)) { delete state.files[path]; closeTab(path); refreshFileTree(); toast(`Deleted ${path.split('/').pop()}`, 'success'); }
  } else if (action === 'rename') {
    const newName = prompt('New name:', path.split('/').pop());
    if (newName && newName !== path.split('/').pop()) {
      const prefix = path.includes('/') ? path.split('/').slice(0,-1).join('/') + '/' : '';
      const newPath = prefix + newName;
      state.files[newPath] = state.files[path];
      delete state.files[path];
      const tabIdx = state.openTabs.findIndex(t => t.path === path);
      if (tabIdx >= 0) { state.openTabs[tabIdx] = { path: newPath, name: newName, icon: getIcon(newName) }; if (state.activeTab === path) state.activeTab = newPath; }
      refreshFileTree(); updateTabs(); toast(`Renamed to ${newName}`, 'success');
    }
  } else if (action === 'copy') {
    navigator.clipboard.writeText(path).then(() => toast('Path copied', 'success'));
  } else if (action === 'newFile') { newFile(); }
  else if (action === 'newFolder') { newFolder(); }
  document.getElementById('contextMenu').classList.add('hidden');
});

document.addEventListener('click', () => document.getElementById('contextMenu').classList.add('hidden'));

// ===== COMMAND PALETTE =====
const COMMANDS = [
  { label: 'New File', key: 'Ctrl+N', action: () => newFile(), icon: '+', group: 'File' },
  { label: 'Open Folder', key: 'Ctrl+O', action: () => openFolder(), icon: '📂', group: 'File' },
  { label: 'Save File', key: 'Ctrl+S', action: () => saveCurrentFile(), icon: '💾', group: 'File' },
  { label: 'Close Tab', key: 'Ctrl+W', action: () => state.activeTab && closeTab(state.activeTab), icon: '✕', group: 'File' },
  { label: 'New Project', key: '', action: () => newProject(), icon: '🚀', group: 'File' },
  { label: 'Toggle AI Panel', key: 'Ctrl+Shift+A', action: () => toggleAIPanel(), icon: '✦', group: 'View' },
  { label: 'Toggle Terminal', key: 'Ctrl+`', action: () => toggleBottomPanel(), icon: '⚡', group: 'View' },
  { label: 'Toggle Sidebar', key: 'Ctrl+B', action: () => toggleSidebar(), icon: '◨', group: 'View' },
  { label: 'Settings', key: 'Ctrl+,', action: () => openSettings(), icon: '⚙', group: 'Preferences' },
  { label: 'Keyboard Shortcuts', key: 'Ctrl+Shift+K', action: () => openKeyboard(), icon: '⌨', group: 'Preferences' },
  { label: 'Color Theme', key: '', action: () => openThemes(), icon: '🎨', group: 'Preferences' },
  { label: 'Explain Code (AI)', key: '', action: () => explainCode(), icon: '✦', group: 'AI' },
  { label: 'Fix Code (AI)', key: '', action: () => fixCode(), icon: '✦', group: 'AI' },
  { label: 'Refactor Code (AI)', key: '', action: () => refactorCode(), icon: '✦', group: 'AI' },
  { label: 'Generate Tests (AI)', key: '', action: () => generateTests(), icon: '✦', group: 'AI' },
  { label: 'Add Comments (AI)', key: '', action: () => addComments(), icon: '✦', group: 'AI' },
  { label: 'Optimize Code (AI)', key: '', action: () => optimizeCode(), icon: '✦', group: 'AI' },
  { label: 'New Terminal', key: 'Ctrl+Shift+`', action: () => addTerminal(), icon: '⚡', group: 'Terminal' },
  { label: 'Format Document', key: 'Shift+Alt+F', action: () => monacoReady && state.monacoEditor.getAction('editor.action.formatDocument')?.run(), icon: '⊞', group: 'Editor' },
  { label: 'Toggle Word Wrap', key: 'Alt+Z', action: () => { const o = state.settings.wordWrap === 'off' ? 'on' : 'off'; state.settings.wordWrap = o; if (monacoReady) state.monacoEditor.updateOptions({ wordWrap: o }); }, icon: '⤵', group: 'Editor' },
  { label: 'Increase Font Size', key: 'Ctrl++', action: () => changeFontSize(2), icon: 'A+', group: 'Editor' },
  { label: 'Decrease Font Size', key: 'Ctrl+-', action: () => changeFontSize(-2), icon: 'A-', group: 'Editor' },
  { label: 'Go to Line', key: 'Ctrl+G', action: () => monacoReady && state.monacoEditor.getAction('editor.action.gotoLine')?.run(), icon: '→', group: 'Go' },
  { label: 'Find', key: 'Ctrl+F', action: () => monacoReady && state.monacoEditor.getAction('actions.find')?.run(), icon: '🔍', group: 'Go' },
  { label: 'Go to Symbol', key: 'Ctrl+Shift+O', action: () => monacoReady && state.monacoEditor.getAction('editor.action.quickOutline')?.run(), icon: '◉', group: 'Go' },
];

let cpFocusIdx = 0;
function openCommandPalette() {
  document.getElementById('commandPalette').classList.remove('hidden');
  const input = document.getElementById('cpInput');
  input.value = '';
  input.focus();
  renderCPResults('');
}

function renderCPResults(query) {
  const results = document.getElementById('cpResults');
  results.innerHTML = '';
  cpFocusIdx = 0;
  let filtered = COMMANDS;
  if (query) filtered = COMMANDS.filter(c => c.label.toLowerCase().includes(query.toLowerCase()) || c.group.toLowerCase().includes(query.toLowerCase()));
  // Group
  const groups = {};
  filtered.forEach(c => { if (!groups[c.group]) groups[c.group] = []; groups[c.group].push(c); });
  Object.entries(groups).forEach(([group, cmds]) => {
    const groupEl = document.createElement('div');
    groupEl.className = 'cp-group'; groupEl.textContent = group;
    results.appendChild(groupEl);
    cmds.forEach(c => {
      const el = document.createElement('div');
      el.className = 'cp-item';
      el.innerHTML = `<div class="cp-item-left"><span class="cp-item-icon">${c.icon}</span><span class="cp-item-label">${c.label}</span></div>${c.key ? `<span class="cp-item-key">${c.key}</span>` : ''}`;
      el.addEventListener('click', () => { document.getElementById('commandPalette').classList.add('hidden'); c.action(); });
      results.appendChild(el);
    });
  });
  // Also show file results
  if (query) {
    const fileMatches = Object.keys(state.files).filter(p => p.toLowerCase().includes(query.toLowerCase())).slice(0, 5);
    if (fileMatches.length > 0) {
      const gEl = document.createElement('div'); gEl.className = 'cp-group'; gEl.textContent = 'Files'; results.appendChild(gEl);
      fileMatches.forEach(p => {
        const el = document.createElement('div'); el.className = 'cp-item';
        el.innerHTML = `<div class="cp-item-left"><span class="cp-item-icon">${getIcon(p)}</span><span class="cp-item-label">${p}</span></div>`;
        el.addEventListener('click', () => { document.getElementById('commandPalette').classList.add('hidden'); openTab(p); });
        results.appendChild(el);
      });
    }
  }
}

document.getElementById('cpInput').addEventListener('input', e => renderCPResults(e.target.value));
document.getElementById('cpInput').addEventListener('keydown', e => {
  if (e.key === 'Escape') { document.getElementById('commandPalette').classList.add('hidden'); if (monacoReady) state.monacoEditor.focus(); }
  const items = document.querySelectorAll('.cp-item');
  if (e.key === 'ArrowDown') { e.preventDefault(); cpFocusIdx = Math.min(cpFocusIdx + 1, items.length - 1); items.forEach((el,i) => el.classList.toggle('focused', i === cpFocusIdx)); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); cpFocusIdx = Math.max(cpFocusIdx - 1, 0); items.forEach((el,i) => el.classList.toggle('focused', i === cpFocusIdx)); }
  else if (e.key === 'Enter') { items[cpFocusIdx]?.click(); }
});
document.querySelector('.cp-overlay').addEventListener('click', () => document.getElementById('commandPalette').classList.add('hidden'));

// ===== SETTINGS =====
function openSettings() { document.getElementById('settingsModal').classList.remove('hidden'); renderSettings('editor'); }
function closeSettings() { document.getElementById('settingsModal').classList.add('hidden'); saveSettings(); }
document.querySelectorAll('.sn-item').forEach(el => {
  el.addEventListener('click', () => {
    document.querySelectorAll('.sn-item').forEach(e => e.classList.remove('active'));
    el.classList.add('active');
    renderSettings(el.dataset.stab);
  });
});
function renderSettings(tab) {
  const main = document.getElementById('settingsMain');
  const s = state.settings;
  const settingTabs = {
    editor: `
      <div class="setting-group">
        <div class="setting-group-title">Editor</div>
        ${settingRow('Font Size', '', `<input type="number" value="${s.fontSize}" min="10" max="32" onchange="updateSetting('fontSize', +this.value); monacoReady && state.monacoEditor.updateOptions({fontSize: +this.value})">`)}
        ${settingRow('Font Ligatures', '', `<div class="setting-toggle on" onclick="toggleSetting(this, 'fontLigatures')"></div>`)}
        ${settingRow('Tab Size', '', `<input type="number" value="${s.tabSize}" min="1" max="8" onchange="updateSetting('tabSize', +this.value)">`)}
        ${settingRow('Word Wrap', '', `<select onchange="updateSetting('wordWrap',this.value); monacoReady && state.monacoEditor.updateOptions({wordWrap:this.value})"><option ${s.wordWrap==='off'?'selected':''}>off</option><option ${s.wordWrap==='on'?'selected':''}>on</option><option ${s.wordWrap==='wordWrapColumn'?'selected':''}>wordWrapColumn</option></select>`)}
        ${settingRow('Minimap', '', `<div class="setting-toggle ${s.minimap?'on':''}" onclick="toggleSetting(this,'minimap'); monacoReady&&state.monacoEditor.updateOptions({minimap:{enabled:state.settings.minimap}})"></div>`)}
        ${settingRow('Line Numbers', '', `<select onchange="updateSetting('lineNumbers',this.value); monacoReady&&state.monacoEditor.updateOptions({lineNumbers:this.value})"><option ${s.lineNumbers==='on'?'selected':''}>on</option><option ${s.lineNumbers==='off'?'selected':''}>off</option><option ${s.lineNumbers==='relative'?'selected':''}>relative</option></select>`)}
        ${settingRow('Format on Save', '', `<div class="setting-toggle ${s.formatOnSave?'on':''}" onclick="toggleSetting(this,'formatOnSave')"></div>`)}
        ${settingRow('Auto Save', '', `<div class="setting-toggle ${s.autoSave?'on':''}" onclick="toggleSetting(this,'autoSave')"></div>`)}
        ${settingRow('Bracket Pairs', '', `<div class="setting-toggle ${s.bracketPairs?'on':''}" onclick="toggleSetting(this,'bracketPairs')"></div>`)}
        ${settingRow('Sticky Scroll', '', `<div class="setting-toggle ${s.stickyScroll?'on':''}" onclick="toggleSetting(this,'stickyScroll'); monacoReady&&state.monacoEditor.updateOptions({stickyScroll:{enabled:state.settings.stickyScroll}})"></div>`)}
        ${settingRow('Cursor Style', '', `<select onchange="updateSetting('cursorStyle',this.value); monacoReady&&state.monacoEditor.updateOptions({cursorStyle:this.value})"><option>line</option><option>block</option><option>underline</option></select>`)}
        ${settingRow('Cursor Blinking', '', `<select onchange="updateSetting('cursorBlinking',this.value); monacoReady&&state.monacoEditor.updateOptions({cursorBlinking:this.value})"><option>smooth</option><option>blink</option><option>solid</option><option>expand</option></select>`)}
      </div>`,
    theme: `
      <div class="setting-group">
        <div class="setting-group-title">Color Theme</div>
        ${['apex-dark','apex-light','apex-monokai','apex-nord'].map(t => `
          <div class="setting-row" style="cursor:pointer" onclick="applyTheme('${t}')">
            <div><div class="setting-label">${t}</div></div>
            <div class="setting-control">${s.theme===t?'✓':''}</div>
          </div>`).join('')}
      </div>
      <div class="setting-group">
        <div class="setting-group-title">Layout</div>
        ${settingRow('Sidebar Position', '', `<select><option>Left</option><option>Right</option></select>`)}
        ${settingRow('Activity Bar Position', '', `<select><option>Left</option><option>Top</option></select>`)}
      </div>`,
    terminal: `
      <div class="setting-group">
        <div class="setting-group-title">Terminal</div>
        ${settingRow('Font Size', '', `<input type="number" value="${s.termFontSize}" min="10" max="24" onchange="updateSetting('termFontSize',+this.value)">`)}
        ${settingRow('Shell', '', `<select><option>bash</option><option>zsh</option><option>fish</option><option>powershell</option></select>`)}
        ${settingRow('Scrollback Lines', '', `<input type="number" value="10000" min="1000" max="100000">`)}
      </div>`,
    ai: `
      <div class="setting-group">
        <div class="setting-group-title">AI Configuration</div>
        ${settingRow('Default Model', '', `<select onchange="updateSetting('aiModel',this.value)"><option value="claude">Claude Sonnet</option><option value="glm">GLM-4</option></select>`)}
        ${settingRow('Inline Completions', '', `<div class="setting-toggle on" onclick="toggleSetting(this,'aiInline')"></div>`)}
        ${settingRow('Auto-explain errors', '', `<div class="setting-toggle on" onclick="toggleSetting(this,'aiAutoExplain')"></div>`)}
        ${settingRow('Code lens', '', `<div class="setting-toggle on" onclick="toggleSetting(this,'aiCodeLens')"></div>`)}
      </div>`,
    keybindings: `
      <div class="setting-group">
        <div class="setting-group-title">Keyboard Shortcuts</div>
        ${COMMANDS.filter(c => c.key).map(c => settingRow(c.label, '', `<kbd style="background:var(--bg-4);padding:2px 6px;border-radius:3px;font-family:var(--font-code);font-size:11px;color:var(--text-2)">${c.key}</kbd>`)).join('')}
      </div>`,
    extensions: `
      <div class="setting-group">
        <div class="setting-group-title">Installed Extensions</div>
        ${state.extensions.length === 0 ? '<p style="color:var(--text-3);font-size:13px">No extensions installed. Browse the Extensions panel.</p>' : state.extensions.map(e => `<div class="setting-row"><div class="setting-label">${e.name}</div><button onclick="uninstallExt('${e.id}')">Uninstall</button></div>`).join('')}
      </div>`,
  };
  main.innerHTML = settingTabs[tab] || '';
}
function settingRow(label, desc, control) {
  return `<div class="setting-row"><div><div class="setting-label">${label}</div>${desc?`<div class="setting-desc">${desc}</div>`:''}</div><div class="setting-control">${control}</div></div>`;
}
function updateSetting(key, value) { state.settings[key] = value; saveSettings(); }
function toggleSetting(el, key) { el.classList.toggle('on'); state.settings[key] = el.classList.contains('on'); saveSettings(); }
function applyTheme(theme) { state.settings.theme = theme; if (monacoReady) monaco.editor.setTheme(theme); saveSettings(); renderSettings('theme'); toast(`Theme: ${theme}`, 'success'); }
function changeFontSize(delta) { state.settings.fontSize = Math.max(10, Math.min(32, state.settings.fontSize + delta)); if (monacoReady) state.monacoEditor.updateOptions({ fontSize: state.settings.fontSize }); saveSettings(); }

// ===== KEYBOARD SHORTCUTS MODAL =====
function openKeyboard() {
  const modal = document.getElementById('shortcutsModal');
  const content = document.getElementById('shortcutsContent');
  content.innerHTML = `<h2>⌨ Keyboard Shortcuts</h2><div class="shortcut-list">${COMMANDS.filter(c=>c.key).map(c=>`<div class="shortcut-item"><span class="shortcut-label">${c.label}</span><span class="shortcut-key">${c.key}</span></div>`).join('')}</div>`;
  modal.classList.remove('hidden');
}
function closeShortcuts() { document.getElementById('shortcutsModal').classList.add('hidden'); }

// ===== PANEL TOGGLES =====
function toggleSidebar() {
  state.sidebarVisible = !state.sidebarVisible;
  document.getElementById('sidebar').style.display = state.sidebarVisible ? '' : 'none';
  document.getElementById('sidebarResizer').style.display = state.sidebarVisible ? '' : 'none';
}

function toggleBottomPanel() {
  state.bottomVisible = !state.bottomVisible;
  const bp = document.getElementById('bottomPanel');
  const br = document.getElementById('bottomResizer');
  bp.style.display = state.bottomVisible ? '' : 'none';
  br.style.display = state.bottomVisible ? '' : 'none';
  if (state.bottomVisible) { state.terminals.forEach(t => { try { t?.fitAddon.fit(); } catch {} }); }
}

function switchBottomTab(tab) {
  document.querySelectorAll('.bt-tab').forEach(el => el.classList.toggle('active', el.dataset.btab === tab));
  document.querySelectorAll('.btab-panel').forEach(el => el.classList.toggle('active', el.id === `btab-${tab}`));
  if (tab === 'terminal') { state.terminals.forEach(t => { try { t?.fitAddon.fit(); } catch {} }); }
}

// ===== ACTIVITY BAR / PANELS =====
document.querySelectorAll('.ab-btn[data-panel]').forEach(btn => {
  btn.addEventListener('click', () => {
    const panel = btn.dataset.panel;
    const current = btn.classList.contains('active');
    document.querySelectorAll('.ab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    if (!current) {
      btn.classList.add('active');
      const p = document.getElementById(`panel-${panel}`);
      if (p) { p.classList.add('active'); if (!state.sidebarVisible) toggleSidebar(); }
    } else { if (state.sidebarVisible) toggleSidebar(); }
  });
});

// ===== MENU BAR =====
document.querySelectorAll('.menu-item').forEach(item => {
  item.addEventListener('click', () => {
    const menu = item.dataset.menu;
    const actions = {
      file: () => openCommandPalette(),
      edit: () => monacoReady && state.monacoEditor.getAction('actions.find')?.run(),
      view: () => openCommandPalette(),
      go: () => monacoReady && state.monacoEditor.getAction('editor.action.gotoLine')?.run(),
      run: () => startDebug(),
      terminal: () => { switchBottomTab('terminal'); if (!state.bottomVisible) toggleBottomPanel(); },
      help: () => openKeyboard(),
    };
    actions[menu]?.();
  });
});

// ===== RESIZERS =====
function initResizers() {
  makeResizable(document.getElementById('sidebarResizer'), 'horizontal', '#sidebar', 160, 500);
  makeResizable(document.getElementById('bottomResizer'), 'vertical', '#bottomPanel', 80, 500, true);
  makeResizable(document.getElementById('aiResizer'), 'horizontal', '#aiPanelRight', 260, 700, false, true);
}

function makeResizable(handle, dir, targetSel, min, max, inverted = false, invertedH = false) {
  if (!handle) return;
  let startX, startY, startSize;
  handle.addEventListener('mousedown', e => {
    e.preventDefault();
    startX = e.clientX; startY = e.clientY;
    const target = document.querySelector(targetSel);
    startSize = dir === 'horizontal' ? target.offsetWidth : target.offsetHeight;
    handle.classList.add('dragging');
    const onMove = ev => {
      const target = document.querySelector(targetSel);
      if (dir === 'horizontal') {
        const delta = invertedH ? startX - ev.clientX : ev.clientX - startX;
        target.style.width = Math.max(min, Math.min(max, startSize + delta)) + 'px';
      } else {
        const delta = inverted ? startY - ev.clientY : ev.clientY - startY;
        target.style.height = Math.max(min, Math.min(max, startSize + delta)) + 'px';
        state.terminals.forEach(t => { try { t?.fitAddon.fit(); } catch {} });
      }
    };
    const onUp = () => { handle.classList.remove('dragging'); document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

// ===== DEBUG =====
function startDebug() { toast('Debug session started (simulated)', 'info'); logOutput('Starting debug session...', 'info'); }
function evalDebug(e) {
  if (e.key !== 'Enter') return;
  const input = document.getElementById('debugInput');
  const expr = input.value.trim();
  if (!expr) return;
  input.value = '';
  const console_ = document.getElementById('debugConsole');
  const line = document.createElement('div');
  line.className = 'log-line';
  line.textContent = '> ' + expr;
  console_.appendChild(line);
  try {
    const result = new Function(`"use strict"; return (${expr})`)();
    const out = document.createElement('div');
    out.className = 'log-line success';
    out.textContent = '← ' + JSON.stringify(result, null, 2);
    console_.appendChild(out);
  } catch(err) {
    const out = document.createElement('div');
    out.className = 'log-line error';
    out.textContent = '✕ ' + err.message;
    console_.appendChild(out);
  }
  console_.scrollTop = console_.scrollHeight;
}

function logOutput(msg, type = '') {
  const out = document.getElementById('outputContent');
  const el = document.createElement('div');
  el.className = 'log-line ' + type;
  el.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  out.appendChild(el);
  out.scrollTop = out.scrollHeight;
}

// ===== GIT =====
function gitCommit() { const msg = document.getElementById('commitMsg').value.trim(); if (!msg) { toast('Commit message required', 'warning'); return; } logOutput(`Git: committed "${msg}"`, 'success'); document.getElementById('commitMsg').value = ''; toast(`Committed: ${msg}`, 'success'); }
function gitPush() { logOutput('Git: push origin main', 'info'); toast('Pushed to origin (simulated)', 'success'); }
function gitPull() { logOutput('Git: pull origin main', 'info'); toast('Pulled from origin (simulated)', 'success'); }

// ===== EXTENSIONS =====
const BUILTIN_EXTENSIONS = [
  { id: 'prettier', name: 'Prettier', desc: 'Code formatter for JS, TS, CSS, HTML, JSON', stars: '⭐ 4.9', installed: false },
  { id: 'eslint', name: 'ESLint', desc: 'JavaScript and TypeScript linter', stars: '⭐ 4.8', installed: false },
  { id: 'git-lens', name: 'GitLens', desc: 'Git supercharged — blame, history, and more', stars: '⭐ 4.9', installed: false },
  { id: 'docker', name: 'Docker', desc: 'Docker file syntax highlighting and tools', stars: '⭐ 4.7', installed: false },
  { id: 'tailwind', name: 'Tailwind CSS', desc: 'Tailwind CSS IntelliSense', stars: '⭐ 4.9', installed: false },
  { id: 'path-intellisense', name: 'Path IntelliSense', desc: 'Autocompletes filenames in imports', stars: '⭐ 4.8', installed: false },
  { id: 'bracket-colorizer', name: 'Rainbow Brackets', desc: 'Colorize matching brackets', stars: '⭐ 4.7', installed: true },
  { id: 'auto-rename', name: 'Auto Rename Tag', desc: 'Auto rename paired HTML/XML tags', stars: '⭐ 4.8', installed: false },
  { id: 'live-server', name: 'Live Preview', desc: 'Live server for static files', stars: '⭐ 4.7', installed: false },
  { id: 'indent-rainbow', name: 'Indent Rainbow', desc: 'Colorize indentation', stars: '⭐ 4.6', installed: false },
  { id: 'code-spell', name: 'Code Spell Checker', desc: 'Spell checker for code', stars: '⭐ 4.7', installed: false },
  { id: 'todo-tree', name: 'Todo Tree', desc: 'Show TODO/FIXME/HACK in a tree', stars: '⭐ 4.6', installed: false },
];
function renderExtensions(query = '') {
  const list = document.getElementById('extList');
  const filtered = BUILTIN_EXTENSIONS.filter(e => !query || e.name.toLowerCase().includes(query.toLowerCase()) || e.desc.toLowerCase().includes(query.toLowerCase()));
  list.innerHTML = filtered.map(e => `
    <div class="ext-item">
      <div class="ext-name">${e.name}</div>
      <div class="ext-desc">${e.desc}</div>
      <div class="ext-meta">
        <span class="ext-stars">${e.stars}</span>
        <button class="ext-install-btn ${e.installed?'installed':''}" onclick="toggleExtension('${e.id}', this)">${e.installed?'Installed':'Install'}</button>
      </div>
    </div>`).join('');
}
function filterExtensions(q) { renderExtensions(q); }
function toggleExtension(id, btn) {
  const ext = BUILTIN_EXTENSIONS.find(e => e.id === id);
  if (!ext) return;
  ext.installed = !ext.installed;
  btn.textContent = ext.installed ? 'Installed' : 'Install';
  btn.classList.toggle('installed', ext.installed);
  toast(ext.installed ? `${ext.name} installed` : `${ext.name} uninstalled`, ext.installed ? 'success' : 'info');
}

// ===== RECENT FILES =====
function addRecentFile(item) {
  state.recentFiles = state.recentFiles.filter(r => r.path !== item.path);
  state.recentFiles.unshift(item);
  saveRecent();
  updateRecentFiles();
}
function updateRecentFiles() {
  const container = document.getElementById('recentFiles');
  if (!container) return;
  container.innerHTML = state.recentFiles.length === 0
    ? '<div style="color:var(--text-3);font-size:12px">No recent files</div>'
    : state.recentFiles.slice(0, 6).map(r => `<div class="recent-item" onclick="openTab('${r.path}')"><span>${getIcon(r.path)}</span><span>${r.name}</span><span style="color:var(--text-3);font-size:11px;margin-left:auto">${r.path}</span></div>`).join('');
}

// ===== PWA INSTALL =====
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  state.deferredInstall = e;
  document.getElementById('btnInstall').style.display = '';
});
document.getElementById('btnInstall').addEventListener('click', () => {
  if (!state.deferredInstall) return;
  state.deferredInstall.prompt();
  state.deferredInstall.userChoice.then(choice => {
    if (choice.outcome === 'accepted') toast('Apex IDE installed!', 'success');
    state.deferredInstall = null;
    document.getElementById('btnInstall').style.display = 'none';
  });
});

// ===== WINDOW CONTROLS =====
function minimizeApp() { toast('Minimize (use browser controls)', 'info'); }
function maximizeApp() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
  else document.exitFullscreen();
}
function closeApp() { if (confirm('Close Apex IDE?')) window.close(); }
function openThemes() { openSettings(); setTimeout(() => { document.querySelector('[data-stab="theme"]')?.click(); }, 100); }
function openDocs() { window.open('https://github.com/', '_blank'); }
function syncSettings() { toast('Settings synced', 'success'); }
function exportSettings() {
  const blob = new Blob([JSON.stringify(state.settings, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'apex-settings.json'; a.click();
}
function importSettings() {
  const input = document.createElement('input'); input.type = 'file'; input.accept = '.json';
  input.onchange = e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = ev => { try { state.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(ev.target.result) }; saveSettings(); toast('Settings imported', 'success'); } catch { toast('Invalid settings file', 'error'); } }; r.readAsText(f); };
  input.click();
}
function collapseAll() { document.querySelectorAll('.tree-chevron.open').forEach(el => el.click()); }

// ===== GLOBAL KEYBOARD SHORTCUTS =====
document.addEventListener('keydown', e => {
  const k = e;
  if ((k.ctrlKey || k.metaKey) && k.key === 'p') { e.preventDefault(); openCommandPalette(); return; }
  if (k.key === 'F1') { e.preventDefault(); openCommandPalette(); return; }
  if ((k.ctrlKey || k.metaKey) && k.key === 's') { e.preventDefault(); saveCurrentFile(); return; }
  if ((k.ctrlKey || k.metaKey) && k.shiftKey && k.key === 'A') { e.preventDefault(); toggleAIPanel(); return; }
  if ((k.ctrlKey || k.metaKey) && k.key === 'b') { e.preventDefault(); toggleSidebar(); return; }
  if ((k.ctrlKey || k.metaKey) && k.key === '`') { e.preventDefault(); if (!state.bottomVisible) toggleBottomPanel(); switchBottomTab('terminal'); addTerminal(); return; }
  if ((k.ctrlKey || k.metaKey) && k.key === ',') { e.preventDefault(); openSettings(); return; }
  if ((k.ctrlKey || k.metaKey) && k.shiftKey && k.key === 'K') { e.preventDefault(); openKeyboard(); return; }
  if ((k.ctrlKey || k.metaKey) && k.key === 'n') { e.preventDefault(); newFile(); return; }
  if ((k.ctrlKey || k.metaKey) && k.key === 'w') { e.preventDefault(); if (state.activeTab) closeTab(state.activeTab); return; }
  if ((k.ctrlKey || k.metaKey) && k.shiftKey && k.key === 'E') { e.preventDefault(); document.querySelector('[data-panel="explorer"]')?.click(); return; }
  if ((k.ctrlKey || k.metaKey) && k.shiftKey && k.key === 'F') { e.preventDefault(); document.querySelector('[data-panel="search"]')?.click(); return; }
  if (k.key === 'Escape') { document.getElementById('commandPalette').classList.add('hidden'); document.getElementById('settingsModal').classList.add('hidden'); document.getElementById('shortcutsModal').classList.add('hidden'); }
  // AI input: Ctrl+Enter to send
  if ((k.ctrlKey || k.metaKey) && k.key === 'Enter') {
    const aiInput = document.getElementById('aiInput');
    if (document.activeElement === aiInput) { e.preventDefault(); sendAI(); return; }
  }
});

// AI input enter handling
document.getElementById('aiInput').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) { e.preventDefault(); sendAI(); }
});
document.getElementById('aiInputMini').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAIMessage(); }
});
document.getElementById('btnToggleAI').addEventListener('click', toggleAIPanel);
document.getElementById('btnSettings').addEventListener('click', openSettings);

// ===== MAIN INIT =====
async function init() {
  loadSettings();
  loadRecent();
  renderExtensions();
  updateRecentFiles();

  // Start splash and parallel init
  const [,] = await Promise.all([
    runSplash(),
    initMonaco(),
  ]);

  initTerminal();
  initResizers();

  // Welcome message in AI
  appendAIMessage('system', '✦ Apex IDE AI is ready. Select code and click Explain, Fix, Refactor, or type any question below.');
  appendAIMessage('ai', 'Hello! I\'m your Apex IDE AI assistant. I can help you:\n\n- **Explain** complex code\n- **Fix** bugs and errors\n- **Refactor** for better quality\n- **Generate** tests and docs\n- **Optimize** performance\n\nJust open a file and ask anything!');

  // Status bar clock
  setInterval(() => {
    const now = new Date();
    document.getElementById('sbAI').title = `AI Ready — ${now.toLocaleTimeString()}`;
  }, 1000);

  toast('Welcome to Apex IDE! Open a folder or create a new file to start.', 'success', 4000);
}

init();
