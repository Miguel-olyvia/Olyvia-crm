// Prompt + help knowledge fetchers.
// DEFAULT_SYSTEM_PROMPT is generated from prompt.md — see tools/sync-ai-assistant-prompt-md.mjs.

import { DEFAULT_SYSTEM_PROMPT } from "./prompt.generated.ts";

export { DEFAULT_SYSTEM_PROMPT };

/**
 * Devolve o system prompt da BD (ou fallback) concatenado com um bloco opcional
 * de capabilities gerado em runtime pelo caller. shared/prompt.ts NÃO importa
 * do registry para evitar acoplamento — recebe a string já formatada.
 */
export async function fetchSystemPrompt(
  supabase: any,
  capabilitiesBlock?: string,
): Promise<string> {
  let base = DEFAULT_SYSTEM_PROMPT;
  try {
    const { data } = await supabase
      .from("ai_assistant_config")
      .select("config_value")
      .eq("config_key", "system_prompt")
      .single();
    if (data?.config_value) base = data.config_value;
  } catch {
    // fica com DEFAULT_SYSTEM_PROMPT
  }
  if (capabilitiesBlock && capabilitiesBlock.trim().length > 0) {
    return `${base}\n\n${capabilitiesBlock.trim()}\n`;
  }
  return base;
}

export async function fetchHelpKnowledge(supabase: any, language: string = "pt"): Promise<string> {
  let knowledge = "\n\n## BASE DE CONHECIMENTO:\n";
  try {
    const { data: faqs } = await supabase
      .from("help_faqs")
      .select("page_key, category, question, answer")
      .eq("is_active", true)
      .or(`language_code.eq.${language},language_code.eq.en`)
      .order("page_key")
      .limit(50);

    if (faqs && faqs.length > 0) {
      knowledge += "\n### FAQs:\n";
      faqs.forEach((faq: any) => {
        knowledge += `Q: ${faq.question}\nA: ${faq.answer}\n\n`;
      });
    }

    const { data: articles } = await supabase
      .from("help_articles")
      .select("title, description, content")
      .eq("is_active", true)
      .limit(10);

    if (articles && articles.length > 0) {
      knowledge += "\n### Artigos:\n";
      articles.forEach((a: any) => {
        knowledge += `**${a.title}**: ${a.description}\n`;
      });
    }
  } catch (error) {
    console.error("Error fetching help knowledge:", error);
  }
  return knowledge;
}
