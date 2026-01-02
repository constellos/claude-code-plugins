# Plugin README Structure

This rule defines the minimal structure for plugin README files.

## Required Skills: None

## Overview

Plugin READMEs have two optional content sections: **Purpose** and **Contents**. Neither is required, but these are the only valid content sections.

## Implementation

### Structure

```markdown
![badges]

# Plugin Name

> One-line tagline

## Purpose

2-3 sentences explaining what the plugin does.

## Contents

### Hooks

| Hook | Event | Purpose |
|------|-------|---------|

### Agents

| Agent | Purpose |
|-------|---------|

### Skills

| Skill | Purpose |
|-------|---------|

### Output Styles

| Style | Purpose |
|-------|---------|

## Installation

## License
```

### Valid Content Sections

Only include subsections that have content:

- **Hooks** - Table: Hook | Event | Purpose
- **Agents** - Table: Agent | Purpose
- **Skills** - Table: Skill | Purpose
- **Rules** - Table: Rule | Purpose
- **Commands** - Table: Command | Purpose
- **Output Styles** - Table: Style | Purpose
