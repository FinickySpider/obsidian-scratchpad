import { Plugin, PluginSettingTab, Setting, App } from "obsidian";
import { ScratchpadView, VIEW_TYPE_SCRATCHPAD } from "./scratchpadview";

const SCRATCHPAD_FILE_NAME = "history.json";

export interface StashNote {
    id: string;
    createdAt: number;
    updatedAt: number;
    preview: string;
    title?: string;
    content: string;
}

export interface ScratchpadData {
    currentStash?: StashNote;
    stashes: StashNote[];
}

export interface ScratchpadSettings {
    maxStashes: number;
    autoEvictOldest: boolean;
    maxNoteLength: number;
    showWordCount: boolean;
    showCharCount: boolean;
    showLineCount: boolean;
    autoStashOnFetch: boolean;
}

const DEFAULT_SETTINGS: ScratchpadSettings = {
    maxStashes: 20,
    autoEvictOldest: true,
    maxNoteLength: 50000,
    showWordCount: true,
    showCharCount: true,
    showLineCount: true,
    autoStashOnFetch: true,
};

export default class ScratchpadPlugin extends Plugin {
    settings: ScratchpadSettings;
    async onload() {
        await this.loadSettings();

        this.registerView(VIEW_TYPE_SCRATCHPAD, (leaf) => new ScratchpadView(leaf, this));

        this.addRibbonIcon("notebook-pen", "Open scratchpad", () => {
            this.toggleView();
        });

        this.addCommand({
            id: "open-scratchpad-enhanced-view",
            name: "Open scratchpad",
            callback: () => this.activateView(),
        });

        this.addSettingTab(new ScratchpadSettingTab(this.app, this));
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async saveScratchpadContent(text: string) {
        // Migration: if old format exists, convert to new format
        const data = await this.loadScratchpadContent();
        
        if (!data.currentStash) {
            // Create initial stash
            data.currentStash = {
                id: this.generateId(),
                createdAt: Date.now(),
                updatedAt: Date.now(),
                preview: this.generatePreview(text),
                content: text
            };
        } else {
            // Update current stash
            data.currentStash.content = text;
            data.currentStash.updatedAt = Date.now();
            data.currentStash.preview = this.generatePreview(text);
        }

        const filePath = this.manifest.dir + "/" + SCRATCHPAD_FILE_NAME;
        await this.app.vault.adapter.write(filePath, JSON.stringify(data, null, 2));
    }

    async loadScratchpadContent(): Promise<ScratchpadData> {
        const filePath = this.manifest.dir + "/" + SCRATCHPAD_FILE_NAME;
        if (await this.app.vault.adapter.exists(filePath)) {
            const content = await this.app.vault.adapter.read(filePath);
            try {
                const parsed = JSON.parse(content);
                
                // Migration from old format
                if (parsed.text !== undefined) {
                    const migrated: ScratchpadData = {
                        currentStash: {
                            id: this.generateId(),
                            createdAt: Date.now(),
                            updatedAt: Date.now(),
                            preview: this.generatePreview(parsed.text),
                            content: parsed.text
                        },
                        stashes: []
                    };
                    await this.app.vault.adapter.write(filePath, JSON.stringify(migrated, null, 2));
                    return migrated;
                }
                
                return parsed as ScratchpadData;
            } catch (e) {
                return { stashes: [] };
            }
        }
        return { stashes: [] };
    }

    async createNewStash(content = ""): Promise<StashNote | null> {
        // Don't create stash if content is empty
        if (!content.trim()) {
            return null;
        }

        // Check note length limit
        if (content.length > this.settings.maxNoteLength) {
            throw new Error(`Note exceeds maximum length of ${this.settings.maxNoteLength} characters`);
        }

        const data = await this.loadScratchpadContent();
        
        // Save current stash to stashes list if it has content
        if (data.currentStash && data.currentStash.content.trim()) {
            // Remove from stashes if already exists (to avoid duplicates)
            data.stashes = data.stashes.filter(s => s.id !== data.currentStash?.id);
            data.stashes.unshift(data.currentStash);
            
            // Limit stashes according to settings
            if (data.stashes.length > this.settings.maxStashes) {
                if (this.settings.autoEvictOldest) {
                    data.stashes = data.stashes.slice(0, this.settings.maxStashes);
                } else {
                    throw new Error(`Maximum number of stashes (${this.settings.maxStashes}) reached`);
                }
            }
        }

        // Create new current stash
        const newStash: StashNote = {
            id: this.generateId(),
            createdAt: Date.now(),
            updatedAt: Date.now(),
            preview: this.generatePreview(content),
            content: content
        };

        data.currentStash = newStash;
        
        const filePath = this.manifest.dir + "/" + SCRATCHPAD_FILE_NAME;
        await this.app.vault.adapter.write(filePath, JSON.stringify(data, null, 2));
        
        return newStash;
    }

    // Create a stash from arbitrary content without affecting current stash
    async stashContent(content: string): Promise<StashNote | null> {
        // Don't create stash if content is empty
        if (!content.trim()) {
            return null;
        }

        // Check note length limit
        if (content.length > this.settings.maxNoteLength) {
            throw new Error(`Note exceeds maximum length of ${this.settings.maxNoteLength} characters`);
        }

        const data = await this.loadScratchpadContent();
        
        // Create new stash note
        const newStash: StashNote = {
            id: this.generateId(),
            createdAt: Date.now(),
            updatedAt: Date.now(),
            preview: this.generatePreview(content),
            content: content
        };

        // Add to stashes list at the beginning
        data.stashes.unshift(newStash);
        
        // Limit stashes according to settings
        if (data.stashes.length > this.settings.maxStashes) {
            if (this.settings.autoEvictOldest) {
                data.stashes = data.stashes.slice(0, this.settings.maxStashes);
            } else {
                throw new Error(`Maximum number of stashes (${this.settings.maxStashes}) reached`);
            }
        }
        
        const filePath = this.manifest.dir + "/" + SCRATCHPAD_FILE_NAME;
        await this.app.vault.adapter.write(filePath, JSON.stringify(data, null, 2));
        
        return newStash;
    }

    async fetchStash(stashId: string): Promise<StashNote | null> {
        const data = await this.loadScratchpadContent();
        
        // Check if it's the current stash
        if (data.currentStash && data.currentStash.id === stashId) {
            return data.currentStash;
        }
        
        // Find in stashes
        const stash = data.stashes.find(s => s.id === stashId);
        if (stash) {
            // Move to current and update timestamp
            data.currentStash = { ...stash, updatedAt: Date.now() };
            data.stashes = data.stashes.filter(s => s.id !== stashId);
            
            const filePath = this.manifest.dir + "/" + SCRATCHPAD_FILE_NAME;
            await this.app.vault.adapter.write(filePath, JSON.stringify(data, null, 2));
            
            return data.currentStash;
        }
        
        return null;
    }

    async deleteStash(stashId: string): Promise<void> {
        const data = await this.loadScratchpadContent();
        
        if (data.currentStash && data.currentStash.id === stashId) {
            data.currentStash = undefined;
        } else {
            data.stashes = data.stashes.filter(s => s.id !== stashId);
        }
        
        const filePath = this.manifest.dir + "/" + SCRATCHPAD_FILE_NAME;
        await this.app.vault.adapter.write(filePath, JSON.stringify(data, null, 2));
    }

    async clearAllStashes(): Promise<void> {
        const data = await this.loadScratchpadContent();
        data.stashes = [];
        
        const filePath = this.manifest.dir + "/" + SCRATCHPAD_FILE_NAME;
        await this.app.vault.adapter.write(filePath, JSON.stringify(data, null, 2));
    }

    async getStashes(limit = 10, offset = 0): Promise<StashNote[]> {
        const data = await this.loadScratchpadContent();
        
        // Sort by updatedAt (most recent first)
        const allStashes = [...data.stashes].sort((a, b) => b.updatedAt - a.updatedAt);
        
        return allStashes.slice(offset, offset + limit);
    }

    private generateId(): string {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    private generatePreview(content: string): string {
        return content.trim().slice(0, 100).replace(/\n/g, ' ') || "Empty note";
    }

    private async activateView() {
        const workspace = this.app.workspace;
        const existingLeaf = workspace.getLeavesOfType(VIEW_TYPE_SCRATCHPAD)[0];
        if (existingLeaf) {
            workspace.revealLeaf(existingLeaf);
            return;
        }

        const newLeaf = workspace.getRightLeaf(false) ?? workspace.getLeaf(true);
        await newLeaf.setViewState({
            type: VIEW_TYPE_SCRATCHPAD,
            active: true,
        });
        workspace.revealLeaf(newLeaf);
    }

    private async toggleView() {
        const workspace = this.app.workspace;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_SCRATCHPAD);
        if (leaves.length === 0) {
            await this.activateView();
            return;
        }

        const leaf = leaves[0];
        const activeView = workspace.getActiveViewOfType(ScratchpadView);

        if (activeView && activeView.leaf === leaf) {
            const otherLeaf = workspace.getLeaf(false);
            if (otherLeaf && otherLeaf !== leaf) {
                workspace.setActiveLeaf(otherLeaf, { focus: true });
            } else {
                leaf.view.containerEl.blur();
            }
        } else {
            workspace.revealLeaf(leaf);
        }
    }
}

class ScratchpadSettingTab extends PluginSettingTab {
    plugin: ScratchpadPlugin;

    constructor(app: App, plugin: ScratchpadPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();
        containerEl.createEl('h2', { text: 'Scratchpad Settings' });

        new Setting(containerEl)
            .setName('Maximum stashes')
            .setDesc('Maximum number of stashes to keep')
            .addText(text => text
                .setPlaceholder('20')
                .setValue(this.plugin.settings.maxStashes.toString())
                .onChange(async (value) => {
                    const num = parseInt(value);
                    if (!isNaN(num) && num > 0) {
                        this.plugin.settings.maxStashes = num;
                        await this.plugin.saveSettings();
                    }
                }));

        new Setting(containerEl)
            .setName('Auto-evict oldest stashes')
            .setDesc('Automatically remove the oldest stash when the maximum is reached')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoEvictOldest)
                .onChange(async (value) => {
                    this.plugin.settings.autoEvictOldest = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Maximum note length')
            .setDesc('Maximum number of characters allowed per note')
            .addText(text => text
                .setPlaceholder('50000')
                .setValue(this.plugin.settings.maxNoteLength.toString())
                .onChange(async (value) => {
                    const num = parseInt(value);
                    if (!isNaN(num) && num > 0) {
                        this.plugin.settings.maxNoteLength = num;
                        await this.plugin.saveSettings();
                    }
                }));

        new Setting(containerEl)
            .setName('Show word count')
            .setDesc('Display word count in footer')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showWordCount)
                .onChange(async (value) => {
                    this.plugin.settings.showWordCount = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Show character count')
            .setDesc('Display character count in footer')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showCharCount)
                .onChange(async (value) => {
                    this.plugin.settings.showCharCount = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Show line count')
            .setDesc('Display line count in footer')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showLineCount)
                .onChange(async (value) => {
                    this.plugin.settings.showLineCount = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Auto-stash on fetch')
            .setDesc('Automatically stash current content when fetching a different stash (instead of showing confirmation dialog)')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoStashOnFetch)
                .onChange(async (value) => {
                    this.plugin.settings.autoStashOnFetch = value;
                    await this.plugin.saveSettings();
                }));
    }
}