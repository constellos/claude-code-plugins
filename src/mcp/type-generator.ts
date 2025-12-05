/**
 * MCP Type Generator
 *
 * This module generates TypeScript type definitions from MCP tool definitions.
 * It converts JSON Schema input schemas to TypeScript interfaces that extend
 * `CallToolRequestParams` and `CallToolResult` from the MCP SDK.
 *
 * @module mcp/type-generator
 *
 * @example
 * ```typescript
 * import { generateServerTypes } from '@constellos/claude-code-kit/mcp';
 * import type { Tool } from '@modelcontextprotocol/sdk/types.js';
 *
 * const tools: Tool[] = [...]; // from MCP server
 * const typeScript = generateServerTypes('my-server', tools);
 * // Write to file: my-server.types.ts
 * ```
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert a string to PascalCase for TypeScript interface names.
 *
 * Splits on hyphens and underscores, capitalizes each part.
 *
 * @param str - Input string (e.g., 'my-server' or 'browser_eval')
 * @returns PascalCase string (e.g., 'MyServer' or 'BrowserEval')
 *
 * @example
 * ```typescript
 * toPascalCase('next-devtools') // => 'NextDevtools'
 * toPascalCase('browser_eval')  // => 'BrowserEval'
 * ```
 */
export function toPascalCase(str: string): string {
  return str
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('');
}

/**
 * Minimal JSON Schema type definition for type generation.
 *
 * Covers the subset of JSON Schema used by MCP tool input schemas.
 * @internal
 */
interface JSONSchema {
  /** Primitive type or array of types (for nullable) */
  type?: string | string[];
  /** Object properties */
  properties?: Record<string, JSONSchema>;
  /** Array item schema */
  items?: JSONSchema;
  /** Enumeration of allowed values */
  enum?: unknown[];
  /** List of required property names */
  required?: string[];
  /** Property description (not used in output) */
  description?: string;
  /** Union types (any of these schemas) */
  anyOf?: JSONSchema[];
  /** Union types (exactly one of these schemas) */
  oneOf?: JSONSchema[];
  /** Intersection types (all of these schemas) */
  allOf?: JSONSchema[];
  /** Constant/literal value */
  const?: unknown;
  /** Additional properties schema or boolean */
  additionalProperties?: boolean | JSONSchema;
}

/**
 * Convert a JSON Schema to a TypeScript type string.
 *
 * Handles primitives, objects, arrays, unions, intersections, enums, and const values.
 *
 * @param schema - JSON Schema to convert
 * @param required - List of required property names (for object types)
 * @returns TypeScript type as a string
 * @internal
 */
function schemaToType(schema: JSONSchema, required: string[] = []): string {
  if (!schema) return 'unknown';

  // Handle anyOf/oneOf
  if (schema.anyOf || schema.oneOf) {
    const variants = (schema.anyOf || schema.oneOf) as JSONSchema[];
    return variants.map((v) => schemaToType(v)).join(' | ');
  }

  // Handle allOf (intersection)
  if (schema.allOf) {
    const variants = schema.allOf as JSONSchema[];
    return variants.map((v) => schemaToType(v)).join(' & ');
  }

  // Handle enum
  if (schema.enum) {
    return schema.enum.map((v) => JSON.stringify(v)).join(' | ');
  }

  // Handle const
  if (schema.const !== undefined) {
    return JSON.stringify(schema.const);
  }

  // Handle array of types (e.g., ["string", "null"])
  if (Array.isArray(schema.type)) {
    return schema.type.map((t) => schemaToType({ ...schema, type: t })).join(' | ');
  }

  switch (schema.type) {
    case 'string':
      return 'string';
    case 'number':
    case 'integer':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'null':
      return 'null';
    case 'array':
      if (schema.items) {
        return `${schemaToType(schema.items)}[]`;
      }
      return 'unknown[]';
    case 'object':
      if (schema.properties) {
        const props = Object.entries(schema.properties).map(([key, prop]) => {
          const optional = !required.includes(key) ? '?' : '';
          return `    ${key}${optional}: ${schemaToType(prop)};`;
        });
        return `{\n${props.join('\n')}\n  }`;
      }
      return 'Record<string, unknown>';
    default:
      return 'unknown';
  }
}

/**
 * Generate a TypeScript interface for an MCP tool request.
 *
 * Creates an interface extending `CallToolRequestParams` with:
 * - `name`: Literal type for the full tool name (e.g., `'mcp__server__tool'`)
 * - `arguments`: Typed arguments from the tool's input schema
 *
 * @param serverName - Name of the MCP server
 * @param tool - MCP tool definition
 * @returns TypeScript interface definition as a string
 * @internal
 */
function generateRequestInterface(serverName: string, tool: Tool): string {
  const pascalServer = toPascalCase(serverName);
  const pascalTool = toPascalCase(tool.name);
  const interfaceName = `${pascalServer}${pascalTool}Request`;
  const fullToolName = `mcp__${serverName}__${tool.name}`;

  const schema = tool.inputSchema as JSONSchema | undefined;

  if (!schema || !schema.properties || Object.keys(schema.properties).length === 0) {
    return `export interface ${interfaceName} extends CallToolRequestParams {
  name: '${fullToolName}';
  arguments?: never;
}
`;
  }

  const required = (schema.required as string[]) ?? [];
  const argsType = schemaToType(schema, required);

  return `export interface ${interfaceName} extends CallToolRequestParams {
  name: '${fullToolName}';
  arguments: ${argsType};
}
`;
}

/**
 * Generate a TypeScript interface for an MCP tool result.
 *
 * Creates an interface extending `CallToolResult`. Currently generates
 * a placeholder since MCP results are generic content arrays.
 *
 * @param serverName - Name of the MCP server
 * @param tool - MCP tool definition
 * @returns TypeScript interface definition as a string
 * @internal
 */
function generateResultInterface(serverName: string, tool: Tool): string {
  const pascalServer = toPascalCase(serverName);
  const pascalTool = toPascalCase(tool.name);
  const interfaceName = `${pascalServer}${pascalTool}Result`;

  return `export interface ${interfaceName} extends CallToolResult {
  // Result content will be in the content array from CallToolResult
}
`;
}

/**
 * Generate a complete TypeScript type file for an MCP server's tools.
 *
 * This is the main entry point for type generation. It produces a file containing:
 * - Import statement for MCP SDK types
 * - Request interfaces for each tool (extends `CallToolRequestParams`)
 * - Result interfaces for each tool (extends `CallToolResult`)
 * - `[Server]ToolRequest` - Union type of all request interfaces
 * - `[Server]ToolResult` - Union type of all result interfaces
 * - `[Server]ToolMap` - Interface mapping tool names to request/result pairs
 * - `[Server]ToolName` - Union type of all tool name literals
 *
 * @param serverName - Name of the MCP server (e.g., 'next-devtools')
 * @param tools - Array of MCP tool definitions from the server
 * @returns Complete TypeScript file content as a string
 *
 * @example
 * ```typescript
 * const tools = await mcpClient.listTools();
 * const typescript = generateServerTypes('my-server', tools.tools);
 * fs.writeFileSync('my-server.types.ts', typescript);
 * ```
 */
export function generateServerTypes(serverName: string, tools: Tool[]): string {
  const pascalServer = toPascalCase(serverName);
  const timestamp = new Date().toISOString();

  const header = `/**
 * Auto-generated MCP tool types for: ${serverName}
 * Generated: ${timestamp}
 * DO NOT EDIT MANUALLY - regenerate with: npx cck-sync-mcp
 */
import type { CallToolRequestParams, CallToolResult } from '@modelcontextprotocol/sdk/types.js';

`;

  // Generate request and result interfaces
  const interfaces = tools
    .map(
      (tool) =>
        generateRequestInterface(serverName, tool) +
        '\n' +
        generateResultInterface(serverName, tool)
    )
    .join('\n');

  // Generate discriminated union of all requests
  const requestTypes = tools
    .map((tool) => {
      const pascalTool = toPascalCase(tool.name);
      return `  | ${pascalServer}${pascalTool}Request`;
    })
    .join('\n');
  const requestUnion = `export type ${pascalServer}ToolRequest =\n${requestTypes};\n`;

  // Generate union of all results
  const resultTypes = tools
    .map((tool) => {
      const pascalTool = toPascalCase(tool.name);
      return `  | ${pascalServer}${pascalTool}Result`;
    })
    .join('\n');
  const resultUnion = `export type ${pascalServer}ToolResult =\n${resultTypes};\n`;

  // Generate tool map
  const mapEntries = tools
    .map((tool) => {
      const pascalTool = toPascalCase(tool.name);
      const fullToolName = `mcp__${serverName}__${tool.name}`;
      return `  '${fullToolName}': { request: ${pascalServer}${pascalTool}Request; result: ${pascalServer}${pascalTool}Result };`;
    })
    .join('\n');
  const toolMap = `export interface ${pascalServer}ToolMap {\n${mapEntries}\n}\n`;

  // Generate tool names type
  const toolNames = tools.map((tool) => `'mcp__${serverName}__${tool.name}'`).join(' | ');
  const toolNamesType = `export type ${pascalServer}ToolName = ${toolNames};\n`;

  return (
    header +
    interfaces +
    '\n' +
    requestUnion +
    '\n' +
    resultUnion +
    '\n' +
    toolMap +
    '\n' +
    toolNamesType
  );
}
