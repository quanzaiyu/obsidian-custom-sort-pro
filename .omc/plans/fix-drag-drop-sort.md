# 修复拖拽排序的两个问题

## 问题分析

### 问题1: 从子文件夹移到父文件夹，提示"File already exists."但视图未更新
- **根因**: `moveIntoFolder` 等方法捕获错误后直接返回，未刷新视图
- **位置**: DragDropTree.ts 第423-454行, 第489-521行

### 问题2: 跨文件夹拖拽执行的是移动操作而非排序操作
- **根因**: `handleDrop` 方法中跨文件夹场景下直接执行移动
- **期望行为**: 如果目标是根目录下的项目，应执行排序（调整顺序）而非移动
- **位置**: DragDropTree.ts 第401-410行

## 修复方案

### 修复1: 改进错误处理和视图刷新
```typescript
// 在 moveIntoFolder 等方法中，检测 "File already exists" 错误时仍然刷新视图
if (errorMessage.includes('File already exists')) {
    new Notice(`已移动到 "${targetFolder.name}"`);
    // 仍然刷新视图
    targetFolder.expanded = true;
    this.expandedPaths.add(targetFolder.path);
    await this.buildTree();
    this.render();
    this.refreshFileExplorer();
    return;
}
```

### 修复2: 跨文件夹排序逻辑
修改 `handleDrop` 方法：
- 如果目标在根目录 (`targetParentPath === '/'`) 且源文件也在根目录 (`sourcePath === '/'`)：
  - 执行排序操作（同根目录下的排序）
- 如果 `sourcePath === targetParentPath`：
  - 执行排序操作（同文件夹内排序）
- 其他情况：保持移动操作

## 修改文件
- `src/sort-gui/DragDropTree.ts`

## 验收标准
1. 从子文件夹移到父文件夹：不再显示错误提示，视图正确更新
2. 将根目录下的文件拖到根目录下其他两个文件之间：只调整排序顺序，文件位置不变
3. 将文件夹A的文件拖到文件夹B：执行移动操作