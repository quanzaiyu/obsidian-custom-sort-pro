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
		this.app.vault.on('delete', (file: TAbstractFile) => {
			console.log('[DragDropTree] delete 事件触发:', file.path);
			this.refreshFolderChildren(file.path);
		});
		this.app.vault.on('create', (file: TAbstractFile) => {
			console.log('[DragDropTree] create 事件触发:', file.path);
			this.refreshFolderChildren(file.path);
		});
		this.app.vault.on('rename', (file: TAbstractFile, oldPath: string) => {
			console.log('[DragDropTree] rename 事件触发:', oldPath, '->', file.path);
			this.refreshFolderChildren(file.path);
		});
	}

	private async reload(): Promise<void> {
		console.log('[DragDropTree] reload 开始');
		await this.buildTree();
		console.log('[DragDropTree] buildTree 完成');
		this.refreshTreeInPlace();
		console.log('[DragDropTree] refreshTreeInPlace 完成');
	}

	// 增量更新：只更新变化的节点，不清空整个 DOM
	private refreshTreeInPlace(): void {
		if (!this.container?.parentNode) {
			console.log('[refreshTreeInPlace] container 无父节点');
			return;
		}

		const treeEl = this.container.querySelector('.sort-gui-tree');
		if (!treeEl) {
			console.log('[refreshTreeInPlace] 没有 treeEl，完整渲染');
			this.render();
			return;
		}

		console.log('[refreshTreeInPlace] treeEl 子元素数量:', treeEl.children.length);

		// 获取旧的 DOM 元素映射
		const oldElements = new Map<string, HTMLElement>();
		treeEl.querySelectorAll('.sort-gui-tree-item[data-path]').forEach(el => {
			oldElements.set((el as HTMLElement).dataset.path || '', el as HTMLElement);
		});
		console.log('[refreshTreeInPlace] oldElements 数量:', oldElements.size);
		console.log('[refreshTreeInPlace] tree 长度:', this.tree.length);

		// 比较并更新节点
		this.updateTreeNodesInPlace(treeEl, this.tree, oldElements);

		console.log('[refreshTreeInPlace] 完成后 treeEl 子元素数量:', treeEl.children.length);
	}

	private updateTreeNodesInPlace(parentEl: HTMLElement, nodes: TreeNode[], oldElements: Map<string, HTMLElement>, parentPaths?: Set<string>): void {
		const existingPaths = new Set<string>(parentPaths || []);

		for (const node of nodes) {
			existingPaths.add(node.path);
			const oldEl = oldElements.get(node.path);

			if (oldEl) {
				// 节点已存在，更新内容
				this.updateNodeContent(oldEl, node);

				// 如果文件夹已展开且有子节点
				if (node.type === 'folder' && node.expanded && node.hasChildren && node.children && node.children.length > 0) {
					let childrenEl = oldEl.querySelector(':scope + .sort-gui-tree-children') as HTMLElement;
					if (!childrenEl) {
						// 没有子容器，在 oldEl 后面创建
						childrenEl = createDiv('sort-gui-tree-children');
						childrenEl.dataset.parentId = node.id;
						// 渲染子节点
						this.renderNodes(node.children, childrenEl);
						// 插入到 oldEl 后面
						oldEl.after(childrenEl);
					}
					// 递归更新子节点，传递新的 existingPaths
					this.updateTreeNodesInPlace(childrenEl, node.children, oldElements, existingPaths);
				}
			} else {
				// 新节点，插入到正确位置
				const itemEl = this.createTreeItem(node);
				itemEl.style.animation = 'none'; // 新节点不需要动画
				this.insertNodeInOrder(parentEl, itemEl, node);
			}
		}

		// 移除被删除的节点（只移除当前层级的）
		if (!parentPaths) {
			// 只有在根层级才移除
			for (const [path, el] of oldElements) {
				if (!existingPaths.has(path)) {
					el.remove();
				}
			}
		}
	}

	private insertNodeInOrder(parentEl: HTMLElement, newEl: HTMLElement, node: TreeNode): void {
		const children = Array.from(parentEl.children) as HTMLElement[];
		const nodeIndex = this.getNodeSortIndex(node);

		for (let i = 0; i < children.length; i++) {
			const child = children[i];
			const childPath = child.dataset.path;
			if (childPath) {
				const childNode = this.findNodeByPath(childPath, this.tree);
				if (childNode && this.getNodeSortIndex(childNode) > nodeIndex) {
					parentEl.insertBefore(newEl, child);
					return;
				}
			}
		}

		parentEl.appendChild(newEl);
	}

	private findNodeByPath(path: string, nodes: TreeNode[]): TreeNode | null {
		for (const node of nodes) {
			if (node.path === path) return node;
			if (node.children) {
				const found = this.findNodeByPath(path, node.children);
				if (found) return found;
			}
		}
		return null;
	}

	private getNodeSortIndex(node: TreeNode): number {
		const sortMap = this.sortOrdersByFolder.get(this.getParentPath(node.path)) || new Map<string, number>();
		const nameWithoutExt = node.name.endsWith('.md') ? node.name.slice(0, -3) : node.name;
		return sortMap.get(nameWithoutExt) ?? 999999;
	}

	private updateNodeContent(el: HTMLElement, node: TreeNode): void {
		// 更新图标
		const iconEl = el.querySelector('.sort-gui-item-icon');
		if (iconEl) {
			this.renderNodeIcon(iconEl as HTMLElement, node);
		}
	}

	// 刷新指定文件的父目录
	private async refreshFolderChildren(filePath: string): Promise<void> {
		const parentPath = this.getParentPath(filePath);
		const treeEl = this.container?.querySelector('.sort-gui-tree');
		if (!treeEl) return;

		console.log('[refreshFolderChildren] filePath:', filePath, 'parentPath:', parentPath);

		// 根目录特殊处理
		if (parentPath === '/') {
			console.log('[refreshFolderChildren] 根目录刷新');
			// 保存当前展开状态
			const savedExpandedPaths = new Set(this.expandedPaths);
			console.log('[refreshFolderChildren] savedExpandedPaths:', Array.from(savedExpandedPaths));

			// 重新加载根目录的 sortspec
			await this.loadFolderSortSpec(this.app.vault.getRoot());

			// 获取新的根目录内容
			const root = this.app.vault.getAbstractFileByPath('/') as TFolder;
			const newRootChildren: TreeNode[] = [];
			for (const child of root.children) {
				if (this.isFolderNote(child.name, root)) continue;

				const nameWithoutExt = child.name.endsWith('.md') ? child.name.slice(0, -3) : child.name;
				const sortMap = this.sortOrdersByFolder.get('/') || new Map<string, number>();

				const isExpanded = savedExpandedPaths.has(child.path);
				const node: TreeNode = {
					id: child.path,
					name: child.name,
					type: child instanceof TFolder ? 'folder' : 'file',
					path: child.path,
					children: [],
					hasChildren: child instanceof TFolder && child.children.length > 0,
					expanded: isExpanded,
					loaded: false,
					sortOrder: sortMap.get(nameWithoutExt)
				};

				const icons = this.customIconsByFolder.get('/') || {};
				if (icons[nameWithoutExt]) {
					node.customIcon = icons[nameWithoutExt];
				}

				newRootChildren.push(node);
			}

			// 排序
			newRootChildren.sort((a, b) => {
				if (a.sortOrder !== undefined && b.sortOrder !== undefined) {
					return a.sortOrder - b.sortOrder;
				}
				if (a.sortOrder !== undefined) return -1;
				if (b.sortOrder !== undefined) return 1;
				return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
			});

			// 递归加载已展开的子文件夹
			for (const node of newRootChildren) {
				if (node.expanded) {
					console.log('[refreshFolderChildren] 加载子节点:', node.name);
					await this.loadNodeChildren(node);
				}
			}

			// 保存到 tree
			this.tree = newRootChildren;
			console.log('[refreshFolderChildren] tree 节点:', this.tree.map(n => ({ name: n.name, expanded: n.expanded, children: n.children?.length })));

			// 更新 DOM
			this.refreshTreeInPlace();
			return;
		}

		// 找到父目录对应的节点
		const parentNode = this.findNodeByPath(parentPath, this.tree);
		if (!parentNode) return;

		// 重新加载该目录的 sortspec
		const folder = this.app.vault.getFolderByPath(parentPath);
		if (folder) {
			await this.loadFolderSortSpec(folder);
		}

		// 重新构建子节点
		parentNode.children = this.buildNodesFromFolder(folder!);
		parentNode.loaded = true;

		// 更新 DOM 中的子节点
		const existingChildrenEl = treeEl.querySelector(`[data-parent-id="${parentNode.id}"]`);
		if (existingChildrenEl) {
			existingChildrenEl.empty();
			this.renderNodes(parentNode.children, existingChildrenEl as HTMLElement);
		} else {
			// 如果没有子容器，刷新整个树
			await this.loadExpandedSubfolders(this.tree);
			this.refreshTreeInPlace();
		}
	}

	// 加载节点的子节点
	private async loadNodeChildren(node: TreeNode): Promise<void> {
		const folder = this.app.vault.getFolderByPath(node.path);
		if (!folder) return;

		await this.loadFolderSortSpec(folder);
		node.children = this.buildNodesFromFolder(folder);
		node.loaded = true;

		for (const child of node.children) {
			if (child.type === 'folder' && child.expanded) {
				await this.loadNodeChildren(child);
			}
		}
	}

	// 递归加载已展开的子文件夹
	private async loadExpandedSubfolders(nodes: TreeNode[]): Promise<void> {
		for (const node of nodes) {
			if (node.type === 'folder' && this.expandedPaths.has(node.path)) {
				node.expanded = true;
				const folder = this.app.vault.getFolderByPath(node.path);
				if (folder) {
					await this.loadFolderSortSpec(folder);
					node.children = this.buildNodesFromFolder(folder);
					node.loaded = true;
					if (node.children.length > 0) {
						await this.loadExpandedSubfolders(node.children);
					}
				}
			}
		}
	}

	private async buildTree(): Promise<void> {
		console.log('[DragDropTree] buildTree 内部');
		// 使用 getAbstractFileByPath 获取最新的 root 引用，避免缓存问题
		const root = this.app.vault.getAbstractFileByPath('/') as TFolder;
		console.log('[DragDropTree] root children names:', root.children.map(c => c.name));
		console.log('[DragDropTree] root children count:', root.children.length);
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
		console.log('[DragDropTree] tree 节点数:', this.tree.length);
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

		if (spec) {
			if (spec.sortingSpec.length > 0) {
				const sortMap = new Map<string, number>();
				spec.sortingSpec.forEach((name, index) => {
					sortMap.set(name, index);
				});
				this.sortOrdersByFolder.set(folderPath, sortMap);
			} else {
				this.sortOrdersByFolder.delete(folderPath);
			}

			// 只要有 customIcons 就保存，不管 sortingSpec 是否为空
			if (Object.keys(spec.customIcons).length > 0) {
				this.customIconsByFolder.set(folderPath, spec.customIcons);
			} else {
				this.customIconsByFolder.delete(folderPath);
			}
		} else {
			// spec 为 null，清除所有缓存
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
		itemEl.dataset.path = node.path;

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
			},
			onFileCreated: async (filePath: string) => {
				// 上传新文件后，只刷新该文件的父目录
				this.refreshFolderChildren(filePath);
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
					// 删除前获取父目录路径
					const parentPath = this.getParentPath(node.path);
					const nameWithoutExt = node.name.endsWith('.md') ? node.name.slice(0, -3) : node.name;

					await this.app.vault.delete(file);

					// 从 sortspec.md 中移除该文件
					const spec = await this.sortSpecManager.load(parentPath);
					if (spec) {
						// 从 sorting-spec 中移除
						const newSortingSpec = spec.sortingSpec.filter(name => {
							const n = name.endsWith('.md') ? name.slice(0, -3) : name;
							return n !== nameWithoutExt;
						});
						// 从 custom-icons 中移除
						const { [nameWithoutExt]: _, ...remainingIcons } = spec.customIcons;
						await this.sortSpecManager.save(parentPath, newSortingSpec, remainingIcons);
					}
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

			// 增量刷新：刷新源目录和目标目录
			this.refreshFolderChildren(dragNode.path); // 原路径，用于触发刷新
			await this.refreshFolderChildren(newPath);
		} catch (error) {
			new Notice('移动失败: ' + (error as Error).message);
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

			// 增量刷新：刷新源目录和目标目录
			await this.refreshFolderChildren(sourcePath + '/'); // 触发源目录刷新
			await this.refreshFolderChildren(targetPath + '/'); // 触发目标目录刷新
		} catch (error) {
			new Notice('移动失败: ' + (error as Error).message);
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
