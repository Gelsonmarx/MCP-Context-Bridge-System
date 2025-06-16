import fs from 'fs/promises';
import path from 'path';
import { fileExists, readFile, writeFile, appendFile } from './utils.js';
/**
 * Manages the project context, including loading, updating, and caching.
 * Follows a "lazy loading" and "cache-first" strategy for performance.
 */
export class ContextManager {
    cache = new Map();
    projectRoot = process.cwd();
    contextDir = path.join(this.projectRoot, '.context');
    /**
     * Loads the project context, optionally filtering by a focus area.
     * Uses a cache to avoid redundant file reads.
     */
    async loadContext(focus) {
        try {
            const context = await this.getContextWithCache();
            // Filter patterns based on the focus keyword, or take the most relevant if no focus is provided.
            const relevantPatterns = focus
                ? context.patterns.filter(p => p.toLowerCase().includes(focus.toLowerCase()))
                : context.patterns.slice(0, 3); // Default to the 3 most relevant patterns.
            const contextText = this.formatContextForDisplay(context, relevantPatterns, focus);
            return { content: [{ type: 'text', text: contextText }] };
        }
        catch (error) {
            // Guide the user to initialize the context if it's not found.
            return {
                content: [{
                        type: 'text',
                        text: `⚠️ Context not found. Please run 'context_update' with a summary (e.g., 'Initial project setup') to create the necessary context files.`
                    }]
            };
        }
    }
    /**
     * Updates the context files based on the latest development session.
     * This operation is atomic and clears the cache to ensure fresh data on next load.
     */
    async updateContext(args) {
        const timestamp = new Date().toISOString();
        try {
            await this.ensureContextStructure();
            // Atomically update all relevant context files
            await Promise.all([
                this.updateCurrentStateFile(args, timestamp),
                this.updateActiveContextFile(args, timestamp),
                this.logSessionToFile(args, timestamp)
            ]);
            this.cache.clear(); // Invalidate cache after update
            return {
                content: [{
                        type: 'text',
                        text: `✅ **Context updated successfully!**\n\n**Summary:** ${args.summary}\n**Time:** ${timestamp}\n\n*Ready for the next session.*`
                    }]
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
            return {
                content: [{ type: 'text', text: `❌ Context update failed: ${errorMessage}` }]
            };
        }
    }
    /**
     * Retrieves the project context from cache or file system.
     */
    async getContextWithCache() {
        const cacheKey = 'full_project_context';
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }
        const [dna, state, patterns] = await Promise.all([
            readFile(path.join(this.contextDir, 'PROJECT_DNA.md')),
            readFile(path.join(this.contextDir, 'CURRENT_STATE.md')),
            this.readAllPatterns()
        ]);
        const context = { dna, state, patterns };
        this.cache.set(cacheKey, context);
        return context;
    }
    /**
     * Reads all pattern files from the '.context/patterns' directory.
     */
    async readAllPatterns() {
        const patternsDir = path.join(this.contextDir, 'patterns');
        if (!await fileExists(patternsDir)) {
            return [];
        }
        const files = await fs.readdir(patternsDir);
        const patternPromises = files
            .filter(f => f.endsWith('.md'))
            .map(async (file) => {
            const content = await readFile(path.join(patternsDir, file));
            // Format pattern with its title derived from the filename.
            return `### ${file.replace('.md', '').replace(/_/g, ' ')}\n${content}`;
        });
        return Promise.all(patternPromises);
    }
    /**
     * Formats the context into a single markdown string for the AI model.
     */
    formatContextForDisplay(context, patterns, focus) {
        return `# 🧠 PROJECT CONTEXT ${focus ? `- FOCUS: ${focus.toUpperCase()}` : ''}

## 🧬 PROJECT DNA
${context.dna}

## 📊 CURRENT STATE
${context.state}

${patterns.length > 0 ? `## 🧩 ACTIVE PATTERNS\n${patterns.join('\n\n')}` : ''}

---
*Context loaded at: ${new Date().toISOString()}*
*CBS-MCP Lean: Ready for development.*`;
    }
    /**
     * Updates the CURRENT_STATE.md file.
     */
    async updateCurrentStateFile(args, timestamp) {
        const content = `# CURRENT STATE
## Last Updated: ${timestamp}

### Summary of Last Session
${args.summary}

### Completed Tasks
${args.completed?.length ? args.completed.map((t) => `- ✅ ${t}`).join('\n') : 'N/A'}

### Next Steps
${args.next?.length ? args.next.map((t) => `- 🎯 ${t}`).join('\n') : 'To be planned.'}

### Recent Decisions
${args.decisions?.length ? args.decisions.map((d) => `- 📝 ${d}`).join('\n') : 'N/A'}
`;
        await writeFile(path.join(this.contextDir, 'CURRENT_STATE.md'), content);
    }
    /**
     * Updates the ACTIVE_CONTEXT.md file for quick reference.
     */
    async updateActiveContextFile(args, timestamp) {
        const content = `# ACTIVE CONTEXT (For Quick Reference)
## Updated: ${timestamp}

## Immediate Focus
${args.next?.[0] || 'Define the next immediate task.'}

## Summary
${args.summary}
`;
        await writeFile(path.join(this.contextDir, 'ACTIVE_CONTEXT.md'), content);
    }
    /**
     * Appends a summary of the session to the SESSION_LOG.md file.
     */
    async logSessionToFile(args, timestamp) {
        const logEntry = `
---
## SESSION LOG: ${timestamp}
**Summary:** ${args.summary}
**Completed:** ${args.completed?.join(', ') || 'N/A'}
**Decisions:** ${args.decisions?.join(', ') || 'N/A'}
`;
        await appendFile(path.join(this.contextDir, 'SESSION_LOG.md'), logEntry);
    }
    /**
     * Ensures the necessary .context directory structure exists.
     * Creates a default PROJECT_DNA.md if it's missing.
     */
    async ensureContextStructure() {
        await fs.mkdir(path.join(this.contextDir, 'patterns'), { recursive: true });
        const dnaPath = path.join(this.contextDir, 'PROJECT_DNA.md');
        if (!await fileExists(dnaPath)) {
            await writeFile(dnaPath, this.getDefaultProjectDNA());
        }
    }
    /**
     * Provides a default template for the PROJECT_DNA.md file.
     */
    getDefaultProjectDNA() {
        return `# 🧬 PROJECT DNA
## Core Vision
- **What is this project?** [A brief, high-level description of the project's purpose.]
- **Who is it for?** [Describe the target user or audience.]
- **What problem does it solve?** [Explain the core problem this project addresses.]

## Technical Stack
- **Frontend:** [e.g., React, Vue, Svelte]
- **Backend:** [e.g., Node.js with Express, Python with Django]
- **Database:** [e.g., PostgreSQL, MongoDB]
- **Deployment:** [e.g., Vercel, AWS, Docker]

## Guiding Principles
1. **Simplicity:** Prefer simple, clear solutions over complex ones.
2. **Performance:** Optimize for speed and efficiency.
3. **Developer Experience:** Maintain a clean, well-documented codebase.

## Key Conventions
- **Commit Messages:** [e.g., Conventional Commits]
- **Code Style:** [e.g., Prettier, ESLint with a specific config]
- **API Design:** [e.g., RESTful, GraphQL]
`;
    }
}
