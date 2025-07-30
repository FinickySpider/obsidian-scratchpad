import { ItemView, Notice, WorkspaceLeaf, setIcon, Scope, debounce, Menu } from "obsidian";
import ScratchpadPlugin, { StashNote } from "./main";

export const VIEW_TYPE_SCRATCHPAD = "scratchpad-enhanced-view";

export class ScratchpadView extends ItemView {
    private textarea!: HTMLTextAreaElement;
    private textHistory: string[] = [];
    private textIndex = -1;
    private isTyping = false;
    private plugin: ScratchpadPlugin;
    private debouncedSaveTextSnapshot: ReturnType<typeof debounce>;
    private debouncedAutoSave: ReturnType<typeof debounce>;
    
    // Stash drawer elements
    private stashDrawer!: HTMLElement;
    private stashDrawerContent!: HTMLElement;
    private isDrawerOpen = false;
    private currentStash: StashNote | null = null;
    private loadedStashes: StashNote[] = [];
    private stashOffset = 0;
    private isLoadingStashes = false;
    
    // Footer stats
    private statsContainer!: HTMLElement;

    constructor(leaf: WorkspaceLeaf, plugin: ScratchpadPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return VIEW_TYPE_SCRATCHPAD;
    }

    getDisplayText(): string {
        return "Scratchpad";
    }

    getIcon(): string {
        return "edit-3";
    }

    async onOpen(): Promise<void> {
        this.contentEl.empty();
        this.contentEl.addClass("scratchpad-container");

        this.setupHeader();
        this.setupTextarea();
        this.setupActionButtons();
        this.setupStashDrawer();
        this.scope = new Scope(this.app.scope);
        
        await this.loadContentFromPlugin();

        if (this.textHistory.length === 0) {
            this.saveTextSnapshot();
        }

        this.scope.register(["Mod"], "z", (evt) => this.handleUndo(evt));
        this.scope.register(["Mod", "Shift"], "z", (evt) => this.handleRedo(evt));
        this.scope.register(["Mod"], "y", (evt) => this.handleRedo(evt));
        this.scope.register(["Mod"], "s", (evt) => {
            evt.preventDefault();
            this.saveContentToPlugin();
        });
    }

    private setupHeader() {
        const header = this.contentEl.createEl("div", {
            cls: "scratchpad-header"
        });

        const drawerButton = header.createEl("button", {
            cls: "scratchpad-drawer-button",
            attr: { "aria-label": "Open stash drawer" }
        });
        setIcon(drawerButton, "menu");
        drawerButton.addEventListener("click", () => this.toggleDrawer());

        const headerControls = header.createEl("div", {
            cls: "scratchpad-header-controls"
        });

        const topButton = headerControls.createEl("button", {
            cls: "scratchpad-jump-button",
            attr: { "aria-label": "Jump to top" }
        });
        setIcon(topButton, "chevron-up");
        topButton.addEventListener("click", () => this.jumpToTop());

        const bottomButton = headerControls.createEl("button", {
            cls: "scratchpad-jump-button",
            attr: { "aria-label": "Jump to bottom" }
        });
        setIcon(bottomButton, "chevron-down");
        bottomButton.addEventListener("click", () => this.jumpToBottom());
    }

    private setupTextarea() {
        this.textarea = this.contentEl.createEl("textarea", {
            cls: "scratchpad-textarea",
            attr: { placeholder: "Quick notes here..." },
        });

        this.debouncedSaveTextSnapshot = debounce(
            () => {
                if (this.isTyping) return;
                this.isTyping = true;
                this.saveTextSnapshot();
                this.isTyping = false;
            },
            600,
            true
        );

        this.debouncedAutoSave = debounce(
            () => {
                this.saveContentToPlugin();
            },
            500,
            true
        );

        this.textarea.addEventListener("input", () => {
            this.debouncedSaveTextSnapshot();
            this.debouncedAutoSave();
            this.updateFooterStats();
        });

        this.textarea.addEventListener("select", () => {
            this.updateFooterStats();
        });

        this.textarea.addEventListener("keyup", () => {
            this.updateFooterStats();
        });
    }

    private setupActionButtons() {
        // Footer with stats and buttons
        const footer = this.contentEl.createEl("div", {
            cls: "scratchpad-footer"
        });

        const statsContainer = footer.createEl("div", {
            cls: "scratchpad-stats"
        });

        const buttonContainer = footer.createEl("div", {
            cls: "scratchpad-buttons-container",
        });

        const copyButton = buttonContainer.createEl("button", {
            cls: "scratchpad-copy-button",
            attr: { "aria-label": "Copy to clipboard" }
        });
        setIcon(copyButton, 'clipboard');
        copyButton.addEventListener("click", async () => {
            try {
                await navigator.clipboard.writeText(this.textarea.value);
                new Notice('Copied to clipboard');
            } catch (err) {
                new Notice('Failed to copy to clipboard');
            }
        });

        const newButton = buttonContainer.createEl("button", {
            cls: "scratchpad-new-button",
            attr: { "aria-label": "New stash" }
        });
        setIcon(newButton, 'plus');
        newButton.addEventListener("click", async () => {
            await this.createNewStash();
        });

        const clearButton = buttonContainer.createEl("button", {
            cls: "scratchpad-clear-button",
            attr: { "aria-label": "Clear" }
        });
        setIcon(clearButton, 'eraser');
        clearButton.addEventListener("click", async () => {
            if (this.textarea.value.trim() && !confirm('Are you sure you want to clear all content?')) {
                return;
            }
            this.textarea.value = "";
            this.textHistory = [""];
            this.textIndex = 0;
            await this.saveContentToPlugin();
            this.updateFooterStats();
        });

        this.contentEl.appendChild(footer);
        
        // Store reference for updates
        this.statsContainer = statsContainer;
    }

    private setupStashDrawer() {
        this.stashDrawer = this.contentEl.createEl("div", {
            cls: "scratchpad-stash-drawer"
        });

        const drawerHeader = this.stashDrawer.createEl("div", {
            cls: "stash-drawer-header"
        });

        const headerTop = drawerHeader.createEl("div", {
            cls: "stash-drawer-header-top"
        });

        const drawerTitle = headerTop.createEl("div", {
            cls: "stash-drawer-title",
            text: "STASHED"
        });
        drawerTitle.setAttribute("data-role", "drawer-title");

        const closeButton = headerTop.createEl("button", {
            cls: "stash-drawer-close"
        });
        setIcon(closeButton, "x");
        closeButton.addEventListener("click", () => this.toggleDrawer());

        const headerBottom = drawerHeader.createEl("div", {
            cls: "stash-drawer-header-bottom"
        });

        const clearAllButton = headerBottom.createEl("button", {
            cls: "stash-clear-all-button"
        });
        setIcon(clearAllButton, "trash-2");
        clearAllButton.textContent = " Clear All Stashes";
        clearAllButton.addEventListener("click", () => this.clearAllStashes());

        this.stashDrawerContent = this.stashDrawer.createEl("div", {
            cls: "stash-drawer-content"
        });

        // Setup scroll listener for lazy loading
        this.stashDrawerContent.addEventListener("scroll", () => {
            const { scrollTop, scrollHeight, clientHeight } = this.stashDrawerContent;
            if (scrollTop + clientHeight >= scrollHeight - 100) {
                this.loadMoreStashes();
            }
        });
    }

    private async toggleDrawer() {
        this.isDrawerOpen = !this.isDrawerOpen;
        
        if (this.isDrawerOpen) {
            this.stashDrawer.addClass("open");
            await this.loadStashes();
        } else {
            this.stashDrawer.removeClass("open");
        }
    }

    private async loadStashes() {
        if (this.isLoadingStashes) return;
        
        this.isLoadingStashes = true;
        try {
            this.loadedStashes = await this.plugin.getStashes(10, 0);
            this.stashOffset = this.loadedStashes.length;
            this.renderStashes();
        } finally {
            this.isLoadingStashes = false;
        }
    }

    private async loadMoreStashes() {
        if (this.isLoadingStashes) return;
        
        this.isLoadingStashes = true;
        try {
            const moreStashes = await this.plugin.getStashes(10, this.stashOffset);
            this.loadedStashes.push(...moreStashes);
            this.stashOffset = this.loadedStashes.length;
            this.renderStashes();
        } finally {
            this.isLoadingStashes = false;
        }
    }

    private renderStashes() {
        this.stashDrawerContent.empty();

        if (this.loadedStashes.length === 0) {
            this.stashDrawerContent.createEl("div", {
                cls: "stash-empty-state",
                text: "No stashed notes yet"
            });
            return;
        }

        this.loadedStashes.forEach(stash => {
            const stashCard = this.stashDrawerContent.createEl("div", {
                cls: "stash-card"
            });

            stashCard.createEl("div", {
                cls: "stash-preview",
                text: stash.preview
            });

            const stashMeta = stashCard.createEl("div", {
                cls: "stash-meta"
            });

            stashMeta.createEl("div", {
                cls: "stash-date",
                text: this.formatDate(stash.updatedAt)
            });

            const stashMenu = stashMeta.createEl("button", {
                cls: "stash-menu-button"
            });
            setIcon(stashMenu, "more-horizontal");

            // Click on card to fetch
            stashCard.addEventListener("click", (e) => {
                if (e.target === stashMenu || stashMenu.contains(e.target as Node)) {
                    return; // Don't fetch if clicking menu
                }
                this.fetchStash(stash.id);
            });

            // Menu button
            stashMenu.addEventListener("click", (e) => {
                e.stopPropagation();
                this.showStashMenu(stash, stashMenu);
            });
        });
    }

    private showStashMenu(stash: StashNote, button: HTMLElement) {
        const menu = new Menu();

        menu.addItem((item) => {
            item.setTitle("Fetch");
            item.setIcon("download");
            item.onClick(() => this.fetchStash(stash.id));
        });

        menu.addItem((item) => {
            item.setTitle("Copy");
            item.setIcon("copy");
            item.onClick(() => {
                navigator.clipboard.writeText(stash.content);
                new Notice("Copied to clipboard");
            });
        });

        menu.addItem((item) => {
            item.setTitle("Trash");
            item.setIcon("trash");
            item.onClick(() => this.deleteStash(stash.id));
        });

        const rect = button.getBoundingClientRect();
        menu.showAtPosition({ x: rect.right, y: rect.top });
    }

    private formatDate(timestamp: number): string {
        const now = new Date();
        const date = new Date(timestamp);
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
        const stashDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

        const timeString = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

        if (stashDate.getTime() === today.getTime()) {
            return `Today ${timeString}`;
        } else if (stashDate.getTime() === yesterday.getTime()) {
            return `Yesterday ${timeString}`;
        } else {
            return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        }
    }

    private async fetchStash(stashId: string) {
        if (this.isLoadingStashes) return; // Prevent concurrent operations
        
        try {
            const stash = await this.plugin.fetchStash(stashId);
            if (!stash) return;
            
            // IMPORTANT: Capture current content FIRST before any other operations
            const currentContent = this.textarea.value.trim();
            
            // If there's existing content and auto-stash is enabled, stash it first
            if (currentContent && currentContent !== stash.content && this.plugin.settings.autoStashOnFetch) {
                try {
                    // Use the new stashContent method to avoid interfering with current stash logic
                    await this.plugin.stashContent(currentContent);
                    new Notice('Current content stashed');
                } catch (error) {
                    new Notice('Failed to stash current content');
                    return; // Don't proceed if we can't stash
                }
            }
            
            // Now it's safe to load the stash content
            this.currentStash = stash;
            this.textarea.value = stash.content;
            this.textHistory = [stash.content];
            this.textIndex = 0;
            this.updateFooterStats();
            this.toggleDrawer(); // Close drawer
            
            // Refresh the drawer to show the newly stashed content
            if (currentContent && currentContent !== stash.content && this.plugin.settings.autoStashOnFetch) {
                // Only refresh if we actually stashed something
                if (this.isDrawerOpen) {
                    this.loadStashes();
                }
            }
            
            new Notice("Stash loaded");
            
        } catch (error) {
            new Notice("Failed to load stash");
        }
    }

    private async deleteStash(stashId: string) {
        if (this.isLoadingStashes) return; // Prevent concurrent operations
        
        try {
            await this.plugin.deleteStash(stashId);
            this.loadedStashes = this.loadedStashes.filter(s => s.id !== stashId);
            this.renderStashes();
            this.updateFooterStats(); // Update stats after deletion
            new Notice("Stash deleted");
        } catch (error) {
            new Notice("Failed to delete stash");
        }
    }

    private async createNewStash() {
        const currentContent = this.textarea.value;
        
        try {
            const newStash = await this.plugin.createNewStash(currentContent);
            if (newStash) {
                this.currentStash = newStash;
                this.textarea.value = "";
                this.textHistory = [""];
                this.textIndex = 0;
                this.updateFooterStats();
                // Refresh stashes in drawer if it's open
                if (this.isDrawerOpen) {
                    this.loadStashes();
                }
                new Notice('Note stashed');
            } else {
                new Notice('Cannot stash empty note');
            }
        } catch (error) {
            new Notice(error.message || 'Failed to create stash');
        }
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

    private handleUndo(evt: KeyboardEvent) {
        evt.preventDefault();
        this.undoText();
    }

    private handleRedo(evt: KeyboardEvent) {
        evt.preventDefault();
        this.redoText();
    }

    public async saveContentToPlugin(): Promise<void> {
        const textContent = this.textarea.value;
        await this.plugin.saveScratchpadContent(textContent);
    }

    private async loadContentFromPlugin() {
        const data = await this.plugin.loadScratchpadContent();
        if (data.currentStash) {
            this.currentStash = data.currentStash;
            this.textarea.value = data.currentStash.content;
            this.textHistory = [data.currentStash.content];
            this.textIndex = 0;
        } else {
            this.textarea.value = "";
            this.textHistory = [""];
            this.textIndex = 0;
        }
        
        // Update stats on load
        setTimeout(() => this.updateFooterStats(), 100);
    }

    private jumpToTop() {
        this.textarea.setSelectionRange(0, 0);
        this.textarea.scrollTop = 0;
        this.textarea.focus();
    }

    private jumpToBottom() {
        const length = this.textarea.value.length;
        this.textarea.setSelectionRange(length, length);
        this.textarea.scrollTop = this.textarea.scrollHeight;
        this.textarea.focus();
    }

    private updateFooterStats() {
        if (!this.statsContainer) return;
        
        const text = this.textarea.value;
        const selectionStart = this.textarea.selectionStart;
        const selectionEnd = this.textarea.selectionEnd;
        const hasSelection = selectionStart !== selectionEnd;
        
        const stats: string[] = [];
        
        if (hasSelection) {
            const selectedText = text.substring(selectionStart, selectionEnd);
            const selectedLines = selectedText.split('\n').length;
            stats.push(`Selected: ${selectedLines} lines`);
        }
        
        if (this.plugin.settings.showWordCount) {
            const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
            stats.push(`${wordCount} words`);
        }
        
        if (this.plugin.settings.showCharCount) {
            stats.push(`${text.length} chars`);
        }
        
        if (this.plugin.settings.showLineCount) {
            const lineCount = text ? text.split('\n').length : 1;
            stats.push(`${lineCount} lines`);
        }
        
        this.statsContainer.textContent = stats.join(' • ');
    }

    private async clearAllStashes() {
        const confirmed = confirm('Are you sure you want to clear ALL stashed notes? This action cannot be undone.');
        
        if (!confirmed) return;
        
        try {
            await this.plugin.clearAllStashes();
            this.loadedStashes = [];
            this.stashOffset = 0;
            this.renderStashes();
            new Notice('All stashes cleared');
        } catch (error) {
            new Notice('Failed to clear stashes');
        }
    }
}