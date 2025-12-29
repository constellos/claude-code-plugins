# MCP Synchronization Rules

Synchronization rules for task state, memory persistence, and webhook triggers.

## Required Skills: None

## When to Sync Task State to MCP

Always sync immediately when tasks are created, updated, or completed.

## Memory Persistence

Store agent context, file analysis, and decisions in task_memory table.

## Webhook Triggers

Trigger webhooks when tasks complete and dependencies are satisfied.

## Error Handling

Use exponential backoff for transient errors. Fail fast on validation errors.
