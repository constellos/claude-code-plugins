/**
 * TypeScript types for Claude Code system tools
 * Based on: https://code.claude.com/docs/en/hooks.md
 *
 * This module provides input/output types for all Claude Code system tools.
 * For MCP tool types, MCP tools follow the naming pattern: mcp__[server-name]__[tool-name]
 */

// ============================================================================
// System Tools - Input Types
// ============================================================================

export interface FileReadInput {
  /** Absolute path to the file to read */
  file_path: string;
  /** Line number to start reading from */
  offset?: number;
  /** Number of lines to read */
  limit?: number;
}

export interface GlobInput {
  /** The glob pattern to match files against */
  pattern: string;
  /** The directory to search in */
  path?: string;
}

export interface GrepInput {
  /** The regular expression pattern to search for */
  pattern: string;
  /** File or directory to search in */
  path?: string;
  /** File type to search (e.g., js, py, rust) */
  type?: string;
  /** Glob pattern to filter files */
  glob?: string;
  /** Output mode */
  output_mode?: "content" | "files_with_matches" | "count";
  /** Case insensitive search */
  "-i"?: boolean;
  /** Show line numbers in output */
  "-n"?: boolean;
  /** Number of lines to show after each match */
  "-A"?: number;
  /** Number of lines to show before each match */
  "-B"?: number;
  /** Number of lines to show before and after each match */
  "-C"?: number;
  /** Enable multiline mode */
  multiline?: boolean;
  /** Limit output to first N lines/entries */
  head_limit?: number;
  /** Skip first N lines/entries */
  offset?: number;
}

export interface FileWriteInput {
  /** The absolute path to the file to write */
  file_path: string;
  /** The content to write to the file */
  content: string;
}

export interface FileEditInput {
  /** The absolute path to the file to modify */
  file_path: string;
  /** The text to replace */
  old_string: string;
  /** The text to replace it with */
  new_string: string;
  /** Replace all occurrences of old_string */
  replace_all?: boolean;
}

export interface NotebookEditInput {
  /** The absolute path to the Jupyter notebook file */
  notebook_path: string;
  /** The new source for the cell */
  new_source: string;
  /** The ID of the cell to edit */
  cell_id?: string;
  /** The 0-indexed position of the cell */
  cell_number?: number;
  /** The type of the cell */
  cell_type?: "code" | "markdown";
  /** The type of edit to make */
  edit_mode?: "replace" | "insert" | "delete";
}

export interface BashInput {
  /** The command to execute */
  command: string;
  /** Clear, concise description of what this command does in 5-10 words */
  description?: string;
  /** Optional timeout in milliseconds (max 600000) */
  timeout?: number;
  /** Set to true to run this command in the background */
  run_in_background?: boolean;
  /** Set to true to dangerously override sandbox mode */
  dangerouslyDisableSandbox?: boolean;
}

export interface BashOutputInput {
  /** The ID of the background shell to retrieve output from */
  bash_id: string;
  /** Optional regular expression to filter the output lines */
  filter?: string;
}

export interface KillShellInput {
  /** The ID of the background shell to kill */
  shell_id: string;
}

export interface TodoWriteInput {
  /** The updated todo list */
  todos: Array<{
    /** The imperative form describing what needs to be done */
    content: string;
    /** The present continuous form shown during execution */
    activeForm: string;
    /** Task state */
    status: "pending" | "in_progress" | "completed";
  }>;
}

export interface TaskInput {
  /** The type of specialized agent to use for this task */
  subagent_type: string;
  /** The task for the agent to perform */
  prompt: string;
  /** A short (3-5 word) description of the task */
  description: string;
  /** Optional model to use for this agent */
  model?: "sonnet" | "opus" | "haiku";
  /** Optional agent ID to resume from */
  resume?: string;
}

/** Empty object - ExitPlanMode reads from the plan file written earlier */
export type ExitPlanModeInput = Record<string, never>;

/** Empty object - EnterPlanMode transitions to plan mode */
export type EnterPlanModeInput = Record<string, never>;

export interface AskUserQuestionInput {
  /** Questions to ask the user (1-4 questions) */
  questions: Array<{
    /** The complete question to ask the user */
    question: string;
    /** Very short label displayed as a chip/tag (max 12 chars) */
    header: string;
    /** The available choices for this question (2-4 options) */
    options: Array<{
      /** The display text for this option */
      label: string;
      /** Explanation of what this option means */
      description: string;
    }>;
    /** Set to true to allow multiple selections */
    multiSelect: boolean;
  }>;
  /** User answers collected by the permission component */
  answers?: Record<string, string>;
}

export interface WebFetchInput {
  /** The URL to fetch content from */
  url: string;
  /** The prompt to run on the fetched content */
  prompt: string;
}

export interface WebSearchInput {
  /** The search query to use (minimum 2 characters) */
  query: string;
  /** Only include search results from these domains */
  allowed_domains?: string[];
  /** Never include search results from these domains */
  blocked_domains?: string[];
}

export interface SkillInput {
  /** The skill name (no arguments). E.g., "pdf" or "xlsx" */
  skill: string;
}

export interface SlashCommandInput {
  /** The slash command to execute with its arguments, e.g., "/review-pr 123" */
  command: string;
}

export interface ListMcpResourcesInput {
  /** Optional server filter */
  server?: string;
}

export interface ReadMcpResourceInput {
  /** Resource URI to read */
  uri: string;
}

// ============================================================================
// System Tools - Output Types
// ============================================================================

export interface ReadOutput {
  /** File contents as string */
  content: string;
  /** Total line count in file */
  total_lines: number;
  /** Line number reading started from */
  offset: number;
}

export interface GlobOutput {
  /** Matching file paths */
  files: string[];
  /** Total number of matches */
  total: number;
}

export interface GrepOutput {
  /** Search results */
  matches: Array<{
    file_path: string;
    line_number?: number;
    line_content?: string;
    match_count?: number;
  }>;
  /** Total number of matches */
  total_matches: number;
}

export interface WriteOutput {
  /** Confirmation message */
  message: string;
  /** Number of bytes written */
  bytes_written: number;
}

export interface EditOutput {
  /** Confirmation message */
  message: string;
  /** Number of replacements made */
  replacements: number;
}

export interface NotebookEditOutput {
  /** Confirmation message */
  message: string;
  /** The cell that was edited */
  cell?: {
    cell_id: string;
    cell_number: number;
    cell_type: string;
  };
}

export interface BashOutput {
  /** Command output (stdout + stderr) */
  output: string;
  /** Exit code */
  exit_code: number;
  /** Shell ID if running in background */
  bash_id?: string;
  /** Whether command is still running */
  running?: boolean;
}

export interface BashOutputToolOutput {
  /** Output from the background shell */
  output: string;
  /** Whether the shell is still running */
  running: boolean;
}

export interface KillShellOutput {
  /** Confirmation message */
  message: string;
  /** Whether shell was successfully killed */
  success: boolean;
}

export interface TodoWriteOutput {
  /** Confirmation message */
  message: string;
  /** Current todo statistics */
  stats: {
    total: number;
    pending: number;
    in_progress: number;
    completed: number;
  };
}

export interface TaskOutput {
  /** Final result message from the subagent */
  result: string;
  /** Token usage statistics */
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  /** Total cost in USD */
  total_cost_usd?: number;
  /** Execution duration in milliseconds */
  duration_ms?: number;
}

export interface ExitPlanModeOutput {
  /** Confirmation message */
  message: string;
  /** Whether user approved the plan */
  approved?: boolean;
}

export interface EnterPlanModeOutput {
  /** Confirmation message */
  message: string;
}

export interface AskUserQuestionOutput {
  /** User's answers to the questions */
  answers: Record<string, string>;
}

export interface WebFetchOutput {
  /** AI model's response to the prompt */
  response: string;
  /** URL that was fetched */
  url: string;
  /** Final URL after redirects */
  final_url?: string;
  /** HTTP status code */
  status_code?: number;
}

export interface WebSearchOutput {
  /** Search results */
  results: Array<{
    title: string;
    url: string;
    snippet: string;
    /** Additional metadata if available */
    metadata?: Record<string, unknown>;
  }>;
  /** Total number of results */
  total_results: number;
  /** The query that was searched */
  query: string;
}

export interface ListMcpResourcesOutput {
  /** Available resources */
  resources: Array<{
    uri: string;
    name: string;
    description?: string;
    mimeType?: string;
    server: string;
  }>;
  /** Total number of resources */
  total: number;
}

export interface ReadMcpResourceOutput {
  /** Resource contents */
  contents: Array<{
    uri: string;
    mimeType?: string;
    text?: string;
    blob?: string;
  }>;
  /** Server that provided the resource */
  server: string;
}

// ============================================================================
// Tool Input/Output Maps
// ============================================================================

/**
 * Maps tool names to their input types
 * For system tools only. MCP tools use unknown types.
 * @internal - Not exported from package, used internally for hook types
 */
export interface ToolInputMap {
  Read: FileReadInput;
  Glob: GlobInput;
  Grep: GrepInput;
  Write: FileWriteInput;
  Edit: FileEditInput;
  NotebookEdit: NotebookEditInput;
  Bash: BashInput;
  BashOutput: BashOutputInput;
  KillShell: KillShellInput;
  TodoWrite: TodoWriteInput;
  Task: TaskInput;
  ExitPlanMode: ExitPlanModeInput;
  EnterPlanMode: EnterPlanModeInput;
  AskUserQuestion: AskUserQuestionInput;
  WebFetch: WebFetchInput;
  WebSearch: WebSearchInput;
  Skill: SkillInput;
  SlashCommand: SlashCommandInput;
  ListMcpResourcesTool: ListMcpResourcesInput;
  ReadMcpResourceTool: ReadMcpResourceInput;
}

/**
 * Maps tool names to their output types
 * For system tools only. MCP tools use unknown types.
 * @internal - Not exported from package, used internally for hook types
 */
export interface ToolOutputMap {
  Read: ReadOutput;
  Glob: GlobOutput;
  Grep: GrepOutput;
  Write: WriteOutput;
  Edit: EditOutput;
  NotebookEdit: NotebookEditOutput;
  Bash: BashOutput;
  BashOutput: BashOutputToolOutput;
  KillShell: KillShellOutput;
  TodoWrite: TodoWriteOutput;
  Task: TaskOutput;
  ExitPlanMode: ExitPlanModeOutput;
  EnterPlanMode: EnterPlanModeOutput;
  AskUserQuestion: AskUserQuestionOutput;
  WebFetch: WebFetchOutput;
  WebSearch: WebSearchOutput;
  Skill: string;
  SlashCommand: string;
  ListMcpResourcesTool: ListMcpResourcesOutput;
  ReadMcpResourceTool: ReadMcpResourceOutput;
}

/**
 * Known tool names (system tools)
 */
export type KnownToolName = keyof ToolInputMap;

// ============================================================================
// Discriminated Union Types for System Tools
// ============================================================================

/**
 * Discriminated union of all system tool inputs.
 * Each member has a tool_name property that can be used to narrow the type.
 * @internal - Used internally for hook types
 */
export type SystemToolInput =
  | { tool_name: "Read"; tool_input: FileReadInput }
  | { tool_name: "Glob"; tool_input: GlobInput }
  | { tool_name: "Grep"; tool_input: GrepInput }
  | { tool_name: "Write"; tool_input: FileWriteInput }
  | { tool_name: "Edit"; tool_input: FileEditInput }
  | { tool_name: "NotebookEdit"; tool_input: NotebookEditInput }
  | { tool_name: "Bash"; tool_input: BashInput }
  | { tool_name: "BashOutput"; tool_input: BashOutputInput }
  | { tool_name: "KillShell"; tool_input: KillShellInput }
  | { tool_name: "TodoWrite"; tool_input: TodoWriteInput }
  | { tool_name: "Task"; tool_input: TaskInput }
  | { tool_name: "ExitPlanMode"; tool_input: ExitPlanModeInput }
  | { tool_name: "EnterPlanMode"; tool_input: EnterPlanModeInput }
  | { tool_name: "AskUserQuestion"; tool_input: AskUserQuestionInput }
  | { tool_name: "WebFetch"; tool_input: WebFetchInput }
  | { tool_name: "WebSearch"; tool_input: WebSearchInput }
  | { tool_name: "Skill"; tool_input: SkillInput }
  | { tool_name: "SlashCommand"; tool_input: SlashCommandInput }
  | { tool_name: "ListMcpResourcesTool"; tool_input: ListMcpResourcesInput }
  | { tool_name: "ReadMcpResourceTool"; tool_input: ReadMcpResourceInput };

/**
 * Discriminated union of all system tool inputs with their responses.
 * Each member has a tool_name property that can be used to narrow the type.
 * @internal - Used internally for PostToolUse hook types
 */
export type SystemToolWithResponse =
  | { tool_name: "Read"; tool_input: FileReadInput; tool_response: ReadOutput }
  | { tool_name: "Glob"; tool_input: GlobInput; tool_response: GlobOutput }
  | { tool_name: "Grep"; tool_input: GrepInput; tool_response: GrepOutput }
  | { tool_name: "Write"; tool_input: FileWriteInput; tool_response: WriteOutput }
  | { tool_name: "Edit"; tool_input: FileEditInput; tool_response: EditOutput }
  | { tool_name: "NotebookEdit"; tool_input: NotebookEditInput; tool_response: NotebookEditOutput }
  | { tool_name: "Bash"; tool_input: BashInput; tool_response: BashOutput }
  | { tool_name: "BashOutput"; tool_input: BashOutputInput; tool_response: BashOutputToolOutput }
  | { tool_name: "KillShell"; tool_input: KillShellInput; tool_response: KillShellOutput }
  | { tool_name: "TodoWrite"; tool_input: TodoWriteInput; tool_response: TodoWriteOutput }
  | { tool_name: "Task"; tool_input: TaskInput; tool_response: TaskOutput }
  | { tool_name: "ExitPlanMode"; tool_input: ExitPlanModeInput; tool_response: ExitPlanModeOutput }
  | { tool_name: "EnterPlanMode"; tool_input: EnterPlanModeInput; tool_response: EnterPlanModeOutput }
  | { tool_name: "AskUserQuestion"; tool_input: AskUserQuestionInput; tool_response: AskUserQuestionOutput }
  | { tool_name: "WebFetch"; tool_input: WebFetchInput; tool_response: WebFetchOutput }
  | { tool_name: "WebSearch"; tool_input: WebSearchInput; tool_response: WebSearchOutput }
  | { tool_name: "Skill"; tool_input: SkillInput; tool_response: string }
  | { tool_name: "SlashCommand"; tool_input: SlashCommandInput; tool_response: string }
  | { tool_name: "ListMcpResourcesTool"; tool_input: ListMcpResourcesInput; tool_response: ListMcpResourcesOutput }
  | { tool_name: "ReadMcpResourceTool"; tool_input: ReadMcpResourceInput; tool_response: ReadMcpResourceOutput };

/**
 * Helper to get input type for a tool
 * - Known tools get their specific type
 * - Unknown MCP tools get unknown
 */
export type GetToolInput<T extends string> =
  T extends KnownToolName
    ? ToolInputMap[T]
    : T extends `mcp__${string}__${string}`
      ? unknown
      : never;

/**
 * Helper to get output type for a tool
 * - Known tools get their specific type
 * - Unknown MCP tools get unknown
 */
export type GetToolOutput<T extends string> =
  T extends KnownToolName
    ? ToolOutputMap[T]
    : T extends `mcp__${string}__${string}`
      ? unknown
      : never;

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Type guard to check if a tool name is an MCP tool
 *
 * @example
 * isMcpTool('mcp__next-devtools__browser_eval') // => true
 * isMcpTool('Read') // => false
 */
export function isMcpTool(toolName: string): toolName is `mcp__${string}__${string}` {
  return toolName.startsWith('mcp__');
}

/**
 * Type guard to check if a tool name is a known builtin tool
 *
 * @example
 * isKnownTool('Read') // => true
 * isKnownTool('mcp__server__tool') // => false
 */
export function isKnownTool(toolName: string): toolName is KnownToolName {
  return toolName in ({} as ToolInputMap);
}

/**
 * Extract server name from MCP tool name
 *
 * @example
 * extractMcpServerName('mcp__next-devtools__browser_eval') // => 'next-devtools'
 */
export function extractMcpServerName(toolName: string): string | null {
  const match = toolName.match(/^mcp__([^_]+(?:[-_][^_]+)*)__/);
  return match ? match[1] : null;
}

/**
 * Extract tool name from MCP tool name
 *
 * @example
 * extractMcpToolName('mcp__next-devtools__browser_eval') // => 'browser_eval'
 */
export function extractMcpToolName(toolName: string): string | null {
  const match = toolName.match(/^mcp__[^_]+(?:[-_][^_]+)*__(.+)$/);
  return match ? match[1] : null;
}
