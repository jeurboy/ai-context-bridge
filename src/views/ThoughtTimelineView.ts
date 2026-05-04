import * as vscode from 'vscode';
import { MemoryManager } from '../memory/MemoryManager';
import { PersistedState, Thought } from '../memory/types';

export class ThoughtTimelineView {
  private static readonly viewType = 'aiContextBridge.timeline';
  private panel: vscode.WebviewPanel | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly memory: MemoryManager,
    private readonly extensionUri: vscode.Uri,
  ) {
    this.disposables.push(
      memory.onDidChange((c) => {
        if (c.kind === 'thought' || c.kind === 'bulk') {
          this.postState();
        }
      }),
    );
  }

  show(): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside);
      this.postState();
      return;
    }
    this.panel = vscode.window.createWebviewPanel(
      ThoughtTimelineView.viewType,
      'AI Thought Timeline',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
      { enableScripts: true, retainContextWhenHidden: true },
    );
    this.panel.iconPath = new vscode.ThemeIcon('timeline-view-icon');
    this.panel.webview.html = this.renderHtml(this.panel.webview);
    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });
    this.panel.webview.onDidReceiveMessage((msg) => this.onMessage(msg));
    this.postState();
  }

  private async onMessage(msg: { type: string; payload?: unknown }): Promise<void> {
    switch (msg.type) {
      case 'ready':
        this.postState();
        return;
      case 'copyContext': {
        const id = (msg.payload as { id: string }).id;
        const t = this.memory.getState().thoughts.find((x) => x.id === id);
        if (t) {
          await vscode.env.clipboard.writeText(formatContext(t));
          vscode.window.setStatusBarMessage('AI Context Bridge: thought copied', 2000);
        }
        return;
      }
      case 'openFile': {
        const ref = (msg.payload as { sourceReference?: string }).sourceReference;
        if (ref) {
          await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(ref));
        }
        return;
      }
    }
  }

  private postState(): void {
    if (!this.panel) {
      return;
    }
    const state = this.memory.getState();
    this.panel.webview.postMessage({
      type: 'state',
      payload: serializeState(state),
    });
  }

  private renderHtml(webview: vscode.Webview): string {
    const csp = `default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline';`;
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<title>Thought Timeline</title>
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0;
    padding: 16px;
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
  }
  header { display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; gap:12px; flex-wrap:wrap; }
  h1 { font-size: 14px; margin:0; text-transform:uppercase; letter-spacing:.08em; opacity:.8; }
  .filters { display:flex; gap:6px; flex-wrap:wrap; }
  .filter {
    border:1px solid var(--vscode-panel-border, #444);
    padding: 2px 8px;
    border-radius: 999px;
    cursor: pointer;
    font-size: 11px;
    background: transparent;
    color: inherit;
  }
  .filter.active { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-color: transparent; }
  .empty { opacity:.6; padding: 32px; text-align:center; border:1px dashed var(--vscode-panel-border, #444); border-radius:8px; }
  .timeline { display:flex; flex-direction:column; gap:10px; }
  .card {
    border-left: 3px solid var(--vscode-textLink-foreground);
    background: var(--vscode-editorWidget-background);
    padding: 10px 12px;
    border-radius: 6px;
  }
  .card header { margin: 0 0 6px; gap: 8px; }
  .badge {
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 4px;
    background: var(--vscode-textLink-foreground);
    color: var(--vscode-button-foreground);
    text-transform: uppercase;
    letter-spacing: .05em;
  }
  .ts { font-size: 11px; opacity: .7; }
  .text { white-space: pre-wrap; line-height: 1.5; font-size: 13px; }
  .meta { display:flex; gap:8px; flex-wrap:wrap; margin-top:8px; font-size:11px; opacity:.85; align-items:center; }
  .tag { background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); padding:1px 6px; border-radius:3px; }
  .actions { display:flex; gap:6px; }
  .actions button {
    background: transparent;
    border:1px solid var(--vscode-panel-border, #555);
    color: inherit;
    padding: 2px 8px;
    border-radius: 4px;
    cursor:pointer;
    font-size: 11px;
  }
  .actions button:hover { background: var(--vscode-toolbar-hoverBackground); }
  .source { font-family: var(--vscode-editor-font-family, monospace); }
  .diff-hint { font-size:11px; opacity:.7; padding:4px 0; }
</style>
</head>
<body>
  <header>
    <h1>Thought Timeline</h1>
    <div class="filters" id="filters"></div>
  </header>
  <div id="root" class="timeline"></div>
<script>
  const vscode = acquireVsCodeApi();
  let lastState = { thoughts: [], skills: [], pinnedFiles: [], killSwitchEngaged:false };
  let activeModel = '__all__';

  function formatTime(ts) {
    try { return new Date(ts).toLocaleString(); } catch { return ''; }
  }

  function modelColor(modelId) {
    let h = 0;
    for (const ch of modelId) h = (h * 31 + ch.charCodeAt(0)) % 360;
    return 'hsl(' + h + ', 60%, 45%)';
  }

  function render() {
    const root = document.getElementById('root');
    const models = Array.from(new Set(lastState.thoughts.map(t => t.modelId))).sort();
    const filters = document.getElementById('filters');
    filters.innerHTML = '';
    const all = makeFilter('All', '__all__');
    filters.appendChild(all);
    models.forEach(m => filters.appendChild(makeFilter(m, m)));

    const items = lastState.thoughts
      .slice()
      .sort((a,b) => b.timestamp - a.timestamp)
      .filter(t => activeModel === '__all__' || t.modelId === activeModel);

    if (items.length === 0) {
      root.innerHTML = '<div class="empty">No thoughts yet. Have an AI write to <code>state.json</code> or run<br/><code>AI Context Bridge: Add Thought</code>.</div>';
      return;
    }

    root.innerHTML = '';
    let prevModel = null;
    items.forEach(t => {
      const card = document.createElement('div');
      card.className = 'card';
      card.style.borderLeftColor = modelColor(t.modelId);

      if (prevModel && prevModel !== t.modelId) {
        const hint = document.createElement('div');
        hint.className = 'diff-hint';
        hint.textContent = 'Model handoff: ' + prevModel + ' → ' + t.modelId;
        root.appendChild(hint);
      }
      prevModel = t.modelId;

      const head = document.createElement('header');
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = t.modelId;
      badge.style.background = modelColor(t.modelId);
      const ts = document.createElement('span');
      ts.className = 'ts';
      ts.textContent = formatTime(t.timestamp);
      head.appendChild(badge);
      head.appendChild(ts);
      card.appendChild(head);

      const body = document.createElement('div');
      body.className = 'text';
      body.textContent = t.text;
      card.appendChild(body);

      const meta = document.createElement('div');
      meta.className = 'meta';
      if (t.sourceReference) {
        const a = document.createElement('a');
        a.href = '#';
        a.className = 'source';
        a.textContent = t.sourceReference;
        a.onclick = (ev) => { ev.preventDefault(); vscode.postMessage({ type:'openFile', payload: { sourceReference: t.sourceReference } }); };
        meta.appendChild(a);
      }
      (t.tags || []).forEach(tag => {
        const span = document.createElement('span');
        span.className = 'tag';
        span.textContent = tag;
        meta.appendChild(span);
      });
      const actions = document.createElement('span');
      actions.className = 'actions';
      const copyBtn = document.createElement('button');
      copyBtn.textContent = 'Copy context';
      copyBtn.onclick = () => vscode.postMessage({ type:'copyContext', payload: { id: t.id } });
      actions.appendChild(copyBtn);
      meta.appendChild(actions);
      card.appendChild(meta);
      root.appendChild(card);
    });
  }

  function makeFilter(label, value) {
    const btn = document.createElement('button');
    btn.className = 'filter' + (value === activeModel ? ' active' : '');
    btn.textContent = label;
    btn.onclick = () => { activeModel = value; render(); };
    return btn;
  }

  window.addEventListener('message', (ev) => {
    const msg = ev.data;
    if (msg.type === 'state') {
      lastState = msg.payload;
      render();
    }
  });

  vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
    this.panel?.dispose();
  }
}

function serializeState(state: PersistedState) {
  return {
    thoughts: state.thoughts,
    pinnedFiles: state.pinnedFiles,
    skills: state.skills,
    killSwitchEngaged: state.killSwitchEngaged,
  };
}

function formatContext(t: Thought): string {
  const lines = [
    `# Thought ${t.id}`,
    `Model: ${t.modelId}`,
    `Time: ${new Date(t.timestamp).toISOString()}`,
  ];
  if (t.sourceReference) {
    lines.push(`Source: ${t.sourceReference}`);
  }
  if (t.tags?.length) {
    lines.push(`Tags: ${t.tags.join(', ')}`);
  }
  lines.push('', t.text);
  return lines.join('\n');
}
