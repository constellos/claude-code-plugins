/**
 * Tool I/O Zod schemas for Claude Code builtin tools
 *
 * These schemas define the input/output structure for all builtin Claude Code tools.
 */

import { z } from 'zod';

// ============================================================================
// Tool Input Schemas
// ============================================================================

/** Read (FileRead) tool input */
export const FileReadInputSchema = z.object({
  /** Absolute path to the file to read */
  file_path: z.string(),
  /** Line number to start reading from */
  offset: z.number().optional(),
  /** Number of lines to read */
  limit: z.number().optional(),
});

export type FileReadInput = z.infer<typeof FileReadInputSchema>;

/** Glob tool input */
export const GlobInputSchema = z.object({
  /** The glob pattern to match files against */
  pattern: z.string(),
  /** The directory to search in */
  path: z.string().optional(),
});

export type GlobInput = z.infer<typeof GlobInputSchema>;

/** Grep output mode */
export const GrepOutputModeSchema = z.enum(['content', 'files_with_matches', 'count']);

export type GrepOutputMode = z.infer<typeof GrepOutputModeSchema>;

/** Grep tool input */
export const GrepInputSchema = z.object({
  /** The regular expression pattern to search for */
  pattern: z.string(),
  /** File or directory to search in */
  path: z.string().optional(),
  /** File type to search (e.g., js, py, rust) */
  type: z.string().optional(),
  /** Glob pattern to filter files */
  glob: z.string().optional(),
  /** Output mode */
  output_mode: GrepOutputModeSchema.optional(),
  /** Case insensitive search */
  '-i': z.boolean().optional(),
  /** Show line numbers in output */
  '-n': z.boolean().optional(),
  /** Number of lines to show after each match */
  '-A': z.number().optional(),
  /** Number of lines to show before each match */
  '-B': z.number().optional(),
  /** Number of lines to show before and after each match */
  '-C': z.number().optional(),
  /** Enable multiline mode */
  multiline: z.boolean().optional(),
  /** Limit output to first N lines/entries */
  head_limit: z.number().optional(),
  /** Skip first N lines/entries */
  offset: z.number().optional(),
});

export type GrepInput = z.infer<typeof GrepInputSchema>;

/** Write (FileWrite) tool input */
export const FileWriteInputSchema = z.object({
  /** The absolute path to the file to write */
  file_path: z.string(),
  /** The content to write to the file */
  content: z.string(),
});

export type FileWriteInput = z.infer<typeof FileWriteInputSchema>;

/** Edit (FileEdit) tool input */
export const FileEditInputSchema = z.object({
  /** The absolute path to the file to modify */
  file_path: z.string(),
  /** The text to replace */
  old_string: z.string(),
  /** The text to replace it with */
  new_string: z.string(),
  /** Replace all occurrences of old_string */
  replace_all: z.boolean().optional(),
});

export type FileEditInput = z.infer<typeof FileEditInputSchema>;

/** NotebookEdit cell type */
export const NotebookCellTypeSchema = z.enum(['code', 'markdown']);

export type NotebookCellType = z.infer<typeof NotebookCellTypeSchema>;

/** NotebookEdit edit mode */
export const NotebookEditModeSchema = z.enum(['replace', 'insert', 'delete']);

export type NotebookEditMode = z.infer<typeof NotebookEditModeSchema>;

/** NotebookEdit tool input */
export const NotebookEditInputSchema = z.object({
  /** The absolute path to the Jupyter notebook file */
  notebook_path: z.string(),
  /** The new source for the cell */
  new_source: z.string(),
  /** The ID of the cell to edit */
  cell_id: z.string().optional(),
  /** The 0-indexed position of the cell */
  cell_number: z.number().optional(),
  /** The type of the cell */
  cell_type: NotebookCellTypeSchema.optional(),
  /** The type of edit to make */
  edit_mode: NotebookEditModeSchema.optional(),
});

export type NotebookEditInput = z.infer<typeof NotebookEditInputSchema>;

/** Bash tool input */
export const BashInputSchema = z.object({
  /** The command to execute */
  command: z.string(),
  /** Clear, concise description of what this command does in 5-10 words */
  description: z.string().optional(),
  /** Optional timeout in milliseconds (max 600000) */
  timeout: z.number().optional(),
  /** Set to true to run this command in the background */
  run_in_background: z.boolean().optional(),
  /** Set to true to dangerously override sandbox mode */
  dangerouslyDisableSandbox: z.boolean().optional(),
});

export type BashInput = z.infer<typeof BashInputSchema>;

/** BashOutput tool input */
export const BashOutputInputSchema = z.object({
  /** The ID of the background shell to retrieve output from */
  bash_id: z.string(),
  /** Optional regular expression to filter the output lines */
  filter: z.string().optional(),
});

export type BashOutputInput = z.infer<typeof BashOutputInputSchema>;

/** KillShell tool input */
export const KillShellInputSchema = z.object({
  /** The ID of the background shell to kill */
  shell_id: z.string(),
});

export type KillShellInput = z.infer<typeof KillShellInputSchema>;

/** Todo item for TodoWrite */
export const TodoWriteItemSchema = z.object({
  /** The imperative form describing what needs to be done */
  content: z.string(),
  /** The present continuous form shown during execution */
  activeForm: z.string(),
  /** Task state */
  status: z.enum(['pending', 'in_progress', 'completed']),
});

export type TodoWriteItem = z.infer<typeof TodoWriteItemSchema>;

/** TodoWrite tool input */
export const TodoWriteInputSchema = z.object({
  /** The updated todo list */
  todos: z.array(TodoWriteItemSchema),
});

export type TodoWriteInput = z.infer<typeof TodoWriteInputSchema>;

/** Task model options */
export const TaskModelOptionSchema = z.enum(['sonnet', 'opus', 'haiku']);

export type TaskModelOption = z.infer<typeof TaskModelOptionSchema>;

/** Task tool input */
export const TaskInputSchema = z.object({
  /** The type of specialized agent to use for this task */
  subagent_type: z.string(),
  /** The task for the agent to perform */
  prompt: z.string(),
  /** A short (3-5 word) description of the task */
  description: z.string(),
  /** Optional model to use for this agent */
  model: TaskModelOptionSchema.optional(),
  /** Optional agent ID to resume from */
  resume: z.string().optional(),
});

export type TaskInput = z.infer<typeof TaskInputSchema>;

/** ExitPlanMode tool input */
export const ExitPlanModeInputSchema = z.object({
  /** The plan you came up with, that you want to run by the user for approval */
  plan: z.string(),
});

export type ExitPlanModeInput = z.infer<typeof ExitPlanModeInputSchema>;

/** WebFetch tool input */
export const WebFetchInputSchema = z.object({
  /** The URL to fetch content from */
  url: z.string(),
  /** The prompt to run on the fetched content */
  prompt: z.string(),
});

export type WebFetchInput = z.infer<typeof WebFetchInputSchema>;

/** WebSearch tool input */
export const WebSearchInputSchema = z.object({
  /** The search query to use (minimum 2 characters) */
  query: z.string(),
  /** Number of results to return (1-10) */
  count: z.number().optional(),
});

export type WebSearchInput = z.infer<typeof WebSearchInputSchema>;

/** Skill tool input */
export const SkillInputSchema = z.object({
  /** The path to the skill markdown file */
  skill_path: z.string(),
  /** The prompt/question for the skill */
  prompt: z.string(),
});

export type SkillInput = z.infer<typeof SkillInputSchema>;

/** SlashCommand tool input */
export const SlashCommandInputSchema = z.object({
  /** The slash command to execute */
  command: z.string(),
  /** Optional parameters for the command */
  params: z.record(z.unknown()).optional(),
});

export type SlashCommandInput = z.infer<typeof SlashCommandInputSchema>;

/** ListMcpResources tool input */
export const ListMcpResourcesInputSchema = z.object({
  /** Optional server filter */
  server: z.string().optional(),
});

export type ListMcpResourcesInput = z.infer<typeof ListMcpResourcesInputSchema>;

/** ReadMcpResource tool input */
export const ReadMcpResourceInputSchema = z.object({
  /** Resource URI to read */
  uri: z.string(),
});

export type ReadMcpResourceInput = z.infer<typeof ReadMcpResourceInputSchema>;

// ============================================================================
// Tool Output Schemas
// ============================================================================

/** Read tool output */
export const ReadOutputSchema = z.object({
  /** File contents as string */
  content: z.string(),
  /** Total line count in file */
  total_lines: z.number(),
  /** Line number reading started from */
  offset: z.number(),
});

export type ReadOutput = z.infer<typeof ReadOutputSchema>;

/** Glob tool output */
export const GlobOutputSchema = z.object({
  /** Matching file paths */
  files: z.array(z.string()),
  /** Total number of matches */
  total: z.number(),
});

export type GlobOutput = z.infer<typeof GlobOutputSchema>;

/** Grep match item */
export const GrepMatchSchema = z.object({
  file_path: z.string(),
  line_number: z.number().optional(),
  line_content: z.string().optional(),
  match_count: z.number().optional(),
});

export type GrepMatch = z.infer<typeof GrepMatchSchema>;

/** Grep tool output */
export const GrepOutputSchema = z.object({
  /** Search results */
  matches: z.array(GrepMatchSchema),
  /** Total number of matches */
  total_matches: z.number(),
});

export type GrepOutput = z.infer<typeof GrepOutputSchema>;

/** Write tool output */
export const WriteOutputSchema = z.object({
  /** Confirmation message */
  message: z.string(),
  /** Number of bytes written */
  bytes_written: z.number(),
});

export type WriteOutput = z.infer<typeof WriteOutputSchema>;

/** Edit tool output */
export const EditOutputSchema = z.object({
  /** Confirmation message */
  message: z.string(),
  /** Number of replacements made */
  replacements: z.number(),
});

export type EditOutput = z.infer<typeof EditOutputSchema>;

/** NotebookEdit cell info */
export const NotebookCellInfoSchema = z.object({
  cell_id: z.string(),
  cell_number: z.number(),
  cell_type: z.string(),
});

export type NotebookCellInfo = z.infer<typeof NotebookCellInfoSchema>;

/** NotebookEdit tool output */
export const NotebookEditOutputSchema = z.object({
  /** Confirmation message */
  message: z.string(),
  /** The cell that was edited */
  cell: NotebookCellInfoSchema.optional(),
});

export type NotebookEditOutput = z.infer<typeof NotebookEditOutputSchema>;

/** Bash tool output */
export const BashOutputSchema = z.object({
  /** Command output (stdout + stderr) */
  output: z.string(),
  /** Exit code */
  exit_code: z.number(),
  /** Shell ID if running in background */
  bash_id: z.string().optional(),
  /** Whether command is still running */
  running: z.boolean().optional(),
});

export type BashOutput = z.infer<typeof BashOutputSchema>;

/** BashOutput tool output */
export const BashOutputToolOutputSchema = z.object({
  /** Output from the background shell */
  output: z.string(),
  /** Whether the shell is still running */
  running: z.boolean(),
});

export type BashOutputToolOutput = z.infer<typeof BashOutputToolOutputSchema>;

/** KillShell tool output */
export const KillShellOutputSchema = z.object({
  /** Confirmation message */
  message: z.string(),
  /** Whether shell was successfully killed */
  success: z.boolean(),
});

export type KillShellOutput = z.infer<typeof KillShellOutputSchema>;

/** TodoWrite stats */
export const TodoWriteStatsSchema = z.object({
  total: z.number(),
  pending: z.number(),
  in_progress: z.number(),
  completed: z.number(),
});

export type TodoWriteStats = z.infer<typeof TodoWriteStatsSchema>;

/** TodoWrite tool output */
export const TodoWriteOutputSchema = z.object({
  /** Confirmation message */
  message: z.string(),
  /** Current todo statistics */
  stats: TodoWriteStatsSchema,
});

export type TodoWriteOutput = z.infer<typeof TodoWriteOutputSchema>;

/** Task usage stats */
export const TaskUsageSchema = z.object({
  input_tokens: z.number(),
  output_tokens: z.number(),
  cache_creation_input_tokens: z.number().optional(),
  cache_read_input_tokens: z.number().optional(),
});

export type TaskUsage = z.infer<typeof TaskUsageSchema>;

/** Task tool output */
export const TaskOutputSchema = z.object({
  /** Final result message from the subagent */
  result: z.string(),
  /** Token usage statistics */
  usage: TaskUsageSchema.optional(),
  /** Total cost in USD */
  total_cost_usd: z.number().optional(),
  /** Execution duration in milliseconds */
  duration_ms: z.number().optional(),
});

export type TaskOutput = z.infer<typeof TaskOutputSchema>;

/** ExitPlanMode tool output */
export const ExitPlanModeOutputSchema = z.object({
  /** Confirmation message */
  message: z.string(),
  /** Whether user approved the plan */
  approved: z.boolean().optional(),
});

export type ExitPlanModeOutput = z.infer<typeof ExitPlanModeOutputSchema>;

/** WebFetch tool output */
export const WebFetchOutputSchema = z.object({
  /** AI model's response to the prompt */
  response: z.string(),
  /** URL that was fetched */
  url: z.string(),
  /** Final URL after redirects */
  final_url: z.string().optional(),
  /** HTTP status code */
  status_code: z.number().optional(),
});

export type WebFetchOutput = z.infer<typeof WebFetchOutputSchema>;

/** WebSearch result item */
export const WebSearchResultSchema = z.object({
  title: z.string(),
  url: z.string(),
  snippet: z.string(),
  /** Additional metadata if available */
  metadata: z.record(z.unknown()).optional(),
});

export type WebSearchResult = z.infer<typeof WebSearchResultSchema>;

/** WebSearch tool output */
export const WebSearchOutputSchema = z.object({
  /** Search results */
  results: z.array(WebSearchResultSchema),
  /** Total number of results */
  total_results: z.number(),
  /** The query that was searched */
  query: z.string(),
});

export type WebSearchOutput = z.infer<typeof WebSearchOutputSchema>;

/** MCP resource info */
export const McpResourceInfoSchema = z.object({
  uri: z.string(),
  name: z.string(),
  description: z.string().optional(),
  mimeType: z.string().optional(),
  server: z.string(),
});

export type McpResourceInfo = z.infer<typeof McpResourceInfoSchema>;

/** ListMcpResources tool output */
export const ListMcpResourcesOutputSchema = z.object({
  /** Available resources */
  resources: z.array(McpResourceInfoSchema),
  /** Total number of resources */
  total: z.number(),
});

export type ListMcpResourcesOutput = z.infer<typeof ListMcpResourcesOutputSchema>;

/** MCP resource content */
export const McpResourceContentSchema = z.object({
  uri: z.string(),
  mimeType: z.string().optional(),
  text: z.string().optional(),
  blob: z.string().optional(),
});

export type McpResourceContent = z.infer<typeof McpResourceContentSchema>;

/** ReadMcpResource tool output */
export const ReadMcpResourceOutputSchema = z.object({
  /** Resource contents */
  contents: z.array(McpResourceContentSchema),
  /** Server that provided the resource */
  server: z.string(),
});

export type ReadMcpResourceOutput = z.infer<typeof ReadMcpResourceOutputSchema>;

// ============================================================================
// Tool Input/Output Maps
// ============================================================================

/** Maps tool names to their input schemas */
export const ToolInputSchemaMap = {
  Read: FileReadInputSchema,
  Glob: GlobInputSchema,
  Grep: GrepInputSchema,
  Write: FileWriteInputSchema,
  Edit: FileEditInputSchema,
  NotebookEdit: NotebookEditInputSchema,
  Bash: BashInputSchema,
  BashOutput: BashOutputInputSchema,
  KillShell: KillShellInputSchema,
  TodoWrite: TodoWriteInputSchema,
  Task: TaskInputSchema,
  ExitPlanMode: ExitPlanModeInputSchema,
  WebFetch: WebFetchInputSchema,
  WebSearch: WebSearchInputSchema,
  Skill: SkillInputSchema,
  SlashCommand: SlashCommandInputSchema,
  ListMcpResourcesTool: ListMcpResourcesInputSchema,
  ReadMcpResourceTool: ReadMcpResourceInputSchema,
} as const;

/** Maps tool names to their output schemas */
export const ToolOutputSchemaMap = {
  Read: ReadOutputSchema,
  Glob: GlobOutputSchema,
  Grep: GrepOutputSchema,
  Write: WriteOutputSchema,
  Edit: EditOutputSchema,
  NotebookEdit: NotebookEditOutputSchema,
  Bash: BashOutputSchema,
  BashOutput: BashOutputToolOutputSchema,
  KillShell: KillShellOutputSchema,
  TodoWrite: TodoWriteOutputSchema,
  Task: TaskOutputSchema,
  ExitPlanMode: ExitPlanModeOutputSchema,
  WebFetch: WebFetchOutputSchema,
  WebSearch: WebSearchOutputSchema,
  Skill: z.string(),
  SlashCommand: z.string(),
  ListMcpResourcesTool: ListMcpResourcesOutputSchema,
  ReadMcpResourceTool: ReadMcpResourceOutputSchema,
} as const;

/** Known tool names */
export const KnownToolNames = [
  'Read',
  'Glob',
  'Grep',
  'Write',
  'Edit',
  'NotebookEdit',
  'Bash',
  'BashOutput',
  'KillShell',
  'TodoWrite',
  'Task',
  'ExitPlanMode',
  'WebFetch',
  'WebSearch',
  'Skill',
  'SlashCommand',
  'ListMcpResourcesTool',
  'ReadMcpResourceTool',
] as const;

export type KnownToolName = (typeof KnownToolNames)[number];
