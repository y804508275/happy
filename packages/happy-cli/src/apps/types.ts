/**
 * Happy App Protocol - Type definitions
 * 
 * Defines the manifest schema that external apps use to declare their
 * capabilities (tools, events, embed config, auth).
 */

import { z } from 'zod';

// Confirmation strategy for each tool
const ConfirmationStrategySchema = z.enum(['auto', 'confirm', 'once']);

// HTTP method
const HttpMethodSchema = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

// A single parameter in a tool's input
const ToolParameterSchema = z.object({
    name: z.string(),
    type: z.enum(['string', 'number', 'boolean', 'object', 'array']),
    description: z.string(),
    required: z.boolean().default(true),
});

// API binding: how the platform layer calls the app's API
const ApiBindingSchema = z.object({
    method: HttpMethodSchema,
    path: z.string(), // e.g. "/api/pages/:pageId"
    headers: z.record(z.string()).optional(),
    // Extra fields always included in the request body (merged with user params)
    defaultBody: z.record(z.any()).optional(),
    // Where to find the useful content in the response
    responseField: z.string().optional(), // e.g. "data.content" - dot-path into response JSON
});

// A single tool (operation) the app exposes
const AppToolSchema = z.object({
    name: z.string(),
    description: z.string(),
    parameters: z.array(ToolParameterSchema).default([]),
    confirmation: ConfirmationStrategySchema.default('auto'),
    api: ApiBindingSchema,
});

// A single event the app emits
const AppEventSchema = z.object({
    name: z.string(),
    description: z.string(),
});

// Embed configuration for full apps
const EmbedConfigSchema = z.object({
    url: z.string(), // base URL for the iframe/webview
    defaultPath: z.string().optional(), // initial path to load
    pathTemplate: z.string().optional(), // URL template for opening specific resources, e.g. "/s/:spaceSlug/p/:slugId"
    width: z.number().optional(), // suggested panel width in pixels
});

// Auth configuration
const AuthConfigSchema = z.object({
    type: z.enum(['cookie', 'bearer', 'basic', 'custom']),
    loginEndpoint: z.string().optional(),
    // Stored credentials fields (keys are field names, values are user-supplied)
    fields: z.array(z.string()).default([]),
});

// The full manifest
export const AppManifestSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    icon: z.string().optional(), // URL to app icon
    version: z.string().default('1.0.0'),
    baseUrl: z.string().url(), // app's base URL (API calls are relative to this)

    tools: z.array(AppToolSchema).default([]),
    events: z.array(AppEventSchema).default([]),
    embed: EmbedConfigSchema.optional(),
    auth: AuthConfigSchema.optional(),
});

export type AppManifest = z.infer<typeof AppManifestSchema>;
export type AppTool = z.infer<typeof AppToolSchema>;
export type AppEvent = z.infer<typeof AppEventSchema>;
export type ConfirmationStrategy = z.infer<typeof ConfirmationStrategySchema>;

// Installed app: manifest + user credentials + user overrides
export const InstalledAppSchema = z.object({
    manifest: AppManifestSchema,
    credentials: z.record(z.string()).default({}), // field -> value
    confirmationOverrides: z.record(ConfirmationStrategySchema).default({}), // toolName -> override
    installedAt: z.number().default(() => Date.now()),
});

export type InstalledApp = z.infer<typeof InstalledAppSchema>;
