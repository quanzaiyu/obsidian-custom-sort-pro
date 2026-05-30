import { App, Modal, TFile, TFolder, Notice } from 'obsidian';
import type { IconPickerCallbacks, RecentIcon } from './types';
import { RecentIconsManager } from './RecentIconsManager';
import { defaultEmojiCategories } from './icons';

interface EmojiIcon {
	icon: string;
	name: string;
	nameEn: string;
}

interface EmojiCategory {
	category: string;
	icons: EmojiIcon[];
}

export class IconPickerModal extends Modal {
	private callbacks: IconPickerCallbacks;
	private recentManager: RecentIconsManager;
	private currentTab: 'recent' | 'emoji' | 'custom' = 'recent';
	private customIcons: { name: string; path: string }[] = [];
	private contentArea!: HTMLElement;
	private tabsContainer!: HTMLElement;
	private emojiCategories: EmojiCategory[] = defaultEmojiCategories;

	constructor(app: App, callbacks: IconPickerCallbacks) {
		super(app);
		this.callbacks = callbacks;
		this.recentManager = new RecentIconsManager();
	}

	private async loadExternalIcons(): Promise<void> {
		try {
			const jsonPath = 'templates/icons.json';
			const jsonFile = this.app.vault.getAbstractFileByPath(jsonPath);
			if (jsonFile instanceof TFile) {
				const content = await this.app.vault.read(jsonFile);
				const parsed = JSON.parse(content) as EmojiCategory[];
				if (Array.isArray(parsed) && parsed.length > 0) {
					this.emojiCategories = parsed;
					console.log('成功加载外部图标(JSON)，共', this.emojiCategories.length, '个分类');
					return;
				}
			}

			const jsPath = 'templates/icons.js';
			const jsFile = this.app.vault.getAbstractFileByPath(jsPath);
			if (jsFile instanceof TFile) {
				const content = await this.app.vault.read(jsFile);
				const arrayMatch = content.match(/export\s+const\s+emojiCategories\s*=\s*(\[[\s\S]*?\])\s*;/);
				if (arrayMatch) {
					const parsed = new Function('return ' + arrayMatch[1])() as EmojiCategory[];
					if (Array.isArray(parsed) && parsed.length > 0) {
						this.emojiCategories = parsed;
						return;
					}
				}
			}
		} catch (e) {
			console.log('加载外部图标失败:', e);
		}
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.classList.add('icon-picker-modal');

		const header = contentEl.createDiv('icon-picker-header');
		header.createEl('h3', { text: '选择图标' });

		this.tabsContainer = contentEl.createDiv('icon-picker-tabs');
		this.createTabs();

		// 添加手动输入区域
		const inputArea = contentEl.createDiv('icon-picker-input-area');
		const customInput = inputArea.createEl('input', {
			attr: { type: 'text', placeholder: '输入任意emoji图标，如 😊 🎉 ✨' },
			cls: 'icon-picker-custom-input'
		});
		const useBtn = inputArea.createEl('button', {
			text: '使用',
			cls: 'icon-picker-use-btn'
		});

		useBtn.addEventListener('click', () => {
			const value = customInput.value.trim();
			if (value) {
				this.recentManager.add(value, false);
				this.callbacks.onSelect(value);
				this.close();
			}
		});

		customInput.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				useBtn.click();
			}
		});

		// 实时预览输入的图标
		customInput.addEventListener('input', () => {
			const preview = inputArea.querySelector('.icon-picker-input-preview');
			if (preview) {
				preview.remove();
			}
			const value = customInput.value.trim();
			if (value) {
				const previewEl = inputArea.createDiv('icon-picker-input-preview');
				previewEl.textContent = value;
				previewEl.style.cssText = 'font-size: 48px; text-align: center; margin-top: 8px;';
			}
		});

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

		await this.loadExternalIcons();
		await this.loadAndRender();
	}

	private createTabs(): void {
		const tabs = [
			{ id: 'recent', label: '最近使用' },
			{ id: 'emoji', label: '系统图标' },
			{ id: 'custom', label: '自定义图标' }
		];

		tabs.forEach((tab) => {
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

	private getAllEmojiIcons(): EmojiIcon[] {
		return this.emojiCategories.flatMap(cat => cat.icons);
	}

	private getEmojiNameMap(): Map<string, string> {
		const map = new Map<string, string>();
		this.emojiCategories.forEach(cat => {
			cat.icons.forEach(item => {
				map.set(item.icon, item.name);
				map.set(item.nameEn.toLowerCase(), item.icon);
			});
		});
		return map;
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
			const nameMap = this.getEmojiNameMap();

			const filtered = filter
				? recentIcons.filter(item => {
					const searchText = filter.toLowerCase();
					if (!item.isCustom) {
						const name = nameMap.get(item.icon) || '';
						return item.icon.includes(searchText) || name.toLowerCase().includes(searchText);
					}
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

			const systemIcons = filtered.filter(item => !item.isCustom);
			const customIconsGroup = filtered.filter(item => item.isCustom);

			if (systemIcons.length > 0) {
				const systemSection = grid.createDiv('icon-picker-category');
				systemSection.createDiv('icon-picker-category-title').textContent = '系统图标';
				const itemsContainer = systemSection.createDiv('icon-picker-category-items');
				systemIcons.forEach(item => {
					const itemEl = itemsContainer.createDiv('icon-picker-item');
					itemEl.textContent = item.icon;
					itemEl.title = item.icon;
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

			const grouped = new Map<string, EmojiIcon[]>();
			for (const cat of this.emojiCategories) {
				const matches = !filter || cat.icons.some(item =>
					item.name.toLowerCase().includes(filter.toLowerCase()) ||
					item.nameEn.toLowerCase().includes(filter.toLowerCase())
				);
				if (matches) {
					grouped.set(cat.category, cat.icons);
				}
			}

			for (const [category, icons] of grouped) {
				const section = grid.createDiv('icon-picker-category');
				const titleEl = section.createDiv('icon-picker-category-title');
				titleEl.textContent = category;

				const itemsContainer = section.createDiv('icon-picker-category-items');
				icons.forEach(item => {
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

		// 上传按钮
		const uploadArea = grid.createDiv('icon-picker-upload-area');
		const uploadBtn = uploadArea.createEl('button', {
			text: '上传图片作为图标',
			cls: 'icon-picker-upload-btn'
		});
		const fileInput = uploadArea.createEl('input', {
			attr: { type: 'file', accept: 'image/*', multiple: 'multiple', style: 'display: none' }
		});

		// 上传确认区域（隐藏直到选择文件）
		const uploadConfirmArea = uploadArea.createDiv('icon-picker-upload-confirm');
		uploadConfirmArea.style.cssText = 'display: none; margin-top: 12px; padding: 12px; background: var(--background-secondary); border-radius: 6px;';

		uploadBtn.addEventListener('click', () => {
			fileInput.click();
		});

		fileInput.addEventListener('change', async () => {
			const files = (fileInput as HTMLInputElement).files;
			if (!files || files.length === 0) return;

			// 显示确认区域，隐藏上传按钮
			uploadConfirmArea.style.display = 'block';
			uploadBtn.style.display = 'none';

			// 清空并重建确认区域
			uploadConfirmArea.empty();

			const file = files[0];
			const defaultName = file.name.replace(/\.[^.]+$/, '');

			uploadConfirmArea.createDiv('icon-picker-upload-hint').textContent = `已选择: ${file.name}`;

			const nameInput = uploadConfirmArea.createEl('input', {
				attr: { type: 'text', placeholder: '输入图标名称', value: defaultName },
				cls: 'icon-picker-upload-name-input'
			});
			nameInput.style.cssText = 'width: 100%; margin: 8px 0; padding: 6px 8px;';

			const btnRow = uploadConfirmArea.createDiv('icon-picker-upload-btn-row');
			btnRow.style.cssText = 'display: flex; gap: 8px;';

			const confirmAndUseBtn = btnRow.createEl('button', {
				text: '上传并使用',
				cls: 'icon-picker-upload-use-btn'
			});
			confirmAndUseBtn.style.cssText = 'flex: 1; padding: 6px 12px;';

			const confirmBtn = btnRow.createEl('button', {
				text: '上传',
				cls: 'icon-picker-upload-confirm-btn'
			});
			confirmBtn.style.cssText = 'flex: 1; padding: 6px 12px;';

			const cancelBtn = btnRow.createEl('button', {
				text: '取消',
				cls: 'icon-picker-upload-cancel-btn'
			});
			cancelBtn.style.cssText = 'flex: 1; padding: 6px 12px;';

			confirmAndUseBtn.addEventListener('click', async () => {
				const iconName = nameInput.value.trim() || defaultName;

				// 确保 icon 文件夹存在
				let iconFolder = this.app.vault.getFolderByPath('icon');
				if (!iconFolder) {
					try {
						await this.app.vault.createFolder('icon');
						iconFolder = this.app.vault.getFolderByPath('icon');
					} catch (e) {
						new Notice('创建 icon 文件夹失败');
						return;
					}
				}

				const ext = file.name.match(/\.([^.]+)$/)?.[1] || 'png';
				const newPath = `icon/${iconName}.${ext}`;

				// 检查文件是否已存在
				const existingFile = this.app.vault.getAbstractFileByPath(newPath);
				if (existingFile instanceof TFile) {
					if (!confirm(`文件 "${iconName}.${ext}" 已存在，是否覆盖?`)) {
						resetUploadArea();
						return;
					}
					await this.app.vault.delete(existingFile);
				}

				try {
					const arrayBuffer = await file.arrayBuffer();
					const uint8Array = new Uint8Array(arrayBuffer);
					const createdFile = await this.app.vault.createBinary(newPath, uint8Array);

					console.log('[IconPicker] 上传成功，触发 create 事件:', newPath);

					// 触发 create 事件，让 DragDropTree 的监听器收到通知
					this.app.vault.trigger('create', createdFile);

					this.recentManager.add(newPath, true);
					this.callbacks.onFileCreated?.(newPath);
					console.log('[IconPicker] onFileCreated 回调完成');
					this.callbacks.onSelect(newPath);
					console.log('[IconPicker] onSelect 回调完成，即将关闭弹窗');
					this.close();
				} catch (e) {
					console.error('上传失败:', e);
					new Notice('上传失败');
				}

				resetUploadArea();
			});

			confirmBtn.addEventListener('click', async () => {
				const iconName = nameInput.value.trim() || defaultName;

				// 确保 icon 文件夹存在
				let iconFolder = this.app.vault.getFolderByPath('icon');
				if (!iconFolder) {
					try {
						await this.app.vault.createFolder('icon');
						iconFolder = this.app.vault.getFolderByPath('icon');
					} catch (e) {
						new Notice('创建 icon 文件夹失败');
						return;
					}
				}

				const ext = file.name.match(/\.([^.]+)$/)?.[1] || 'png';
				const newPath = `icon/${iconName}.${ext}`;

				// 检查文件是否已存在
				const existingFile = this.app.vault.getAbstractFileByPath(newPath);
				if (existingFile instanceof TFile) {
					if (!confirm(`文件 "${iconName}.${ext}" 已存在，是否覆盖?`)) {
						resetUploadArea();
						return;
					}
					await this.app.vault.delete(existingFile);
				}

				try {
					const arrayBuffer = await file.arrayBuffer();
					const uint8Array = new Uint8Array(arrayBuffer);
					const createdFile = await this.app.vault.createBinary(newPath, uint8Array);

					console.log('[IconPicker] 上传成功:', newPath);

					// 触发 create 事件
					this.app.vault.trigger('create', createdFile);

					new Notice(`成功上传: ${iconName}.${ext}`);

					await this.loadCustomIcons();
					this.renderCustomTabWithFiles([newPath]);
				} catch (e) {
					console.error('上传失败:', e);
					new Notice('上传失败');
				}

				resetUploadArea();
			});

			cancelBtn.addEventListener('click', () => {
				resetUploadArea();
			});

			function resetUploadArea() {
				uploadConfirmArea.style.display = 'none';
				uploadBtn.style.display = 'inline-block';
				fileInput.value = '';
			}
		});

		const customGrid = grid.createDiv('icon-picker-custom-grid');

		const render = (filter: string = '') => {
			customGrid.empty();

			const filtered = filter
				? this.customIcons.filter(i => i.name.toLowerCase().includes(filter.toLowerCase()))
				: this.customIcons;

			if (filtered.length === 0) {
				customGrid.createDiv('icon-picker-empty', (el) => {
					el.textContent = filter ? '未找到匹配的文件' : '未找到自定义图标。请上传图片或放入 icon 文件夹';
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

		// 保存 render 函数引用，以便后续刷新
		(this as any)._renderCustomGrid = render;
		render();
		searchInput.addEventListener('input', () => render(searchInput.value.trim()));
	}

	// 刷新自定义图标列表（上传后调用）
	private renderCustomTabWithFiles(newPaths: string[]): void {
		const grid = this.contentArea.querySelector('.icon-picker-grid');
		if (!grid) return;

		const customGrid = grid.querySelector('.icon-picker-custom-grid');
		if (!customGrid) return;

		// 清空并重新渲染
		customGrid.empty();
		const filtered = this.customIcons;

		if (filtered.length === 0) {
			customGrid.createDiv('icon-picker-empty', (el) => {
				el.textContent = '未找到自定义图标。请上传图片或放入 icon 文件夹';
			});
			return;
		}

		filtered.forEach((icon, index) => {
			const item = customGrid.createDiv('icon-picker-item icon-picker-custom');
			const file = this.app.vault.getAbstractFileByPath(icon.path);
			const imgSrc = file instanceof TFile ? this.app.vault.getResourcePath(file) : icon.path;
			item.createEl('img', { attr: { src: imgSrc, alt: icon.name } });
			item.title = icon.name;

			// 新上传的图标高亮显示
			if (newPaths.includes(icon.path)) {
				item.style.boxShadow = '0 0 0 2px var(--text-accent)';
			}

			item.addEventListener('click', () => {
				this.recentManager.add(icon.path, true);
				this.callbacks.onSelect(icon.path);
				this.close();
			});
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}