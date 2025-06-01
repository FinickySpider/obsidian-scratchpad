import { ItemView, WorkspaceLeaf } from "obsidian";

export const VIEW_TYPE_SCRATCHPAD = "scratchpad-view";

export class ScratchpadView extends ItemView {
	private textarea!: HTMLTextAreaElement;
	private canvas: HTMLCanvasElement;
	private ctx: CanvasRenderingContext2D | null = null;

	private drawing = false;
	private lastX = 0;
	private lastY = 0;
	private brushColor = "#FFFFFF";
	private brushSize = 2;

	private canvasHistory: ImageData[] = [];
	private canvasIndex = -1;

	private textHistory: string[] = [];
	private textIndex = -1;
	private isTyping = false;
	private typingTimeout: number | null = null;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
		this.canvas = document.createElement("canvas");
	}

	getViewType(): string {
		return VIEW_TYPE_SCRATCHPAD;
	}

	getDisplayText(): string {
		return "Scratchpad";
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass("scratchpad-container");

		this.setupTextarea();
		this.setupClearNoteButton();
		this.setupCanvas();
		this.setupToolbar();

		this.resizeCanvas();
		this.saveCanvasSnapshot();
		this.saveTextSnapshot();

		this.registerDrawingEvents();
		window.addEventListener("keydown", this.handleUndoRedo);
	}

	async onClose(): Promise<void> {
		this.unregisterDrawingEvents();
		window.removeEventListener("keydown", this.handleUndoRedo);
	}

	onResize(): void {
		super.onResize();
		this.resizeCanvas();
	}

	private setupTextarea() {
		this.textarea = this.contentEl.createEl("textarea", {
			cls: "scratchpad-textarea",
			attr: { placeholder: "Quick notes here..." },
		});

		this.textarea.addEventListener("input", () => {
			if (this.isTyping) return;
			this.isTyping = true;
			if (this.typingTimeout) clearTimeout(this.typingTimeout);

			this.typingTimeout = window.setTimeout(() => {
				this.saveTextSnapshot();
				this.isTyping = false;
			}, 300);
		});
	}

	private setupClearNoteButton() {
		const btn = this.contentEl.createEl("button", {
			text: "Clear note",
			cls: "scratchpad-clear-notes",
		});
		btn.addEventListener("click", () => {
			this.textarea.value = "";
			this.saveTextSnapshot();
		});
	}

	private setupCanvas() {
		this.canvas.classList.add("scratchpad-canvas");
		this.canvas.tabIndex = 0;
		this.ctx = this.canvas.getContext("2d");
		this.contentEl.appendChild(this.canvas);
	}

	private setupToolbar() {
		const toolbar = this.contentEl.createEl("div", {
			cls: "scratchpad-toolbar",
		});

		const colorInput = toolbar.createEl("input", {
			type: "color",
			value: this.brushColor,
		});
		colorInput.addEventListener("input", (e) => {
			this.brushColor = (e.target as HTMLInputElement).value;
		});

		const sizeSlider = toolbar.createEl("input", {
			type: "range",
			value: this.brushSize.toString(),
		});
		sizeSlider.min = "1";
		sizeSlider.max = "20";
		sizeSlider.addEventListener("input", (e) => {
			this.brushSize = parseInt((e.target as HTMLInputElement).value, 10);
		});

		const clearCanvasBtn = toolbar.createEl("button", {
			text: "Clear drawing",
		});
		clearCanvasBtn.addEventListener("click", () => {
			if (!this.ctx) return;
			this.canvasHistory = [];
			this.canvasIndex = -1;
			this.resizeCanvas();
			this.saveCanvasSnapshot();
		});

		toolbar.append(colorInput, sizeSlider, clearCanvasBtn);
		this.contentEl.appendChild(toolbar);
	}

	private registerDrawingEvents() {
		this.canvas.addEventListener("mousedown", this.startDrawing);
		this.canvas.addEventListener("mousemove", this.draw);
		this.canvas.addEventListener("mouseup", this.stopDrawing);
		this.canvas.addEventListener("mouseout", this.stopDrawing);
		this.canvas.addEventListener("touchstart", this.startDrawing);
		this.canvas.addEventListener("touchmove", this.draw);
		this.canvas.addEventListener("touchend", this.stopDrawing);
		this.canvas.addEventListener("touchcancel", this.stopDrawing);
	}

	private unregisterDrawingEvents() {
		this.canvas.removeEventListener("mousedown", this.startDrawing);
		this.canvas.removeEventListener("mousemove", this.draw);
		this.canvas.removeEventListener("mouseup", this.stopDrawing);
		this.canvas.removeEventListener("mouseout", this.stopDrawing);
		this.canvas.removeEventListener("touchstart", this.startDrawing);
		this.canvas.removeEventListener("touchmove", this.draw);
		this.canvas.removeEventListener("touchend", this.stopDrawing);
		this.canvas.removeEventListener("touchcancel", this.stopDrawing);
	}

	private startDrawing = (e: MouseEvent | TouchEvent) => {
		e.preventDefault();
		this.drawing = true;
		this.canvas.focus();
		const { x, y } = this.getPointerPosition(e);
		this.lastX = x;
		this.lastY = y;
	};

	private draw = (e: MouseEvent | TouchEvent) => {
		e.preventDefault();
		if (!this.drawing || !this.ctx) return;

		const { x, y } = this.getPointerPosition(e);
		this.ctx.strokeStyle = this.brushColor;
		this.ctx.lineWidth = this.brushSize;
		this.ctx.lineCap = "round";
		this.ctx.lineJoin = "round";

		this.ctx.beginPath();
		this.ctx.moveTo(this.lastX, this.lastY);
		this.ctx.lineTo(x, y);
		this.ctx.stroke();

		this.lastX = x;
		this.lastY = y;
	};

	private stopDrawing = (e: MouseEvent | TouchEvent) => {
		e.preventDefault();
		if (!this.drawing) return;
		this.drawing = false;
		this.saveCanvasSnapshot();
	};

	private getPointerPosition(e: MouseEvent | TouchEvent) {
		const rect = this.canvas.getBoundingClientRect();
		let clientX = 0;
		let clientY = 0;
		if (e instanceof MouseEvent) {
			clientX = e.clientX;
			clientY = e.clientY;
		} else if (e.touches.length > 0) {
			clientX = e.touches[0].clientX;
			clientY = e.touches[0].clientY;
		}
		return { x: clientX - rect.left, y: clientY - rect.top };
	}

	private resizeCanvas() {
		const rect = this.canvas.getBoundingClientRect();
		if (!this.ctx || rect.width === 0 || rect.height === 0) return;

		let snapshot: ImageData | null = null;
		if (this.canvasIndex >= 0) {
			this.ctx.save();
			this.ctx.setTransform(1, 0, 0, 1, 0, 0);
			snapshot = this.canvasHistory[this.canvasIndex];
			this.ctx.restore();
		}

		this.canvas.width = rect.width * window.devicePixelRatio;
		this.canvas.height = rect.height * window.devicePixelRatio;

		this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

		if (snapshot) {
			this.ctx.save();
			this.ctx.setTransform(1, 0, 0, 1, 0, 0);
			this.ctx.putImageData(snapshot, 0, 0);
			this.ctx.restore();
		}

		this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
	}

	private saveCanvasSnapshot() {
		if (!this.ctx) return;
		if (this.canvasIndex < this.canvasHistory.length - 1) {
			this.canvasHistory = this.canvasHistory.slice(0, this.canvasIndex + 1);
		}
		this.ctx.save();
		this.ctx.setTransform(1, 0, 0, 1, 0, 0);
		const snapshot = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
		this.ctx.restore();

		this.canvasHistory.push(snapshot);
		this.canvasIndex = this.canvasHistory.length - 1;
	}

	private undoCanvas() {
		if (this.canvasIndex <= 0) {
			this.canvasIndex = -1;
			this.resizeCanvas();
			return;
		}
		this.canvasIndex--;
		this.resizeCanvas();
	}

	private redoCanvas() {
		if (this.canvasIndex >= this.canvasHistory.length - 1) return;
		this.canvasIndex++;
		this.resizeCanvas();
	}

	private saveTextSnapshot() {
		const value = this.textarea.value;
		if (this.textIndex < this.textHistory.length - 1) {
			this.textHistory = this.textHistory.slice(0, this.textIndex + 1);
		}
		this.textHistory.push(value);
		this.textIndex = this.textHistory.length - 1;
	}

	private undoText() {
		if (this.textIndex <= 0) return;
		this.textIndex--;
		this.textarea.value = this.textHistory[this.textIndex];
	}

	private redoText() {
		if (this.textIndex >= this.textHistory.length - 1) return;
		this.textIndex++;
		this.textarea.value = this.textHistory[this.textIndex];
	}

	private handleUndoRedo = (e: KeyboardEvent) => {
		const active = document.activeElement;
		const key = e.key.toLowerCase();
		const isUndo = (e.ctrlKey || e.metaKey) && !e.shiftKey && key === "z";
		const isRedo = (e.ctrlKey || e.metaKey) && (e.shiftKey && key === "z" || key === "y");

		if (active === this.textarea) {
			if (isUndo) {
				e.preventDefault();
				this.undoText();
			} else if (isRedo) {
				e.preventDefault();
				this.redoText();
			}
		} else if (active === this.canvas) {
			if (isUndo) {
				e.preventDefault();
				this.undoCanvas();
			} else if (isRedo) {
				e.preventDefault();
				this.redoCanvas();
			}
		}
	};
}