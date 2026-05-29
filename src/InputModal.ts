import { App, Modal, TextComponent, ButtonComponent } from 'obsidian';

export class InputModal extends Modal {
	private onSubmit: (value: string) => void;

	constructor(app: App, title: string, placeholder: string, defaultValue: string, onSubmit: (value: string) => void) {
		super(app);
		this.titleEl.textContent = title;
		this.onSubmit = onSubmit;

		this.contentEl.style.padding = '16px';

		const inputContainer = this.contentEl.createDiv();
		inputContainer.style.marginBottom = '12px';

		const input = new TextComponent(inputContainer);
		input.setPlaceholder(placeholder);
		input.setValue(defaultValue);
		input.inputEl.style.width = '100%';
		input.inputEl.style.padding = '8px';
		input.inputEl.style.border = '1px solid var(--background-modifier-border)';
		input.inputEl.style.borderRadius = '4px';

		const buttonContainer = this.contentEl.createDiv();
		buttonContainer.style.display = 'flex';
		buttonContainer.style.justifyContent = 'flex-end';
		buttonContainer.style.gap = '8px';

		const cancelBtn = new ButtonComponent(buttonContainer);
		cancelBtn.setButtonText('取消');
		cancelBtn.onClick(() => this.close());

		const confirmBtn = new ButtonComponent(buttonContainer);
		confirmBtn.setButtonText('确定');
		confirmBtn.setCta();
		confirmBtn.onClick(() => {
			const value = input.getValue().trim();
			if (value) {
				this.onSubmit(value);
				this.close();
			}
		});

		// 回车确认
		input.inputEl.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				confirmBtn.buttonEl.click();
			}
		});

		// 自动聚焦
		this.open();
		input.focus();
	}
}