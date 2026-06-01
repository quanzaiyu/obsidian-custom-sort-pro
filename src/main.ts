import { Plugin, Notice, WorkspaceLeaf, Platform } from 'obsidian';
import { MySortView, MY_SORT_VIEW_TYPE } from './MySortView';

const EXPANDED_PATHS_KEY = 'expanded-paths';

export default class CustomSortV2Plugin extends Plugin {
	private ribbonIconEl: HTMLElement | null = null;
	private expandedPaths: Set<string> = new Set();

	async onload(): Promise<void> {
		// 加载保存的展开状态
		await this.loadExpandedPaths();

		this.registerView(MY_SORT_VIEW_TYPE, (leaf) => new MySortView(leaf, this));

		// 添加 Ribbon 图标（仅桌面端）
		if (Platform.isDesktop) {
			this.ribbonIconEl = this.addRibbonIcon('list-ordered', '打开自定义排序视图', async () => {
				await this.openView();
			});
		}

		this.addCommand({
			id: 'open-custom-sort-view-v2',
			name: '打开自定义排序视图',
			callback: async () => {
				await this.openView();
			}
		});

		this.addCommand({
			id: 'toggle-custom-sort-view-v2',
			name: '切换自定义排序视图',
			callback: async () => {
				const existing = this.app.workspace.getLeavesOfType(MY_SORT_VIEW_TYPE)[0];
				if (existing) {
					await this.app.workspace.revealLeaf(existing);
				} else {
					await this.openView();
				}
			}
		});
	}

	private async loadExpandedPaths(): Promise<void> {
		try {
			const data = await this.loadData();
			if (data && data[EXPANDED_PATHS_KEY] && Array.isArray(data[EXPANDED_PATHS_KEY])) {
				this.expandedPaths = new Set(data[EXPANDED_PATHS_KEY]);
			}
		} catch (error) {
			console.error('加载展开状态失败:', error);
		}
	}

	async saveExpandedPaths(): Promise<void> {
		try {
			const data = { [EXPANDED_PATHS_KEY]: Array.from(this.expandedPaths) };
			await this.saveData(data);
		} catch (error) {
			console.error('保存展开状态失败:', error);
		}
	}

	getExpandedPaths(): Set<string> {
		return this.expandedPaths;
	}

	updateExpandedPath(path: string, expanded: boolean): void {
		if (expanded) {
			this.expandedPaths.add(path);
		} else {
			this.expandedPaths.delete(path);
		}
		// 防抖保存
		this.debouncedSave();
	}

	private saveTimeout: number | null = null;
	private debouncedSave(): void {
		if (this.saveTimeout) {
			clearTimeout(this.saveTimeout);
		}
		this.saveTimeout = window.setTimeout(() => {
			this.saveExpandedPaths();
			this.saveTimeout = null;
		}, 500);
	}

	private async openView(): Promise<void> {
		let leaf: WorkspaceLeaf | undefined = this.app.workspace.getLeavesOfType(MY_SORT_VIEW_TYPE)[0];

		if (!leaf) {
			leaf = this.app.workspace.getLeaf(true);
			if (leaf) {
				await leaf.setViewState({ type: MY_SORT_VIEW_TYPE });
			}
		}

		if (leaf) {
			await this.app.workspace.revealLeaf(leaf);
		}
	}

	async onunload(): Promise<void> {
		// 关闭前保存状态
		await this.saveExpandedPaths();

		const leaves = this.app.workspace.getLeavesOfType(MY_SORT_VIEW_TYPE);
		for (const leaf of leaves) {
			await leaf.detach();
		}
	}
}