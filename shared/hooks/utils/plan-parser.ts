/**
 * Plan file parser for task definitions
 *
 * Parses YAML frontmatter from plan files to extract task definitions,
 * including agent assignments, file path patterns, and dependencies.
 *
 * Note: This module includes its own YAML parsing for nested task arrays
 * because the simple frontmatter.ts parser doesn't support multi-line
 * nested YAML structures.
 *
 * @module plan-parser
 */

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * A task definition within a plan file
 *
 * Defines the scope of work for a specific agent, including:
 * - Which files the agent is responsible for (via glob patterns)
 * - What requirements the agent must fulfill
 * - Dependencies on other tasks
 */
export interface TaskDefinition {
  /** Unique identifier for the task within the plan */
  id: string;
  /** Agent type assigned to this task (e.g., 'ui-developer', 'api-specialist') */
  agent: string;
  /** Glob patterns for files in this task's scope (e.g., 'src/api/**', 'src/components/*.tsx') */
  paths: string[];
  /** List of requirements for this task */
  requirements: string[];
  /** Optional list of task IDs this task depends on */
  dependencies?: string[];
}

/**
 * Parsed metadata from a plan file's frontmatter
 */
export interface PlanMetadata {
  /** Array of task definitions from the plan */
  tasks: TaskDefinition[];
}

/**
 * Result of task validation
 */
export interface ValidationResult {
  /** Whether all tasks are valid */
  valid: boolean;
  /** Array of validation error messages */
  errors: string[];
}

// ============================================================================
// Glob Matching Implementation
// ============================================================================

/**
 * Simple glob pattern matching
 *
 * Supports:
 * - `**` for recursive directory matching
 * - `*` for single path segment matching
 * - Literal path matching
 *
 * @param pattern - Glob pattern to match against
 * @param path - File path to test
 * @returns True if the path matches the pattern
 *
 * @example
 * ```typescript
 * isPathMatch('src/api/**', 'src/api/routes/users.ts'); // true
 * isPathMatch('src/components/*.tsx', 'src/components/Button.tsx'); // true
 * isPathMatch('src/components/*.tsx', 'src/components/forms/Input.tsx'); // false
 * ```
 */
function isPathMatch(pattern: string, path: string): boolean {
  // Normalize both pattern and path (remove leading/trailing slashes)
  const normalizedPattern = pattern.replace(/^\/+|\/+$/g, '');
  const normalizedPath = path.replace(/^\/+|\/+$/g, '');

  // Convert glob pattern to regex
  const regexPattern = normalizedPattern
    // Escape special regex characters except * and **
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    // Handle ** (recursive match)
    .replace(/\*\*/g, '<<<DOUBLE_STAR>>>')
    // Handle * (single segment match - no slashes)
    .replace(/\*/g, '[^/]*')
    // Restore ** as match anything
    .replace(/<<<DOUBLE_STAR>>>/g, '.*');

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(normalizedPath);
}

// ============================================================================
// YAML Parsing Helpers
// ============================================================================

/**
 * Extract frontmatter content from markdown
 */
function extractFrontmatter(content: string): string | null {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  return match ? match[1] : null;
}

/**
 * Parse an inline array like [item1, item2, item3]
 */
function parseInlineArray(value: string): string[] {
  if (!value.startsWith('[') || !value.endsWith(']')) {
    return [];
  }
  const inner = value.slice(1, -1).trim();
  if (!inner) return [];

  return inner.split(',').map((item) => item.trim());
}

/**
 * Parse a simple YAML value (string, boolean, number)
 */
function parseYamlValue(value: string): string {
  // Remove surrounding quotes
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

/**
 * Parse tasks from YAML frontmatter with proper indentation handling
 *
 * Supports the format:
 * ```yaml
 * tasks:
 *   - id: task-name
 *     agent: agent-type
 *     paths: [pattern1, pattern2]
 *     requirements: [req1, req2]
 *     dependencies: [dep1, dep2]
 * ```
 */
function parseTasksFromYaml(yaml: string): TaskDefinition[] {
  const lines = yaml.split('\n');
  const tasks: TaskDefinition[] = [];
  let currentTask: Partial<TaskDefinition> | null = null;

  // Find the tasks: section
  let inTasks = false;
  let taskIndent = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // Check for tasks: key
    if (trimmed === 'tasks:') {
      inTasks = true;
      continue;
    }

    if (!inTasks) {
      continue;
    }

    // Check if we've exited the tasks section (less indent than expected)
    const lineIndent = line.search(/\S/);
    if (lineIndent >= 0 && !line.startsWith(' ') && !line.startsWith('\t') && !trimmed.startsWith('-')) {
      // We've hit a new top-level key
      inTasks = false;
      continue;
    }

    // New task item starts with -
    if (trimmed.startsWith('- ')) {
      // Save previous task
      if (currentTask && currentTask.id && currentTask.agent) {
        tasks.push({
          id: currentTask.id,
          agent: currentTask.agent,
          paths: currentTask.paths || [],
          requirements: currentTask.requirements || [],
          dependencies: currentTask.dependencies,
        });
      }

      // Start new task
      currentTask = {};
      taskIndent = lineIndent;

      // Parse the first property on the same line as -
      const afterDash = trimmed.slice(2).trim();
      if (afterDash) {
        const colonIdx = afterDash.indexOf(':');
        if (colonIdx > 0) {
          const key = afterDash.slice(0, colonIdx).trim();
          const value = afterDash.slice(colonIdx + 1).trim();
          setTaskProperty(currentTask, key, value);
        }
      }
      continue;
    }

    // Task property line
    if (currentTask && lineIndent > taskIndent) {
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx > 0) {
        const key = trimmed.slice(0, colonIdx).trim();
        const value = trimmed.slice(colonIdx + 1).trim();
        setTaskProperty(currentTask, key, value);
      }
    }
  }

  // Save last task
  if (currentTask && currentTask.id && currentTask.agent) {
    tasks.push({
      id: currentTask.id,
      agent: currentTask.agent,
      paths: currentTask.paths || [],
      requirements: currentTask.requirements || [],
      dependencies: currentTask.dependencies,
    });
  }

  return tasks;
}

/**
 * Set a property on a partial task object
 */
function setTaskProperty(task: Partial<TaskDefinition>, key: string, value: string): void {
  switch (key) {
    case 'id':
      task.id = parseYamlValue(value);
      break;
    case 'agent':
      task.agent = parseYamlValue(value);
      break;
    case 'paths':
      task.paths = parseInlineArray(value);
      break;
    case 'requirements':
      task.requirements = parseInlineArray(value);
      break;
    case 'dependencies':
      task.dependencies = parseInlineArray(value);
      break;
  }
}

// ============================================================================
// Plan Parsing Functions
// ============================================================================

/**
 * Parse YAML frontmatter from plan file content to extract task definitions
 *
 * Expects plan files with frontmatter in this format:
 *
 * ```yaml
 * ---
 * tasks:
 *   - id: api-development
 *     agent: api-specialist
 *     paths: [src/api/**, src/lib/api/**]
 *     requirements: [Implement REST endpoints, Add validation]
 *     dependencies: [database-setup]
 * ---
 * ```
 *
 * @param content - Full content of the plan file
 * @returns Parsed plan metadata with tasks, or null if no valid frontmatter
 *
 * @example
 * ```typescript
 * const planContent = fs.readFileSync('.claude/plans/feature.md', 'utf-8');
 * const metadata = parsePlanFrontmatter(planContent);
 * if (metadata) {
 *   console.log('Tasks:', metadata.tasks.length);
 * }
 * ```
 */
export function parsePlanFrontmatter(content: string): PlanMetadata | null {
  const yaml = extractFrontmatter(content);

  if (!yaml) {
    return null;
  }

  const tasks = parseTasksFromYaml(yaml);

  if (tasks.length === 0) {
    return null;
  }

  return { tasks };
}

/**
 * Validate task definitions for correctness
 *
 * Checks:
 * - All tasks have unique IDs
 * - All tasks have at least one path pattern
 * - All dependencies reference existing task IDs
 * - No circular dependencies
 *
 * @param tasks - Array of task definitions to validate
 * @returns Validation result with success status and any error messages
 *
 * @example
 * ```typescript
 * const result = validateTaskDefinitions(metadata.tasks);
 * if (!result.valid) {
 *   console.error('Validation errors:', result.errors);
 * }
 * ```
 */
export function validateTaskDefinitions(tasks: TaskDefinition[]): ValidationResult {
  const errors: string[] = [];
  const taskIds = new Set<string>();

  // First pass: collect IDs and check for duplicates
  for (const task of tasks) {
    if (taskIds.has(task.id)) {
      errors.push(`Duplicate task ID: '${task.id}'`);
    }
    taskIds.add(task.id);

    if (task.paths.length === 0) {
      errors.push(`Task '${task.id}' has no paths defined`);
    }
  }

  // Second pass: validate dependencies
  for (const task of tasks) {
    if (task.dependencies) {
      for (const dep of task.dependencies) {
        if (!taskIds.has(dep)) {
          errors.push(`Task '${task.id}' depends on unknown task: '${dep}'`);
        }
        if (dep === task.id) {
          errors.push(`Task '${task.id}' cannot depend on itself`);
        }
      }
    }
  }

  // Check for circular dependencies
  const circularErrors = detectCircularDependencies(tasks);
  errors.push(...circularErrors);

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Detect circular dependencies in task definitions
 *
 * Uses depth-first search to find cycles in the dependency graph.
 */
function detectCircularDependencies(tasks: TaskDefinition[]): string[] {
  const errors: string[] = [];
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(taskId: string, path: string[]): boolean {
    if (inStack.has(taskId)) {
      const cycleStart = path.indexOf(taskId);
      const cycle = [...path.slice(cycleStart), taskId].join(' -> ');
      errors.push(`Circular dependency detected: ${cycle}`);
      return true;
    }

    if (visited.has(taskId)) {
      return false;
    }

    visited.add(taskId);
    inStack.add(taskId);

    const task = taskMap.get(taskId);
    if (task?.dependencies) {
      for (const dep of task.dependencies) {
        if (dfs(dep, [...path, taskId])) {
          return true;
        }
      }
    }

    inStack.delete(taskId);
    return false;
  }

  for (const task of tasks) {
    if (!visited.has(task.id)) {
      dfs(task.id, []);
    }
  }

  return errors;
}

/**
 * Find the task definition that owns a given file path
 *
 * Searches through all tasks and returns the first task whose path patterns
 * match the given file path. Returns null if no task matches.
 *
 * @param tasks - Array of task definitions to search
 * @param filePath - File path to find the owning task for
 * @returns The matching task definition, or null if no match
 *
 * @example
 * ```typescript
 * const task = findTaskByPath(metadata.tasks, 'src/api/routes/users.ts');
 * if (task) {
 *   console.log(`File belongs to task '${task.id}' (agent: ${task.agent})`);
 * }
 * ```
 */
export function findTaskByPath(tasks: TaskDefinition[], filePath: string): TaskDefinition | null {
  for (const task of tasks) {
    if (isPathInScope(task.paths, filePath)) {
      return task;
    }
  }
  return null;
}

/**
 * Check if a file path matches any of the given path patterns
 *
 * @param taskPaths - Array of glob patterns to match against
 * @param filePath - File path to test
 * @returns True if the file path matches any pattern
 *
 * @example
 * ```typescript
 * const paths = ['src/api/**', 'src/lib/api/**'];
 * isPathInScope(paths, 'src/api/routes/users.ts'); // true
 * isPathInScope(paths, 'src/components/Button.tsx'); // false
 * ```
 */
export function isPathInScope(taskPaths: string[], filePath: string): boolean {
  return taskPaths.some((pattern) => isPathMatch(pattern, filePath));
}

/**
 * Find all tasks whose paths match a given file
 *
 * Unlike findTaskByPath which returns the first match, this returns all
 * matching tasks. Useful for detecting overlapping task scopes.
 *
 * @param tasks - Array of task definitions to search
 * @param filePath - File path to find matching tasks for
 * @returns Array of all matching task definitions
 */
export function findAllTasksByPath(tasks: TaskDefinition[], filePath: string): TaskDefinition[] {
  return tasks.filter((task) => isPathInScope(task.paths, filePath));
}
