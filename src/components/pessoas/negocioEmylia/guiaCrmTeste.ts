// Só para testes: o hook da Emylia (useNegocioEmyliaDoGuia) a responder como um negócio COM DOCUMENTOS DO CRM, lido sem fase da Emylia: o guia fica no fluxo
// do CRM (criar orçamento, proposta, contrato), que se mantém para estes negócios. Serve aos testes do guia que cobrem esse fluxo sem montarem a leitura
// da organização. Uso: vi.mock("./negocioEmylia/useNegocioEmyliaDoGuia", async () => (await import("./negocioEmylia/guiaCrmTeste")).moduloGuiaCrm());
export function moduloGuiaCrm() {
  return {
    useNegocioEmyliaDoGuia: () => ({
      e: { leitura: { k: "pronto" }, gravacao: { k: "parado" }, avisos: [], d: undefined, docsCrm: true, ctx: null, reler: () => true, regravar: () => undefined },
      org: "org-1", faseEmylia: null, faseDoCrm: null, leituraBloqueia: false, semNegocioNaEmylia: false, aPassar: false, repetirGravacao: () => undefined,
      passar: { visivel: false, razao: null, aFazer: false, fazer: () => undefined },
    }),
  };
}
