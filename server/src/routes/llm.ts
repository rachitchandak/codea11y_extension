import { Router, Request, Response } from 'express';
import { AzureOpenAI } from 'openai';
import { getDatabase, saveDatabase } from '../database';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// In-memory storage for assistants and threads (per user session)
const assistantCache = new Map<string, { assistantId: string; client: AzureOpenAI }>();
const threadCache = new Map<string, string>(); // sessionId -> threadId

// Helper to get Azure client for a user
function getAzureClient(userId: number): { client: AzureOpenAI; deploymentName: string; workerDeploymentName: string } | null {
    const db = getDatabase();
    const result = db.exec(`
        SELECT azure_api_key, azure_resource_name, azure_deployment_name, worker_deployment_name, api_version
        FROM api_configs WHERE user_id = ?
    `, [userId]);

    if (result.length === 0 || result[0].values.length === 0) {
        return null;
    }

    const row = result[0].values[0];
    const [apiKey, resourceName, deploymentName, workerDeploymentName, apiVersion] = row as string[];

    if (!apiKey || !resourceName || !deploymentName) {
        return null;
    }

    const client = new AzureOpenAI({
        apiKey,
        endpoint: `https://${resourceName}.openai.azure.com`,
        apiVersion: apiVersion || '2025-01-01-preview',
        deployment: deploymentName
    });

    return { client, deploymentName, workerDeploymentName: workerDeploymentName || deploymentName };
}

// Helper to log API call
function logApiCall(
    sessionId: string,
    userId: number,
    agentType: 'manager' | 'worker' | 'intent' | 'chat',
    endpoint: string,
    requestData: any,
    responseData: any,
    durationMs: number,
    tokensUsed?: number
) {
    const db = getDatabase();

    // Ensure session exists
    db.run(`
        INSERT OR IGNORE INTO llm_sessions (id, user_id, started_at, status)
        VALUES (?, ?, datetime('now'), 'active')
    `, [sessionId, userId]);

    // Log the call
    db.run(`
        INSERT INTO llm_calls (session_id, timestamp, agent_type, endpoint, request_json, response_json, duration_ms, tokens_used)
        VALUES (?, datetime('now'), ?, ?, ?, ?, ?, ?)
    `, [
        sessionId,
        agentType,
        endpoint,
        JSON.stringify(requestData),
        JSON.stringify(responseData),
        durationMs,
        tokensUsed || 0
    ]);

    saveDatabase();
}

// ==========================================
// Chat Completions Endpoint (for Worker & Intent)
// ==========================================
router.post('/chat', authenticate, async (req: Request, res: Response) => {
    const startTime = Date.now();
    const userId = (req as any).user.id;
    const { sessionId, messages, model, response_format, max_tokens, agentType = 'worker' } = req.body;

    if (!sessionId || !messages) {
        return res.status(400).json({ error: 'sessionId and messages are required' });
    }

    const azureConfig = getAzureClient(userId);
    if (!azureConfig) {
        return res.status(400).json({ error: 'API configuration not found. Contact admin.' });
    }

    try {
        const deploymentName = agentType === 'worker'
            ? azureConfig.workerDeploymentName
            : azureConfig.deploymentName;

        const response = await azureConfig.client.chat.completions.create({
            model: deploymentName,
            messages,
            max_completion_tokens: max_tokens || 4000,
            response_format: response_format || undefined
        });

        const content = response.choices[0]?.message?.content || '';
        const usage = response.usage;

        logApiCall(
            sessionId,
            userId,
            agentType,
            '/chat',
            { messages: messages.map((m: any) => ({ role: m.role, content: m.content })) },
            { content, usage },
            Date.now() - startTime,
            usage?.total_tokens
        );

        res.json({
            content,
            usage,
            sessionId
        });
    } catch (error: any) {
        console.error('LLM Chat error:', error.message);
        res.status(500).json({ error: error.message || 'LLM request failed' });
    }
});

// ==========================================
// Assistants API Endpoints (for Manager)
// ==========================================

// Create Assistant
router.post('/assistants/create', authenticate, async (req: Request, res: Response) => {
    const startTime = Date.now();
    const userId = (req as any).user.id;
    const { sessionId, name, instructions } = req.body;

    if (!sessionId) {
        return res.status(400).json({ error: 'sessionId is required' });
    }

    const azureConfig = getAzureClient(userId);
    if (!azureConfig) {
        return res.status(400).json({ error: 'API configuration not found' });
    }

    try {
        const assistant = await azureConfig.client.beta.assistants.create({
            name: name || 'CodeA11y Assistant',
            instructions: instructions || 'You are a helpful assistant.',
            model: azureConfig.deploymentName
        });

        // Cache the assistant with client for future calls
        assistantCache.set(`${sessionId}:${assistant.id}`, {
            assistantId: assistant.id,
            client: azureConfig.client
        });

        logApiCall(
            sessionId,
            userId,
            'manager',
            '/assistants/create',
            { name, instructions },
            { assistantId: assistant.id },
            Date.now() - startTime
        );

        res.json({ assistantId: assistant.id, sessionId });
    } catch (error: any) {
        console.error('Create assistant error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Create Thread
router.post('/assistants/:assistantId/threads', authenticate, async (req: Request, res: Response) => {
    const startTime = Date.now();
    const userId = (req as any).user.id;
    const { assistantId } = req.params;
    const { sessionId } = req.body;

    if (!sessionId) {
        return res.status(400).json({ error: 'sessionId is required' });
    }

    const azureConfig = getAzureClient(userId);
    if (!azureConfig) {
        return res.status(400).json({ error: 'API configuration not found' });
    }

    try {
        const thread = await azureConfig.client.beta.threads.create();

        // Cache thread for session
        threadCache.set(sessionId, thread.id);

        logApiCall(
            sessionId,
            userId,
            'manager',
            '/threads/create',
            { assistantId },
            { threadId: thread.id },
            Date.now() - startTime
        );

        res.json({ threadId: thread.id, sessionId });
    } catch (error: any) {
        console.error('Create thread error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Add Message to Thread
router.post('/threads/:threadId/messages', authenticate, async (req: Request, res: Response) => {
    const startTime = Date.now();
    const userId = (req as any).user.id;
    const { threadId } = req.params;
    const { sessionId, role, content } = req.body;

    if (!sessionId || !content) {
        return res.status(400).json({ error: 'sessionId and content are required' });
    }

    const azureConfig = getAzureClient(userId);
    if (!azureConfig) {
        return res.status(400).json({ error: 'API configuration not found' });
    }

    try {
        const message = await azureConfig.client.beta.threads.messages.create(threadId, {
            role: role || 'user',
            content
        });

        logApiCall(
            sessionId,
            userId,
            'manager',
            '/threads/messages/create',
            { threadId, content },
            { messageId: message.id },
            Date.now() - startTime
        );

        res.json({ messageId: message.id, sessionId });
    } catch (error: any) {
        console.error('Add message error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Create Run
router.post('/threads/:threadId/runs', authenticate, async (req: Request, res: Response) => {
    const startTime = Date.now();
    const userId = (req as any).user.id;
    const { threadId } = req.params;
    const { sessionId, assistantId } = req.body;

    if (!sessionId || !assistantId) {
        return res.status(400).json({ error: 'sessionId and assistantId are required' });
    }

    const azureConfig = getAzureClient(userId);
    if (!azureConfig) {
        return res.status(400).json({ error: 'API configuration not found' });
    }

    try {
        const run = await azureConfig.client.beta.threads.runs.create(threadId, {
            assistant_id: assistantId
        });

        logApiCall(
            sessionId,
            userId,
            'manager',
            '/threads/runs/create',
            { threadId, assistantId },
            { runId: run.id, status: run.status },
            Date.now() - startTime
        );

        res.json({ runId: run.id, status: run.status, sessionId });
    } catch (error: any) {
        console.error('Create run error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Get Run Status
router.get('/threads/:threadId/runs/:runId', authenticate, async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { threadId, runId } = req.params;

    const azureConfig = getAzureClient(userId);
    if (!azureConfig) {
        return res.status(400).json({ error: 'API configuration not found' });
    }

    try {
        const run = await azureConfig.client.beta.threads.runs.retrieve(
            runId,
            { thread_id: threadId }
        );
        res.json({
            runId: run.id,
            status: run.status,
            lastError: run.last_error
        });
    } catch (error: any) {
        console.error('Get run error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// List Messages from Thread
router.get('/threads/:threadId/messages', authenticate, async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { threadId } = req.params;

    const azureConfig = getAzureClient(userId);
    if (!azureConfig) {
        return res.status(400).json({ error: 'API configuration not found' });
    }

    try {
        const messages = await azureConfig.client.beta.threads.messages.list(threadId);

        const formattedMessages = messages.data.map(m => ({
            id: m.id,
            role: m.role,
            content: m.content.map(c => c.type === 'text' ? (c as any).text?.value : null).filter(Boolean)
        }));

        res.json({ messages: formattedMessages });
    } catch (error: any) {
        console.error('List messages error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Stream Run (SSE)
router.post('/threads/:threadId/runs/stream', authenticate, async (req: Request, res: Response) => {
    const startTime = Date.now();
    const userId = (req as any).user.id;
    const { threadId } = req.params;
    const { sessionId, assistantId } = req.body;

    if (!sessionId || !assistantId) {
        return res.status(400).json({ error: 'sessionId and assistantId are required' });
    }

    const azureConfig = getAzureClient(userId);
    if (!azureConfig) {
        return res.status(400).json({ error: 'API configuration not found' });
    }

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
        const runStream = azureConfig.client.beta.threads.runs.stream(threadId, {
            assistant_id: assistantId
        });

        let fullResponse = '';

        for await (const event of runStream) {
            if (event.event === 'thread.message.delta') {
                const chunk = (event.data as any).delta?.content?.[0];
                if (chunk?.type === 'text' && chunk.text?.value) {
                    const text = chunk.text.value;
                    fullResponse += text;
                    res.write(`data: ${JSON.stringify({ type: 'chunk', text })}\n\n`);
                }
            } else if (event.event === 'thread.run.completed') {
                res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
            }
        }

        logApiCall(
            sessionId,
            userId,
            'manager',
            '/threads/runs/stream',
            { threadId, assistantId },
            { response: fullResponse },
            Date.now() - startTime
        );

        res.end();
    } catch (error: any) {
        console.error('Stream run error:', error.message);
        res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
        res.end();
    }
});

// Delete Assistant
router.delete('/assistants/:assistantId', authenticate, async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { assistantId } = req.params;
    const { sessionId } = req.body;

    const azureConfig = getAzureClient(userId);
    if (!azureConfig) {
        return res.status(400).json({ error: 'API configuration not found' });
    }

    try {
        await azureConfig.client.beta.assistants.delete(assistantId);

        // Clean up cache
        if (sessionId) {
            assistantCache.delete(`${sessionId}:${assistantId}`);
        }

        res.json({ success: true });
    } catch (error: any) {
        console.error('Delete assistant error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// Complete Chat (Combined: add message + run + poll + get response)
// This simplifies the client-side code significantly
// ==========================================
router.post('/assistants/chat', authenticate, async (req: Request, res: Response) => {
    const startTime = Date.now();
    const userId = (req as any).user.id;
    const { sessionId, assistantId, threadId, message } = req.body;

    if (!sessionId || !assistantId || !threadId || !message) {
        return res.status(400).json({ error: 'sessionId, assistantId, threadId, and message are required' });
    }

    const azureConfig = getAzureClient(userId);
    if (!azureConfig) {
        return res.status(400).json({ error: 'API configuration not found' });
    }

    try {
        // Add message
        await azureConfig.client.beta.threads.messages.create(threadId, {
            role: 'user',
            content: message
        });

        // Create run
        const run = await azureConfig.client.beta.threads.runs.create(threadId, {
            assistant_id: assistantId
        });

        // Poll for completion
        let runStatus = await azureConfig.client.beta.threads.runs.retrieve(
            run.id,
            { thread_id: threadId }
        );
        while (runStatus.status !== 'completed' && runStatus.status !== 'failed') {
            await new Promise(resolve => setTimeout(resolve, 1000));
            runStatus = await azureConfig.client.beta.threads.runs.retrieve(
                run.id,
                { thread_id: threadId }
            );
        }

        if (runStatus.status === 'failed') {
            throw new Error(runStatus.last_error?.message || 'Run failed');
        }

        // Get response
        const messages = await azureConfig.client.beta.threads.messages.list(threadId);
        const assistantMessage = messages.data.find(m => m.role === 'assistant');

        let responseText = '';
        if (assistantMessage) {
            const textContent = assistantMessage.content.find(c => c.type === 'text');
            if (textContent && textContent.type === 'text') {
                responseText = textContent.text.value;
            }
        }

        logApiCall(
            sessionId,
            userId,
            'manager',
            '/assistants/chat',
            { threadId, message },
            { response: responseText },
            Date.now() - startTime
        );

        res.json({ response: responseText, sessionId });
    } catch (error: any) {
        console.error('Assistant chat error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

export default router;
