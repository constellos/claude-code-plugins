---
description: Guide to Turborepo monorepos with Vercel deployment for Next.js applications
capabilities:
  - Understanding Turborepo monorepo architecture
  - Configuring Vercel for monorepo deployments
  - Managing separate Vercel projects from a single repo
  - Setting up shared packages and internal dependencies
  - Optimizing CI/CD pipelines with Turborepo caching
---

# Turborepo with Vercel Monorepos

Complete guide for building and deploying Turborepo monorepos to Vercel, including patterns for multiple Vercel projects from a single repository.

## Monorepo Structure

### Standard Layout

```
my-monorepo/
├── apps/
│   ├── web/                    # Main Next.js app → Vercel Project 1
│   │   ├── package.json
│   │   ├── next.config.js
│   │   └── src/
│   ├── admin/                  # Admin Next.js app → Vercel Project 2
│   │   ├── package.json
│   │   ├── next.config.js
│   │   └── src/
│   └── docs/                   # Docs site → Vercel Project 3
│       ├── package.json
│       └── src/
├── packages/
│   ├── ui/                     # Shared React components
│   │   ├── package.json
│   │   └── src/
│   ├── config/                 # Shared configs (ESLint, TypeScript, Tailwind)
│   │   ├── eslint/
│   │   ├── typescript/
│   │   └── tailwind/
│   ├── database/               # Shared database client (Prisma/Drizzle)
│   │   ├── package.json
│   │   └── src/
│   └── utils/                  # Shared utilities
│       ├── package.json
│       └── src/
├── turbo.json                  # Turborepo configuration
├── package.json                # Root package.json
└── pnpm-workspace.yaml         # Workspace configuration (if using pnpm)
```

### Root Configuration Files

#### turbo.json

```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["**/.env.*local"],
  "globalEnv": [
    "NODE_ENV",
    "VERCEL_ENV",
    "VERCEL_URL"
  ],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"],
      "env": [
        "DATABASE_URL",
        "NEXT_PUBLIC_*"
      ]
    },
    "lint": {
      "dependsOn": ["^lint"]
    },
    "typecheck": {
      "dependsOn": ["^typecheck"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["^build"]
    }
  }
}
```

#### Root package.json

```json
{
  "name": "my-monorepo",
  "private": true,
  "scripts": {
    "build": "turbo build",
    "dev": "turbo dev",
    "lint": "turbo lint",
    "typecheck": "turbo typecheck",
    "test": "turbo test",
    "clean": "turbo clean && rm -rf node_modules"
  },
  "devDependencies": {
    "turbo": "^2.0.0"
  },
  "packageManager": "pnpm@9.0.0"
}
```

#### pnpm-workspace.yaml

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

## Vercel Configuration

### Multiple Projects from One Repo

Each app in `apps/` can be a separate Vercel project. Configure each via Vercel Dashboard or `vercel.json`.

#### Per-App vercel.json

Create in each app directory (e.g., `apps/web/vercel.json`):

```json
{
  "buildCommand": "cd ../.. && turbo build --filter=web",
  "outputDirectory": ".next",
  "installCommand": "cd ../.. && pnpm install",
  "framework": "nextjs"
}
```

#### Root Directory Setting

In Vercel project settings:
- **Root Directory**: `apps/web` (or whichever app)
- **Build Command**: Override if needed with Turborepo filter
- **Install Command**: `pnpm install` (runs at repo root)

### Vercel Project Setup Steps

1. **Create Project**: Import repo, select root directory as `apps/your-app`
2. **Configure Build**: Use Turborepo filtered builds
3. **Environment Variables**: Set per-project in Vercel Dashboard
4. **Domain**: Assign custom domain per project

### Ignored Build Step (monorepo optimization)

Create `apps/web/vercel-ignore-build.sh`:

```bash
#!/bin/bash
# Only rebuild if this app or its dependencies changed

echo "VERCEL_GIT_COMMIT_REF: $VERCEL_GIT_COMMIT_REF"

# Check if changes affect this app
npx turbo-ignore web
```

In Vercel settings, set "Ignored Build Step" to: `bash vercel-ignore-build.sh`

Or use built-in Turborepo ignore:
```
npx turbo-ignore
```

## Shared Packages

### Internal Package Setup

#### packages/ui/package.json

```json
{
  "name": "@repo/ui",
  "version": "0.0.0",
  "private": true,
  "exports": {
    ".": "./src/index.ts",
    "./button": "./src/button.tsx",
    "./card": "./src/card.tsx"
  },
  "scripts": {
    "lint": "eslint .",
    "typecheck": "tsc --noEmit"
  },
  "peerDependencies": {
    "react": "^18.0.0"
  },
  "devDependencies": {
    "@repo/config": "workspace:*",
    "typescript": "^5.0.0"
  }
}
```

#### Consuming in Apps

```json
// apps/web/package.json
{
  "dependencies": {
    "@repo/ui": "workspace:*",
    "@repo/database": "workspace:*"
  }
}
```

### TypeScript Configuration

#### packages/config/typescript/base.json

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "incremental": true
  }
}
```

#### packages/config/typescript/nextjs.json

```json
{
  "extends": "./base.json",
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "noEmit": true,
    "module": "esnext",
    "jsx": "preserve",
    "plugins": [{ "name": "next" }]
  }
}
```

### Tailwind Shared Config

#### packages/config/tailwind/index.js

```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "../../packages/ui/src/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0f9ff",
          500: "#0ea5e9",
          900: "#0c4a6e"
        }
      }
    }
  },
  plugins: []
};
```

## Database Packages

### Shared Prisma Client

#### packages/database/package.json

```json
{
  "name": "@repo/database",
  "version": "0.0.0",
  "private": true,
  "exports": {
    ".": "./src/index.ts",
    "./client": "./src/client.ts"
  },
  "scripts": {
    "db:generate": "prisma generate",
    "db:push": "prisma db push",
    "db:migrate": "prisma migrate dev",
    "postinstall": "prisma generate"
  },
  "dependencies": {
    "@prisma/client": "^5.0.0"
  },
  "devDependencies": {
    "prisma": "^5.0.0"
  }
}
```

#### packages/database/src/client.ts

```typescript
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query"] : [],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export * from "@prisma/client";
```

## CI/CD with GitHub Actions

### Turborepo Caching in CI

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
  TURBO_TEAM: ${{ vars.TURBO_TEAM }}

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v3
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "pnpm"

      - run: pnpm install

      - run: pnpm turbo build lint typecheck test
```

### Vercel Deployment Matrix

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  detect-changes:
    runs-on: ubuntu-latest
    outputs:
      web: ${{ steps.filter.outputs.web }}
      admin: ${{ steps.filter.outputs.admin }}
    steps:
      - uses: actions/checkout@v4
      - uses: dorny/paths-filter@v3
        id: filter
        with:
          filters: |
            web:
              - 'apps/web/**'
              - 'packages/**'
            admin:
              - 'apps/admin/**'
              - 'packages/**'

  deploy-web:
    needs: detect-changes
    if: needs.detect-changes.outputs.web == 'true'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID_WEB }}
          working-directory: apps/web

  deploy-admin:
    needs: detect-changes
    if: needs.detect-changes.outputs.admin == 'true'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID_ADMIN }}
          working-directory: apps/admin
```

## Remote Caching

### Vercel Remote Cache Setup

1. **Create Token**: `npx turbo login`
2. **Link Repo**: `npx turbo link`
3. **Environment**: Set `TURBO_TOKEN` and `TURBO_TEAM` in CI

### Self-Hosted Cache (Optional)

For enterprise, use `turborepo-remote-cache`:

```json
// turbo.json
{
  "remoteCache": {
    "signature": true
  }
}
```

## Common Patterns

### Environment Variables

#### Per-App .env

```bash
# apps/web/.env.local
DATABASE_URL="..."
NEXT_PUBLIC_API_URL="..."
```

#### Shared via packages

```typescript
// packages/config/env.ts
import { z } from "zod";

export const serverEnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  NODE_ENV: z.enum(["development", "production", "test"]),
});

export const clientEnvSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url(),
});
```

### Monorepo Scripts

```json
// Root package.json
{
  "scripts": {
    "dev": "turbo dev",
    "dev:web": "turbo dev --filter=web",
    "dev:admin": "turbo dev --filter=admin",
    "build": "turbo build",
    "build:web": "turbo build --filter=web...",
    "lint": "turbo lint",
    "typecheck": "turbo typecheck",
    "test": "turbo test",
    "clean": "turbo clean && rm -rf node_modules",
    "db:generate": "turbo db:generate",
    "db:push": "turbo db:push --filter=@repo/database"
  }
}
```

## Troubleshooting

### Common Issues

1. **Workspace dependency not found**: Ensure `workspace:*` protocol and package name matches
2. **Build order issues**: Check `dependsOn` in turbo.json
3. **Missing types**: Add internal packages to TypeScript paths or use exports
4. **Vercel build fails**: Ensure install command runs at repo root

### Debug Commands

```bash
# Check dependency graph
turbo build --graph

# Dry run to see what would execute
turbo build --dry-run

# Force rebuild (skip cache)
turbo build --force

# See what changed
turbo build --filter='[HEAD^1]'
```

## Best Practices

1. **Keep packages small and focused** - One responsibility per package
2. **Use consistent naming** - `@repo/package-name` convention
3. **Version together** - Use `workspace:*` for internal deps
4. **Cache aggressively** - Configure Turborepo outputs correctly
5. **Isolate environments** - Each Vercel project gets its own env vars
6. **Use path filters** - Only rebuild/deploy what changed
7. **Document package APIs** - Export types and document usage

## See Also

- [Turborepo Documentation](https://turbo.build/repo/docs)
- [Vercel Monorepos Guide](https://vercel.com/docs/monorepos)
- [Next.js in Monorepos](https://nextjs.org/docs/app/building-your-application/configuring/monorepos)
