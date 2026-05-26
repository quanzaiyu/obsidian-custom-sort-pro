import { ItemView, WorkspaceLeaf, ButtonComponent, Notice, TFile } from 'obsidian';
import { DragDropTree } from './DragDropTree';
import './styles.css';

export const SORT_GUI_VIEW_TYPE = 'custom-sort-drag-drop-view';

export class SortGuiView extends ItemView {
	private dragDropTree: DragDropTree | null = null;
	private currentFolderPath: string = '/';
	private sortSpecFilePath: string | null = null;
	private treeContainer: HTMLElement | null = null;
	private pluginRef: any = null;

	constructor(leaf: WorkspaceLeaf, plugin?: any) {
		super(leaf);
		this.pluginRef = plugin;
	}

	getViewType(): string {
		return SORT_GUI_VIEW_TYPE;
	}

	getDisplayText(): string {
		return '自定义排序';
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl;
		container.empty();

		// Header
		const headerEl = container.createDiv('sort-gui-header');
		headerEl.innerHTML = `
			<div class="sort-gui-title">
				<span class="sort-gui-icon">🎯</span>
				<h2>自定义排序</h2>
			</div>
		`;

		// Instructions
		const instructionEl = container.createDiv('sort-gui-instructions');
		instructionEl.innerHTML = `
			<p>拖拽项目调整顺序。拖拽到文件夹上可移入该文件夹。</p>
			<p class="sort-gui-hint">拖拽到上方空白处：插入上方 | 拖拽到下方空白处：插入下方 | 拖拽到文件夹中心：移入文件夹</p>
		`;

		// Tree container
		this.treeContainer = container.createDiv('sort-gui-tree-container');

		// Find and load existing sortspec.md
		await this.findSortSpecFile();

		// Initialize drag-drop tree
		this.dragDropTree = new DragDropTree(this.app, this.treeContainer, this.sortSpecFilePath);
		await this.dragDropTree.init();

		// Buttons container
		const buttonsContainer = container.createDiv('sort-gui-buttons');

		// Left button group
		const leftGroup = buttonsContainer.createDiv('button-group');

		// Refresh button
		const refreshBtn = new ButtonComponent(leftGroup);
		refreshBtn.setIcon('refresh');
		refreshBtn.setButtonText('刷新目录');
		refreshBtn.onClick(async () => {
			await this.reloadTree();
			new Notice('目录已刷新');
		});

		// Right button group
		const rightGroup = buttonsContainer.createDiv('button-group');

		// Reset button
		const resetBtn = new ButtonComponent(rightGroup);
		resetBtn.setIcon('undo');
		resetBtn.setButtonText('恢复默认');
		resetBtn.onClick(async () => {
			await this.resetSort();
		});

		// Apply button
		const applyBtn = new ButtonComponent(rightGroup);
		applyBtn.setIcon('check');
		applyBtn.setButtonText('应用排序');
		applyBtn.setCta();
		applyBtn.onClick(async () => {
			await this.applySort();
		});
	}

	private async findSortSpecFile(): Promise<void> {
		const folder = this.currentFolderPath === '/'
			? this.app.vault.getRoot()
			: this.app.vault.getFolderByPath(this.currentFolderPath);

		if (folder) {
			const sortspecFile = folder.children.find(
				(f) => f.name === 'sortspec.md' || f.name === 'sortspec.md.md'
			);

			if (sortspecFile instanceof TFile) {
				this.sortSpecFilePath = sortspecFile.path;
			} else {
				this.sortSpecFilePath = null;
			}
		}
	}

	/**
	 * "应用排序"：将 sortspec 中的排序应用到 Obsidian 内置文件列表
	 * 注意：拖拽排序后已经更新了 sortspec，这里只需刷新 Obsidian
	 */
	private async applySort(): Promise<void> {
		try {
			new Notice('正在应用排序...');

			// 等待文件系统同步
			await new Promise(resolve => setTimeout(resolve, 100));

			// 刷新文件浏览器
			this.refreshFileExplorer();

			// 强制刷新插件的排序规格缓存
			if (this.pluginRef && typeof this.pluginRef.readAndParseSortingSpec === 'function') {
				this.pluginRef.readAndParseSortingSpec();
			}

			// 启用自定义排序
			if (this.pluginRef && typeof this.pluginRef.switchPluginStateTo === 'function') {
				this.pluginRef.switchPluginStateTo(true);
			}

			// 再次刷新文件浏览器
			this.refreshFileExplorer();

			new Notice('排序已应用！');
		} catch (error) {
			console.error('Failed to apply sorting:', error);
			new Notice('应用失败：' + (error as Error).message);
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

	private async resetSort(): Promise<void> {
		try {
			if (this.sortSpecFilePath) {
				const file = this.app.vault.getAbstractFileByPath(this.sortSpecFilePath);
				if (file instanceof TFile) {
					await this.app.vault.delete(file);
					new Notice('已恢复默认排序');
				}
			}
			this.sortSpecFilePath = null;

			// 等待文件系统同步
			await new Promise(resolve => setTimeout(resolve, 100));

			// 禁用自定义排序
			if (this.pluginRef && typeof this.pluginRef.switchPluginStateTo === 'function') {
				this.pluginRef.switchPluginStateTo(false);
			}

			// 刷新文件浏览器
			this.refreshFileExplorer();

			// 重新加载树
			this.dragDropTree?.setSortSpecFile(null);
			await this.dragDropTree?.reload();
		} catch (error) {
			console.error('Failed to reset:', error);
			new Notice('重置失败：' + (error as Error).message);
		}
	}

	/**
	 * "刷新目录"：重新从 sortspec 读取排序并更新视图
	 */
	private async reloadTree(): Promise<void> {
		// 1. 重新查找 sortspec 文件
		await this.findSortSpecFile();

		// 2. 重新加载 DragDropTree（从磁盘读取所有 sortspec）
		if (this.dragDropTree) {
			this.dragDropTree.setSortSpecFile(this.sortSpecFilePath);
			await this.dragDropTree.reload();
		}

		// 3. 刷新文件浏览器
		this.refreshFileExplorer();
	}

	async onClose(): Promise<void> {
		if (this.dragDropTree) {
			this.dragDropTree.cleanup();
		}
	}
}