/**
 * A fila de trabalho do ecra de Ausencias: os pedidos por decidir, agrupados por PESSOA, no mesmo formato da fila do mapa
 * de assiduidade (`useFilaDeTrabalho`), para que a lista e o painel sejam os mesmos componentes.
 *
 * UMA FONTE: os pedidos de ausencia da organizacao (`useAusenciasDaOrganizacao`, que a base filtra por RLS). Quem ve o que
 * decide-o a base; aqui so se separam os passos, como o ecra sempre fez: um pedido na chefia entra para quem decide como
 * chefia, um pedido no RH entra para quem decide como RH. Chefia e RH continuam separadas.
 *
 * UMA FONTE QUE FALHA NAO FAZ DESAPARECER O QUE JA SE SABIA: se a releitura falha, ficam os pedidos da ultima leitura que
 * correu bem e o estado da fonte passa a «erro» (a lista e o painel avisam). Uma lista vazia so quer dizer «nada por decidir»
 * quando a fonte leu bem.
 *
 * O contador e a lista saem do mesmo agrupamento: contam pessoas, nao pedidos.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useCompany } from "@/contexts/CompanyContext";
import { usePeriodoFolhaRegras } from "@/hooks/usePeriodoFolhaRegras";
import { useTranslation } from "@/hooks/useTranslation";
import {
  agruparPorPessoa,
  construirItensDeAusencias,
  ordenarPessoas,
  todasLidasComSucesso,
  totalDePendencias,
  type EstadoDeFonte,
  type FonteAusencias,
} from "@/lib/hr/filaDeTrabalho";
import { hojeEmLisboa, periodoDoDia } from "@/lib/hr/periodoFolha";
import type { AusenciaPedido } from "@/types/hrAusencias";
import { nomeTipoAusencia } from "@/components/rh-exemplo/lib/ausencias";
import { useAusenciasDaOrganizacao } from "./useAusenciasDaOrganizacao";
import { useAusenciasTipos } from "./useAusenciasTipos";
import type { FilaDeTrabalho } from "./useFilaDeTrabalho";

export interface PermissoesDeDecisao {
  aprovarChefia: boolean;
  aprovarRh: boolean;
}

const SEM_PEDIDOS: AusenciaPedido[] = [];

export function useFilaDeAusencias(nomePorPessoaId: ReadonlyMap<string, string>, permissoes: PermissoesDeDecisao) {
  const { t } = useTranslation();
  const { activeCompany } = useCompany();
  const orgId = activeCompany?.id ?? null;
  const dados = useAusenciasDaOrganizacao();
  const tipos = useAusenciasTipos();
  const { regras, estado: estadoDasRegras, isLoading: aLerRegras } = usePeriodoFolhaRegras();
  const hoje = hojeEmLisboa();
  const { aprovarChefia, aprovarRh } = permissoes;

  // O periodo da folha em curso; sem regras legiveis nao se inventa um (a ordenacao cai para «o mais antigo primeiro»).
  const periodo = useMemo(() => {
    if (aLerRegras || estadoDasRegras !== "ok") return null;
    const doDia = periodoDoDia(hoje, regras);
    return { de: doDia.de, ate: doDia.ate };
  }, [aLerRegras, estadoDasRegras, hoje, regras]);

  // Os pedidos da ultima leitura que correu bem (por organizacao): sobrevivem a uma releitura que falha.
  const [guardados, setGuardados] = useState<{ orgId: string | null; pedidos: AusenciaPedido[] }>({ orgId: null, pedidos: SEM_PEDIDOS });
  const leituraBoa = !dados.loading && !dados.erro && !dados.recusado;
  useEffect(() => {
    if (leituraBoa) setGuardados({ orgId, pedidos: dados.pendentes });
  }, [leituraBoa, orgId, dados.pendentes]);

  const pendentes = dados.erro ? (guardados.orgId === orgId ? guardados.pedidos : SEM_PEDIDOS) : dados.pendentes;

  // Ate a primeira resposta mostra-se o esqueleto; as releituras depois de decidir sao silenciosas.
  const [jaLeu, setJaLeu] = useState(false);
  useEffect(() => {
    if (!dados.loading && !tipos.loading) setJaLeu(true);
  }, [dados.loading, tipos.loading]);
  const aCarregar = !jaLeu;

  const fonte: EstadoDeFonte = dados.recusado ? "recusado" : dados.erro ? "erro" : "ok";
  const fontes: Record<FonteAusencias, EstadoDeFonte> = { ausencias: fonte };

  const semNome = t("rhJust.fila.pessoaSemNome");
  const semTipo = t("hr.ausencias.tipoDesconhecido");
  const pessoas = useMemo(() => {
    // Cada pedido so entra para quem decide o passo em que ele esta (a regra do ecra desde sempre).
    const decidiveis = pendentes.filter((pedido) => (pedido.estado === "pendente_chefia" ? aprovarChefia : aprovarRh));
    const itens = construirItensDeAusencias(decidiveis, (tipoId) => {
      const tipo = tipos.porId.get(tipoId);
      return tipo ? nomeTipoAusencia(tipo, t) : semTipo;
    });
    return ordenarPessoas(agruparPorPessoa(itens, (id) => nomePorPessoaId.get(id) ?? semNome), { hoje, periodo });
  }, [pendentes, aprovarChefia, aprovarRh, tipos.porId, t, semTipo, semNome, nomePorPessoaId, hoje, periodo]);

  const recarregarDados = dados.recarregar;
  const recarregar = useCallback(async (): Promise<void> => {
    await recarregarDados();
  }, [recarregarDados]);

  const fila: FilaDeTrabalho<FonteAusencias> = {
    pessoas,
    totalPendencias: totalDePendencias(pessoas),
    contador: String(pessoas.length),
    horasExtraCortadas: false,
    horasExtra: { lidas: 0, total: 0 },
    fontes,
    aCarregar,
    lidaComSucesso: !aCarregar && todasLidasComSucesso(fontes),
    periodo,
    hoje,
    recarregar,
  };
  return { fila, dados, tipos };
}
