# DragDropTree 重构计划

## 问题分析

当前代码存在职责混乱：
- `SortGuiView.applySort()` 同时负责写入 sortspec 和刷新 Obsidian
- `DragDropTree.reorderItem()` 的 sortspec 更新逻辑不完整
- 排序数据没有按文件夹隔离，导致互相干扰

## 重构目标

### 1. 拖拽排序后立即更新 sortspec
**位置**: `DragDropTree.ts`

```typescript
// handleDrop 中：
private handleDrop(e: DragEvent, targetNode: TreeNode): void {
  // ... 确定是排序还是移动 ...

  if (isReorder) {
    this.reorderItem(dragNode, targetNode, mode);
    this.render();
    // 立即更新 sortspec
    this.syncFolderSortSpec(folderPath);
  }
}

private async syncFolderSortSpec(folderPath: string): Promise<void> {
  // 1. 从 vault 获取该文件夹的实际 children
  // 2. 根据当前 tree 中的排序生成新内容
  // 3. 写入或更新 sortspec.md
  // 4. 清理不存在的条目
}
```

### 2. "应用排序" 仅刷新 Obsidian
**位置**: `SortGuiView.ts`

```typescript
private async applySort(): Promise<void> {
  // 仅刷新 Obsidian 文件列表
  this.refreshObsidianFileExplorer();

  // 重新读取 sortspec 并刷新插件状态
  if (this.pluginRef) {
    this.pluginRef.readAndParseSortingSpec();
    this.pluginRef.switchPluginStateTo(true);
  }
}
```

### 3. "刷新目录" 重新加载视图
**位置**: `SortGuiView.ts`

```typescript
private async reloadTree(): Promise<void> {
  // 1. 查找当前目录的 sortspec 文件
  await this.findSortSpecFile();

  // 2. 重新加载 DragDropTree
  this.dragDropTree?.setSortSpecFile(this.sortSpecFilePath);
  await this.dragDropTree?.reload();

  // 3. 刷新 Obsidian 文件列表
  this.refreshObsidianFileExplorer();
}

private refreshObsidianFileExplorer(): void {
  this.app.workspace.getLeavesOfType('file-explorer').forEach((leaf) => {
    const view = leaf.view as any;
    if (view?.requestSort) {
      view.requestSort();
    }
  });
}
```

### 4. sortspec 清理逻辑
**位置**: `DragDropTree.syncFolderSortSpec()`

```typescript
private async syncFolderSortSpec(folderPath: string): Promise<void> {
  const vault = this.app.vault;
  const folder = folderPath === '/' ? vault.getRoot() : vault.getFolderByPath(folderPath);
  if (!folder) return;

  // 获取当前目录实际存在的文件/文件夹
  const existingNames = new Set(
    folder.children.map(c => c.name.endsWith('.md') ? c.name.slice(0, -3) : c.name)
  );

  // 从 tree 中获取当前排序
  const siblings = this.findSiblingsByFolder(folderPath);
  const specLines: string[] = [];

  for (const node of siblings) {
    const name = node.name.endsWith('.md') ? node.name.slice(0, -3) : node.name;
    // 只添加存在的条目
    if (existingNames.has(name)) {
      specLines.push(`    ${name}`);
    }
  }

  const newContent = `---\nsorting-spec: |\n    target-folder: .\n${specLines.join('\n')}\n---\n`;
  // 写入 sortspec.md
}
```

### 5. 展开目录时加载 sortspec
**位置**: `DragDropTree.loadChildren()`

```typescript
private loadChildren(node: TreeNode): Promise<TreeNode[]> {
  const folder = this.app.vault.getFolderByPath(node.path);
  if (!folder) return Promise.resolve([]);

  // 加载该文件夹的 sortspec
  this.loadFolderSortSpec(folder.path);

  return Promise.resolve(this.buildNodeFromFolder(folder));
}
```

## 文件结构

| 文件 | 职责 |
|------|------|
| `DragDropTree.ts` | 树形结构管理、拖拽逻辑、sortspec 读取/写入 |
| `SortGuiView.ts` | UI 视图、"应用排序"、"刷新目录" 按钮 |

## 关键方法

| 方法 | 职责 |
|------|------|
| `loadFolderSortSpec(path)` | 加载指定文件夹的 sortspec 到 `sortOrdersByFolder` |
| `syncFolderSortSpec(path)` | 将当前 tree 排序写入 sortspec.md |
| `findSiblingsByFolder(path)` | 根据文件夹路径查找对应的 children 数组 |

## 验收标准

1. [ ] 拖拽排序后立即更新对应文件夹的 sortspec.md
2. [ ] 跨文件夹拖拽后更新源和目标的 sortspec.md
3. [ ] "应用排序" 仅刷新 Obsidian 内置文件列表
4. [ ] "刷新目录" 重新加载视图并同步显示
5. [ ] sortspec 不包含不存在于目录中的条目
6. [ ] 展开目录时正确应用 sortspec 排序

## 风险

- 刷新时机：需要等待文件写入完成后再读回
- 并发：多次拖拽可能导致写入冲突（可忽略，Obsidian 有文件锁）