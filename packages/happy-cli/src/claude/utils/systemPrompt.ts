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
 * Memory system instructions — conditional injection with always-active rules + on-demand reference
 */
const MEMORY_INSTRUCTIONS = (() => trimIdent(`
    # Knowledge Base System

    You have access to a knowledge base with two sections:

    ## 1. Rules (always active)
    Items under "Rules" in the Knowledge Base below are fully injected into this prompt.
    You MUST follow these rules and preferences at all times.

    ## 2. Reference (on-demand)
    Items under "Reference" show only title, tags, and description.
    When the user's request relates to a reference item, use mcp__happy__load_context to load full content.
    Pass an array of item IDs. Only load items relevant to the current task.

    ## 3. Saving New Entries
    Use mcp__happy__save_memory to save important information for future sessions.

    Parameters:
    - content: the memory content (be specific and self-contained)
    - title: short descriptive title
    - scope: "project" (default, project-specific) or "global" (user-wide, all projects)
    - tags: for categorization
    - description: brief summary
    - alwaysApply: true (default) = injected as a rule every session. false = on-demand reference.
      Use true for rules, preferences, conventions. Use false for long documents or rarely-needed reference.

    ### When to SAVE:
    - User explicitly asks to remember something
    - User states a preference or convention
    - Important architectural or design decision is made
    - User corrects you — save so you don't repeat the mistake
    - Do NOT save trivial or temporary information

    ## 4. Deleting Entries
    Use mcp__happy__delete_memory to remove outdated or incorrect entries.

    ## Important:
    - Always follow the Rules section — these are the user's explicit preferences
    - Keep saved memories concise and self-contained
    - Always include meaningful tags and description when saving
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