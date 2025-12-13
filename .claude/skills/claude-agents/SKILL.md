---
description: Guide to creating custom subagents for specialized tasks in Claude Code
capabilities:
  - Understanding subagents vs main Claude
  - Creating agent definitions
  - Agent markdown format
  - When to use custom agents
---

# Claude Code Subagents

Subagents are specialized AI assistants that Claude can invoke for complex, multi-step tasks requiring focused expertise.

## Overview

Subagents are autonomous AI instances that:
- Run in isolated sessions with their own context
- Have specialized prompts and capabilities
- Can be invoked automatically by Claude or manually by users
- Generate transcripts tracked separately from main session

## Built-in Agents

Claude Code includes several built-in subagents:

- **Explore**: Fast codebase exploration and search
- **Plan**: Implementation planning and design
- **general-purpose**: Complex multi-step tasks

## Custom Agents

### Agent File Format

Agents are Markdown files in `.claude/agents/` or `~/.claude/agents/`:

```markdown
---
description: What this agent specializes in
capabilities: ["task1", "task2", "task3"]
---

# Agent Name

Detailed description of the agent's role, expertise, and when Claude should invoke it.

## Capabilities

- Specific task the agent excels at
- Another specialized capability
- When to use this agent vs others

## Guidelines

Instructions for how the agent should approach tasks.

## Examples

Examples of when this agent should be used and what kinds of problems it solves.
```

### Agent Structure Example

```markdown
---
description: Security review and vulnerability detection
capabilities: ["security-audit", "vulnerability-scan", "code-review"]
---

# Security Reviewer

Specialized agent for analyzing code security and identifying vulnerabilities.

## Capabilities

- Identify common security vulnerabilities (XSS, SQL injection, CSRF, etc.)
- Review authentication and authorization logic
- Check for sensitive data exposure
- Audit dependency security
- Recommend security best practices

## Approach

1. Systematically scan code for security patterns
2. Identify potential vulnerabilities with severity ratings
3. Provide specific remediation guidance
4. Reference OWASP Top 10 and security standards

## When to Use

- Before deploying new features
- After major authentication changes
- When handling sensitive user data
- Regular security audits
- Responding to security concerns
```

## Agent Invocation

### Automatic (by Claude)

Claude decides when to invoke agents based on task context:

```
User: "Review this authentication code for security issues"
Claude: *Invokes Security Reviewer agent*
```

### Manual (by User)

Users can invoke specific agents via Task tool or UI.

### Programmatic

```typescript
// Claude uses Task tool internally
Task({
  subagent_type: "security-reviewer",
  prompt: "Review auth.ts for vulnerabilities"
})
```

## Agent vs Other Components

### Agent vs Skill

**Agents**:
- Run in separate session
- Complex, multi-step tasks
- Full tool access
- Generate own transcript

**Skills**:
- Loaded as context in main session
- Provide knowledge/guidance
- No separate execution
- Model-invoked

### Agent vs Command

**Agents**:
- Autonomous execution
- Multi-step workflows
- Background tasks
- Specialized expertise

**Commands**:
- Single prompts to main Claude
- User-initiated workflows
- Same session context
- General instructions

## Plugin Agents

Plugins can provide agents in their `agents/` directory:

```
my-plugin/
├── .claude-plugin/
│   └── plugin.json
└── agents/
    ├── security-reviewer.md
    └── performance-analyzer.md
```

Plugin agents are automatically available when installed.

## Agent Configuration

### Project Agents
`.claude/agents/` - Project-specific agents

### User Agents
`~/.claude/agents/` - Personal agents across all projects

### Plugin Agents
`plugins/*/agents/` - Shared via plugins

## Best Practices

### Agent Design

- **Focused expertise**: One specialized domain per agent
- **Clear capabilities**: Explicitly list what agent does
- **When to invoke**: Help Claude understand when to use
- **Systematic approach**: Define methodical workflow

### Agent Scope

**Good Agent Examples**:
- Security reviewer
- Performance optimizer
- Test generator
- API designer
- Database schema migrator

**Poor Agent Examples**:
- "Helper" (too vague)
- "Everything" (too broad)
- "Fix bugs" (not specialized enough)

### Agent Prompts

- Be specific about expertise domain
- Include step-by-step approach
- Reference relevant standards/best practices
- Provide examples of ideal usage

## Subagent Lifecycle

1. **SubagentStart Event**: Fired when agent begins
   - Hooks can track agent context
   - Save metadata for later analysis

2. **Execution**: Agent works autonomously
   - Full tool access
   - Separate transcript
   - Isolated context

3. **SubagentStop Event**: Fired when agent completes
   - Hooks can analyze agent edits
   - Track file changes
   - Log results

## Tracking Agent Activity

Use hooks to monitor subagent activity:

```typescript
// SubagentStop hook
export default async function (input: SubagentStopInput) {
  const edits = await getAgentEdits(input.agent_transcript_path);

  console.log('Agent type:', edits.subagentType);
  console.log('Files created:', edits.agentNewFiles);
  console.log('Files edited:', edits.agentEditedFiles);
  console.log('Files deleted:', edits.agentDeletedFiles);

  return { continue: true };
}
```

## Official Documentation

For complete specifications:
- **Subagents Guide**: https://code.claude.com/docs/en/sub-agents.md

## See Also

- `.claude/skills/claude-plugins/SKILL.md` - Plugin system overview
- `.claude/skills/claude-skills/SKILL.md` - Agent Skills (simpler alternative)
- `.claude/skills/claude-hooks/SKILL.md` - Track agent activity with hooks
- `packages/base/lib/subagent-state.ts` - Agent tracking utilities
