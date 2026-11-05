/**
 * O mes de assiduidade da organizacao, simulado e VAZIO, para os testes que so querem o separador «Fila de trabalho» do
 * ecra do mapa. O ecra le o mapa pelo wrapper `@/components/rh-exemplo/hooks/useAssiduidadeDaOrganizacao` (que precisa de
 * CompanyProvider e da base); estes testes trocam-no por este:
 *
 *   vi.mock("@/components/rh-exemplo/hooks/useAssiduidadeDaOrganizacao", async () => (await import("@/test/mapaAssiduidadeFalso")).organizacaoVaziaFalsa());
 *
 * Os desvios da fila NAO vem daqui (a fila le-os do seu hook, ver `filaDeTrabalhoFalso`).
 */
import type { CelulaDoDia } from "@/hooks/useAssiduidadeDaOrganizacao";

const CELULAS = new Map<string, CelulaDoDia>();
const PESSOAS = new Set<string>();

const ORGANIZACAO_VAZIA = {
  realizado: [],
  faltas: [],
  desvios: [],
  celulas: CELULAS,
  pessoasComRegisto: PESSOAS,
  recusado: false,
  realizadoRecusado: false,
  realizadoErro: false,
  faltasRecusado: false,
  faltasErro: false,
  desviosRecusado: false,
  desviosErro: false,
  loading: false,
  recarregar: async (): Promise<void> => undefined,
};

export function organizacaoVaziaFalsa() {
  return {
    useAssiduidadeDaOrganizacao: () => ORGANIZACAO_VAZIA,
    chaveCelula: (pessoaId: string, data: string): string => `${pessoaId}|${data}`,
  };
}
