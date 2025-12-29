![Version](https://img.shields.io/badge/version-0.1.0-blue?style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-green?style=for-the-badge)
![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen?style=for-the-badge&logo=node.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue?style=for-the-badge&logo=typescript)
<!-- Add technology-specific badges here -->

# 🔌 Plugin Name

> One-line compelling description of what this plugin does

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Installation](#-installation)
- [Hooks](#-hooks)
- [Configuration](#-configuration)
- [Use Cases](#-use-cases)
- [Troubleshooting](#-troubleshooting)
- [Contributing](#-contributing)
- [See Also](#-see-also)
- [License](#-license)

---

## 🎯 Overview

2-3 paragraphs explaining the plugin's purpose, capabilities, and ideal use cases.

First paragraph should explain what the plugin does at a high level.

Second paragraph should explain the key capabilities and how they work together.

Third paragraph (optional) should explain what makes this plugin special or when to use it.

---

## ✨ Features

### Feature Category 1
- **Feature Name** - Brief description of the feature
- **Another Feature** - Brief description
- **Third Feature** - Brief description

### Feature Category 2
- **Feature Name** - Brief description
- **Another Feature** - Brief description

### Feature Category 3
- **Feature Name** - Brief description
- **Another Feature** - Brief description

---

## 📦 Installation

```bash
claude plugin install plugin-name@constellos
```

---

## 🪝 Hooks

### HookEvent - hook-file-name.ts

**File:** `hooks/hook-file-name.ts`
**Blocking:** Yes/No

Brief description of what this hook does (1-2 sentences).

**Behavior:**
- Key behavior point 1
- Key behavior point 2
- Key behavior point 3

<details>
<summary>📝 Example Output/Usage</summary>

```
Example output or code showing how the hook works
```
</details>

---

### HookEvent - another-hook.ts

**File:** `hooks/another-hook.ts`
**Blocking:** Yes/No

Brief description of what this hook does.

**Behavior:**
- Key behavior point 1
- Key behavior point 2

---

## ⚙️ Configuration

Add to `.claude/settings.json`:

```json
{
  "enabledPlugins": {
    "plugin-name@constellos": true
  }
}
```

**Additional configuration (if applicable):**

```json
{
  "pluginSpecificSettings": {
    "option1": "value1",
    "option2": "value2"
  }
}
```

**Environment variables (if applicable):**

```bash
PLUGIN_SETTING=value
```

**Required package.json scripts (if applicable):**

```json
{
  "scripts": {
    "script-name": "command"
  }
}
```

---

## 💡 Use Cases

| Use Case | Description | Benefit |
|----------|-------------|---------|
| Use case 1 | What the user is trying to do | How the plugin helps |
| Use case 2 | What the user is trying to do | How the plugin helps |
| Use case 3 | What the user is trying to do | How the plugin helps |
| Use case 4 | What the user is trying to do | How the plugin helps |
| Use case 5 | What the user is trying to do | How the plugin helps |

---

## 🐛 Troubleshooting

<details>
<summary>Common issue 1</summary>

1. Step to diagnose the issue
2. Step to fix the issue
3. Verification step
4. Debug logging command:
   ```bash
   DEBUG=hook-name claude
   ```
</details>

<details>
<summary>Common issue 2</summary>

1. Step to diagnose the issue
2. Step to fix the issue
3. Verification step
</details>

<details>
<summary>Common issue 3</summary>

1. Step to diagnose the issue
2. Step to fix the issue
3. Verification step
</details>

---

## 🤝 Contributing

When modifying hooks:

1. Update hook implementation in `hooks/`
2. Run type checking: `npm run typecheck`
3. Run linting: `npm run lint`
4. Test hooks manually with `DEBUG=* claude`
5. Update this README
6. Update [CLAUDE.md](./CLAUDE.md) quick reference
7. Reinstall plugin to refresh cache

---

## 📚 See Also

- [CLAUDE.md](./CLAUDE.md) - Quick reference for AI context
- [Marketplace](../../CLAUDE.md) - All available plugins and architecture
- [Plugin Development Guide](../../.claude/skills/claude-plugins/SKILL.md)
- [Hook Development Guide](../../.claude/skills/claude-hooks/SKILL.md)

---

## 📄 License

MIT © constellos
