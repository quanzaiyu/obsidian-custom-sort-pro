import { TreeNode } from './DragDropTree';

/**
 * Generates sorting-spec YAML for obsidian-custom-sort.
 * Uses target-folder: . for folder-specific sorting.
 * Cleans up entries that no longer exist in the folder.
 */
export class SortSpecGenerator {

	/**
	 * Generate sorting-spec for a specific folder.
	 * Uses target-folder: . to apply to the containing folder.
	 * Only includes entries that exist in the current tree.
	 */
	generateSortSpec(folderPath: string, tree: TreeNode[]): string {
		const lines: string[] = [];
		lines.push('---');
		lines.push('sorting-spec: |');

		// Use '.' for current folder (contains sortspec.md)
		// Or absolute path like '/' for root
		const targetFolder = folderPath === '/' ? '/' : '.';
		lines.push(`    target-folder: ${targetFolder}`);

		lines.push(...this.buildSpecLines(tree));
		lines.push('---');
		return lines.join('\n');
	}

	private buildSpecLines(nodes: TreeNode[]): string[] {
		const lines: string[] = [];
		const indent = '    ';

		// Only process the current level nodes, NOT their children
		// Subfolder contents should be managed by their own sortspec files
		for (const node of nodes) {
			// For .md files in sorting-spec, use name without .md extension
			const name = node.name.endsWith('.md') ? node.name.slice(0, -3) : node.name;
			lines.push(`${indent}${name}`);
			// Do NOT recurse into children - each folder manages its own sortspec
		}
		return lines;
	}

	/**
	 * Generate flat list for reference
	 */
	generateFlatList(tree: TreeNode[]): string[] {
		return this.buildSpecLines(tree);
	}

	/**
	 * Build a set of all file/folder names that exist in the tree (without .md for .md files)
	 */
	getExistingNames(tree: TreeNode[]): Set<string> {
		const names = new Set<string>();
		const traverse = (nodes: TreeNode[]) => {
			for (const node of nodes) {
				const name = node.name.endsWith('.md') ? node.name.slice(0, -3) : node.name;
				names.add(name);
				if (node.type === 'folder' && node.children?.length) {
					traverse(node.children);
				}
			}
		};
		traverse(tree);
		return names;
	}

	/**
	 * Parse existing sorting-spec content and return only entries that exist in the tree.
	 * This cleans up entries for deleted files/folders.
	 */
	cleanExistingSortSpec(existingContent: string, existingNames: Set<string>): string {
		const lines = existingContent.split('\n');

		// Find the sorting-spec section
		const startIndex = lines.findIndex(l => l.trim().startsWith('sorting-spec:'));
		if (startIndex === -1) {
			// No sorting-spec found, return minimal valid content
			return '---\nsorting-spec: |\n    target-folder: .\n---\n';
		}

		// Find the end of the block (--- or end of content)
		let endIndex = lines.findIndex((l, i) => i > startIndex && l.trim() === '---');
		if (endIndex === -1) endIndex = lines.length;

		// Build result with proper frontmatter markers
		const resultLines: string[] = ['---'];

		for (let i = startIndex; i < endIndex; i++) {
			const line = lines[i];
			const trimmed = line.trim();

			// Skip sorting-spec: | line (will add our own)
			if (trimmed.startsWith('sorting-spec:')) {
				resultLines.push(line);
				continue;
			}

			// Track target-folder
			if (trimmed.startsWith('target-folder:')) {
				resultLines.push(line);
				continue;
			}

			// Skip comments and empty lines
			if (trimmed.startsWith('#') || trimmed === '') {
				resultLines.push(line);
				continue;
			}

			// Check if this entry exists in the tree
			const entryName = trimmed;
			if (existingNames.has(entryName)) {
				resultLines.push(line);
			}
			// Entries that don't exist are skipped (cleaned up)
		}

		resultLines.push('---');
		return resultLines.join('\n');
	}
}