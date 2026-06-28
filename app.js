'use strict';
// ====================================================
//  APEX IDE — app.js
// ====================================================

// ── STATE ────────────────────────────────────────────
const S = {
  files: {},          // path -> { content, lang, dirty, handle }
  tabs: [],           // [{path,name,icon}]
  activeTab: null,
  rootName: null,
  dirHandle: null,
  monacoReady: false,
  editor: null,
  models: {},
  terminals: [],
  activeTerm: -1,
  aiHistory: [],
  settings: {},
  cpIdx: 0,
  cpItems: [],
  deferredInstall: null,
};

// ── SETTINGS ─────────────────────────────────────────
const DEF = {
  fontSize: 14, tabSize: 2, wordWrap: 'off', minimap: true,
  lineNumbers: 'on', theme: 'apex-dark', autoSave: true,
  formatOnSave: false, bracketPairs: true, fontFamily: "'Cascadia Code','Fira Code',Consolas,monospace",
  termFontSize: 13, glmKey: '', glmModel: 'glm-4-flash',
  renderWhitespace: 'selection', cursorBlinking: 'smooth',
};
function loadSettings() {
  try { S.settings = { ...DEF, ...JSON.parse(localStorage.getItem('apex-settings') || '{}') }; }
  catch { S.settings = { ...DEF }; }
}
function saveSettings() { localStorage.setItem('apex-settings', JSON.stringify(S.settings)); }

// ── LANGUAGE DETECTION ───────────────────────────────
const LANG_MAP = {
  js:'javascript',mjs:'javascript',cjs:'javascript',jsx:'javascript',
  ts:'typescript',tsx:'typescript',
  html:'html',htm:'html',vue:'html',svelte:'html',
  css:'css',scss:'scss',sass:'scss',less:'less',
  json:'json',jsonc:'json',
  py:'python',pyw:'python',
  rs:'rust',go:'go',java:'java',kt:'kotlin',
  c:'c',h:'c',cpp:'cpp',cc:'cpp',hpp:'cpp',
  cs:'csharp',php:'php',rb:'ruby',swift:'swift',
  sh:'shell',bash:'shell',zsh:'shell',fish:'shell',
  ps1:'powershell',bat:'bat',cmd:'bat',
  sql:'sql',yaml:'yaml',yml:'yaml',toml:'ini',ini:'ini',env:'ini',
  md:'markdown',mdx:'markdown',xml:'xml',svg:'xml',
  dockerfile:'dockerfile',tf:'hcl',hcl:'hcl',
  graphql:'graphql',gql:'graphql',
  r:'r',dart:'dart',lua:'lua',ex:'elixir',exs:'elixir',
  hs:'haskell',erl:'erlang',fs:'fsharp',clj:'clojure',
  tex:'latex',
};
const ICON_MAP = {
  js:'🟨',ts:'🔷',tsx:'🔷',jsx:'🟧',html:'🌐',css:'🎨',scss:'🎨',
  json:'📋',py:'🐍',rs:'🦀',go:'🐹',java:'☕',md:'📝',
  vue:'💚',php:'🐘',rb:'💎',c:'🔵',cpp:'🔵',cs:'🟣',
  yaml:'⚙',yml:'⚙',sh:'⚡',sql:'🗄',dockerfile:'🐳',env:'🔑',
  xml:'📄',svg:'🎨',graphql:'🔮',kt:'🟣',swift:'🟠',
};
function getExt(p) { const s = p.split('.'); return s.length > 1 ? s.pop().toLowerCase() : ''; }
function getLang(p) {
  const name = p.split('/').pop();
  if (name.toLowerCase() === 'dockerfile') return 'dockerfile';
  return LANG_MAP[getExt(name)] || 'plaintext';
}
function getIcon(p) {
  const name = p.split('/').pop().toLowerCase();
  if (name === 'dockerfile') return '🐳';
  if (name === 'package.json') return '📦';
  if (name === 'readme.md') return '📖';
  if (name === '.gitignore') return '🔀';
  return ICON_MAP[getExt(name)] || '📄';
}

// ── TOAST ─────────────────────────────────────────────
function toast(msg, type = 'info', dur = 3000) {
  const icons = { info:'ℹ', ok:'✓', err:'✕', warn:'⚠' };
  const el = document.createElement('div');
  el.className = `toast-item ${type}`;
  el.innerHTML = `<span>${icons[type]||'ℹ'}</span><span>${msg}</span>`;
  document.getElementById('toast').appendChild(el);
  setTimeout(() => el.remove(), dur);
}

// ── MONACO INIT ──────────────────────────────────────
function initMonaco() {
  return new Promise(resolve => {
    require(['vs/editor/editor.main'], () => {
      // Define theme
      monaco.editor.defineTheme('apex-dark', {
        base: 'vs-dark', inherit: true,
        rules: [
          { token: 'comment', foreground: '4a5060', fontStyle: 'italic' },
          { token: 'keyword', foreground: 'c792ea' },
          { token: 'string', foreground: 'c3e88d' },
          { token: 'number', foreground: 'f78c6c' },
          { token: 'type', foreground: 'ffcb6b' },
          { token: 'function', foreground: '82aaff' },
          { token: 'variable', foreground: 'eeffff' },
          { token: 'operator', foreground: '89ddff' },
          { token: 'constant', foreground: 'f78c6c' },
          { token: 'class', foreground: 'ffcb6b' },
          { token: 'interface', foreground: 'ffcb6b' },
          { token: 'parameter', foreground: 'f07178' },
          { token: 'property', foreground: 'f07178' },
        ],
        colors: {
          'editor.background': '#0d0d0f',
          'editor.foreground': '#eeeef5',
          'editor.lineHighlightBackground': '#1a1a2880',
          'editor.selectionBackground': '#7c3aed40',
          'editor.inactiveSelectionBackground': '#7c3aed20',
          'editorCursor.foreground': '#a78bfa',
          'editorLineNumber.foreground': '#33334a',
          'editorLineNumber.activeForeground': '#666680',
          'editorGutter.background': '#0d0d0f',
          'editorIndentGuide.background': '#1a1a28',
          'editorIndentGuide.activeBackground': '#7c3aed50',
          'editorBracketMatch.background': '#7c3aed30',
          'editorBracketMatch.border': '#7c3aed',
          'editor.findMatchBackground': '#7c3aed50',
          'editor.findMatchHighlightBackground': '#7c3aed25',
          'editorWidget.background': '#111118',
          'editorWidget.border': '#222230',
          'editorSuggestWidget.background': '#111118',
          'editorSuggestWidget.border': '#222230',
          'editorSuggestWidget.selectedBackground': '#1e1e30',
          'editorSuggestWidget.highlightForeground': '#a78bfa',
          'list.hoverBackground': '#1a1a28',
          'list.focusBackground': '#1e1e30',
          'scrollbarSlider.background': '#2a2a3a80',
          'scrollbarSlider.hoverBackground': '#3a3a4a80',
          'scrollbarSlider.activeBackground': '#7c3aed60',
          'minimap.background': '#0d0d0f',
          'peekViewEditor.background': '#0a0a12',
          'peekViewResult.background': '#111118',
          'input.background': '#1a1a28',
          'input.border': '#2a2a3a',
          'focusBorder': '#7c3aed',
          'tab.activeBackground': '#1e1e2e',
          'tab.inactiveBackground': '#111118',
          'statusBar.background': '#5b21b6',
        }
      });

      // Create editor
      S.editor = monaco.editor.create(document.getElementById('monacoEl'), {
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
        renderLineHighlight: 'all',
        bracketPairColorization: { enabled: S.settings.bracketPairs },
        guides: { bracketPairs: true, indentation: true },
        suggest: {
          showKeywords: true, showSnippets: true, showClasses: true,
          showFunctions: true, showVariables: true, showModules: true,
          preview: true,
        },
        quickSuggestions: { other: true, comments: false, strings: true },
        parameterHints: { enabled: true },
        tabCompletion: 'on',
        snippetSuggestions: 'top',
        autoClosingBrackets: 'always',
        autoClosingQuotes: 'always',
        autoSurround: 'languageDefined',
        hover: { enabled: true, delay: 400 },
        formatOnType: true,
        formatOnPaste: true,
        autoIndent: 'full',
        renderWhitespace: S.settings.renderWhitespace || 'selection',
        linkedEditing: true,
        'semanticHighlighting.enabled': true,
        padding: { top: 8, bottom: 8 },
        accessibilitySupport: 'off',
      });

      // Events
      S.editor.onDidChangeCursorPosition(e => {
        const p = e.position;
        document.getElementById('sbCursor').textContent = `Ln ${p.lineNumber}, Col ${p.column}`;
      });

      S.editor.onDidChangeModelContent(() => {
        if (!S.activeTab) return;
        const file = S.files[S.activeTab];
        if (file && !file.dirty) {
          file.dirty = true;
          updateTabUI(S.activeTab);
        }
        if (S.settings.autoSave) {
          clearTimeout(S._saveTimer);
          S._saveTimer = setTimeout(() => fileSave(S.activeTab), 1500);
        }
        refreshProblems();
      });

      S.editor.onDidChangeModelLanguage(e => {
        document.getElementById('sbLang').textContent = e.newLanguage.charAt(0).toUpperCase() + e.newLanguage.slice(1);
      });

      // Keyboard shortcuts
      S.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => fileSave(S.activeTab));
      S.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyP, openCmdPalette);
      S.editor.addCommand(monaco.KeyCode.F1, openCmdPalette);
      S.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyA, toggleAI);
      S.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyP, openCmdPalette);

      // Context menu actions
      S.editor.addAction({ id:'apex.explain', label:'✦ Explain Code', contextMenuGroupId:'apex', contextMenuOrder:1, run:() => aiAction('explain') });
      S.editor.addAction({ id:'apex.fix', label:'✦ Fix Bug', contextMenuGroupId:'apex', contextMenuOrder:2, run:() => aiAction('fix') });
      S.editor.addAction({ id:'apex.refactor', label:'✦ Refactor', contextMenuGroupId:'apex', contextMenuOrder:3, run:() => aiAction('refactor') });
      S.editor.addAction({ id:'apex.tests', label:'✦ Generate Tests', contextMenuGroupId:'apex', contextMenuOrder:4, run:() => aiAction('tests') });
      S.editor.addAction({ id:'apex.docs', label:'✦ Add Documentation', contextMenuGroupId:'apex', contextMenuOrder:5, run:() => aiAction('docs') });
      S.editor.addAction({ id:'apex.complete', label:'✦ Complete Code', contextMenuGroupId:'apex', contextMenuOrder:6, run:() => aiAction('complete') });

      // Snippet providers
      registerSnippets();

      S.monacoReady = true;
      resolve();
    });
  });
}

// ── FILE SYSTEM ──────────────────────────────────────
async function openFolder() {
  if (!('showDirectoryPicker' in window)) {
    // Fallback: file input
    const inp = document.createElement('input');
    inp.type = 'file'; inp.multiple = true; inp.webkitdirectory = true;
    inp.onchange = e => {
      const files = [...e.target.files];
      if (!files.length) return;
      S.rootName = files[0].webkitRelativePath.split('/')[0] || 'workspace';
      S.files = {}; S.tabs = []; S.activeTab = null;
      let loaded = 0;
      files.forEach(f => {
        const path = f.webkitRelativePath || f.name;
        if (shouldSkip(path)) return;
        const r = new FileReader();
        r.onload = ev => {
          S.files[path] = { content: ev.target.result, lang: getLang(path), dirty: false };
          loaded++;
          if (loaded === files.filter(x => !shouldSkip(x.webkitRelativePath || x.name)).length) {
            refreshTree(); showTree();
            toast(`Opened: ${S.rootName} (${loaded} files)`, 'ok');
          }
        };
        r.readAsText(f);
      });
    };
    inp.click();
    return;
  }
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    S.dirHandle = handle;
    S.rootName = handle.name;
    S.files = {}; S.tabs = []; S.activeTab = null;
    updateTabs();
    showWelcome();
    toast('Reading folder...', 'info', 1000);
    await readDir(handle, '');
    refreshTree(); showTree();
    toast(`Opened: ${S.rootName}`, 'ok');
  } catch (e) {
    if (e.name !== 'AbortError') toast('Could not open folder: ' + e.message, 'err');
  }
}

function shouldSkip(path) {
  const skip = ['node_modules/', '.git/', '.DS_Store', 'dist/', 'build/', '__pycache__/', '.next/', 'target/'];
  return skip.some(s => path.includes(s));
}

async function readDir(dirHandle, prefix) {
  for await (const [name, entry] of dirHandle.entries()) {
    const path = prefix ? `${prefix}/${name}` : name;
    if (shouldSkip(path + (entry.kind === 'directory' ? '/' : ''))) continue;
    if (entry.kind === 'file') {
      try {
        const file = await entry.getFile();
        // Only read text files under 2MB
        if (file.size < 2 * 1024 * 1024) {
          const text = await file.text();
          S.files[path] = { content: text, lang: getLang(name), dirty: false, handle: entry };
        }
      } catch {}
    } else if (entry.kind === 'directory') {
      await readDir(entry, path);
    }
  }
}

function newProject() {
  const name = prompt('Project name:', 'my-app');
  if (!name) return;
  S.rootName = name; S.files = {}; S.tabs = []; S.activeTab = null;
  const defaults = {
    [`${name}/index.html`]: `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8"/>\n  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>\n  <title>${name}</title>\n  <link rel="stylesheet" href="style.css"/>\n</head>\n<body>\n  <h1>Hello from ${name}!</h1>\n  <script src="app.js"><\/script>\n</body>\n</html>`,
    [`${name}/style.css`]: `*{box-sizing:border-box;margin:0;padding:0}\nbody{font-family:system-ui,sans-serif;line-height:1.6;padding:2rem}\nh1{color:#7c3aed}`,
    [`${name}/app.js`]: `'use strict';\n\nfunction init() {\n  console.log('${name} loaded');\n}\n\ndocument.addEventListener('DOMContentLoaded', init);`,
    [`${name}/README.md`]: `# ${name}\n\nBuilt with Apex IDE.\n`,
  };
  Object.entries(defaults).forEach(([k,v]) => { S.files[k] = { content: v, lang: getLang(k), dirty: false }; });
  refreshTree(); showTree();
  openTab(`${name}/index.html`);
  toast(`Created project: ${name}`, 'ok');
}

function newFile(prefix) {
  const name = prompt('File name:', 'untitled.js');
  if (!name) return;
  const path = (prefix ? prefix + '/' : (S.rootName ? S.rootName + '/' : '')) + name;
  S.files[path] = { content: '', lang: getLang(path), dirty: false };
  refreshTree();
  openTab(path);
  toast(`Created: ${name}`, 'ok');
}

function newFolder(prefix) {
  const name = prompt('Folder name:', 'new-folder');
  if (!name) return;
  // Create a placeholder .gitkeep
  const path = (prefix ? prefix + '/' : (S.rootName ? S.rootName + '/' : '')) + name + '/.gitkeep';
  S.files[path] = { content: '', lang: 'plaintext', dirty: false };
  refreshTree();
  toast(`Created folder: ${name}`, 'ok');
}

async function fileSave(path) {
  if (!path || !S.files[path]) return;
  if (S.monacoReady && S.models[path]) {
    if (S.settings.formatOnSave) {
      try { await S.editor.getAction('editor.action.formatDocument').run(); } catch {}
    }
    S.files[path].content = S.models[path].getValue();
  }
  S.files[path].dirty = false;
  updateTabUI(path);
  // Try to write to disk if we have a handle
  if (S.files[path].handle) {
    try {
      const w = await S.files[path].handle.createWritable();
      await w.write(S.files[path].content);
      await w.close();
    } catch {}
  }
  toast(`Saved: ${path.split('/').pop()}`, 'ok', 1500);
}

// ── FILE TREE ─────────────────────────────────────────
function showTree() {
  document.getElementById('noFolderMsg').classList.add('hidden');
  document.getElementById('fileTree').classList.remove('hidden');
}
function showWelcome() {
  document.getElementById('welcome').classList.remove('hidden');
  document.getElementById('monacoEl').classList.add('hidden');
}

function refreshTree() {
  const container = document.getElementById('fileTree');
  container.innerHTML = '';
  if (!Object.keys(S.files).length) {
    container.innerHTML = '<div class="tree-empty">No files</div>';
    return;
  }
  const tree = buildTree();
  renderTree(container, tree, 0);
  // Re-mark active
  highlightActiveInTree();
}

function buildTree() {
  const root = {};
  Object.keys(S.files).sort().forEach(path => {
    const parts = path.split('/');
    let node = root;
    parts.forEach((p, i) => {
      if (i === parts.length - 1) {
        node[p] = { __file: path };
      } else {
        if (!node[p]) node[p] = {};
        node = node[p];
      }
    });
  });
  return root;
}

function renderTree(container, node, depth) {
  // Sort: dirs first, then files
  const entries = Object.entries(node).sort(([a, av], [b, bv]) => {
    const aDir = !av.__file, bDir = !bv.__file;
    if (aDir && !bDir) return -1;
    if (!aDir && bDir) return 1;
    return a.localeCompare(b);
  });

  entries.forEach(([name, val]) => {
    if (name === '.gitkeep' && val.__file) return; // hide placeholder
    const el = document.createElement('div');

    if (val.__file) {
      // File
      el.className = 'tree-item' + (val.__file === S.activeTab ? ' active' : '');
      el.style.paddingLeft = (6 + depth * 14) + 'px';
      el.dataset.path = val.__file;
      el.innerHTML = `<span class="tree-icon">${getIcon(name)}</span><span class="tree-label">${name}</span>${S.files[val.__file]?.dirty ? '<span class="tree-modified"></span>' : ''}`;
      el.addEventListener('click', () => openTab(val.__file));
      el.addEventListener('contextmenu', e => showCtxMenu(e, val.__file, 'file'));
    } else {
      // Folder
      el.className = 'tree-item';
      el.style.paddingLeft = (6 + depth * 14) + 'px';
      el.dataset.dir = name;
      const ch = document.createElement('span');
      ch.className = 'tree-chevron open';
      ch.textContent = '›';
      el.appendChild(ch);
      const icon = document.createElement('span');
      icon.className = 'tree-icon';
      icon.textContent = '📁';
      el.appendChild(icon);
      const label = document.createElement('span');
      label.className = 'tree-label';
      label.textContent = name;
      el.appendChild(label);
      const childWrap = document.createElement('div');
      childWrap.className = 'tree-children';
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = ch.classList.toggle('open');
        childWrap.style.display = open ? '' : 'none';
        icon.textContent = open ? '📂' : '📁';
      });
      el.addEventListener('contextmenu', e => {
        // Get full folder path from children
        const firstChild = Object.values(val)[0];
        const folderPath = firstChild?.__file?.split('/').slice(0,-1).join('/') || name;
        showCtxMenu(e, folderPath, 'folder');
      });
      container.appendChild(el);
      renderTree(childWrap, val, depth + 1);
      container.appendChild(childWrap);
      return;
    }
    container.appendChild(el);
  });
}

function highlightActiveInTree() {
  document.querySelectorAll('#fileTree .tree-item').forEach(el => {
    el.classList.toggle('active', el.dataset.path === S.activeTab);
  });
}

// ── TABS ─────────────────────────────────────────────
function openTab(path) {
  if (!S.tabs.find(t => t.path === path)) {
    S.tabs.push({ path, name: path.split('/').pop(), icon: getIcon(path) });
  }
  S.activeTab = path;
  updateTabs();
  loadInEditor(path);
  document.getElementById('welcome').classList.add('hidden');
  document.getElementById('monacoEl').classList.remove('hidden');
  document.getElementById('breadcrumb').textContent = path;
  if (S.monacoReady) S.editor.focus();
  highlightActiveInTree();
}

function updateTabs() {
  const list = document.getElementById('tabsList');
  list.innerHTML = '';
  S.tabs.forEach(t => {
    const el = document.createElement('div');
    const dirty = S.files[t.path]?.dirty;
    el.className = 'tab' + (t.path === S.activeTab ? ' active' : '') + (dirty ? ' dirty' : '');
    el.dataset.path = t.path;
    el.innerHTML = `<span class="tab-icon">${t.icon}</span><span class="tab-name" title="${t.path}">${t.name}</span><span class="tab-close" data-close="${t.path}">✕</span>`;
    el.addEventListener('click', (e) => {
      if (e.target.dataset.close) { closeTab(e.target.dataset.close); return; }
      openTab(t.path);
    });
    list.appendChild(el);
  });
  // Scroll active into view
  const active = list.querySelector('.tab.active');
  if (active) active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function updateTabUI(path) {
  updateTabs();
  refreshTree();
}

function closeTab(path) {
  const file = S.files[path];
  if (file?.dirty) {
    const save = confirm(`Save changes to ${path.split('/').pop()}?`);
    if (save) fileSave(path);
    else file.dirty = false;
  }
  S.tabs = S.tabs.filter(t => t.path !== path);
  if (S.models[path]) { S.models[path].dispose(); delete S.models[path]; }
  if (S.activeTab === path) {
    S.activeTab = S.tabs.length ? S.tabs[S.tabs.length - 1].path : null;
    if (S.activeTab) { loadInEditor(S.activeTab); highlightActiveInTree(); }
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
  const lang = getLang(path);
  document.getElementById('sbLang').textContent = lang.charAt(0).toUpperCase() + lang.slice(1);
  document.getElementById('sbIndent').textContent = `Spaces: ${S.settings.tabSize}`;
}

// ── CONTEXT MENU ─────────────────────────────────────
function showCtxMenu(e, path, type) {
  e.preventDefault();
  const menu = document.getElementById('ctxMenu');
  menu.classList.remove('hidden');
  menu.style.left = Math.min(e.clientX, window.innerWidth - 170) + 'px';
  menu.style.top = Math.min(e.clientY, window.innerHeight - 200) + 'px';
  if (type === 'file') {
    menu.innerHTML = `
      <div class="ctx-item" onclick="openTab('${path}');hideCtx()">Open</div>
      <div class="ctx-sep"></div>
      <div class="ctx-item" onclick="renameFile('${path}');hideCtx()">Rename</div>
      <div class="ctx-item" onclick="deleteFile('${path}');hideCtx()">Delete</div>
      <div class="ctx-sep"></div>
      <div class="ctx-item" onclick="navigator.clipboard.writeText('${path}');toast('Path copied','ok');hideCtx()">Copy Path</div>
    `;
  } else {
    menu.innerHTML = `
      <div class="ctx-item" onclick="newFile('${path}');hideCtx()">New File</div>
      <div class="ctx-item" onclick="newFolder('${path}');hideCtx()">New Folder</div>
    `;
  }
}
function hideCtx() { document.getElementById('ctxMenu').classList.add('hidden'); }
document.addEventListener('click', hideCtx);
document.addEventListener('keydown', e => { if (e.key === 'Escape') { hideCtx(); closeCmdPalette(); } });

function renameFile(path) {
  const oldName = path.split('/').pop();
  const newName = prompt('Rename to:', oldName);
  if (!newName || newName === oldName) return;
  const prefix = path.includes('/') ? path.split('/').slice(0,-1).join('/') + '/' : '';
  const newPath = prefix + newName;
  S.files[newPath] = { ...S.files[path] };
  delete S.files[path];
  if (S.models[path]) { S.models[path].dispose(); delete S.models[path]; }
  const ti = S.tabs.findIndex(t => t.path === path);
  if (ti >= 0) { S.tabs[ti] = { path: newPath, name: newName, icon: getIcon(newName) }; }
  if (S.activeTab === path) { S.activeTab = newPath; }
  refreshTree(); updateTabs();
  if (S.activeTab === newPath) loadInEditor(newPath);
  toast(`Renamed to ${newName}`, 'ok');
}

function deleteFile(path) {
  if (!confirm(`Delete ${path.split('/').pop()}?`)) return;
  delete S.files[path];
  if (S.models[path]) { S.models[path].dispose(); delete S.models[path]; }
  S.tabs = S.tabs.filter(t => t.path !== path);
  if (S.activeTab === path) { S.activeTab = S.tabs[0]?.path || null; }
  refreshTree(); updateTabs();
  if (S.activeTab) loadInEditor(S.activeTab); else showWelcome();
  toast(`Deleted`, 'ok');
}

// ── SEARCH ───────────────────────────────────────────
function doSearch() {
  const q = document.getElementById('searchQ').value.trim();
  if (!q) return;
  const caseSensitive = document.getElementById('srCase').checked;
  const isRegex = document.getElementById('srRegex').checked;
  const results = document.getElementById('searchResults');
  results.innerHTML = '';
  let total = 0;
  Object.entries(S.files).forEach(([path, file]) => {
    const lines = file.content.split('\n');
    const matches = [];
    lines.forEach((line, i) => {
      let hit;
      try {
        if (isRegex) hit = new RegExp(q, caseSensitive ? 'g' : 'gi').test(line);
        else hit = caseSensitive ? line.includes(q) : line.toLowerCase().includes(q.toLowerCase());
      } catch { return; }
      if (hit) matches.push({ ln: i + 1, text: line.trim().slice(0, 100) });
    });
    if (!matches.length) return;
    total += matches.length;
    const fEl = document.createElement('div');
    fEl.className = 'sr-file';
    fEl.innerHTML = `<div class="sr-fname">${path.split('/').pop()} <span style="color:#444;font-size:11px">${path}</span></div>`;
    matches.slice(0, 20).forEach(m => {
      const mEl = document.createElement('div');
      mEl.className = 'sr-match';
      const esc = m.text.replace(/</g,'&lt;').replace(/>/g,'&gt;');
      const hi = isRegex ? esc.replace(new RegExp(q, caseSensitive?'g':'gi'), s=>`<mark>${s}</mark>`) : esc.replace(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), caseSensitive?'g':'gi'), s=>`<mark>${s}</mark>`);
      mEl.innerHTML = `${m.ln}: ${hi}`;
      mEl.onclick = () => { openTab(path); setTimeout(() => { if (S.monacoReady) { S.editor.revealLineInCenter(m.ln); S.editor.setPosition({lineNumber:m.ln,column:1}); } }, 80); };
      fEl.appendChild(mEl);
    });
    results.appendChild(fEl);
  });
  if (!total) results.innerHTML = '<div style="padding:12px;color:#444;font-size:12px">No results found</div>';
}

// ── TERMINAL ─────────────────────────────────────────
function addTerminal() {
  if (!window.Terminal) return;
  const id = S.terminals.length;
  const term = new Terminal({
    cursorBlink: true, cursorStyle: 'bar',
    fontFamily: S.settings.fontFamily || "'Cascadia Code',Consolas,monospace",
    fontSize: S.settings.termFontSize || 13,
    theme: {
      background:'#0d0d0f', foreground:'#eeeef5', cursor:'#a78bfa',
      selectionBackground:'rgba(124,58,237,.3)',
      black:'#1a1a28', red:'#ff6b6b', green:'#34d399', yellow:'#fbbf24',
      blue:'#60a5fa', magenta:'#a78bfa', cyan:'#22d3ee', white:'#eeeef5',
      brightBlack:'#444466', brightRed:'#ff8080', brightGreen:'#6ee7b7',
      brightYellow:'#fde68a', brightBlue:'#93c5fd', brightMagenta:'#c4b5fd',
      brightCyan:'#67e8f9', brightWhite:'#ffffff',
    },
    scrollback: 10000, rightClickSelectsWord: true,
  });
  const fa = new FitAddon.FitAddon();
  term.loadAddon(fa);

  const wrap = document.createElement('div');
  wrap.style.cssText = 'width:100%;height:100%;display:none';
  wrap.id = 'term-' + id;
  document.getElementById('termContainer').appendChild(wrap);
  term.open(wrap); fa.fit();

  const shell = new ShellSim(term);
  S.terminals.push({ term, fa, shell, wrap, id, name: `bash ${id+1}` });

  // Tab
  const tabEl = document.createElement('div');
  tabEl.className = 'term-tab'; tabEl.dataset.id = id;
  tabEl.innerHTML = `⚡ bash ${id+1} <span class="term-tab-close" onclick="killTerm(${id})">✕</span>`;
  tabEl.onclick = (e) => { if (e.target.classList.contains('term-tab-close')) return; switchTerm(id); };
  document.getElementById('termTabs').appendChild(tabEl);

  switchTerm(id);
  window.addEventListener('resize', () => { try { fa.fit(); } catch {} });
}

function switchTerm(id) {
  S.activeTerm = id;
  S.terminals.forEach(t => { if (t) t.wrap.style.display = t.id === id ? 'block' : 'none'; });
  document.querySelectorAll('.term-tab').forEach(el => el.classList.toggle('active', +el.dataset.id === id));
  try { S.terminals[id]?.fa.fit(); } catch {}
}

function killTerm(id) {
  const t = S.terminals[id];
  if (!t) return;
  t.term.dispose(); t.wrap.remove();
  document.querySelector(`.term-tab[data-id="${id}"]`)?.remove();
  S.terminals[id] = null;
  const alive = S.terminals.findIndex(x => x);
  if (alive >= 0) switchTerm(alive); else addTerminal();
}

// ── SHELL SIMULATOR ──────────────────────────────────
class ShellSim {
  constructor(term) {
    this.term = term;
    this.buf = '';
    this.hist = [];
    this.histIdx = -1;
    this.cwd = '/workspace';
    this.env = { HOME:'/workspace', USER:'dev', SHELL:'/bin/bash', TERM:'xterm-256color' };
    this.running = false;

    term.writeln('\x1b[38;5;141m ▸ Apex IDE Terminal\x1b[0m\x1b[38;5;240m — Bash Simulator\x1b[0m');
    term.writeln('\x1b[38;5;240m   Type \x1b[38;5;141mhelp\x1b[38;5;240m for commands\x1b[0m');
    term.writeln('');
    this.prompt();

    term.onKey(({ key, domEvent: ev }) => {
      if (this.running) {
        if (ev.ctrlKey && ev.key === 'c') { term.writeln('^C'); this.running = false; this.prompt(); }
        return;
      }
      if (ev.key === 'Enter') {
        term.writeln('');
        this.run(this.buf.trim());
        this.buf = '';
      } else if (ev.key === 'Backspace') {
        if (this.buf.length) { this.buf = this.buf.slice(0,-1); term.write('\b \b'); }
      } else if (ev.key === 'ArrowUp') {
        if (this.histIdx < this.hist.length - 1) {
          this.histIdx++; this.replaceInput(this.hist[this.histIdx] || '');
        }
      } else if (ev.key === 'ArrowDown') {
        if (this.histIdx > 0) { this.histIdx--; this.replaceInput(this.hist[this.histIdx] || ''); }
        else { this.histIdx = -1; this.replaceInput(''); }
      } else if (ev.key === 'Tab') {
        this.autocomplete();
      } else if (ev.ctrlKey && ev.key === 'c') {
        term.writeln('^C'); this.buf = ''; this.prompt();
      } else if (ev.ctrlKey && ev.key === 'l') {
        term.write('\x1b[2J\x1b[H'); this.prompt();
      } else if (!ev.ctrlKey && !ev.metaKey && !ev.altKey && key.length === 1) {
        this.buf += key; term.write(key);
      }
    });

    term.onData(d => {
      if (d.length > 1 && !d.startsWith('\x1b')) { this.buf += d; term.write(d); }
    });
  }

  prompt() {
    const short = this.cwd.replace('/workspace','~');
    this.term.write(`\r\x1b[38;5;141mdev\x1b[0m\x1b[38;5;240m@\x1b[0m\x1b[38;5;75mapex\x1b[0m:\x1b[38;5;221m${short}\x1b[0m\x1b[38;5;75m$\x1b[0m `);
  }

  replaceInput(text) {
    this.term.write(`\r\x1b[K`);
    const short = this.cwd.replace('/workspace','~');
    this.term.write(`\x1b[38;5;141mdev\x1b[0m\x1b[38;5;240m@\x1b[0m\x1b[38;5;75mapex\x1b[0m:\x1b[38;5;221m${short}\x1b[0m\x1b[38;5;75m$\x1b[0m ${text}`);
    this.buf = text;
  }

  autocomplete() {
    const cmds = ['ls','cd','pwd','cat','echo','mkdir','touch','rm','cp','mv','grep','find','node','python3','npm','git','curl','which','env','export','clear','help','code','wc'];
    const word = this.buf.split(' ').pop();
    const hits = cmds.filter(c => c.startsWith(word));
    if (hits.length === 1) { const add = hits[0].slice(word.length); this.buf += add; this.term.write(add); }
    else if (hits.length > 1) { this.term.writeln(''); this.term.writeln(hits.join('  ')); this.prompt(); this.term.write(this.buf); }
  }

  run(cmd) {
    if (!cmd) { this.prompt(); return; }
    this.hist.unshift(cmd); this.histIdx = -1;
    const parts = this.parse(cmd);
    const [prog, ...args] = parts;
    const w = s => this.term.writeln(s);
    const wr = s => this.term.write(s);

    switch (prog) {
      case 'clear': case 'cls': this.term.write('\x1b[2J\x1b[H'); break;
      case 'pwd': w(this.cwd); break;
      case 'echo': w(args.join(' ').replace(/\$(\w+)/g, (_, k) => this.env[k] || '')); break;
      case 'env': Object.entries(this.env).forEach(([k,v]) => w(`${k}=${v}`)); break;
      case 'export': { const [k,v] = (args[0]||'').split('='); if(k&&v!==undefined) this.env[k]=v; break; }
      case 'ls': {
        const target = args.filter(a=>!a.startsWith('-'))[0] || '.';
        const files = Object.keys(S.files);
        if (!files.length) { w('\x1b[38;5;240m(empty directory)\x1b[0m'); break; }
        const dirs = new Set(); const fileList = [];
        files.forEach(p => {
          const parts2 = p.split('/');
          if (parts2.length > 1) dirs.add(parts2[0]);
          else fileList.push(p);
        });
        dirs.forEach(d => wr(`\x1b[38;5;75m${d}/\x1b[0m  `));
        fileList.forEach(f => wr(`${f}  `));
        if (dirs.size || fileList.length) this.term.writeln('');
        break;
      }
      case 'cd': {
        const t = args[0] || '~';
        if (t === '~' || t === '/workspace') this.cwd = '/workspace';
        else if (t === '..') this.cwd = this.cwd.split('/').slice(0,-1).join('/') || '/';
        else this.cwd = t.startsWith('/') ? t : `${this.cwd}/${t}`;
        break;
      }
      case 'cat': {
        const p = args[0];
        if (!p) { w('\x1b[38;5;196mcat: missing operand\x1b[0m'); break; }
        const key = Object.keys(S.files).find(k => k.endsWith(p) || k === p);
        if (key) w(S.files[key].content);
        else w(`\x1b[38;5;196mcat: ${p}: No such file\x1b[0m`);
        break;
      }
      case 'touch': {
        if (!args[0]) break;
        const p = args[0];
        if (!S.files[p]) { S.files[p] = {content:'',lang:getLang(p),dirty:false}; refreshTree(); showTree(); }
        break;
      }
      case 'mkdir': {
        const name = args.filter(a=>!a.startsWith('-'))[0];
        if (name) { S.files[`${name}/.gitkeep`]={content:'',lang:'plaintext',dirty:false}; refreshTree(); showTree(); toast(`mkdir: ${name}`, 'ok', 1500); }
        break;
      }
      case 'rm': {
        const flags = args.filter(a=>a.startsWith('-')).join('');
        const targets = args.filter(a=>!a.startsWith('-'));
        targets.forEach(t => {
          const key = Object.keys(S.files).find(k => k.endsWith(t) || k === t);
          if (key) { delete S.files[key]; if(S.models[key]){S.models[key].dispose();delete S.models[key];} S.tabs=S.tabs.filter(x=>x.path!==key); if(S.activeTab===key){S.activeTab=S.tabs[0]?.path||null;} }
        });
        refreshTree(); updateTabs();
        if (!S.activeTab) showWelcome();
        break;
      }
      case 'node': {
        if (args[0] === '-e') {
          try { const r = new Function(`"use strict";return(${args.slice(1).join(' ')})`)(); if(r!==undefined)w(String(r)); }
          catch(e) { w(`\x1b[38;5;196m${e.message}\x1b[0m`); }
        } else if (args[0]) {
          const key = Object.keys(S.files).find(k=>k.endsWith(args[0])||k===args[0]);
          if (key) {
            try {
              const logs = [];
              const fake = { log:(...a)=>logs.push(a.join(' ')), error:(...a)=>logs.push('\x1b[38;5;196m'+a.join(' ')+'\x1b[0m'), warn:(...a)=>logs.push('\x1b[38;5;220m'+a.join(' ')+'\x1b[0m') };
              new Function('console', S.files[key].content)(fake);
              logs.forEach(l=>w(l));
              if (!logs.length) w('\x1b[38;5;82m(no output)\x1b[0m');
            } catch(e) { w(`\x1b[38;5;196m${e.message}\x1b[0m`); }
          } else w(`\x1b[38;5;196mError: Cannot find '${args[0]}'\x1b[0m`);
        } else w('Node.js v20 (simulated)\n> ');
        break;
      }
      case 'python3': case 'python': {
        if (args[0]) w(`\x1b[38;5;240m[Python sim: ${args[0]}]\x1b[0m\n\x1b[38;5;82m(Link a real Python backend for execution)\x1b[0m`);
        else w('Python 3.12 (simulated)\n>>> ');
        break;
      }
      case 'npm': {
        const sub = args[0];
        if (sub === 'init') {
          const pkg = {name:S.rootName||'app',version:'1.0.0',main:'index.js',scripts:{start:'node index.js',test:'jest'},dependencies:{},devDependencies:{}};
          const path = (S.rootName||'') + '/package.json';
          S.files[path] = {content:JSON.stringify(pkg,null,2),lang:'json',dirty:false};
          refreshTree(); showTree(); w('\x1b[38;5;82mCreated package.json\x1b[0m');
        } else if (sub === 'install' || sub === 'i') {
          const pkg = args[1] || 'dependencies';
          w(`\x1b[38;5;240m> npm install ${pkg}\x1b[0m`);
          this.running = true;
          let n = 0; const iv = setInterval(()=>{ wr('\x1b[38;5;141m█\x1b[0m'); n++; if(n>15){clearInterval(iv);this.term.writeln(''); w('\x1b[38;5;82madded packages (simulated)\x1b[0m'); this.running=false; this.prompt(); }}, 100);
          return;
        } else if (sub === 'run') {
          w(`\x1b[38;5;240m> ${args[1]}\x1b[0m`);
          w('\x1b[38;5;82mScript started (simulated)\x1b[0m');
        } else w(`npm: ${sub||'<command>'}`);
        break;
      }
      case 'git': {
        const sub = args[0];
        if (sub==='init') { w('\x1b[38;5;82mInitialized empty Git repository in .git/\x1b[0m'); }
        else if (sub==='status') { const dirty = Object.entries(S.files).filter(([_,f])=>f.dirty); w(`On branch main\n${dirty.length?dirty.map(([p])=>`\tmodified: ${p}`).join('\n'):'nothing to commit, working tree clean'}`); }
        else if (sub==='add') w(`\x1b[38;5;82mStaged: ${args.slice(1).join(', ')||'.'}\x1b[0m`);
        else if (sub==='commit') { const m=args[args.indexOf('-m')+1]||'commit'; w(`\x1b[38;5;82m[main a1b2c3] ${m.replace(/^"|"$/g,'')}\x1b[0m`); }
        else if (sub==='log') w('\x1b[38;5;220mcommit a1b2c3d\x1b[0m\nAuthor: dev <dev@apex>\nDate: today\n\n    Initial commit\n');
        else if (sub==='branch') w('* \x1b[38;5;82mmain\x1b[0m');
        else if (sub==='checkout') { w(`Switched to branch '${args[1]||'main'}'`); document.getElementById('sbBranch').textContent = `⎇ ${args[1]||'main'}`; }
        else if (sub==='push') w('Everything up-to-date');
        else if (sub==='pull') w('Already up to date.');
        else if (sub==='clone') { w(`Cloning into '${(args[1]||'repo').split('/').pop()}'...\n\x1b[38;5;82mDone.\x1b[0m`); }
        else w(`git: '${sub}' — try: init, status, add, commit, log, branch, checkout, push, pull, clone`);
        break;
      }
      case 'grep': {
        const pat = args.filter(a=>!a.startsWith('-'))[0];
        const file = args.filter(a=>!a.startsWith('-'))[1];
        if (!pat) { w('\x1b[38;5;196musage: grep PATTERN FILE\x1b[0m'); break; }
        const key = Object.keys(S.files).find(k=>k.endsWith(file)||k===file);
        if (key) { S.files[key].content.split('\n').forEach((l,i)=>{ if(l.includes(pat)) w(`\x1b[38;5;75m${key}:${i+1}:\x1b[0m ${l.replace(pat,`\x1b[38;5;196m${pat}\x1b[0m`)}`); }); }
        else { Object.entries(S.files).forEach(([k,f])=>{ f.content.split('\n').forEach((l,i)=>{ if(l.toLowerCase().includes(pat.toLowerCase())) w(`\x1b[38;5;75m${k}:${i+1}:\x1b[0m ${l}`); }); }); }
        break;
      }
      case 'find': {
        const pattern = args.find(a=>a.startsWith('-name'))?.split('=')[1] || args[args.indexOf('-name')+1] || '';
        Object.keys(S.files).forEach(p => { if(!pattern||p.includes(pattern.replace(/\*/g,''))) w(p); });
        break;
      }
      case 'which': { const m={node:'/usr/local/bin/node',npm:'/usr/local/bin/npm',python3:'/usr/bin/python3',git:'/usr/bin/git',bash:'/bin/bash'}; w(m[args[0]]||`which: no ${args[0]} in PATH`); break; }
      case 'curl': w('\x1b[38;5;240m[curl: simulated — no network in browser sandbox]\x1b[0m'); break;
      case 'wc': { const key=Object.keys(S.files).find(k=>k.endsWith(args[args.length-1])); if(key){const c=S.files[key].content;w(`${c.split('\n').length} ${c.split(/\s+/).length} ${c.length} ${args[args.length-1]}`);} break; }
      case 'code': { if(args[0]){const key=Object.keys(S.files).find(k=>k.endsWith(args[0]));if(key){openTab(key);w(`Opening ${key}...`);}else w(`File not found: ${args[0]}`);} break; }
      case 'help':
        w('\x1b[38;5;141mAvailable commands:\x1b[0m');
        ['ls','cd','pwd','cat','echo','touch','mkdir','rm','grep','find','wc','which','env','export','node','python3','npm init/install/run','git','curl','code <file>','clear','help'].forEach(c=>w(`  \x1b[38;5;75m${c}\x1b[0m`));
        break;
      default:
        w(`\x1b[38;5;196mbash: ${prog}: command not found\x1b[0m`);
        w(`\x1b[38;5;240mTry: help\x1b[0m`);
    }
    this.prompt();
  }

  parse(cmd) {
    const res = []; let cur = ''; let q = null;
    for (const ch of cmd) {
      if (q) { if (ch === q) q=null; else cur+=ch; }
      else if (ch==='"'||ch==="'") { q=ch; }
      else if (ch===' ') { if(cur){res.push(cur);cur='';} }
      else cur+=ch;
    }
    if (cur) res.push(cur);
    return res.length ? res : [''];
  }
}

// ── AI (GLM) ─────────────────────────────────────────
function toggleAI() {
  const p = document.getElementById('aiPanel');
  const r = document.getElementById('aiResizer');
  const collapsed = p.classList.toggle('collapsed');
  r.style.display = collapsed ? 'none' : '';
  document.getElementById('sbAI')?.classList.toggle('sb-ai-active', !collapsed);
}

function clearAI() { S.aiHistory = []; document.getElementById('aiMessages').innerHTML = ''; }

function aiAction(action) {
  if (!S.activeTab) { toast('Open a file first', 'warn'); return; }
  if (document.getElementById('aiPanel').classList.contains('collapsed')) toggleAI();
  const code = getEditorCode();
  const lang = getLang(S.activeTab);
  const file = S.activeTab.split('/').pop();
  const prompts = {
    explain: `Explain this ${lang} code from "${file}" step by step:\n\`\`\`${lang}\n${code}\n\`\`\``,
    fix: `Find and fix all bugs in this ${lang} code from "${file}". Return the complete fixed code:\n\`\`\`${lang}\n${code}\n\`\`\``,
    refactor: `Refactor this ${lang} code for better readability, maintainability, and performance. Explain what you changed:\n\`\`\`${lang}\n${code}\n\`\`\``,
    tests: `Generate a comprehensive test suite for this ${lang} code:\n\`\`\`${lang}\n${code}\n\`\`\``,
    docs: `Add complete JSDoc/docstring documentation to every function and class in this ${lang} code:\n\`\`\`${lang}\n${code}\n\`\`\``,
    optimize: `Optimize this ${lang} code for performance. Explain each optimization:\n\`\`\`${lang}\n${code}\n\`\`\``,
    complete: `Complete this ${lang} code (fill in TODO/unfinished parts, add missing logic):\n\`\`\`${lang}\n${code}\n\`\`\``,
  };
  sendAIMsg(prompts[action] || '');
}

function getEditorCode() {
  if (!S.monacoReady || !S.activeTab) return '';
  const sel = S.editor.getSelection();
  const model = S.editor.getModel();
  if (model && sel && !sel.isEmpty()) return model.getValueInRange(sel);
  return model?.getValue().slice(0, 6000) || '';
}

async function sendAI() {
  const input = document.getElementById('aiInput');
  const msg = input.value.trim();
  if (!msg) return;
  const useCtx = document.getElementById('aiUseCtx')?.checked;
  let full = msg;
  if (useCtx && S.activeTab) {
    const code = getEditorCode();
    const lang = getLang(S.activeTab);
    if (code) full = `File: ${S.activeTab}\n\`\`\`${lang}\n${code}\n\`\`\`\n\n${msg}`;
  }
  input.value = '';
  input.style.height = '';
  sendAIMsg(full, msg);
}

function sendAIMsg(fullMsg, displayMsg) {
  const display = displayMsg || fullMsg;
  appendMsg('user', display.length > 200 ? display.slice(0,200)+'…' : display);
  S.aiHistory.push({ role:'user', content: fullMsg });

  const model = document.getElementById('aiModel')?.value || S.settings.glmModel || 'glm-4-flash';
  const key = S.settings.glmKey || '';

  const typing = showTyping();

  callGLM(model, key, S.aiHistory).then(reply => {
    typing.remove();
    S.aiHistory.push({ role:'assistant', content: reply });
    appendMsg('assistant', reply);
  }).catch(err => {
    typing.remove();
    appendMsg('assistant', `❌ Error: ${err.message}\n\nMake sure your GLM API key is set in Settings → AI.`);
  });
}

async function callGLM(model, key, messages) {
  if (!key) throw new Error('No GLM API key. Go to Settings → AI to add your ZhipuAI key.');
  const resp = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [
        { role:'system', content:'You are an expert programming assistant integrated into Apex IDE. Help the user with their code. Be concise, accurate, and practical. When returning code, use proper markdown code blocks with language tags.' },
        ...messages.slice(-12)
      ],
      max_tokens: 2000,
      temperature: 0.3,
    })
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err?.error?.message || `HTTP ${resp.status}`);
  }
  const data = await resp.json();
  return data.choices?.[0]?.message?.content || '(empty response)';
}

function appendMsg(role, content) {
  const c = document.getElementById('aiMessages');
  const el = document.createElement('div');
  el.className = `ai-msg ${role}`;
  if (role === 'assistant') {
    el.innerHTML = formatAIContent(content);
    // Add insert buttons for code blocks
    el.querySelectorAll('pre code').forEach(codeEl => {
      const btn = document.createElement('button');
      btn.className = 'ai-insert-btn';
      btn.textContent = '⬆ Insert into editor';
      btn.onclick = () => insertCode(codeEl.textContent);
      codeEl.parentElement.after(btn);
    });
    // Copy button
    const copyBtn = document.createElement('button');
    copyBtn.className = 'ai-insert-btn';
    copyBtn.textContent = '📋 Copy';
    copyBtn.onclick = () => { navigator.clipboard.writeText(content); toast('Copied', 'ok', 1500); };
    el.appendChild(copyBtn);
  } else {
    el.textContent = content;
  }
  c.appendChild(el);
  c.scrollTop = c.scrollHeight;
}

function formatAIContent(text) {
  // Code blocks
  text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) =>
    `<pre><code class="lang-${lang}">${escHtml(code.trim())}</code></pre>`
  );
  // Inline code
  text = text.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  // Bold
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Line breaks
  text = text.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>');
  return `<p>${text}</p>`;
}

function escHtml(t) { return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function showTyping() {
  const c = document.getElementById('aiMessages');
  const el = document.createElement('div');
  el.className = 'ai-typing';
  el.innerHTML = 'Thinking <span class="dots"><span>.</span><span>.</span><span>.</span></span>';
  c.appendChild(el); c.scrollTop = c.scrollHeight;
  return el;
}

function insertCode(code) {
  if (!S.monacoReady || !S.activeTab) { toast('Open a file first', 'warn'); return; }
  const pos = S.editor.getPosition();
  const model = S.editor.getModel();
  if (!model || !pos) return;
  model.pushEditOperations([], [{ range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column), text: code, forceMoveMarkers: true }], () => null);
  S.editor.focus();
  toast('Code inserted', 'ok');
}

// ── COMMAND PALETTE ───────────────────────────────────
const COMMANDS = [
  { label:'New File', key:'Ctrl+N', group:'File', fn:()=>newFile() },
  { label:'Open Folder', key:'Ctrl+O', group:'File', fn:()=>openFolder() },
  { label:'Save', key:'Ctrl+S', group:'File', fn:()=>S.activeTab&&fileSave(S.activeTab) },
  { label:'Close Tab', key:'Ctrl+W', group:'File', fn:()=>S.activeTab&&closeTab(S.activeTab) },
  { label:'New Project', key:'', group:'File', fn:()=>newProject() },
  { label:'Toggle AI Panel', key:'Ctrl+Shift+A', group:'View', fn:()=>toggleAI() },
  { label:'Toggle Terminal', key:'Ctrl+`', group:'View', fn:()=>toggleBP() },
  { label:'Toggle Sidebar', key:'Ctrl+B', group:'View', fn:()=>document.getElementById('sidebar').classList.toggle('collapsed') },
  { label:'Settings', key:'Ctrl+,', group:'View', fn:()=>openSettings() },
  { label:'Format Document', key:'Shift+Alt+F', group:'Editor', fn:()=>S.monacoReady&&S.editor.getAction('editor.action.formatDocument')?.run() },
  { label:'Toggle Word Wrap', key:'Alt+Z', group:'Editor', fn:()=>toggleWordWrap() },
  { label:'Increase Font Size', key:'Ctrl++', group:'Editor', fn:()=>changeFontSize(1) },
  { label:'Decrease Font Size', key:'Ctrl+-', group:'Editor', fn:()=>changeFontSize(-1) },
  { label:'Find', key:'Ctrl+F', group:'Editor', fn:()=>S.monacoReady&&S.editor.getAction('actions.find')?.run() },
  { label:'Go to Line', key:'Ctrl+G', group:'Editor', fn:()=>S.monacoReady&&S.editor.getAction('editor.action.gotoLine')?.run() },
  { label:'Go to Symbol', key:'Ctrl+Shift+O', group:'Editor', fn:()=>S.monacoReady&&S.editor.getAction('editor.action.quickOutline')?.run() },
  { label:'Explain Code (AI)', key:'', group:'AI', fn:()=>aiAction('explain') },
  { label:'Fix Bug (AI)', key:'', group:'AI', fn:()=>aiAction('fix') },
  { label:'Refactor (AI)', key:'', group:'AI', fn:()=>aiAction('refactor') },
  { label:'Generate Tests (AI)', key:'', group:'AI', fn:()=>aiAction('tests') },
  { label:'Add Docs (AI)', key:'', group:'AI', fn:()=>aiAction('docs') },
  { label:'New Terminal', key:'Ctrl+Shift+`', group:'Terminal', fn:()=>addTerminal() },
  { label:'Theme: Dark', key:'', group:'Theme', fn:()=>applyTheme('apex-dark') },
  { label:'Theme: Light', key:'', group:'Theme', fn:()=>applyTheme('vs-light') },
  { label:'Theme: High Contrast', key:'', group:'Theme', fn:()=>applyTheme('hc-black') },
];

function openCmdPalette() {
  document.getElementById('cmdPalette').classList.remove('hidden');
  const inp = document.getElementById('cpInput');
  inp.value = ''; inp.focus();
  S.cpIdx = 0;
  renderCP('');
}
function closeCmdPalette() { document.getElementById('cmdPalette').classList.add('hidden'); if(S.monacoReady)S.editor.focus(); }

function renderCP(q) {
  const res = document.getElementById('cpResults');
  res.innerHTML = '';
  S.cpItems = [];

  // Commands
  let filtered = COMMANDS.filter(c => !q || c.label.toLowerCase().includes(q.toLowerCase()) || c.group.toLowerCase().includes(q.toLowerCase()));
  const groups = {};
  filtered.forEach(c => { if(!groups[c.group])groups[c.group]=[]; groups[c.group].push(c); });
  Object.entries(groups).forEach(([g, cmds]) => {
    const gEl = document.createElement('div'); gEl.className='cp-group'; gEl.textContent=g; res.appendChild(gEl);
    cmds.forEach(c => {
      const el = document.createElement('div'); el.className='cp-item';
      el.innerHTML = `<div class="cp-item-l"><span class="cp-item-icon">›</span>${c.label}</div>${c.key?`<span class="cp-item-key">${c.key}</span>`:''}`;
      el.onclick = () => { closeCmdPalette(); c.fn(); };
      S.cpItems.push(el); res.appendChild(el);
    });
  });

  // Files
  if (q) {
    const fileHits = Object.keys(S.files).filter(p=>p.toLowerCase().includes(q.toLowerCase())).slice(0,8);
    if (fileHits.length) {
      const gEl = document.createElement('div'); gEl.className='cp-group'; gEl.textContent='Files'; res.appendChild(gEl);
      fileHits.forEach(p => {
        const el = document.createElement('div'); el.className='cp-item';
        el.innerHTML = `<div class="cp-item-l"><span class="cp-item-icon">${getIcon(p)}</span>${p.split('/').pop()}<span style="color:#444;font-size:11px;margin-left:8px">${p}</span></div>`;
        el.onclick = () => { closeCmdPalette(); openTab(p); };
        S.cpItems.push(el); res.appendChild(el);
      });
    }
  }

  updateCPFocus();
}

function filterCmdPalette(q) { S.cpIdx = 0; renderCP(q); }

function cmdPaletteKey(e) {
  if (e.key === 'Escape') { closeCmdPalette(); return; }
  if (e.key === 'Enter') { S.cpItems[S.cpIdx]?.click(); return; }
  if (e.key === 'ArrowDown') { e.preventDefault(); S.cpIdx = Math.min(S.cpIdx+1, S.cpItems.length-1); updateCPFocus(); }
  if (e.key === 'ArrowUp') { e.preventDefault(); S.cpIdx = Math.max(S.cpIdx-1, 0); updateCPFocus(); }
}

function updateCPFocus() {
  S.cpItems.forEach((el,i) => el.classList.toggle('focused', i===S.cpIdx));
  S.cpItems[S.cpIdx]?.scrollIntoView({block:'nearest'});
}

// ── PROBLEMS ─────────────────────────────────────────
function refreshProblems() {
  if (!S.monacoReady || !S.activeTab) return;
  const model = S.models[S.activeTab];
  if (!model) return;
  const markers = monaco.editor.getModelMarkers({ resource: model.uri });
  const errs = markers.filter(m=>m.severity===monaco.MarkerSeverity.Error).length;
  const warns = markers.filter(m=>m.severity===monaco.MarkerSeverity.Warning).length;
  document.getElementById('sbProblems').textContent = `✕ ${errs} ⚠ ${warns}`;
  const list = document.getElementById('problemsList');
  if (!markers.length) { list.innerHTML='<div class="empty-state">No problems detected</div>'; return; }
  list.innerHTML = markers.map(m => {
    const icon = m.severity===monaco.MarkerSeverity.Error?'🔴':m.severity===monaco.MarkerSeverity.Warning?'🟡':'🔵';
    return `<div class="problem-item" onclick="if(S.monacoReady){S.editor.revealLineInCenter(${m.startLineNumber});S.editor.setPosition({lineNumber:${m.startLineNumber},column:${m.startColumn}});}">
      <span class="problem-icon">${icon}</span>
      <div><div class="problem-text">${escHtml(m.message)}</div><div class="problem-loc">${S.activeTab}:${m.startLineNumber}:${m.startColumn}</div></div>
    </div>`;
  }).join('');
}

// ── SETTINGS ─────────────────────────────────────────
function openSettings() { document.getElementById('settingsModal').classList.remove('hidden'); settingsTab('editor', document.querySelector('.sm-nav-item')); }
function closeSettings() { document.getElementById('settingsModal').classList.add('hidden'); saveSettings(); }

function settingsTab(tab, el) {
  document.querySelectorAll('.sm-nav-item').forEach(e=>e.classList.remove('active'));
  el?.classList.add('active');
  const main = document.getElementById('settingsMain');
  const s = S.settings;
  const row = (label, ctrl, desc='') => `<div class="sm-row"><div><div class="sm-label">${label}</div>${desc?`<div class="sm-desc">${desc}</div>`:''}</div><div class="sm-ctrl">${ctrl}</div></div>`;
  const tog = (key, label='') => `<div class="sm-toggle ${s[key]?'on':''}" onclick="toggleSetting('${key}',this)" title="${label}"></div>`;
  const tabs = {
    editor: `<div class="sm-section">
      <div class="sm-section-title">Editor</div>
      ${row('Font Size', `<input type="number" value="${s.fontSize}" min="10" max="32" onchange="updateSetting('fontSize',+this.value);S.monacoReady&&S.editor.updateOptions({fontSize:+this.value})">`)}
      ${row('Tab Size', `<input type="number" value="${s.tabSize}" min="1" max="8" onchange="updateSetting('tabSize',+this.value);S.monacoReady&&S.editor.updateOptions({tabSize:+this.value})">`)}
      ${row('Word Wrap', `<select onchange="updateSetting('wordWrap',this.value);S.monacoReady&&S.editor.updateOptions({wordWrap:this.value})"><option ${s.wordWrap==='off'?'selected':''} value="off">Off</option><option ${s.wordWrap==='on'?'selected':''} value="on">On</option><option ${s.wordWrap==='wordWrapColumn'?'selected':''} value="wordWrapColumn">Column</option></select>`)}
      ${row('Line Numbers', `<select onchange="updateSetting('lineNumbers',this.value);S.monacoReady&&S.editor.updateOptions({lineNumbers:this.value})"><option ${s.lineNumbers==='on'?'selected':''} value="on">On</option><option ${s.lineNumbers==='off'?'selected':''} value="off">Off</option><option ${s.lineNumbers==='relative'?'selected':''} value="relative">Relative</option></select>`)}
      ${row('Minimap', tog('minimap'),'Show/hide minimap')}
      ${row('Auto Save', tog('autoSave'),'Auto-save after 1.5s')}
      ${row('Format on Save', tog('formatOnSave'),'Format document on save')}
      ${row('Bracket Pairs', tog('bracketPairs'),'Colorize bracket pairs')}
    </div>`,
    ai: `<div class="sm-section">
      <div class="sm-section-title">GLM AI Configuration</div>
      ${row('ZhipuAI API Key', `<input type="password" value="${s.glmKey||''}" placeholder="Enter API key..." onchange="updateSetting('glmKey',this.value)" style="width:220px">`, 'Get key at open.bigmodel.cn')}
      ${row('Default Model', `<select onchange="updateSetting('glmModel',this.value)"><option ${s.glmModel==='glm-4-flash'?'selected':''} value="glm-4-flash">GLM-4-Flash (Free)</option><option ${s.glmModel==='glm-4'?'selected':''} value="glm-4">GLM-4</option><option ${s.glmModel==='glm-4-plus'?'selected':''} value="glm-4-plus">GLM-4-Plus</option><option ${s.glmModel==='glm-z1-flash'?'selected':''} value="glm-z1-flash">GLM-Z1-Flash</option></select>`)}
      <div style="margin-top:12px;padding:10px;background:#1a1a28;border-radius:6px;font-size:12px;color:#666">
        <div style="margin-bottom:6px;color:#a78bfa;font-weight:600">How to get a GLM API key:</div>
        <div>1. Go to <a href="https://open.bigmodel.cn" target="_blank" style="color:#60a5fa">open.bigmodel.cn</a></div>
        <div>2. Register / Login</div>
        <div>3. Go to API Keys → Create key</div>
        <div>4. Paste key above</div>
      </div>
    </div>`,
    theme: `<div class="sm-section">
      <div class="sm-section-title">Color Theme</div>
      ${['apex-dark','vs-light','hc-black','vs-dark'].map(t=>`<div class="sm-row" style="cursor:pointer" onclick="applyTheme('${t}')"><div class="sm-label">${t}</div><div class="sm-ctrl">${s.theme===t?'✓':''}</div></div>`).join('')}
    </div>`,
    terminal: `<div class="sm-section">
      <div class="sm-section-title">Terminal</div>
      ${row('Font Size', `<input type="number" value="${s.termFontSize}" min="10" max="24" onchange="updateSetting('termFontSize',+this.value)">`)}
    </div>`,
    keybindings: `<div class="sm-section">
      <div class="sm-section-title">Keyboard Shortcuts</div>
      ${COMMANDS.filter(c=>c.key).map(c=>row(c.label,`<kbd style="background:#0a0a12;padding:1px 6px;border-radius:3px;font-size:11px;color:#666">${c.key}</kbd>`)).join('')}
    </div>`,
  };
  main.innerHTML = tabs[tab] || '';
}

function updateSetting(key, val) { S.settings[key] = val; saveSettings(); }
function toggleSetting(key, el) {
  el.classList.toggle('on');
  S.settings[key] = el.classList.contains('on');
  saveSettings();
  if (key === 'minimap' && S.monacoReady) S.editor.updateOptions({ minimap: { enabled: S.settings[key] } });
  if (key === 'bracketPairs' && S.monacoReady) S.editor.updateOptions({ bracketPairColorization: { enabled: S.settings[key] } });
}
function applyTheme(t) {
  S.settings.theme = t; saveSettings();
  if (S.monacoReady) monaco.editor.setTheme(t);
  toast(`Theme: ${t}`, 'ok');
}
function changeFontSize(d) {
  S.settings.fontSize = Math.max(10, Math.min(32, S.settings.fontSize + d));
  if (S.monacoReady) S.editor.updateOptions({ fontSize: S.settings.fontSize });
  saveSettings();
}
function toggleWordWrap() {
  S.settings.wordWrap = S.settings.wordWrap === 'off' ? 'on' : 'off';
  if (S.monacoReady) S.editor.updateOptions({ wordWrap: S.settings.wordWrap });
  saveSettings();
}

// ── MISC UI ───────────────────────────────────────────
function switchPanel(name) {
  document.querySelectorAll('.ab-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById(`ab-${name}`)?.classList.add('active');
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  document.getElementById(`panel-${name}`)?.classList.add('active');
  if (document.getElementById('sidebar').classList.contains('collapsed'))
    document.getElementById('sidebar').classList.remove('collapsed');
}

function switchBP(name) {
  document.querySelectorAll('.bp-tab').forEach(t=>t.classList.toggle('active',t.textContent.trim().toLowerCase()===name));
  document.querySelectorAll('.bp-panel').forEach(p=>p.classList.toggle('active',p.id===`bp-${name}`));
  if (name==='terminal') S.terminals.forEach(t=>{try{t?.fa.fit();}catch{}});
}

function toggleBP() { document.getElementById('bottomPanel').classList.toggle('collapsed'); setTimeout(()=>S.terminals.forEach(t=>{try{t?.fa.fit();}catch{}},100)); }

function changeLang() {
  const lang = prompt('Language:', S.activeTab?getLang(S.activeTab):'plaintext');
  if (!lang || !S.monacoReady || !S.activeTab) return;
  monaco.editor.setModelLanguage(S.models[S.activeTab], lang);
  document.getElementById('sbLang').textContent = lang;
}

function gitCommit() { const m=document.getElementById('gitMsg').value.trim(); if(!m){toast('Enter a commit message','warn');return;} toast(`Committed: ${m}`,'ok'); document.getElementById('gitMsg').value=''; }
function gitPush() { toast('Pushed to origin (simulated)','ok'); }

function menuFile() { openCmdPalette(); setTimeout(()=>{document.getElementById('cpInput').value='File:';filterCmdPalette('File');},50); }
function menuEdit() { S.monacoReady&&S.editor.getAction('actions.find')?.run(); }
function menuView() { openCmdPalette(); }
function menuRun() { switchBP('terminal'); if(document.getElementById('bottomPanel').classList.contains('collapsed'))toggleBP(); }

function installPWA() { if(S.deferredInstall){S.deferredInstall.prompt();S.deferredInstall.userChoice.then(()=>{S.deferredInstall=null;document.getElementById('btnInstall').style.display='none';});} }

// ── RESIZERS ─────────────────────────────────────────
function initResizers() {
  makeResizer(document.getElementById('sidebarResizer'), 'h', '#sidebar', 120, 480);
  makeResizer(document.getElementById('bottomResizer'), 'v', '#bottomPanel', 60, 500, true);
  makeResizer(document.getElementById('aiResizer'), 'h', '#aiPanel', 240, 640, false, true);
}

function makeResizer(handle, dir, sel, min, max, inv=false, invH=false) {
  if (!handle) return;
  let sx, sy, ss;
  handle.addEventListener('mousedown', e => {
    e.preventDefault();
    sx=e.clientX; sy=e.clientY;
    const t=document.querySelector(sel);
    ss=dir==='h'?t.offsetWidth:t.offsetHeight;
    handle.classList.add('drag');
    const onMove=ev=>{
      const t=document.querySelector(sel);
      if(dir==='h'){const d=invH?sx-ev.clientX:ev.clientX-sx;t.style.width=Math.max(min,Math.min(max,ss+d))+'px';}
      else{const d=inv?sy-ev.clientY:ev.clientY-sy;t.style.height=Math.max(min,Math.min(max,ss+d))+'px';S.terminals.forEach(t=>{try{t?.fa.fit();}catch{}});}
    };
    const onUp=()=>{handle.classList.remove('drag');document.removeEventListener('mousemove',onMove);document.removeEventListener('mouseup',onUp);};
    document.addEventListener('mousemove',onMove);
    document.addEventListener('mouseup',onUp);
  });
}

// ── SNIPPETS ─────────────────────────────────────────
function registerSnippets() {
  const mk = (lang, label, insert, detail) => {
    monaco.languages.registerCompletionItemProvider(lang, {
      provideCompletionItems(m, pos) {
        const w=m.getWordUntilPosition(pos);
        const r={startLineNumber:pos.lineNumber,endLineNumber:pos.lineNumber,startColumn:w.startColumn,endColumn:w.endColumn};
        if(!w.word||!label.startsWith(w.word))return{suggestions:[]};
        return{suggestions:[{label,kind:monaco.languages.CompletionItemKind.Snippet,insertText:insert,insertTextRules:monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,detail,range:r}]};
      }
    });
  };

  const snips = [
    // JS/TS
    ['javascript','afn','async function ${1:name}(${2:params}) {\n\t${3}\n}','Async function'],
    ['javascript','afe','const ${1:name} = async (${2:params}) => {\n\t${3}\n};','Async arrow function'],
    ['javascript','trycatch','try {\n\t${1}\n} catch (${2:err}) {\n\tconsole.error(${2:err});\n}','Try-catch'],
    ['javascript','cls','class ${1:Name} {\n\tconstructor(${2:params}) {\n\t\t${3}\n\t}\n\n\t${4:method}() {\n\t\t${5}\n\t}\n}','Class'],
    ['javascript','imp','import ${2:name} from \'${1:module}\';','Import'],
    ['javascript','impn','import { ${2:name} } from \'${1:module}\';','Import named'],
    ['javascript','prom','new Promise((resolve, reject) => {\n\t${1}\n\tresolve(${2});\n})','Promise'],
    ['javascript','fetch','const res = await fetch(\'${1:url}\');\nconst data = await res.json();','Fetch'],
    ['javascript','fore','${1:arr}.forEach((${2:item}) => {\n\t${3}\n});','forEach'],
    ['javascript','map','const ${1:result} = ${2:arr}.map((${3:item}) => ${4:item});','map'],
    ['javascript','filter','const ${1:result} = ${2:arr}.filter((${3:item}) => ${4:true});','filter'],
    ['javascript','log','console.log(${1});','console.log'],
    ['javascript','ife','(function() {\n\t${1}\n})();','IIFE'],
    ['javascript','sw','switch (${1:expr}) {\n\tcase ${2:val}:\n\t\t${3}\n\t\tbreak;\n\tdefault:\n\t\t${4}\n}','Switch'],
    // Python
    ['python','def','def ${1:name}(${2:params}):\n\t"""${3:docstring}"""\n\t${4:pass}','Function'],
    ['python','cls','class ${1:Name}:\n\tdef __init__(self${2:, params}):\n\t\t${3:pass}','Class'],
    ['python','main','if __name__ == \'__main__\':\n\t${1:main()}','Main'],
    ['python','trycatch','try:\n\t${1:pass}\nexcept ${2:Exception} as ${3:e}:\n\t${4:pass}','Try-except'],
    ['python','lc','[${1:expr} for ${2:item} in ${3:iterable}]','List comprehension'],
    ['python','withopen','with open(\'${1:file}\', \'${2:r}\') as ${3:f}:\n\t${4}','With open'],
    // Go
    ['go','fn','func ${1:name}(${2:params}) ${3:error} {\n\t${4}\n\treturn ${5:nil}\n}','Function'],
    ['go','err','if err != nil {\n\treturn ${1:nil}, err\n}','Error check'],
    ['go','struct','type ${1:Name} struct {\n\t${2:Field} ${3:Type}\n}','Struct'],
    ['go','goroutine','go func() {\n\t${1}\n}()','Goroutine'],
    // Rust
    ['rust','fn','fn ${1:name}(${2:params}) -> ${3:ReturnType} {\n\t${4}\n}','Function'],
    ['rust','match','match ${1:expr} {\n\t${2:pattern} => ${3:result},\n\t_ => ${4:default},\n}','Match'],
    ['rust','impl','impl ${1:Type} {\n\tpub fn new(${2:params}) -> Self {\n\t\tSelf { ${3} }\n\t}\n}','Impl'],
  ];

  snips.forEach(([lang, label, insert, detail]) => {
    const langs = lang === 'javascript' ? ['javascript','typescript'] : [lang];
    langs.forEach(l => mk(l, label, insert, detail));
  });
}

// ── GLOBAL KEYBOARD SHORTCUTS ─────────────────────────
document.addEventListener('keydown', e => {
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.key === 'p') { e.preventDefault(); openCmdPalette(); }
  if (ctrl && e.shiftKey && e.key === 'P') { e.preventDefault(); openCmdPalette(); }
  if (ctrl && e.key === 's') { e.preventDefault(); S.activeTab && fileSave(S.activeTab); }
  if (ctrl && e.key === 'n') { e.preventDefault(); newFile(); }
  if (ctrl && e.key === 'o') { e.preventDefault(); openFolder(); }
  if (ctrl && e.key === 'w') { e.preventDefault(); S.activeTab && closeTab(S.activeTab); }
  if (ctrl && e.key === 'b') { e.preventDefault(); document.getElementById('sidebar').classList.toggle('collapsed'); }
  if (ctrl && e.key === ',') { e.preventDefault(); openSettings(); }
  if (ctrl && e.shiftKey && e.key === 'A') { e.preventDefault(); toggleAI(); }
  if (ctrl && e.shiftKey && e.key === 'E') { e.preventDefault(); switchPanel('explorer'); }
  if (ctrl && e.shiftKey && e.key === 'F') { e.preventDefault(); switchPanel('search'); }
  if (ctrl && e.key === '`') { e.preventDefault(); toggleBP(); }
  if (ctrl && e.shiftKey && e.key === '`') { e.preventDefault(); addTerminal(); }
  if (e.altKey && e.key === 'z') { e.preventDefault(); toggleWordWrap(); }
  if (e.key === 'F11') { e.preventDefault(); document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(()=>{}); }
});

// AI input: Enter to send, Shift+Enter for newline
document.getElementById('aiInput').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAI(); }
});
// Auto-resize AI textarea
document.getElementById('aiInput').addEventListener('input', function() {
  this.style.height = ''; this.style.height = Math.min(this.scrollHeight, 160) + 'px';
});

// PWA install
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); S.deferredInstall = e;
  document.getElementById('btnInstall').style.display = '';
});

// Drag & Drop files
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => {
  e.preventDefault();
  const files = [...e.dataTransfer.files];
  files.forEach(f => {
    const r = new FileReader();
    r.onload = ev => {
      S.files[f.name] = { content: ev.target.result, lang: getLang(f.name), dirty: false };
      refreshTree(); showTree();
      openTab(f.name);
    };
    r.readAsText(f);
  });
  if (files.length) toast(`Opened ${files.length} file(s)`, 'ok');
});

// ── INIT ─────────────────────────────────────────────
async function init() {
  loadSettings();

  // Init Monaco
  await initMonaco();
  toast('Monaco Editor ready', 'ok', 1500);

  // Init Terminal
  if (window.Terminal) {
    addTerminal();
  } else {
    document.getElementById('termContainer').innerHTML = '<div style="padding:12px;color:#555;font-size:12px">Terminal unavailable (xterm.js failed to load)</div>';
  }

  // Resizers
  initResizers();

  // AI panel starts hidden
  document.getElementById('aiResizer').style.display = 'none';

  // Git status update
  setInterval(() => {
    const dirty = Object.values(S.files).filter(f=>f.dirty).length;
    document.getElementById('gitChanges').innerHTML = dirty ? Object.entries(S.files).filter(([_,f])=>f.dirty).map(([p])=>`<div style="padding:3px 6px;font-size:12px;color:#ccc;display:flex;align-items:center;gap:6px"><span style="color:#f59e0b;font-weight:700;font-size:11px">M</span>${p.split('/').pop()}</div>`).join('') : '<div class="empty-state">No changes</div>';
  }, 2000);
}

init();
