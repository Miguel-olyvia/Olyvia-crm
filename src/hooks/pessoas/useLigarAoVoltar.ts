// Depois de criar um contrato noutro ecrã da app (`/client-contracts?newContract=true&proposalId=...&voltar=...`), o utilizador volta à ficha com
// `?novoContrato=<id>` (e o negócio em `?negocio=`). Este hook liga esse contrato ao negócio (neg_ligar_registo) e limpa o parâmetro, para
// recarregar a página não o repetir. É idempotente: o mesmo contrato só se tenta ligar uma vez, e a ligação já é idempotente na base. Se
// falhar, o contrato fica por ligar na ficha (aparece em «Documentos por ligar») e `aoFalhar` diz porquê, pela chave do erro; se ligar,
// `aoLigar` di-lo (o contrato nasceu noutro ecrã e quem volta quer saber que ficou ligado).
import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import type { MutacoesNegocio } from "@/components/negocio-metas/mutacoesNegocio";
import { chaveDoErroDeEnvio } from "@/components/negocio-metas/useEnvioAssincrono";

const PARAMETRO = "novoContrato";

/**
 * `permissoesConhecidas` diz que `podeEditar` já é a resposta da ficha (e não o valor de antes de ela carregar): sem permissão de editar o
 * contrato não se liga e o parâmetro limpa-se, em vez de ficar preso no endereço. Antes de a ficha carregar o parâmetro espera.
 */
export function useLigarAoVoltar(
  mutacoes: MutacoesNegocio | null, podeEditar: boolean, aoFalhar: (chave: string) => void, aoLigar?: () => void, permissoesConhecidas = false,
): void {
  const [params, setParams] = useSearchParams();
  const novoContrato = params.get(PARAMETRO);
  const negocioId = params.get("negocio");
  const tentados = useRef(new Set<string>());
  // As últimas versões, para o efeito não depender de funções novas a cada render.
  const maisRecentes = useRef({ mutacoes, aoFalhar, aoLigar });
  useEffect(() => {
    maisRecentes.current = { mutacoes, aoFalhar, aoLigar };
  });

  useEffect(() => {
    if (!novoContrato || !maisRecentes.current.mutacoes) return;
    const limpar = (): void => setParams((atual) => {
      const novo = new URLSearchParams(atual);
      novo.delete(PARAMETRO);
      return novo;
    }, { replace: true });
    if (!podeEditar) {
      if (permissoesConhecidas) limpar();
      return;
    }
    if (!negocioId) {
      limpar();
      return;
    }
    const chave = `${negocioId}:${novoContrato}`;
    if (tentados.current.has(chave)) return;
    tentados.current.add(chave);
    maisRecentes.current.mutacoes.ligar(negocioId, { tipo: "contrato", id: novoContrato }).then(
      () => { limpar(); maisRecentes.current.aoLigar?.(); },
      (falha: unknown) => { maisRecentes.current.aoFalhar(chaveDoErroDeEnvio(falha)); limpar(); },
    );
  }, [novoContrato, negocioId, podeEditar, permissoesConhecidas, setParams]);
}
