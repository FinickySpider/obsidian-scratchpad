import { ItemView, Notice, WorkspaceLeaf, setIcon } from "obsidian";
import ScratchpadPlugin from "./main";

export const VIEW_TYPE_SCRATCHPAD = "scratchpad-view";

function debounce<T extends (...args: any[]) => void>(func: T, wait: number): T {
    let timeout: ReturnType<typeof setTimeout>;
    return function (this: any, ...args: any[]) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    } as T;
}

export class ScratchpadView extends ItemView {
    private textarea!: HTMLTextAreaElement;
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D | null = null;

    private drawing = false;
    private lastX = 0;
    private lastY = 0;
    private brushColor: string;
    private brushSize: number;

    private canvasHistory: ImageData[] = [];
    private canvasIndex = -1;

    private textHistory: string[] = [];
    private textIndex = -1;
    private isTyping = false;

    private plugin: ScratchpadPlugin;
    private debouncedSaveCanvasSnapshot: () => void;

    constructor(leaf: WorkspaceLeaf, plugin: ScratchpadPlugin) {
        super(leaf);
        this.canvas = document.createElement("canvas");
        this.plugin = plugin;
        this.brushColor = this.getBrushColorFromCSS();
        this.brushSize = this.getBrushSizeFromCSS();

        this.debouncedSaveCanvasSnapshot = debounce(() => {
            this.saveCanvasSnapshotInternal();
        }, 600);
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
        this.setupActionButtons();
        this.setupCanvas();
        this.setupToolbar();

        await this.loadContentFromPlugin();
        this.resizeCanvas();

        if (this.canvasHistory.length === 0 && this.ctx) {
            this.saveCanvasSnapshot();
        }
        if (this.textHistory.length === 0) {
            this.saveTextSnapshot();
        }

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

    private getBrushColorFromCSS(): string {
        return getComputedStyle(document.documentElement).getPropertyValue("--scratchpad-brush-color").trim() || "#FFFFFF";
    }

    private getBrushSizeFromCSS(): number {
        const val = getComputedStyle(document.documentElement).getPropertyValue("--scratchpad-brush-size").trim();
        const size = parseInt(val, 10);
        return isNaN(size) ? 2 : size;
    }

    private setupTextarea() {
        this.textarea = this.contentEl.createEl("textarea", {
            cls: "scratchpad-textarea",
            attr: { placeholder: "Quick notes here..." },
        });

        const debouncedSaveTextSnapshot = debounce(() => {
            if (this.isTyping) return;
            this.isTyping = true;
            this.saveTextSnapshot();
            this.isTyping = false;
        }, 600);
        this.textarea.addEventListener("input", debouncedSaveTextSnapshot);
    }

    private setupActionButtons() {
        const buttonContainer = this.contentEl.createEl("div", {
            cls: "scratchpad-buttons-container",
        });

        const saveButton = buttonContainer.createEl("button", {
            cls: "scratchpad-save-button",
        });
        setIcon(saveButton, 'save');
        saveButton.addEventListener("click", async () => {
            await this.saveContentToPlugin();
            new Notice('Scratchpad saved');
        });

        const clearNoteBtn = buttonContainer.createEl("button", {
            cls: "scratchpad-clear-notes",
        });
        setIcon(clearNoteBtn, 'eraser');
        clearNoteBtn.addEventListener("click", async () => {
            this.textarea.value = "";
            this.textHistory = [""];
            this.textIndex = 0;
            let currentCanvasData = "";
            if (this.canvas && this.ctx) {
                currentCanvasData = this.canvas.toDataURL("image/png");
            }
            await this.plugin.saveScratchpadContent("", currentCanvasData);
        });

        this.contentEl.appendChild(buttonContainer);
    }

    private setupCanvas() {
        this.canvas.classList.add("scratchpad-canvas");
        this.canvas.tabIndex = 0;
        this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });
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
            attr: {
                min: "1",
                max: "20"
            },
        });

        sizeSlider.addEventListener("input", (e) => {
            this.brushSize = parseInt((e.target as HTMLInputElement).value, 10);
        });

        const undoBtn = toolbar.createEl("button", { cls: "mobile-only" });
        setIcon(undoBtn, 'undo');
        undoBtn.addEventListener("click", ()=>this.undoCanvas());

        const redoBtn = toolbar.createEl("button", { cls: "mobile-only" });
        setIcon(redoBtn, 'redo');
        redoBtn.addEventListener("click", ()=>this.redoCanvas());

        const clearCanvasBtn = toolbar.createEl("button");
        setIcon(clearCanvasBtn, 'eraser');
        clearCanvasBtn.addEventListener("click", async () => {
            if (!this.ctx) return;
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.canvasHistory = [];
            this.canvasIndex = -1;
            this.saveCanvasSnapshot();
            await this.plugin.saveScratchpadContent(this.textarea.value, "");
        });

        toolbar.append(colorInput, sizeSlider, undoBtn, redoBtn, clearCanvasBtn);
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
    }

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
        if (!this.ctx || rect.width === 0 || rect.height === 0) {
            return;
        }

        let snapshot: ImageData | null = null;
        if (this.canvasIndex >= 0 && this.canvasHistory[this.canvasIndex]) {
            snapshot = this.canvasHistory[this.canvasIndex];
        }

        this.ctx.save();
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);

        this.canvas.width = rect.width * window.devicePixelRatio;
        this.canvas.height = rect.height * window.devicePixelRatio;

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        if (snapshot) {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = snapshot.width;
            tempCanvas.height = snapshot.height;
            const tempCtx = tempCanvas.getContext('2d');
            if (tempCtx) {
                tempCtx.putImageData(snapshot, 0, 0);
                this.ctx.drawImage(tempCanvas, 0, 0, this.canvas.width, this.canvas.height);
            }
        }

        this.ctx.restore();
        this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    }

    private saveCanvasSnapshot(): void {
        this.debouncedSaveCanvasSnapshot();
    }

    private saveCanvasSnapshotInternal(): void {
        if (!this.ctx) return;

        this.ctx.save();
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        const snapshot = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.restore();

        if (this.canvasIndex < this.canvasHistory.length - 1) {
            this.canvasHistory = this.canvasHistory.slice(0, this.canvasIndex + 1);
        }

        this.canvasHistory.push(snapshot);
        this.canvasIndex = this.canvasHistory.length - 1;

        const MAX_CANVAS_HISTORY_SIZE = 20;
        if (this.canvasHistory.length > MAX_CANVAS_HISTORY_SIZE) {
            this.canvasHistory.shift();
            this.canvasIndex--;
        }
    }

    private undoCanvas() {
        if (this.canvasIndex <= 0) {
            this.canvasIndex = -1;
            this.canvasHistory = [];
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
        if (this.textIndex < 0 || value !== this.textHistory[this.textIndex]) {
            if (this.textIndex < this.textHistory.length - 1) {
                this.textHistory = this.textHistory.slice(0, this.textIndex + 1);
            }
            this.textHistory.push(value);
            this.textIndex = this.textHistory.length - 1;

            const MAX_TEXT_HISTORY_SIZE = 50;
            if (this.textHistory.length > MAX_TEXT_HISTORY_SIZE) {
                this.textHistory.shift();
                this.textIndex--;
            }
        }
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

    public async saveContentToPlugin(): Promise<void> {
        const textContent = this.textarea.value;
        let canvasContent = "";
        if (this.canvas && this.ctx) {
            canvasContent = this.canvas.toDataURL("image/png");
        }
        await this.plugin.saveScratchpadContent(textContent, canvasContent);
    }

    private async loadContentFromPlugin() {
        const data = await this.plugin.loadScratchpadContent();
        if (data) {
            this.textarea.value = data.text;
            this.textHistory = [data.text];
            this.textIndex = 0;

            if (data.canvas && this.ctx) {
                const img = new Image();
                img.onload = () => {
                    if (!this.ctx) {
                        return;
                    }

                    const currentRect = this.canvas.getBoundingClientRect();
                    const originalCanvasWidth = currentRect.width * window.devicePixelRatio;
                    const originalCanvasHeight = currentRect.height * window.devicePixelRatio;
                    const originalDevicePixelRatio = window.devicePixelRatio;

                    this.canvas.width = img.width;
                    this.canvas.height = img.height;
                    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
                    this.ctx.drawImage(img, 0, 0);

                    this.canvasHistory = [this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height)];
                    this.canvasIndex = 0;

                    this.canvas.width = originalCanvasWidth;
                    this.canvas.height = originalCanvasHeight;
                    this.ctx.scale(originalDevicePixelRatio, originalDevicePixelRatio);
                    this.resizeCanvas();
                };
                img.onerror = (e) => {
                    if (this.ctx) {
                        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
                    }
                    this.canvasHistory = [];
                    this.canvasIndex = -1;
                };
                img.src = data.canvas;
            } else {
                if (this.ctx) {
                    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
                }
                this.canvasHistory = [];
                this.canvasIndex = -1;
            }
        } else {
            this.textarea.value = "";
            this.textHistory = [""];
            this.textIndex = 0;
            if (this.ctx) {
                this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            }
            this.canvasHistory = [];
            this.canvasIndex = -1;
        }
    }
}