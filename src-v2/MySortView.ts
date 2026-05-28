import { ItemView, WorkspaceLeaf } from 'obsidian';
import { DragDropTree } from './DragDropTree';
import './styles.css';

export const MY_SORT_VIEW_TYPE = 'my-custom-sort-view';

export class MySortView extends ItemView {
	private dragDropTree: DragDropTree | null = null;
	private treeContainer: HTMLElement | null = null;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
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

		this.dragDropTree = new DragDropTree(this.app, this.treeContainer);
		await this.dragDropTree.init();
	}

	async onClose(): Promise<void> {
		if (this.dragDropTree) {
			this.dragDropTree.cleanup();
			this.dragDropTree = null;
		}
	}
}