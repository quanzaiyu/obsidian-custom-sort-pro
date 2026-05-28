import type { RecentIcon } from './types';

const STORAGE_KEY = 'custom-sort-recent-icons';
const MAX_RECENT_ICONS = 20;

export class RecentIconsManager {
	private recentIcons: RecentIcon[] = [];

	constructor() {
		this.load();
	}

	private load(): void {
		try {
			const stored = localStorage.getItem(STORAGE_KEY);
			if (stored) {
				this.recentIcons = JSON.parse(stored);
			}
		} catch (error) {
			console.error('加载最近图标失败:', error);
			this.recentIcons = [];
		}
	}

	private save(): void {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(this.recentIcons));
		} catch (error) {
			console.error('保存最近图标失败:', error);
		}
	}

	add(icon: string, isCustom: boolean): void {
		const existingIndex = this.recentIcons.findIndex(item => item.icon === icon);

		if (existingIndex !== -1) {
			this.recentIcons.splice(existingIndex, 1);
		}

		this.recentIcons.unshift({
			icon,
			isCustom,
			timestamp: Date.now()
		});

		if (this.recentIcons.length > MAX_RECENT_ICONS) {
			this.recentIcons = this.recentIcons.slice(0, MAX_RECENT_ICONS);
		}

		this.save();
	}

	getRecent(count: number = 10): RecentIcon[] {
		return this.recentIcons.slice(0, count);
	}

	clear(): void {
		this.recentIcons = [];
		this.save();
	}
}