import { App, TFile, TFolder, Notice, Menu, setIcon } from 'obsidian';
import type { TreeNode } from './types';
import { SortSpecManager } from './SortSpecManager';
import { IconPickerModal } from './IconPickerModal';

export class DragDropTree {
	private app: App;
	private container: HTMLElement;
	private tree: TreeNode[] = [];
	private sortSpecManager: SortSpecManager;
	private sortOrdersByFolder: Map<string, Map<string, number>> = new Map();
	private customIconsByFolder: Map<string, Record<string, string>> = new Map();
	private expandedPaths: Set<string> = new Set();
	private dragId: string | null = null;
	private dragNode: TreeNode | null = null;
	private dropMode: 'before' | 'after' | 'folder' | null = null;
	private onIconChange?: (node: TreeNode, icon: string | undefined) => void;
	private initialized: boolean = false;

	constructor(app: App, container: HTMLElement, onIconChange?: (node: TreeNode, icon: string | undefined) => void) {
		this.app = app;
		this.container = container;
		this.sortSpecManager = new SortSpecManager(app);
		this.onIconChange = onIconChange;
	}

	async init(): Promise<void> {
		await this.buildTree();
		this.render();
		this.registerVaultListener();
		this.initialized = true;
	}

	private registerVaultListener(): void {
		const plugin = this;
		this.app.vault.on('delete', () => {
			this.sortSpecManager.clearCache();
			this.reload();
		});
		this.app.vault.on('create', () => {
			this.sortSpecManager.clearCache();
			this.reload();
		});
		this.app.vault.on('rename', () => {
			this.sortSpecManager.clearCache();
			this.reload();
		});
	}

	async reload(): Promise<void> {
		await this.buildTree();
		this.render();
	}

	private async buildTree(): Promise<void> {
		const root = this.app.vault.getRoot();
		this.sortOrdersByFolder.clear();
		this.customIconsByFolder.clear();

		// 加载根目录的 sortspec
		await this.loadFolderSortSpec(root);

		// 递归加载所有展开的文件夹的 sortspec
		for (const expandedPath of this.expandedPaths) {
			const folder = this.app.vault.getFolderByPath(expandedPath);
			if (folder) {
				await this.loadAllSubfolderSortSpecs(folder);
			}
		}

		this.tree = this.buildNodesFromFolder(root);
	}

	private async loadAllSubfolderSortSpecs(folder: TFolder): Promise<void> {
		await this.loadFolderSortSpec(folder);

		for (const child of folder.children) {
			if (child instanceof TFolder) {
				await this.loadAllSubfolderSortSpecs(child);
			}
		}
	}

	private async loadFolderSortSpec(folder: TFolder): Promise<void> {
		const folderPath = folder.path;
		const spec = await this.sortSpecManager.load(folderPath);

		if (spec && spec.sortingSpec.length > 0) {
			const sortMap = new Map<string, number>();
			spec.sortingSpec.forEach((name, index) => {
				sortMap.set(name, index);
			});
			this.sortOrdersByFolder.set(folderPath, sortMap);
			this.customIconsByFolder.set(folderPath, spec.customIcons);
		} else {
			// 清除之前的缓存（如果有）
			this.sortOrdersByFolder.delete(folderPath);
			this.customIconsByFolder.delete(folderPath);
		}
	}

	private buildNodesFromFolder(folder: TFolder): TreeNode[] {
		const nodes: TreeNode[] = [];
		const sortMap = this.sortOrdersByFolder.get(folder.path) || new Map<string, number>();
		const icons = this.customIconsByFolder.get(folder.path) || {};

		for (const child of folder.children) {
			const nameWithoutExt = child.name.endsWith('.md') ? child.name.slice(0, -3) : child.name;

			// 跳过文件夹笔记（同名 .md 文件）
			if (this.isFolderNote(child.name, folder)) {
				continue;
			}

			const node: TreeNode = {
				id: child.path,
				name: child.name,
				type: child instanceof TFolder ? 'folder' : 'file',
				path: child.path,
				children: [],
				hasChildren: child instanceof TFolder && child.children.length > 0,
				expanded: this.expandedPaths.has(child.path),
				loaded: false,
				sortOrder: sortMap.get(nameWithoutExt)
			};

			if (icons[nameWithoutExt]) {
				node.customIcon = icons[nameWithoutExt];
			}

			nodes.push(node);
		}

		nodes.sort((a, b) => {
			// 按 sortOrder 排序
			if (a.sortOrder !== undefined && b.sortOrder !== undefined) {
				return a.sortOrder - b.sortOrder;
			}
			// 有 sortOrder 的排前面
			if (a.sortOrder !== undefined) return -1;
			if (b.sortOrder !== undefined) return 1;
			// 按字母顺序
			return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
		});

		return nodes;
	}

	private isFolderNote(fileName: string, folder: TFolder): boolean {
		const folderName = folder.path === '/' ? '' : folder.name;
		return fileName === `${folderName}.md`;
	}

	render(): void {
		if (!this.container?.parentNode) return;

		this.container.empty();
		const treeEl = this.container.createDiv('sort-gui-tree');

		treeEl.addEventListener('dragover', (e) => {
			e.preventDefault();
			if (this.dragId) {
				e.dataTransfer!.dropEffect = 'move';
			}
		});

		treeEl.addEventListener('drop', (e) => {
			e.preventDefault();
			this.clearDropIndicators();
		});

		this.renderNodes(this.tree, treeEl);
	}

	private renderNodes(nodes: TreeNode[], parentEl: HTMLElement): void {
		for (const node of nodes) {
			const itemEl = this.createTreeItem(node);
			parentEl.appendChild(itemEl);

			if (node.type === 'folder' && node.hasChildren && node.expanded) {
				const childrenEl = parentEl.createDiv('sort-gui-tree-children');
				childrenEl.dataset.parentId = node.id;

				if (node.loaded && node.children.length > 0) {
					this.renderNodes(node.children, childrenEl);
				} else if (!node.loaded) {
					this.loadAndRenderChildren(node, childrenEl);
				}
			}
		}
	}

	private async loadAndRenderChildren(node: TreeNode, childrenEl: HTMLElement): Promise<void> {
		const folder = this.app.vault.getFolderByPath(node.path);
		if (!folder) return;

		// 加载当前文件夹的 sortspec
		await this.loadFolderSortSpec(folder);

		// 递归加载所有子文件夹的 sortspec
		await this.loadAllSubfolderSortSpecs(folder);

		// 构建节点
		node.children = this.buildNodesFromFolder(folder);
		node.loaded = true;

		if (node.children.length > 0) {
			this.renderNodes(node.children, childrenEl);
		}
	}

	private createTreeItem(node: TreeNode): HTMLElement {
		const itemEl = createDiv('sort-gui-tree-item');

		if (node.type === 'folder' && node.hasChildren) {
			const toggleEl = itemEl.createDiv('sort-gui-item-toggle');
			toggleEl.textContent = node.expanded ? '▼' : '▶';
			toggleEl.addEventListener('click', (e) => {
				e.stopPropagation();
				this.toggleExpand(node);
			});
		}

		const iconEl = itemEl.createDiv('sort-gui-item-icon');
		this.renderNodeIcon(iconEl, node);

		iconEl.addEventListener('click', (e) => {
			e.stopPropagation();
			this.openIconPicker(node, iconEl);
		});

		const nameEl = itemEl.createDiv('sort-gui-item-name');
		nameEl.textContent = node.name;

		itemEl.setAttr('draggable', 'true');
		itemEl.dataset.id = node.id;
		itemEl.dataset.type = node.type;

		itemEl.addEventListener('click', (e) => this.handleItemClick(e, node));
		itemEl.addEventListener('contextmenu', (e) => this.showContextMenu(e, node));

		itemEl.addEventListener('dragstart', (e) => this.handleDragStart(e, node));
		itemEl.addEventListener('dragend', (e) => this.handleDragEnd(e));
		itemEl.addEventListener('dragover', (e) => this.handleDragOver(e, node, itemEl));
		itemEl.addEventListener('dragleave', (e) => this.handleDragLeave(e));
		itemEl.addEventListener('dragenter', (e) => e.preventDefault());
		itemEl.addEventListener('drop', (e) => this.handleDrop(e, node));

		return itemEl;
	}

	private toggleExpand(node: TreeNode): void {
		node.expanded = !node.expanded;
		if (node.expanded) {
			this.expandedPaths.add(node.path);
		} else {
			this.expandedPaths.delete(node.path);
		}
		this.render();
	}

	private async handleItemClick(e: MouseEvent, node: TreeNode): Promise<void> {
		if (node.type === 'folder') {
			if (node.hasChildren) {
				this.toggleExpand(node);
			} else {
				this.tryOpenFolderNote(node);
			}
		} else {
			const file = this.app.vault.getAbstractFileByPath(node.path);
			if (file instanceof TFile) {
				this.app.workspace.getLeaf(false).openFile(file);
			}
		}
	}

	private async tryOpenFolderNote(node: TreeNode): Promise<void> {
		if (node.type !== 'folder') return;

		const folder = this.app.vault.getFolderByPath(node.path);
		if (!folder) return;

		const mdFileName = `${folder.name}.md`;
		const mdFile = folder.children.find(f => f.name === mdFileName) as TFile | undefined;

		if (mdFile instanceof TFile) {
			this.app.workspace.getLeaf(false).openFile(mdFile);
			node.expanded = true;
			this.expandedPaths.add(node.path);
			this.render();
		}
	}

	private renderNodeIcon(iconEl: HTMLElement, node: TreeNode): void {
		iconEl.empty();

		if (node.customIcon) {
			if (/\.(svg|png|jpg|jpeg|webp|gif)$/i.test(node.customIcon)) {
				const file = this.app.vault.getAbstractFileByPath(node.customIcon);
				if (file instanceof TFile) {
					iconEl.createEl('img', {
						attr: { src: this.app.vault.getResourcePath(file), alt: node.name },
						cls: 'sort-gui-item-icon-img'
					});
				} else {
					iconEl.textContent = '📄';
				}
			} else {
				iconEl.textContent = node.customIcon;
			}
		} else {
			iconEl.textContent = node.type === 'folder' ? (node.expanded ? '📂' : '📁') : '📄';
		}
	}

	private openIconPicker(node: TreeNode, iconEl: HTMLElement): void {
		new IconPickerModal(this.app, {
			onSelect: async (icon: string) => {
				node.customIcon = icon;
				this.renderNodeIcon(iconEl, node);
				await this.saveCustomIcon(node);
				this.onIconChange?.(node, icon);
			},
			onClear: async () => {
				node.customIcon = undefined;
				this.renderNodeIcon(iconEl, node);
				await this.saveCustomIcon(node);
				this.onIconChange?.(node, undefined);
			}
		}).open();
	}

	private async saveCustomIcon(node: TreeNode): Promise<void> {
		const folderPath = this.getParentPath(node.path);
		const nameWithoutExt = node.name.endsWith('.md') ? node.name.slice(0, -3) : node.name;

		const spec = await this.sortSpecManager.load(folderPath);
		const customIcons = { ...(spec?.customIcons || {}) };

		if (node.customIcon) {
			customIcons[nameWithoutExt] = node.customIcon;
		} else {
			delete customIcons[nameWithoutExt];
		}

		await this.sortSpecManager.save(folderPath, spec?.sortingSpec || [], customIcons);
	}

	private showContextMenu(e: MouseEvent, node: TreeNode): void {
		e.preventDefault();
		const menu = new Menu();

		if (node.type === 'folder') {
			this.addFolderMenuItems(menu, node);
		} else {
			this.addFileMenuItems(menu, node);
		}

		menu.showAtPosition({ x: e.clientX, y: e.clientY });
	}

	private addFolderMenuItems(menu: Menu, node: TreeNode): void {
		menu.addItem(item => {
			item.setTitle('新建笔记').setIcon('file-plus').onClick(async () => {
				const name = prompt('输入笔记名称:');
				if (name) {
					const path = node.path === '/' ? `/${name}.md` : `${node.path}/${name}.md`;
					await this.app.vault.create(path, '');
				}
			});
		});

		menu.addItem(item => {
			item.setTitle('新建文件夹').setIcon('folder-plus').onClick(async () => {
				const name = prompt('输入文件夹名称:');
				if (name) {
					await this.app.vault.createFolder(node.path === '/' ? `/${name}` : `${node.path}/${name}`);
				}
			});
		});

		menu.addItem(item => {
			item.setTitle('新建白板').setIcon('layout-dashboard').onClick(async () => {
				const name = prompt('输入白板名称:');
				if (name) {
					const path = node.path === '/' ? `/${name}.canvas` : `${node.path}/${name}.canvas`;
					await this.app.vault.create(path, '{"nodes":[]}');
				}
			});
		});

		menu.addItem(item => {
			item.setTitle('新建绘图文件').setIcon('pen-tool').onClick(async () => {
				const name = prompt('输入绘图文件名称:');
				if (name) {
					const path = node.path === '/' ? `/${name}.excalidraw.md` : `${node.path}/${name}.excalidraw.md`;
					await this.app.vault.create(path, '');
				}
			});
		});

		menu.addSeparator();

		menu.addItem(item => {
			item.setTitle('复制').setIcon('copy').onClick(async () => {
				const newName = `${node.name} (副本)`;
				await this.app.vault.createFolder(node.path === '/' ? `/${newName}` : `${node.path}/${newName}`);
			});
		});

		menu.addItem(item => {
			item.setTitle('复制绝对路径').setIcon('file').onClick(() => {
				const absPath = this.sortSpecManager.getAbsolutePath(node.path);
				navigator.clipboard.writeText(absPath);
			});
		});

		menu.addItem(item => {
			item.setTitle('复制相对路径').setIcon('file').onClick(() => {
				navigator.clipboard.writeText(node.path);
			});
		});

		menu.addItem(item => {
			item.setTitle('重命名').setIcon('pencil').onClick(async () => {
				const folder = this.app.vault.getFolderByPath(node.path);
				if (folder) {
					(this.app as any).fileManager.startRenameFile(folder);
				}
			});
		});

		menu.addItem(item => {
			item.setTitle('删除').setIcon('trash').onClick(async () => {
				const folder = this.app.vault.getFolderByPath(node.path);
				if (folder && confirm(`确定要删除 "${node.name}" 及其所有内容吗?`)) {
					await this.app.vault.delete(folder, true);
				}
			});
		});

		menu.addSeparator();

		menu.addItem(item => {
			item.setTitle('在文件夹中查找').setIcon('search').onClick(() => {
				this.app.workspace.getLeavesOfType('search').forEach(leaf => {
					(this.app as any).commands.executeCommandById('search:open-search', node.path);
				});
			});
		});

		menu.addItem(item => {
			item.setTitle('在系统资源管理器中显示').setIcon('folder').onClick(() => {
				const absPath = this.sortSpecManager.getAbsolutePath(node.path);
				require('electron').shell.showItemInFolder(absPath);
			});
		});

		menu.addItem(item => {
			item.setTitle('在文件列表中显示').setIcon('list').onClick(() => {
				this.app.workspace.getLeavesOfType('file-explorer').forEach(leaf => {
					const view = leaf.view as any;
					if (view?.revealInFolder) {
						const folder = this.app.vault.getFolderByPath(node.path);
						if (folder) view.revealInFolder(folder);
					}
				});
			});
		});
	}

	private addFileMenuItems(menu: Menu, node: TreeNode): void {
		menu.addItem(item => {
			item.setTitle('复制').setIcon('copy').onClick(async () => {
				const file = this.app.vault.getAbstractFileByPath(node.path);
				if (file instanceof TFile) {
					const ext = file.extension;
					const base = file.basename;
					const newPath = file.path.replace(file.name, `${base} (副本).${ext}`);
					await this.app.vault.copy(file, newPath);
				}
			});
		});

		menu.addItem(item => {
			item.setTitle('复制绝对路径').setIcon('file').onClick(() => {
				const absPath = this.sortSpecManager.getAbsolutePath(node.path);
				navigator.clipboard.writeText(absPath);
			});
		});

		menu.addItem(item => {
			item.setTitle('复制相对路径').setIcon('file').onClick(() => {
				navigator.clipboard.writeText(node.path);
			});
		});

		menu.addItem(item => {
			item.setTitle('重命名').setIcon('pencil').onClick(async () => {
				const file = this.app.vault.getAbstractFileByPath(node.path);
				if (file) {
					(this.app as any).fileManager.startRenameFile(file);
				}
			});
		});

		menu.addItem(item => {
			item.setTitle('删除').setIcon('trash').onClick(async () => {
				const file = this.app.vault.getAbstractFileByPath(node.path);
				if (file && confirm(`确定要删除 "${node.name}" 吗?`)) {
					await this.app.vault.delete(file);
				}
			});
		});

		menu.addSeparator();

		menu.addItem(item => {
			item.setTitle('在系统资源管理器中显示').setIcon('folder').onClick(() => {
				const absPath = this.sortSpecManager.getAbsolutePath(node.path);
				require('electron').shell.showItemInFolder(absPath);
			});
		});

		menu.addItem(item => {
			item.setTitle('在文件列表中显示').setIcon('list').onClick(() => {
				this.app.workspace.getLeavesOfType('file-explorer').forEach(leaf => {
					const view = leaf.view as any;
					if (view?.revealInFolder) {
						const file = this.app.vault.getAbstractFileByPath(node.path);
						if (file) view.revealInFolder(file);
					}
				});
			});
		});
	}

	private handleDragStart(e: DragEvent, node: TreeNode): void {
		this.dragId = node.id;
		this.dragNode = node;
		(e.target as HTMLElement).closest('.sort-gui-tree-item')?.classList.add('dragging');
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
		}
	}

	private handleDragEnd(e: DragEvent): void {
		(e.target as HTMLElement).closest('.sort-gui-tree-item')?.classList.remove('dragging');
		this.clearDropIndicators();
		this.dragId = null;
		this.dragNode = null;
		this.dropMode = null;
	}

	private clearDropIndicators(): void {
		document.querySelectorAll('.sort-gui-tree-item').forEach(el => {
			el.classList.remove('drop-before', 'drop-after', 'drag-over-folder');
		});
	}

	private handleDragOver(e: DragEvent, targetNode: TreeNode, itemEl: HTMLElement): void {
		e.preventDefault();
		if (!this.dragId || this.dragId === targetNode.id) return;

		this.clearDropIndicators();
		const rect = itemEl.getBoundingClientRect();
		const relativeY = e.clientY - rect.top;

		if (targetNode.type === 'folder' && relativeY >= rect.height * 0.75) {
			itemEl.classList.add('drag-over-folder');
			this.dropMode = 'folder';
		} else if (relativeY < rect.height / 2) {
			itemEl.classList.add('drop-before');
			this.dropMode = 'before';
		} else {
			itemEl.classList.add('drop-after');
			this.dropMode = 'after';
		}
	}

	private handleDragLeave(e: DragEvent): void {
		const relatedTarget = e.relatedTarget as HTMLElement;
		const currentTarget = e.currentTarget as HTMLElement;
		if (!currentTarget.contains(relatedTarget)) {
			(currentTarget as HTMLElement).closest('.sort-gui-tree-item')?.classList.remove('drop-before', 'drop-after', 'drag-over-folder');
		}
	}

	private async handleDrop(e: DragEvent, targetNode: TreeNode): Promise<void> {
		e.preventDefault();
		e.stopPropagation();

		if (!this.dragId || !this.dragNode) return;

		this.clearDropIndicators();

		if (this.dropMode === 'folder' && targetNode.type === 'folder') {
			await this.moveIntoFolder(this.dragNode, targetNode);
			return;
		}

		const sourcePath = this.getParentPath(this.dragNode.path);
		const targetPath = this.getParentPath(targetNode.path);

		if (sourcePath === targetPath) {
			await this.reorderInSameFolder(this.dragNode, targetNode, this.dropMode === 'after' ? 'after' : 'before');
		} else {
			await this.moveToAnotherFolder(this.dragNode, targetNode, this.dropMode === 'after' ? 'after' : 'before');
		}
	}

	private getParentPath(path: string): string {
		const lastSlash = path.lastIndexOf('/');
		return lastSlash <= 0 ? '/' : path.substring(0, lastSlash);
	}

	private async moveIntoFolder(dragNode: TreeNode, targetFolder: TreeNode): Promise<void> {
		const sourcePath = this.getParentPath(dragNode.path);
		const newPath = targetFolder.path === '/' ? `/${dragNode.name}` : `${targetFolder.path}/${dragNode.name}`;

		try {
			const file = this.app.vault.getAbstractFileByPath(dragNode.path);
			if (!file) {
				new Notice('文件未找到');
				return;
			}

			await this.app.vault.rename(file, newPath);
			await this.sortSpecManager.removeItem(sourcePath, dragNode.name);
			await this.sortSpecManager.addItem(targetFolder.path, dragNode.name);

			new Notice(`已将 "${dragNode.name}" 移动到 "${targetFolder.name}"`);

			targetFolder.expanded = true;
			this.expandedPaths.add(targetFolder.path);
			await this.reload();
		} catch (error) {
			new Notice('移动失败: ' + (error as Error).message);
			await this.reload();
		}
	}

	private async reorderInSameFolder(dragNode: TreeNode, targetNode: TreeNode, mode: 'before' | 'after'): Promise<void> {
		const folderPath = this.getParentPath(targetNode.path);
		const folder = folderPath === '/' ? this.app.vault.getRoot() : this.app.vault.getFolderByPath(folderPath);

		if (!folder) {
			new Notice('文件夹未找到');
			return;
		}

		let spec = await this.sortSpecManager.load(folderPath);

		// 如果没有 sortspec 或排序为空，用实际子项初始化
		if (!spec || spec.sortingSpec.length === 0) {
			const actualChildren: string[] = [];
			for (const child of folder.children) {
				const name = child.name.endsWith('.md') ? child.name.slice(0, -3) : child.name;
				actualChildren.push(name);
			}
			await this.sortSpecManager.save(folderPath, actualChildren, {});
			spec = { sortingSpec: actualChildren, customIcons: {} };
		}

		const items = [...spec.sortingSpec];
		const dragName = dragNode.name.endsWith('.md') ? dragNode.name.slice(0, -3) : dragNode.name;
		const targetName = targetNode.name.endsWith('.md') ? targetNode.name.slice(0, -3) : targetNode.name;

		// 如果 dragName 不在列表中，添加它
		if (!items.includes(dragName)) {
			items.push(dragName);
		}
		// 如果 targetName 不在列表中，添加它
		if (!items.includes(targetName)) {
			items.push(targetName);
		}

		// 从当前位置移除 dragItem
		const dragIndex = items.indexOf(dragName);
		items.splice(dragIndex, 1);

		// 重新计算 targetIndex
		let targetIndex = items.indexOf(targetName);
		if (targetIndex === -1) {
			items.push(dragName);
			await this.sortSpecManager.save(folderPath, items, spec.customIcons);
			await this.reload();
			return;
		}

		// 计算插入位置
		let insertIndex = mode === 'after' ? targetIndex + 1 : targetIndex;

		items.splice(insertIndex, 0, dragName);

		await this.sortSpecManager.save(folderPath, items, spec.customIcons);
		new Notice(`已更新排序`);
		await this.reload();
	}

	private async moveToAnotherFolder(dragNode: TreeNode, targetNode: TreeNode, mode: 'before' | 'after'): Promise<void> {
		const sourcePath = this.getParentPath(dragNode.path);
		const targetPath = this.getParentPath(targetNode.path);
		const newPath = targetPath === '/' ? `/${dragNode.name}` : `${targetPath}/${dragNode.name}`;

		try {
			const file = this.app.vault.getAbstractFileByPath(dragNode.path);
			if (!file) {
				new Notice('文件未找到');
				return;
			}

			await this.app.vault.rename(file, newPath);
			await this.sortSpecManager.removeItem(sourcePath, dragNode.name);
			await this.sortSpecManager.addItem(targetPath, dragNode.name);

			new Notice(`已将 "${dragNode.name}" 移动到 "${targetPath === '/' ? '根目录' : targetPath}"`);
			await this.reload();
		} catch (error) {
			new Notice('移动失败: ' + (error as Error).message);
			await this.reload();
		}
	}

	cleanup(): void {
		this.tree = [];
		this.clearDropIndicators();
	}
}