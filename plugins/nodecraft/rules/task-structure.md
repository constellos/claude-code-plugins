# Task Structure

Standard formats for tasks, memory, workflows, and agent communication in the nodecraft system.

## Required Skills: None

## Task Payload Structure

All tasks MUST use this standard payload format:

```json
{
  "type": "review" | "plan" | "implement" | "test",
  "status": "pending" | "running" | "completed" | "failed",
  "priority": 1-100,
  "payload": {
    "files": ["path/to/file1.ts", "path/to/file2.ts"],
    "context": {
      "description": "Human-readable task description",
      "requirements": ["requirement1", "requirement2"],
      "constraints": ["constraint1"]
    },
    "agent_config": {
      "agent_type": "reviewer" | "planner",
      "model": "sonnet" | "opus" | "haiku",
      "tools": ["Read", "Grep", "Glob", "mcp__*"]
    },
    "result": {
      "summary": "Task result summary",
      "artifacts": ["path/to/output1.md"],
      "next_tasks": ["uuid-of-next-task"]
    }
  },
  "assigned_agent_id": "uuid-or-null",
  "created_by": "uuid",
  "created_at": "2025-12-28T12:00:00Z",
  "updated_at": "2025-12-28T12:00:00Z",
  "completed_at": "2025-12-28T12:30:00Z"
}
```

## Memory Format Conventions

### Conversation Memory

```json
{
  "memory_type": "conversation",
  "content": {
    "role": "user" | "assistant",
    "message": "Message content",
    "timestamp": "2025-12-28T12:00:00Z",
    "tool_calls": [...]
  }
}
```

### File Context Memory

```json
{
  "memory_type": "file_context",
  "content": {
    "file_path": "src/components/Button.tsx",
    "summary": "React button component with variants",
    "key_functions": ["Button", "ButtonProps"],
    "dependencies": ["react", "tailwindcss"],
    "last_analyzed": "2025-12-28T12:00:00Z"
  }
}
```

### Analysis Memory

```json
{
  "memory_type": "analysis",
  "content": {
    "analysis_type": "code_review" | "architecture" | "security",
    "findings": [
      {
        "severity": "critical" | "high" | "medium" | "low",
        "category": "security" | "performance" | "maintainability",
        "description": "Finding description",
        "file_location": "path/to/file.ts:123",
        "recommendation": "How to fix"
      }
    ],
    "summary": "Overall analysis summary"
  }
}
```

### Decision Memory

```json
{
  "memory_type": "decision",
  "content": {
    "decision": "Chose approach X over Y",
    "rationale": "Why this decision was made",
    "alternatives_considered": ["approach Y", "approach Z"],
    "impact": "Expected impact of decision",
    "timestamp": "2025-12-28T12:00:00Z"
  }
}
```

## Workflow State Schema

```json
{
  "workflow_type": "review_to_plan" | "plan_to_implement" | "full_cycle",
  "current_phase": "review" | "plan" | "implement" | "verify" | "complete",
  "tasks": ["uuid1", "uuid2", "uuid3"],
  "state": {
    "review_completed": true,
    "plan_approved": false,
    "implementation_started": false,
    "tests_passing": false
  },
  "created_by": "uuid",
  "created_at": "2025-12-28T12:00:00Z",
  "updated_at": "2025-12-28T12:00:00Z"
}
```

## Agent Communication Patterns

### Reviewer to Planner

Reviewer agent creates tasks for planner:

```typescript
// Create task via MCP
await mcp__constellos_mcp__create_task({
  type: "plan",
  priority: 80,
  payload: {
    context: {
      description: "Create implementation plan for OAuth integration",
      requirements: [
        "Support GitHub and Google OAuth providers",
        "Store tokens securely in Supabase",
        "Handle token refresh automatically"
      ],
      constraints: [
        "Must use existing auth system",
        "No breaking changes to current sessions"
      ]
    },
    agent_config: {
      agent_type: "planner",
      model: "opus"
    }
  }
});

// Store analysis in memory
await mcp__constellos_mcp__add_task_memory({
  task_id: "review-task-uuid",
  memory_type: "analysis",
  content: {
    findings: [...],
    summary: "..."
  }
});
```

### Planner to Actions

Planner agent links to constellos-actions:

```typescript
// Create workflow
const workflowId = await mcp__constellos_mcp__create_workflow({
  workflow_type: "plan_to_implement",
  current_phase: "plan",
  tasks: [task1Id, task2Id, task3Id]
});

// Link to action with webhook
await mcp__constellos_mcp__link_constellos_action({
  task_id: planTaskId,
  action_type: "execute-plan",
  webhook_url: "https://constellos-actions.vercel.app/webhooks/execute",
  payload: {
    workflow_id: workflowId,
    implementation_steps: [...],
    test_requirements: [...]
  }
});
```

## Task Dependency Format

```json
{
  "task_id": "uuid-of-dependent-task",
  "depends_on_task_id": "uuid-of-prerequisite-task",
  "dependency_type": "blocks" | "requires" | "triggers"
}
```

**Dependency Types:**
- **blocks**: Dependent task cannot start until prerequisite completes
- **requires**: Dependent task needs output from prerequisite
- **triggers**: Completion of prerequisite automatically starts dependent task

## Priority Levels

- **90-100**: Critical - Must be done immediately
- **70-89**: High - Important, do soon
- **40-69**: Medium - Normal priority
- **20-39**: Low - Nice to have
- **1-19**: Very Low - Can wait indefinitely

## Best Practices

1. **Always include file references** in task payload
2. **Store agent decisions in memory** for future context
3. **Link related tasks** via dependencies
4. **Use appropriate memory types** for different contexts
5. **Include timestamps** for all time-based data
6. **Provide clear descriptions** for all tasks
7. **Specify agent requirements** in agent_config
8. **Store artifacts** (plans, reports) with task results
