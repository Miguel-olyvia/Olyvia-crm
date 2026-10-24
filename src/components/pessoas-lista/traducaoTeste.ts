// Só para testes: a tradução real em português, sem o contexto de idioma. Imita o `t` verdadeiro
// (`||` com a chave como último recurso, {k} e {{k}} substituídos em todas as ocorrências) mas LANÇA
// quando falta uma chave, para uma tradução em falta rebentar o teste do componente.
// Uso: vi.mock("@/hooks/useTranslation", async () => (await import("./traducaoTeste")).moduloTraducao());
import { translations } from "@/translations/index";
import { negocioMetasTranslations } from "@/translations/negocioMetas";
import { pessoasPaginaTranslations } from "@/translations/pessoasPagina";

const textos: Record<string, string> = {
  ...(translations as Record<string, Record<string, string>>).pt,
  ...negocioMetasTranslations.pt,
  ...pessoasPaginaTranslations.pt,
};

const t = (chave: string, params?: Record<string, string | number>): string => {
  let texto = textos[chave] || "";
  if (!texto) throw new Error(`Chave de tradução em falta nos testes: ${chave}`);
  for (const [k, v] of Object.entries(params ?? {})) {
    texto = texto.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v)).replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
  }
  return texto;
};

const resultado = { language: "pt", t };

export function moduloTraducao() {
  return { useTranslation: () => resultado };
}
