'use strict';
// ============================================================
//  APEX IDE v3 — app.js
//  Monaco Editor + Ollama AI + Full Terminal + File System
// ============================================================

// ── STATE ────────────────────────────────────────────────────
const S = {
  files: {},        // path -> { content, lang, dirty, handle }
  tabs: [],         // [{path, name, icon}]
  activeTab: null,
  rootName: null,
  dirHandle: null,
  monacoReady: false,
  editor: null,
  models: {},       // monaco models by path
  terminals: [],
  activeTerm: -1,
  aiHistory: [],
  settings: {},
  cpIdx: 0,
  cpItems: [],
  deferredInstall: null,
  ollamaUrl: 'http://localhost:11434',
  ollamaConnected: false,
  ollamaModels: [],   // installed models list from Ollama API
  streamController: null,
};

// ── DEFAULT SETTINGS ─────────────────────────────────────────
const DEF = {
  fontSize: 14,
  tabSize: 2,
  wordWrap: 'off',
  minimap: true,
  lineNumbers: 'on',
  theme: 'apex-dark',
  autoSave: true,
  formatOnSave: false,
  bracketPairs: true,
  fontFamily: "'Cascadia Code','Fira Code','JetBrains Mono',Consolas,'Courier New',monospace",
  termFontSize: 13,
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'qwen3:1.7b',
  renderWhitespace: 'selection',
  cursorBlinking: 'smooth',
  stickyScroll: false,
};

function loadSettings() {
  try { S.settings = { ...DEF, ...JSON.parse(localStorage.getItem('apex-v3-settings') || '{}') }; }
  catch { S.settings = { ...DEF }; }
  S.ollamaUrl = S.settings.ollamaUrl || DEF.ollamaUrl;
}
function saveSettings() { localStorage.setItem('apex-v3-settings', JSON.stringify(S.settings)); }

// ── LANGUAGE DETECTION ───────────────────────────────────────
const LANG_MAP = {
  js:'javascript',mjs:'javascript',cjs:'javascript',jsx:'javascript',
  ts:'typescript',tsx:'typescript',
  html:'html',htm:'html',vue:'html',svelte:'html',astro:'html',
  css:'css',scss:'scss',sass:'scss',less:'less',
  json:'json',jsonc:'json',json5:'json',
  py:'python',pyw:'python',pyi:'python',
  rs:'rust',go:'go',java:'java',kt:'kotlin',kts:'kotlin',
  c:'c',h:'c',cpp:'cpp',cc:'cpp',cxx:'cpp',hpp:'cpp',hxx:'cpp',
  cs:'csharp',php:'php',rb:'ruby',swift:'swift',m:'objective-c',mm:'objective-c',
  sh:'shell',bash:'shell',zsh:'shell',fish:'shell',
  ps1:'powershell',psm1:'powershell',bat:'bat',cmd:'bat',
  sql:'sql',mysql:'sql',pgsql:'pgsql',
  yaml:'yaml',yml:'yaml',toml:'ini',ini:'ini',env:'ini',cfg:'ini',
  md:'markdown',mdx:'markdown',
  xml:'xml',svg:'xml',xsl:'xml',xslt:'xml',
  dockerfile:'dockerfile',
  tf:'hcl',hcl:'hcl',
  graphql:'graphql',gql:'graphql',
  r:'r',R:'r',dart:'dart',lua:'lua',
  ex:'elixir',exs:'elixir',hs:'haskell',erl:'erlang',fs:'fsharp',clj:'clojure',
  tex:'latex',bib:'latex',
  proto:'proto',
};
const ICON_MAP = {
  js:'🟨',mjs:'🟨',ts:'🔷',tsx:'🔷',jsx:'🟧',
  html:'🌐',htm:'🌐',vue:'💚',svelte:'🔥',astro:'🚀',
  css:'🎨',scss:'🎨',less:'🎨',sass:'🎨',
  json:'📋',py:'🐍',rs:'🦀',go:'🐹',java:'☕',kt:'🟣',
  md:'📝',txt:'📄',sh:'⚡',bash:'⚡',ps1:'💙',
  c:'🔵',cpp:'🔵',cs:'🟣',rb:'💎',php:'🐘',swift:'🟠',dart:'💙',lua:'🌙',
  yaml:'⚙',yml:'⚙',toml:'⚙',env:'🔑',ini:'⚙',cfg:'⚙',
  sql:'🗄',dockerfile:'🐳',tf:'🔶',hcl:'🔶',graphql:'🔮',
  xml:'📄',svg:'🖼',r:'📊',
};
function getExt(p) { const s = (p || '').split('.'); return s.length > 1 ? s.pop().toLowerCase() : ''; }
function getLang(p) {
  const name = (p || '').split('/').pop();
  const low = name.toLowerCase();
  if (low === 'dockerfile') return 'dockerfile';
  if (low === 'makefile') return 'makefile';
  if (low === '.gitignore' || low === '.gitattributes') return 'plaintext';
  return LANG_MAP[getExt(name)] || 'plaintext';
}
function getIcon(p) {
  const name = (p || '').split('/').pop();
  const low = name.toLowerCase();
  if (low === 'dockerfile') return '🐳';
  if (low === 'makefile') return '🔧';
  if (low === 'package.json') return '📦';
  if (low === 'readme.md') return '📖';
  if (low === '.gitignore' || low === '.gitattributes') return '🔀';
  if (low === 'tsconfig.json') return '🔷';
  if (low === '.env' || low === '.env.local') return '🔑';
  return ICON_MAP[getExt(name)] || '📄';
}

// ── TOAST ─────────────────────────────────────────────────────
function toast(msg, type = 'info', dur = 3200) {
  const icons = { info: 'ℹ', ok: '✓', err: '✕', warn: '⚠' };
  const el = document.createElement('div');
  el.className = `toast-it ${type === 'ok' ? 'ok' : type === 'err' ? 'err' : type === 'warn' ? 'warn' : ''}`;
  el.innerHTML = `<span>${icons[type] || 'ℹ'}</span><span>${msg}</span>`;
  document.getElementById('toast').appendChild(el);
  setTimeout(() => el.remove(), dur);
}

// ── MONACO ───────────────────────────────────────────────────
function initMonaco() {
  return new Promise(resolve => {
    require(['vs/editor/editor.main'], () => {
      // Custom theme
      monaco.editor.defineTheme('apex-dark', {
        base: 'vs-dark', inherit: true,
        rules: [
          { token: 'comment', foreground: '3d4060', fontStyle: 'italic' },
          { token: 'keyword', foreground: 'c792ea' },
          { token: 'string', foreground: 'c3e88d' },
          { token: 'number', foreground: 'f78c6c' },
          { token: 'type', foreground: 'ffcb6b' },
          { token: 'function', foreground: '82aaff' },
          { token: 'variable', foreground: 'eeffff' },
          { token: 'operator', foreground: '89ddff' },
          { token: 'constant', foreground: 'f78c6c' },
          { token: 'class', foreground: 'ffcb6b' },
          { token: 'parameter', foreground: 'f07178' },
          { token: 'property', foreground: 'f07178' },
          { token: 'regexp', foreground: 'ff5370' },
          { token: 'annotation', foreground: 'ffcb6b' },
        ],
        colors: {
          'editor.background': '#0d0d0f',
          'editor.foreground': '#eeeef5',
          'editor.lineHighlightBackground': '#141420',
          'editor.selectionBackground': '#7c3aed50',
          'editor.inactiveSelectionBackground': '#7c3aed25',
          'editorCursor.foreground': '#a78bfa',
          'editorCursor.background': '#0d0d0f',
          'editorLineNumber.foreground': '#252540',
          'editorLineNumber.activeForeground': '#555570',
          'editorGutter.background': '#0d0d0f',
          'editorIndentGuide.background': '#141420',
          'editorIndentGuide.activeBackground': '#7c3aed60',
          'editorBracketMatch.background': '#7c3aed30',
          'editorBracketMatch.border': '#7c3aed',
          'editor.findMatchBackground': '#7c3aed60',
          'editor.findMatchHighlightBackground': '#7c3aed30',
          'editorWidget.background': '#0a0a10',
          'editorWidget.border': '#1e1e2e',
          'editorSuggestWidget.background': '#0a0a10',
          'editorSuggestWidget.border': '#1e1e2e',
          'editorSuggestWidget.selectedBackground': '#141428',
          'editorSuggestWidget.highlightForeground': '#a78bfa',
          'editorSuggestWidget.focusHighlightForeground': '#c4b5fd',
          'list.hoverBackground': '#141420',
          'list.focusBackground': '#1a1a30',
          'scrollbarSlider.background': '#1e1e3080',
          'scrollbarSlider.hoverBackground': '#2a2a4080',
          'scrollbarSlider.activeBackground': '#7c3aed60',
          'minimap.background': '#080810',
          'minimapSlider.background': '#1e1e3080',
          'peekViewEditor.background': '#080810',
          'peekViewResult.background': '#0a0a14',
          'input.background': '#111118',
          'input.border': '#1e1e2e',
          'input.foreground': '#e0e0e8',
          'focusBorder': '#7c3aed',
          'statusBar.background': '#5b21b6',
          'panel.background': '#080810',
          'panelTitle.activeBorder': '#7c3aed',
          'terminal.background': '#080810',
          'terminal.foreground': '#eeeef5',
          'breadcrumb.foreground': '#444',
          'breadcrumb.activeSelectionForeground': '#a78bfa',
          'tab.activeBackground': '#0d0d0f',
          'tab.inactiveBackground': '#080810',
          'tab.activeBorderTop': '#7c3aed',
        }
      });

      monaco.editor.defineTheme('apex-light', {
        base: 'vs', inherit: true,
        rules: [{ token: 'keyword', foreground: '7c3aed' }],
        colors: { 'editor.background': '#fafafa', 'focusBorder': '#7c3aed', 'statusBar.background': '#7c3aed' }
      });

      monaco.editor.defineTheme('apex-midnight', {
        base: 'vs-dark', inherit: true,
        rules: [
          { token: 'keyword', foreground: 'ff79c6' },
          { token: 'string', foreground: 'f1fa8c' },
          { token: 'number', foreground: 'bd93f9' },
          { token: 'function', foreground: '50fa7b' },
          { token: 'comment', foreground: '6272a4', fontStyle: 'italic' },
        ],
        colors: { 'editor.background': '#282a36', 'editorCursor.foreground': '#f8f8f2', 'statusBar.background': '#44475a' }
      });

      // Create editor
      S.editor = monaco.editor.create(document.getElementById('monaco-el'), {
        value: '',
        language: 'plaintext',
        theme: S.settings.theme || 'apex-dark',
        fontSize: S.settings.fontSize,
        fontFamily: S.settings.fontFamily,
        fontLigatures: true,
        tabSize: S.settings.tabSize,
        insertSpaces: true,
        wordWrap: S.settings.wordWrap,
        minimap: { enabled: S.settings.minimap },
        lineNumbers: S.settings.lineNumbers,
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        cursorBlinking: S.settings.cursorBlinking || 'smooth',
        cursorSmoothCaretAnimation: 'on',
        renderLineHighlight: 'all',
        bracketPairColorization: { enabled: S.settings.bracketPairs },
        guides: { bracketPairs: true, indentation: true },
        suggest: {
          showKeywords: true, showSnippets: true, showClasses: true,
          showFunctions: true, showVariables: true, showModules: true,
          showProperties: true, showMethods: true,
          preview: true, previewMode: 'subwordSmart',
        },
        quickSuggestions: { other: true, comments: false, strings: true },
        quickSuggestionsDelay: 60,
        parameterHints: { enabled: true },
        tabCompletion: 'on',
        snippetSuggestions: 'top',
        autoClosingBrackets: 'always',
        autoClosingQuotes: 'always',
        autoSurround: 'languageDefined',
        hover: { enabled: true, delay: 300 },
        formatOnType: true,
        formatOnPaste: true,
        autoIndent: 'full',
        renderWhitespace: S.settings.renderWhitespace || 'selection',
        stickyScroll: { enabled: S.settings.stickyScroll || false },
        linkedEditing: true,
        'semanticHighlighting.enabled': true,
        padding: { top: 8, bottom: 8 },
        accessibilitySupport: 'off',
        find: { addExtraSpaceOnTop: false },
        multiCursorModifier: 'ctrlCmd',
        columnSelection: false,
        foldingHighlight: true,
        foldingImportsByDefault: false,
        showFoldingControls: 'mouseover',
        occurrencesHighlight: true,
        selectionHighlight: true,
        codeLens: true,
        lightbulb: { enabled: true },
        inlayHints: { enabled: 'on' },
      });

      // Events
      S.editor.onDidChangeCursorPosition(e => {
        const p = e.position;
        document.getElementById('sbCursor').textContent = `Ln ${p.lineNumber}, Col ${p.column}`;
      });
      S.editor.onDidChangeCursorSelection(e => {
        const sel = e.selection;
        const model = S.editor.getModel();
        if (model && !sel.isEmpty()) {
          const chars = model.getValueInRange(sel).length;
          const lines = Math.abs(sel.endLineNumber - sel.startLineNumber) + 1;
          document.getElementById('sbCursor').textContent = `Ln ${sel.startLineNumber}, Col ${sel.startColumn}${chars > 0 ? ` (${chars} chars, ${lines} lines)` : ''}`;
        }
      });
      S.editor.onDidChangeModelContent(() => {
        if (!S.activeTab) return;
        const file = S.files[S.activeTab];
        if (file && !file.dirty) { file.dirty = true; updateTabEl(S.activeTab); refreshTree(); }
        if (S.settings.autoSave) { clearTimeout(S._saveTimer); S._saveTimer = setTimeout(() => fileSave(S.activeTab, true), 1500); }
        refreshProblems();
      });
      S.editor.onDidChangeModel(() => {
        const model = S.editor.getModel();
        if (!model) return;
        const lang = model.getLanguageId();
        document.getElementById('sbLang').textContent = lang.charAt(0).toUpperCase() + lang.slice(1);
        document.getElementById('sbIndent').textContent = `Spaces: ${S.settings.tabSize}`;
      });

      // Shortcuts (inside editor)
      S.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => fileSave(S.activeTab));
      S.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyP, openCP);
      S.editor.addCommand(monaco.KeyCode.F1, openCP);
      S.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyP, openCP);
      S.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyA, toggleAI);
      S.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF, () => switchPanel('search'));

      // Context menu
      const cmds = [
        { id: 'apex.explain', label: '✦ Explain Code', fn: () => aiAction('explain') },
        { id: 'apex.fix', label: '✦ Fix Bug', fn: () => aiAction('fix') },
        { id: 'apex.refactor', label: '✦ Refactor', fn: () => aiAction('refactor') },
        { id: 'apex.tests', label: '✦ Generate Tests', fn: () => aiAction('tests') },
        { id: 'apex.docs', label: '✦ Add Documentation', fn: () => aiAction('docs') },
        { id: 'apex.complete', label: '✦ Complete Code', fn: () => aiAction('complete') },
        { id: 'apex.review', label: '✦ Code Review', fn: () => aiAction('review') },
      ];
      cmds.forEach((c, i) => S.editor.addAction({ id: c.id, label: c.label, contextMenuGroupId: 'apex', contextMenuOrder: i + 1, run: c.fn }));

      registerSnippets();
      S.monacoReady = true;
      resolve();
    });
  });
}

// ── FILE SYSTEM ───────────────────────────────────────────────
const SKIP = ['node_modules', '.git', 'dist', 'build', '__pycache__', '.next', 'target', '.turbo', 'coverage', '.cache', 'out'];
function shouldSkip(name) { return SKIP.includes(name) || name.startsWith('.') && !['env', 'gitignore', 'gitattributes', 'eslintrc', 'prettierrc', 'editorconfig'].some(s => name.includes(s)); }

async function openFolder() {
  if ('showDirectoryPicker' in window) {
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      S.dirHandle = handle; S.rootName = handle.name;
      resetWorkspace();
      toast('Reading folder…', 'info', 1000);
      await readDir(handle, '');
      afterLoad();
      toast(`Opened: ${S.rootName}`, 'ok');
    } catch (e) { if (e.name !== 'AbortError') toast('Could not open: ' + e.message, 'err'); }
  } else {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.multiple = true; inp.webkitdirectory = true;
    inp.onchange = async e => {
      const files = [...e.target.files];
      if (!files.length) return;
      S.rootName = files[0].webkitRelativePath.split('/')[0] || 'workspace';
      resetWorkspace();
      let loaded = 0;
      const valid = files.filter(f => {
        const parts = f.webkitRelativePath.split('/');
        return !parts.some(p => shouldSkip(p)) && f.size < 2 * 1024 * 1024;
      });
      await Promise.all(valid.map(f => new Promise(res => {
        const r = new FileReader();
        r.onload = ev => { S.files[f.webkitRelativePath || f.name] = { content: ev.target.result, lang: getLang(f.name), dirty: false }; loaded++; res(); };
        r.onerror = res;
        r.readAsText(f);
      })));
      afterLoad();
      toast(`Opened: ${S.rootName} (${loaded} files)`, 'ok');
    };
    inp.click();
  }
}

async function readDir(dirHandle, prefix) {
  const entries = [];
  for await (const [name, entry] of dirHandle.entries()) entries.push([name, entry]);
  await Promise.all(entries.map(async ([name, entry]) => {
    if (shouldSkip(name)) return;
    const path = prefix ? `${prefix}/${name}` : name;
    if (entry.kind === 'file') {
      try {
        const file = await entry.getFile();
        if (file.size < 2 * 1024 * 1024) {
          const text = await file.text();
          S.files[path] = { content: text, lang: getLang(name), dirty: false, handle: entry };
        }
      } catch {}
    } else {
      await readDir(entry, path);
    }
  }));
}

function resetWorkspace() { S.files = {}; S.tabs = []; S.activeTab = null; updateTabs(); showWelcome(); }
function afterLoad() { buildTreeData(); refreshTree(); showTree(); }

function newProject() {
  const name = prompt('Project name:', 'my-app');
  if (!name) return;
  S.rootName = name; resetWorkspace();
  const defs = {
    [`${name}/index.html`]: `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8"/>\n  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>\n  <title>${name}</title>\n  <link rel="stylesheet" href="style.css"/>\n</head>\n<body>\n  <h1>Hello, ${name}!</h1>\n  <script src="app.js"><\/script>\n</body>\n</html>`,
    [`${name}/style.css`]: `/* ${name} styles */\n*{box-sizing:border-box;margin:0;padding:0}\nbody{font-family:system-ui,sans-serif;line-height:1.6;padding:2rem;background:#fff;color:#111}\nh1{color:#7c3aed;margin-bottom:1rem}`,
    [`${name}/app.js`]: `'use strict';\n\n// ${name} — main entry\nconst app = {\n  init() {\n    console.log('${name} started');\n  }\n};\n\ndocument.addEventListener('DOMContentLoaded', () => app.init());`,
    [`${name}/README.md`]: `# ${name}\n\nBuilt with **Apex IDE**.\n\n## Getting Started\n\n\`\`\`bash\n# Open index.html in browser\nopen index.html\n\`\`\`\n`,
    [`${name}/.gitignore`]: `node_modules/\ndist/\nbuild/\n.env\n.DS_Store\n*.log\n`,
  };
  Object.entries(defs).forEach(([k, v]) => { S.files[k] = { content: v, lang: getLang(k), dirty: false }; });
  afterLoad(); openTab(`${name}/index.html`);
  toast(`Created: ${name}`, 'ok');
}

function newFile(prefix) {
  const name = prompt('File name:', 'untitled.js');
  if (!name) return;
  const base = prefix || (S.rootName ? S.rootName : '');
  const path = base ? `${base}/${name}` : name;
  S.files[path] = { content: '', lang: getLang(path), dirty: false };
  buildTreeData(); refreshTree(); showTree(); openTab(path);
  toast(`Created: ${name}`, 'ok');
}

function newFolder(prefix) {
  const name = prompt('Folder name:', 'new-folder');
  if (!name) return;
  const base = prefix || (S.rootName ? S.rootName : '');
  const path = (base ? `${base}/${name}` : name) + '/.gitkeep';
  S.files[path] = { content: '', lang: 'plaintext', dirty: false };
  buildTreeData(); refreshTree(); showTree();
  toast(`Created folder: ${name}`, 'ok');
}

async function fileSave(path, silent = false) {
  if (!path || !S.files[path]) return;
  if (S.monacoReady && S.models[path]) {
    if (S.settings.formatOnSave && !silent) {
      try { await S.editor.getAction('editor.action.formatDocument').run(); } catch {}
    }
    S.files[path].content = S.models[path].getValue();
  }
  S.files[path].dirty = false;
  updateTabEl(path); refreshTree();
  if (S.files[path].handle) {
    try { const w = await S.files[path].handle.createWritable(); await w.write(S.files[path].content); await w.close(); }
    catch {}
  }
  if (!silent) toast(`Saved: ${path.split('/').pop()}`, 'ok', 1500);
}

// ── TREE ─────────────────────────────────────────────────────
let treeData = {};
function buildTreeData() {
  treeData = {};
  Object.keys(S.files).sort().forEach(path => {
    const parts = path.split('/');
    let node = treeData;
    parts.forEach((p, i) => {
      if (i === parts.length - 1) { node[p] = { __file: path }; }
      else { if (!node[p]) node[p] = {}; node = node[p]; }
    });
  });
}

function showTree() {
  document.getElementById('ftree').classList.remove('hidden');
  const nf = document.querySelector('#ftree .no-folder');
  if (nf) nf.style.display = 'none';
}
function showWelcome() {
  document.getElementById('welcome').classList.remove('hidden');
  document.getElementById('monaco-el').classList.add('hidden');
  document.getElementById('breadcrumb').textContent = '';
}

let openDirs = new Set();
function refreshTree() {
  const c = document.getElementById('ftree');
  // Keep existing no-folder message hidden if we have files
  if (Object.keys(S.files).length === 0) {
    c.innerHTML = '<div class="no-folder"><p>No files yet</p><button class="primary" onclick="openFolder()">📂 Open Folder</button><button class="ghost" onclick="newProject()">✨ New Project</button></div>';
    return;
  }
  // Remove old tree-content if exists
  let wrap = c.querySelector('.tree-root');
  if (!wrap) { wrap = document.createElement('div'); wrap.className = 'tree-root'; c.appendChild(wrap); }
  wrap.innerHTML = '';
  // Hide no-folder
  const nf = c.querySelector('.no-folder');
  if (nf) nf.style.display = 'none';
  buildTreeData();
  renderTreeNode(wrap, treeData, 0);
}

function renderTreeNode(container, node, depth) {
  const entries = Object.entries(node).sort(([a, av], [b, bv]) => {
    const ad = !av.__file, bd = !bv.__file;
    if (ad && !bd) return -1; if (!ad && bd) return 1;
    return a.localeCompare(b, undefined, { sensitivity: 'base' });
  });
  entries.forEach(([name, val]) => {
    if (name === '.gitkeep' && val.__file) return;
    if (val.__file) {
      const file = S.files[val.__file];
      const el = document.createElement('div');
      el.className = 'ti' + (val.__file === S.activeTab ? ' on' : '');
      el.style.paddingLeft = (6 + depth * 14) + 'px';
      el.dataset.path = val.__file;
      el.innerHTML = `<span class="ti-ch" style="visibility:hidden">›</span><span class="ti-ic">${getIcon(name)}</span><span class="ti-lb">${name}</span>${file?.dirty ? '<span class="ti-dot"></span>' : ''}`;
      el.addEventListener('click', () => openTab(val.__file));
      el.addEventListener('contextmenu', e => showCtx(e, val.__file, 'file'));
      container.appendChild(el);
    } else {
      const dirPath = depth > 0 ? name : name;
      const isOpen = openDirs.has(dirPath) !== false; // default open
      if (!openDirs.has(dirPath + '_init')) { openDirs.add(dirPath); openDirs.add(dirPath + '_init'); }
      const folderOpen = openDirs.has(dirPath);
      const el = document.createElement('div');
      el.className = 'ti';
      el.style.paddingLeft = (6 + depth * 14) + 'px';
      const chevron = document.createElement('span');
      chevron.className = 'ti-ch' + (folderOpen ? ' o' : '');
      chevron.textContent = '›';
      const icon = document.createElement('span');
      icon.className = 'ti-ic';
      icon.textContent = folderOpen ? '📂' : '📁';
      const label = document.createElement('span');
      label.className = 'ti-lb';
      label.textContent = name;
      el.appendChild(chevron); el.appendChild(icon); el.appendChild(label);
      const childWrap = document.createElement('div');
      childWrap.style.display = folderOpen ? '' : 'none';
      el.addEventListener('click', e => {
        e.stopPropagation();
        const open = chevron.classList.toggle('o');
        childWrap.style.display = open ? '' : 'none';
        icon.textContent = open ? '📂' : '📁';
        if (open) openDirs.add(dirPath); else openDirs.delete(dirPath);
      });
      el.addEventListener('contextmenu', e => showCtx(e, dirPath, 'folder'));
      container.appendChild(el);
      renderTreeNode(childWrap, val, depth + 1);
      container.appendChild(childWrap);
    }
  });
}

function highlightTree() {
  document.querySelectorAll('#ftree .ti[data-path]').forEach(el => {
    el.classList.toggle('on', el.dataset.path === S.activeTab);
  });
}

// ── TABS ──────────────────────────────────────────────────────
function openTab(path) {
  if (!S.tabs.find(t => t.path === path)) {
    S.tabs.push({ path, name: path.split('/').pop(), icon: getIcon(path) });
  }
  S.activeTab = path;
  updateTabs();
  loadInEditor(path);
  document.getElementById('welcome').classList.add('hidden');
  document.getElementById('monaco-el').classList.remove('hidden');
  document.getElementById('breadcrumb').textContent = path;
  if (S.monacoReady) setTimeout(() => S.editor.focus(), 50);
  highlightTree();
}

function updateTabs() {
  const list = document.getElementById('tablist');
  list.innerHTML = '';
  S.tabs.forEach(t => {
    const f = S.files[t.path];
    const el = document.createElement('div');
    el.className = 'tab' + (t.path === S.activeTab ? ' on' : '') + (f?.dirty ? ' dirty' : '');
    el.dataset.path = t.path;
    el.innerHTML = `<span class="tab-ic">${t.icon}</span><span class="tab-nm" title="${t.path}">${t.name}</span><span class="tab-x" data-close="${t.path}">✕</span>`;
    el.addEventListener('mousedown', e => {
      if (e.button === 1) { e.preventDefault(); closeTab(t.path); return; }
    });
    el.addEventListener('click', e => {
      if (e.target.dataset.close) { closeTab(e.target.dataset.close); return; }
      openTab(t.path);
    });
    list.appendChild(el);
  });
  const active = list.querySelector('.tab.on');
  if (active) active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function updateTabEl(path) { updateTabs(); }

function closeTab(path) {
  const f = S.files[path];
  if (f?.dirty) { if (confirm(`Save changes to ${path.split('/').pop()}?`)) fileSave(path); else f.dirty = false; }
  S.tabs = S.tabs.filter(t => t.path !== path);
  if (S.models[path]) { S.models[path].dispose(); delete S.models[path]; }
  if (S.activeTab === path) {
    S.activeTab = S.tabs.length ? S.tabs[S.tabs.length - 1].path : null;
    if (S.activeTab) { loadInEditor(S.activeTab); highlightTree(); }
    else { showWelcome(); document.getElementById('breadcrumb').textContent = ''; }
  }
  updateTabs();
}

function loadInEditor(path) {
  if (!S.monacoReady) return;
  const file = S.files[path];
  if (!file) return;
  if (!S.models[path]) {
    S.models[path] = monaco.editor.createModel(file.content, getLang(path), monaco.Uri.file('/' + path));
  }
  S.editor.setModel(S.models[path]);
  document.getElementById('sbLang').textContent = (() => { const l = getLang(path); return l.charAt(0).toUpperCase() + l.slice(1); })();
}

// ── CONTEXT MENU ─────────────────────────────────────────────
let ctxPath = null, ctxType = null;
function showCtx(e, path, type) {
  e.preventDefault(); e.stopPropagation();
  ctxPath = path; ctxType = type;
  const menu = document.getElementById('ctx');
  menu.classList.remove('hidden');
  menu.style.left = Math.min(e.clientX, innerWidth - 170) + 'px';
  menu.style.top = Math.min(e.clientY, innerHeight - 220) + 'px';
  if (type === 'file') {
    menu.innerHTML = `
      <div class="ctx-it" onclick="openTab(ctxPath);hideCtx()">Open</div>
      <div class="ctx-sep"></div>
      <div class="ctx-it" onclick="ctxRename();hideCtx()">Rename</div>
      <div class="ctx-it" onclick="ctxDelete();hideCtx()">Delete</div>
      <div class="ctx-sep"></div>
      <div class="ctx-it" onclick="navigator.clipboard.writeText(ctxPath);toast('Path copied','ok');hideCtx()">Copy Path</div>
      <div class="ctx-it" onclick="duplicateFile(ctxPath);hideCtx()">Duplicate</div>
    `;
  } else {
    menu.innerHTML = `
      <div class="ctx-it" onclick="newFile(ctxPath);hideCtx()">New File Here</div>
      <div class="ctx-it" onclick="newFolder(ctxPath);hideCtx()">New Folder Here</div>
      <div class="ctx-sep"></div>
      <div class="ctx-it" onclick="navigator.clipboard.writeText(ctxPath);toast('Path copied','ok');hideCtx()">Copy Path</div>
    `;
  }
}
function hideCtx() { document.getElementById('ctx').classList.add('hidden'); }
document.addEventListener('click', hideCtx);

function ctxRename() {
  const oldName = ctxPath.split('/').pop();
  const newName = prompt('Rename to:', oldName);
  if (!newName || newName === oldName) return;
  const prefix = ctxPath.includes('/') ? ctxPath.split('/').slice(0,-1).join('/') + '/' : '';
  const newPath = prefix + newName;
  S.files[newPath] = { ...S.files[ctxPath] };
  delete S.files[ctxPath];
  if (S.models[ctxPath]) { S.models[ctxPath].dispose(); delete S.models[ctxPath]; }
  const ti = S.tabs.findIndex(t => t.path === ctxPath);
  if (ti >= 0) S.tabs[ti] = { path: newPath, name: newName, icon: getIcon(newName) };
  if (S.activeTab === ctxPath) { S.activeTab = newPath; }
  buildTreeData(); refreshTree(); updateTabs();
  if (S.activeTab === newPath) loadInEditor(newPath);
  toast(`Renamed to ${newName}`, 'ok');
}

function ctxDelete() {
  if (!confirm(`Delete ${ctxPath.split('/').pop()}?`)) return;
  delete S.files[ctxPath];
  if (S.models[ctxPath]) { S.models[ctxPath].dispose(); delete S.models[ctxPath]; }
  S.tabs = S.tabs.filter(t => t.path !== ctxPath);
  if (S.activeTab === ctxPath) { S.activeTab = S.tabs[0]?.path || null; }
  buildTreeData(); refreshTree(); updateTabs();
  if (S.activeTab) loadInEditor(S.activeTab); else showWelcome();
  toast('Deleted', 'ok');
}

function duplicateFile(path) {
  const parts = path.split('/');
  const name = parts.pop();
  const ext = name.includes('.') ? '.' + name.split('.').pop() : '';
  const base = ext ? name.slice(0, -ext.length) : name;
  const newName = `${base}-copy${ext}`;
  const newPath = [...parts, newName].join('/');
  S.files[newPath] = { ...S.files[path], dirty: false };
  buildTreeData(); refreshTree(); openTab(newPath);
  toast(`Duplicated as ${newName}`, 'ok');
}

// ── SEARCH ────────────────────────────────────────────────────
function doSearch() {
  const q = document.getElementById('searchQ').value.trim();
  if (!q) return;
  const caseSensitive = document.getElementById('srCase').checked;
  const isRegex = document.getElementById('srRegex').checked;
  const wholeWord = document.getElementById('srWord').checked;
  const res = document.getElementById('searchRes');
  res.innerHTML = '';
  let total = 0;
  Object.entries(S.files).forEach(([path, file]) => {
    const lines = file.content.split('\n');
    const matches = [];
    lines.forEach((line, i) => {
      try {
        let hit;
        if (isRegex) { hit = new RegExp(q, caseSensitive ? '' : 'i').test(line); }
        else if (wholeWord) { hit = new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`, caseSensitive ? '' : 'i').test(line); }
        else { hit = caseSensitive ? line.includes(q) : line.toLowerCase().includes(q.toLowerCase()); }
        if (hit) matches.push({ ln: i + 1, text: line.slice(0, 120) });
      } catch {}
    });
    if (!matches.length) return;
    total += matches.length;
    const fEl = document.createElement('div');
    fEl.className = 'sr-file';
    fEl.innerHTML = `<div class="sr-fn">${path.split('/').pop()}<span>${path}</span></div>`;
    matches.slice(0, 30).forEach(m => {
      const mEl = document.createElement('div');
      mEl.className = 'sr-m';
      const esc = m.text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      let hi = esc;
      try { hi = esc.replace(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), caseSensitive?'g':'gi'), s => `<mark>${s}</mark>`); } catch {}
      mEl.innerHTML = `<span style="color:#333;margin-right:4px">${m.ln}:</span>${hi}`;
      mEl.onclick = () => { openTab(path); setTimeout(() => { if (S.monacoReady) { S.editor.revealLineInCenter(m.ln); S.editor.setPosition({ lineNumber: m.ln, column: 1 }); S.editor.focus(); } }, 80); };
      fEl.appendChild(mEl);
    });
    res.appendChild(fEl);
  });
  if (!total) res.innerHTML = `<div style="padding:16px;color:#333;font-size:12px;text-align:center">No results for "<strong style="color:#666">${q}</strong>"</div>`;
}

// ── TERMINAL ─────────────────────────────────────────────────
function addTerminal() {
  if (!window.Terminal) { toast('xterm.js not loaded', 'err'); return; }
  const id = S.terminals.length;
  const term = new Terminal({
    cursorBlink: true, cursorStyle: 'bar',
    fontFamily: S.settings.fontFamily || "'Cascadia Code',Consolas,monospace",
    fontSize: S.settings.termFontSize || 13,
    theme: {
      background: '#080810', foreground: '#eeeef5', cursor: '#a78bfa',
      selectionBackground: 'rgba(124,58,237,.35)',
      black: '#1a1a2e', red: '#f87171', green: '#4ade80', yellow: '#fbbf24',
      blue: '#60a5fa', magenta: '#a78bfa', cyan: '#22d3ee', white: '#eeeef5',
      brightBlack: '#3a3a5e', brightRed: '#fca5a5', brightGreen: '#86efac',
      brightYellow: '#fde68a', brightBlue: '#93c5fd', brightMagenta: '#c4b5fd',
      brightCyan: '#67e8f9', brightWhite: '#ffffff',
    },
    scrollback: 20000, rightClickSelectsWord: true, allowProposedApi: true,
  });
  const fa = new FitAddon.FitAddon();
  term.loadAddon(fa);
  const wrap = document.createElement('div');
  wrap.style.cssText = 'width:100%;height:100%;display:none';
  wrap.id = `tw-${id}`;
  document.getElementById('termwrap').appendChild(wrap);
  term.open(wrap); fa.fit();
  const shell = new ShellSim(term);
  S.terminals.push({ term, fa, shell, wrap, id, name: `bash ${id + 1}` });
  // Tab
  const tab = document.createElement('div');
  tab.className = 'tterm-tab'; tab.dataset.id = id;
  tab.innerHTML = `⚡ bash ${id + 1}&nbsp;<span class="tterm-tab-x" onclick="killTerm(${id})">✕</span>`;
  tab.onclick = e => { if (e.target.classList.contains('tterm-tab-x')) return; switchTerm(id); };
  document.getElementById('termTabs').appendChild(tab);
  switchTerm(id);
  new ResizeObserver(() => { try { fa.fit(); } catch {} }).observe(wrap.parentElement);
}

function switchTerm(id) {
  S.activeTerm = id;
  S.terminals.forEach(t => { if (t) t.wrap.style.display = t.id === id ? 'block' : 'none'; });
  document.querySelectorAll('.tterm-tab').forEach(el => el.classList.toggle('on', +el.dataset.id === id));
  try { S.terminals[id]?.fa.fit(); } catch {}
}

function killTerm(id) {
  const t = S.terminals[id]; if (!t) return;
  t.term.dispose(); t.wrap.remove();
  document.querySelector(`.tterm-tab[data-id="${id}"]`)?.remove();
  S.terminals[id] = null;
  const alive = S.terminals.findIndex(x => x);
  if (alive >= 0) switchTerm(alive); else addTerminal();
}

// ── SHELL SIMULATOR ──────────────────────────────────────────
class ShellSim {
  constructor(term) {
    this.t = term; this.buf = ''; this.hist = []; this.hi = -1; this.cwd = '/workspace';
    this.env = { HOME: '/workspace', USER: 'dev', SHELL: '/bin/bash', PATH: '/usr/local/bin:/usr/bin:/bin', TERM: 'xterm-256color' };
    this.aliases = { ll: 'ls -la', la: 'ls -a' };
    this.running = false;
    term.writeln('\x1b[38;5;141m ▸ Apex IDE Terminal  \x1b[38;5;240mv3.0\x1b[0m');
    term.writeln('\x1b[38;5;240m   Type \x1b[38;5;141mhelp\x1b[38;5;240m for commands · \x1b[38;5;141mnode <file>\x1b[38;5;240m to run JS\x1b[0m\n');
    this.prompt();
    term.onKey(({ key, domEvent: ev }) => {
      if (this.running) { if (ev.ctrlKey && ev.key === 'c') { term.writeln('^C'); this.running = false; this.prompt(); } return; }
      if (ev.key === 'Enter') { term.writeln(''); this.exec(this.buf.trim()); this.buf = ''; }
      else if (ev.key === 'Backspace') { if (this.buf.length) { this.buf = this.buf.slice(0,-1); term.write('\b \b'); } }
      else if (ev.key === 'ArrowUp') { if (this.hi < this.hist.length-1) { this.hi++; this.replaceInput(this.hist[this.hi]||''); } }
      else if (ev.key === 'ArrowDown') { if (this.hi > 0) { this.hi--; this.replaceInput(this.hist[this.hi]||''); } else { this.hi=-1; this.replaceInput(''); } }
      else if (ev.key === 'Tab') { this.tab(); }
      else if (ev.ctrlKey && ev.key === 'c') { term.writeln('^C'); this.buf=''; this.prompt(); }
      else if (ev.ctrlKey && ev.key === 'l') { term.write('\x1b[2J\x1b[H'); this.prompt(); }
      else if (ev.ctrlKey && ev.key === 'a') { /* go to start */ }
      else if (ev.ctrlKey && ev.key === 'e') { /* go to end */ }
      else if (!ev.ctrlKey && !ev.metaKey && !ev.altKey && key.length === 1) { this.buf += key; term.write(key); }
    });
    term.onData(d => { if (d.length > 1 && !d.startsWith('\x1b')) { this.buf += d; term.write(d); } });
  }
  get shortCwd() { return this.cwd.replace('/workspace','~'); }
  prompt() { this.t.write(`\r\x1b[38;5;141mdev\x1b[38;5;240m@\x1b[38;5;75mapex\x1b[0m:\x1b[38;5;221m${this.shortCwd}\x1b[38;5;75m$\x1b[0m `); }
  replaceInput(txt) { this.t.write(`\r\x1b[K`); this.prompt(); this.t.write(txt); this.buf = txt; }
  tab() {
    const cmds = ['ls','cd','pwd','cat','echo','mkdir','touch','rm','cp','mv','grep','find','node','python3','npm','git','curl','which','env','export','clear','help','code','wc','chmod','head','tail','sort','uniq','diff','history'];
    const word = this.buf.split(' ').pop();
    const hits = [...cmds, ...Object.keys(S.files)].filter(c => c.endsWith(word) || c.startsWith(word));
    if (hits.length === 1) { const add = hits[0].slice(word.length); this.buf += add; this.t.write(add); }
    else if (hits.length > 1) { this.t.writeln(''); this.t.writeln(hits.join('  ')); this.prompt(); this.t.write(this.buf); }
  }
  exec(cmd) {
    if (!cmd) { this.prompt(); return; }
    // Alias expansion
    const firstWord = cmd.split(' ')[0];
    if (this.aliases[firstWord]) cmd = this.aliases[firstWord] + cmd.slice(firstWord.length);
    this.hist.unshift(cmd); this.hi = -1;
    // Pipe support (basic)
    if (cmd.includes('|')) { this.execPipe(cmd); return; }
    const parts = this.parse(cmd);
    const [prog, ...args] = parts;
    const w = s => this.t.writeln(String(s ?? ''));
    const wr = s => this.t.write(String(s ?? ''));
    switch (prog) {
      case 'clear': case 'cls': this.t.write('\x1b[2J\x1b[H'); break;
      case 'pwd': w(this.cwd); break;
      case 'echo': w(args.join(' ').replace(/\$(\w+)/g, (_, k) => this.env[k] || `$${k}`)); break;
      case 'env': case 'printenv': Object.entries(this.env).forEach(([k,v]) => w(`${k}=${v}`)); break;
      case 'export': { const [k,v] = (args[0]||'').split('='); if(k) this.env[k] = v||''; break; }
      case 'history': this.hist.slice(0,20).forEach((h,i) => w(`  ${this.hist.length-i}  ${h}`)); break;
      case 'alias': { const [k,v] = (args[0]||'').split('='); if(k&&v) this.aliases[k]=v.replace(/^"|"$/g,''); else Object.entries(this.aliases).forEach(([k,v])=>w(`alias ${k}='${v}'`)); break; }
      case 'ls': case 'll': case 'la': {
        const showHidden = prog==='la'||args.includes('-a')||args.includes('-la');
        const showLong = prog==='ll'||args.includes('-l')||args.includes('-la');
        const files = Object.keys(S.files);
        if (!files.length) { w('\x1b[38;5;240m(empty)\x1b[0m'); break; }
        const dirs = new Set(); const fileList = [];
        files.forEach(p => { const ps=p.split('/'); if(ps.length>1)dirs.add(ps[0]); else fileList.push(p); });
        if (showLong) {
          dirs.forEach(d => w(`drwxr-xr-x  2 dev dev  4096 Jun 28 12:00 \x1b[38;5;75m${d}/\x1b[0m`));
          fileList.forEach(f => w(`-rw-r--r--  1 dev dev  ${(S.files[f]?.content?.length||0).toString().padStart(5)} Jun 28 12:00 ${f}`));
        } else {
          dirs.forEach(d => wr(`\x1b[38;5;75m${d}/\x1b[0m  `));
          fileList.forEach(f => wr(`${f}  `));
          if (dirs.size || fileList.length) this.t.writeln('');
        }
        break;
      }
      case 'cd': {
        const t = (args[0] || '~').replace('~', '/workspace');
        if (t === '..') this.cwd = this.cwd.split('/').slice(0,-1).join('/') || '/';
        else if (t.startsWith('/')) this.cwd = t;
        else this.cwd = `${this.cwd}/${t}`;
        break;
      }
      case 'cat': {
        if (!args[0]) { w('\x1b[38;5;196mcat: missing operand\x1b[0m'); break; }
        const key = Object.keys(S.files).find(k => k === args[0] || k.endsWith('/'+args[0]) || k.endsWith(args[0]));
        if (key) w(S.files[key].content||'');
        else w(`\x1b[38;5;196mcat: ${args[0]}: No such file\x1b[0m`);
        break;
      }
      case 'head': { const key=Object.keys(S.files).find(k=>k.endsWith(args[args.length-1]));const n=+args[args.indexOf('-n')+1]||10; if(key)S.files[key].content.split('\n').slice(0,n).forEach(l=>w(l));else w(`\x1b[38;5;196mhead: ${args[args.length-1]}: not found\x1b[0m`); break; }
      case 'tail': { const key=Object.keys(S.files).find(k=>k.endsWith(args[args.length-1]));const n=+args[args.indexOf('-n')+1]||10; if(key)S.files[key].content.split('\n').slice(-n).forEach(l=>w(l));else w(`\x1b[38;5;196mtail: ${args[args.length-1]}: not found\x1b[0m`); break; }
      case 'touch': { if(!args[0])break; const base=S.rootName||''; const p=args[0].includes('/')?args[0]:(base?`${base}/${args[0]}`:args[0]); if(!S.files[p]){S.files[p]={content:'',lang:getLang(p),dirty:false};buildTreeData();refreshTree();showTree();} break; }
      case 'mkdir': { const n=args.filter(a=>!a.startsWith('-'))[0]; if(n){const p=(S.rootName?`${S.rootName}/${n}`:n)+'/.gitkeep';S.files[p]={content:'',lang:'plaintext',dirty:false};buildTreeData();refreshTree();showTree();w(`mkdir: created directory '${n}'`);} break; }
      case 'rm': {
        const tgts = args.filter(a=>!a.startsWith('-'));
        tgts.forEach(t => {
          const key = Object.keys(S.files).find(k=>k===t||k.endsWith('/'+t));
          if(key){delete S.files[key];if(S.models[key]){S.models[key].dispose();delete S.models[key];}S.tabs=S.tabs.filter(x=>x.path!==key);if(S.activeTab===key){S.activeTab=S.tabs[0]?.path||null;}}
          else if(args.includes('-r')||args.includes('-rf')){const pref=t+'/';Object.keys(S.files).filter(k=>k.startsWith(pref)).forEach(k=>{delete S.files[k];if(S.models[k]){S.models[k].dispose();delete S.models[k];}S.tabs=S.tabs.filter(x=>x.path!==k);});}
          else w(`\x1b[38;5;196mrm: ${t}: No such file\x1b[0m`);
        });
        buildTreeData();refreshTree();updateTabs();if(!S.activeTab)showWelcome();
        break;
      }
      case 'cp': { const [src,dst]=args.filter(a=>!a.startsWith('-'));const sk=Object.keys(S.files).find(k=>k===src||k.endsWith('/'+src));if(sk&&dst){S.files[dst]={...S.files[sk],dirty:false};buildTreeData();refreshTree();showTree();w(`'${src}' -> '${dst}'`);}else w(`\x1b[38;5;196mcp: cannot copy\x1b[0m`); break; }
      case 'mv': { const [src,dst]=args;const sk=Object.keys(S.files).find(k=>k===src||k.endsWith('/'+src));if(sk&&dst){S.files[dst]={...S.files[sk]};delete S.files[sk];const ti=S.tabs.findIndex(t=>t.path===sk);if(ti>=0){S.tabs[ti]={path:dst,name:dst.split('/').pop(),icon:getIcon(dst)};if(S.activeTab===sk)S.activeTab=dst;}buildTreeData();refreshTree();updateTabs();}else w(`\x1b[38;5;196mmv: cannot move\x1b[0m`); break; }
      case 'grep': {
        const pat=args.filter(a=>!a.startsWith('-'))[0];
        const file=args.filter(a=>!a.startsWith('-'))[1];
        const recursive=args.includes('-r')||args.includes('-ri');
        if(!pat){w('\x1b[38;5;196musage: grep PATTERN [FILE]\x1b[0m');break;}
        const sources = file ? [Object.keys(S.files).find(k=>k===file||k.endsWith('/'+file))].filter(Boolean) : (recursive?Object.keys(S.files):[]);
        sources.forEach(k=>{S.files[k].content.split('\n').forEach((l,i)=>{if(l.toLowerCase().includes(pat.toLowerCase()))w(`\x1b[38;5;75m${k}:${i+1}:\x1b[0m ${l}`);});});
        if(!sources.length)w(`\x1b[38;5;196mgrep: ${file||'.'}: No such file\x1b[0m`);
        break;
      }
      case 'find': {
        const nameArg=args.find((_,i)=>args[i-1]==='-name');
        const typeArg=args.find((_,i)=>args[i-1]==='-type');
        Object.keys(S.files).forEach(p=>{
          if(nameArg&&!p.split('/').pop().includes(nameArg.replace(/\*/g,'')))return;
          if(typeArg==='d'){const dir=p.split('/').slice(0,-1).join('/');if(dir)w(dir);}else w(p);
        });
        break;
      }
      case 'wc': { const key=Object.keys(S.files).find(k=>k.endsWith(args[args.length-1]));if(key){const c=S.files[key].content;w(`  ${c.split('\n').length}  ${c.split(/\s+/).filter(Boolean).length}  ${c.length} ${args[args.length-1]}`);}else w('\x1b[38;5;196mwc: no such file\x1b[0m'); break; }
      case 'sort': { const key=Object.keys(S.files).find(k=>k.endsWith(args[args.length-1]));if(key)S.files[key].content.split('\n').sort().forEach(l=>w(l));else w('\x1b[38;5;196msort: no such file\x1b[0m'); break; }
      case 'diff': { const [a,b]=args;const ak=Object.keys(S.files).find(k=>k.endsWith(a));const bk=Object.keys(S.files).find(k=>k.endsWith(b));if(ak&&bk){const al=S.files[ak].content.split('\n');const bl=S.files[bk].content.split('\n');al.forEach((l,i)=>{if(l!==bl[i]){w(`\x1b[38;5;196m- ${l}\x1b[0m`);if(bl[i]!==undefined)w(`\x1b[38;5;82m+ ${bl[i]}\x1b[0m`);}});}else w('\x1b[38;5;196mdiff: file not found\x1b[0m'); break; }
      case 'chmod': w(`chmod: ${args.join(' ')} (simulated)`); break;
      case 'node': case 'nodejs': {
        if (args[0] === '-e') {
          try { const r=new Function(`"use strict";const logs=[];const console={log:(...a)=>logs.push(a.join(' ')),error:(...a)=>logs.push('\x1b[38;5;196m'+a.join(' ')+'\x1b[0m'),warn:(...a)=>logs.push('\x1b[38;5;220m'+a.join(' ')+'\x1b[0m')};${args.slice(1).join(' ')};return logs;`)(); (r||[]).forEach(l=>w(l)); }
          catch(e){w(`\x1b[38;5;196m${e.message}\x1b[0m`);}
        } else if (args[0]) {
          const key=Object.keys(S.files).find(k=>k===args[0]||k.endsWith('/'+args[0]));
          if(key){
            try {
              const logs=[];
              const fakeConsole={log:(...a)=>logs.push(a.map(x=>typeof x==='object'?JSON.stringify(x,null,2):String(x)).join(' ')),error:(...a)=>logs.push('\x1b[38;5;196m'+a.join(' ')+'\x1b[0m'),warn:(...a)=>logs.push('\x1b[38;5;220m'+a.join(' ')+'\x1b[0m'),info:(...a)=>logs.push('\x1b[38;5;75m'+a.join(' ')+'\x1b[0m'),dir:(...a)=>logs.push(JSON.stringify(a[0],null,2))};
              new Function('console','process',S.files[key].content)(fakeConsole,{argv:['node',key,...args.slice(1)],env:this.env,exit:(c)=>{},version:'v20.0.0'});
              if(logs.length)logs.forEach(l=>w(l));else w('\x1b[38;5;240m(no output)\x1b[0m');
            }catch(e){w(`\x1b[38;5;196m${e.message}\x1b[0m`);}
          } else w(`\x1b[38;5;196mError: Cannot find '${args[0]}'\x1b[0m`);
        } else { w('Welcome to Node.js v20.0.0'); }
        break;
      }
      case 'python3': case 'python': { if(args[0]){const k=Object.keys(S.files).find(k=>k.endsWith(args[0]));w(k?`\x1b[38;5;240m[Python: ${args[0]} — connect a real Python backend for execution]\x1b[0m`:`python3: ${args[0]}: No such file`);}else w('Python 3.12.0 (simulated)\n>>> '); break; }
      case 'npm': {
        const sub=args[0];
        if(sub==='init'){const pkg={name:S.rootName||'app',version:'1.0.0',main:'index.js',scripts:{start:'node index.js',test:'jest'},dependencies:{},devDependencies:{}};const p=(S.rootName||'')+'/package.json';S.files[p]={content:JSON.stringify(pkg,null,2),lang:'json',dirty:false};buildTreeData();refreshTree();showTree();w('\x1b[38;5;82mWrote package.json\x1b[0m');}
        else if(sub==='install'||sub==='i'||sub==='add'){const pkg=args[1]||'dependencies';w(`\x1b[38;5;240m\nnpm: installing ${pkg}...\x1b[0m`);this.running=true;let n=0;const iv=setInterval(()=>{wr('\x1b[38;5;141m█\x1b[0m');n++;if(n>18){clearInterval(iv);this.t.writeln('');w(`\x1b[38;5;82madded packages in 1.2s\x1b[0m`);this.running=false;this.prompt();}},80);return;}
        else if(sub==='run'){w(`\x1b[38;5;240m> ${args[1]||'start'}\x1b[0m`);w('\x1b[38;5;82mStarting... (simulated)\x1b[0m');}
        else if(sub==='list'||sub==='ls'){w('└── (no packages installed — simulated env)');}
        else w(`npm ${args.join(' ')} — try: init, install, run, list`);
        break;
      }
      case 'git': {
        const sub=args[0];
        if(sub==='init'){w('\x1b[38;5;82mInitialized empty Git repository in .git/\x1b[0m');document.getElementById('sbBranch').textContent='⎇ main';}
        else if(sub==='status'){const dirty=Object.entries(S.files).filter(([_,f])=>f.dirty);w(`On branch main\n${dirty.length?'\nChanges not staged for commit:\n'+dirty.map(([p])=>`\t\x1b[38;5;196mmodified:   ${p}\x1b[0m`).join('\n'):'nothing to commit, working tree clean'}`);}
        else if(sub==='add'){w(`\x1b[38;5;82mStaged: ${args.slice(1).join(', ')||'.'}\x1b[0m`);}
        else if(sub==='commit'){const m=args.indexOf('-m')>=0?args[args.indexOf('-m')+1]:'commit';w(`[main a1b2c3] ${m.replace(/^"|"$/g,'')}\n 1 file changed`);}
        else if(sub==='log'){w('\x1b[38;5;220mcommit a1b2c3d (HEAD -> main)\x1b[0m\nAuthor: dev <dev@apex.ide>\nDate:   '+new Date().toDateString()+'\n\n    Initial commit\n');}
        else if(sub==='branch'){const cur=document.getElementById('sbBranch').textContent.replace('⎇ ','');w(`* \x1b[38;5;82m${cur}\x1b[0m`);}
        else if(sub==='checkout'){const b=args.find(a=>!a.startsWith('-'))||'main';if(args.includes('-b'))w(`Switched to new branch '${b}'`);else w(`Switched to branch '${b}'`);document.getElementById('sbBranch').textContent=`⎇ ${b}`;}
        else if(sub==='push'){w('Everything up-to-date');}
        else if(sub==='pull'){w('Already up to date.');}
        else if(sub==='clone'){w(`Cloning into '${(args[1]||'repo').split('/').pop().replace('.git','')}'\n...\n\x1b[38;5;82mDone.\x1b[0m`);}
        else if(sub==='diff'){const dirty=Object.entries(S.files).filter(([_,f])=>f.dirty);dirty.forEach(([p,f])=>w(`diff --git a/${p} b/${p}\n\x1b[38;5;82m+++ b/${p}\x1b[0m`));}
        else if(sub==='stash'){w('Saved working directory state WIP on main');}
        else w(`git: '${sub}' — try: init, status, add, commit, log, branch, checkout, push, pull, clone, diff`);
        break;
      }
      case 'curl': case 'wget': { w('\x1b[38;5;240m[network access simulated — IDE runs in browser sandbox]\x1b[0m'); w('HTTP/1.1 200 OK\n{"status":"simulated"}'); break; }
      case 'which': { const m={node:'/usr/local/bin/node',npm:'/usr/local/bin/npm',python3:'/usr/bin/python3',git:'/usr/bin/git',bash:'/bin/bash',curl:'/usr/bin/curl',ollama:'/usr/local/bin/ollama'};w(m[args[0]]||`which: no ${args[0]} in (${this.env.PATH})`); break; }
      case 'code': { if(args[0]){const k=Object.keys(S.files).find(k=>k.endsWith(args[0])||k===args[0]);if(k){openTab(k);}else{w(`File not found: ${args[0]}`);}}break; }
      case 'ollama': {
        const sub=args[0];
        if(sub==='list'||sub==='ls'){w('NAME\t\t\tID\t\tSIZE\tMODIFIED');S.ollamaModels.forEach(m=>w(`${m.name}\t${m.digest?.slice(0,12)||'—'}\t${m.size||'—'}\trecently`));if(!S.ollamaModels.length)w('(no models — run: ollama pull qwen3:1.7b)');}
        else if(sub==='pull'){w(`\x1b[38;5;240mpulling ${args[1]||'model'} from Ollama registry...\x1b[0m`);this.running=true;let n=0;const iv=setInterval(()=>{wr('\x1b[38;5;141m█\x1b[0m');n++;if(n>20){clearInterval(iv);this.t.writeln('');w(`\x1b[38;5;82msuccessfully pulled ${args[1]||'model'}\x1b[0m`);this.running=false;this.prompt();}},100);return;}
        else if(sub==='serve'){w('Starting Ollama server on http://localhost:11434...');w('\x1b[38;5;82mOllama is running\x1b[0m');}
        else if(sub==='run'){w(`\x1b[38;5;240mStarting ${args[1]||'model'}...\x1b[0m`);w('\x1b[38;5;82mUse the AI panel (Ctrl+Shift+A) for code assistance\x1b[0m');}
        else if(sub==='stop'){w('Stopped model');}
        else w(`ollama: ${sub||'<command>'} — try: list, pull, serve, run, stop`);
        break;
      }
      case 'help':
        w('\x1b[38;5;141m━━━ Apex IDE Terminal Commands ━━━\x1b[0m');
        [['Files','ls, cat, touch, mkdir, rm, cp, mv, find, wc, head, tail, sort, diff, chmod'],
         ['Git','git init/status/add/commit/log/branch/checkout/push/pull/clone/diff/stash'],
         ['Node.js','node <file>, node -e "<code>", npm init/install/run'],
         ['Python','python3 <file>'],
         ['Ollama AI','ollama list, ollama pull <model>, ollama serve, ollama run <model>'],
         ['Editor','code <file>  — open file in editor'],
         ['System','pwd, cd, echo, env, export, history, alias, clear, which, curl'],
        ].forEach(([cat,cmds])=>{w(`\x1b[38;5;75m${cat}:\x1b[0m`);w(`  ${cmds}`);});
        break;
      default: w(`\x1b[38;5;196mbash: ${prog}: command not found\x1b[0m\x1b[38;5;240m — try \x1b[38;5;141mhelp\x1b[0m`);
    }
    this.prompt();
  }
  execPipe(cmd) {
    const parts = cmd.split('|').map(s => s.trim());
    const outputs = [];
    parts.forEach((part, i) => {
      const [prog, ...args] = this.parse(part);
      if (prog === 'grep' && i > 0) {
        const pat = args[0]; const last = outputs[i-1] || '';
        const res = last.split('\n').filter(l => l.toLowerCase().includes((pat||'').toLowerCase()));
        outputs.push(res.join('\n'));
      } else { outputs.push(`(pipe: ${part})`); }
    });
    (outputs[outputs.length-1]||'').split('\n').forEach(l => this.t.writeln(l));
    this.prompt();
  }
  parse(cmd) {
    const res=[]; let cur=''; let q=null;
    for(const ch of cmd){if(q){if(ch===q)q=null;else cur+=ch;}else if(ch==='"'||ch==="'"){q=ch;}else if(ch===' '){if(cur){res.push(cur);cur='';}}else cur+=ch;}
    if(cur)res.push(cur);
    return res.length?res:[''];
  }
}

// ── OLLAMA SETUP MODAL ────────────────────────────────────────
const MODELS = [
  { name: 'Qwen3 1.7B', model: 'qwen3:1.7b', size: '~1.1 GB', minRam: 0, maxRam: 8, badges: [['green','Fast'],['blue','Lightweight'],['green','Free']], desc: 'Best for low-RAM devices. Surprisingly capable for coding tasks — explains code, finds bugs, generates tests.', cmd: 'ollama pull qwen3:1.7b' },
  { name: 'Qwen3 4B', model: 'qwen3:4b', size: '~2.6 GB', minRam: 8, maxRam: 16, badges: [['purple','Balanced'],['blue','4B params'],['green','Free']], desc: 'Great balance of speed and capability. Handles complex refactoring, architecture questions, and multi-file reasoning.', cmd: 'ollama pull qwen3:4b' },
  { name: 'Qwen3 8B', model: 'qwen3:8b', size: '~5.0 GB', minRam: 16, maxRam: 999, badges: [['orange','Powerful'],['purple','8B params'],['green','Free']], desc: 'Near GPT-4 quality on coding tasks. Best for complex algorithms, large codebases, and architectural design.', cmd: 'ollama pull qwen3:8b' },
];

async function detectRAM() {
  // navigator.deviceMemory gives approximate RAM in GB (1,2,4,8)
  // Performance API can sometimes give more info
  let totalGB = null;
  let usedGB = null;

  // Try deviceMemory API
  if ('deviceMemory' in navigator) { totalGB = navigator.deviceMemory; }

  // Try to get more detail via performance.memory (Chrome-only, approximate)
  if (performance && performance.memory) {
    const mem = performance.memory;
    usedGB = (mem.usedJSHeapSize / 1024**3).toFixed(2);
    // jsHeapSizeLimit is not total RAM but gives a hint
    if (!totalGB) totalGB = Math.round(mem.jsHeapSizeLimit / 1024**3 * 2); // rough estimate
  }

  return { totalGB, usedGB };
}

async function showOllamaSetup() {
  document.getElementById('ollamaModal').classList.remove('hidden');
  renderOSInstructions('mac');
  await renderRAMStatus();
  renderModelCards();
  // Load installed models
  await fetchOllamaModels();
}

async function renderRAMStatus() {
  const el = document.getElementById('ramDisplay');
  const { totalGB, usedGB } = await detectRAM();
  const total = totalGB || '?';
  const usedPct = usedGB && totalGB ? Math.min(100, Math.round((+usedGB / totalGB) * 100)) : null;

  let rec = MODELS[0]; // default
  if (totalGB >= 32) rec = MODELS[2];
  else if (totalGB >= 16) rec = MODELS[1];
  else if (totalGB >= 8) rec = MODELS[0];

  el.innerHTML = `
    <div class="ram-row">
      <span class="ram-label">Total RAM</span>
      <div class="ram-bar-wrap"><div class="ram-bar avail" style="width:100%"></div></div>
      <span class="ram-val">${total} GB</span>
    </div>
    ${usedPct !== null ? `
    <div class="ram-row">
      <span class="ram-label">JS Heap</span>
      <div class="ram-bar-wrap"><div class="ram-bar used" style="width:${usedPct}%"></div></div>
      <span class="ram-val">${usedGB} GB</span>
    </div>` : ''}
    <div class="ram-rec">
      <span class="ram-rec-icon">💡</span>
      <div class="ram-rec-text">
        Based on your <strong>${total} GB RAM</strong>, we recommend: 
        <strong>${rec.name}</strong> (${rec.model}) — ${rec.size}
      </div>
    </div>
  `;
}

async function fetchOllamaModels() {
  const url = document.getElementById('ollamaUrl')?.value || S.ollamaUrl;
  try {
    const r = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (r.ok) {
      const data = await r.json();
      S.ollamaModels = data.models || [];
      renderModelCards(); // refresh with installed status
    }
  } catch {}
}

function renderModelCards() {
  const container = document.getElementById('modelCards');
  if (!container) return;
  const { totalGB } = { totalGB: navigator.deviceMemory || 8 };
  let recIdx = 0;
  if (totalGB >= 32) recIdx = 2;
  else if (totalGB >= 16) recIdx = 1;

  container.innerHTML = MODELS.map((m, i) => {
    const installed = S.ollamaModels.some(om => om.name === m.model || om.name.startsWith(m.model.split(':')[0]));
    const isRec = i === recIdx;
    return `
      <div class="mc ${isRec ? 'recommended' : ''}">
        <div class="mc-name">${m.name}</div>
        <div class="mc-model">${m.model}</div>
        <div class="mc-badges">${m.badges.map(([c,t])=>`<span class="badge ${c}">${t}</span>`).join('')}</div>
        <div class="mc-desc">${m.desc}</div>
        <div class="mc-ram">RAM needed: <span>${m.minRam === 0 ? '< 8' : m.minRam}–${m.maxRam === 999 ? '32+' : m.maxRam} GB</span> · Size: <span>${m.size}</span></div>
        <button class="mc-dl ${installed ? 'installed' : ''}" id="mc-btn-${i}" onclick="pullModel('${m.model}','${m.cmd}',${i})">
          ${installed ? '✓ Installed' : '⬇ Pull Model'}
        </button>
      </div>
    `;
  }).join('');
}

async function pullModel(model, cmd, idx) {
  const btn = document.getElementById(`mc-btn-${idx}`);
  if (!btn || btn.classList.contains('installed') || btn.classList.contains('loading')) return;
  btn.classList.add('loading');
  btn.textContent = '⟳ Pulling…';
  const url = document.getElementById('ollamaUrl')?.value || S.ollamaUrl;
  try {
    const r = await fetch(`${url}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: model }),
      signal: AbortSignal.timeout(300000),
    });
    if (r.ok) {
      btn.classList.remove('loading'); btn.classList.add('installed');
      btn.textContent = '✓ Installed';
      toast(`${model} pulled successfully!`, 'ok');
      await fetchOllamaModels();
    } else {
      btn.classList.remove('loading'); btn.textContent = '⬇ Pull Model';
      toast(`Pull failed — is Ollama running? (ollama serve)`, 'err');
    }
  } catch (e) {
    btn.classList.remove('loading'); btn.textContent = '⬇ Pull Model';
    const tip = e.name === 'TimeoutError' ? 'Timed out — large model, try: ollama pull ' + model + ' in terminal' : 'Ollama not running — open terminal and run: ollama serve';
    toast(tip, 'err', 5000);
  }
}

const OS_INSTRUCTIONS = {
  mac: {
    steps: [
      { title: 'Download Ollama for macOS', desc: 'Click the button below to download the macOS installer.', extra: `<a class="dl-btn" href="https://ollama.com/download/mac" target="_blank">⬇ Download Ollama for macOS</a>` },
      { title: 'Install & Launch', desc: 'Open the downloaded .dmg file, drag Ollama to Applications, and launch it. Ollama will appear in your menu bar.', extra: '' },
      { title: 'Pull a model', desc: 'Open Terminal and run:', extra: `<div class="step-code">ollama pull qwen3:1.7b<button class="step-code-cp" onclick="navigator.clipboard.writeText('ollama pull qwen3:1.7b');toast('Copied','ok')">Copy</button></div>` },
      { title: 'Verify it works', desc: 'Test Ollama is running:', extra: `<div class="step-code">curl http://localhost:11434<button class="step-code-cp" onclick="navigator.clipboard.writeText('curl http://localhost:11434');toast('Copied','ok')">Copy</button></div>` },
    ]
  },
  win: {
    steps: [
      { title: 'Download Ollama for Windows', desc: 'Download the Windows installer:', extra: `<a class="dl-btn" href="https://ollama.com/download/windows" target="_blank">⬇ Download Ollama for Windows</a>` },
      { title: 'Install Ollama', desc: 'Run the downloaded OllamaSetup.exe and follow the installer. Ollama will run in the system tray.', extra: '' },
      { title: 'Open PowerShell and pull a model', desc: 'Press Win+X → Windows PowerShell, then run:', extra: `<div class="step-code">ollama pull qwen3:1.7b<button class="step-code-cp" onclick="navigator.clipboard.writeText('ollama pull qwen3:1.7b');toast('Copied','ok')">Copy</button></div>` },
      { title: 'Enable CORS (required for web IDE)', desc: 'In PowerShell, set the environment variable:', extra: `<div class="step-code">$env:OLLAMA_ORIGINS="*"; ollama serve<button class="step-code-cp" onclick="navigator.clipboard.writeText('$env:OLLAMA_ORIGINS=\"*\"; ollama serve');toast('Copied','ok')">Copy</button></div>` },
    ]
  },
  linux: {
    steps: [
      { title: 'Install Ollama (one command)', desc: 'Run in terminal:', extra: `<div class="step-code">curl -fsSL https://ollama.com/install.sh | sh<button class="step-code-cp" onclick="navigator.clipboard.writeText('curl -fsSL https://ollama.com/install.sh | sh');toast('Copied','ok')">Copy</button></div>` },
      { title: 'Start Ollama server', desc: 'Run:', extra: `<div class="step-code">OLLAMA_ORIGINS="*" ollama serve<button class="step-code-cp" onclick="navigator.clipboard.writeText('OLLAMA_ORIGINS=\"*\" ollama serve');toast('Copied','ok')">Copy</button></div>` },
      { title: 'Pull a model (new terminal tab)', desc: '', extra: `<div class="step-code">ollama pull qwen3:1.7b<button class="step-code-cp" onclick="navigator.clipboard.writeText('ollama pull qwen3:1.7b');toast('Copied','ok')">Copy</button></div>` },
      { title: 'GPU acceleration (NVIDIA)', desc: 'If you have an NVIDIA GPU, Ollama automatically uses CUDA. Verify:', extra: `<div class="step-code">nvidia-smi<button class="step-code-cp" onclick="navigator.clipboard.writeText('nvidia-smi');toast('Copied','ok')">Copy</button></div>` },
    ]
  }
};

function switchOS(os, el) {
  document.querySelectorAll('.os-tab').forEach(t => t.classList.remove('on'));
  el.classList.add('on');
  renderOSInstructions(os);
}

function renderOSInstructions(os) {
  const data = OS_INSTRUCTIONS[os];
  const el = document.getElementById('osInstructions');
  if (!el || !data) return;
  el.innerHTML = `<div class="install-steps">${data.steps.map((s,i) => `
    <div class="step">
      <div class="step-num">${i+1}</div>
      <div class="step-body">
        <div class="step-title">${s.title}</div>
        ${s.desc ? `<div class="step-desc">${s.desc}</div>` : ''}
        ${s.extra}
      </div>
    </div>
  `).join('')}</div>`;
}

async function testOllamaConnection() {
  const url = document.getElementById('ollamaUrl').value.trim() || 'http://localhost:11434';
  const statusEl = document.getElementById('connStatus');
  statusEl.style.display = 'flex';
  statusEl.className = 'conn-status testing';
  statusEl.innerHTML = '<span>⟳</span><span>Testing connection…</span>';
  try {
    const r = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (r.ok) {
      const data = await r.json();
      S.ollamaModels = data.models || [];
      const modelCount = S.ollamaModels.length;
      statusEl.className = 'conn-status ok';
      statusEl.innerHTML = `<span>✓</span><span>Connected! ${modelCount} model${modelCount!==1?'s':''} installed: ${S.ollamaModels.map(m=>m.name).join(', ')||'none'}</span>`;
      S.ollamaConnected = true;
      S.ollamaUrl = url;
      updateAIStatus(true);
      renderModelCards();
    } else {
      throw new Error(`HTTP ${r.status}`);
    }
  } catch (e) {
    statusEl.className = 'conn-status err';
    statusEl.innerHTML = `<span>✕</span><span>Cannot connect: ${e.message} — Is Ollama running? Try: ollama serve</span>`;
    S.ollamaConnected = false;
    updateAIStatus(false);
  }
}

function saveOllamaSettings() {
  const url = document.getElementById('ollamaUrl').value.trim();
  const model = document.getElementById('aiModel').value;
  S.ollamaUrl = url; S.settings.ollamaUrl = url;
  if (model) S.settings.ollamaModel = model;
  saveSettings();
  hideOllamaSetup();
  testConnection();
  toast('AI settings saved', 'ok');
}

function hideOllamaSetup() { document.getElementById('ollamaModal').classList.add('hidden'); }

function onModelChange() {
  const val = document.getElementById('aiModel').value;
  if (val === 'custom') {
    const custom = prompt('Enter model name (e.g. llama3.2:3b):');
    if (custom) {
      const opt = document.createElement('option');
      opt.value = custom; opt.textContent = custom;
      const sel = document.getElementById('aiModel');
      sel.insertBefore(opt, sel.lastElementChild);
      sel.value = custom;
      S.settings.ollamaModel = custom; saveSettings();
    } else { document.getElementById('aiModel').value = S.settings.ollamaModel || 'qwen3:1.7b'; }
  } else {
    S.settings.ollamaModel = val; saveSettings();
  }
}

async function testConnection() {
  try {
    const r = await fetch(`${S.ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (r.ok) {
      const data = await r.json();
      S.ollamaModels = data.models || [];
      S.ollamaConnected = true;
      updateAIStatus(true, S.ollamaModels.length);
    } else { throw new Error(); }
  } catch { S.ollamaConnected = false; updateAIStatus(false); }
}

function updateAIStatus(connected, modelCount) {
  const el = document.getElementById('aiStatus');
  const txt = document.getElementById('aiStatusTxt');
  el.className = 'tb-ai-status ' + (connected ? 'connected' : 'disconnected');
  txt.textContent = connected ? `Ollama: ${modelCount || S.ollamaModels.length} model${(modelCount||S.ollamaModels.length)!==1?'s':''}` : 'Ollama: Not connected';
  document.getElementById('sbAI').textContent = connected ? `✦ Ollama Ready` : '✦ Ollama Setup';
}

// ── AI (OLLAMA) ────────────────────────────────────────────────
function toggleAI() {
  const p = document.getElementById('aipanel');
  const r = document.getElementById('rzAI');
  const collapsed = p.classList.toggle('off');
  r.style.display = collapsed ? 'none' : '';
}

function clearAI() { S.aiHistory = []; document.getElementById('aimsg').innerHTML = ''; }

function getEditorCode() {
  if (!S.monacoReady || !S.activeTab) return '';
  const sel = S.editor.getSelection();
  const model = S.editor.getModel();
  if (model && sel && !sel.isEmpty()) return model.getValueInRange(sel);
  const val = model?.getValue() || '';
  return val.length > 8000 ? val.slice(0, 8000) + '\n\n// ... (truncated)' : val;
}

function aiAction(action) {
  if (!S.monacoReady || !S.activeTab) { toast('Open a file first', 'warn'); return; }
  if (document.getElementById('aipanel').classList.contains('off')) toggleAI();
  const code = getEditorCode();
  const lang = getLang(S.activeTab);
  const file = S.activeTab.split('/').pop();
  const prompts = {
    explain: `You are an expert ${lang} developer. Explain this code from "${file}" clearly and concisely, step by step. Include: purpose, how it works, key patterns used.\n\`\`\`${lang}\n${code}\n\`\`\``,
    fix: `You are a debugging expert. Find ALL bugs in this ${lang} code from "${file}". For each bug: describe the issue and provide the fix. Then provide the complete corrected code.\n\`\`\`${lang}\n${code}\n\`\`\``,
    refactor: `You are a senior ${lang} engineer. Refactor this code from "${file}" for: better readability, maintainability, performance. Explain each change. Provide the refactored code.\n\`\`\`${lang}\n${code}\n\`\`\``,
    tests: `You are a testing expert. Write a comprehensive test suite for this ${lang} code from "${file}". Include: unit tests, edge cases, error cases. Use appropriate testing framework.\n\`\`\`${lang}\n${code}\n\`\`\``,
    docs: `You are a technical writer. Add complete documentation to this ${lang} code from "${file}": JSDoc/docstrings for all functions, inline comments for complex logic, parameter/return types.\n\`\`\`${lang}\n${code}\n\`\`\``,
    optimize: `You are a performance expert. Optimize this ${lang} code from "${file}" for maximum performance. Identify bottlenecks, suggest optimizations, explain trade-offs. Provide optimized code.\n\`\`\`${lang}\n${code}\n\`\`\``,
    complete: `You are an expert ${lang} developer. Complete this unfinished ${lang} code from "${file}". Fill in TODOs, implement missing functions, add error handling. Provide the complete implementation.\n\`\`\`${lang}\n${code}\n\`\`\``,
    review: `You are a senior code reviewer. Review this ${lang} code from "${file}" for: correctness, security, performance, best practices, code style. Provide actionable feedback with specific improvements.\n\`\`\`${lang}\n${code}\n\`\`\``,
  };
  const display = { explain:'Explain code', fix:'Fix bugs', refactor:'Refactor', tests:'Generate tests', docs:'Add docs', optimize:'Optimize', complete:'Complete code', review:'Code review' };
  appendMsg('user', display[action] || action);
  callOllama(prompts[action], display[action] || action);
}

async function sendAI() {
  const inp = document.getElementById('aiinput');
  const msg = inp.value.trim();
  if (!msg) return;
  const useCtx = document.getElementById('aiCtx')?.checked;
  let full = msg;
  if (useCtx && S.activeTab) {
    const code = getEditorCode();
    const lang = getLang(S.activeTab);
    if (code) full = `File: ${S.activeTab} (${lang})\n\`\`\`${lang}\n${code}\n\`\`\`\n\nQuestion: ${msg}`;
  }
  inp.value = ''; inp.style.height = '';
  appendMsg('user', msg);
  S.aiHistory.push({ role: 'user', content: full });
  await callOllama(full);
}

async function callOllama(prompt, displayLabel) {
  if (!S.ollamaConnected) {
    appendMsg('assistant', '⚠️ **Ollama is not connected.**\n\nTo use AI:\n1. Install Ollama (click **Setup AI** above)\n2. Run `ollama serve` in your terminal\n3. Pull a model: `ollama pull qwen3:1.7b`\n4. Click **Test Connection** in the AI Setup panel');
    return;
  }
  const model = document.getElementById('aiModel').value || S.settings.ollamaModel || 'qwen3:1.7b';
  if (!model || model === '') { toast('Select an AI model first', 'warn'); return; }

  const sendBtn = document.getElementById('aiSendBtn');
  if (sendBtn) sendBtn.disabled = true;

  const typing = showTyping();
  if (S.streamController) { S.streamController.abort(); }
  S.streamController = new AbortController();

  // Streaming response
  const msgEl = document.createElement('div');
  msgEl.className = 'msg a';
  let rawContent = '';

  try {
    const messages = [
      { role: 'system', content: `You are an expert programming assistant integrated into Apex IDE. Help with code using clear explanations and proper markdown formatting with code blocks. Be concise but thorough.` },
      ...S.aiHistory.slice(-10),
      { role: 'user', content: prompt }
    ];

    const r = await fetch(`${S.ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: true }),
      signal: S.streamController.signal,
    });

    if (!r.ok) { const err = await r.text(); throw new Error(`Ollama error: ${r.status} — ${err.slice(0,200)}`); }

    typing.remove();
    document.getElementById('aimsg').appendChild(msgEl);

    const reader = r.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const json = JSON.parse(line);
          if (json.message?.content) {
            rawContent += json.message.content;
            msgEl.innerHTML = formatAI(rawContent);
            document.getElementById('aimsg').scrollTop = document.getElementById('aimsg').scrollHeight;
          }
          if (json.done) break;
        } catch {}
      }
    }

    // Add action buttons
    const actions = document.createElement('div');
    actions.className = 'msg-actions';
    actions.innerHTML = `<button class="msg-btn" onclick="copyAIText(this)">📋 Copy</button><button class="msg-btn" onclick="insertAICode(this)">⬆ Insert code</button>`;
    actions.dataset.raw = rawContent;
    msgEl.appendChild(actions);

    S.aiHistory.push({ role: 'assistant', content: rawContent });

  } catch (e) {
    typing.remove();
    if (e.name !== 'AbortError') {
      appendMsg('assistant', `❌ **Error:** ${e.message}\n\nMake sure:\n- Ollama is running: \`ollama serve\`\n- Model is pulled: \`ollama pull ${model}\`\n- CORS is enabled: Set \`OLLAMA_ORIGINS=*\` before starting Ollama`);
    }
  } finally {
    if (sendBtn) sendBtn.disabled = false;
    S.streamController = null;
  }
}

function formatAI(text) {
  // Code blocks
  text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) =>
    `<pre><code>${code.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').trim()}</code></pre>`
  );
  text = text.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
  text = text.replace(/^#{3}\s(.+)$/gm, '<strong style="color:#a78bfa">$1</strong>');
  text = text.replace(/^#{2}\s(.+)$/gm, '<strong style="color:#c4b5fd;font-size:14px">$1</strong>');
  text = text.replace(/^#{1}\s(.+)$/gm, '<strong style="color:#e0e0e8;font-size:15px">$1</strong>');
  text = text.replace(/^- (.+)$/gm, '• $1');
  text = text.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>');
  return `<p>${text}</p>`;
}

function appendMsg(role, content) {
  const c = document.getElementById('aimsg');
  const el = document.createElement('div');
  el.className = `msg ${role === 'user' ? 'u' : role === 'system' ? 'sys' : 'a'}`;
  if (role === 'assistant') { el.innerHTML = formatAI(content); }
  else { el.textContent = content; }
  c.appendChild(el);
  c.scrollTop = c.scrollHeight;
}

function showTyping() {
  const c = document.getElementById('aimsg');
  const el = document.createElement('div');
  el.className = 'typing';
  el.innerHTML = 'Thinking <span class="dots"><span>.</span><span>.</span><span>.</span></span>';
  c.appendChild(el); c.scrollTop = c.scrollHeight;
  return el;
}

function copyAIText(btn) {
  const raw = btn.parentElement.dataset.raw || btn.parentElement.parentElement.textContent;
  navigator.clipboard.writeText(raw).then(() => toast('Copied!', 'ok', 1500));
}

function insertAICode(btn) {
  const raw = btn.parentElement.dataset.raw || '';
  const match = raw.match(/```[\w]*\n?([\s\S]+?)```/);
  const code = match ? match[1] : raw;
  if (!S.monacoReady || !S.activeTab) { toast('Open a file first', 'warn'); return; }
  const pos = S.editor.getPosition();
  const model = S.editor.getModel();
  if (!pos || !model) return;
  model.pushEditOperations([], [{ range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column), text: '\n' + code, forceMoveMarkers: true }], () => null);
  S.editor.focus();
  toast('Code inserted ✓', 'ok', 1500);
}

// ── COMMAND PALETTE ───────────────────────────────────────────
const CMDS = [
  { label:'New File', key:'Ctrl+N', group:'File', fn:()=>newFile() },
  { label:'Open Folder', key:'Ctrl+O', group:'File', fn:()=>openFolder() },
  { label:'Save', key:'Ctrl+S', group:'File', fn:()=>S.activeTab&&fileSave(S.activeTab) },
  { label:'Save All', key:'', group:'File', fn:()=>S.tabs.forEach(t=>fileSave(t.path,true)) },
  { label:'Close Tab', key:'Ctrl+W', group:'File', fn:()=>S.activeTab&&closeTab(S.activeTab) },
  { label:'New Project', key:'', group:'File', fn:()=>newProject() },
  { label:'Toggle AI Panel', key:'Ctrl+Shift+A', group:'View', fn:()=>toggleAI() },
  { label:'Toggle Terminal', key:'Ctrl+`', group:'View', fn:()=>toggleBotPanel() },
  { label:'Toggle Sidebar', key:'Ctrl+B', group:'View', fn:()=>document.getElementById('sidebar').classList.toggle('off') },
  { label:'Settings', key:'Ctrl+,', group:'View', fn:()=>openSettings() },
  { label:'Ollama AI Setup', key:'', group:'AI', fn:()=>showOllamaSetup() },
  { label:'Explain Code (AI)', key:'', group:'AI', fn:()=>aiAction('explain') },
  { label:'Fix Bug (AI)', key:'', group:'AI', fn:()=>aiAction('fix') },
  { label:'Refactor (AI)', key:'', group:'AI', fn:()=>aiAction('refactor') },
  { label:'Generate Tests (AI)', key:'', group:'AI', fn:()=>aiAction('tests') },
  { label:'Add Docs (AI)', key:'', group:'AI', fn:()=>aiAction('docs') },
  { label:'Code Review (AI)', key:'', group:'AI', fn:()=>aiAction('review') },
  { label:'Format Document', key:'Shift+Alt+F', group:'Editor', fn:()=>S.monacoReady&&S.editor.getAction('editor.action.formatDocument')?.run() },
  { label:'Toggle Word Wrap', key:'Alt+Z', group:'Editor', fn:()=>toggleWordWrap() },
  { label:'Increase Font Size', key:'Ctrl++', group:'Editor', fn:()=>changeFontSize(1) },
  { label:'Decrease Font Size', key:'Ctrl+-', group:'Editor', fn:()=>changeFontSize(-1) },
  { label:'Find in File', key:'Ctrl+F', group:'Editor', fn:()=>S.monacoReady&&S.editor.getAction('actions.find')?.run() },
  { label:'Find & Replace', key:'Ctrl+H', group:'Editor', fn:()=>S.monacoReady&&S.editor.getAction('editor.action.startFindReplaceAction')?.run() },
  { label:'Go to Line', key:'Ctrl+G', group:'Editor', fn:()=>S.monacoReady&&S.editor.getAction('editor.action.gotoLine')?.run() },
  { label:'Go to Symbol', key:'Ctrl+Shift+O', group:'Editor', fn:()=>S.monacoReady&&S.editor.getAction('editor.action.quickOutline')?.run() },
  { label:'Fold All', key:'', group:'Editor', fn:()=>S.monacoReady&&S.editor.getAction('editor.foldAll')?.run() },
  { label:'Unfold All', key:'', group:'Editor', fn:()=>S.monacoReady&&S.editor.getAction('editor.unfoldAll')?.run() },
  { label:'New Terminal', key:'Ctrl+Shift+`', group:'Terminal', fn:()=>addTerminal() },
  { label:'Theme: Apex Dark', key:'', group:'Theme', fn:()=>applyTheme('apex-dark') },
  { label:'Theme: Light', key:'', group:'Theme', fn:()=>applyTheme('apex-light') },
  { label:'Theme: Midnight (Dracula)', key:'', group:'Theme', fn:()=>applyTheme('apex-midnight') },
  { label:'Theme: High Contrast', key:'', group:'Theme', fn:()=>applyTheme('hc-black') },
  { label:'Fullscreen', key:'F11', group:'View', fn:()=>document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen().catch(()=>{}) },
];

function openCP() { document.getElementById('cp').classList.remove('hidden'); const i=document.getElementById('cpinput'); i.value=''; i.focus(); S.cpIdx=0; renderCP(''); }
function closeCP() { document.getElementById('cp').classList.add('hidden'); if(S.monacoReady)S.editor.focus(); }
function filterCP(q) { S.cpIdx=0; renderCP(q); }
function renderCP(q) {
  const res=document.getElementById('cpres'); res.innerHTML=''; S.cpItems=[];
  const filtered=CMDS.filter(c=>!q||c.label.toLowerCase().includes(q.toLowerCase())||c.group.toLowerCase().includes(q.toLowerCase()));
  const grps={};
  filtered.forEach(c=>{if(!grps[c.group])grps[c.group]=[];grps[c.group].push(c);});
  Object.entries(grps).forEach(([g,cmds])=>{
    const gEl=document.createElement('div');gEl.className='cp-grp';gEl.textContent=g;res.appendChild(gEl);
    cmds.forEach(c=>{
      const el=document.createElement('div');el.className='cp-it';
      el.innerHTML=`<div class="cp-it-l"><span class="cp-it-ic">›</span>${c.label}</div>${c.key?`<span class="cp-it-key">${c.key}</span>`:''}`;
      el.onclick=()=>{closeCP();c.fn();};
      S.cpItems.push(el);res.appendChild(el);
    });
  });
  if(q){
    const fh=Object.keys(S.files).filter(p=>p.toLowerCase().includes(q.toLowerCase())).slice(0,8);
    if(fh.length){const gEl=document.createElement('div');gEl.className='cp-grp';gEl.textContent='Files';res.appendChild(gEl);
      fh.forEach(p=>{const el=document.createElement('div');el.className='cp-it';el.innerHTML=`<div class="cp-it-l"><span class="cp-it-ic">${getIcon(p)}</span>${p.split('/').pop()}<span style="color:#333;font-size:11px;margin-left:8px">${p}</span></div>`;el.onclick=()=>{closeCP();openTab(p);};S.cpItems.push(el);res.appendChild(el);});
    }
  }
  updateCPFocus();
}
function cpKey(e) {
  if(e.key==='Escape'){closeCP();return;}
  if(e.key==='Enter'){e.preventDefault();S.cpItems[S.cpIdx]?.click();return;}
  if(e.key==='ArrowDown'){e.preventDefault();S.cpIdx=Math.min(S.cpIdx+1,S.cpItems.length-1);updateCPFocus();}
  if(e.key==='ArrowUp'){e.preventDefault();S.cpIdx=Math.max(S.cpIdx-1,0);updateCPFocus();}
}
function updateCPFocus(){S.cpItems.forEach((el,i)=>el.classList.toggle('sel',i===S.cpIdx));S.cpItems[S.cpIdx]?.scrollIntoView({block:'nearest'});}

// ── PROBLEMS ─────────────────────────────────────────────────
function refreshProblems() {
  if(!S.monacoReady||!S.activeTab||!S.models[S.activeTab])return;
  const markers=monaco.editor.getModelMarkers({resource:S.models[S.activeTab].uri});
  const e=markers.filter(m=>m.severity===monaco.MarkerSeverity.Error).length;
  const w=markers.filter(m=>m.severity===monaco.MarkerSeverity.Warning).length;
  document.getElementById('sbProblems').textContent=`✕ ${e}  ⚠ ${w}`;
  const list=document.getElementById('probList');
  if(!markers.length){list.innerHTML='<div class="empty">No problems detected ✓</div>';return;}
  list.innerHTML=markers.map(m=>{
    const ic=m.severity===monaco.MarkerSeverity.Error?'🔴':m.severity===monaco.MarkerSeverity.Warning?'🟡':'🔵';
    return `<div class="prob-item" onclick="if(S.monacoReady){S.editor.revealLineInCenter(${m.startLineNumber});S.editor.setPosition({lineNumber:${m.startLineNumber},column:${m.startColumn}});S.editor.focus();}">
      <span class="prob-ic">${ic}</span>
      <div><div class="prob-txt">${m.message.replace(/</g,'&lt;')}</div><div class="prob-loc">${S.activeTab}:${m.startLineNumber}:${m.startColumn}</div></div>
    </div>`;
  }).join('');
}

// ── SETTINGS MODAL ────────────────────────────────────────────
function openSettings(){document.getElementById('settModal').classList.remove('hidden');settTab('editor',document.querySelector('.sm-ni'));}
function closeSett(){document.getElementById('settModal').classList.add('hidden');saveSettings();}
function settTab(tab,el){
  document.querySelectorAll('.sm-ni').forEach(e=>e.classList.remove('on'));el?.classList.add('on');
  const s=S.settings;
  const row=(l,ctrl,d='')=>`<div class="sm-row"><div><div class="sm-lbl">${l}</div>${d?`<div class="sm-dsc">${d}</div>`:''}</div><div class="sm-ctrl">${ctrl}</div></div>`;
  const tgl=(key,fn='')=>`<div class="sm-tgl ${s[key]?'on':''}" onclick="toggleSett('${key}',this${fn?',()=>{'+fn+'}':''})" ></div>`;
  const tabs={
    editor:`<div class="sm-sec"><div class="sm-sec-t">Editor</div>
      ${row('Font Size',`<input type="number" value="${s.fontSize}" min="10" max="32" onchange="updateSett('fontSize',+this.value);S.monacoReady&&S.editor.updateOptions({fontSize:+this.value})">`)}
      ${row('Font Family',`<input type="text" value="${s.fontFamily}" onchange="updateSett('fontFamily',this.value);S.monacoReady&&S.editor.updateOptions({fontFamily:this.value})" style="width:280px">`)}
      ${row('Tab Size',`<input type="number" value="${s.tabSize}" min="1" max="8" onchange="updateSett('tabSize',+this.value);S.monacoReady&&S.editor.updateOptions({tabSize:+this.value})">`)}
      ${row('Word Wrap',`<select onchange="updateSett('wordWrap',this.value);S.monacoReady&&S.editor.updateOptions({wordWrap:this.value})"><option ${s.wordWrap==='off'?'selected':''} value="off">Off</option><option ${s.wordWrap==='on'?'selected':''} value="on">On</option><option ${s.wordWrap==='wordWrapColumn'?'selected':''} value="wordWrapColumn">Column</option><option ${s.wordWrap==='bounded'?'selected':''} value="bounded">Bounded</option></select>`)}
      ${row('Line Numbers',`<select onchange="updateSett('lineNumbers',this.value);S.monacoReady&&S.editor.updateOptions({lineNumbers:this.value})"><option ${s.lineNumbers==='on'?'selected':''} value="on">On</option><option ${s.lineNumbers==='off'?'selected':''} value="off">Off</option><option ${s.lineNumbers==='relative'?'selected':''} value="relative">Relative</option></select>`)}
      ${row('Minimap',tgl('minimap','S.monacoReady&&S.editor.updateOptions({minimap:{enabled:S.settings.minimap}})'),'Show code minimap')}
      ${row('Auto Save',tgl('autoSave'),'Save automatically after 1.5s')}
      ${row('Format on Save',tgl('formatOnSave'),'Format document when saving')}
      ${row('Bracket Pairs',tgl('bracketPairs','S.monacoReady&&S.editor.updateOptions({bracketPairColorization:{enabled:S.settings.bracketPairs}})'),'Colorize matching brackets')}
      ${row('Sticky Scroll',tgl('stickyScroll','S.monacoReady&&S.editor.updateOptions({stickyScroll:{enabled:S.settings.stickyScroll}})'),'Show sticky class/function headers')}
    </div>`,
    ai:`<div class="sm-sec"><div class="sm-sec-t">Ollama AI</div>
      ${row('Ollama URL',`<input type="text" value="${s.ollamaUrl||'http://localhost:11434'}" onchange="updateSett('ollamaUrl',this.value);S.ollamaUrl=this.value">`,'Local Ollama server address')}
      ${row('Default Model',`<input type="text" value="${s.ollamaModel||'qwen3:1.7b'}" onchange="updateSett('ollamaModel',this.value)">`,'Model to use for AI')}
      <div style="margin-top:12px"><button onclick="testConnection();toast('Testing…','info')" style="padding:6px 14px;background:#1a0d36;border:1px solid #7c3aed;border-radius:5px;color:#a78bfa;cursor:pointer;font-size:12px">Test Connection</button>
      <button onclick="showOllamaSetup()" style="padding:6px 14px;background:#111118;border:1px solid #1e1e2e;border-radius:5px;color:#888;cursor:pointer;font-size:12px;margin-left:8px">Open AI Setup Guide</button></div>
    </div>`,
    theme:`<div class="sm-sec"><div class="sm-sec-t">Color Theme</div>
      ${['apex-dark','apex-light','apex-midnight','hc-black'].map(t=>`<div class="sm-row" style="cursor:pointer" onclick="applyTheme('${t}')"><div class="sm-lbl">${t}</div><div class="sm-ctrl" style="color:#a78bfa">${s.theme===t?'✓':''}</div></div>`).join('')}
    </div>`,
    terminal:`<div class="sm-sec"><div class="sm-sec-t">Terminal</div>
      ${row('Font Size',`<input type="number" value="${s.termFontSize}" min="10" max="24" onchange="updateSett('termFontSize',+this.value)">`,'Requires reopening terminal')}
    </div>`,
    keybindings:`<div class="sm-sec"><div class="sm-sec-t">Keyboard Shortcuts</div>
      ${CMDS.filter(c=>c.key).map(c=>row(c.label,`<kbd style="background:#080810;padding:2px 6px;border-radius:3px;font-size:11px;color:#555;font-family:monospace">${c.key}</kbd>`)).join('')}
    </div>`,
  };
  document.getElementById('settMain').innerHTML=tabs[tab]||'';
}
function updateSett(k,v){S.settings[k]=v;saveSettings();}
function toggleSett(k,el,fn){el.classList.toggle('on');S.settings[k]=el.classList.contains('on');saveSettings();if(fn)fn();}
function applyTheme(t){S.settings.theme=t;saveSettings();if(S.monacoReady)monaco.editor.setTheme(t);toast(`Theme: ${t}`,'ok');}
function changeFontSize(d){S.settings.fontSize=Math.max(10,Math.min(32,S.settings.fontSize+d));if(S.monacoReady)S.editor.updateOptions({fontSize:S.settings.fontSize});saveSettings();}
function toggleWordWrap(){S.settings.wordWrap=S.settings.wordWrap==='off'?'on':'off';if(S.monacoReady)S.editor.updateOptions({wordWrap:S.settings.wordWrap});saveSettings();toast(`Word wrap: ${S.settings.wordWrap}`,'info');}
function changeLang(){const l=prompt('Language mode:',S.activeTab?getLang(S.activeTab):'plaintext');if(l&&S.monacoReady&&S.activeTab&&S.models[S.activeTab]){monaco.editor.setModelLanguage(S.models[S.activeTab],l);document.getElementById('sbLang').textContent=l;}}

// ── MISC UI ───────────────────────────────────────────────────
function switchPanel(name){
  document.querySelectorAll('.ab').forEach(b=>b.classList.remove('on'));
  document.getElementById(`ab-${name}`)?.classList.add('on');
  document.querySelectorAll('.pnl').forEach(p=>p.classList.remove('on'));
  document.getElementById(`pnl-${name}`)?.classList.add('on');
  const sb=document.getElementById('sidebar');
  if(sb.classList.contains('off'))sb.classList.remove('off');
}
function switchBP(name){
  document.querySelectorAll('.bp-tab').forEach(t=>t.classList.toggle('on',t.textContent.trim().toLowerCase()===name));
  document.querySelectorAll('.bpp').forEach(p=>p.classList.toggle('on',p.id===`bpp-${name}`));
  if(name==='terminal')S.terminals.forEach(t=>{try{t?.fa.fit();}catch{}});
}
function toggleBotPanel(){document.getElementById('botpanel').classList.toggle('off');setTimeout(()=>S.terminals.forEach(t=>{try{t?.fa.fit();}catch{}}),100);}
function gitCommit(){const m=document.getElementById('gitMsg').value.trim();if(!m){toast('Enter a commit message','warn');return;}toast(`Committed: ${m}`,'ok');document.getElementById('gitMsg').value='';}
function gitPush(){toast('Pushed (simulated)','ok');}
function gitPull(){toast('Pulled (simulated)','ok');}
function menuFile(){openCP();}
function menuEdit(){S.monacoReady&&S.editor.getAction('actions.find')?.run();}
function menuView(){openCP();}
function menuRun(){switchBP('terminal');if(document.getElementById('botpanel').classList.contains('off'))toggleBotPanel();}
function menuHelp(){appendMsg('system','Apex IDE v3 · Ollama AI · Monaco Editor · All languages · Web-based IDE');if(document.getElementById('aipanel').classList.contains('off'))toggleAI();}
function installPWA(){if(S.deferredInstall){S.deferredInstall.prompt();S.deferredInstall.userChoice.then(()=>{S.deferredInstall=null;document.getElementById('btnInstall').style.display='none';});}}

// ── RESIZERS ─────────────────────────────────────────────────
function initResizers(){
  mkRz(document.getElementById('rzSidebar'),'h','#sidebar',100,480);
  mkRz(document.getElementById('rzBottom'),'v','#botpanel',50,520,true);
  mkRz(document.getElementById('rzAI'),'h','#aipanel',220,640,false,true);
}
function mkRz(handle,dir,sel,min,max,inv=false,invH=false){
  if(!handle)return;
  let sx,sy,ss;
  handle.addEventListener('mousedown',e=>{
    e.preventDefault();sx=e.clientX;sy=e.clientY;
    const t=document.querySelector(sel);ss=dir==='h'?t.offsetWidth:t.offsetHeight;
    handle.classList.add('drag');
    const mv=ev=>{const t=document.querySelector(sel);if(dir==='h'){const d=invH?sx-ev.clientX:ev.clientX-sx;t.style.width=Math.max(min,Math.min(max,ss+d))+'px';}else{const d=inv?sy-ev.clientY:ev.clientY-sy;t.style.height=Math.max(min,Math.min(max,ss+d))+'px';S.terminals.forEach(t=>{try{t?.fa.fit();}catch{}});}};
    const up=()=>{handle.classList.remove('drag');document.removeEventListener('mousemove',mv);document.removeEventListener('mouseup',up);};
    document.addEventListener('mousemove',mv);document.addEventListener('mouseup',up);
  });
}

// ── SNIPPETS ─────────────────────────────────────────────────
function registerSnippets(){
  const mk=(langs,label,insert,detail)=>{
    (Array.isArray(langs)?langs:[langs]).forEach(lang=>{
      monaco.languages.registerCompletionItemProvider(lang,{
        provideCompletionItems(m,pos){
          const w=m.getWordUntilPosition(pos);
          if(!w.word||!label.toLowerCase().startsWith(w.word.toLowerCase()))return{suggestions:[]};
          const r={startLineNumber:pos.lineNumber,endLineNumber:pos.lineNumber,startColumn:w.startColumn,endColumn:w.endColumn};
          return{suggestions:[{label,kind:monaco.languages.CompletionItemKind.Snippet,insertText:insert,insertTextRules:monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,detail,range:r,documentation:detail}]};
        }
      });
    });
  };
  const JS=['javascript','typescript'];
  mk(JS,'afn','async function ${1:name}(${2:params}) {\n\t${3:// body}\n}','Async function');
  mk(JS,'afe','const ${1:name} = async (${2:params}) => {\n\t${3:// body}\n};','Async arrow');
  mk(JS,'trycatch','try {\n\t${1:// body}\n} catch (${2:error}) {\n\tconsole.error(${2:error});\n\t${3:// handle}\n} finally {\n\t${4:// cleanup}\n}','Try-catch-finally');
  mk(JS,'cls','class ${1:Name} {\n\tconstructor(${2:params}) {\n\t\tthis.${3:prop} = ${4:value};\n\t}\n\n\t${5:method}() {\n\t\t${6:// body}\n\t}\n}','Class');
  mk(JS,'imp','import ${2:name} from \'${1:module}\';','Import default');
  mk(JS,'impn','import { ${2:name} } from \'${1:module}\';','Import named');
  mk(JS,'impa','import * as ${2:ns} from \'${1:module}\';','Import namespace');
  mk(JS,'exp','export default ${1:value};','Export default');
  mk(JS,'expn','export { ${1:name} };','Export named');
  mk(JS,'prom','new Promise((resolve, reject) => {\n\t${1:// async work}\n\tresolve(${2:value});\n})','Promise');
  mk(JS,'fetch','const response = await fetch(\'${1:url}\');\nconst data = await response.json();\n${2:// use data}','Fetch API');
  mk(JS,'ael','${1:element}.addEventListener(\'${2:click}\', (${3:event}) => {\n\t${4:// handler}\n});','Event listener');
  mk(JS,'qs','document.querySelector(\'${1:selector}\')','querySelector');
  mk(JS,'qsa','document.querySelectorAll(\'${1:selector}\')','querySelectorAll');
  mk(JS,'log','console.log(${1:value});','console.log');
  mk(JS,'err','console.error(${1:error});','console.error');
  mk(JS,'ife','(function () {\n\t\'use strict\';\n\t${1:// body}\n})();','IIFE');
  mk(JS,'fore','${1:array}.forEach((${2:item}, ${3:index}) => {\n\t${4:// body}\n});','forEach');
  mk(JS,'map','const ${1:result} = ${2:array}.map((${3:item}) => {\n\treturn ${4:item};\n});','map');
  mk(JS,'filter','const ${1:result} = ${2:array}.filter((${3:item}) => {\n\treturn ${4:condition};\n});','filter');
  mk(JS,'reduce','const ${1:result} = ${2:array}.reduce((${3:acc}, ${4:cur}) => {\n\treturn ${3:acc};\n}, ${5:initial});','reduce');
  mk(JS,'sw','switch (${1:expr}) {\n\tcase ${2:val}:\n\t\t${3:// body}\n\t\tbreak;\n\tdefault:\n\t\t${4:// default}\n}','Switch');
  mk(JS,'dstr','const { ${1:prop} } = ${2:obj};','Destructure object');
  mk(JS,'dstra','const [${1:first}, ${2:rest}] = ${3:arr};','Destructure array');
  mk(['python'],'def','def ${1:name}(${2:params}):\n\t"""${3:Docstring.}"""\n\t${4:pass}','Function');
  mk(['python'],'cls','class ${1:Name}:\n\tdef __init__(self${2:, params}):\n\t\t"""${3:Init.}"""\n\t\tself.${4:attr} = ${5:value}\n\n\tdef ${6:method}(self):\n\t\t${7:pass}','Class');
  mk(['python'],'main','if __name__ == \'__main__\':\n\t${1:main()}','Main guard');
  mk(['python'],'trycatch','try:\n\t${1:pass}\nexcept ${2:Exception} as ${3:e}:\n\t${4:pass}\nfinally:\n\t${5:pass}','Try-except');
  mk(['python'],'lc','[${1:expr} for ${2:item} in ${3:iterable}${4: if condition}]','List comprehension');
  mk(['python'],'dc','{${1:key}: ${2:val} for ${3:item} in ${4:iterable}}','Dict comprehension');
  mk(['python'],'withopen','with open(\'${1:file}\', \'${2:r}\') as ${3:f}:\n\t${4:data} = ${3:f}.read()','With open');
  mk(['python'],'deco','@${1:decorator}\ndef ${2:func}(*args, **kwargs):\n\t${3:pass}','Decorator');
  mk(['go'],'fn','func ${1:name}(${2:params}) ${3:error} {\n\t${4:// body}\n\treturn ${5:nil}\n}','Function');
  mk(['go'],'err','if err != nil {\n\treturn ${1:nil}, err\n}','Error check');
  mk(['go'],'struct','type ${1:Name} struct {\n\t${2:Field} ${3:Type}\n}','Struct');
  mk(['go'],'iface','type ${1:Name} interface {\n\t${2:Method}() ${3:Type}\n}','Interface');
  mk(['go'],'goroutine','go func() {\n\t${1:// body}\n}()','Goroutine');
  mk(['go'],'chan','${1:ch} := make(chan ${2:Type}, ${3:0})','Channel');
  mk(['go'],'sel','select {\ncase ${1:v} := <-${2:ch}:\n\t${3:// handle}\ndefault:\n\t${4:// default}\n}','Select');
  mk(['rust'],'fn','fn ${1:name}(${2:params}) -> ${3:ReturnType} {\n\t${4:// body}\n}','Function');
  mk(['rust'],'pfn','pub fn ${1:name}(${2:params}) -> ${3:ReturnType} {\n\t${4:// body}\n}','Pub function');
  mk(['rust'],'match','match ${1:expr} {\n\t${2:Pattern} => ${3:result},\n\t_ => ${4:default},\n}','Match');
  mk(['rust'],'impl','impl ${1:Type} {\n\tpub fn new(${2:params}) -> Self {\n\t\tSelf { ${3:fields} }\n\t}\n}','Impl');
  mk(['rust'],'struct','struct ${1:Name} {\n\t${2:field}: ${3:Type},\n}','Struct');
  mk(['rust'],'enum','enum ${1:Name} {\n\t${2:Variant},\n}','Enum');
  mk(['rust'],'let','let ${1:name}: ${2:Type} = ${3:value};','Let binding');
  mk(['rust'],'letmut','let mut ${1:name}: ${2:Type} = ${3:value};','Let mut');
  mk(['rust'],'println','println!("${1:{}}", ${2:value});','println!');
  mk(['rust'],'res','Result<${1:Ok}, ${2:Err}>','Result type');
  mk(['rust'],'opt','Option<${1:T}>','Option type');
}

// ── GLOBAL KEYBOARD SHORTCUTS ─────────────────────────────────
document.addEventListener('keydown', e => {
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.key === 'p') { e.preventDefault(); openCP(); }
  if (ctrl && e.shiftKey && e.key.toUpperCase() === 'P') { e.preventDefault(); openCP(); }
  if (ctrl && e.key === 's') { e.preventDefault(); if(S.activeTab)fileSave(S.activeTab); }
  if (ctrl && e.shiftKey && e.key.toUpperCase() === 'S') { e.preventDefault(); S.tabs.forEach(t=>fileSave(t.path,true)); toast('All files saved','ok',1500); }
  if (ctrl && e.key === 'n') { e.preventDefault(); newFile(); }
  if (ctrl && e.key === 'o') { e.preventDefault(); openFolder(); }
  if (ctrl && e.key === 'w') { e.preventDefault(); if(S.activeTab)closeTab(S.activeTab); }
  if (ctrl && e.key === 'b') { e.preventDefault(); document.getElementById('sidebar').classList.toggle('off'); }
  if (ctrl && e.key === ',') { e.preventDefault(); openSettings(); }
  if (ctrl && e.shiftKey && e.key.toUpperCase() === 'A') { e.preventDefault(); toggleAI(); }
  if (ctrl && e.shiftKey && e.key.toUpperCase() === 'E') { e.preventDefault(); switchPanel('explorer'); }
  if (ctrl && e.shiftKey && e.key.toUpperCase() === 'F') { e.preventDefault(); switchPanel('search'); }
  if (ctrl && e.key === '`') { e.preventDefault(); toggleBotPanel(); }
  if (ctrl && e.shiftKey && e.key === '`') { e.preventDefault(); addTerminal(); }
  if (e.altKey && e.key === 'z') { e.preventDefault(); toggleWordWrap(); }
  if (e.key === 'F11') { e.preventDefault(); document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen().catch(()=>{}); }
  if (e.key === 'Escape') {
    document.getElementById('cp').classList.add('hidden');
    document.getElementById('ctx').classList.add('hidden');
  }
});

// AI input
document.getElementById('aiinput').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAI(); }
});
document.getElementById('aiinput').addEventListener('input', function() {
  this.style.height = ''; this.style.height = Math.min(this.scrollHeight, 150) + 'px';
});

// Drag & drop files
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => {
  e.preventDefault();
  const files = [...(e.dataTransfer?.files || [])];
  files.forEach(f => {
    if (f.size > 2 * 1024 * 1024) { toast(`${f.name}: too large (>2MB)`, 'warn'); return; }
    const r = new FileReader();
    r.onload = ev => {
      const path = f.name;
      S.files[path] = { content: ev.target.result, lang: getLang(path), dirty: false };
      buildTreeData(); refreshTree(); showTree(); openTab(path);
    };
    r.readAsText(f);
  });
  if (files.length) toast(`Opened ${files.length} file(s)`, 'ok');
});

// PWA
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); S.deferredInstall = e;
  document.getElementById('btnInstall').style.display = '';
});

// ── MAIN INIT ─────────────────────────────────────────────────
async function init() {
  loadSettings();

  // Apply saved AI model to selector
  const modelSel = document.getElementById('aiModel');
  if (S.settings.ollamaModel && modelSel) {
    const found = [...modelSel.options].find(o => o.value === S.settings.ollamaModel);
    if (found) modelSel.value = S.settings.ollamaModel;
    else {
      const opt = document.createElement('option');
      opt.value = S.settings.ollamaModel;
      opt.textContent = S.settings.ollamaModel;
      modelSel.insertBefore(opt, modelSel.lastElementChild);
      modelSel.value = S.settings.ollamaModel;
    }
  }

  // Init Monaco
  try {
    await initMonaco();
  } catch (e) {
    toast('Monaco Editor failed to load: ' + e.message, 'err', 5000);
  }

  // Init Terminal
  if (window.Terminal && FitAddon) addTerminal();
  else toast('Terminal unavailable', 'warn');

  // Resizers
  initResizers();

  // Test Ollama connection silently
  testConnection();
  // Recheck every 30s
  setInterval(testConnection, 30000);

  // Git status badge update
  setInterval(() => {
    const dirty = Object.entries(S.files).filter(([,f]) => f.dirty);
    const c = document.getElementById('gitChanges');
    if (c) {
      c.innerHTML = dirty.length
        ? dirty.map(([p]) => `<div style="padding:3px 6px;font-size:12px;display:flex;align-items:center;gap:5px"><span style="color:#fbbf24;font-size:10px;font-weight:700">M</span><span style="color:#bbb">${p.split('/').pop()}</span></div>`).join('')
        : '<div class="empty">No changes</div>';
    }
  }, 2000);

  toast('Apex IDE ready', 'ok', 2000);
}

init();
