import * as vscode from "vscode";
import * as path from "node:path";

const PERSISTED_TASKS_KEY = "opencode.tasks.history";

let statusBarItem: vscode.StatusBarItem | undefined;
let runningTaskCount = 0;

export interface PersistedTaskItem {
  id: string;
  functionName: string;
  filePath: string;
  lineNumber: number;
  status: "running" | "completed" | "cancelled" | "failed";
  startTime: number;
  endTime?: number;
}

function formatDuration(startTime: number, endTime?: number): string {
  const end = endTime || Date.now();
  const ms = end - startTime;
  const seconds = Math.floor(ms / 1000) % 60;
  const minutes = Math.floor(ms / (60 * 1000));
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function buildTooltip(item: TaskItem): string {
  const lines: string[] = [];
  lines.push(`File: ${item.filePath}:${item.lineNumber}`);
  lines.push(`Status: ${item.status}`);
  const formattedTime = new Date(item.startTime).toLocaleString();
  lines.push(`Started: ${formattedTime}`);
  if (item.endTime) {
    lines.push(`Duration: ${formatDuration(item.startTime, item.endTime)}`);
  } else if (item.status === "running") {
    lines.push(`Elapsed: ${formatDuration(item.startTime)}`);
  }
  return lines.join("\n");
}

export class TaskItem extends vscode.TreeItem {
  public startTime: number;
  public endTime?: number;

  constructor(
    public readonly id: string,
    public readonly functionName: string,
    public readonly filePath: string,
    public readonly lineNumber: number,
    public status: "running" | "completed" | "cancelled" | "failed",
    public execution?: vscode.TaskExecution,
    startTime?: number,
    endTime?: number,
  ) {
    super(`${functionName} (${path.basename(filePath)}:${lineNumber})`, vscode.TreeItemCollapsibleState.None);
    this.startTime = startTime || Date.now();
    this.endTime = endTime;
    this.updateIconAndContext();
    this.tooltip = buildTooltip(this);
  }

  updateIconAndContext() {
    this.contextValue = this.status;
    if (this.status === "running") {
      this.iconPath = new vscode.ThemeIcon("loading~spin");
    } else if (this.status === "completed") {
      this.iconPath = new vscode.ThemeIcon("check");
    } else if (this.status === "cancelled") {
      this.iconPath = new vscode.ThemeIcon("close");
    } else if (this.status === "failed") {
      this.iconPath = new vscode.ThemeIcon("error", new vscode.ThemeColor("errorForeground"));
    }

    this.command = {
      command: "opencode.showOutput",
      title: "Show Output",
      arguments: [this],
    };

    this.tooltip = buildTooltip(this);
  }

  toPersisted(): PersistedTaskItem {
    return {
      id: this.id,
      functionName: this.functionName,
      filePath: this.filePath,
      lineNumber: this.lineNumber,
      status: this.status,
      startTime: this.startTime,
      endTime: this.endTime,
    };
  }

  static fromPersisted(data: PersistedTaskItem): TaskItem {
    const effectiveStatus = data.status === "running" ? "cancelled" : data.status;
    return new TaskItem(
      data.id,
      data.functionName,
      data.filePath,
      data.lineNumber,
      effectiveStatus,
      undefined,
      data.startTime,
      data.endTime,
    );
  }
}

export class OpenCodeProvider implements vscode.TreeDataProvider<TaskItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<TaskItem | undefined | void> = new vscode.EventEmitter<
    TaskItem | undefined | void
  >();
  readonly onDidChangeTreeData: vscode.Event<TaskItem | undefined | void> = this._onDidChangeTreeData.event;

  private tasks: TaskItem[] = [];
  private _onTasksChanged: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  readonly onTasksChanged: vscode.Event<void> = this._onTasksChanged.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TaskItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TaskItem): Thenable<TaskItem[]> {
    if (element) {
      return Promise.resolve([]);
    }
    return Promise.resolve(this.tasks);
  }

  getTasks(): TaskItem[] {
    return this.tasks;
  }

  addTask(task: TaskItem) {
    this.tasks.unshift(task);
    this.refresh();
    this._onTasksChanged.fire();
  }

  updateTaskStatus(task: TaskItem, status: "completed" | "cancelled" | "failed") {
    task.status = status;
    task.endTime = Date.now();
    task.updateIconAndContext();
    this.refresh();
    this._onTasksChanged.fire();
  }

  removeCompletedTasks() {
    this.tasks = this.tasks.filter((t) => t.status === "running");
    this.refresh();
    this._onTasksChanged.fire();
  }

  getPersistedTasks(): PersistedTaskItem[] {
    return this.tasks.map((t) => t.toPersisted());
  }

  loadFromPersisted(data: PersistedTaskItem[]) {
    if (data.length == 0) return;
    this.tasks = data.map((d) => TaskItem.fromPersisted(d));
    this.refresh();
  }
}

async function findEnclosingFunctionName(document: vscode.TextDocument, position: vscode.Position): Promise<string> {
  try {
    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      "vscode.executeDocumentSymbolProvider",
      document.uri,
    );

    if (!symbols || symbols.length === 0) {
      return "Function";
    }

    function searchSymbols(syms: vscode.DocumentSymbol[]): string | undefined {
      for (const sym of syms) {
        if (
          sym.kind === vscode.SymbolKind.Function ||
          sym.kind === vscode.SymbolKind.Method ||
          sym.kind === vscode.SymbolKind.Constructor
        ) {
          if (sym.range.contains(position)) {
            if (sym.children && sym.children.length > 0) {
              const inner = searchSymbols(sym.children);
              if (inner) {
                return inner;
              }
            }
            return sym.name;
          }
        }
        if (sym.children && sym.children.length > 0) {
          if (sym.range.contains(position)) {
            const inner = searchSymbols(sym.children);
            if (inner) {
              return inner;
            }
          }
        }
      }
      return undefined;
    }

    const name = searchSymbols(symbols);
    return name || "Function";
  } catch {
    return "Function";
  }
}

function updateStatusBar() {
  if (!statusBarItem) {
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.name = "OpenCode Task";
  }
  if (runningTaskCount > 0) {
    statusBarItem.text = `$(loading~spin) OpenCode`;
    statusBarItem.tooltip = `${runningTaskCount} OpenCode task(s) running`;
    statusBarItem.show();
  } else {
    statusBarItem.hide();
  }
}

async function runCompleteFunction(provider: OpenCodeProvider, additionalPrompt?: string) {
  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    vscode.window.showErrorMessage("No active text editor found.");
    return;
  }

  const document = editor.document;

  if (document.isDirty) {
    await document.save();
  }

  const position = editor.selection.active;
  const lineText = document.lineAt(position.line).text.trim();

  if (!lineText) {
    vscode.window.showWarningMessage("The current line is empty. Please place your cursor on a function signature.");
    return;
  }

  const filePath = vscode.workspace.asRelativePath(document.uri);
  const lineNumber = position.line + 1;

  const functionName = await findEnclosingFunctionName(document, position);

  let message = `File: ${filePath}, Line: ${lineNumber}, Content: ${lineText}`;
  if (additionalPrompt) {
    message += `\nAdditional Instructions: ${additionalPrompt}`;
  }

  const config = vscode.workspace.getConfiguration("opencode");
  const modelString = config.get<string>("model") || "xai/grok-4.3";

  const taskId = Date.now().toString();
  const now = Date.now();
  const taskItem = new TaskItem(taskId, functionName, document.uri.fsPath, lineNumber, "running", undefined, now);

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  const scope = workspaceFolder || vscode.TaskScope.Global;

  const shellExec = new vscode.ShellExecution("opencode", [
    "run",
    "--agent",
    "implement",
    "--model",
    modelString,
    "--thinking",
    message,
  ]);

  const task = new vscode.Task(
    { type: "opencode", taskId: taskId },
    scope,
    `Implement ${functionName}`,
    "OpenCode",
    shellExec,
  );

  task.presentationOptions = {
    reveal: vscode.TaskRevealKind.Always,
    panel: vscode.TaskPanelKind.Shared,
    focus: true,
  };

  provider.addTask(taskItem);
  runningTaskCount++;
  updateStatusBar();

  vscode.tasks.executeTask(task).then((execution) => {
    taskItem.execution = execution;
  });
}

export function activate(context: vscode.ExtensionContext) {
  const provider = new OpenCodeProvider();

  const persisted = context.globalState.get<PersistedTaskItem[]>(PERSISTED_TASKS_KEY, []);
  provider.loadFromPersisted(persisted);

  provider.onTasksChanged(() => {
    context.globalState.update(PERSISTED_TASKS_KEY, provider.getPersistedTasks());
  });

  vscode.window.registerTreeDataProvider("opencode.tasks", provider);

  let disposableComplete = vscode.commands.registerCommand("opencode.completeFunction", () => {
    runCompleteFunction(provider);
  });

  let disposableCompleteWithPrompt = vscode.commands.registerCommand(
    "opencode.completeFunctionWithPrompt",
    async () => {
      const prompt = await vscode.window.showInputBox({
        prompt: "Additional context or instructions for OpenCode",
        placeHolder: "e.g., Use a binary search algorithm",
      });

      if (prompt !== undefined) {
        runCompleteFunction(provider, prompt);
      }
    },
  );

  let disposableTaskEndProcess = vscode.tasks.onDidEndTaskProcess((e) => {
    if (e.execution.task.definition.type === "opencode") {
      const taskId = e.execution.task.definition.taskId;
      const taskItem = provider.getTasks().find((t) => t.id === taskId);
      if (taskItem && taskItem.status === "running") {
        if (e.exitCode !== undefined && e.exitCode > 0) {
          provider.updateTaskStatus(taskItem, "failed");
        } else {
          provider.updateTaskStatus(taskItem, "completed");
        }
        runningTaskCount = Math.max(0, runningTaskCount - 1);
        updateStatusBar();
      }
    }
  });

  let disposableShowOutput = vscode.commands.registerCommand("opencode.showOutput", (item: TaskItem) => {
    const term = vscode.window.terminals.find(
      (t) => t.name.includes(`Implement ${item.functionName}`) || t.name.includes("OpenCode"),
    );
    if (term) {
      term.show();
    } else {
      vscode.window.showInformationMessage("Terminal for this task is no longer available.");
    }
  });

  let disposableJump = vscode.commands.registerCommand("opencode.jumpToImplementation", async (item: TaskItem) => {
    const doc = await vscode.workspace.openTextDocument(item.filePath);
    const editor = await vscode.window.showTextDocument(doc);
    const line = item.lineNumber - 1;
    const range = doc.lineAt(line).range;
    editor.selection = new vscode.Selection(range.start, range.end);
    editor.revealRange(range);
  });

  let disposableCancel = vscode.commands.registerCommand("opencode.cancelTask", (item: TaskItem) => {
    if (item.execution) {
      item.execution.terminate();
      provider.updateTaskStatus(item, "cancelled");
      runningTaskCount = Math.max(0, runningTaskCount - 1);
      updateStatusBar();
    }
  });

  let disposableClearCompleted = vscode.commands.registerCommand("opencode.clearCompletedTasks", () => {
    provider.removeCompletedTasks();
  });

  // We configure opencode via cli beforehand to setup the providers
  let disposableSelectModel = vscode.commands.registerCommand("opencode.selectModel", async () => {
    const models = [
      "xai/grok-4.3",
      "google/gemini-3.1-pro-preview",
      "google/gemini-2.5-pro",
      "anthropic/claude-3-7-sonnet-20250219",
      "anthropic/claude-3-5-sonnet-20241022",
      "openai/gpt-4o",
      "openai/o3-mini",
      "Enter custom model...",
    ];

    let selected = await vscode.window.showQuickPick(models, {
      placeHolder: "Select a model to use for OpenCode",
    });

    if (selected === "Enter custom model...") {
      selected = await vscode.window.showInputBox({
        prompt: "Enter the model string (e.g. provider/model-name)",
      });
    }

    if (selected) {
      await vscode.workspace.getConfiguration().update("opencode.model", selected, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(`OpenCode model set to ${selected}`);
    }
  });

  context.subscriptions.push(
    disposableComplete,
    disposableCompleteWithPrompt,
    disposableTaskEndProcess,
    disposableShowOutput,
    disposableJump,
    disposableCancel,
    disposableClearCompleted,
    disposableSelectModel,
  );
}

export function deactivate() {}
