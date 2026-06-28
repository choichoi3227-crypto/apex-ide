/* ===================================================
   APEX IDE — Extended Features Module
   Drag & Drop, GLM AI integration, advanced editor
   =================================================== */

// ===== DRAG & DROP FILE OPEN =====
;(function initDragDrop() {
  const overlay = document.getElementById('dropOverlay');
  let dragCounter = 0;

  document.addEventListener('dragenter', e => {
    e.preventDefault();
    dragCounter++;
    if (overlay) overlay.classList.add('active');
  });
  document.addEventListener('dragleave', e => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0) { dragCounter = 0; if (overlay) overlay.classList.remove('active'); }
  });
  document.addEventListener('dragover', e => { e.preventDefault(); });
  document.addEventListener('drop', e => {
    e.preventDefault();
    dragCounter = 0;
    if (overlay) overlay.classList.remove('active');
    const items = [...(e.dataTransfer?.items || [])];
    const files = [...(e.dataTransfer?.files || [])];
    if (items.length > 0) {
      // Try File System Access API for directories
      for (const item of items) {
        const entry = item.webkitGetAsEntry?.();
        if (entry?.isDirectory) { traverseDirectory(entry, ''); return; }
      }
    }
    // Plain files
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => {
        state.files[file.name] = { content: ev.target.result, language: getLang(file.name), modified: false };
        refreshFileTree();
        openTab(file.name);
      };
      reader.readAsText(file);
    });
    if (files.length > 0) toast(`Opened ${files.length} file(s)`, 'success');
  });

  function traverseDirectory(entry, prefix) {
    if (entry.isFile) {
      entry.file(file => {
        const reader = new FileReader();
        reader.onload = ev => {
          const path = prefix ? `${prefix}/${file.name}` : file.name;
          state.files[path] = { content: ev.target.result, language: getLang(file.name), modified: false };
          refreshFileTree();
        };
        reader.readAsText(file);
      });
    } else if (entry.isDirectory) {
      const dirReader = entry.createReader();
      const readEntries = () => {
        dirReader.readEntries(entries => {
          if (entries.length === 0) return;
          const newPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
          entries.forEach(e => traverseDirectory(e, newPrefix));
          readEntries();
        });
      };
      readEntries();
    }
  }
})();

// ===== ENHANCED AI: GLM-4 API INTEGRATION =====
// GLM (ChatGLM) is accessed via ZhipuAI API
async function callGLM(messages, system) {
  // ZhipuAI / GLM-4 endpoint
  const apiKey = state.settings.glmKey || '';
  if (!apiKey) {
    return await simulateGLMResponse(messages[messages.length-1]?.content || '');
  }
  const response = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'glm-4',
      messages: system ? [{ role: 'system', content: system }, ...messages] : messages,
      max_tokens: 2000,
      temperature: 0.3,
      stream: false,
    }),
  });
  if (!response.ok) throw new Error(`GLM API error: ${response.status}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content || 'No response from GLM-4.';
}

async function simulateGLMResponse(prompt) {
  await new Promise(r => setTimeout(r, 600 + Math.random() * 400));
  const p = prompt.toLowerCase();
  const lang = state.activeTab ? getLang(state.activeTab) : 'code';
  const ctx = (() => { if (!monacoReady || !state.activeTab) return ''; const m = state.monacoModels[state.activeTab]; return m ? m.getValue().slice(0,400) : ''; })();

  if (p.includes('hello') || p.includes('hi')) return 'Hello! I\'m the GLM-4 AI assistant integrated into Apex IDE. I can help you with code analysis, debugging, and more. To enable the real GLM-4 API, add your ZhipuAI key in Settings → AI.';
  if (p.includes('explain') && ctx) return `**Code Analysis (GLM-4)**\n\nLooking at your ${lang} code:\n\`\`\`${lang}\n${ctx.slice(0,200)}\n\`\`\`\n\nThis code appears to define logic for ${lang} application. The main components handle data processing and control flow. To get a detailed explanation, enable the GLM-4 API key in Settings → AI.`;
  if (p.includes('fix') || p.includes('bug') || p.includes('error')) return `**Bug Fix Suggestion (GLM-4 Simulation)**\n\nCommon fixes for ${lang} code:\n\n1. **Null checks** — Ensure all variables are initialized\n2. **Error handling** — Wrap async calls in try/catch\n3. **Type safety** — Validate inputs at function boundaries\n\nFor AI-powered real-time fixes, add your GLM-4 API key in Settings → AI.`;
  if (p.includes('refactor')) return `**Refactoring Plan (GLM-4 Simulation)**\n\nRecommended refactoring steps:\n\n1. Extract repeated logic into helper functions\n2. Use descriptive variable names\n3. Add type annotations\n4. Split large functions (>20 lines) into smaller ones\n5. Remove dead code and unused imports\n\nEnable the real GLM-4 API for automated refactoring.`;
  if (p.includes('test')) return `**Test Generation (GLM-4 Simulation)**\n\n\`\`\`javascript\ndescribe('${state.activeTab?.split('/').pop() || 'module'}', () => {\n  beforeEach(() => {\n    // Setup test environment\n    jest.clearAllMocks();\n  });\n\n  test('should handle normal input correctly', () => {\n    // Arrange\n    const input = 'test';\n    // Act & Assert\n    expect(typeof input).toBe('string');\n  });\n\n  test('should handle edge cases', () => {\n    expect(() => { /* edge case */ }).not.toThrow();\n  });\n});\n\`\`\``;
  return `**GLM-4 Response (Simulation Mode)**\n\nI received your query: "${prompt.slice(0,100)}"\n\nI'm currently running in simulation mode. To use the real GLM-4 model:\n\n1. Get an API key from [ZhipuAI](https://open.bigmodel.cn)\n2. Open **Settings → AI**\n3. Enter your GLM API key\n\nAlternatively, switch to **Claude Sonnet** in the model selector for full AI capabilities right now.`;
}

// ===== AUTO-COMPLETE ENHANCEMENT =====
;(function enhanceAutocomplete() {
  if (!window.monaco) { window.addEventListener('monacoReady', setup); return; }
  setup();
  function setup() {
    // Custom completion providers for common patterns
    const languages = ['javascript', 'typescript', 'python', 'go', 'rust', 'java'];
    languages.forEach(lang => {
      monaco.languages.registerCompletionItemProvider(lang, {
        provideCompletionItems(model, position) {
          const word = model.getWordUntilPosition(position);
          const range = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: word.startColumn, endColumn: word.endColumn };
          const snippets = getSnippets(lang, range);
          return { suggestions: snippets };
        }
      });
    });
  }

  function getSnippets(lang, range) {
    const mk = (label, insertText, detail) => ({
      label, kind: monaco.languages.CompletionItemKind.Snippet,
      insertText, insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      detail, range,
    });

    const jsSnippets = [
      mk('afn', 'async function ${1:name}(${2:params}) {\n\t${3:// body}\n}', 'Async function'),
      mk('afe', 'const ${1:name} = async (${2:params}) => {\n\t${3:// body}\n};', 'Async arrow function'),
      mk('trycatch', 'try {\n\t${1:// try body}\n} catch (${2:error}) {\n\tconsole.error(${2:error});\n\t${3:// handle}\n}', 'Try-catch block'),
      mk('cls', 'class ${1:Name} {\n\tconstructor(${2:params}) {\n\t\t${3:// init}\n\t}\n\n\t${4:method}() {\n\t\t${5:// body}\n\t}\n}', 'Class'),
      mk('imp', "import { ${2:name} } from '${1:module}';", 'Import named'),
      mk('impa', "import ${2:name} from '${1:module}';", 'Import default'),
      mk('expd', 'export default ${1:value};', 'Export default'),
      mk('expn', 'export { ${1:name} };', 'Export named'),
      mk('prom', 'new Promise((resolve, reject) => {\n\t${1:// body}\n\tresolve(${2:value});\n})', 'Promise'),
      mk('fetch', "const response = await fetch('${1:url}');\nconst data = await response.json();\n${2:// use data}", 'Fetch API'),
      mk('ael', "${1:element}.addEventListener('${2:click}', (${3:e}) => {\n\t${4:// handler}\n});", 'Event listener'),
      mk('qs', "document.querySelector('${1:selector}')", 'querySelector'),
      mk('qsa', "document.querySelectorAll('${1:selector}')", 'querySelectorAll'),
      mk('log', 'console.log(${1:value});', 'console.log'),
      mk('ife', '(function() {\n\t${1:// body}\n})();', 'IIFE'),
      mk('dstr', 'const { ${1:prop} } = ${2:obj};', 'Destructuring'),
      mk('spre', '...${1:array}', 'Spread'),
      mk('arr', 'const ${1:arr} = [${2:items}];', 'Array'),
      mk('obj', 'const ${1:obj} = {\n\t${2:key}: ${3:value},\n};', 'Object'),
      mk('sw', 'switch (${1:expr}) {\n\tcase ${2:val}:\n\t\t${3:// body}\n\t\tbreak;\n\tdefault:\n\t\t${4:// default}\n}', 'Switch'),
      mk('fore', '${1:array}.forEach((${2:item}) => {\n\t${3:// body}\n});', 'forEach'),
      mk('map', 'const ${1:result} = ${2:array}.map((${3:item}) => {\n\treturn ${4:item};\n});', 'map'),
      mk('filter', 'const ${1:result} = ${2:array}.filter((${3:item}) => {\n\treturn ${4:condition};\n});', 'filter'),
      mk('reduce', 'const ${1:result} = ${2:array}.reduce((${3:acc}, ${4:cur}) => {\n\treturn ${3:acc};\n}, ${5:initial});', 'reduce'),
    ];

    const pySnippets = [
      mk('def', 'def ${1:name}(${2:params}):\n\t"""${3:docstring}"""\n\t${4:pass}', 'Function'),
      mk('cls', 'class ${1:Name}:\n\tdef __init__(self${2:, params}):\n\t\t${3:pass}\n\n\tdef ${4:method}(self):\n\t\t${5:pass}', 'Class'),
      mk('adef', 'async def ${1:name}(${2:params}):\n\t${3:pass}', 'Async function'),
      mk('lc', '[${1:expr} for ${2:item} in ${3:iterable}]', 'List comprehension'),
      mk('dc', '{${1:key}: ${2:val} for ${3:item} in ${4:iterable}}', 'Dict comprehension'),
      mk('trycatch', 'try:\n\t${1:pass}\nexcept ${2:Exception} as ${3:e}:\n\t${4:pass}', 'Try-except'),
      mk('withopen', "with open('${1:file}', '${2:r}') as ${3:f}:\n\t${4:data} = ${3:f}.read()", 'With open'),
      mk('main', "if __name__ == '__main__':\n\t${1:main()}", '__main__'),
      mk('print', 'print(f"${1:value}")', 'f-string print'),
      mk('dataclass', '@dataclass\nclass ${1:Name}:\n\t${2:field}: ${3:type}', 'Dataclass'),
    ];

    const goSnippets = [
      mk('fn', 'func ${1:name}(${2:params}) ${3:returnType} {\n\t${4:// body}\n\treturn ${5:value}\n}', 'Function'),
      mk('err', 'if err != nil {\n\treturn ${1:nil}, err\n}', 'Error check'),
      mk('goroutine', 'go func() {\n\t${1:// body}\n}()', 'Goroutine'),
      mk('chan', '${1:ch} := make(chan ${2:type}, ${3:0})', 'Channel'),
      mk('struct', 'type ${1:Name} struct {\n\t${2:Field} ${3:Type}\n}', 'Struct'),
      mk('interface', 'type ${1:Name} interface {\n\t${2:Method}() ${3:Type}\n}', 'Interface'),
    ];

    const rsSnippets = [
      mk('fn', 'fn ${1:name}(${2:params}) -> ${3:ReturnType} {\n\t${4:// body}\n}', 'Function'),
      mk('impl', 'impl ${1:Type} {\n\tpub fn new(${2:params}) -> Self {\n\t\tSelf { ${3:fields} }\n\t}\n}', 'Impl block'),
      mk('match', 'match ${1:expr} {\n\t${2:pattern} => ${3:result},\n\t_ => ${4:default},\n}', 'Match'),
      mk('res', 'Result<${1:Ok}, ${2:Err}>', 'Result type'),
      mk('opt', 'Option<${1:T}>', 'Option type'),
      mk('vec', 'Vec::new()', 'Vec::new'),
      mk('println', 'println!("${1:msg}", ${2:args});', 'println!'),
    ];

    const map = { javascript: jsSnippets, typescript: jsSnippets, python: pySnippets, go: goSnippets, rust: rsSnippets };
    return map[lang] || [];
  }
})();

// ===== MULTI-CURSOR & COLUMN SELECT =====
;(function enhanceEditor() {
  // Wait for Monaco to be ready
  const checkReady = setInterval(() => {
    if (!monacoReady) return;
    clearInterval(checkReady);

    // Add column selection indicator
    state.monacoEditor.onDidChangeCursorSelection(e => {
      const sel = e.selection;
      if (!sel.isEmpty()) {
        const lines = Math.abs(sel.endLineNumber - sel.startLineNumber) + 1;
        const chars = state.monacoEditor.getModel()?.getValueInRange(sel).length || 0;
        document.getElementById('sbCursor').textContent = `Ln ${sel.startLineNumber}, Col ${sel.startColumn} (${lines} lines, ${chars} chars selected)`;
      }
    });

    // Language-specific format on save
    state.monacoEditor.onDidChangeModel(() => {
      const model = state.monacoEditor.getModel();
      if (!model) return;
      const lang = model.getLanguageId();
      document.getElementById('sbLang').textContent = lang.charAt(0).toUpperCase() + lang.slice(1);
      document.getElementById('sbIndent').textContent = `Spaces: ${state.settings.tabSize}`;
    });
  }, 200);
})();

// ===== FILE SAVE (Ctrl+S with formatter) =====
const originalSaveCurrentFile = window.saveCurrentFile;
window.saveCurrentFile = function() {
  if (!state.activeTab || !monacoReady) return;
  const model = state.monacoModels[state.activeTab];
  if (!model) return;
  if (state.settings.formatOnSave) {
    state.monacoEditor.getAction('editor.action.formatDocument')?.run().then(() => {
      originalSaveCurrentFile();
    }).catch(() => originalSaveCurrentFile());
  } else {
    originalSaveCurrentFile();
  }
};

// ===== LIVE PREVIEW =====
let previewWindow = null;
function openLivePreview() {
  const htmlFile = state.openTabs.find(t => t.path.endsWith('.html'));
  if (!htmlFile) { toast('Open an HTML file to preview', 'warning'); return; }
  const content = state.monacoModels[htmlFile.path]?.getValue() || state.files[htmlFile.path]?.content || '';
  const blob = new Blob([content], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  if (previewWindow && !previewWindow.closed) { previewWindow.location.href = url; }
  else { previewWindow = window.open(url, 'apex-preview', 'width=1200,height=800,resizable=yes'); }
  toast('Live preview opened', 'success');
}

// ===== EMMET SUPPORT =====
;(function initEmmet() {
  const checkReady = setInterval(() => {
    if (!monacoReady) return;
    clearInterval(checkReady);
    // Register HTML/CSS abbreviation expansion
    state.monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyE, () => {
      const model = state.monacoEditor.getModel();
      if (!model) return;
      const pos = state.monacoEditor.getPosition();
      const line = model.getLineContent(pos.lineNumber);
      const wordMatch = line.slice(0, pos.column - 1).match(/[\w.#>+*\[\]="':^$~|-]+$/);
      if (!wordMatch) return;
      const abbr = wordMatch[0];
      const expanded = expandEmmet(abbr);
      if (expanded === abbr) return;
      const startCol = pos.column - abbr.length;
      const range = new monaco.Range(pos.lineNumber, startCol, pos.lineNumber, pos.column);
      model.pushEditOperations([], [{ range, text: expanded, forceMoveMarkers: true }], () => null);
    });
  }, 200);

  function expandEmmet(abbr) {
    // Basic Emmet expansion
    const tags = {
      '!': '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>Document</title>\n</head>\n<body>\n  \n</body>\n</html>',
      'html:5': '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title></title>\n</head>\n<body>\n  \n</body>\n</html>',
    };
    if (tags[abbr]) return tags[abbr];
    // Simple tag expansion: div -> <div></div>
    const tagMatch = abbr.match(/^(\w+)$/);
    if (tagMatch) return `<${abbr}></${abbr}>`;
    // Class: div.class -> <div class="class"></div>
    const classMatch = abbr.match(/^(\w+)\.(\w+)$/);
    if (classMatch) return `<${classMatch[1]} class="${classMatch[2]}"></${classMatch[1]}>`;
    // ID: div#id -> <div id="id"></div>
    const idMatch = abbr.match(/^(\w+)#(\w+)$/);
    if (idMatch) return `<${idMatch[1]} id="${idMatch[2]}"></${idMatch[1]}>`;
    return abbr;
  }
})();

// ===== CODE FOLDING =====
function foldAll() { if (monacoReady) state.monacoEditor.getAction('editor.foldAll')?.run(); }
function unfoldAll() { if (monacoReady) state.monacoEditor.getAction('editor.unfoldAll')?.run(); }

// ===== MINIMAP TOGGLE =====
function toggleMinimap() {
  state.settings.minimap = !state.settings.minimap;
  if (monacoReady) state.monacoEditor.updateOptions({ minimap: { enabled: state.settings.minimap } });
  toast(`Minimap ${state.settings.minimap ? 'shown' : 'hidden'}`, 'info');
}

// ===== WORD WRAP TOGGLE =====
function toggleWordWrap() {
  state.settings.wordWrap = state.settings.wordWrap === 'off' ? 'on' : 'off';
  if (monacoReady) state.monacoEditor.updateOptions({ wordWrap: state.settings.wordWrap });
  toast(`Word wrap: ${state.settings.wordWrap}`, 'info');
}

// ===== GIT STATUS UPDATE =====
function updateGitStatus() {
  const changed = Object.entries(state.files).filter(([_, f]) => f.modified);
  const container = document.getElementById('gitChanges');
  if (changed.length === 0) { container.innerHTML = '<div class="git-empty">No changes detected</div>'; return; }
  container.innerHTML = changed.map(([path, _]) => `
    <div class="git-file">
      <span class="git-status M">M</span>
      <span>${path.split('/').pop()}</span>
      <span style="color:var(--text-3);font-size:11px;margin-left:auto">${path}</span>
    </div>`).join('');
}

// Auto-update git panel when files change
setInterval(updateGitStatus, 3000);

// ===== KEYBOARD SHORTCUTS ADDITIONAL =====
document.addEventListener('keydown', e => {
  // Ctrl+Shift+P = Command Palette (alternative)
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') { e.preventDefault(); openCommandPalette(); return; }
  // Alt+Z = Word Wrap
  if (e.altKey && e.key === 'z') { e.preventDefault(); toggleWordWrap(); return; }
  // F11 = Fullscreen
  if (e.key === 'F11') { e.preventDefault(); maximizeApp(); return; }
  // Ctrl+Shift+` = New Terminal
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === '`') { e.preventDefault(); addTerminal(); return; }
  // Ctrl+K Ctrl+0 = Fold All
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    state._kChord = true;
    setTimeout(() => { state._kChord = false; }, 1000);
    return;
  }
  if (state._kChord && e.key === '0') { e.preventDefault(); foldAll(); return; }
  if (state._kChord && e.key === 'j') { e.preventDefault(); unfoldAll(); return; }
  if (state._kChord && e.key === 'm') { e.preventDefault(); toggleMinimap(); return; }
  // Ctrl+Shift+L = Open Live Preview
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'L') { e.preventDefault(); openLivePreview(); return; }
});

// Add commands to palette
COMMANDS.push(
  { label: 'Fold All', key: 'Ctrl+K Ctrl+0', action: foldAll, icon: '⊟', group: 'Editor' },
  { label: 'Unfold All', key: 'Ctrl+K Ctrl+J', action: unfoldAll, icon: '⊞', group: 'Editor' },
  { label: 'Toggle Minimap', key: 'Ctrl+K Ctrl+M', action: toggleMinimap, icon: '▤', group: 'Editor' },
  { label: 'Toggle Word Wrap', key: 'Alt+Z', action: toggleWordWrap, icon: '⤵', group: 'Editor' },
  { label: 'Live Preview', key: 'Ctrl+Shift+L', action: openLivePreview, icon: '🌐', group: 'Run' },
  { label: 'Install App (PWA)', key: '', action: () => document.getElementById('btnInstall')?.click(), icon: '⬇', group: 'File' },
);

// ===== OUTPUT LOG UTILITY =====
const originalLogOutput = window.logOutput;
window.logOutput = function(msg, type) {
  if (originalLogOutput) originalLogOutput(msg, type);
  // Also broadcast to terminal
  const t = state.terminals[state.activeTerminal];
  if (t && type === 'error') {
    t.term.writeln(`\x1b[38;5;196m${msg}\x1b[0m`);
  }
};

// ===== TOUCH GESTURE SUPPORT =====
;(function initTouchGestures() {
  let touchStartX = 0;
  document.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; });
  document.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) < 60) return;
    if (dx > 0 && touchStartX < 30) {
      // Swipe right from left edge -> open sidebar
      document.getElementById('sidebar').classList.add('open');
    } else if (dx < 0) {
      document.getElementById('sidebar').classList.remove('open');
    }
  });
})();

// ===== SETTINGS: GLM KEY =====
const origRenderSettings = window.renderSettings;
window.renderSettings = function(tab) {
  origRenderSettings(tab);
  if (tab === 'ai') {
    const main = document.getElementById('settingsMain');
    const extra = `
      <div class="setting-group" style="margin-top:16px">
        <div class="setting-group-title">GLM-4 API Key (ZhipuAI)</div>
        <div class="setting-row">
          <div class="setting-label">API Key</div>
          <input type="password" value="${state.settings.glmKey || ''}" placeholder="Enter ZhipuAI API key..." 
            style="padding:4px 8px;background:var(--bg-4);border:1px solid var(--border);border-radius:4px;color:var(--text-1);width:220px"
            onchange="updateSetting('glmKey',this.value);toast('GLM key saved','success')" />
        </div>
        <div class="setting-row">
          <div><div class="setting-label">Get API Key</div><div class="setting-desc">Register at ZhipuAI to use real GLM-4</div></div>
          <a href="https://open.bigmodel.cn" target="_blank" style="color:var(--accent);font-size:12px">open.bigmodel.cn →</a>
        </div>
      </div>`;
    main.innerHTML += extra;
  }
};

// ===== STARTUP: Apply saved settings =====
;(function applySavedSettings() {
  const checkReady = setInterval(() => {
    if (!monacoReady) return;
    clearInterval(checkReady);
    const s = state.settings;
    state.monacoEditor.updateOptions({
      fontSize: s.fontSize,
      fontFamily: s.fontFamily,
      tabSize: s.tabSize,
      wordWrap: s.wordWrap,
      minimap: { enabled: s.minimap },
      lineNumbers: s.lineNumbers,
      bracketPairColorization: { enabled: s.bracketPairs },
      stickyScroll: { enabled: s.stickyScroll },
      cursorBlinking: s.cursorBlinking,
      cursorStyle: s.cursorStyle,
      renderLineHighlight: s.renderLineHighlight,
      renderWhitespace: s.renderWhitespace,
    });
    monaco.editor.setTheme(s.theme || 'apex-dark');
  }, 200);
})();

console.log('[Apex IDE] Extended features module loaded.');
