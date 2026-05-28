import { App, Modal, TFile, TFolder } from 'obsidian';
import type { IconPickerCallbacks, RecentIcon } from './types';
import { RecentIconsManager } from './RecentIconsManager';

interface EmojiItem {
	category: string;
	icon: string;
	name: string;
}

export class IconPickerModal extends Modal {
	private callbacks: IconPickerCallbacks;
	private recentManager: RecentIconsManager;
	private currentTab: 'recent' | 'emoji' | 'custom' = 'emoji';
	private customIcons: { name: string; path: string }[] = [];
	private contentArea!: HTMLElement;
	private tabsContainer!: HTMLElement;

	private emojiItems: EmojiItem[] = [
		{ category: '文件', icon: '📄', name: '文件' },
		{ category: '文件', icon: '📝', name: '笔记' },
		{ category: '文件', icon: '📃', name: '文档' },
		{ category: '文件', icon: '📋', name: '剪贴板' },
		{ category: '文件', icon: '📑', name: '书签' },
		{ category: '文件', icon: '📰', name: '报纸' },
		{ category: '文件', icon: '📖', name: '书' },
		{ category: '文件夹', icon: '📁', name: '文件夹' },
		{ category: '文件夹', icon: '📂', name: '打开的文件夹' },
		{ category: '文件夹', icon: '🗂️', name: '卡片索引' },
		{ category: '文件夹', icon: '🗃️', name: '文件柜' },
		{ category: '文件夹', icon: '📭', name: '收件箱' },
		{ category: '箭头', icon: '▶', name: '播放' },
		{ category: '箭头', icon: '🔽', name: '向下指' },
		{ category: '箭头', icon: '🔼', name: '向上指' },
		{ category: '箭头', icon: '➡', name: '右箭头' },
		{ category: '箭头', icon: '🔀', name: '双向箭头' },
		{ category: '箭头', icon: '🔁', name: '循环箭头' },
		{ category: '状态', icon: '✅', name: '勾选' },
		{ category: '状态', icon: '❌', name: '叉' },
		{ category: '状态', icon: '⭐', name: '星' },
		{ category: '状态', icon: '✨', name: '闪星' },
		{ category: '状态', icon: '🎯', name: '靶心' },
		{ category: '状态', icon: '❓', name: '问号' },
		{ category: '状态', icon: '⚠️', name: '警告' },
		{ category: '状态', icon: '💯', name: '百分号' },
		{ category: '时间', icon: '📅', name: '日历' },
		{ category: '时间', icon: '📆', name: '旋转日历' },
		{ category: '时间', icon: '⏰', name: '闹钟' },
		{ category: '时间', icon: '⏱️', name: '秒表' },
		{ category: '工具', icon: '🔍', name: '放大镜' },
		{ category: '工具', icon: '🔑', name: '钥匙' },
		{ category: '工具', icon: '⚙️', name: '齿轮' },
		{ category: '工具', icon: '🔧', name: '扳手' },
		{ category: '工具', icon: '🔨', name: '锤子' },
		{ category: '工具', icon: '🛠️', name: '工具' },
		{ category: '位置', icon: '🏠', name: '房子' },
		{ category: '位置', icon: '🏢', name: '办公楼' },
		{ category: '位置', icon: '🏥', name: '医院' },
		{ category: '位置', icon: '🏦', name: '银行' },
		{ category: '位置', icon: '🏫', name: '学校' },
		{ category: '学习', icon: '🧠', name: '大脑' },
		{ category: '学习', icon: '💡', name: '灯泡' },
		{ category: '学习', icon: '🎓', name: '毕业帽' },
		{ category: '学习', icon: '📚', name: '书籍' },
		{ category: '学习', icon: '🔬', name: '显微镜' },
		{ category: '学习', icon: '🧪', name: '试管' },
		{ category: '自然', icon: '🌟', name: '五角星' },
		{ category: '自然', icon: '🌙', name: '月亮' },
		{ category: '自然', icon: '☀️', name: '太阳' },
		{ category: '自然', icon: '🌈', name: '彩虹' },
		{ category: '自然', icon: '🌺', name: '芙蓉花' },
		{ category: '自然', icon: '🌸', name: '樱花' },
		{ category: '心情', icon: '❤️', name: '红心' },
		{ category: '心情', icon: '💜', name: '紫心' },
		{ category: '心情', icon: '💙', name: '蓝心' },
		{ category: '心情', icon: '💚', name: '绿心' },
		{ category: '心情', icon: '🧡', name: '橙心' },
		{ category: '心情', icon: '💛', name: '黄心' },
		{ category: '心情', icon: '🩷', name: '粉心' },
		{ category: '心情', icon: '🖤', name: '黑心' },
		{ category: '食物', icon: '☕', name: '咖啡' },
		{ category: '食物', icon: '🍵', name: '茶杯' },
		{ category: '食物', icon: '🍕', name: '披萨' },
		{ category: '食物', icon: '🍔', name: '汉堡' },
		{ category: '食物', icon: '🍜', name: '面条' },
		{ category: '食物', icon: '🍣', name: '寿司' },
		{ category: '食物', icon: '🍰', name: '蛋糕' },
		{ category: '交通', icon: '✈️', name: '飞机' },
		{ category: '交通', icon: '🚗', name: '汽车' },
		{ category: '交通', icon: '🚕', name: '出租车' },
		{ category: '交通', icon: '🚲', name: '自行车' },
		{ category: '交通', icon: '🚀', name: '火箭' },
		{ category: '物品', icon: '💼', name: '公文包' },
		{ category: '物品', icon: '📌', name: '图钉' },
		{ category: '物品', icon: '🏆', name: '奖杯' },
		{ category: '物品', icon: '🎁', name: '礼物' },
		{ category: '物品', icon: '👑', name: '皇冠' },
		{ category: '人物', icon: '👤', name: '人' },
		{ category: '人物', icon: '👥', name: '两个人' },
		{ category: '人物', icon: '👨', name: '男人' },
		{ category: '人物', icon: '👩', name: '女人' },
		{ category: '动物', icon: '🐱', name: '猫' },
		{ category: '动物', icon: '🐶', name: '狗' },
		{ category: '动物', icon: '🐼', name: '熊猫' },
		{ category: '动物', icon: '🦊', name: '狐狸' },
		{ category: '动物', icon: '🐰', name: '兔子' },
		{ category: '动物', icon: '🦋', name: '蝴蝶' },
		{ category: '动物', icon: '🐝', name: '蜜蜂' },
		{ category: '动物', icon: '🐢', name: '乌龟' },
	];

	constructor(app: App, callbacks: IconPickerCallbacks) {
		super(app);
		this.callbacks = callbacks;
		this.recentManager = new RecentIconsManager();
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.classList.add('icon-picker-modal');

		const header = contentEl.createDiv('icon-picker-header');
		header.createEl('h3', { text: '选择图标' });

		this.tabsContainer = contentEl.createDiv('icon-picker-tabs');
		this.createTabs();

		const hint = contentEl.createDiv('icon-picker-hint');
		hint.textContent = '点击图标选择 | 按 Tab 切换标签页 | Esc 关闭';

		this.contentArea = contentEl.createDiv('icon-picker-content');

		const clearBtn = contentEl.createDiv('icon-picker-clear');
		clearBtn.createEl('button', {
			text: '清除图标',
			cls: 'icon-picker-clear-btn'
		}).addEventListener('click', () => {
			this.callbacks.onClear();
			this.close();
		});

		contentEl.addEventListener('keydown', (e) => this.handleKeydown(e));

		await this.loadAndRender();
	}

	private createTabs(): void {
		const tabs = [
			{ id: 'recent', label: '最近使用' },
			{ id: 'emoji', label: '系统图标' },
			{ id: 'custom', label: '自定义图标' }
		];

		tabs.forEach(tab => {
			const btn = this.tabsContainer.createEl('button', {
				text: tab.label,
				cls: this.currentTab === tab.id ? 'active' : ''
			});
			btn.addEventListener('click', () => this.switchTab(tab.id as any));
		});
	}

	private switchTab(tab: 'recent' | 'emoji' | 'custom'): void {
		this.currentTab = tab;
		this.tabsContainer.querySelectorAll('button').forEach(btn => {
			btn.classList.toggle('active', btn.textContent === this.getTabLabel(tab));
		});
		this.loadAndRender();
	}

	private getTabLabel(tab: string): string {
		const labels: Record<string, string> = {
			recent: '最近使用',
			emoji: '系统图标',
			custom: '自定义图标'
		};
		return labels[tab] || tab;
	}

	private async loadAndRender(): Promise<void> {
		if (this.currentTab === 'custom') {
			await this.loadCustomIcons();
		}
		this.renderContent();
	}

	private handleKeydown(e: KeyboardEvent): void {
		if (e.key === 'Tab') {
			e.preventDefault();
			const tabs: ('recent' | 'emoji' | 'custom')[] = ['recent', 'emoji', 'custom'];
			const currentIndex = tabs.indexOf(this.currentTab);
			const nextIndex = (currentIndex + 1) % tabs.length;
			this.switchTab(tabs[nextIndex]);
		} else if (e.key === 'Escape') {
			this.close();
		}
	}

	private renderContent(): void {
		this.contentArea.empty();
		switch (this.currentTab) {
			case 'recent':
				this.renderRecentTab();
				break;
			case 'emoji':
				this.renderEmojiTab();
				break;
			case 'custom':
				this.renderCustomTab();
				break;
		}
	}

	private renderRecentTab(): void {
		const recentIcons = this.recentManager.getRecent(20);
		const grid = this.contentArea.createDiv('icon-picker-grid');

		if (recentIcons.length === 0) {
			grid.createDiv('icon-picker-empty', (el) => {
					el.textContent = '暂无最近使用的图标';
				});
			return;
		}

		const itemsContainer = grid.createDiv('icon-picker-recent-grid');
		recentIcons.forEach(item => {
			const itemEl = itemsContainer.createDiv('icon-picker-item');
			if (/\.(svg|png|jpg|jpeg|webp|gif)$/i.test(item.icon)) {
				const file = this.app.vault.getAbstractFileByPath(item.icon);
				if (file instanceof TFile) {
					itemEl.createEl('img', { attr: { src: this.app.vault.getResourcePath(file), alt: item.icon } });
				}
			} else {
				itemEl.textContent = item.icon;
			}
			itemEl.addEventListener('click', () => {
				this.callbacks.onSelect(item.icon);
				this.close();
			});
		});
	}

	private renderEmojiTab(): void {
		const searchInput = this.contentArea.createEl('input', {
			attr: { type: 'text', placeholder: '输入图标名称搜索...' },
			cls: 'icon-picker-search'
		});

		const grid = this.contentArea.createDiv('icon-picker-grid');

		const render = (filter: string = '') => {
			grid.empty();

			const grouped = new Map<string, EmojiItem[]>();
			for (const item of this.emojiItems) {
				const matches = !filter || item.name.toLowerCase().includes(filter.toLowerCase());
				if (matches) {
					if (!grouped.has(item.category)) {
						grouped.set(item.category, []);
					}
					grouped.get(item.category)!.push(item);
				}
			}

			for (const [category, items] of grouped) {
				const section = grid.createDiv('icon-picker-category');
				const titleEl = section.createDiv('icon-picker-category-title');
				titleEl.textContent = category;

				const itemsContainer = section.createDiv('icon-picker-category-items');
				items.forEach(item => {
					const itemEl = itemsContainer.createDiv('icon-picker-item');
					itemEl.textContent = item.icon;
					itemEl.title = item.name;
					itemEl.addEventListener('click', () => {
						this.recentManager.add(item.icon, false);
						this.callbacks.onSelect(item.icon);
						this.close();
					});
				});
			}

			if (grouped.size === 0 && filter) {
				grid.createDiv('icon-picker-empty', (el) => {
					el.textContent = `未找到包含"${filter}"的图标`;
				});
			}
		};

		render();
		searchInput.addEventListener('input', () => render(searchInput.value.trim()));
	}

	private async loadCustomIcons(): Promise<void> {
		this.customIcons = [];
		const scanFolder = async (folder: TFolder) => {
			for (const child of folder.children) {
				if (child instanceof TFile) {
					const ext = child.extension.toLowerCase();
					if (['svg', 'png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) {
						this.customIcons.push({ name: child.name, path: child.path });
					}
				} else if (child instanceof TFolder) {
					await scanFolder(child);
				}
			}
		};

		const iconFolder = this.app.vault.getFolderByPath('icon');
		if (iconFolder) await scanFolder(iconFolder);

		const obsidianIcons = this.app.vault.getFolderByPath('.obsidian/icons');
		if (obsidianIcons) await scanFolder(obsidianIcons);
	}

	private renderCustomTab(): void {
		const searchInput = this.contentArea.createEl('input', {
			attr: { type: 'text', placeholder: '输入文件名搜索...' },
			cls: 'icon-picker-search'
		});

		const grid = this.contentArea.createDiv('icon-picker-grid');
		const customGrid = grid.createDiv('icon-picker-custom-grid');

		const render = (filter: string = '') => {
			customGrid.empty();

			const filtered = filter
				? this.customIcons.filter(i => i.name.toLowerCase().includes(filter.toLowerCase()))
				: this.customIcons;

			if (filtered.length === 0) {
				customGrid.createDiv('icon-picker-empty', (el) => {
					el.textContent = filter ? '未找到匹配的文件' : '未找到自定义图标。请在 vault 中创建 icon 文件夹并放入图片文件';
				});
				return;
			}

			filtered.forEach(icon => {
				const item = customGrid.createDiv('icon-picker-item icon-picker-custom');
				const file = this.app.vault.getAbstractFileByPath(icon.path);
				const imgSrc = file instanceof TFile ? this.app.vault.getResourcePath(file) : icon.path;
				item.createEl('img', { attr: { src: imgSrc, alt: icon.name } });
				item.title = icon.name;
				item.addEventListener('click', () => {
					this.recentManager.add(icon.path, true);
					this.callbacks.onSelect(icon.path);
					this.close();
				});
			});
		};

		render();
		searchInput.addEventListener('input', () => render(searchInput.value.trim()));
	}

	onClose(): void {
		this.contentEl.empty();
	}
}