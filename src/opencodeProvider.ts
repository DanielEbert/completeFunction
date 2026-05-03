import * as vscode from 'vscode';
import * as path from 'path';

export interface PersistedTaskItem {
  id: string;
  functionName: string;
  filePath: string;
  lineNumber: number;
  status: 'running' | 'completed' | 'cancelled' | 'failed';
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

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

function buildTooltip(item: TaskItem): string {
  const lines: string[] = [];
  lines.push(`File: ${item.filePath}:${item.lineNumber}`);
  lines.push(`Status: ${item.status}`);
  lines.push(`Started: ${formatTime(item.startTime)}`);
  if (item.endTime) {
    lines.push(`Duration: ${formatDuration(item.startTime, item.endTime)}`);
  } else if (item.status === 'running') {
    lines.push(`Elapsed: ${formatDuration(item.startTime)}`);
  }
  return lines.join('\n');
}

export class TaskItem extends vscode.TreeItem {
  public startTime: number;
  public endTime?: number;

  constructor(
    public readonly id: string,
    public readonly functionName: string,
    public readonly filePath: string,
    public readonly lineNumber: number,
    public status: 'running' | 'completed' | 'cancelled' | 'failed',
    public execution?: vscode.TaskExecution,
    startTime?: number,
    endTime?: number,
  ) {
    super(
      `${functionName} (${path.basename(filePath)}:${lineNumber})`,
      vscode.TreeItemCollapsibleState.None
    );
    this.startTime = startTime || Date.now();
    this.endTime = endTime;
    this.updateIconAndContext();
    this.tooltip = buildTooltip(this);
  }

  updateIconAndContext() {
    this.contextValue = this.status;
    if (this.status === 'running') {
      this.iconPath = new vscode.ThemeIcon('loading~spin');
    } else if (this.status === 'completed') {
      this.iconPath = new vscode.ThemeIcon('check');
    } else if (this.status === 'cancelled') {
      this.iconPath = new vscode.ThemeIcon('close');
    } else if (this.status === 'failed') {
      this.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
    }

    this.command = {
      command: 'opencode.showOutput',
      title: 'Show Output',
      arguments: [this]
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
    const effectiveStatus = data.status === 'running' ? 'cancelled' : data.status;
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
  private _onDidChangeTreeData: vscode.EventEmitter<TaskItem | undefined | void> = new vscode.EventEmitter<TaskItem | undefined | void>();
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

  updateTaskStatus(task: TaskItem, status: 'completed' | 'cancelled' | 'failed') {
    task.status = status;
    task.endTime = Date.now();
    task.updateIconAndContext();
    this.refresh();
    this._onTasksChanged.fire();
  }

  removeCompletedTasks() {
    this.tasks = this.tasks.filter(
      (t) => t.status === 'running',
    );
    this.refresh();
    this._onTasksChanged.fire();
  }

  getPersistedTasks(): PersistedTaskItem[] {
    return this.tasks.map((t) => t.toPersisted());
  }

  loadFromPersisted(data: PersistedTaskItem[]) {
    this.tasks = data.map((d) => TaskItem.fromPersisted(d));
    this.refresh();
  }
}
