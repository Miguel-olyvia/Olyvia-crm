/**
 * SO PARA TESTES: um `useOrganizacaoReal` falso, em memoria, com os dados de exemplo (Grupo Aurora). Serve para os testes da
 * pagina «Organizacao» exercitarem a arvore e os paineis sem a base (a leitura e a gravacao reais testam-se a parte).
 */
import { useEstadoRh } from "@/components/rh-exemplo/dados/loja";
import { desligarPessoa, guardarLigacao } from "@/components/rh-exemplo/organizacao/accoesOrganizacao";
import { pessoasDoExemplo } from "@/components/rh-exemplo/organizacao/dadosOrganizacao";
import { ESTRUTURA_ORGANIZACAO, useOrganizacao } from "@/components/rh-exemplo/organizacao/lojaOrganizacao";
import type { OrganizacaoReal } from "@/components/rh-exemplo/organizacao/useOrganizacaoReal";

export function useOrganizacaoEmMemoria(): OrganizacaoReal {
  const estado = useOrganizacao();
  const rh = useEstadoRh((e) => e);
  return {
    est: ESTRUTURA_ORGANIZACAO,
    estado,
    pessoas: pessoasDoExemplo(rh),
    loading: false,
    semPermissao: false,
    falhaLeitura: false,
    falhaDados: false,
    recarregar: () => undefined,
    guardar: async (p) => {
      const r = guardarLigacao(p);
      return r.ok ? { ok: true, tipo: r.tipo } : { ok: false, erro: r.erro };
    },
    desligar: async (id, motivo) => {
      const r = desligarPessoa(id, motivo);
      return r.ok ? { ok: true, tipo: "desligar" } : { ok: false, erro: r.erro };
    },
  };
}
