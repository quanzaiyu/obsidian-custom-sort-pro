import { App, TFile, Notice, parseYaml } from 'obsidian';
import type { SortSpec } from './types';

export class SortSpecManager {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	private getSortSpecPath(folderPath: string): string {
		return folderPath === '/' || folderPath === '' ? '/sortspec.md' : `${folderPath}/sortspec.md`;
	}

	async load(folderPath: string): Promise<SortSpec | null> {
		const sortspecPath = this.getSortSpecPath(folderPath);
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

			// 使用 Obsidian 的 parseYaml 解析 frontmatter
			const frontmatter = parseYaml(frontmatterMatch[1]);
			const sortingSpec = Array.isArray(frontmatter?.['sorting-spec'])
				? frontmatter['sorting-spec'].filter((item: any) => typeof item === 'string')
				: [];
			const customIcons = typeof frontmatter?.['custom-icons'] === 'object'
				? frontmatter['custom-icons']
				: {};

			return { sortingSpec, customIcons };
		} catch (error) {
			console.error('读取sortspec失败:', error);
			return null;
		}
	}

	async save(folderPath: string, sortingSpec: string[], customIcons: Record<string, string>): Promise<void> {
		const sortspecPath = this.getSortSpecPath(folderPath);
		let file = this.app.vault.getAbstractFileByPath(sortspecPath);

		if (!(file instanceof TFile)) {
			await this.createIfNotExists(folderPath);
			file = this.app.vault.getAbstractFileByPath(sortspecPath);
		}

		if (!(file instanceof TFile)) {
			new Notice('无法创建sortspec.md');
			return;
		}

		await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
			frontmatter['sorting-spec'] = sortingSpec;
			if (Object.keys(customIcons).length > 0) {
				frontmatter['custom-icons'] = customIcons;
			} else {
				delete frontmatter['custom-icons'];
			}
		});
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
}