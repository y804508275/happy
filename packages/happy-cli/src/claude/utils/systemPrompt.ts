import { trimIdent } from "@/utils/trimIdent";
import { shouldIncludeCoAuthoredBy } from "./claudeSettings";
import { type ScannedProject, formatProjectsForPrompt } from "./projectScanner";

/**
 * Base system prompt shared across all configurations
 */
const BASE_SYSTEM_PROMPT = (() => trimIdent(`
    ALWAYS when you start a new chat - you must call a tool "mcp__happy__change_title" to set a chat title. When you think chat title is not relevant anymore - call the tool again to change it. When chat name is too generic and you have a change to make it more specific - call the tool again to change it. This title is needed to easily find the chat in the future. Help human.
`))();

/**
 * Memory system instructions — save only (retrieval is automatic via system prompt injection)
 */
const MEMORY_INSTRUCTIONS = (() => trimIdent(`
    # Memory System

    You can save important information for future sessions using the mcp__happy__save_memory tool.
    You can delete outdated memories using the mcp__happy__delete_memory tool.

    ## When to SAVE:
    - When the user explicitly states a preference (e.g., "I prefer tabs over spaces", "always use TypeScript")
    - When an important architectural or design decision is made
    - When the user shares project-specific context that would be useful in future sessions
    - When the user corrects you — save the correction so you don't repeat the mistake
    - Do NOT save trivial or temporary information
    - Do NOT save information already in CLAUDE.md or project documentation

    ## Scope:
    - "project" (default): project-specific info (architecture, conventions, deployment)
    - "global": user-wide preferences (coding style, communication preferences)

    ## Important:
    - Keep memories concise and self-contained
    - If you save a memory, briefly confirm it (e.g., "I'll remember that for future sessions.")
`))();

/**
 * Co-authored-by credits to append when enabled
 */
const CO_AUTHORED_CREDITS = (() => trimIdent(`
    When making commit messages, instead of just giving co-credit to Claude, also give credit to Happy like so:

    <main commit message>

    Generated with [Claude Code](https://claude.ai/code)
    via [Happy](https://happy.engineering)

    Co-Authored-By: Claude <noreply@anthropic.com>
    Co-Authored-By: Happy <yesreply@happy.engineering>
`))();

const includeCoAuthored = shouldIncludeCoAuthoredBy();

/**
 * Build system prompt with optional project list injection.
 * Used by claudeLocal and claudeRemote to include discovered projects in context.
 */
export function buildSystemPrompt(projects: ScannedProject[], projectContext?: string | null): string {
  let prompt = BASE_SYSTEM_PROMPT;

  prompt += '\n\n' + MEMORY_INSTRUCTIONS;

  if (projectContext) {
    prompt += '\n\n' + projectContext;
  }

  if (includeCoAuthored) {
    prompt += '\n\n' + CO_AUTHORED_CREDITS;
  }

  const projectSection = formatProjectsForPrompt(projects);
  if (projectSection) {
    prompt += '\n\n' + projectSection;
  }

  return prompt;
}

/**
 * Static system prompt (backward-compatible, without project list).
 */
export const systemPrompt = buildSystemPrompt([]);