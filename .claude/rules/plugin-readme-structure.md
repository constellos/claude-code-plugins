---
markdown:
  headings:
    allowed: ["#*", "##*", "###*", "####*"]
    required: [
      "# 🔌 *",
      "## 📋 Table of Contents",
      "## 🎯 Overview",
      "## ✨ Features",
      "## 📦 Installation",
      "## 🪝 Hooks",
      "## ⚙️ Configuration",
      "## 💡 Use Cases",
      "## 🐛 Troubleshooting",
      "## 🤝 Contributing",
      "## 📚 See Also",
      "## 📄 License"
    ]
paths:
  - "plugins/*/README.md"
---

# Plugin README Structure

This rule enforces modern standardized structure for all plugin README files.

## Required Skills: None

## Overview

All plugin README.md files must follow a modern template with:
- Shields.io badges at the top ("for-the-badge" style)
- Emoji-prefixed section headers for visual hierarchy
- Table of contents with anchor links
- Consistent section organization
- Code examples with syntax highlighting
- Collapsible `<details>` sections for advanced content

## Required Sections

### 1. Badges (before H1)
Must include shields.io badges for:
- Version
- License (MIT)
- Node.js version requirement (≥18.0.0)
- TypeScript version
- Technology stack (plugin-specific)

Badge style: `style=for-the-badge`

**Example:**
```markdown
![Version](https://img.shields.io/badge/version-0.1.0-blue?style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-green?style=for-the-badge)
![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen?style=for-the-badge&logo=node.js)
```

### 2. Title (H1)
Must start with 🔌 emoji followed by plugin name.

**Example:**
```markdown
# 🔌 My Plugin Name
```

### 3. Value Proposition
One-line description in blockquote immediately after title.

**Example:**
```markdown
> Brief compelling description of what this plugin does
```

### 4. 📋 Table of Contents
Auto-linked table of contents with all major sections.

**Example:**
```markdown
## 📋 Table of Contents
- [Overview](#-overview)
- [Features](#-features)
- [Installation](#-installation)
[...]
```

### 5. 🎯 Overview
2-3 paragraphs explaining plugin purpose, capabilities, and ideal use cases.

### 6. ✨ Features
Detailed feature breakdown organized by category. Each feature should have:
- **Bold feature name** - Description

Can include subsections (H3) for feature categories.

### 7. 📦 Installation
Installation command and optional configuration steps.

**Must include:**
```bash
claude plugin install plugin-name@constellos
```

### 8. 🪝 Hooks
Comprehensive documentation of all hooks. For each hook:
- **H3 heading**: `{Event} - {Hook Name}`
- **File path**: `hooks/file-name.ts`
- **Blocking status**: Yes/No
- **Description**: What the hook does

**Optional**: Collapsible `<details>` sections with code examples.

### 9. ⚙️ Configuration
Settings, environment variables, or plugin-specific configuration options.

### 10. 💡 Use Cases
Table format showing use cases, descriptions, and benefits.

**Example:**
```markdown
| Use Case | Description | Benefit |
|----------|-------------|---------|
| {name} | {description} | {benefit} |
```

### 11. 🐛 Troubleshooting
Common issues and solutions, preferably in collapsible `<details>` sections.

**Example:**
```markdown
<details>
<summary>Issue Description</summary>

Solution steps...
</details>
```

### 12. 🤝 Contributing
Guidelines for contributors (pull requests, issues, development setup).

### 13. 📚 See Also
Links to:
- Plugin CLAUDE.md (if exists)
- Root marketplace CLAUDE.md
- Official documentation
- Related plugins

### 14. 📄 License
License information (MIT © constellos).

## Code Formatting

- All bash/shell code blocks must specify language: ` ```bash `
- All TypeScript code blocks must specify language: ` ```typescript `
- All JSON code blocks must specify language: ` ```json `
- All YAML code blocks must specify language: ` ```yaml `

## Visual Hierarchy

- Use horizontal rules (`---`) to separate major sections
- Use emoji prefixes on all H2 headers (required emojis listed above)
- Use collapsible `<details>` sections for advanced or optional content
- Use tables for structured data (hooks, use cases, comparisons)
- Use blockquotes for important notes or callouts

## Implementation

This rule is enforced by the `enforce-structured-markdown.ts` PreToolUse[Write|Edit] hook in the project-context plugin.

The hook validates:
1. Badge presence before H1
2. Emoji prefixes on H2 headers
3. Required heading structure
4. Anchor link format in TOC
5. Code block language specifications

## Examples

**Good README structure:**
```markdown
![Version](https://img.shields.io/badge/version-0.1.0-blue?style=for-the-badge)

# 🔌 Example Plugin

> One-line value proposition

---

## 📋 Table of Contents
- [Overview](#-overview)
- [Features](#-features)
[...]

---

## 🎯 Overview
Detailed explanation...

---

## ✨ Features
### Feature Category
- **Feature Name** - Description
```

**Bad README structure:**
```markdown
# Example Plugin

## Overview
Missing badges, emoji prefixes, TOC, and other required sections.
```

## References

- [Official Claude Code README](https://github.com/anthropics/claude-code/blob/main/README.md)
- [Shields.io Documentation](https://shields.io/)
- [Markdown Badges](https://ileriayo.github.io/markdown-badges/)
- [README Template](../../templates/README.template.md)
