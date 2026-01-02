---
name: UI Design
description: This skill should be used when the user asks to "create a component", "build static UI", "design with TypeScript", "use compound components", "implement contract-first UI", "create React component", "build with Shadcn", or mentions TypeScript interfaces for components, compound component patterns, or Server Components. Provides contract-first static UI methodology with compound components.
version: 0.1.0
---

# UI Design

Contract-first static UI methodology using TypeScript interfaces and compound components.

## Purpose

UI Design is the second step in the UI development workflow, following wireframing. Define TypeScript interfaces first (the "contract"), then implement compound components with Tailwind CSS styling. Server Components are the default.

## When to Use

- After wireframes are approved (WIREFRAME.md exists)
- When implementing new UI components
- When creating reusable component libraries
- When defining component APIs with TypeScript

## Core Principles

### Contract-First Development

Define TypeScript interfaces before implementation:

```typescript
// 1. Define the contract first
interface FeatureCardProps {
  title: string;
  description: string;
  icon: IconName;
  href?: string;
}

// 2. Then implement the component
function FeatureCard({ title, description, icon, href }: FeatureCardProps) {
  // Implementation
}
```

### Server Components by Default

All components are React Server Components unless they need:
- Event handlers (onClick, onChange)
- Browser APIs (localStorage, window)
- React hooks (useState, useEffect)

```typescript
// Server Component (default) - no "use client" directive
export function FeatureCard({ title, description }: FeatureCardProps) {
  return (
    <article className="rounded-lg border p-6">
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="text-muted-foreground">{description}</p>
    </article>
  );
}
```

### Compound Component Pattern

Structure complex components with composable parts:

```typescript
// Root component provides context
function Card({ children, className }: CardProps) {
  return (
    <div className={cn("rounded-lg border bg-card", className)}>
      {children}
    </div>
  );
}

// Sub-components for each section
function CardHeader({ children, className }: CardHeaderProps) {
  return (
    <div className={cn("flex flex-col space-y-1.5 p-6", className)}>
      {children}
    </div>
  );
}

function CardTitle({ children, className }: CardTitleProps) {
  return (
    <h3 className={cn("text-2xl font-semibold", className)}>
      {children}
    </h3>
  );
}

function CardContent({ children, className }: CardContentProps) {
  return (
    <div className={cn("p-6 pt-0", className)}>
      {children}
    </div>
  );
}

function CardFooter({ children, className }: CardFooterProps) {
  return (
    <div className={cn("flex items-center p-6 pt-0", className)}>
      {children}
    </div>
  );
}

// Export compound component
export { Card, CardHeader, CardTitle, CardContent, CardFooter };
```

## UI Design Workflow

### Step 1: Define TypeScript Interfaces

Start with the component contract:

```typescript
// types.ts
import type { ReactNode } from 'react';

export interface CardProps {
  children: ReactNode;
  className?: string;
  variant?: 'default' | 'outlined' | 'elevated';
}

export interface CardHeaderProps {
  children: ReactNode;
  className?: string;
}

export interface CardTitleProps {
  children: ReactNode;
  className?: string;
  as?: 'h1' | 'h2' | 'h3' | 'h4';
}

export interface CardDescriptionProps {
  children: ReactNode;
  className?: string;
}

export interface CardContentProps {
  children: ReactNode;
  className?: string;
}

export interface CardFooterProps {
  children: ReactNode;
  className?: string;
  align?: 'start' | 'center' | 'end' | 'between';
}
```

### Step 2: Create Compound Components

Implement each part of the compound component:

```typescript
// card.tsx
import { cn } from '@/lib/utils';
import type {
  CardProps,
  CardHeaderProps,
  CardTitleProps,
  CardDescriptionProps,
  CardContentProps,
  CardFooterProps,
} from './types';

const variantStyles = {
  default: 'bg-card text-card-foreground',
  outlined: 'border-2 bg-transparent',
  elevated: 'bg-card shadow-lg',
} as const;

export function Card({ children, className, variant = 'default' }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border',
        variantStyles[variant],
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: CardHeaderProps) {
  return (
    <div className={cn('flex flex-col space-y-1.5 p-6', className)}>
      {children}
    </div>
  );
}

export function CardTitle({
  children,
  className,
  as: Tag = 'h3',
}: CardTitleProps) {
  return (
    <Tag className={cn('text-2xl font-semibold leading-none tracking-tight', className)}>
      {children}
    </Tag>
  );
}

export function CardDescription({ children, className }: CardDescriptionProps) {
  return (
    <p className={cn('text-sm text-muted-foreground', className)}>
      {children}
    </p>
  );
}

export function CardContent({ children, className }: CardContentProps) {
  return (
    <div className={cn('p-6 pt-0', className)}>
      {children}
    </div>
  );
}

const alignStyles = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
  between: 'justify-between',
} as const;

export function CardFooter({
  children,
  className,
  align = 'start',
}: CardFooterProps) {
  return (
    <div className={cn('flex items-center p-6 pt-0', alignStyles[align], className)}>
      {children}
    </div>
  );
}
```

### Step 3: Create Barrel Export

Organize exports in index.ts:

```typescript
// index.ts
export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from './card';

export type {
  CardProps,
  CardHeaderProps,
  CardTitleProps,
  CardDescriptionProps,
  CardContentProps,
  CardFooterProps,
} from './types';
```

### Step 4: Style with Tailwind CSS

Apply mobile-first responsive styling:

```typescript
export function FeatureGrid({ features }: FeatureGridProps) {
  return (
    <div className={cn(
      // Mobile: single column
      'grid grid-cols-1 gap-4',
      // Tablet: two columns
      'md:grid-cols-2 md:gap-6',
      // Desktop: three columns
      'lg:grid-cols-3 lg:gap-8'
    )}>
      {features.map((feature) => (
        <Card key={feature.id}>
          <CardHeader>
            <CardTitle>{feature.title}</CardTitle>
            <CardDescription>{feature.description}</CardDescription>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}
```

## Component Library Integration

### Shadcn UI

Install and use Shadcn components as the foundation:

```bash
npx shadcn@latest add button card input
```

Reference: https://ui.shadcn.com/docs/components

Extend Shadcn components when needed:

```typescript
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface LoadingButtonProps extends React.ComponentProps<typeof Button> {
  loading?: boolean;
}

export function LoadingButton({
  loading,
  children,
  disabled,
  className,
  ...props
}: LoadingButtonProps) {
  return (
    <Button
      disabled={disabled || loading}
      className={cn(loading && 'cursor-wait', className)}
      {...props}
    >
      {loading ? <Spinner className="mr-2 h-4 w-4" /> : null}
      {children}
    </Button>
  );
}
```

### Radix Primitives

Use Radix for accessible, unstyled primitives:

```typescript
import * as Dialog from '@radix-ui/react-dialog';

export function Modal({ open, onOpenChange, children }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-6">
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

Reference: https://www.radix-ui.com/primitives/docs/overview/introduction

### AI Elements

Use AI Elements for AI-specific UI patterns:

```typescript
import { Chat, Message, MessageInput } from '@ai-elements/react';

export function ChatInterface({ messages, onSend }: ChatInterfaceProps) {
  return (
    <Chat>
      {messages.map((msg) => (
        <Message key={msg.id} role={msg.role}>
          {msg.content}
        </Message>
      ))}
      <MessageInput onSubmit={onSend} />
    </Chat>
  );
}
```

## File Structure

Organize component files consistently:

```
components/
└── feature-card/
    ├── index.ts           # Barrel exports
    ├── types.ts           # TypeScript interfaces
    ├── feature-card.tsx   # Main component
    ├── feature-card.test.tsx  # Tests
    └── WIREFRAME.md       # Layout documentation
```

For compound components:

```
components/
└── card/
    ├── index.ts           # Exports all parts
    ├── types.ts           # All interfaces
    ├── card.tsx           # Root component
    ├── card-header.tsx    # Sub-component
    ├── card-content.tsx   # Sub-component
    ├── card-footer.tsx    # Sub-component
    └── card.test.tsx      # Tests
```

## Usage Patterns

### Composition over Configuration

Prefer composable components over prop-heavy ones:

```typescript
// Avoid: Too many props
<Card
  title="Feature"
  description="Description"
  footer={<Button>Action</Button>}
  headerIcon={<Icon />}
/>

// Prefer: Composable structure
<Card>
  <CardHeader>
    <Icon />
    <CardTitle>Feature</CardTitle>
    <CardDescription>Description</CardDescription>
  </CardHeader>
  <CardFooter>
    <Button>Action</Button>
  </CardFooter>
</Card>
```

### Variant Props with Type Safety

Use discriminated unions for variants:

```typescript
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
  ghost: 'hover:bg-accent hover:text-accent-foreground',
  destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
};
```

### Forwarding Refs

Support ref forwarding for DOM access:

```typescript
import { forwardRef } from 'react';

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-10 w-full rounded-md border bg-background px-3 py-2',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';
```

## Best Practices

### TypeScript Guidelines

1. **Export types separately** - Allow importing types without implementation
2. **Use strict types** - Avoid `any`, prefer `unknown` for generic inputs
3. **Document props with JSDoc** - Add descriptions for complex props
4. **Use const assertions** - For style mappings and variants

### Styling Guidelines

1. **Mobile-first** - Start with base styles, add responsive overrides
2. **Use design tokens** - Reference theme variables, not hardcoded values
3. **Consistent spacing** - Use Tailwind's spacing scale
4. **Semantic colors** - Use `text-foreground`, `bg-background`, not raw colors

### Component Guidelines

1. **Single responsibility** - Each component does one thing well
2. **Accessible by default** - Include ARIA attributes, keyboard support
3. **Composable** - Prefer children over render props
4. **Testable** - Export types and utilities for testing

## Review Checklist

Before proceeding to interaction implementation:

- [ ] TypeScript interfaces defined and exported
- [ ] Compound component structure implemented
- [ ] All variants and sizes typed
- [ ] Mobile-first responsive styles applied
- [ ] Shadcn/Radix primitives used where appropriate
- [ ] Barrel exports in index.ts
- [ ] Accessibility attributes included
- [ ] Component matches WIREFRAME.md layout

## Next Steps

After static UI is complete, proceed to the **ui-interaction** skill for adding client-side events, local state, and form validation.
