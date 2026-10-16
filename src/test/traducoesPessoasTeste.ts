// Só para os testes (nenhum código da página o importa): o `useTranslation` de mentira dos diálogos do processo de Pessoas, com os
// textos reais em português (os da página e os do painel "Novo negócio", de onde vêm os nomes dos trabalhos e das unidades). Usa-se
// assim, no topo do ficheiro de teste: `vi.mock("@/hooks/useTranslation", () => import("@/test/traducoesPessoasTeste").then((m) => m.moduloDeTraducao()))`.
// Quando falta uma chave, o texto é a própria chave (o teste vê-o).
export async function moduloDeTraducao() {
  const { pessoasPaginaTranslations } = await import("@/translations/pessoasPagina");
  const { negocioMetasTranslations } = await import("@/translations/negocioMetas");
  const textos: Record<string, string> = { ...negocioMetasTranslations.pt, ...pessoasPaginaTranslations.pt };
  const t = (key: string, params?: Record<string, string | number>) =>
    Object.entries(params ?? {}).reduce((texto, [k, v]) => texto.replace(`{${k}}`, String(v)), textos[key] ?? key);
  return { useTranslation: () => ({ language: "pt", t }) };
}
