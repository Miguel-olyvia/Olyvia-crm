/** A ficha de uma pessoa de exemplo: lê do store e cada gravação altera o store (em memória). */
import { useCallback, useMemo } from "react";
import { diaIso, hojeIso } from "@/components/rh-exemplo/dados/datas";
import { atualizarFicha, novoId, useFichaRh } from "@/components/rh-exemplo/dados/loja";
import type { FichaRh } from "@/components/rh-exemplo/dados/tiposLoja";
import {
  linhaPlaneadaDecorrida,
  linhaRecorrenteJaEmCurso,
  ontemIso,
  type LinhaPlaneadoParaGravar,
} from "@/components/rh-exemplo/lib/horario";
import type {
  FormatoConta,
  HorarioPlaneado,
  Pessoa,
  PessoaContactoEmergencia,
  PessoaDadosBancarios,
  PessoaDadosPessoais,
  PessoaDadosSaude,
  PessoaFardamento,
  PessoaIdentificacao,
  PessoaMorada,
  PessoaRetribuicao,
  PessoaSindicalizacao,
  PessoaVinculo,
} from "@/components/rh-exemplo/tipos";

export interface DefinirContaArgs {
  formato: FormatoConta;
  conta: string;
  titular?: string | null;
  banco?: string | null;
  agencia?: string | null;
  swift?: string | null;
}

/** A versão de retribuição em vigor hoje (ou a mais recente, se nenhuma começou). */
function retribuicaoActual(lista: PessoaRetribuicao[]): PessoaRetribuicao | null {
  const hoje = hojeIso();
  const ordenadas = [...lista].sort((a, b) => b.valido_de.localeCompare(a.valido_de));
  return (
    ordenadas.find((r) => r.valido_de <= hoje && (r.valido_ate === null || r.valido_ate > hoje)) ??
    ordenadas[0] ??
    null
  );
}

const ultimos4 = (texto: string): string => texto.replace(/\s/g, "").slice(-4);

type Satelite<K extends keyof FichaRh> = NonNullable<FichaRh[K]>;

export function usePessoa(pessoaId: string | undefined) {
  const ficha = useFichaRh(pessoaId);

  /** Mistura `patch` no satélite 1:1 (cria-o com `base` se ainda não existe). */
  const misturar = useCallback(
    <K extends "dadosPessoais" | "identificacao" | "morada" | "emergencia" | "saude" | "fardamento" | "sindicalizacao">(
      chave: K,
      prefixo: string,
      patch: Partial<Satelite<K>>,
      base: Record<string, unknown> = {},
    ): Promise<string | null> => {
      if (!pessoaId) return Promise.resolve("Sem pessoa");
      atualizarFicha(pessoaId, (f) => ({
        ...f,
        [chave]: {
          id: novoId(prefixo),
          pessoa_id: pessoaId,
          organization_id: f.pessoa.organization_id,
          ...base,
          ...(f[chave] ?? {}),
          ...patch,
        },
      }));
      return Promise.resolve(null);
    },
    [pessoaId],
  );

  const savePessoa = useCallback(
    (patch: Partial<Pessoa>): Promise<string | null> => {
      if (!pessoaId) return Promise.resolve("Sem pessoa");
      atualizarFicha(pessoaId, (f) => {
        const pessoa = { ...f.pessoa, ...patch };
        pessoa.nome_completo = `${pessoa.primeiro_nome} ${pessoa.apelido}`.trim();
        return { ...f, pessoa };
      });
      return Promise.resolve(null);
    },
    [pessoaId],
  );

  const saveDadosPessoais = useCallback(
    (patch: Partial<PessoaDadosPessoais>) => misturar("dadosPessoais", "dp", patch),
    [misturar],
  );
  const saveIdentificacao = useCallback(
    (patch: Partial<PessoaIdentificacao>) => misturar("identificacao", "id", patch),
    [misturar],
  );
  const saveSaude = useCallback(
    (patch: Partial<PessoaDadosSaude>) => misturar("saude", "sa", patch),
    [misturar],
  );
  const saveFardamento = useCallback(
    (patch: Partial<PessoaFardamento>) => misturar("fardamento", "fa", patch),
    [misturar],
  );
  const saveSindicalizacao = useCallback(
    (patch: Partial<PessoaSindicalizacao>) => misturar("sindicalizacao", "si", patch),
    [misturar],
  );
  const saveMorada = useCallback(
    (patch: Partial<PessoaMorada>) =>
      misturar("morada", "mo", patch, { tipo: "residencia", pais: "PT", is_principal: true }),
    [misturar],
  );
  const saveEmergencia = useCallback(
    (patch: Partial<PessoaContactoEmergencia>) => misturar("emergencia", "em", patch, { ordem: 1 }),
    [misturar],
  );

  const saveVinculo = useCallback(
    (vinculoId: string | null, patch: Partial<PessoaVinculo>): Promise<string | null> => {
      if (!pessoaId) return Promise.resolve("Sem pessoa");
      atualizarFicha(pessoaId, (f) => {
        if (vinculoId) {
          const { horas_periodo: _h, horas_frequencia: _q, ...semHoras } = patch;
          return { ...f, vinculos: f.vinculos.map((v) => (v.id === vinculoId ? { ...v, ...semHoras } : v)) };
        }
        const modelo = f.vinculos[0];
        const id = novoId("vin");
        const novo = {
          ...modelo,
          ...patch,
          id,
          pessoa_id: pessoaId,
          organization_id: f.pessoa.organization_id,
          estado: patch.estado ?? "activo",
        } as PessoaVinculo;
        const inicio = patch.data_inicio ?? hojeIso();
        const horasNovas =
          patch.horas_periodo != null && patch.horas_frequencia
            ? [
                {
                  id: novoId("hv"),
                  pessoa_id: pessoaId,
                  organization_id: f.pessoa.organization_id,
                  vinculo_id: id,
                  horas_periodo: patch.horas_periodo,
                  horas_frequencia: patch.horas_frequencia,
                  horas_semanais_equivalentes: patch.horas_periodo,
                  valido_de: inicio,
                  valido_ate: null,
                  motivo: null,
                  documento_id: null,
                },
              ]
            : [];
        return {
          ...f,
          vinculos: [novo, ...f.vinculos],
          horasVersoes: [
            ...f.horasVersoes.map((h) => (h.valido_ate === null ? { ...h, valido_ate: inicio } : h)),
            ...horasNovas,
          ],
        };
      });
      return Promise.resolve(null);
    },
    [pessoaId],
  );

  const savePlaneado = useCallback(
    (linhas: LinhaPlaneadoParaGravar[]): Promise<string | null> => {
      if (!pessoaId) return Promise.resolve("Sem pessoa");
      atualizarFicha(pessoaId, (f) => {
        const hoje = hojeIso();
        const ontem = ontemIso(hoje);
        const mantidas: HorarioPlaneado[] = [];
        for (const linha of f.horarioPlaneado) {
          if (linhaPlaneadaDecorrida(linha, hoje)) mantidas.push(linha);
          else if (linha.data === null && linhaRecorrenteJaEmCurso(linha, hoje)) {
            mantidas.push({ ...linha, valido_ate: ontem });
          }
        }
        const vinculo = f.vinculos.find((v) => v.estado === "activo" || v.estado === "suspenso");
        const novas: HorarioPlaneado[] = linhas.map((linha) => ({
          ...linha,
          id: novoId("hp"),
          pessoa_id: pessoaId,
          organization_id: f.pessoa.organization_id,
          vinculo_id: vinculo?.id ?? null,
          valido_de: linha.dia_semana !== null ? hoje : null,
          valido_ate: null,
          notas: null,
          corrige_horario_id: null,
          correccao_motivo: null,
          corrigido_por_anew_user_id: null,
          corrigido_por_pessoa_id: null,
        }));
        return { ...f, horarioPlaneado: [...mantidas, ...novas] };
      });
      return Promise.resolve(null);
    },
    [pessoaId],
  );

  const corrigirPlaneado = useCallback(
    (args: {
      horarioId: string;
      horaInicio: string | null;
      horaFim: string | null;
      localId: string | null;
      naoTrabalha: boolean;
      motivo: string;
    }): Promise<string | null> => {
      if (!pessoaId) return Promise.resolve("Sem pessoa");
      atualizarFicha(pessoaId, (f) => {
        const original = f.horarioPlaneado.find((l) => l.id === args.horarioId);
        if (!original) return f;
        const corrigida: HorarioPlaneado = {
          ...original,
          id: novoId("hp"),
          hora_inicio: args.naoTrabalha ? null : args.horaInicio,
          hora_fim: args.naoTrabalha ? null : args.horaFim,
          local_id: args.localId,
          nao_trabalha: args.naoTrabalha,
          corrige_horario_id: original.id,
          correccao_motivo: args.motivo,
          corrigido_por_pessoa_id: "p-sofia",
        };
        return { ...f, horarioPlaneado: [...f.horarioPlaneado, corrigida] };
      });
      return Promise.resolve(null);
    },
    [pessoaId],
  );

  const revelarNiss = useCallback(
    async (): Promise<string | null> => (pessoaId && ficha ? ficha.segredos.niss : null),
    [pessoaId, ficha],
  );

  const definirNiss = useCallback(
    (niss: string): Promise<string | null> => {
      if (!pessoaId) return Promise.resolve("Sem pessoa");
      atualizarFicha(pessoaId, (f) => ({
        ...f,
        segredos: { ...f.segredos, niss },
        identificacao: f.identificacao ? { ...f.identificacao, niss_ultimos4: ultimos4(niss) } : f.identificacao,
      }));
      return Promise.resolve(null);
    },
    [pessoaId],
  );

  const definirConta = useCallback(
    (args: DefinirContaArgs): Promise<string | null> => {
      if (!pessoaId) return Promise.resolve("Sem pessoa");
      atualizarFicha(pessoaId, (f) => {
        const anterior = f.bancarios;
        const bancarios: PessoaDadosBancarios = {
          id: anterior?.id ?? novoId("ba"),
          pessoa_id: pessoaId,
          organization_id: f.pessoa.organization_id,
          is_principal: true,
          swift: args.swift ?? anterior?.swift ?? null,
          formato_conta: args.formato,
          titular: args.titular ?? anterior?.titular ?? null,
          banco: args.banco ?? anterior?.banco ?? null,
          agencia: args.agencia ?? anterior?.agencia ?? null,
          conta_ultimos4: ultimos4(args.conta),
          conta_pais: args.formato === "iban" ? args.conta.replace(/\s/g, "").slice(0, 2) : null,
        };
        return { ...f, bancarios, segredos: { ...f.segredos, conta: args.conta } };
      });
      return Promise.resolve(null);
    },
    [pessoaId],
  );

  const definirBic = useCallback(
    (bic: string | null): Promise<string | null> => {
      if (!pessoaId) return Promise.resolve("Sem pessoa");
      atualizarFicha(pessoaId, (f) => (f.bancarios ? { ...f, bancarios: { ...f.bancarios, swift: bic } } : f));
      return Promise.resolve(null);
    },
    [pessoaId],
  );

  const ligarConta = useCallback(
    (anewUserId: string): Promise<string | null> => {
      if (!pessoaId) return Promise.resolve("Sem pessoa");
      atualizarFicha(pessoaId, (f) => ({
        ...f,
        conta: {
          id: novoId("ct"),
          pessoa_id: pessoaId,
          organization_id: f.pessoa.organization_id,
          anew_user_id: anewUserId,
          entity_id: null,
          estado: "activa",
          ligada_em: `${diaIso(0)}T09:00:00Z`,
          revogada_em: null,
        },
      }));
      return Promise.resolve(null);
    },
    [pessoaId],
  );

  const revogarConta = useCallback(
    (_motivo: string | null): Promise<string | null> => {
      if (!pessoaId) return Promise.resolve("Sem pessoa");
      atualizarFicha(pessoaId, (f) => ({ ...f, conta: null }));
      return Promise.resolve(null);
    },
    [pessoaId],
  );

  const refresh = useCallback(async (): Promise<void> => undefined, []);
  const retribuicao = useMemo(() => (ficha ? retribuicaoActual(ficha.retribuicoes) : null), [ficha]);

  return {
    pessoa: ficha?.pessoa ?? null,
    dadosPessoais: ficha?.dadosPessoais ?? null,
    identificacao: ficha?.identificacao ?? null,
    morada: ficha?.morada ?? null,
    emergencia: ficha?.emergencia ?? null,
    vinculos: ficha?.vinculos ?? [],
    retribuicao,
    horarioPlaneado: ficha?.horarioPlaneado ?? [],
    horarioRealizado: ficha?.horarioRealizado ?? [],
    bancarios: ficha?.bancarios ?? null,
    saude: ficha?.saude ?? null,
    conta: ficha?.conta ?? null,
    fardamento: ficha?.fardamento ?? null,
    sindicalizacao: ficha?.sindicalizacao ?? null,
    loading: false,
    saving: false,
    notFound: ficha === null,
    error: null as string | null,
    refresh,
    savePessoa,
    saveDadosPessoais,
    saveIdentificacao,
    saveMorada,
    saveEmergencia,
    saveSaude,
    saveFardamento,
    saveSindicalizacao,
    saveVinculo,
    savePlaneado,
    corrigirPlaneado,
    revelarNiss,
    definirNiss,
    definirConta,
    definirBic,
    ligarConta,
    revogarConta,
  };
}
