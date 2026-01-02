---
name: AI SDK UI
description: This skill should be used when the user asks to "add AI chat", "implement streaming UI", "use useChat hook", "add AI completion", "implement useCompletion", "create conversational interface", "add streaming text", "implement tool calling UI", "create generative UI", "add AI-powered features", "implement StreamableUI", or mentions AI SDK, streaming responses, chat interfaces, or AI-generated content in React/Next.js applications.
version: 0.1.0
---

# AI SDK UI Development

## Purpose

Implement AI-powered user interfaces with the Vercel AI SDK. This skill covers streaming UI patterns, conversational interfaces, completion features, tool calling with visual feedback, and generative UI using React Server Components.

**When to use:**
- Adding chat interfaces or conversational features
- Implementing streaming text/content display
- Building AI completion features (autocomplete, suggestions)
- Creating tool calling UIs with visual feedback
- Implementing generative UI with Server Components

## Core Concepts

### Client-Side Hooks

The AI SDK provides React hooks for client-side AI interactions:

**useChat** - Conversational interfaces with message history:
```typescript
'use client';

import { useChat } from 'ai/react';

export function ChatInterface() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/chat',
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={message.role === 'user' ? 'text-right' : 'text-left'}
          >
            <div className={`inline-block p-3 rounded-lg ${
              message.role === 'user'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-900'
            }`}>
              {message.content}
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="p-4 border-t">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={handleInputChange}
            placeholder="Type a message..."
            className="flex-1 p-2 border rounded"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading}
            className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
          >
            {isLoading ? 'Sending...' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  );
}
```

**useCompletion** - Single completions without message history:
```typescript
'use client';

import { useCompletion } from 'ai/react';

export function CompletionInput() {
  const { completion, input, handleInputChange, handleSubmit, isLoading } = useCompletion({
    api: '/api/completion',
  });

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit}>
        <textarea
          value={input}
          onChange={handleInputChange}
          placeholder="Enter prompt..."
          className="w-full p-3 border rounded"
          rows={4}
        />
        <button
          type="submit"
          disabled={isLoading}
          className="mt-2 px-4 py-2 bg-green-500 text-white rounded"
        >
          {isLoading ? 'Generating...' : 'Generate'}
        </button>
      </form>

      {completion && (
        <div className="p-4 bg-gray-50 rounded">
          <h3 className="font-semibold mb-2">Result:</h3>
          <p className="whitespace-pre-wrap">{completion}</p>
        </div>
      )}
    </div>
  );
}
```

### Server-Side API Routes

Create API routes that stream responses:

**Chat API Route** (`app/api/chat/route.ts`):
```typescript
import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: openai('gpt-4o'),
    messages,
    system: 'You are a helpful assistant.',
  });

  return result.toDataStreamResponse();
}
```

**Completion API Route** (`app/api/completion/route.ts`):
```typescript
import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';

export async function POST(req: Request) {
  const { prompt } = await req.json();

  const result = streamText({
    model: openai('gpt-4o'),
    prompt,
  });

  return result.toDataStreamResponse();
}
```

### Streaming UI Patterns

**Token-by-token streaming display:**
```typescript
'use client';

import { useChat } from 'ai/react';

export function StreamingChat() {
  const { messages, input, handleInputChange, handleSubmit } = useChat();

  return (
    <div>
      {messages.map((message) => (
        <div key={message.id}>
          <strong>{message.role}:</strong>
          {/* Content streams in token-by-token */}
          <span className="animate-pulse">{message.content}</span>
        </div>
      ))}
      <form onSubmit={handleSubmit}>
        <input value={input} onChange={handleInputChange} />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
```

**Loading states and indicators:**
```typescript
'use client';

import { useChat } from 'ai/react';

export function ChatWithLoadingStates() {
  const { messages, input, handleInputChange, handleSubmit, isLoading, error } = useChat();

  return (
    <div>
      {messages.map((message) => (
        <div key={message.id}>{message.content}</div>
      ))}

      {isLoading && (
        <div className="flex items-center gap-2 text-gray-500">
          <div className="animate-spin h-4 w-4 border-2 border-gray-300 border-t-blue-500 rounded-full" />
          <span>AI is thinking...</span>
        </div>
      )}

      {error && (
        <div className="text-red-500 p-2 bg-red-50 rounded">
          Error: {error.message}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={handleInputChange}
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading}>
          Send
        </button>
      </form>
    </div>
  );
}
```

### Tool Calling UI

Implement tools that Claude can call with visual feedback:

**Server-side tool definition:**
```typescript
import { openai } from '@ai-sdk/openai';
import { streamText, tool } from 'ai';
import { z } from 'zod';

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: openai('gpt-4o'),
    messages,
    tools: {
      getWeather: tool({
        description: 'Get current weather for a location',
        parameters: z.object({
          location: z.string().describe('City name'),
        }),
        execute: async ({ location }) => {
          // Fetch weather data
          return { temperature: 72, condition: 'sunny', location };
        },
      }),
      searchProducts: tool({
        description: 'Search for products',
        parameters: z.object({
          query: z.string(),
          maxResults: z.number().optional().default(5),
        }),
        execute: async ({ query, maxResults }) => {
          // Search products
          return { results: [], query, count: 0 };
        },
      }),
    },
  });

  return result.toDataStreamResponse();
}
```

**Client-side tool result rendering:**
```typescript
'use client';

import { useChat } from 'ai/react';

function WeatherCard({ data }: { data: { temperature: number; condition: string; location: string } }) {
  return (
    <div className="p-4 bg-blue-50 rounded-lg">
      <h3 className="font-semibold">{data.location}</h3>
      <p className="text-2xl">{data.temperature}°F</p>
      <p className="text-gray-600">{data.condition}</p>
    </div>
  );
}

export function ChatWithTools() {
  const { messages, input, handleInputChange, handleSubmit } = useChat({
    maxSteps: 5, // Allow multi-step tool use
  });

  return (
    <div>
      {messages.map((message) => (
        <div key={message.id}>
          {message.role === 'assistant' && message.toolInvocations?.map((tool) => (
            <div key={tool.toolCallId}>
              {tool.toolName === 'getWeather' && tool.state === 'result' && (
                <WeatherCard data={tool.result} />
              )}
              {tool.state === 'call' && (
                <div className="animate-pulse p-2 bg-gray-100 rounded">
                  Calling {tool.toolName}...
                </div>
              )}
            </div>
          ))}
          {message.content && <p>{message.content}</p>}
        </div>
      ))}
      <form onSubmit={handleSubmit}>
        <input value={input} onChange={handleInputChange} />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
```

### Generative UI with Server Components

Use `streamUI` for server-side streaming of React components:

**Server Action with streamUI:**
```typescript
'use server';

import { openai } from '@ai-sdk/openai';
import { streamUI } from 'ai/rsc';
import { z } from 'zod';

export async function generateUI(prompt: string) {
  const result = await streamUI({
    model: openai('gpt-4o'),
    prompt,
    tools: {
      showWeather: {
        description: 'Show weather widget',
        parameters: z.object({
          location: z.string(),
          temperature: z.number(),
        }),
        generate: async function* ({ location, temperature }) {
          yield <div className="animate-pulse">Loading weather...</div>;

          // Simulate API call
          await new Promise(resolve => setTimeout(resolve, 1000));

          return (
            <div className="p-4 bg-gradient-to-r from-blue-400 to-blue-600 text-white rounded-lg">
              <h3 className="text-xl font-bold">{location}</h3>
              <p className="text-3xl">{temperature}°F</p>
            </div>
          );
        },
      },
      showStockChart: {
        description: 'Show stock price chart',
        parameters: z.object({
          symbol: z.string(),
          price: z.number(),
        }),
        generate: async function* ({ symbol, price }) {
          yield <div>Loading {symbol} data...</div>;

          return (
            <div className="p-4 border rounded-lg">
              <h3 className="font-bold">{symbol}</h3>
              <p className="text-2xl text-green-600">${price}</p>
            </div>
          );
        },
      },
    },
  });

  return result.value;
}
```

**Client component consuming streamUI:**
```typescript
'use client';

import { useState } from 'react';
import { generateUI } from './actions';

export function GenerativeUIDemo() {
  const [ui, setUI] = useState<React.ReactNode>(null);
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);

    const result = await generateUI(prompt);
    setUI(result);
    setIsLoading(false);
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ask about weather, stocks..."
          className="flex-1 p-2 border rounded"
        />
        <button
          type="submit"
          disabled={isLoading}
          className="px-4 py-2 bg-purple-500 text-white rounded"
        >
          Generate
        </button>
      </form>

      <div className="min-h-[200px] p-4 border rounded">
        {ui || <p className="text-gray-400">Generated UI will appear here</p>}
      </div>
    </div>
  );
}
```

## Workflow

1. **Choose AI pattern**: Determine if use case needs chat (useChat), completion (useCompletion), or generative UI (streamUI)
2. **Create API route**: Set up server-side streaming endpoint with appropriate model and tools
3. **Implement client hook**: Use the corresponding React hook with proper configuration
4. **Add streaming UI**: Display content as it streams with appropriate loading states
5. **Handle tool calls**: Render tool results with custom components
6. **Add error handling**: Handle network errors, rate limits, and API failures gracefully

## Best Practices

**Performance:**
- Use `maxSteps` to limit tool calling depth
- Implement proper loading states for better UX
- Consider debouncing user input for completion features

**Error Handling:**
- Always handle the `error` state from hooks
- Provide retry mechanisms for failed requests
- Show user-friendly error messages

**Accessibility:**
- Announce streaming content to screen readers
- Provide keyboard navigation for chat interfaces
- Include proper ARIA labels on interactive elements

**Security:**
- Validate user input before sending to AI
- Sanitize AI-generated content before rendering
- Use rate limiting on API routes

## Additional Resources

### Reference Files

For detailed patterns and advanced techniques:
- **`references/advanced-patterns.md`** - Multi-modal AI, conversation memory, custom providers

### External Documentation

- **AI SDK Docs**: https://sdk.vercel.ai/docs
- **useChat Reference**: https://sdk.vercel.ai/docs/reference/ai-sdk-ui/use-chat
- **useCompletion Reference**: https://sdk.vercel.ai/docs/reference/ai-sdk-ui/use-completion
- **streamUI Reference**: https://sdk.vercel.ai/docs/reference/ai-sdk-rsc/stream-ui
- **Tool Calling**: https://sdk.vercel.ai/docs/ai-sdk-core/tools-and-tool-calling
