import { App, Modal, TFile, TFolder } from 'obsidian';
import type { IconPickerCallbacks, RecentIcon } from './types';
import { RecentIconsManager } from './RecentIconsManager';

interface EmojiItem {
	category: string;
	icon: string;
	name: string;
	nameEn: string;
}

export class IconPickerModal extends Modal {
	private callbacks: IconPickerCallbacks;
	private recentManager: RecentIconsManager;
	private currentTab: 'recent' | 'emoji' | 'custom' = 'recent';
	private customIcons: { name: string; path: string }[] = [];
	private contentArea!: HTMLElement;
	private tabsContainer!: HTMLElement;
	private emojiNameMap: Map<string, string> = new Map();

	private emojiItems: EmojiItem[] = [
		{ category: '文件', icon: '📄', name: '文件', nameEn: 'File' },
		{ category: '文件', icon: '📝', name: '笔记', nameEn: 'Note' },
		{ category: '文件', icon: '📃', name: '文档', nameEn: 'Document' },
		{ category: '文件', icon: '📋', name: '剪贴板', nameEn: 'Clipboard' },
		{ category: '文件', icon: '📑', name: '书签', nameEn: 'Bookmark' },
		{ category: '文件', icon: '📰', name: '报纸', nameEn: 'Newspaper' },
		{ category: '文件', icon: '📖', name: '书', nameEn: 'Book' },
		{ category: '文件夹', icon: '📁', name: '文件夹', nameEn: 'Folder' },
		{ category: '文件夹', icon: '📂', name: '打开的文件夹', nameEn: 'Open Folder' },
		{ category: '文件夹', icon: '🗂️', name: '卡片索引', nameEn: 'Card Index' },
		{ category: '文件夹', icon: '🗃️', name: '文件柜', nameEn: 'File Cabinet' },
		{ category: '文件夹', icon: '📭', name: '收件箱', nameEn: 'Inbox' },
		{ category: '箭头', icon: '▶', name: '播放', nameEn: 'Play' },
		{ category: '箭头', icon: '🔽', name: '向下指', nameEn: 'Down' },
		{ category: '箭头', icon: '🔼', name: '向上指', nameEn: 'Up' },
		{ category: '箭头', icon: '➡', name: '右箭头', nameEn: 'Right' },
		{ category: '箭头', icon: '🔀', name: '双向箭头', nameEn: 'Shuffle' },
		{ category: '箭头', icon: '🔁', name: '循环箭头', nameEn: 'Repeat' },
		{ category: '状态', icon: '✅', name: '勾选', nameEn: 'Check' },
		{ category: '状态', icon: '❌', name: '叉', nameEn: 'Cross' },
		{ category: '状态', icon: '⭐', name: '星', nameEn: 'Star' },
		{ category: '状态', icon: '✨', name: '闪星', nameEn: 'Sparkles' },
		{ category: '状态', icon: '🎯', name: '靶心', nameEn: 'Target' },
		{ category: '状态', icon: '❓', name: '问号', nameEn: 'Question' },
		{ category: '状态', icon: '⚠️', name: '警告', nameEn: 'Warning' },
		{ category: '状态', icon: '💯', name: '百分号', nameEn: 'Hundred' },
		{ category: '时间', icon: '📅', name: '日历', nameEn: 'Calendar' },
		{ category: '时间', icon: '📆', name: '旋转日历', nameEn: 'Tear-off Calendar' },
		{ category: '时间', icon: '⏰', name: '闹钟', nameEn: 'Alarm' },
		{ category: '时间', icon: '⏱️', name: '秒表', nameEn: 'Stopwatch' },
		{ category: '工具', icon: '🔍', name: '放大镜', nameEn: 'Magnifying Glass' },
		{ category: '工具', icon: '🔑', name: '钥匙', nameEn: 'Key' },
		{ category: '工具', icon: '⚙️', name: '齿轮', nameEn: 'Gear' },
		{ category: '工具', icon: '🔧', name: '扳手', nameEn: 'Wrench' },
		{ category: '工具', icon: '🔨', name: '锤子', nameEn: 'Hammer' },
		{ category: '工具', icon: '🛠️', name: '工具', nameEn: 'Hammer & Wrench' },
		{ category: '位置', icon: '🏠', name: '房子', nameEn: 'House' },
		{ category: '位置', icon: '🏢', name: '办公楼', nameEn: 'Office' },
		{ category: '位置', icon: '🏥', name: '医院', nameEn: 'Hospital' },
		{ category: '位置', icon: '🏦', name: '银行', nameEn: 'Bank' },
		{ category: '位置', icon: '🏫', name: '学校', nameEn: 'School' },
		{ category: '学习', icon: '🧠', name: '大脑', nameEn: 'Brain' },
		{ category: '学习', icon: '💡', name: '灯泡', nameEn: 'Idea' },
		{ category: '学习', icon: '🎓', name: '毕业帽', nameEn: 'Graduation' },
		{ category: '学习', icon: '📚', name: '书籍', nameEn: 'Books' },
		{ category: '学习', icon: '🔬', name: '显微镜', nameEn: 'Microscope' },
		{ category: '学习', icon: '🧪', name: '试管', nameEn: 'Test Tube' },
		{ category: '自然', icon: '🌟', name: '五角星', nameEn: 'Star' },
		{ category: '自然', icon: '🌙', name: '月亮', nameEn: 'Moon' },
		{ category: '自然', icon: '☀️', name: '太阳', nameEn: 'Sun' },
		{ category: '自然', icon: '🌈', name: '彩虹', nameEn: 'Rainbow' },
		{ category: '自然', icon: '🌺', name: '芙蓉花', nameEn: 'Hibiscus' },
		{ category: '自然', icon: '🌸', name: '樱花', nameEn: 'Cherry Blossom' },
		{ category: '心情', icon: '❤️', name: '红心', nameEn: 'Red Heart' },
		{ category: '心情', icon: '💜', name: '紫心', nameEn: 'Purple Heart' },
		{ category: '心情', icon: '💙', name: '蓝心', nameEn: 'Blue Heart' },
		{ category: '心情', icon: '💚', name: '绿心', nameEn: 'Green Heart' },
		{ category: '心情', icon: '🧡', name: '橙心', nameEn: 'Orange Heart' },
		{ category: '心情', icon: '💛', name: '黄心', nameEn: 'Yellow Heart' },
		{ category: '心情', icon: '🩷', name: '粉心', nameEn: 'Pink Heart' },
		{ category: '心情', icon: '🖤', name: '黑心', nameEn: 'Black Heart' },
		{ category: '食物', icon: '☕', name: '咖啡', nameEn: 'Coffee' },
		{ category: '食物', icon: '🍵', name: '茶杯', nameEn: 'Tea' },
		{ category: '食物', icon: '🍕', name: '披萨', nameEn: 'Pizza' },
		{ category: '食物', icon: '🍔', name: '汉堡', nameEn: 'Burger' },
		{ category: '食物', icon: '🍜', name: '面条', nameEn: 'Noodle' },
		{ category: '食物', icon: '🍣', name: '寿司', nameEn: 'Sushi' },
		{ category: '食物', icon: '🍰', name: '蛋糕', nameEn: 'Cake' },
		{ category: '交通', icon: '✈️', name: '飞机', nameEn: 'Airplane' },
		{ category: '交通', icon: '🚗', name: '汽车', nameEn: 'Car' },
		{ category: '交通', icon: '🚕', name: '出租车', nameEn: 'Taxi' },
		{ category: '交通', icon: '🚲', name: '自行车', nameEn: 'Bicycle' },
		{ category: '交通', icon: '🚀', name: '火箭', nameEn: 'Rocket' },
		{ category: '物品', icon: '💼', name: '公文包', nameEn: 'Briefcase' },
		{ category: '物品', icon: '📌', name: '图钉', nameEn: 'Pushpin' },
		{ category: '物品', icon: '🏆', name: '奖杯', nameEn: 'Trophy' },
		{ category: '物品', icon: '🎁', name: '礼物', nameEn: 'Gift' },
		{ category: '物品', icon: '👑', name: '皇冠', nameEn: 'Crown' },
		{ category: '人物', icon: '👤', name: '人', nameEn: 'Person' },
		{ category: '人物', icon: '👥', name: '两个人', nameEn: 'People' },
		{ category: '人物', icon: '👨', name: '男人', nameEn: 'Man' },
		{ category: '人物', icon: '👩', name: '女人', nameEn: 'Woman' },
		{ category: '动物', icon: '🐱', name: '猫', nameEn: 'Cat' },
		{ category: '动物', icon: '🐶', name: '狗', nameEn: 'Dog' },
		{ category: '动物', icon: '🐼', name: '熊猫', nameEn: 'Panda' },
		{ category: '动物', icon: '🦊', name: '狐狸', nameEn: 'Fox' },
		{ category: '动物', icon: '🐰', name: '兔子', nameEn: 'Rabbit' },
		{ category: '动物', icon: '🦋', name: '蝴蝶', nameEn: 'Butterfly' },
		{ category: '动物', icon: '🐝', name: '蜜蜂', nameEn: 'Bee' },
		{ category: '动物', icon: '🐢', name: '乌龟', nameEn: 'Turtle' },
	];

	constructor(app: App, callbacks: IconPickerCallbacks) {
		super(app);
		this.callbacks = callbacks;
		this.recentManager = new RecentIconsManager();

		// 构建 emoji 名称映射
		this.emojiItems.forEach(item => {
			this.emojiNameMap.set(item.icon, item.name);
			// 同时存储英文名用于搜索
			this.emojiNameMap.set(item.nameEn.toLowerCase(), item.icon);
		});
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

		tabs.forEach((tab, index) => {
			const btn = this.tabsContainer.createEl('button', {
				text: tab.label,
				cls: this.currentTab === tab.id ? 'active' : ''
			});
			btn.dataset.tabId = tab.id;
			btn.addEventListener('click', () => this.switchTab(tab.id as any));
		});
	}

	private switchTab(tab: 'recent' | 'emoji' | 'custom'): void {
		this.currentTab = tab;
		this.tabsContainer.querySelectorAll('button').forEach(btn => {
			btn.classList.toggle('active', (btn as HTMLElement).dataset.tabId === tab);
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
		const searchInput = this.contentArea.createEl('input', {
			attr: { type: 'text', placeholder: '输入图标搜索...' },
			cls: 'icon-picker-search'
		});

		const grid = this.contentArea.createDiv('icon-picker-grid');

		const render = (filter: string = '') => {
			grid.empty();
			const recentIcons = this.recentManager.getRecent(50);

			const filtered = filter
				? recentIcons.filter(item => {
					const searchText = filter.toLowerCase();
					// 系统图标：匹配 emoji、名称或英文名
					if (!item.isCustom) {
						const emojiItem = this.emojiItems.find(e => e.icon === item.icon);
						const name = emojiItem?.name || '';
						const nameEn = emojiItem?.nameEn.toLowerCase() || '';
						return item.icon.includes(searchText) || name.toLowerCase().includes(searchText) || nameEn.includes(searchText);
					}
					// 自定义图标：匹配路径中的文件名
					if (item.isCustom) {
						const fileName = item.icon.split('/').pop() || item.icon;
						return fileName.toLowerCase().includes(searchText) || item.icon.toLowerCase().includes(searchText);
					}
					return false;
				})
				: recentIcons;

			if (filtered.length === 0) {
				grid.createDiv('icon-picker-empty', (el) => {
					el.textContent = filter ? '未找到匹配项' : '暂无最近使用的图标';
				});
				return;
			}

			// 分组：系统图标 和 自定义图标
			const systemIcons = filtered.filter(item => !item.isCustom);
			const customIconsGroup = filtered.filter(item => item.isCustom);

			if (systemIcons.length > 0) {
				const systemSection = grid.createDiv('icon-picker-category');
				systemSection.createDiv('icon-picker-category-title').textContent = '系统图标';
				const itemsContainer = systemSection.createDiv('icon-picker-category-items');
				systemIcons.forEach(item => {
					const itemEl = itemsContainer.createDiv('icon-picker-item');
					itemEl.textContent = item.icon;
					const emojiItem = this.emojiItems.find(e => e.icon === item.icon);
					const iconName = emojiItem ? `${emojiItem.name} / ${emojiItem.nameEn}` : item.icon;
					itemEl.title = iconName;
					itemEl.addEventListener('click', () => {
						this.callbacks.onSelect(item.icon);
						this.close();
					});
				});
			}

			if (customIconsGroup.length > 0) {
				const customSection = grid.createDiv('icon-picker-category');
				customSection.createDiv('icon-picker-category-title').textContent = '自定义图标';
				const itemsContainer = customSection.createDiv('icon-picker-category-items');
				customIconsGroup.forEach(item => {
					const itemEl = itemsContainer.createDiv('icon-picker-item icon-picker-custom');
					const file = this.app.vault.getAbstractFileByPath(item.icon);
					if (file instanceof TFile) {
						itemEl.createEl('img', { attr: { src: this.app.vault.getResourcePath(file), alt: item.icon } });
					}
					const fileName = item.icon.split('/').pop() || item.icon;
					itemEl.title = fileName;
					itemEl.addEventListener('click', () => {
						this.callbacks.onSelect(item.icon);
						this.close();
					});
				});
			}
		};

		render();
		searchInput.addEventListener('input', () => render(searchInput.value.trim()));
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