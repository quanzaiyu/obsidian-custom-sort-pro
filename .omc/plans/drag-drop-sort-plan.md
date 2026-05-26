# 可视化拖拽排序功能实现计划

## 需求概述

为 obsidian-custom-sort 插件添加可视化拖拽排序功能，用户可以通过拖拽操作自定义文件/文件夹的排序顺序，保存后更新 sortspec.md。

**用户偏好**:
- 入口方式：Ribbon按钮触发打开面板
- 排序范围：全库排序

---

## 需求总结

1. **可视化拖拽排序界面**
   - 通过 Ribbon 按钮打开独立排序面板
   - 显示文件/文件夹树形结构，支持懒加载子目录
   - 拖拽文件/文件夹到另一位置（包括移动到目标文件夹）
   - 实时预览排序效果

2. **sortspec.md 更新机制**
   - 拖拽完成后自动生成符合插件格式的 sorting-spec YAML
   - 支持写入指定的 sortspec 文件

3. **参考实现**
   - 参考 `D:\Projects\obsidian-custom-sort-gui-py` 的拖拽逻辑
   - 使用原生 HTML5 Drag and Drop API（无外部依赖）
   - 适配为 Obsidian 插件（TypeScript）

---

## 技术架构

### 模块结构

```
src/
├── sort-gui/                          # 新增模块
│   ├── SortGuiView.ts                 # 视图类（继承 Obsidian 的 View）
│   ├── SortGuiModal.ts                 # 模态框类（用于显示拖拽排序面板）
│   ├── DragDropTree.ts                # 拖拽树数据结构和渲染
│   ├── SortSpecGenerator.ts           # 生成 sorting-spec YAML
│   └── styles.css                     # 拖拽排序界面样式
├── main.ts                            # 修改：添加 Ribbon 按钮和命令
└── settings.ts                        # 修改：添加 GUI 排序设置项
```

### 排序面板组件

```
┌─────────────────────────────────────────────────┐
│  Custom Sort - Drag & Drop                      │
├─────────────────────────────────────────────────┤
│  📁 FolderA                                    │
│  ├─ 📁 SubFolder1                               │
│  │   └─ 📄 File1.md                            │
│  └─ 📄 File2.md                                │
│  📁 FolderB                                     │
│  📄 AnotherFile.md                              │
├─────────────────────────────────────────────────┤
│  [Save to sortspec.md]    [Cancel]              │
└─────────────────────────────────────────────────┘
```

---

## 实现步骤

### 步骤 1: 创建 SortGuiModal 和 SortGuiView

**文件**: `src/sort-gui/SortGuiModal.ts`

功能:
- 创建模态框容器
- 渲染文件树
- 监听拖拽事件

关键 Obsidian API:
```typescript
class SortGuiModal extends Modal {
  // 继承 Obsidian Modal 类
  // 使用 this.contentEl 渲染自定义内容
}
```

### 步骤 2: 实现 DragDropTree 类

**文件**: `src/sort-gui/DragDropTree.ts`

数据结构（参考 Python 实现）:
```typescript
interface TreeNode {
  id: string;           // 唯一标识，路径形式
  name: string;         // 显示名称
  type: 'folder' | 'file';
  path: string;         // 完整路径
  children: TreeNode[];  // 子节点列表
  hasChildren: boolean; // 是否有子项（用于懒加载）
  expanded?: boolean;   // 是否展开
}
```

核心功能:
- `buildTree()` - 从 Vault 递归构建树结构（根目录优先）
- `render()` - 渲染 DOM
- `handleDrop()` - 处理拖拽逻辑
- `updateNode()` - 更新节点位置

### 步骤 3: 实现 SortSpecGenerator

**文件**: `src/sort-gui/SortSpecGenerator.ts`

生成格式（参考 `sorting-spec-processor.ts` 的解析逻辑）:
```yaml
---
sorting-spec: |
  target-folder: /
      FolderA
      FolderA/subfile1
      FolderB
      AnotherFile.md
---
```

核心函数:
```typescript
function generateSortSpec(tree: TreeNode[]): string {
  // 递归遍历树，生成 YAML 行
}
```

### 步骤 4: 修改 main.ts 添加 Ribbon 按钮

**文件**: `src/main.ts`

修改内容:
1. 在 `onload()` 中添加 Ribbon 图标按钮
2. 点击按钮打开 `SortGuiModal`
3. 注册命令 `open-drag-drop-sort`

```typescript
// main.ts 添加
this.addRibbonIcon('list-ordered', 'Open Drag & Drop Sort', (evt) => {
  new SortGuiModal(this.app).open();
});
```

### 步骤 5: 添加样式文件

**文件**: `src/sort-gui/styles.css`

样式规则（参考 Python 实现）:
```css
.tree-item { cursor: grab; }
.tree-item.dragging { opacity: 0.3; }
.drop-before { border-top: 2px solid #89b4fa !important; }
.drop-after { border-bottom: 2px solid #89b4fa !important; }
.drag-over-folder { background: #2a2a4a !important; outline: 2px dashed #cba6f7; }
```

### 步骤 6: 实现懒加载子目录

**文件**: `src/sort-gui/DragDropTree.ts`

功能:
- 首次只加载根目录
- 点击展开图标时懒加载子目录
- 缓存已加载的子目录

```typescript
async function loadChildren(node: TreeNode): Promise<TreeNode[]> {
  // 调用 this.app.vault.getFolderByPath(node.path).children
}
```

### 步骤 7: 实现文件/文件夹移动功能

**文件**: `src/sort-gui/DragDropTree.ts`

拖拽到文件夹时的处理:
```typescript
function handleDropToFolder(dragNode: TreeNode, targetFolder: TreeNode) {
  // 当拖拽到文件夹时，将文件/文件夹移动到目标文件夹
  // 使用 this.app.vault.rename(abstractFile, newPath)
}
```

---

## 验收标准

### 功能验收

- [ ] 点击 Ribbon 图标打开拖拽排序面板
- [ ] 面板显示文件/文件夹树形结构
- [ ] 文件夹可以展开/折叠（懒加载）
- [ ] 拖拽文件/文件夹调整顺序
- [ ] 拖拽到文件夹上方可以移动到目标文件夹
- [ ] 保存后 sortspec.md 正确更新
- [ ] 拖拽时有视觉反馈（半透明、插入线）
- [ ] 取消操作不保存更改

### 技术验收

- [ ] 使用 TypeScript 编写，符合项目规范
- [ ] 使用 ESLint 检查代码
- [ ] 单元测试覆盖核心逻辑
- [ ] 不破坏现有插件功能

### 用户体验验收

- [ ] 初始加载速度快（只加载根目录）
- [ ] 拖拽操作流畅无卡顿
- [ ] 视觉反馈清晰直观
- [ ] 支持键盘操作（可选）

---

## 风险和缓解

### 风险 1: 大型知识库性能问题

**问题**: 大型 Vault 可能导致初始加载缓慢
**缓解**:
- 根目录优先加载
- 子目录懒加载
- 使用虚拟滚动（如果需要）

### 风险 2: 与现有排序逻辑冲突

**问题**: 拖拽排序可能与现有排序规则冲突
**缓解**:
- 拖拽排序结果写入 sortspec.md
- 遵循现有解析器格式
- 测试验证兼容性

### 风险 3: 文件移动的副作用

**问题**: 移动文件可能影响其他插件或工作流
**缓解**:
- 仅在用户明确拖拽到文件夹时移动
- 提供确认对话框
- 撤销支持（如果 Obsidian 支持）

---

## 验证步骤

1. **构建测试**
   ```bash
   yarn build
   ```

2. **加载插件到 Obsidian 测试**
   - 打开 Obsidian
   - 启用 custom-sort 插件
   - 点击 Ribbon 图标
   - 验证面板正常显示

3. **拖拽功能测试**
   - 拖拽文件到新位置
   - 验证排序更新
   - 验证 sortspec.md 写入正确

4. **文件移动测试**
   - 拖拽文件到文件夹
   - 验证文件实际移动
   - 验证 sortspec.md 路径更新

---

## 参考文件

- `src/main.ts` - 插件入口
- `src/custom-sort/sorting-spec-processor.ts` - YAML 格式参考
- `D:\Projects\obsidian-custom-sort-gui-py\templates\index.html` - 拖拽 UI 参考
- `D:\Projects\obsidian-custom-sort-gui-py\spec_service.py` - spec 生成参考