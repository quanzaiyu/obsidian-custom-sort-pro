import { App, TFile, TFolder, Notice, Menu, setIcon } from 'obsidian';
import type { TreeNode } from './types';
import { SortSpecManager } from './SortSpecManager';
import { IconPickerModal } from './IconPickerModal';
import { InputModal } from './InputModal';

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

		// 只加载根目录的 sortspec
		await this.loadFolderSortSpec(root);

		// 只加载展开文件夹的直接排序，不递归子文件夹
		for (const expandedPath of this.expandedPaths) {
			const folder = this.app.vault.getFolderByPath(expandedPath);
			if (folder) {
				await this.loadFolderSortSpec(folder);
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

		// 空白区域右键菜单
		treeEl.addEventListener('contextmenu', (e) => {
			const target = e.target as HTMLElement;
			// 如果点击的是 tree item，交给 item 处理
			if (target.closest('.sort-gui-tree-item')) return;
			e.preventDefault();

			// 显示根目录的文件夹菜单
			const menu = new Menu();
			this.addRootFolderMenuItems(menu);
			menu.showAtPosition({ x: e.clientX, y: e.clientY });
		});

		this.renderNodes(this.tree, treeEl);
	}

	private addRootFolderMenuItems(menu: Menu): void {
		menu.addItem(item => {
			item.setTitle('新建笔记').setIcon('file-plus').onClick(() => {
				new InputModal(this.app, '新建笔记', '输入笔记名称', '', (name) => {
					this.app.vault.create(`${name}.md`, '');
				});
			});
		});

		menu.addItem(item => {
			item.setTitle('新建文件夹').setIcon('folder-plus').onClick(() => {
				new InputModal(this.app, '新建文件夹', '输入文件夹名称', '', (name) => {
					this.app.vault.createFolder(name);
				});
			});
		});

		menu.addItem(item => {
			item.setTitle('新建白板').setIcon('layout-dashboard').onClick(() => {
				new InputModal(this.app, '新建白板', '输入白板名称', '', (name) => {
					this.app.vault.create(`${name}.canvas`, '{"nodes":[]}');
				});
			});
		});

		menu.addItem(item => {
			item.setTitle('新建绘图文件').setIcon('pen-tool').onClick(async () => {
				new InputModal(this.app, '新建绘图文件', '输入绘图文件名称', '', async (name) => {
					// const templatePath = 'templates/template.excalidraw.md';
					// const templateFile = this.app.vault.getAbstractFileByPath(templatePath);
					// if (templateFile instanceof TFile) {
					// 	const content = await this.app.vault.read(templateFile);
					// 	const newPath = `${name}.excalidraw.md`;
					// 	await this.app.vault.create(newPath, content);
					// }
						const content = `
---

excalidraw-plugin: parsed
tags: [excalidraw]

---
==⚠  Switch to EXCALIDRAW VIEW in the MORE OPTIONS menu of this document. ⚠==


# Text Elements
%%
# Drawing
\`\`\`json
{
	"type": "excalidraw",
	"version": 2,
	"source": "https://github.com/zsviczian/obsidian-excalidraw-plugin/releases/tag/1.9.28",
	"elements": [],
	"appState": {
		"theme": "light",
		"viewBackgroundColor": "#ffffff",
		"currentItemStrokeColor": "#1e1e1e",
		"currentItemBackgroundColor": "transparent",
		"currentItemFillStyle": "solid",
		"currentItemStrokeWidth": 2,
		"currentItemStrokeStyle": "solid",
		"currentItemRoughness": 1,
		"currentItemOpacity": 100,
		"currentItemFontFamily": 1,
		"currentItemFontSize": 20,
		"currentItemTextAlign": "left",
		"currentItemStartArrowhead": null,
		"currentItemEndArrowhead": "arrow",
		"scrollX": 373.5,
		"scrollY": 475,
		"zoom": {
			"value": 1
		},
		"currentItemRoundness": "round",
		"gridSize": null,
		"gridColor": {
			"Bold": "#C9C9C9FF",
			"Regular": "#EDEDEDFF"
		},
		"currentStrokeOptions": null,
		"previousGridSize": null,
		"frameRendering": {
			"enabled": true,
			"clip": true,
			"name": true,
			"outline": true
		}
	},
	"files": {}
}
\`\`\`
%%
						`
						const newPath = `${name}.excalidraw.md`;
						await this.app.vault.create(newPath, content);
				});
			});
		});

		menu.addSeparator();

		menu.addItem(item => {
			item.setTitle('在系统资源管理器中显示').setIcon('folder').onClick(() => {
				const rootPath = this.app.vault.getRoot().path;
				const realPath = this.app.vault.adapter.getFullPath(rootPath);
				require('electron').shell.showItemInFolder(realPath);
			});
		});

		menu.addItem(item => {
			item.setTitle('在文件列表中显示').setIcon('list').onClick(() => {
				const explorer = this.app.workspace.getLeavesOfType('file-explorer')[0];
				if (explorer) {
					this.app.workspace.revealLeaf(explorer);
					const view = explorer.view as any;
					const rootFolder = this.app.vault.getRoot();
					if (view?.revealInFolder) {
						view.revealInFolder(rootFolder);
					}
				}
			});
		});

		menu.addItem(item => {
			item.setTitle('刷新').setIcon('refresh-cw').onClick(async () => {
				await this.reload();
			});
		});
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

		// 只加载当前文件夹的 sortspec，不递归
		await this.loadFolderSortSpec(folder);

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
			// 优先检查文件夹笔记
			const folderNote = this.getFolderNote(node);
			if (folderNote) {
				// 有文件夹笔记：打开文件 + 展开目录树
				this.app.workspace.getLeaf(false).openFile(folderNote);
				node.expanded = true;
				this.expandedPaths.add(node.path);
				this.render();
			} else if (node.hasChildren) {
				// 没有文件夹笔记，有子节点则展开
				this.toggleExpand(node);
			}
		} else {
			const file = this.app.vault.getAbstractFileByPath(node.path);
			if (file instanceof TFile) {
				this.app.workspace.getLeaf(false).openFile(file);
			}
		}
	}

	private getFolderNote(node: TreeNode): TFile | null {
		if (node.type !== 'folder') return null;

		const folder = this.app.vault.getFolderByPath(node.path);
		if (!folder) return null;

		const mdFileName = `${folder.name}.md`;
		const mdFile = folder.children.find(f => f.name === mdFileName) as TFile | undefined;
		return mdFile instanceof TFile ? mdFile : null;
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

		// 触发 file-menu 事件，让 Obsidian 添加原生菜单项
		const targetFile = this.app.vault.getAbstractFileByPath(node.path);
		if (targetFile) {
			this.app.workspace.trigger('file-menu', menu, targetFile, 'custom-sort-view');
		}

		if (node.type === 'folder') {
			this.addFolderMenuItems(menu, node);
		} else {
			this.addFileMenuItems(menu, node);
		}

		menu.showAtPosition({ x: e.clientX, y: e.clientY });
	}

	private addFolderMenuItems(menu: Menu, node: TreeNode): void {
		// 获取文件夹路径（根目录用空字符串）
		const getFolderPath = (path: string): string => {
			if (path === '/' || path === '' || path === '//') return '';
			// 去掉开头的 /
			let p = path;
			while (p.startsWith('/')) p = p.substring(1);
			return p;
		};

		const folderPath = getFolderPath(node.path);

		menu.addSeparator();

		menu.addItem(item => {
			item.setTitle('新建笔记').setIcon('file-plus').onClick(() => {
				new InputModal(this.app, '新建笔记', '输入笔记名称', '', (name) => {
					this.app.vault.create(folderPath ? `${folderPath}/${name}.md` : `${name}.md`, '');
				});
			});
		});

		menu.addItem(item => {
			item.setTitle('新建文件夹').setIcon('folder-plus').onClick(() => {
				new InputModal(this.app, '新建文件夹', '输入文件夹名称', '', (name) => {
					this.app.vault.createFolder(folderPath ? `${folderPath}/${name}` : `${name}`);
				});
			});
		});

		menu.addItem(item => {
			item.setTitle('新建白板').setIcon('layout-dashboard').onClick(() => {
				new InputModal(this.app, '新建白板', '输入白板名称', '', (name) => {
					this.app.vault.create(folderPath ? `${folderPath}/${name}.canvas` : `${name}.canvas`, '{"nodes":[]}');
				});
			});
		});

		menu.addItem(item => {
			item.setTitle('新建绘图文件').setIcon('pen-tool').onClick(async () => {
				new InputModal(this.app, '新建绘图文件', '输入绘图文件名称', '', async (name) => {
					const templatePath = 'templates/template.excalidraw.md';
					const templateFile = this.app.vault.getAbstractFileByPath(templatePath);
					if (templateFile instanceof TFile) {
						const content = await this.app.vault.read(templateFile);
						const newPath = folderPath ? `${folderPath}/${name}.excalidraw.md` : `${name}.excalidraw.md`;
						await this.app.vault.create(newPath, content);
					}
				});
			});
		});

		menu.addItem(item => {
			item.setTitle('新建文件夹笔记').setIcon('file-text').onClick(async () => {
				const noteName = node.name;
				const notePath = folderPath ? `${folderPath}/${noteName}.md` : `${noteName}.md`;
				const existing = this.app.vault.getAbstractFileByPath(notePath);
				if (existing) {
					new Notice(`"${noteName}.md" 已存在，创建失败`);
				} else {
					await this.app.vault.create(notePath, '');
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
			item.setTitle('删除').setIcon('trash').onClick(async () => {
				const folder = this.app.vault.getFolderByPath(node.path);
				if (folder && confirm(`确定要删除 "${node.name}" 及其所有内容吗?`)) {
					await this.app.vault.delete(folder, true);
				}
			});
		});
	}

	private addFileMenuItems(menu: Menu, node: TreeNode): void {
		menu.addSeparator();

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
			item.setTitle('删除').setIcon('trash').onClick(async () => {
				const file = this.app.vault.getAbstractFileByPath(node.path);
				if (file && confirm(`确定要删除 "${node.name}" 吗?`)) {
					await this.app.vault.delete(file);
				}
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

			// 增量更新：只更新涉及的排序映射
			const sourceSpec = await this.sortSpecManager.load(sourcePath);
			const targetSpec = await this.sortSpecManager.load(targetFolder.path);
			if (sourceSpec) {
				this.updateSortMapInMemory(sourcePath, sourceSpec.sortingSpec, sourceSpec.customIcons);
			}
			if (targetSpec) {
				this.updateSortMapInMemory(targetFolder.path, targetSpec.sortingSpec, targetSpec.customIcons);
			}

			targetFolder.expanded = true;
			this.expandedPaths.add(targetFolder.path);
			this.refreshTreeInPlace();
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
			this.updateSortMapInMemory(folderPath, items, spec.customIcons);
			this.refreshTreeInPlace();
			return;
		}

		// 计算插入位置
		let insertIndex = mode === 'after' ? targetIndex + 1 : targetIndex;

		items.splice(insertIndex, 0, dragName);

		await this.sortSpecManager.save(folderPath, items, spec.customIcons);
		this.updateSortMapInMemory(folderPath, items, spec.customIcons);
		new Notice(`已更新排序`);
		this.refreshTreeInPlace();
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

	// 更新内存中的排序映射，避免重新构建整棵树
	private updateSortMapInMemory(folderPath: string, sortingSpec: string[], customIcons: Record<string, string>): void {
		const sortMap = new Map<string, number>();
		sortingSpec.forEach((name, index) => {
			sortMap.set(name, index);
		});
		this.sortOrdersByFolder.set(folderPath, sortMap);
		this.customIconsByFolder.set(folderPath, customIcons);
	}

	// 只刷新当前显示的树节点，不重建整个树结构
	private refreshTreeInPlace(): void {
		if (!this.container?.parentNode) return;

		const treeEl = this.container.querySelector('.sort-gui-tree') as HTMLElement;
		if (!treeEl) return;

		// 清空容器
		treeEl.empty();

		// 更新内存中的 tree 数组
		this.tree = this.buildNodesFromFolder(this.app.vault.getRoot());

		// 遍历展开的路径，确保子节点已加载
		for (const node of this.tree) {
			if (node.type === 'folder' && this.expandedPaths.has(node.path)) {
				node.expanded = true;
				this.ensureChildrenLoaded(node);
			}
		}

		// 重新渲染
		this.renderNodes(this.tree, treeEl);
	}

	// 确保子节点已加载
	private ensureChildrenLoaded(node: TreeNode): void {
		if (node.loaded) return;

		const folder = this.app.vault.getFolderByPath(node.path);
		if (!folder) return;

		node.children = this.buildNodesFromFolder(folder);
		node.loaded = true;

		// 递归处理子节点
		for (const child of node.children) {
			if (child.type === 'folder' && this.expandedPaths.has(child.path)) {
				child.expanded = true;
				this.ensureChildrenLoaded(child);
			}
		}
	}

	cleanup(): void {
		this.tree = [];
		this.clearDropIndicators();
	}
}
