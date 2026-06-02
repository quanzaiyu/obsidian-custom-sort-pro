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
		// 移除已存在的相同图标（保持 isCustom 字段一致）
		this.recentIcons = this.recentIcons.filter(item => item.icon !== icon);

		// 添加到最前面
		this.recentIcons.unshift({
			icon,
			isCustom,
			timestamp: Date.now()
		});

		// 限制数量
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