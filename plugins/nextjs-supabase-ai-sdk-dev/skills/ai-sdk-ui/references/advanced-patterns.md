# Advanced AI SDK UI Patterns

## Multi-Modal AI (Images and Files)

### Image Input with Vision Models

```typescript
'use client';

import { useChat } from 'ai/react';
import { useState } from 'react';

export function VisionChat() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/vision-chat',
  });
  const [imageUrl, setImageUrl] = useState('');

  function handleImageSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Include image in the message
    handleSubmit(e, {
      data: {
        imageUrl,
      },
    });
    setImageUrl('');
  }

  return (
    <div className="space-y-4">
      {messages.map((message) => (
        <div key={message.id}>
          <strong>{message.role}:</strong> {message.content}
          {message.experimental_attachments?.map((attachment, i) => (
            <img key={i} src={attachment.url} alt="Attachment" className="max-w-xs mt-2 rounded" />
          ))}
        </div>
      ))}

      <form onSubmit={handleImageSubmit} className="space-y-2">
        <input
          type="url"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="Image URL (optional)"
          className="w-full p-2 border rounded"
        />
        <div className="flex gap-2">
          <input
            value={input}
            onChange={handleInputChange}
            placeholder="Ask about the image..."
            className="flex-1 p-2 border rounded"
          />
          <button type="submit" disabled={isLoading} className="px-4 py-2 bg-blue-500 text-white rounded">
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
```

**Server route for vision:**
```typescript
import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';

export async function POST(req: Request) {
  const { messages, data } = await req.json();

  // Add image to the last user message if provided
  const messagesWithImage = data?.imageUrl
    ? messages.map((m: any, i: number) =>
        i === messages.length - 1 && m.role === 'user'
          ? {
              ...m,
              content: [
                { type: 'text', text: m.content },
                { type: 'image', image: data.imageUrl },
              ],
            }
          : m
      )
    : messages;

  const result = streamText({
    model: openai('gpt-4o'), // Vision-capable model
    messages: messagesWithImage,
  });

  return result.toDataStreamResponse();
}
```

### File Upload with Attachments

```typescript
'use client';

import { useChat } from 'ai/react';
import { useRef } from 'react';

export function ChatWithFileUpload() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat();
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileSubmit(e: React.FormEvent) {
    e.preventDefault();

    const files = fileInputRef.current?.files;
    if (!files?.length) {
      handleSubmit(e);
      return;
    }

    // Convert files to base64
    const attachments = await Promise.all(
      Array.from(files).map(async (file) => {
        const base64 = await fileToBase64(file);
        return {
          name: file.name,
          contentType: file.type,
          url: base64,
        };
      })
    );

    handleSubmit(e, { experimental_attachments: attachments });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  return (
    <form onSubmit={handleFileSubmit}>
      <input type="file" ref={fileInputRef} multiple accept="image/*,.pdf" />
      <input value={input} onChange={handleInputChange} />
      <button type="submit" disabled={isLoading}>Send</button>
    </form>
  );
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
```

## Conversation Memory and Persistence

### Persisting Chat History with Supabase

```typescript
// lib/chat-storage.ts
import { createClient } from '@supabase/supabase-js';
import type { Message } from 'ai';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function saveConversation(
  conversationId: string,
  userId: string,
  messages: Message[]
) {
  const { error } = await supabase
    .from('conversations')
    .upsert({
      id: conversationId,
      user_id: userId,
      messages: JSON.stringify(messages),
      updated_at: new Date().toISOString(),
    });

  if (error) throw error;
}

export async function loadConversation(
  conversationId: string
): Promise<Message[] | null> {
  const { data, error } = await supabase
    .from('conversations')
    .select('messages')
    .eq('id', conversationId)
    .single();

  if (error || !data) return null;
  return JSON.parse(data.messages);
}

export async function listConversations(userId: string) {
  const { data, error } = await supabase
    .from('conversations')
    .select('id, updated_at, messages')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) throw error;

  return data.map((conv) => ({
    id: conv.id,
    updatedAt: conv.updated_at,
    preview: JSON.parse(conv.messages)[0]?.content.slice(0, 50) || 'New conversation',
  }));
}
```

**Chat component with persistence:**
```typescript
'use client';

import { useChat } from 'ai/react';
import { useEffect } from 'react';
import { saveConversation, loadConversation } from '@/lib/chat-storage';

export function PersistentChat({
  conversationId,
  userId,
}: {
  conversationId: string;
  userId: string;
}) {
  const { messages, setMessages, input, handleInputChange, handleSubmit } = useChat({
    id: conversationId,
    onFinish: async (message) => {
      // Save after each AI response
      await saveConversation(conversationId, userId, [...messages, message]);
    },
  });

  // Load existing conversation on mount
  useEffect(() => {
    async function load() {
      const saved = await loadConversation(conversationId);
      if (saved) {
        setMessages(saved);
      }
    }
    load();
  }, [conversationId, setMessages]);

  return (
    <div>
      {messages.map((m) => (
        <div key={m.id}>{m.content}</div>
      ))}
      <form onSubmit={handleSubmit}>
        <input value={input} onChange={handleInputChange} />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
```

### Conversation Context Window Management

```typescript
import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';

// Trim messages to fit context window
function trimMessages(messages: any[], maxTokens: number = 4000) {
  const estimatedTokensPerChar = 0.25;
  let totalTokens = 0;
  const trimmed = [];

  // Always keep the system message
  const systemMessage = messages.find(m => m.role === 'system');
  if (systemMessage) {
    trimmed.push(systemMessage);
    totalTokens += systemMessage.content.length * estimatedTokensPerChar;
  }

  // Add messages from newest to oldest
  const nonSystemMessages = messages.filter(m => m.role !== 'system').reverse();

  for (const message of nonSystemMessages) {
    const tokens = message.content.length * estimatedTokensPerChar;
    if (totalTokens + tokens > maxTokens) break;
    trimmed.unshift(message);
    totalTokens += tokens;
  }

  return trimmed;
}

export async function POST(req: Request) {
  const { messages } = await req.json();

  const trimmedMessages = trimMessages(messages, 4000);

  const result = streamText({
    model: openai('gpt-4o'),
    messages: trimmedMessages,
  });

  return result.toDataStreamResponse();
}
```

## Custom AI Providers

### Using Multiple Providers

```typescript
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { streamText } from 'ai';

const providers = {
  openai: openai('gpt-4o'),
  claude: anthropic('claude-sonnet-4-20250514'),
  gemini: google('gemini-1.5-pro'),
};

export async function POST(req: Request) {
  const { messages, provider = 'openai' } = await req.json();

  const model = providers[provider as keyof typeof providers];

  if (!model) {
    return new Response('Invalid provider', { status: 400 });
  }

  const result = streamText({
    model,
    messages,
  });

  return result.toDataStreamResponse();
}
```

**Client with provider selection:**
```typescript
'use client';

import { useChat } from 'ai/react';
import { useState } from 'react';

export function MultiProviderChat() {
  const [provider, setProvider] = useState('openai');

  const { messages, input, handleInputChange, handleSubmit } = useChat({
    body: { provider },
  });

  return (
    <div>
      <select value={provider} onChange={(e) => setProvider(e.target.value)}>
        <option value="openai">OpenAI GPT-4</option>
        <option value="claude">Anthropic Claude</option>
        <option value="gemini">Google Gemini</option>
      </select>

      {messages.map((m) => (
        <div key={m.id}>{m.content}</div>
      ))}

      <form onSubmit={handleSubmit}>
        <input value={input} onChange={handleInputChange} />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
```

### Custom Model Configuration

```typescript
import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';

export async function POST(req: Request) {
  const { messages, temperature = 0.7, maxTokens = 1000 } = await req.json();

  const result = streamText({
    model: openai('gpt-4o', {
      // Custom configuration
    }),
    messages,
    temperature,
    maxTokens,
    // Structured output
    experimental_output: {
      type: 'json',
      schema: {
        type: 'object',
        properties: {
          response: { type: 'string' },
          confidence: { type: 'number' },
        },
      },
    },
  });

  return result.toDataStreamResponse();
}
```

## Streaming with Server Actions (RSC)

### createStreamableUI Pattern

```typescript
'use server';

import { createStreamableUI } from 'ai/rsc';
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';

export async function streamingAction(prompt: string) {
  const ui = createStreamableUI();

  // Start with loading state
  ui.update(<div className="animate-pulse">Thinking...</div>);

  // Run AI generation asynchronously
  (async () => {
    try {
      const { text } = await generateText({
        model: openai('gpt-4o'),
        prompt,
      });

      // Update with final result
      ui.done(
        <div className="p-4 bg-green-50 rounded">
          <p>{text}</p>
        </div>
      );
    } catch (error) {
      ui.error(
        <div className="p-4 bg-red-50 text-red-700 rounded">
          Error: {String(error)}
        </div>
      );
    }
  })();

  return ui.value;
}
```

### createStreamableValue for Data

```typescript
'use server';

import { createStreamableValue } from 'ai/rsc';
import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';

export async function streamTextAction(prompt: string) {
  const stream = createStreamableValue('');

  (async () => {
    const result = streamText({
      model: openai('gpt-4o'),
      prompt,
    });

    for await (const text of result.textStream) {
      stream.update(text);
    }

    stream.done();
  })();

  return stream.value;
}
```

**Client consuming streamable value:**
```typescript
'use client';

import { useStreamableValue } from 'ai/rsc';
import { streamTextAction } from './actions';
import { useState } from 'react';

export function StreamableDemo() {
  const [streamableValue, setStreamableValue] = useState<any>(null);
  const [value] = useStreamableValue(streamableValue);

  async function handleGenerate() {
    const result = await streamTextAction('Write a poem about coding');
    setStreamableValue(result);
  }

  return (
    <div>
      <button onClick={handleGenerate}>Generate</button>
      {value && <pre className="whitespace-pre-wrap">{value}</pre>}
    </div>
  );
}
```

## Real-Time Collaboration

### Shared Chat with Supabase Realtime

```typescript
'use client';

import { useChat } from 'ai/react';
import { useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export function CollaborativeChat({ roomId }: { roomId: string }) {
  const { messages, setMessages, input, handleInputChange, handleSubmit, append } = useChat();

  useEffect(() => {
    // Subscribe to new messages
    const channel = supabase
      .channel(`chat:${roomId}`)
      .on('broadcast', { event: 'message' }, ({ payload }) => {
        append(payload.message);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, append]);

  async function handleCollaborativeSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Broadcast message to other participants
    await supabase.channel(`chat:${roomId}`).send({
      type: 'broadcast',
      event: 'message',
      payload: {
        message: { role: 'user', content: input, id: Date.now().toString() },
      },
    });

    handleSubmit(e);
  }

  return (
    <div>
      {messages.map((m) => (
        <div key={m.id}>{m.content}</div>
      ))}
      <form onSubmit={handleCollaborativeSubmit}>
        <input value={input} onChange={handleInputChange} />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
```

## Rate Limiting and Error Handling

### Client-Side Rate Limiting

```typescript
'use client';

import { useChat } from 'ai/react';
import { useState, useCallback } from 'react';

export function RateLimitedChat() {
  const [rateLimited, setRateLimited] = useState(false);
  const [retryAfter, setRetryAfter] = useState(0);

  const { messages, input, handleInputChange, handleSubmit, isLoading, error } = useChat({
    onError: (error) => {
      if (error.message.includes('429')) {
        setRateLimited(true);
        // Extract retry-after from error if available
        setRetryAfter(60);

        setTimeout(() => {
          setRateLimited(false);
          setRetryAfter(0);
        }, 60000);
      }
    },
  });

  const throttledSubmit = useCallback(
    (e: React.FormEvent) => {
      if (rateLimited) {
        e.preventDefault();
        return;
      }
      handleSubmit(e);
    },
    [rateLimited, handleSubmit]
  );

  return (
    <div>
      {rateLimited && (
        <div className="p-4 bg-yellow-50 text-yellow-700 rounded mb-4">
          Rate limited. Please wait {retryAfter} seconds before sending another message.
        </div>
      )}

      {messages.map((m) => (
        <div key={m.id}>{m.content}</div>
      ))}

      <form onSubmit={throttledSubmit}>
        <input
          value={input}
          onChange={handleInputChange}
          disabled={rateLimited || isLoading}
        />
        <button type="submit" disabled={rateLimited || isLoading}>
          Send
        </button>
      </form>
    </div>
  );
}
```

### Retry with Exponential Backoff

```typescript
import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = await withRetry(async () => {
    return streamText({
      model: openai('gpt-4o'),
      messages,
    });
  });

  return result.toDataStreamResponse();
}
```

## Structured Output

### JSON Mode with Zod Schema

```typescript
import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';

const ProductSchema = z.object({
  name: z.string(),
  description: z.string(),
  price: z.number(),
  features: z.array(z.string()),
  category: z.enum(['electronics', 'clothing', 'home', 'other']),
});

export async function POST(req: Request) {
  const { prompt } = await req.json();

  const { object } = await generateObject({
    model: openai('gpt-4o'),
    schema: ProductSchema,
    prompt: `Generate a product based on: ${prompt}`,
  });

  return Response.json(object);
}
```

### Streaming Structured Output

```typescript
import { openai } from '@ai-sdk/openai';
import { streamObject } from 'ai';
import { z } from 'zod';

const AnalysisSchema = z.object({
  summary: z.string(),
  sentiment: z.enum(['positive', 'negative', 'neutral']),
  keyPoints: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

export async function POST(req: Request) {
  const { text } = await req.json();

  const result = streamObject({
    model: openai('gpt-4o'),
    schema: AnalysisSchema,
    prompt: `Analyze the following text: ${text}`,
  });

  return result.toTextStreamResponse();
}
```

## Embedding and Semantic Search

### Generate and Store Embeddings

```typescript
import { openai } from '@ai-sdk/openai';
import { embed, embedMany } from 'ai';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function storeDocument(content: string, metadata: Record<string, any>) {
  const { embedding } = await embed({
    model: openai.embedding('text-embedding-3-small'),
    value: content,
  });

  const { error } = await supabase.from('documents').insert({
    content,
    embedding,
    metadata,
  });

  if (error) throw error;
}

export async function searchDocuments(query: string, limit: number = 5) {
  const { embedding } = await embed({
    model: openai.embedding('text-embedding-3-small'),
    value: query,
  });

  const { data, error } = await supabase.rpc('match_documents', {
    query_embedding: embedding,
    match_threshold: 0.7,
    match_count: limit,
  });

  if (error) throw error;
  return data;
}
```

### RAG Chat Implementation

```typescript
import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { searchDocuments } from '@/lib/embeddings';

export async function POST(req: Request) {
  const { messages } = await req.json();

  // Get the last user message for context search
  const lastUserMessage = messages.filter((m: any) => m.role === 'user').pop();

  // Search for relevant documents
  const relevantDocs = await searchDocuments(lastUserMessage.content);

  // Build context from documents
  const context = relevantDocs
    .map((doc: any) => doc.content)
    .join('\n\n');

  const result = streamText({
    model: openai('gpt-4o'),
    system: `You are a helpful assistant. Use the following context to answer questions:

${context}

If the context doesn't contain relevant information, say so.`,
    messages,
  });

  return result.toDataStreamResponse();
}
```

## Testing AI Components

### Mock AI Responses for Testing

```typescript
// __tests__/chat.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChatInterface } from '@/components/ChatInterface';

// Mock the useChat hook
jest.mock('ai/react', () => ({
  useChat: () => ({
    messages: [
      { id: '1', role: 'user', content: 'Hello' },
      { id: '2', role: 'assistant', content: 'Hi there!' },
    ],
    input: '',
    handleInputChange: jest.fn(),
    handleSubmit: jest.fn(),
    isLoading: false,
    error: null,
  }),
}));

describe('ChatInterface', () => {
  it('renders messages', () => {
    render(<ChatInterface />);

    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('Hi there!')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    // Override mock for this test
    jest.spyOn(require('ai/react'), 'useChat').mockReturnValue({
      messages: [],
      input: '',
      handleInputChange: jest.fn(),
      handleSubmit: jest.fn(),
      isLoading: true,
      error: null,
    });

    render(<ChatInterface />);
    expect(screen.getByText(/thinking/i)).toBeInTheDocument();
  });
});
```

### E2E Testing with Playwright

```typescript
// e2e/chat.spec.ts
import { test, expect } from '@playwright/test';

test.describe('AI Chat', () => {
  test('should send message and receive response', async ({ page }) => {
    await page.goto('/chat');

    // Type and send a message
    await page.fill('input[placeholder*="message"]', 'What is 2+2?');
    await page.click('button[type="submit"]');

    // Wait for AI response
    await expect(page.locator('[data-testid="ai-response"]')).toBeVisible({
      timeout: 30000,
    });

    // Verify response contains relevant content
    const response = await page.locator('[data-testid="ai-response"]').textContent();
    expect(response).toContain('4');
  });

  test('should handle streaming correctly', async ({ page }) => {
    await page.goto('/chat');

    await page.fill('input[placeholder*="message"]', 'Write a short poem');
    await page.click('button[type="submit"]');

    // Verify streaming indicator appears
    await expect(page.locator('.animate-pulse')).toBeVisible();

    // Wait for completion
    await expect(page.locator('.animate-pulse')).not.toBeVisible({
      timeout: 30000,
    });
  });
});
```
