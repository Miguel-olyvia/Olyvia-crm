// Os negócios de todas as pessoas, tal como a ficha os mostra: os de exemplo, os criados com "Novo negócio" e o que se
// mudou neles nesta sessão (um orçamento novo, um passo ganho ou perdido). Os stores vivem em Negócio e metas; esta
// pasta só os lê (Negócio e metas não importa de Pessoas).
import { useMemo } from "react";
import { negociosComPerdidos, useAlteracoesNegocios } from "@/components/negocio-metas/negociosAlterados";
import { useNegociosNovos } from "@/components/negocio-metas/negociosNovos";
import { NEGOCIOS_PESSOAS_EXEMPLO } from "./pessoasExemplo";
import type { NegocioPessoa } from "./pessoasTipos";

export function useNegociosDasPessoas(): NegocioPessoa[] {
  const novos = useNegociosNovos();
  const alteracoes = useAlteracoesNegocios();
  return useMemo(
    () => negociosComPerdidos([...NEGOCIOS_PESSOAS_EXEMPLO, ...novos], alteracoes) as NegocioPessoa[],
    [novos, alteracoes],
  );
}
