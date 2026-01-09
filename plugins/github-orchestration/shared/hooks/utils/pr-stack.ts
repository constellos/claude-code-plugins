/**
 * Stacked PR management utility for GitHub workflow automation
 * Tracks PR dependencies and provides stack visualization
 */

import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * A node in the PR stack representing a single PR and its relationships
 */
export interface PRStackNode {
  /** The PR number */
  pr: number;
  /** The branch name for this PR */
  branch: string;
  /** The base branch this PR targets */
  base: string;
  /** Array of PR numbers that depend on this PR */
  children: number[];
  /** Optional PR title */
  title?: string;
  /** Optional PR state (open/closed/merged) */
  state?: string;
}

/**
 * Complete PR stack structure
 */
export interface PRStack {
  /** Array of PR stack nodes */
  nodes: PRStackNode[];
  /** Last updated timestamp */
  updatedAt: string;
}

/**
 * Validation error for PR stack
 */
export interface StackValidationError {
  type: 'circular' | 'missing-base' | 'invalid-order' | 'duplicate';
  message: string;
  affectedPRs?: number[];
}

/**
 * Save PR stack to state file
 *
 * @param cwd - Current working directory
 * @param stack - The PR stack nodes to save
 */
export async function savePRStack(cwd: string, stack: PRStackNode[]): Promise<void> {
  const stateDir = path.join(cwd, '.claude', 'logs');
  const stateFile = path.join(stateDir, 'pr-stack.json');

  await fs.mkdir(stateDir, { recursive: true });

  const data: PRStack = {
    nodes: stack,
    updatedAt: new Date().toISOString(),
  };

  await fs.writeFile(stateFile, JSON.stringify(data, null, 2));
}

/**
 * Load PR stack from state file
 *
 * @param cwd - Current working directory
 * @returns Array of PR stack nodes, or empty array if file doesn't exist
 */
export async function loadPRStack(cwd: string): Promise<PRStackNode[]> {
  const stateFile = path.join(cwd, '.claude', 'logs', 'pr-stack.json');

  try {
    const data = await fs.readFile(stateFile, 'utf-8');
    const parsed: PRStack = JSON.parse(data);
    return parsed.nodes || [];
  } catch {
    return [];
  }
}

/**
 * Add a PR to the stack
 *
 * @param cwd - Current working directory
 * @param node - The PR node to add
 */
export async function addPRToStack(cwd: string, node: PRStackNode): Promise<void> {
  const stack = await loadPRStack(cwd);

  // Check if PR already exists
  const existingIndex = stack.findIndex((n) => n.pr === node.pr);
  if (existingIndex >= 0) {
    // Update existing node
    stack[existingIndex] = node;
  } else {
    // Add new node
    stack.push(node);

    // Update parent's children array if base is a PR
    const baseMatch = node.base.match(/^pr-(\d+)$/) || node.base.match(/^(\d+)-/);
    if (baseMatch) {
      const basePR = parseInt(baseMatch[1], 10);
      const parentIndex = stack.findIndex((n) => n.pr === basePR);
      if (parentIndex >= 0 && !stack[parentIndex].children.includes(node.pr)) {
        stack[parentIndex].children.push(node.pr);
      }
    }
  }

  await savePRStack(cwd, stack);
}

/**
 * Remove a PR from the stack
 *
 * @param cwd - Current working directory
 * @param prNumber - The PR number to remove
 */
export async function removePRFromStack(cwd: string, prNumber: number): Promise<void> {
  const stack = await loadPRStack(cwd);

  // Remove the PR node
  const filteredStack = stack.filter((n) => n.pr !== prNumber);

  // Remove from all children arrays
  for (const node of filteredStack) {
    node.children = node.children.filter((childPR) => childPR !== prNumber);
  }

  await savePRStack(cwd, filteredStack);
}

/**
 * Visualize PR stack as ASCII tree
 *
 * @param stack - Array of PR stack nodes
 * @returns ASCII tree representation
 *
 * @example
 * visualizeStack([...])
 * // main
 * // └── #42 feat/feature-a
 * //     ├── #43 feat/feature-b
 * //     └── #44 feat/feature-c
 */
export function visualizeStack(stack: PRStackNode[]): string {
  if (stack.length === 0) {
    return 'No stacked PRs found';
  }

  // Build tree structure
  const prMap = new Map<number, PRStackNode>();
  const roots: PRStackNode[] = [];

  for (const node of stack) {
    prMap.set(node.pr, node);
  }

  // Find root nodes (those with base branch as main/master or not in stack)
  for (const node of stack) {
    const isRoot = node.base === 'main' || node.base === 'master' ||
      !stack.some((n) => n.branch === node.base);
    if (isRoot) {
      roots.push(node);
    }
  }

  // Recursive tree building
  function buildTree(node: PRStackNode, prefix: string, isLast: boolean): string {
    const connector = isLast ? '└──' : '├──';
    const title = node.title ? ` ${node.title}` : '';
    const state = node.state ? ` (${node.state})` : '';
    let result = `${prefix}${connector} #${node.pr} ${node.branch}${title}${state}\n`;

    const children = node.children
      .map((childPR) => prMap.get(childPR))
      .filter((child): child is PRStackNode => child !== undefined);

    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const isLastChild = i === children.length - 1;
      const newPrefix = prefix + (isLast ? '    ' : '│   ');
      result += buildTree(child, newPrefix, isLastChild);
    }

    return result;
  }

  let output = '';
  for (const root of roots) {
    output += `${root.base}\n`;
    const children = root.children
      .map((childPR) => prMap.get(childPR))
      .filter((child): child is PRStackNode => child !== undefined);

    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const isLast = i === children.length - 1;
      output += buildTree(child, '', isLast);
    }
  }

  return output.trim();
}

/**
 * Validate stack order and detect issues
 *
 * @param stack - Array of PR stack nodes
 * @returns Validation result with errors if invalid
 */
export function validateStackOrder(stack: PRStackNode[]): {
  valid: boolean;
  errors?: StackValidationError[];
} {
  const errors: StackValidationError[] = [];
  const prNumbers = new Set(stack.map((n) => n.pr));

  // Check for duplicate PR numbers
  if (prNumbers.size !== stack.length) {
    errors.push({
      type: 'duplicate',
      message: 'Stack contains duplicate PR numbers',
    });
  }

  // Check for circular dependencies
  function hasCircularDep(node: PRStackNode, visited: Set<number>): boolean {
    if (visited.has(node.pr)) {
      return true;
    }

    visited.add(node.pr);

    for (const childPR of node.children) {
      const child = stack.find((n) => n.pr === childPR);
      if (child && hasCircularDep(child, new Set(visited))) {
        return true;
      }
    }

    return false;
  }

  for (const node of stack) {
    if (hasCircularDep(node, new Set())) {
      errors.push({
        type: 'circular',
        message: `Circular dependency detected involving PR #${node.pr}`,
        affectedPRs: [node.pr],
      });
    }
  }

  // Check for missing base PRs
  for (const node of stack) {
    // Check if base looks like a PR reference
    const baseMatch = node.base.match(/^(\d+)-/) || node.base.match(/^pr-(\d+)$/);
    if (baseMatch) {
      const basePR = parseInt(baseMatch[1], 10);
      if (!prNumbers.has(basePR)) {
        errors.push({
          type: 'missing-base',
          message: `PR #${node.pr} references base PR #${basePR} which is not in the stack`,
          affectedPRs: [node.pr, basePR],
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Get merge order for stack (leaf nodes first, root nodes last)
 *
 * @param stack - Array of PR stack nodes
 * @returns Ordered array of PR numbers for merging
 */
export function getMergeOrder(stack: PRStackNode[]): number[] {
  const order: number[] = [];
  const visited = new Set<number>();

  function visit(node: PRStackNode): void {
    if (visited.has(node.pr)) {
      return;
    }

    // Visit children first (depth-first)
    for (const childPR of node.children) {
      const child = stack.find((n) => n.pr === childPR);
      if (child) {
        visit(child);
      }
    }

    visited.add(node.pr);
    order.push(node.pr);
  }

  // Start with root nodes
  const roots = stack.filter((node) =>
    node.base === 'main' || node.base === 'master' ||
    !stack.some((n) => n.branch === node.base)
  );

  for (const root of roots) {
    visit(root);
  }

  return order;
}

/**
 * Find all PRs that depend on a given PR
 *
 * @param stack - Array of PR stack nodes
 * @param prNumber - The PR number to check
 * @returns Array of dependent PR numbers
 */
export function findDependentPRs(stack: PRStackNode[], prNumber: number): number[] {
  const dependents = new Set<number>();

  function findDescendants(pr: number): void {
    const node = stack.find((n) => n.pr === pr);
    if (!node) {
      return;
    }

    for (const childPR of node.children) {
      dependents.add(childPR);
      findDescendants(childPR);
    }
  }

  findDescendants(prNumber);
  return Array.from(dependents);
}
