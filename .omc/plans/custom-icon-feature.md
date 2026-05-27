# 自定义图标功能实现计划

## 功能需求

1. **图标可点击**：文件/文件夹前的图标可以点击
2. **图标选择器**：弹出选择框，支持 Tab 切换
3. **自定义图标**：从 vault 的 icon 文件夹加载 svg/png/jpg/webp
4. **内置图标**：表情符号选择
5. **图标存储**：将自定义图标配置保存到 sortspec.md

## 实现方案

### 1. 修改 TreeNode 接口
```typescript
export interface TreeNode {
  // ... existing fields
  customIcon?: string;  // 自定义图标（emoji 或图标文件路径）
}
```

### 2. 创建图标选择器 Modal
```typescript
// IconPickerModal.ts
// - 显示 Tab："自定义图标" | "系统图标"
// - 自定义图标 Tab：扫描 vault/icon 目录下的图片
// - 系统图标 Tab：常用 emoji 列表
```

### 3. 修改 DragDropTree
- `createTreeItem`：图标元素添加点击事件
- `handleIconClick`：打开图标选择器
- 加载时从 sortspec 读取 customIcon

### 4. 图标配置格式
在 sortspec.md 中存储：
```yaml
sorting-spec: |
  :icon 📄 file1
  :icon folder-icon.png folder2
  :icon 📁 folder3
```

## 文件清单

| 文件 | 职责 |
|------|------|
| `src/sort-gui/IconPickerModal.ts` | 新增：图标选择器弹窗 |
| `src/sort-gui/DragDropTree.ts` | 修改：图标点击逻辑 |
| `src/sort-gui/styles.css` | 修改：图标选择器样式 |

## 验收标准

1. [ ] 点击图标打开选择器
2. [ ] Tab 切换正常
3. [ ] 可以选择 emoji
4. [ ] 可以选择自定义图标
5. [ ] 选择后图标更新
6. [ ] 配置保存到 sortspec