import { ItemView, WorkspaceLeaf } from 'obsidian';
import { DragDropTree } from './DragDropTree';
import './styles.css';
import type CustomSortV2Plugin from './main';

export const MY_SORT_VIEW_TYPE = 'my-custom-sort-view';

export class MySortView extends ItemView {
	private dragDropTree: DragDropTree | null = null;
	private treeContainer: HTMLElement | null = null;
	private plugin: CustomSortV2Plugin;

	constructor(leaf: WorkspaceLeaf, plugin: CustomSortV2Plugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return MY_SORT_VIEW_TYPE;
	}

	getDisplayText(): string {
		return '自定义排序';
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl;
		container.empty();

		this.treeContainer = container.createDiv('sort-gui-tree-container');

		this.dragDropTree = new DragDropTree(this.app, this.treeContainer, this.plugin);
		await this.dragDropTree.init();
	}

	async onClose(): Promise<void> {
		if (this.dragDropTree) {
			// 关闭前保存展开状态
			this.dragDropTree.saveState();
			this.dragDropTree.cleanup();
			this.dragDropTree = null;
		}
	}
}