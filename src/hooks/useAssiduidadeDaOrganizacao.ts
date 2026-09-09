/**
 * O mes de assiduidade de MUITA gente, e a fila de desvios por despachar.
 *
 * PORQUE E QUE AQUI SE LE PELAS VISTAS E NA FICHA SE LE EM BRUTO
 * ---------------------------------------------------------------
 * Na ficha de uma pessoa a tabela em bruto e barata e serve o historico das
 * correccoes. Aqui sao centenas de pessoas vezes trinta e um dias: o que o
 * mapa precisa e do valor em vigor e de mais nada, e e exactamente isso que
 * `v_hr_horario_realizado_em_vigor` e `v_hr_faltas_em_vigor` devolvem, com o
 * anti-join feito do lado da base. Quem quiser o historico de uma linha abre
 * o dia dessa pessoa, e ai le-se em bruto so daquela.
 *
 * O QUE NAO SE CARREGA, DE PROPOSITO
 * ----------------------------------
 * O horario PLANEADO de toda a organizacao nao se carrega. Sao sete linhas
 * por pessoa no minimo, e o mapa nao precisa dele: quem responde por "havia
 * turno e nao ha horas" e a funcao `hr_assiduidade_desvios`, que ja cruza as
 * duas coisas do lado da base e devolve so o que sobra.
 *
 * A FILA NAO TEM TOLERANCIA
 * -------------------------
 * `hr_assiduidade_desvios` PROPOE e nao filtra minutos nenhuns. O filtro e do
 * ecra, e tem de estar escrito por cima da lista -- senao uma lista vazia por
 * causa do filtro passa por uma lista vazia por nao haver nada.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useCompany } from "@/contexts/CompanyContext";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { hrFrom, hrRpc, isPermissionError } from "@/lib/hr/hrDb";
import type { Desvio, Falta } from "@/types/hrAssiduidade";
import type { HorarioRealizado } from "@/types/hr";

const COLUNAS_REALIZADO =
  "id, pessoa_id, organization_id, local_id, planeado_id, data, hora_inicio, hora_fim, " +
  "minutos, origem, estado, validado_por, validado_em";

const COLUNAS_FALTA =
  "id, pessoa_id, organization_id, data, local_id, hora_inicio, hora_fim, minutos, " +
  "motivo_codigo, justificacao_estado, justificada, estado";

interface Satelite<T> {
  linhas: T[];
  recusado: boolean;
}

const vazio = <T,>(): Satelite<T> => ({ linhas: [], recusado: false });

async function carregar<T>(
  vista: string,
  colunas: string,
  aplicar: (query: any) => any,
): Promise<Satelite<T>> {
  const { data, error } = await aplicar(hrFrom(vista).select(colunas));
  if (error) {
    if (isPermissionError(error)) return { linhas: [], recusado: true };
    captureFlowError(error, "hr-assiduidade-load");
    return { linhas: [], recusado: false };
  }
  return { linhas: (data ?? []) as T[], recusado: false };
}

/** O que uma celula do mapa mostra de um dia de uma pessoa. */
export interface CelulaDoDia {
  minutosRealizados: number;
  minutosEmFalta: number;
  /** Os locais onde essa pessoa esteve nesse dia, sem repetir. */
  locais: (string | null)[];
  temDesvio: boolean;
  faltas: number;
  faltasJustificadas: number;
}

function celulaVazia(): CelulaDoDia {
  return {
    minutosRealizados: 0,
    minutosEmFalta: 0,
    locais: [],
    temDesvio: false,
    faltas: 0,
    faltasJustificadas: 0,
  };
}

export function chaveCelula(pessoaId: string, data: string): string {
  return `${pessoaId}|${data}`;
}

export function useAssiduidadeDaOrganizacao(janela: { de: string; ate: string }) {
  const { activeCompany } = useCompany();
  const orgId = activeCompany?.id ?? null;

  const [realizado, setRealizado] = useState<Satelite<HorarioRealizado>>(
    vazio<HorarioRealizado>(),
  );
  const [faltas, setFaltas] = useState<Satelite<Falta>>(vazio<Falta>());
  const [desvios, setDesvios] = useState<Satelite<Desvio>>(vazio<Desvio>());
  const [loading, setLoading] = useState(true);

  const { de, ate } = janela;

  const load = useCallback(async () => {
    if (!orgId) {
      setRealizado(vazio<HorarioRealizado>());
      setFaltas(vazio<Falta>());
      setDesvios(vazio<Desvio>());
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [oRealizado, asFaltas, osDesvios] = await Promise.all([
        carregar<HorarioRealizado>("v_hr_horario_realizado_em_vigor", COLUNAS_REALIZADO, (q) =>
          q.eq("organization_id", orgId).gte("data", de).lte("data", ate),
        ),
        carregar<Falta>("v_hr_faltas_em_vigor", COLUNAS_FALTA, (q) =>
          q.eq("organization_id", orgId).gte("data", de).lte("data", ate),
        ),
        (async (): Promise<Satelite<Desvio>> => {
          const { data, error } = await hrRpc("hr_assiduidade_desvios", {
            _organization_id: orgId,
            _data_de: de,
            _data_ate: ate,
          });
          if (error) {
            if (isPermissionError(error)) return { linhas: [], recusado: true };
            captureFlowError(error, "hr-assiduidade-load");
            return { linhas: [], recusado: false };
          }
          return { linhas: (data ?? []) as Desvio[], recusado: false };
        })(),
      ]);

      setRealizado(oRealizado);
      setFaltas(asFaltas);
      setDesvios(osDesvios);
    } catch (e) {
      captureFlowError(e, "hr-assiduidade-load");
    } finally {
      setLoading(false);
    }
  }, [orgId, de, ate]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * O mapa `pessoa|data -> celula`. Faz-se uma vez por carregamento e nao por
   * celula desenhada: trezentas pessoas por trinta e um dias sao nove mil
   * celulas, e procurar em listas dentro do render pintava o ecra a arder.
   */
  const celulas = useMemo(() => {
    const mapa = new Map<string, CelulaDoDia>();
    const obter = (pessoaId: string, data: string) => {
      const chave = chaveCelula(pessoaId, data);
      const existente = mapa.get(chave);
      if (existente) return existente;
      const nova = celulaVazia();
      mapa.set(chave, nova);
      return nova;
    };

    for (const linha of realizado.linhas) {
      const celula = obter(linha.pessoa_id, linha.data);
      celula.minutosRealizados += linha.minutos ?? 0;
      if (!celula.locais.includes(linha.local_id)) celula.locais.push(linha.local_id);
    }
    for (const falta of faltas.linhas) {
      const celula = obter(falta.pessoa_id, falta.data);
      celula.minutosEmFalta += falta.minutos ?? 0;
      celula.faltas += 1;
      if (falta.justificacao_estado === "justificada") celula.faltasJustificadas += 1;
    }
    for (const desvio of desvios.linhas) {
      // A falta ja coberta por ausencia aprovada tambem e um desvio, e e por
      // isso que ela conta aqui: alguem tem de a anular.
      obter(desvio.pessoa_id, desvio.data).temDesvio = true;
    }

    return mapa;
  }, [realizado.linhas, faltas.linhas, desvios.linhas]);

  /** As pessoas com alguma coisa na janela -- para o mapa nao ter linhas vazias. */
  const pessoasComRegisto = useMemo(() => {
    const ids = new Set<string>();
    for (const linha of realizado.linhas) ids.add(linha.pessoa_id);
    for (const falta of faltas.linhas) ids.add(falta.pessoa_id);
    for (const desvio of desvios.linhas) ids.add(desvio.pessoa_id);
    return ids;
  }, [realizado.linhas, faltas.linhas, desvios.linhas]);

  return {
    realizado: realizado.linhas,
    faltas: faltas.linhas,
    desvios: desvios.linhas,
    celulas,
    pessoasComRegisto,
    recusado: realizado.recusado && faltas.recusado && desvios.recusado,
    loading,
    recarregar: load,
  };
}
