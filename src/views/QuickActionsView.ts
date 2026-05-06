import * as vscode from 'vscode';

interface ActionMessage {
  type: 'run';
  command: string;
}

export class QuickActionsView implements vscode.WebviewViewProvider {
  static readonly viewId = 'aiContextBridge.quickActions';

  resolveWebviewView(view: vscode.WebviewView): void {
    view.webview.options = { enableScripts: true };
    view.webview.html = renderHtml(view.webview);
    view.webview.onDidReceiveMessage((msg: ActionMessage) => {
      if (msg?.type === 'run' && typeof msg.command === 'string') {
        void vscode.commands.executeCommand(msg.command);
      }
    });
  }
}

function renderHtml(webview: vscode.Webview): string {
  const csp = `default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'unsafe-inline';`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<style>
  body {
    padding: 8px;
    margin: 0;
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    background: transparent;
  }
  .btn {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 10px 12px;
    margin: 0 0 6px 0;
    border: 1px solid var(--vscode-button-border, transparent);
    border-radius: 4px;
    background: var(--vscode-button-secondaryBackground, var(--vscode-button-background));
    color: var(--vscode-button-secondaryForeground, var(--vscode-button-foreground));
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    text-align: left;
    box-sizing: border-box;
  }
  .btn:hover {
    background: var(--vscode-button-secondaryHoverBackground, var(--vscode-button-hoverBackground));
  }
  .btn.primary {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }
  .btn.primary:hover {
    background: var(--vscode-button-hoverBackground);
  }
  .icon {
    font-size: 15px;
    line-height: 1;
    width: 18px;
    text-align: center;
  }
  .label {
    flex: 1;
    line-height: 1.25;
  }
  .sub {
    display: block;
    font-size: 10px;
    font-weight: 400;
    opacity: 0.7;
    margin-top: 1px;
  }
</style>
</head>
<body>
  <button class="btn primary" data-cmd="aiContextBridge.syncAllNow">
    <span class="icon">⟳</span>
    <span class="label">Sync All Now<span class="sub">context · skills · MCP rescan</span></span>
  </button>
  <button class="btn" data-cmd="aiContextBridge.configureTargets">
    <span class="icon">⚙</span>
    <span class="label">Target Settings<span class="sub">skills · context · MCP</span></span>
  </button>
  <button class="btn" data-cmd="aiContextBridge.copyBootstrapPrompt">
    <span class="icon">📂</span>
    <span class="label">Copy Bootstrap Prompt<span class="sub">paths only — agent reads files itself</span></span>
  </button>
  <button class="btn" data-cmd="aiContextBridge.copyReloadPrompt">
    <span class="icon">↻</span>
    <span class="label">Copy Reload Prompt<span class="sub">refresh context after agent switch</span></span>
  </button>

<script>
  const vscode = acquireVsCodeApi();
  document.querySelectorAll('.btn').forEach((b) => {
    b.addEventListener('click', () => {
      const cmd = b.getAttribute('data-cmd');
      if (cmd) vscode.postMessage({ type: 'run', command: cmd });
    });
  });
</script>
</body>
</html>`;
}
