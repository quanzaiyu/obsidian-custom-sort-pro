import { App, TFile, TFolder, Notice, parseYaml } from 'obsidian';
import type { SortSpec } from './types';

export class SortSpecManager {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	private getSortSpecPath(folderPath: string): string {
		// 处理根目录
		if (folderPath === '/' || folderPath === '' || folderPath === '//') {
			return 'sortspec.md';
		}

		// 清理路径：去掉开头的 /
		let normalized = folderPath;
		while (normalized.startsWith('/')) {
			normalized = normalized.substring(1);
		}

		// 不以 / 开头
		if (!normalized) {
			return 'sortspec.md';
		}

		return `${normalized}/sortspec.md`;
	}

	async load(folderPath: string): Promise<SortSpec | null> {
		// 规范化路径 - 去掉开头的 /
		let path = folderPath;
		while (path.startsWith('/')) {
			path = path.substring(1);
		}

		const sortspecPath = this.getSortSpecPath(path);
		const file = this.app.vault.getAbstractFileByPath(sortspecPath);

		if (!(file instanceof TFile)) {
			return null;
		}

		try {
			const content = await this.app.vault.read(file);
			const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

			if (!frontmatterMatch) {
				return null;
			}

			const frontmatter = parseYaml(frontmatterMatch[1]);

			// 解析 sorting-spec
			let sortingSpec: string[] = [];
			const specRaw = frontmatter?.['sorting-spec'];
			if (Array.isArray(specRaw)) {
				sortingSpec = specRaw.filter((item: any) => typeof item === 'string');
			}

			// 解析 custom-icons
			let customIcons: Record<string, string> = {};
			const iconsRaw = frontmatter?.['custom-icons'];
			if (iconsRaw && typeof iconsRaw === 'object' && !Array.isArray(iconsRaw)) {
				customIcons = iconsRaw as Record<string, string>;
			}

			return { sortingSpec, customIcons };
		} catch (error) {
			console.error('读取sortspec失败:', error);
			return null;
		}
	}

	async save(folderPath: string, sortingSpec: string[], customIcons: Record<string, string>): Promise<void> {
		// 规范化路径 - 去掉开头的 /
		let path = folderPath;
		while (path.startsWith('/')) {
			path = path.substring(1);
		}

		const sortspecPath = this.getSortSpecPath(path);
		let file = this.app.vault.getAbstractFileByPath(sortspecPath);

		// 如果文件已存在，直接更新
		if (file instanceof TFile) {
			await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
				frontmatter['sorting-spec'] = sortingSpec;
				if (Object.keys(customIcons).length > 0) {
					frontmatter['custom-icons'] = customIcons;
				} else {
					delete frontmatter['custom-icons'];
				}
			});
			return;
		}

		// 如果文件不存在，创建它
		try {
			const initialContent = `---\nsorting-spec:\n  - ${sortingSpec.join('\n  - ')}\n---\n`;
			await this.app.vault.create(sortspecPath, initialContent);
			file = this.app.vault.getAbstractFileByPath(sortspecPath);
			if (file instanceof TFile) {
				await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
					frontmatter['sorting-spec'] = sortingSpec;
					if (Object.keys(customIcons).length > 0) {
						frontmatter['custom-icons'] = customIcons;
					}
				});
			}
		} catch (error) {
			console.error('创建sortspec失败:', error);
			new Notice('无法创建sortspec.md: ' + (error as Error).message);
		}
	}

	async createIfNotExists(folderPath: string): Promise<void> {
		const sortspecPath = this.getSortSpecPath(folderPath);
		const existingFile = this.app.vault.getAbstractFileByPath(sortspecPath);

		if (existingFile instanceof TFile) {
			return;
		}

		try {
			await this.app.vault.create(sortspecPath, '---\nsorting-spec: []\n---');
		} catch (error) {
			console.error('创建sortspec失败:', error);
		}
	}

	async removeItem(folderPath: string, itemName: string): Promise<void> {
		const spec = await this.load(folderPath);
		if (!spec) return;

		const cleanName = itemName.endsWith('.md') ? itemName.slice(0, -3) : itemName;

		const newSortingSpec = spec.sortingSpec.filter(name => {
			const n = name.endsWith('.md') ? name.slice(0, -3) : name;
			return n !== cleanName;
		});

		await this.save(folderPath, newSortingSpec, spec.customIcons);
	}

	async addItem(folderPath: string, itemName: string, position?: number): Promise<void> {
		const spec = await this.load(folderPath);
		const cleanName = itemName.endsWith('.md') ? itemName.slice(0, -3) : itemName;

		let sortingSpec = spec?.sortingSpec || [];
		const existingIndex = sortingSpec.findIndex(name => {
			const n = name.endsWith('.md') ? name.slice(0, -3) : name;
			return n === cleanName;
		});

		if (existingIndex !== -1) {
			sortingSpec.splice(existingIndex, 1);
		}

		if (position !== undefined && position >= 0 && position <= sortingSpec.length) {
			sortingSpec.splice(position, 0, cleanName);
		} else {
			sortingSpec.push(cleanName);
		}

		await this.save(folderPath, sortingSpec, spec?.customIcons || {});
	}

	async updateSortingSpec(folderPath: string, items: string[]): Promise<void> {
		const spec = await this.load(folderPath);
		await this.save(folderPath, items, spec?.customIcons || {});
	}

	clearCache(): void {
		// 不再使用缓存，每次都重新读取
	}

	getAbsolutePath(path: string): string {
		const adapter = this.app.vault.adapter;
		return adapter.getFullPath(path);
	}
}