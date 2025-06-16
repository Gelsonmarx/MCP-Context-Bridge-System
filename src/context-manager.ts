import fs from 'fs/promises';
import path from 'path';
import { fileExists, readFile as originalReadFile, writeFile as originalWriteFile, appendFile as originalAppendFile } from './utils.js';
import { SmartCache } from './smart-cache.js';

// Define a estrutura para o contexto do projeto em memória.
interface ProjectContext {
  dna: string;
  state: string;
  patterns: string[];
}

/**
 * Gerencia o contexto do projeto, incluindo carregamento, atualização e cache.
 * Usa um SmartCache para cache granular de conteúdo de arquivo, focado em performance.
 */
export class ContextManager {
  // Utiliza o SmartCache para armazenar o conteúdo dos arquivos com TTL e política de remoção LRU.
  private fileCache = new SmartCache<string>(50, 10 * 60 * 1000); // Cache para 50 arquivos, com 10 min de TTL
  private readonly projectRoot = process.cwd();
  private readonly contextDir = path.join(this.projectRoot, '.context');

  /**
   * Carrega o contexto do projeto, opcionalmente filtrando por uma área de foco.
   * Usa um cache para evitar leituras de arquivo redundantes.
   */
  async loadContext(focus?: string): Promise<{ content: { type: 'text'; text: string }[] }> {
    try {
      // Carrega os componentes do contexto de forma granular, aproveitando o cache de arquivos.
      const [dna, state, patterns] = await Promise.all([
        this._readFile(path.join(this.contextDir, 'PROJECT_DNA.md')),
        this._readFile(path.join(this.contextDir, 'CURRENT_STATE.md')),
        this.readAllPatterns()
      ]);

      const context: ProjectContext = { dna, state, patterns };
      
      // Filtra os padrões com base na palavra-chave de foco ou pega os mais relevantes se nenhum foco for fornecido.
      const relevantPatterns = focus 
        ? context.patterns.filter(p => p.toLowerCase().includes(focus.toLowerCase()))
        : context.patterns.slice(0, 3); // Padrão para os 3 padrões mais relevantes (agora ordenados por data de modificação).
      
      const contextText = this.formatContextForDisplay(context, relevantPatterns, focus);
      
      return { content: [{ type: 'text', text: contextText }] };
    } catch (error) {
      // Guia o usuário para inicializar o contexto se ele não for encontrado.
      return {
        content: [{ 
          type: 'text', 
          text: `⚠️ Context not found. Please run 'context_update' with a summary (e.g., 'Initial project setup') to create the necessary context files.` 
        }]
      };
    }
  }
  
  /**
   * Atualiza os arquivos de contexto com base na última sessão de desenvolvimento.
   * Esta operação é atômica e invalida o cache para os arquivos atualizados.
   */
  async updateContext(args: any): Promise<{ content: { type: 'text'; text: string }[] }> {
    const timestamp = new Date().toISOString();
    
    try {
      await this.ensureContextStructure();
      
      // Atualiza atomicamente todos os arquivos de contexto relevantes.
      await Promise.all([
        this.updateCurrentStateFile(args, timestamp),
        this.updateActiveContextFile(args, timestamp),
        this.logSessionToFile(args, timestamp)
      ]);
            
      return {
        content: [{ 
          type: 'text', 
          text: `✅ **Context updated successfully!**\n\n**Summary:** ${args.summary}\n**Time:** ${timestamp}\n\n*Ready for the next session.*` 
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
      return {
        content: [{ type: 'text', text: `❌ Context update failed: ${errorMessage}` }]
      };
    }
  }

  /**
   * Lê todos os arquivos de padrão do diretório '.context/patterns',
   * ordenados pelos mais recentemente modificados.
   */
  private async readAllPatterns(): Promise<string[]> {
    const patternsDir = path.join(this.contextDir, 'patterns');
    if (!await fileExists(patternsDir)) {
      return [];
    }

    const allFiles = await fs.readdir(patternsDir);
    const mdFiles = allFiles.filter(f => f.endsWith('.md'));

    // Obtém detalhes e data de modificação para cada arquivo.
    const fileDetails = await Promise.all(
      mdFiles.map(async file => {
        const filePath = path.join(patternsDir, file);
        const stats = await fs.stat(filePath);
        return { file, filePath, mtime: stats.mtime };
      })
    );

    // Ordena os arquivos pela data de modificação (mais recente primeiro).
    fileDetails.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    // Lê o conteúdo dos arquivos já ordenados.
    const patternPromises = fileDetails.map(async (detail) => {
        const content = await this._readFile(detail.filePath); // Usa o leitor com cache.
        // Formata o padrão com seu título derivado do nome do arquivo.
        return `### ${detail.file.replace('.md', '').replace(/_/g, ' ')}\n${content}`;
      });
      
    return Promise.all(patternPromises);
  }
  
  /**
   * Formata o contexto em uma única string de markdown para o modelo de IA.
   */
  private formatContextForDisplay(context: ProjectContext, patterns: string[], focus?: string): string {
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
   * Atualiza o arquivo CURRENT_STATE.md.
   */
  private async updateCurrentStateFile(args: any, timestamp: string): Promise<void> {
    const content = `# CURRENT STATE
## Last Updated: ${timestamp}

### Summary of Last Session
${args.summary}

### Completed Tasks
${args.completed?.length ? args.completed.map((t: string) => `- ✅ ${t}`).join('\n') : 'N/A'}

### Next Steps
${args.next?.length ? args.next.map((t: string) => `- 🎯 ${t}`).join('\n') : 'To be planned.'}

### Recent Decisions
${args.decisions?.length ? args.decisions.map((d: string) => `- 📝 ${d}`).join('\n') : 'N/A'}
`;
    await this._writeFile(path.join(this.contextDir, 'CURRENT_STATE.md'), content);
  }
  
  /**
   * Atualiza o arquivo ACTIVE_CONTEXT.md para referência rápida.
   */
  private async updateActiveContextFile(args: any, timestamp: string): Promise<void> {
    const content = `# ACTIVE CONTEXT (For Quick Reference)
## Updated: ${timestamp}

## Immediate Focus
${args.next?.[0] || 'Define the next immediate task.'}

## Summary
${args.summary}
`;
    await this._writeFile(path.join(this.contextDir, 'ACTIVE_CONTEXT.md'), content);
  }

  /**
   * Anexa um resumo da sessão ao arquivo SESSION_LOG.md.
   */
  private async logSessionToFile(args: any, timestamp: string): Promise<void> {
    const logEntry = `
---
## SESSION LOG: ${timestamp}
**Summary:** ${args.summary}
**Completed:** ${args.completed?.join(', ') || 'N/A'}
**Decisions:** ${args.decisions?.join(', ') || 'N/A'}
`;
    await this._appendFile(path.join(this.contextDir, 'SESSION_LOG.md'), logEntry);
  }
  
  /**
   * Garante que a estrutura de diretórios .context necessária exista.
   * Cria um PROJECT_DNA.md padrão se estiver ausente.
   */
  private async ensureContextStructure(): Promise<void> {
    await fs.mkdir(path.join(this.contextDir, 'patterns'), { recursive: true });

    const dnaPath = path.join(this.contextDir, 'PROJECT_DNA.md');
    if (!await fileExists(dnaPath)) {
      await this._writeFile(dnaPath, this.getDefaultProjectDNA());
    }
  }
  
  /**
   * Fornece um template padrão para o arquivo PROJECT_DNA.md.
   */
  private getDefaultProjectDNA(): string {
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

  // --- Métodos de I/O com Cache ---

  /**
   * Lê um arquivo usando uma estratégia "cache-first".
   */
  private async _readFile(filePath: string): Promise<string> {
    const cachedContent = this.fileCache.get(filePath);
    if (cachedContent !== null) {
      return cachedContent;
    }

    const fileContent = await originalReadFile(filePath);
    this.fileCache.set(filePath, fileContent);
    return fileContent;
  }

  /**
   * Escreve em um arquivo e invalida sua entrada no cache.
   */
  private async _writeFile(filePath: string, content: string): Promise<void> {
    await originalWriteFile(filePath, content);
    this.fileCache.invalidatePattern(new RegExp(`^${filePath}$`)); // Invalida a chave exata
  }

  /**
   * Anexa a um arquivo e invalida sua entrada no cache.
   */
  private async _appendFile(filePath: string, content: string): Promise<void> {
    await originalAppendFile(filePath, content);
    this.fileCache.invalidatePattern(new RegExp(`^${filePath}$`)); // Invalida a chave exata
  }
}