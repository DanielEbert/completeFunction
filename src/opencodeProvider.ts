import * as vscode from 'vscode';
import * as path from 'path';

export class TaskItem extends vscode.TreeItem {
  constructor(
    public readonly id: string,
    public readonly functionName: string,
    public readonly filePath: string,
    public readonly lineNumber: number,
    public status: 'running' | 'completed' | 'cancelled',
    public execution?: vscode.TaskExecution
  ) {
    super(
      `${functionName} (${path.basename(filePath)}:${lineNumber})`,
      vscode.TreeItemCollapsibleState.None
    );
    this.updateIconAndContext();
  }

  updateIconAndContext() {
    this.contextValue = this.status;
    if (this.status === 'running') {
      this.iconPath = new vscode.ThemeIcon('loading~spin');
    } else if (this.status === 'completed') {
      this.iconPath = new vscode.ThemeIcon('check');
    } else if (this.status === 'cancelled') {
      this.iconPath = new vscode.ThemeIcon('close');
    }
    
    this.command = {
      command: 'opencode.showOutput',
      title: 'Show Output',
      arguments: [this]
    };
  }
}

export class OpenCodeProvider implements vscode.TreeDataProvider<TaskItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<TaskItem | undefined | void> = new vscode.EventEmitter<TaskItem | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<TaskItem | undefined | void> = this._onDidChangeTreeData.event;

  private tasks: TaskItem[] = [];

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
  }

  updateTaskStatus(task: TaskItem, status: 'completed' | 'cancelled') {
    task.status = status;
    task.updateIconAndContext();
    this.refresh();
  }
}
