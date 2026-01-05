/**
 * Tests for plan-parser utility
 */

import { describe, it, expect } from 'vitest';
import {
  parsePlanFrontmatter,
  validateTaskDefinitions,
  findTaskByPath,
  isPathInScope,
  findAllTasksByPath,
  type TaskDefinition,
} from './plan-parser.js';

describe('parsePlanFrontmatter', () => {
  it('should parse valid frontmatter with tasks', () => {
    const content = `---
tasks:
  - id: api-development
    agent: api-specialist
    paths: [src/api/**, src/lib/api/**]
    requirements: [Implement REST endpoints, Add validation]
    dependencies: [database-setup]
  - id: database-setup
    agent: db-specialist
    paths: [src/db/**]
    requirements: [Create schema]
---

# Plan Content

This is the plan body.
`;

    const result = parsePlanFrontmatter(content);

    expect(result).not.toBeNull();
    expect(result?.tasks).toHaveLength(2);
    expect(result?.tasks[0]).toEqual({
      id: 'api-development',
      agent: 'api-specialist',
      paths: ['src/api/**', 'src/lib/api/**'],
      requirements: ['Implement REST endpoints', 'Add validation'],
      dependencies: ['database-setup'],
    });
    expect(result?.tasks[1]).toEqual({
      id: 'database-setup',
      agent: 'db-specialist',
      paths: ['src/db/**'],
      requirements: ['Create schema'],
      dependencies: undefined,
    });
  });

  it('should return null for content without frontmatter', () => {
    const content = `# Just a heading

Some content without frontmatter.
`;

    const result = parsePlanFrontmatter(content);
    expect(result).toBeNull();
  });

  it('should return null for frontmatter without tasks', () => {
    const content = `---
title: My Plan
version: 1.0
---

# Plan Content
`;

    const result = parsePlanFrontmatter(content);
    expect(result).toBeNull();
  });

  it('should skip invalid task entries', () => {
    const content = `---
tasks:
  - id: valid-task
    agent: some-agent
    paths: [src/**]
    requirements: [Do something]
  - invalid-entry
  - id: another-valid
    agent: another-agent
    paths: [lib/**]
    requirements: [Do other thing]
---
`;

    const result = parsePlanFrontmatter(content);

    expect(result).not.toBeNull();
    expect(result?.tasks).toHaveLength(2);
    expect(result?.tasks[0].id).toBe('valid-task');
    expect(result?.tasks[1].id).toBe('another-valid');
  });
});

describe('validateTaskDefinitions', () => {
  it('should validate correct task definitions', () => {
    const tasks: TaskDefinition[] = [
      {
        id: 'task-1',
        agent: 'agent-1',
        paths: ['src/**'],
        requirements: ['req1'],
      },
      {
        id: 'task-2',
        agent: 'agent-2',
        paths: ['lib/**'],
        requirements: ['req2'],
        dependencies: ['task-1'],
      },
    ];

    const result = validateTaskDefinitions(tasks);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should detect duplicate task IDs', () => {
    const tasks: TaskDefinition[] = [
      {
        id: 'duplicate-id',
        agent: 'agent-1',
        paths: ['src/**'],
        requirements: ['req1'],
      },
      {
        id: 'duplicate-id',
        agent: 'agent-2',
        paths: ['lib/**'],
        requirements: ['req2'],
      },
    ];

    const result = validateTaskDefinitions(tasks);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Duplicate task ID: 'duplicate-id'");
  });

  it('should detect tasks with no paths', () => {
    const tasks: TaskDefinition[] = [
      {
        id: 'empty-paths',
        agent: 'agent-1',
        paths: [],
        requirements: ['req1'],
      },
    ];

    const result = validateTaskDefinitions(tasks);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Task 'empty-paths' has no paths defined");
  });

  it('should detect unknown dependencies', () => {
    const tasks: TaskDefinition[] = [
      {
        id: 'task-1',
        agent: 'agent-1',
        paths: ['src/**'],
        requirements: ['req1'],
        dependencies: ['nonexistent-task'],
      },
    ];

    const result = validateTaskDefinitions(tasks);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Task 'task-1' depends on unknown task: 'nonexistent-task'");
  });

  it('should detect self-dependencies', () => {
    const tasks: TaskDefinition[] = [
      {
        id: 'self-dep',
        agent: 'agent-1',
        paths: ['src/**'],
        requirements: ['req1'],
        dependencies: ['self-dep'],
      },
    ];

    const result = validateTaskDefinitions(tasks);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Task 'self-dep' cannot depend on itself");
  });

  it('should detect circular dependencies', () => {
    const tasks: TaskDefinition[] = [
      {
        id: 'task-a',
        agent: 'agent-1',
        paths: ['src/a/**'],
        requirements: ['req1'],
        dependencies: ['task-b'],
      },
      {
        id: 'task-b',
        agent: 'agent-2',
        paths: ['src/b/**'],
        requirements: ['req2'],
        dependencies: ['task-c'],
      },
      {
        id: 'task-c',
        agent: 'agent-3',
        paths: ['src/c/**'],
        requirements: ['req3'],
        dependencies: ['task-a'],
      },
    ];

    const result = validateTaskDefinitions(tasks);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Circular dependency detected'))).toBe(true);
  });
});

describe('isPathInScope', () => {
  it('should match ** recursive patterns', () => {
    expect(isPathInScope(['src/api/**'], 'src/api/routes/users.ts')).toBe(true);
    expect(isPathInScope(['src/api/**'], 'src/api/index.ts')).toBe(true);
    expect(isPathInScope(['src/api/**'], 'src/components/Button.tsx')).toBe(false);
  });

  it('should match * single-level patterns', () => {
    expect(isPathInScope(['src/components/*.tsx'], 'src/components/Button.tsx')).toBe(true);
    expect(isPathInScope(['src/components/*.tsx'], 'src/components/forms/Input.tsx')).toBe(false);
  });

  it('should match exact paths', () => {
    expect(isPathInScope(['src/index.ts'], 'src/index.ts')).toBe(true);
    expect(isPathInScope(['src/index.ts'], 'src/other.ts')).toBe(false);
  });

  it('should match any of multiple patterns', () => {
    const patterns = ['src/api/**', 'src/lib/api/**'];
    expect(isPathInScope(patterns, 'src/api/routes.ts')).toBe(true);
    expect(isPathInScope(patterns, 'src/lib/api/client.ts')).toBe(true);
    expect(isPathInScope(patterns, 'src/components/Button.tsx')).toBe(false);
  });

  it('should handle patterns with file extensions', () => {
    expect(isPathInScope(['**/*.test.ts'], 'src/utils/helper.test.ts')).toBe(true);
    expect(isPathInScope(['**/*.test.ts'], 'src/utils/helper.ts')).toBe(false);
  });
});

describe('findTaskByPath', () => {
  const tasks: TaskDefinition[] = [
    {
      id: 'api-task',
      agent: 'api-agent',
      paths: ['src/api/**'],
      requirements: ['Build API'],
    },
    {
      id: 'ui-task',
      agent: 'ui-agent',
      paths: ['src/components/**', 'src/pages/**'],
      requirements: ['Build UI'],
    },
  ];

  it('should find the task that owns a file', () => {
    const result = findTaskByPath(tasks, 'src/api/routes/users.ts');

    expect(result).not.toBeNull();
    expect(result?.id).toBe('api-task');
    expect(result?.agent).toBe('api-agent');
  });

  it('should return null for files not in any task scope', () => {
    const result = findTaskByPath(tasks, 'src/utils/helper.ts');

    expect(result).toBeNull();
  });

  it('should match multiple path patterns in a task', () => {
    expect(findTaskByPath(tasks, 'src/components/Button.tsx')?.id).toBe('ui-task');
    expect(findTaskByPath(tasks, 'src/pages/Home.tsx')?.id).toBe('ui-task');
  });
});

describe('findAllTasksByPath', () => {
  const tasks: TaskDefinition[] = [
    {
      id: 'shared-task',
      agent: 'shared-agent',
      paths: ['src/**'],
      requirements: ['Handle shared'],
    },
    {
      id: 'api-task',
      agent: 'api-agent',
      paths: ['src/api/**'],
      requirements: ['Build API'],
    },
  ];

  it('should find all tasks that match a file', () => {
    const result = findAllTasksByPath(tasks, 'src/api/routes.ts');

    expect(result).toHaveLength(2);
    expect(result.map((t) => t.id)).toContain('shared-task');
    expect(result.map((t) => t.id)).toContain('api-task');
  });

  it('should return empty array for unmatched files', () => {
    const result = findAllTasksByPath(tasks, 'lib/external.ts');

    expect(result).toHaveLength(0);
  });
});
