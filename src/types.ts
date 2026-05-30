import { TFile, TFolder } from 'obsidian';

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
	customIcon?: string;
}

export interface IconPickerCallbacks {
	onSelect: (icon: string) => void;
	onClear: () => void;
	onFileCreated?: (filePath: string) => void;
}

export interface SortSpec {
	sortingSpec: string[];
	customIcons: Record<string, string>;
}

export interface RecentIcon {
	icon: string;
	isCustom: boolean;
	timestamp: number;
}

export interface FileItem {
	name: string;
	type: 'folder' | 'file';
	path: string;
	folderNoteMd?: TFile;
}