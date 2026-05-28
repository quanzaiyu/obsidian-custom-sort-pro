import { Plugin, Notice, WorkspaceLeaf, Platform } from 'obsidian';
import { MySortView, MY_SORT_VIEW_TYPE } from './MySortView';

export default class CustomSortV2Plugin extends Plugin {
	private ribbonIconEl: HTMLElement | null = null;

	async onload(): Promise<void> {
		console.log('Custom Sort V2 Plugin loaded');

		this.registerView(MY_SORT_VIEW_TYPE, (leaf) => new MySortView(leaf));

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
		const leaves = this.app.workspace.getLeavesOfType(MY_SORT_VIEW_TYPE);
		for (const leaf of leaves) {
			await leaf.detach();
		}
	}
}