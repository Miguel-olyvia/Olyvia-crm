/**
 * O estado do periodo experimental do separador Contratos: o interruptor, a
 * sugestao legal e a marca de origem. Saiu de `PessoaContratoTab.tsx`.
 *
 * O interruptor NAO e um dado novo na base: e a leitura de haver ou nao
 * valores. Comeca ligado se o contrato ja tiver algum dos dois campos --
 * senao abrir um contrato existente escondia o que la esta. Desligar limpa os
 * dois campos, a unica leitura honesta de "nao tem".
 *
 * A sugestao (`lib/hr/periodoExperimental.ts`) NUNCA se escreve sozinha: so
 * corre quando quem edita a aceita. Aceitar preenche os dias e a data de fim
 * (inicio + dias - 1: o primeiro dia conta) e marca a origem "sugerido";
 * qualquer edicao a mao a seguir volta a marcar "manual".
 */
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { dataDoPeriodoExperimental } from "@/lib/hr/novaPessoaDatas";
import { sugerirPeriodoExperimentalDias } from "@/lib/hr/periodoExperimental";
import type { PessoaVinculo } from "@/types/hr";
import { rascunhoDe, temAlgumExperimental, type RascunhoVinculo } from "./rascunhoVinculo";

export function useExperimentalDoContrato(
  rascunho: RascunhoVinculo,
  setRascunho: Dispatch<SetStateAction<RascunhoVinculo>>,
  activo: PessoaVinculo | null,
) {
  const [temExperimental, setTemExperimental] = useState(() =>
    temAlgumExperimental(rascunhoDe(activo)),
  );
  useEffect(() => {
    setTemExperimental(temAlgumExperimental(rascunhoDe(activo)));
  }, [activo]);

  const alternar = (ligado: boolean) => {
    setTemExperimental(ligado);
    if (!ligado) {
      setRascunho((anterior) => ({
        ...anterior,
        periodo_experimental_dias: "",
        periodo_experimental_ate: "",
        periodo_experimental_origem: null,
      }));
    }
  };

  const sugestao = useMemo(
    () =>
      rascunho.categoria_funcao
        ? sugerirPeriodoExperimentalDias({
            tipoContrato: rascunho.tipo_contrato,
            categoriaFuncao: rascunho.categoria_funcao,
            dataInicio: rascunho.data_inicio || null,
            dataFim: rascunho.data_fim || null,
          })
        : null,
    [rascunho.categoria_funcao, rascunho.tipo_contrato, rascunho.data_inicio, rascunho.data_fim],
  );

  const aceitarSugestao = () => {
    if (!sugestao) return;
    setTemExperimental(true);
    setRascunho((anterior) => ({
      ...anterior,
      periodo_experimental_dias: String(sugestao.dias),
      periodo_experimental_ate:
        dataDoPeriodoExperimental(anterior.data_inicio, sugestao.dias) ??
        anterior.periodo_experimental_ate,
      periodo_experimental_origem: "sugerido",
    }));
  };

  /** Os dois campos passam por aqui: qualquer edicao a mao desfaz a marca de
   *  "sugerido" -- ela so vale enquanto o valor for o que a sugestao calculou. */
  const definirCampo = (
    campo: "periodo_experimental_dias" | "periodo_experimental_ate",
    valor: string,
  ) =>
    setRascunho((anterior) => ({
      ...anterior,
      [campo]: valor,
      periodo_experimental_origem: "manual",
    }));

  return { temExperimental, alternar, sugestao, aceitarSugestao, definirCampo };
}
