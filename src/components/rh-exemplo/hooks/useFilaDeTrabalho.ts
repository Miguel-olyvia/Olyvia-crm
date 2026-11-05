/**
 * A fila de trabalho do mapa de assiduidade para os ecras de /rh-exemplo: o hook real (`@/hooks/useFilaDeTrabalho`, que le as
 * tres fontes de uma so vez) mais as funcoes puras de `@/lib/hr/filaDeTrabalho`. Aqui as pessoas ganham nome, agrupam-se
 * e ordenam-se: o contador do separador e a lista saem DESTE resultado.
 */
import { useMemo } from "react";
import { useFilaDeTrabalho as useFilaLida } from "@/hooks/useFilaDeTrabalho";
import {
  agruparPorPessoa,
  ordenarPessoas,
  rotuloDoContador,
  todasLidasComSucesso,
  totalDePendencias,
  type EstadoDeFonte,
  type FonteFila,
  type PessoaNaFila,
} from "@/lib/hr/filaDeTrabalho";
import { useTranslation } from "@/hooks/useTranslation";

export {
  FONTES_FILA,
  LIMITE_HORAS_EXTRA_NA_FILA,
  TIPOS_DE_ITEM,
  TIPOS_FILA,
  accoesDoItem,
  definicaoDoTipo,
  ehTipoFila,
  filtrarPessoas,
  type AccaoDoItem,
  type EstadoDeFonte,
  type FonteFila,
  type IdDeAccao,
  type ItemAlerta,
  type ItemFila,
  type ItemHoraExtra,
  type ItemJustificacao,
  type PessoaNaFila,
  type TipoFila,
} from "@/lib/hr/filaDeTrabalho";

export interface FilaDeTrabalho {
  /** So as pessoas com pendencias, ja ordenadas. */
  pessoas: PessoaNaFila[];
  totalPendencias: number;
  /** O texto do contador do separador: «41», ou «41+» quando as horas extra foram cortadas no limite. */
  contador: string;
  /** Ha mais horas extra pendentes do que as que se leram. */
  horasExtraCortadas: boolean;
  horasExtra: { lidas: number; total: number };
  fontes: Record<FonteFila, EstadoDeFonte>;
  aCarregar: boolean;
  /** As tres fontes leram bem: so entao uma lista vazia quer dizer «ninguem tem nada por tratar». */
  lidaComSucesso: boolean;
  periodo: { de: string; ate: string } | null;
  /** AAAA-MM-DD, em Lisboa. */
  hoje: string;
  recarregar: () => Promise<void>;
}

export function useFilaDeTrabalho(nomePorPessoaId: ReadonlyMap<string, string>): FilaDeTrabalho {
  const { t } = useTranslation();
  const lida = useFilaLida();
  const semNome = t("rhJust.fila.pessoaSemNome");
  const { itens, hoje, periodo } = lida;

  const pessoas = useMemo(() => {
    // Quem nao esta na lista de pessoas (desactivada) usa o nome que as horas extra ja trazem, senao «pessoa sem nome».
    const nomeDasHorasExtra = new Map<string, string>();
    for (const item of itens) if (item.tipo === "hora_extra" && item.hora.pessoaNome) nomeDasHorasExtra.set(item.pessoaId, item.hora.pessoaNome);
    const nomeDe = (id: string): string => nomePorPessoaId.get(id) ?? nomeDasHorasExtra.get(id) ?? semNome;
    return ordenarPessoas(agruparPorPessoa(itens, nomeDe), { hoje, periodo });
  }, [itens, nomePorPessoaId, semNome, hoje, periodo]);

  const horasExtraCortadas = lida.horasExtra.total > lida.horasExtra.lidas;
  return {
    pessoas,
    totalPendencias: totalDePendencias(pessoas),
    contador: rotuloDoContador(pessoas.length, horasExtraCortadas),
    horasExtraCortadas,
    horasExtra: lida.horasExtra,
    fontes: lida.fontes,
    aCarregar: lida.aCarregar,
    lidaComSucesso: !lida.aCarregar && todasLidasComSucesso(lida.fontes),
    periodo,
    hoje,
    recarregar: lida.recarregar,
  };
}
