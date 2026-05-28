# 自定义排序视图重构计划

## 需求概述

完全重构现有项目，在 `src-v2/` 目录下实现新的自定义排序视图插件。

## 核心需求

### 3.1 统一的 sortspec.md 格式
每个文件夹使用相同的 frontmatter 格式（不区分根目录/子目录）：
```yaml
sorting-spec:
  - 文件夹名1
  - 文件夹名2
  - 文件名1
  - 文件名2
custom-icons:
  文件夹名1: 🗂️
  文件夹名2: icon/AI.svg
  文件名1: 📄
```

### 3.2 拖拽排序
- 文件夹与文件混排
- 拖拽后**立即**更新 sortspec.md
- 使用 `app.fileManager.processFrontMatter()` 原子写入

### 3.3 拖拽进入文件夹
- 立即更新源文件夹的 sortspec.md（移除该项）
- 立即更新目标文件夹的 sortspec.md（添加该项）

### 3.4 简化视图
- 仅显示目录树
- 无顶部标题/描述
- 无底部按钮
- 样式复用现有 `.sort-gui-tree-*` 样式

### 3.5 上下文菜单

**文件夹菜单：**
| 菜单项 | 图标 |
|--------|------|
| 新建笔记 | `file-plus` |
| 新建文件夹 | `folder-plus` |
| 新建白板 | `layout-dashboard` |
| 新建绘图文件 | `pen-tool` |
| 复制 | `copy` |
| 复制绝对路径 | `file` |
| 复制相对路径 | `file` |
| 重命名 | `pencil` |
| 删除 | `trash` (红色) |
| 在文件夹中查找 | `search` |
| 在系统资源管理器中显示 | `folder` |
| 在文件列表中显示 | `list` |

**文件菜单：**
| 菜单项 | 图标 |
|--------|------|
| 复制 | `copy` |
| 复制绝对路径 | `file` |
| 复制相对路径 | `file` |
| 重命名 | `pencil` |
| 删除 | `trash` (红色) |
| 在系统资源管理器中显示 | `folder` |
| 在文件列表中显示 | `list` |

### 3.6 图标选择器

**三个 Tab：**
1. **最近使用** - 显示最近使用的 emoji 和自定义图标（使用 localStorage 存储）
2. **系统图标** - emoji 分类展示 + 搜索
3. **自定义图标** - 从 vault 的 `icon/` 和 `.obsidian/icons/` 扫描 + 搜索

### 3.7 实时监听
使用 `app.vault.on('create'|'delete'|'rename')` 监听文件变化，自动刷新视图。

### 3.8 文件夹笔记功能
- 文件夹下存在同名 `.md` 文件时，点击文件夹打开该文件
- 同时展开目录树
- 目录树中**隐藏**该同名 `.md` 文件

---

## 项目结构

```
src-v2/
├── main.ts                    # 插件入口
├── MySortView.ts              # 视图类
├── DragDropTree.ts             # 拖拽树实现
├── IconPickerModal.ts          # 图标选择器
├── SortSpecManager.ts          # sortspec.md 读写管理
├── RecentIconsManager.ts       # 最近使用图标管理
├── styles.css                 # 样式
└── types.ts                  # 类型定义
```

---

## 实现步骤

### Step 1: 类型定义 (`types.ts`)
- `TreeNode` 接口
- `IconPickerCallbacks` 接口

### Step 2: sortspec 管理器 (`SortSpecManager.ts`)
- `load(folderPath)`: 读取文件夹的 sortspec.md
- `save(folderPath, sortingSpec, customIcons)`: 写入 frontmatter
- `createIfNotExists(folderPath)`: 不存在时创建
- 使用 `parseYaml()` 读取，`processFrontMatter()` 写入

### Step 3: 最近图标管理器 (`RecentIconsManager.ts`)
- `add(icon: string, isCustom: boolean)`: 添加到最近使用
- `getRecent(count: number)`: 获取最近的图标
- 使用 localStorage 存储

### Step 4: 拖拽树 (`DragDropTree.ts`)
- `buildTree()`: 从 vault 递归构建树
- `handleDrop()`: 拖拽放置
  - 同目录排序 → 调用 `SortSpecManager.save()`
  - 跨目录移动 → 更新源和目标两个 sortspec
- `openIconPicker()`: 打开图标选择器
- `setupContextMenu()`: 设置右键菜单
- `registerVaultListener()`: 注册文件变化监听

### Step 5: 图标选择器 (`IconPickerModal.ts`)
- 三个 Tab：最近 / 系统 / 自定义
- emoji 分类（复用现有 17 个分类）
- 搜索过滤
- 选中后回调 + 添加到最近使用

### Step 6: 视图 (`MySortView.ts`)
- 仅包含目录树容器
- 初始化 DragDropTree
- 注册视图类型

### Step 7: 插件入口 (`main.ts`)
- 注册视图类型
- 命令面板添加打开视图命令

### Step 8: 样式 (`styles.css`)
- 复用现有 `.sort-gui-tree-*` 样式
- 图标选择器样式
- 右键菜单红色删除项

---

## 文件夹笔记功能实现

```typescript
// 点击文件夹时检查是否存在同名 md
const folderName = folder.name;
const mdPath = `${folder.path}/${folderName}.md`;
const mdFile = app.vault.getAbstractFileByPath(mdPath);

if (mdFile instanceof TFile) {
  // 打开 md 文件
  app.workspace.getLeaf(false).openFile(mdFile);
  // 同时展开目录树
  node.expanded = true;
} else {
  // 普通展开行为
  toggleExpand();
}
```

**隐藏同名 md 文件：**
```typescript
// buildTree 时跳过同名 md
if (child.name === `${folder.name}.md`) continue;
```

---

## 验收标准

| ID | 标准 |
|----|------|
| AC1 | 拖拽文件/文件夹排序，立即更新 sortspec.md |
| AC2 | 拖拽进入文件夹，源和目标 sortspec.md 都更新 |
| AC3 | 右键菜单包含所有指定项，删除项显示红色 |
| AC4 | 图标选择器三个 Tab 切换正常 |
| AC5 | 外部创建/删除/重命名文件，视图自动刷新 |
| AC6 | 点击有同名 md 的文件夹，打开 md 并展开树 |
| AC7 | 目录树中不显示同名 md 文件 |
| AC8 | 无顶部标题/描述，无底部按钮 |

---

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| `processFrontMatter` 对空文件的处理 | 使用 `'---\n{}\n---'` 初始化 |
| 拖拽时 vault 未及时更新 | 使用 `await vault.rename()` 后再更新 sortspec |
| 大量文件时性能 | 懒加载子目录，只在展开时加载 |

---

## RALPLAN-DR 摘要

**原则 (3-5):**
1. **原子性写入** - 使用 `processFrontMatter()` 保证 sortspec.md 格式正确
2. **实时响应** - 拖拽/图标变更立即写入，立即生效
3. **简化视图** - 只保留目录树，移除装饰元素
4. **统一格式** - 根目录和子目录使用相同格式

**决策驱动 (Top 3):**
1. sortspec 格式：使用 YAML 数组而非管道符格式 → 更规范、可解析
2. 视图简化：移除顶部/底部 → 更聚焦核心功能
3. 图标管理：本地存储最近使用 → 提升使用效率

**可行选项 (>=2):**
1. **选项 A**: 在现有 src 目录重构 → 风险影响现有功能
2. **选项 B**: 新建 src-v2 目录 → 安全隔离，可渐进迁移 ✓

---

## ADR

**Decision:** 新建 `src-v2/` 目录实现重构，使用独立视图类，完全重新设计 sortspec 管理。

**Drivers:**
- 现有代码混乱，sortspec 读写逻辑分散
- 根目录/子目录处理不一致
- UI 需要简化

**Alternatives considered:**
- 直接在 src 重构 → 影响现有功能，风险高
- 创建独立插件 → 需要维护两套代码

**Why chosen:** 新目录可以并行开发，完成后替换 src，风险可控。

**Consequences:**
- 现有 sort-gui 代码将被废弃
- 需要重新测试所有拖拽/图标功能

**Follow-ups:**
- 迁移测试
- 文档更新
- 用户反馈收集
