#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { ContextManager } from './context-manager.js';
// Inicializa o Servidor MCP
const server = new Server({ name: 'cbs-lean', version: '1.0.0' }, { capabilities: { tools: {} } });
const contextManager = new ContextManager();
// Handler para listar as ferramentas disponíveis.
// Agora fornecemos um schema Zod para validar a requisição de entrada.
server.setRequestHandler(z.object({
    method: z.literal('tools/list'),
}), async () => ({
    tools: [
        {
            name: 'context_load',
            description: 'Carrega o contexto completo do projeto automaticamente',
            inputSchema: {
                type: 'object',
                properties: {
                    focus: { type: 'string', description: 'Área de foco opcional para filtrar o contexto' }
                },
                required: []
            }
        },
        {
            name: 'context_update',
            description: 'Atualiza o contexto do projeto após o trabalho de desenvolvimento',
            inputSchema: {
                type: 'object',
                properties: {
                    summary: { type: 'string', description: 'Um breve resumo do trabalho realizado na sessão' },
                    completed: { type: 'array', items: { type: 'string' }, description: 'Lista de tarefas concluídas' },
                    next: { type: 'array', items: { type: 'string' }, description: 'Lista das próximas tarefas a serem trabalhadas' },
                    decisions: { type: 'array', items: { type: 'string' }, description: 'Decisões importantes tomadas' }
                },
                required: ['summary']
            }
        }
    ]
}));
// Handler para executar uma chamada de ferramenta.
// O schema agora define os 'params' esperados, o que corrige o erro de tipo.
server.setRequestHandler(z.object({
    method: z.literal('tools/call'),
    params: z.object({
        name: z.string(),
        arguments: z.any().optional(),
    })
}), async (request) => {
    // O objeto 'request' agora está corretamente tipado com base no schema acima.
    const { name, arguments: args } = request.params;
    try {
        // Roteia a chamada para o método apropriado do contextManager
        switch (name) {
            case 'context_load':
                // O argumento 'focus' é opcional.
                return await contextManager.loadContext(args?.focus);
            case 'context_update':
                // O objeto 'args' deve corresponder ao inputSchema de context_update.
                return await contextManager.updateContext(args);
            default:
                // Trata ferramentas desconhecidas de forma elegante.
                throw new Error(`Ferramenta desconhecida solicitada: ${name}`);
        }
    }
    catch (error) {
        // Retorna uma mensagem de erro estruturada para o cliente.
        const errorMessage = error instanceof Error ? error.message : 'Ocorreu um erro desconhecido.';
        return {
            content: [{ type: 'text', text: `Erro ao executar a ferramenta '${name}': ${errorMessage}` }],
            isError: true
        };
    }
});
// Inicia o servidor e o conecta via I/O padrão
async function startServer() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    // Loga para stderr para evitar interferir com o protocolo de comunicação stdout
    console.error('Servidor CBS-MCP Lean está rodando e conectado.');
}
startServer();
