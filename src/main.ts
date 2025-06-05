import { Plugin } from "obsidian";
import { ScratchpadView, VIEW_TYPE_SCRATCHPAD } from "./scratchpadview";

export default class ScratchpadPlugin extends Plugin {
    async onload() {
        this.registerView(VIEW_TYPE_SCRATCHPAD, (leaf) => new ScratchpadView(leaf));

        this.addRibbonIcon("notebook-pen", "Open scratchpad", () => {
            this.toggleView();
        });

        this.addCommand({
            id: "open-scratchpad-view",
            name: "Open scratchpad",
            callback: () => this.activateView(),
        });
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

        if (activeView) {
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