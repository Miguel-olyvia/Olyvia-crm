// Sync prompt.md → prompt.generated.ts
// Run: node tools/sync-ai-assistant-prompt-md.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const SRC = 'supabase/functions/ai-assistant/shared/prompt.md';
const OUT = 'supabase/functions/ai-assistant/shared/prompt.generated.ts';

const src = readFileSync(SRC, 'utf8');

// Escaping order MATTERS: backslashes → backticks → ${
const escaped = src
  .replace(/\\/g, '\\\\')
  .replace(/`/g, '\\`')
  .replace(/\$\{/g, '\\${');

const hash = createHash('sha256').update(src).digest('hex');

const out = `// Generated from prompt.md — do not edit manually.
// Source: supabase/functions/ai-assistant/shared/prompt.md
// Source SHA-256: ${hash}
// Run \`node tools/sync-ai-assistant-prompt-md.mjs\` after editing prompt.md.
export const DEFAULT_SYSTEM_PROMPT = \`${escaped}\`;
`;

writeFileSync(OUT, out, 'utf8');
console.log(`[sync] hash: ${hash.slice(0, 16)}... wrote ${OUT}`);
