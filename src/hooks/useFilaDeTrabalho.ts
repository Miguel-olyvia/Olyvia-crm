/**
 * A FILA DE TRABALHO do RH, lida de UMA so vez: as horas extra por decidir, as justificacoes de dia por decidir e os desvios
 * (alertas do fim do dia) do periodo da folha em curso e do anterior, tudo no mesmo resultado. O contador do separador e a
 * lista de pessoas saem deste resultado, por isso nao podem divergir.
 *
 * UMA LEITURA, TRES FONTES, TRES ESTADOS
 * --------------------------------------
 * As fontes correm juntas (`Promise.allSettled`) e cada uma diz como correu (`ok`, recusada, falhada, indisponivel): uma que
 * falha nao esconde as outras, e a lista so pode dizer «ninguem tem nada por tratar» quando as TRES leram bem.
 *
 * UMA FONTE QUE FALHA NAO FAZ DESAPARECER O QUE JA SE SABIA
 * ---------------------------------------------------------
 * Se uma releitura falha numa fonte, ficam os itens dessa fonte da ultima leitura que correu bem (por fonte) e o estado dela
 * fica a dizer que a leitura falhou: os itens podem estar desactualizados, e o ecra di-lo. Sem isto uma falha de rede fazia a
 * pessoa desaparecer da fila com alertas por resolver.
 *
 * COMO SE RELE
 * ------------
 * A chave da consulta comeca por `CHAVE_HORAS_EXTRA`: decidir, registar ou detetar horas extra (que invalidam esse prefixo)
 * refazem a fila sem ninguem ter de o pedir. As justificacoes decididas noutro ecra (calendario da pessoa, painel do dia)
 * chegam por `subscreverMudancaDeJustificacoes`. `recarregar` relê a fila e avisa os outros ecras montados.
 *
 * JANELA DOS DESVIOS: do inicio do periodo da folha ANTERIOR ao em curso ate hoje (no dia em que o periodo vira, os alertas
 * do que fechou nao saem da fila sem decisao), nao o mes visivel do separador «Mapa». Horas extra e justificacoes sao da
 * organizacao inteira, so as pendentes. Se as regras do periodo nao se leram bem, nao ha periodo: `periodo` vem `null`.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/contexts/CompanyContext";
import { CHAVE_HORAS_EXTRA, lerHorasExtra } from "@/hooks/hr/useHorasExtra";
import { lerDesvios } from "@/hooks/useAssiduidadeDaOrganizacao";
import { avisarMudancaDeJustificacoes, lerJustificacoesDoDia, subscreverMudancaDeJustificacoes } from "@/hooks/useJustificacoesDoDia";
import { usePeriodoFolhaRegras } from "@/hooks/usePeriodoFolhaRegras";
import { usePermissoesAssiduidade } from "@/hooks/usePermissoesAssiduidade";
import {
  construirItens,
  diaAnterior,
  janelaDosDesvios,
  type EstadoDeFonte,
  type FonteFila,
  type ItemFila,
} from "@/lib/hr/filaDeTrabalho";
import { linhaEmVigor, linhaParaJustificacaoDia } from "@/lib/hr/justificacaoDiaLinha";
import { hojeEmLisboa, periodoDoDia } from "@/lib/hr/periodoFolha";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { accoesDoDesvio, chaveDoDesvio } from "@/components/rh-exemplo/lib/alertasFimDia";

const STALE_TIME_MS = 15_000;
const SEM_ITENS: ItemFila[] = [];
const TODAS_COM_ERRO: Record<FonteFila, EstadoDeFonte> = { horas_extra: "erro", justificacoes: "erro", desvios: "erro" };

export interface FilaLida {
  itens: ItemFila[];
  /** Como correu a ultima leitura de cada fonte. Uma que nao esta `ok` tem, quando muito, os itens da ultima leitura boa. */
  fontes: Record<FonteFila, EstadoDeFonte>;
  /** Quantas horas extra pendentes se leram e quantas existem: `total > lidas` quer dizer que a lista esta cortada. */
  horasExtra: { lidas: number; total: number };
}

export interface FilaDeTrabalhoLida extends FilaLida {
  /** Verdadeiro ate haver uma primeira resposta: as releituras depois de gravar sao silenciosas. */
  aCarregar: boolean;
  /** O periodo da folha em curso; `null` quando as regras do periodo nao se leram bem (nao se inventa um periodo). */
  periodo: { de: string; ate: string } | null;
  hoje: string;
  /** Relê as tres fontes e avisa os outros ecras. Nunca lanca. */
  recarregar: () => Promise<void>;
}

type ItensPorFonte = Record<FonteFila, ItemFila[]>;
const SEM_ITENS_POR_FONTE = (): ItensPorFonte => ({ horas_extra: [], justificacoes: [], desvios: [] });
const AJUDAS = { accoesDoDesvio, chaveDoDesvio };

export function useFilaDeTrabalho(): FilaDeTrabalhoLida {
  const { activeCompany } = useCompany();
  const orgId = activeCompany?.id ?? null;
  const queryClient = useQueryClient();
  const { permissoes, loading: aLerPermissoes } = usePermissoesAssiduidade();
  const { regras, estado: estadoDasRegras, isLoading: aLerRegras } = usePeriodoFolhaRegras();
  const hoje = hojeEmLisboa();
  const regrasLegiveis = !aLerRegras && estadoDasRegras === "ok";

  const periodoEmCurso = useMemo(() => (regrasLegiveis ? periodoDoDia(hoje, regras) : null), [regrasLegiveis, hoje, regras]);
  const periodoAnterior = useMemo(
    () => (periodoEmCurso ? periodoDoDia(diaAnterior(periodoEmCurso.de), regras) : null),
    [periodoEmCurso, regras],
  );
  const janela = useMemo(() => janelaDosDesvios(periodoEmCurso, periodoAnterior, hoje), [periodoEmCurso, periodoAnterior, hoje]);
  const podeVerHorasExtra = permissoes.view;

  // Os itens da ultima leitura que correu bem, por fonte e por organizacao.
  const ultimaBoa = useRef<{ orgId: string | null; itens: ItensPorFonte }>({ orgId: null, itens: SEM_ITENS_POR_FONTE() });

  const consulta = useQuery({
    queryKey: [CHAVE_HORAS_EXTRA, orgId, "fila", janela.de, janela.ate, podeVerHorasExtra],
    enabled: orgId !== null && !aLerPermissoes && !aLerRegras,
    retry: false,
    staleTime: STALE_TIME_MS,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<FilaLida> => {
      const organizationId = orgId as string;
      if (ultimaBoa.current.orgId !== organizationId) ultimaBoa.current = { orgId: organizationId, itens: SEM_ITENS_POR_FONTE() };

      const [horasExtra, justificacoes, desvios] = await Promise.allSettled([
        podeVerHorasExtra ? lerHorasExtra(organizationId, { estado: "pendente" }) : Promise.resolve(null),
        lerJustificacoesDoDia(organizationId, { soPendentes: true }),
        lerDesvios(organizationId, janela.de, janela.ate),
      ]);
      // Os leitores nao lancam em condicoes normais: uma rejeicao e um defeito e vai para o registo, como no mapa.
      for (const resultado of [horasExtra, justificacoes, desvios]) {
        if (resultado.status === "rejected") captureFlowError(resultado.reason, "hr-assiduidade-load");
      }

      const horas = horasExtra.status === "fulfilled" ? horasExtra.value : null;
      const justificacoesLidas = justificacoes.status === "fulfilled" ? justificacoes.value : null;
      const desviosLidos = desvios.status === "fulfilled" ? desvios.value : null;

      const fontes: Record<FonteFila, EstadoDeFonte> = {
        horas_extra: !podeVerHorasExtra ? "recusado" : horas ? "ok" : "erro",
        justificacoes: justificacoesLidas ? justificacoesLidas.leitura : "erro",
        desvios: !desviosLidos ? "erro" : desviosLidos.recusado ? "recusado" : desviosLidos.erro ? "erro" : "ok",
      };

      const lidos: ItensPorFonte = {
        horas_extra: construirItens({ horasExtra: horas?.horas ?? [], justificacoes: [], desvios: [] }, AJUDAS),
        justificacoes: construirItens(
          { horasExtra: [], justificacoes: (justificacoesLidas?.linhas ?? []).filter(linhaEmVigor).map(linhaParaJustificacaoDia), desvios: [] },
          AJUDAS,
        ),
        desvios: construirItens({ horasExtra: [], justificacoes: [], desvios: desviosLidos?.linhas ?? [] }, AJUDAS),
      };

      const itensPorFonte = SEM_ITENS_POR_FONTE();
      for (const fonte of ["horas_extra", "justificacoes", "desvios"] as const) {
        if (fontes[fonte] === "ok") {
          ultimaBoa.current.itens[fonte] = lidos[fonte];
          itensPorFonte[fonte] = lidos[fonte];
        } else {
          // Falhou agora: ficam os da ultima leitura boa (possivelmente desactualizados; o estado da fonte di-lo).
          itensPorFonte[fonte] = ultimaBoa.current.itens[fonte];
        }
      }
      return {
        itens: [...itensPorFonte.horas_extra, ...itensPorFonte.justificacoes, ...itensPorFonte.desvios],
        fontes,
        horasExtra: { lidas: horas?.horas.length ?? 0, total: horas?.total ?? 0 },
      };
    },
  });

  const invalidarFila = useCallback(
    () => queryClient.invalidateQueries({ queryKey: [CHAVE_HORAS_EXTRA, orgId, "fila"] }),
    [queryClient, orgId],
  );

  // Uma justificacao decidida noutro ecra (calendario da pessoa, painel do dia) tira-a da fila.
  useEffect(() => subscreverMudancaDeJustificacoes(() => void invalidarFila()), [invalidarFila]);

  const recarregar = useCallback(async (): Promise<void> => {
    try {
      await queryClient.invalidateQueries({ queryKey: [CHAVE_HORAS_EXTRA, orgId] });
    } finally {
      avisarMudancaDeJustificacoes();
    }
  }, [queryClient, orgId]);

  const periodoVisivel = useMemo(
    () => (periodoEmCurso ? { de: periodoEmCurso.de, ate: periodoEmCurso.ate } : null),
    [periodoEmCurso],
  );

  const lida = consulta.data;
  return {
    itens: lida?.itens ?? SEM_ITENS,
    fontes: lida?.fontes ?? TODAS_COM_ERRO,
    horasExtra: lida?.horasExtra ?? { lidas: 0, total: 0 },
    aCarregar: consulta.isPending,
    periodo: periodoVisivel,
    hoje,
    recarregar,
  };
}
