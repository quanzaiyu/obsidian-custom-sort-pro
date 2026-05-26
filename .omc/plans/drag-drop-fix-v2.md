# DragDropTree 排序同步问题根因分析

## 问题描述

用户反馈：点击"应用排序"后，Obsidian 内置文件列表正常排序，但"自定义排序"视图中子文件夹的排序仍然混乱。

## 根因分析

### 问题1：`buildTree()` 中的异步加载没有等待完成

```typescript
private async buildTree(): Promise<void> {
    this.sortOrdersByFolder.clear();
    await this.loadExistingSortOrder();  // ✓ 等待

    // 问题：这些是 fire-and-forget，没有等待！
    for (const expandedPath of this.expandedPaths) {
        const folder = vault.getFolderByPath(expandedPath);
        if (folder) {
            this.loadSubfolderSortSpec(folder);  // 没有 await！
        }
    }

    // 立即构建树，但子文件夹的 sortOrders 可能还没加载
    this.tree = this.buildNodeFromFolder(root);  // 排序可能不正确
}
```

### 问题2：展开子文件夹时加载逻辑

```typescript
private async loadAndRenderChildren(...): Promise<void> {
    const children = await this.loadChildren(node);  // 这里加载 sortSpec
    node.children = children;
    node.loaded = true;
    // ...
}
```

但 `loadChildren` 调用 `loadSubfolderSortSpec`，它也是异步的。

### 解决方案

将 `buildTree` 改为完全异步，先加载所有需要的 sortspec，再构建树。

```typescript
private async buildTree(): Promise<void> {
    const vault = this.app.vault;
    const root = vault.getRoot();

    // 1. 清空所有排序
    this.sortOrdersByFolder.clear();

    // 2. 加载根目录 sortspec
    await this.loadExistingSortOrder();

    // 3. 递归加载所有已展开文件夹的 sortspec
    await this.loadExpandedFolderSortSpecs(root);

    // 4. 最后才构建树（此时所有 sortOrders 都已加载）
    this.tree = this.buildNodeFromFolder(root);
}

private async loadExpandedFolderSortSpecs(folder: TFolder): Promise<void> {
    if (this.expandedPaths.has(folder.path)) {
        await this.loadSubfolderSortSpec(folder);
    }

    for (const child of folder.children) {
        if (child instanceof TFolder) {
            await this.loadExpandedFolderSortSpecs(child);
        }
    }
}
```

### 验证清单

1. [ ] `buildTree()` 等待所有 sortspec 加载完成
2. [ ] 展开文件夹时也等待 sortSpec 加载完成
3. [ ] `syncSiblingSortSpec()` 正确更新 sortspec
4. [ ] `reloadTree()` 正确触发刷新

## 文件修改清单

- `DragDropTree.ts`:
  - `buildTree()` - 添加异步加载等待
  - 添加 `loadExpandedFolderSortSpecs()` 递归加载方法
  - `loadChildren()` - 改为 async 并等待
  - `loadSubfolderSortSpec()` - 确保是 async