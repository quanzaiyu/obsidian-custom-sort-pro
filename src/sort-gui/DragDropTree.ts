import { App, TFolder, Notice, TFile } from 'obsidian';

export interface TreeNode {
	id: string;
	name: string;
	type: 'folder' | 'file';
	path: string;
	children: TreeNode[];
	hasChildren: boolean;
	expanded?: boolean;
	loaded?: boolean;
	sortOrder?: number;
}

export class DragDropTree {
	private app: App;
	private container: HTMLElement;
	private tree: TreeNode[] = [];
	private sortSpecFilePath: string | null = null;
	private sortOrdersByFolder: Map<string, Map<string, number>> = new Map();
	private currentFolderPath: string = '/';
	private dragId: string | null = null;
	private dragNode: TreeNode | null = null;
	private dropMode: 'before' | 'after' | 'folder' | null = null;
	private expandedPaths: Set<string> = new Set();

	constructor(app: App, container: HTMLElement, sortSpecFilePath: string | null = null) {
		this.app = app;
		this.container = container;
		this.sortSpecFilePath = sortSpecFilePath;
	}

	async init(): Promise<void> {
		await this.buildTree();
		this.render();
	}

	async reload(): Promise<void> {
		try {
			// Don't clear here - buildTree() will handle it
			await this.buildTree();
			this.render();
		} catch (error) {
			console.error('Reload failed:', error);
		}
	}

	setSortSpecFile(path: string | null): void {
		this.sortSpecFilePath = path;
	}

	setCurrentFolderPath(path: string): void {
		this.currentFolderPath = path;
	}

	getTree(): TreeNode[] {
		return this.tree;
	}

	private async loadExistingSortOrder(): Promise<void> {
		if (!this.sortSpecFilePath) {
			this.sortOrdersByFolder.clear();
			return;
		}

		const file = this.app.vault.getAbstractFileByPath(this.sortSpecFilePath);
		if (!(file instanceof TFile)) {
			this.sortOrdersByFolder.clear();
			return;
		}

		try {
			const content = await this.app.vault.read(file);
			const match = content.match(/sorting-spec:\s*\|\s*([\s\S]*?)(?=^---|\n---|\n$)/m);
			if (match) {
				this.parseSortSpec(match[1], this.currentFolderPath);
			}
		} catch (error) {
			console.error('读取 sortspec.md 失败:', error);
			this.sortOrdersByFolder.clear();
		}
	}

	private parseSortSpec(content: string, folderPath: string): void {
		const lines = content.split('\n').map(l => l.trim()).filter(l => l);
		let order = 0;

		// Create or get the map for this folder
		let folderMap = this.sortOrdersByFolder.get(folderPath);
		if (!folderMap) {
			folderMap = new Map();
			this.sortOrdersByFolder.set(folderPath, folderMap);
		}

		for (const line of lines) {
			if (line.startsWith('target-folder:')) continue;
			if (line && !line.startsWith('#')) {
				folderMap.set(line, order++);
			}
		}
	}

	private async buildTree(): Promise<void> {
		const vault = this.app.vault;
		const root = vault.getRoot();

		// Clear existing orders
		this.sortOrdersByFolder.clear();

		// Load root folder's sortspec
		await this.loadExistingSortOrder();

		// Load sortspecs for all expanded folders
		for (const expandedPath of this.expandedPaths) {
			const folder = vault.getFolderByPath(expandedPath);
			if (folder) {
				await this.loadSubfolderSortSpec(folder);
			}
		}

		this.tree = this.buildNodeFromFolder(root);
	}

	private async loadChildren(node: TreeNode): Promise<TreeNode[]> {
		const folder = this.app.vault.getFolderByPath(node.path);
		if (!folder) return [];

		// Load sortspec for this specific subfolder (must wait)
		await this.loadSubfolderSortSpec(folder);

		return this.buildNodeFromFolder(folder);
	}

	private async loadSubfolderSortSpec(folder: TFolder): Promise<void> {
		// Always reload to ensure we have the latest
		this.sortOrdersByFolder.delete(folder.path);

		const sortspecPath = folder.path === '/' ? '/sortspec.md' : `${folder.path}/sortspec.md`;
		const sortspecFile = this.app.vault.getAbstractFileByPath(sortspecPath);

		if (!(sortspecFile instanceof TFile)) return;

		try {
			const content = await this.app.vault.read(sortspecFile);
			const match = content.match(/sorting-spec:\s*\|\s*([\s\S]*?)(?=^---|\n---|\n$)/m);
			if (match) {
				const lines = match[1].split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
				let order = 0;
				const folderMap = new Map<string, number>();
				this.sortOrdersByFolder.set(folder.path, folderMap);

				for (const line of lines) {
					if (line.startsWith('target-folder:')) continue;
					folderMap.set(line, order++);
				}
			}
		} catch (error) {
			console.error('读取sortspec失败:', error);
		}
	}

	private buildNodeFromFolder(folder: TFolder): TreeNode[] {
		const children = folder.children;
		const nodes: TreeNode[] = [];

		for (const child of children) {
			const node: TreeNode = {
				id: child.path,
				name: child.name,
				type: child instanceof TFolder ? 'folder' : 'file',
				path: child.path,
				children: [],
				hasChildren: child instanceof TFolder && child.children.length > 0,
				expanded: this.expandedPaths.has(child.path),
				loaded: false
			};

			// Remove .md extension for matching with sorting-spec
			const nameForSort = child.name.endsWith('.md') ? child.name.slice(0, -3) : child.name;

			// Get sort order from the folder-specific map
			const folderMap = this.sortOrdersByFolder.get(folder.path);
			if (folderMap && folderMap.has(nameForSort)) {
				node.sortOrder = folderMap.get(nameForSort);
			}

			nodes.push(node);
		}

		// Sort by explicit order, no folder/file preference
		nodes.sort((a, b) => {
			const aOrder = a.sortOrder ?? Infinity;
			const bOrder = b.sortOrder ?? Infinity;

			if (aOrder !== Infinity && bOrder !== Infinity) {
				return aOrder - bOrder;
			}
			if (aOrder !== Infinity) return -1;
			if (bOrder !== Infinity) return 1;

			// Fallback: alphabetical
			return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
		});

		return nodes;
	}

	render(): void {
		if (!this.container || !this.container.parentNode) return;

		this.container.empty();
		const treeEl = this.container.createDiv('sort-gui-tree');

		// Listen for drop on tree container (for root level drops)
		treeEl.addEventListener('dragover', (e) => {
			e.preventDefault();
			if (this.dragId) {
				e.dataTransfer!.dropEffect = 'move';
			}
		});
		treeEl.addEventListener('drop', (e) => this.handleTreeDrop(e));

		this.renderNodes(this.tree, treeEl, 0);
	}

	private handleTreeDrop(e: DragEvent): void {
		e.preventDefault();
		// Dropping on empty area does nothing - just clear state
		this.clearDropIndicators();
	}

	private renderNodes(nodes: TreeNode[], parentEl: HTMLElement, depth: number): void {
		for (const node of nodes) {
			const itemEl = this.createTreeItem(node);
			parentEl.appendChild(itemEl);

			if (node.type === 'folder' && node.hasChildren && node.expanded) {
				const childrenEl = parentEl.createDiv('sort-gui-tree-children');
				childrenEl.dataset.parentId = node.id;
				if (node.loaded && node.children.length > 0) {
					this.renderNodes(node.children, childrenEl, depth + 1);
				} else if (!node.loaded) {
					this.loadAndRenderChildren(node, childrenEl, depth + 1);
				}
			}
		}
	}

	private async loadAndRenderChildren(node: TreeNode, childrenEl: HTMLElement, depth: number): Promise<void> {
		const children = await this.loadChildren(node);
		node.children = children;
		node.loaded = true;
		if (children.length > 0) {
			this.renderNodes(children, childrenEl, depth);
		}
	}

	private createTreeItem(node: TreeNode): HTMLElement {
		const itemEl = createDiv('sort-gui-tree-item');

		// Expand toggle (always shown for folders with children)
		if (node.type === 'folder' && node.hasChildren) {
			const toggleEl = itemEl.createDiv('sort-gui-item-toggle');
			toggleEl.textContent = node.expanded ? '▼' : '▶';
			toggleEl.addEventListener('click', (e) => {
				e.stopPropagation();
				node.expanded = !node.expanded;
				if (node.expanded) {
					this.expandedPaths.add(node.path);
				} else {
					this.expandedPaths.delete(node.path);
				}
				this.render();
			});
		}

		// Icon
		const iconEl = itemEl.createDiv('sort-gui-item-icon');
		iconEl.textContent = node.type === 'folder' ? (node.expanded ? '📂' : '📁') : '📄';

		// Name
		const nameEl = itemEl.createDiv('sort-gui-item-name');
		nameEl.textContent = node.name;

		itemEl.setAttr('draggable', 'true');
		itemEl.dataset.id = node.id;
		itemEl.dataset.type = node.type;

		// Click to expand/collapse folders
		itemEl.addEventListener('click', () => {
			if (node.type === 'folder' && node.hasChildren) {
				node.expanded = !node.expanded;
				if (node.expanded) {
					this.expandedPaths.add(node.path);
				} else {
					this.expandedPaths.delete(node.path);
				}
				this.render();
			}
		});

		// Drag events
		itemEl.addEventListener('dragstart', (e) => this.handleDragStart(e, node));
		itemEl.addEventListener('dragend', (e) => this.handleDragEnd(e));
		itemEl.addEventListener('dragover', (e) => this.handleDragOver(e, node, itemEl));
		itemEl.addEventListener('dragleave', (e) => this.handleDragLeave(e));
		itemEl.addEventListener('dragenter', (e) => this.handleDragEnter(e));
		itemEl.addEventListener('drop', (e) => this.handleDrop(e, node));

		return itemEl;
	}

	private handleDragStart(e: DragEvent, node: TreeNode): void {
		this.dragId = node.id;
		this.dragNode = node;

		const item = (e.target as HTMLElement).closest('.sort-gui-tree-item') as HTMLElement | null;
		if (item) {
			item.classList.add('dragging');
		}

		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
		}
	}

	private handleDragEnd(e: DragEvent): void {
		const item = (e.target as HTMLElement).closest('.sort-gui-tree-item') as HTMLElement | null;
		if (item) {
			item.classList.remove('dragging');
		}

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

		// If target is a folder AND mouse is in bottom 25%, it's a folder drop
		if (targetNode.type === 'folder') {
			const folderDropZoneStart = rect.height * 0.75;
			if (relativeY >= folderDropZoneStart) {
				itemEl.classList.add('drag-over-folder');
				this.dropMode = 'folder';
				return;
			}
		}

		// Otherwise: top half = insert before, bottom half = insert after
		if (relativeY < rect.height / 2) {
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
			const item = currentTarget.closest('.sort-gui-tree-item') as HTMLElement | null;
			if (item) {
				item.classList.remove('drop-before', 'drop-after', 'drag-over-folder');
			}
		}
	}

	private handleDragEnter(e: DragEvent): void {
		e.preventDefault();
	}

	private handleDrop(e: DragEvent, targetNode: TreeNode): void {
		e.preventDefault();
		e.stopPropagation();

		// Safety check: if drag state is already cleared, ignore drop
		if (!this.dragId || !this.dragNode) {
			return;
		}

		this.clearDropIndicators();

		const mode = this.dropMode === 'before' ? 'before' : 'after';

		// If dropping on a folder at the folder drop zone (bottom 25%), move into folder
		if (this.dropMode === 'folder' && targetNode.type === 'folder') {
			this.moveIntoFolder(this.dragNode, targetNode);
			return;
		}

		// Get paths
		const sourcePath = this.getParentPath(this.dragNode.path);

		// Determine if this should be a reorder or move
		let shouldReorder = false;
		let targetParentPath: string;

		if (targetNode.type === 'folder') {
			// 目标也是文件夹：检查源文件是否在目标文件夹内
			const isInsideTarget = this.dragNode.path.startsWith(targetNode.path + '/');
			if (!isInsideTarget) {
				// 源文件不在目标文件夹内，检查是否和目标文件夹在同一父目录
				const targetParent = this.getParentPath(targetNode.path);
				if (sourcePath === targetParent) {
					// 同一父目录下：排序操作
					shouldReorder = true;
					targetParentPath = targetParent;
				} else {
					// 不同父目录：移动操作
					targetParentPath = targetNode.path;
				}
			} else {
				// 源文件在目标文件夹内：移动操作
				targetParentPath = targetNode.path;
			}
		} else {
			// 目标是文件：使用文件的父目录
			targetParentPath = this.getParentPath(targetNode.path);
		}

		// Debug log
		console.log('[DragDrop] Drop:', {
			dragPath: this.dragNode.path,
			sourcePath,
			targetPath: targetNode.path,
			targetParentPath,
			targetType: targetNode.type,
			dropMode: this.dropMode,
			shouldReorder
		});

		// Same folder: just reorder
		if (sourcePath === targetParentPath || shouldReorder) {
			this.reorderItem(this.dragNode, targetNode, mode);
			this.render();
			return;
		}

		// Cross-folder move
		if (targetNode.type === 'folder') {
			this.moveIntoFolderAtPosition(this.dragNode, targetNode, mode);
		} else {
			this.moveFileBetweenFolders(this.dragNode, targetNode, mode);
		}
	}

	private getParentPath(filePath: string): string {
		const lastSlash = filePath.lastIndexOf('/');
		if (lastSlash === -1) return '/';
		return filePath.substring(0, lastSlash);
	}

	private async moveIntoFolder(dragNode: TreeNode, targetFolder: TreeNode): Promise<void> {
		const sourcePath = this.getParentPath(dragNode.path);
		const newPath = targetFolder.path === '/' ? `/${dragNode.name}` : `${targetFolder.path}/${dragNode.name}`;

		try {
			// Get file reference BEFORE moving
			const fileToMove = this.app.vault.getAbstractFileByPath(dragNode.path);
			if (!fileToMove) {
				new Notice('文件未找到：' + dragNode.path);
				return;
			}

			// Move the file
			await this.app.vault.rename(fileToMove, newPath);

			// Update sortspecs
			await this.updateSourceFolderSortSpec(sourcePath, dragNode.name);
			await this.syncTargetFolderSortSpec(targetFolder.path);

			new Notice(`已将 "${dragNode.name}" 移动到 "${targetFolder.name}"`);

			// Refresh
			targetFolder.expanded = true;
			this.expandedPaths.add(targetFolder.path);
			await this.buildTree();
			this.render();
			this.refreshFileExplorer();
		} catch (error) {
			// 即使出错（可能已移动成功但报错），仍然刷新视图
			const errorMsg = (error as Error).message || '';
			if (errorMsg.includes('File already exists')) {
				new Notice(`已将 "${dragNode.name}" 移动到 "${targetFolder.name}"`);
			} else {
				new Notice('移动失败：' + errorMsg);
			}

			// 无论如何都刷新视图（文件可能已经移动成功）
			targetFolder.expanded = true;
			this.expandedPaths.add(targetFolder.path);
			await this.buildTree();
			this.render();
			this.refreshFileExplorer();
		}
	}

	private async moveIntoFolderAtPosition(dragNode: TreeNode, targetFolder: TreeNode, mode: 'before' | 'after'): Promise<void> {
		const sourcePath = this.getParentPath(dragNode.path);
		const newPath = targetFolder.path === '/' ? `/${dragNode.name}` : `${targetFolder.path}/${dragNode.name}`;

		try {
			// Get file reference BEFORE moving
			const fileToMove = this.app.vault.getAbstractFileByPath(dragNode.path);
			if (!fileToMove) {
				new Notice('文件未找到：' + dragNode.path);
				return;
			}

			// Move the file
			await this.app.vault.rename(fileToMove, newPath);

			// Update sortspecs
			await this.updateSourceFolderSortSpec(sourcePath, dragNode.name);
			await this.syncTargetFolderSortSpec(targetFolder.path);

			new Notice(`已将 "${dragNode.name}" 移动到 "${targetFolder.name}"`);

			// Refresh
			targetFolder.expanded = true;
			this.expandedPaths.add(targetFolder.path);
			await this.buildTree();
			this.render();
			this.refreshFileExplorer();
		} catch (error) {
			// 即使出错（可能已移动成功但报错），仍然刷新视图
			const errorMsg = (error as Error).message || '';
			if (errorMsg.includes('File already exists')) {
				new Notice(`已将 "${dragNode.name}" 移动到 "${targetFolder.name}"`);
			} else {
				new Notice('移动失败：' + errorMsg);
			}

			// 无论如何都刷新视图（文件可能已经移动成功）
			targetFolder.expanded = true;
			this.expandedPaths.add(targetFolder.path);
			await this.buildTree();
			this.render();
			this.refreshFileExplorer();
		}
	}

	private async moveFileBetweenFolders(dragNode: TreeNode, targetNode: TreeNode, mode: 'before' | 'after'): Promise<void> {
		const sourcePath = this.getParentPath(dragNode.path);
		const targetPath = this.getParentPath(targetNode.path);

		// Calculate new path
		const newPath = targetPath === '/' ? `/${dragNode.name}` : `${targetPath}/${dragNode.name}`;

		try {
			// Get file reference BEFORE moving
			const fileToMove = this.app.vault.getAbstractFileByPath(dragNode.path);
			if (!fileToMove) {
				new Notice('文件未找到：' + dragNode.path);
				return;
			}

			// Move the file
			await this.app.vault.rename(fileToMove, newPath);

			// Update sortspecs
			await this.updateSourceFolderSortSpec(sourcePath, dragNode.name);
			await this.syncTargetFolderSortSpec(targetPath);

			new Notice(`已将 "${dragNode.name}" 移动到 "${targetPath === '/' ? '根目录' : targetPath}"`);

			// Refresh
			await this.buildTree();
			this.render();
			this.refreshFileExplorer();
		} catch (error) {
			// 即使出错（可能已移动成功但报错），仍然刷新视图
			const errorMsg = (error as Error).message || '';
			if (errorMsg.includes('File already exists')) {
				new Notice(`已将 "${dragNode.name}" 移动到 "${targetPath === '/' ? '根目录' : targetPath}"`);
			} else {
				new Notice('移动失败：' + errorMsg);
			}

			// 无论如何都刷新视图（文件可能已经移动成功）
			await this.buildTree();
			this.render();
			this.refreshFileExplorer();
		}
	}

	private async updateSourceFolderSortSpec(folderPath: string, fileName: string): Promise<void> {
		if (folderPath === '/' || folderPath === '') return;

		const vault = this.app.vault;
		const sortspecPath = `${folderPath}/sortspec.md`;
		const sortName = fileName.endsWith('.md') ? fileName.slice(0, -3) : fileName;

		const existingFile = vault.getAbstractFileByPath(sortspecPath);
		if (!(existingFile instanceof TFile)) return;

		try {
			const content = await vault.read(existingFile);
			const lines = content.split('\n');
			const newLines = lines.filter(line => !line.trim().endsWith(sortName) && line.trim() !== sortName);
			await vault.modify(existingFile, newLines.join('\n'));
		} catch (error) {
			console.error('更新源文件夹sortspec失败:', error);
		}
	}

	private async syncTargetFolderSortSpec(folderPath: string): Promise<void> {
		const vault = this.app.vault;
		const sortspecPath = folderPath === '/' ? '/sortspec.md' : `${folderPath}/sortspec.md`;
		const folder = folderPath === '/' ? vault.getRoot() : vault.getFolderByPath(folderPath);

		if (!folder) return;

		// Get current children order
		const children = folder.children;
		const specLines: string[] = [];

		for (const child of children) {
			const name = child.name.endsWith('.md') ? child.name.slice(0, -3) : child.name;
			specLines.push(`    ${name}`);
		}

		const newContent = `---\nsorting-spec: |\n    target-folder: .\n${specLines.join('\n')}\n---\n`;
		const existingFile = vault.getAbstractFileByPath(sortspecPath);

		if (existingFile instanceof TFile) {
			await vault.modify(existingFile, newContent);
		} else {
			await vault.create(sortspecPath, newContent);
		}
	}

	private async insertIntoTargetFolderSortSpec(folderPath: string, fileName: string, targetFolder: TreeNode, mode: 'before' | 'after'): Promise<void> {
		const vault = this.app.vault;
		const sortspecPath = folderPath === '/' ? '/sortspec.md' : `${folderPath}/sortspec.md`;
		const sortName = fileName.endsWith('.md') ? fileName.slice(0, -3) : fileName;

		// Get target folder's children (after the move)
		const folder = folderPath === '/' ? vault.getRoot() : vault.getFolderByPath(folderPath);
		if (!folder) return;

		// Build new sortspec with all children in order
		const specLines: string[] = [];
		for (const child of folder.children) {
			const name = child.name.endsWith('.md') ? child.name.slice(0, -3) : child.name;
			specLines.push(`    ${name}`);
		}

		const newContent = `---\nsorting-spec: |\n    target-folder: .\n${specLines.join('\n')}\n---\n`;
		const existingFile = vault.getAbstractFileByPath(sortspecPath);

		if (existingFile instanceof TFile) {
			await vault.modify(existingFile, newContent);
		} else {
			await vault.create(sortspecPath, newContent);
		}
	}

	private async insertIntoTargetFolderSortSpecAt(folderPath: string, fileName: string, targetNode: TreeNode, mode: 'before' | 'after'): Promise<void> {
		const vault = this.app.vault;
		const sortspecPath = folderPath === '/' ? '/sortspec.md' : `${folderPath}/sortspec.md`;
		const sortName = fileName.endsWith('.md') ? fileName.slice(0, -3) : fileName;

		const existingFile = vault.getAbstractFileByPath(sortspecPath);

		if (existingFile instanceof TFile) {
			try {
				const content = await vault.read(existingFile);
				const lines = content.split('\n');

				// Find target position (using target node's name)
				const targetName = targetNode.name.endsWith('.md') ? targetNode.name.slice(0, -3) : targetNode.name;
				let insertIndex = -1;

				for (let i = 0; i < lines.length; i++) {
					const trimmed = lines[i].trim();
					if (trimmed === targetName || trimmed.endsWith(targetName)) {
						insertIndex = mode === 'after' ? i + 1 : i;
						break;
					}
				}

				if (insertIndex !== -1) {
					lines.splice(insertIndex, 0, `    ${sortName}`);
					await vault.modify(existingFile, lines.join('\n'));
				} else {
					// Fallback: sync entire folder
					await this.syncTargetFolderSortSpec(folderPath);
				}
			} catch (error) {
				console.error('插入sortspec失败:', error);
				await this.syncTargetFolderSortSpec(folderPath);
			}
		} else {
			// Create new sortspec
			await this.syncTargetFolderSortSpec(folderPath);
		}
	}

	private refreshFileExplorer(): void {
		this.app.workspace.getLeavesOfType('file-explorer').forEach((leaf) => {
			const view = leaf.view as any;
			if (view && typeof view.requestSort === 'function') {
				view.requestSort();
			}
		});
	}

	/**
	 * Reorder item: move dragNode to be before or after targetNode
	 */
	private reorderItem(dragNode: TreeNode, targetNode: TreeNode, mode: 'before' | 'after'): void {
		// Find the siblings array that contains targetNode
		const siblings = this.findParentArray(this.tree, targetNode.id);
		if (!siblings) {
			return;
		}

		// Find targetIndex in siblings
		let targetIndex = siblings.findIndex(n => n.id === targetNode.id);
		if (targetIndex === -1) {
			return;
		}

		// Check if dragNode is in siblings
		let dragIndex = siblings.findIndex(n => n.id === dragNode.id);

		// If not in siblings, check root level
		if (dragIndex === -1) {
			dragIndex = this.tree.findIndex(n => n.id === dragNode.id);
		}

		// Must be found somewhere
		if (dragIndex === -1) {
			return;
		}

		// Check if dragNode is in a different array (subfolder vs siblings)
		const isInSameArray = siblings.includes(dragNode);

		if (isInSameArray) {
			// Same array: simple reorder
			siblings.splice(dragIndex, 1);
			// Adjust targetIndex if we removed an item before it
			if (dragIndex < targetIndex) {
				targetIndex--;
			}
		} else {
			// Different array (e.g., root vs subfolder): move between arrays
			// Remove from current location
			const rootIndex = this.tree.findIndex(n => n.id === dragNode.id);
			if (rootIndex !== -1) {
				this.tree.splice(rootIndex, 1);
			}
		}

		// Calculate insert position
		const insertIndex = mode === 'after' ? targetIndex + 1 : targetIndex;

		// Insert dragNode at the new position
		siblings.splice(insertIndex, 0, dragNode);

		// Update sort orders for this array
		for (let i = 0; i < siblings.length; i++) {
			siblings[i].sortOrder = i;
		}

		// Update the sortspec file for the folder that contains these siblings
		this.syncSiblingSortSpec(siblings);
	}

	/**
	 * Sync the sortspec for a folder's children after reordering
	 */
	private async syncSiblingSortSpec(siblings: TreeNode[]): Promise<void> {
		if (siblings.length === 0) return;

		// Find the folder path from the first sibling
		const firstNode = siblings[0];
		const folderPath = this.getParentPath(firstNode.path);

		// Build new sortspec content
		const vault = this.app.vault;
		const sortspecPath = folderPath === '/' ? '/sortspec.md' : `${folderPath}/sortspec.md`;

		// Get the actual folder to check which files exist
		const folder = folderPath === '/' ? vault.getRoot() : vault.getFolderByPath(folderPath);
		if (!folder) return;

		const existingNames = new Set(
			folder.children.map(c => c.name.endsWith('.md') ? c.name.slice(0, -3) : c.name)
		);

		const specLines: string[] = [];
		for (const node of siblings) {
			const name = node.name.endsWith('.md') ? node.name.slice(0, -3) : node.name;
			// Only include items that still exist in the folder
			if (existingNames.has(name)) {
				specLines.push(`    ${name}`);
			}
		}

		const newContent = `---\nsorting-spec: |\n    target-folder: .\n${specLines.join('\n')}\n---\n`;
		const existingFile = vault.getAbstractFileByPath(sortspecPath);

		try {
			if (existingFile instanceof TFile) {
				await vault.modify(existingFile, newContent);
			} else {
				await vault.create(sortspecPath, newContent);
			}

			// Reload the sortspec for this folder
			const folder = folderPath === '/' ? vault.getRoot() : vault.getFolderByPath(folderPath);
			if (folder) {
				this.sortOrdersByFolder.delete(folderPath);
				await this.loadSubfolderSortSpec(folder);
			}
		} catch (error) {
			console.error('更新sortspec失败:', error);
		}
	}

	private findParentArray(nodes: TreeNode[], targetId: string): TreeNode[] | null {
		for (const node of nodes) {
			if (node.children.some(child => child.id === targetId)) {
				return node.children;
			}
			const found = this.findParentArray(node.children, targetId);
			if (found) return found;
		}
		if (nodes.some(n => n.id === targetId)) {
			return nodes;
		}
		return null;
	}

	/**
	 * Find siblings (children array) for a given folder path
	 */
	findSiblingsByFolder(folderPath: string): TreeNode[] | null {
		if (folderPath === '/') {
			return this.tree;
		}
		return this.findSiblingsRecursive(this.tree, folderPath);
	}

	private findSiblingsRecursive(nodes: TreeNode[], folderPath: string): TreeNode[] | null {
		for (const node of nodes) {
			if (node.path === folderPath && node.type === 'folder') {
				return node.children.length > 0 ? node.children : null;
			}
			if (node.children.length > 0) {
				const found = this.findSiblingsRecursive(node.children, folderPath);
				if (found) return found;
			}
		}
		return null;
	}

	/**
	 * Refresh the tree view by re-reading sortspecs from disk
	 */
	async refreshView(): Promise<void> {
		try {
			this.sortOrdersByFolder.clear();
			await this.loadExistingSortOrder();

			// Reload all expanded folders' sortspecs
			for (const expandedPath of this.expandedPaths) {
				const folder = this.app.vault.getFolderByPath(expandedPath);
				if (folder) {
					await this.loadSubfolderSortSpec(folder);
				}
			}

			this.tree = this.buildNodeFromFolder(this.app.vault.getRoot());
			this.render();
		} catch (error) {
			console.error('Refresh view failed:', error);
		}
	}

	cleanup(): void {
		this.tree = [];
		this.clearDropIndicators();
	}
}