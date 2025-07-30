# Scratchpad Enhanced

**Scratchpad Enhanced** builds upon the excellent foundation of the original [Scratchpad plugin by KVH](https://github.com/kvh03/obsidian-scratchpad). This enhanced version focuses specifically on improving the **text note-taking experience** with additional organizational and usability features.

## Credit & Original Work

This plugin is based on the original **Scratchpad** plugin by **KVH** ([kvh03](https://github.com/kvh03)). The original plugin provided the core functionality of a sidebar text area for quick notes. All credit for the foundational concept and implementation goes to the original author.

## What's Enhanced

This version enhances the **text functionality** of the original plugin with:

### 🗂️ **Stash Management**
- **Multiple Note Storage**: Save and organize multiple text notes in a sliding drawer
- **Quick Access**: Easily switch between different notes without losing content
- **Lazy Loading**: Efficiently handles large numbers of stashed notes
- **Bulk Management**: Clear all stashes with confirmation

### 📊 **Statistics & Feedback**
- **Real-time Counts**: Word, character, and line counts in footer
- **Selection Stats**: Shows stats for selected text when highlighting
- **Visual Feedback**: Toast notifications and clear status indicators

### ⚙️ **Configuration & Control**
- **Settings Panel**: Configure maximum stashes, auto-eviction, note limits
- **Smart Limits**: Prevents performance issues with configurable boundaries
- **Auto-save**: Content automatically persists without manual saving

### 🎨 **UI/UX Improvements**  
- **Enhanced Contrast**: Lighter textarea background for better visibility
- **Quick Navigation**: Jump to top/bottom buttons
- **Copy to Clipboard**: One-click content copying
- **Error Handling**: Comprehensive error messages and confirmations

## What's Removed

### ❌ **Canvas Drawing Feature**
- **Simplified Focus**: The original plugin's canvas drawing functionality has been completely removed
- **Text-Only Approach**: This enhanced version is purely focused on text note-taking and organization

## Command Palette

- **Enhanced Version**: `Scratchpad Enhanced: Open scratchpad`


## Installation

Since this is a customized version, it needs to be manually installed:

1. Download or clone this repository
2. Copy the `dist` folder contents to your `.obsidian/plugins/scratchpad-enhanced/` directory
3. Enable the plugin in Obsidian Settings → Community Plugins

## Usage

1. Use the command palette (`Ctrl/Cmd + P`) and search for `Scratchpad Enhanced`
2. Or click the notebook-pen icon in the ribbon
3. The plugin opens in the sidebar with enhanced text editing capabilities
4. Use the hamburger menu (☰) to access your stashed notes

## Technical Notes

- **Plugin ID**: `scratchpad-enhanced` (won't conflict with original)
- **Data Storage**: Uses separate data files from the original plugin
- **Compatibility**: Designed to work alongside the original plugin if desired

## License

MIT
