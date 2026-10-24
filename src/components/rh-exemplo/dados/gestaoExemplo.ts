/**
 * Os dados de exemplo da gestão de RH (assiduidade, processamento salarial, cláusulas, admissão e fim de contrato).
 * Tudo inventado e gerado em memória, com datas relativas a hoje. As picagens saem das horas realizadas
 * que já existem nas fichas, para uma coisa e a outra nunca se contradizerem.
 */
import { ORGANIZACAO_EXEMPLO_ID as ORG } from "@/components/rh-exemplo/dados/constantes";
import { diaIso } from "@/components/rh-exemplo/dados/datas";
import type { EstadoGestao } from "@/components/rh-exemplo/dados/tiposGestao";
import type { EstadoRh } from "@/components/rh-exemplo/dados/tiposLoja";
import { CAMPOS_OBRIGATORIOS_ADMISSAO } from "@/components/rh-exemplo/lib/admissaoObrigatorios";
import { CAMPOS_RH_OBRIGATORIOS, CAMPOS_RH_OPCIONAIS } from "@/components/rh-exemplo/lib/admissaoCamposRh";
import type { ConfiguracaoCampo } from "@/components/rh-exemplo/lib/admissaoObrigatorios";
import type { HrCodigoProcessamento } from "@/components/rh-exemplo/tipos";
import { saidaGeradaDe, todasAsSaidasGeradas } from "@/components/rh-exemplo/dados/assiduidadeSetembro";
import { localizacaoDeExemplo, referenciaDoLocal } from "@/components/rh-exemplo/lib/picagemLocal";
import type { Desvio, Picagem } from "@/components/rh-exemplo/tiposAssiduidade";

const CRIADO = "2024-01-02T09:00:00Z";

/** `HH:MM` ou `HH:MM:SS` -> `HH:MM:SS`. */
const comSegundos = (hora: string): string => (hora.length === 5 ? `${hora}:00` : hora);

function picagem(base: {
  id: string;
  pessoaId: string;
  data: string;
  hora: string;
  sentido: "entrada" | "saida";
  localId: string | null;
  realizadoId: string | null;
  coordenadas?: { latitude: number; longitude: number } | null;
}): Picagem {
  return {
    id: base.id,
    pessoa_id: base.pessoaId,
    organization_id: ORG,
    momento: new Date(`${base.data}T${comSegundos(base.hora)}`).toISOString(),
    data_local: base.data,
    hora_local: comSegundos(base.hora),
    sentido: base.sentido,
    local_id: base.localId,
    vinculo_id: `vin-${base.pessoaId}`,
    planeado_id: null,
    origem: "web",
    latitude: base.coordenadas?.latitude ?? null,
    longitude: base.coordenadas?.longitude ?? null,
    precisao_metros: base.coordenadas ? 20 : null,
    estado: "valida",
    realizado_id: base.realizadoId,
    corrige_picagem_id: null,
    correccao_tipo: null,
    correccao_motivo: null,
    registado_por_pessoa_id: base.pessoaId,
    anulado_em: null,
    anulacao_motivo: null,
    created_at: `${base.data}T${comSegundos(base.hora)}Z`,
  };
}

export function picagensDasFichas(estado: EstadoRh): Picagem[] {
  const resultado: Picagem[] = [];
  const fora = new Set(todasAsSaidasGeradas().flatMap((s) => s.foraDoLocal));
  for (const id of estado.ordem) {
    for (const linha of estado.fichas[id]?.horarioRealizado ?? []) {
      if (linha.origem !== "picagem") continue;
      resultado.push(
        picagem({
          id: `pg-${linha.id}-e`,
          pessoaId: linha.pessoa_id,
          data: linha.data,
          hora: linha.hora_inicio,
          sentido: "entrada",
          localId: linha.local_id,
          realizadoId: linha.id,
          coordenadas: fora.has(linha.id)
            ? localizacaoDeExemplo("fora_do_local", referenciaDoLocal(estado.locais.find((l) => l.id === linha.local_id)))
            : null,
        }),
        picagem({
          id: `pg-${linha.id}-s`,
          pessoaId: linha.pessoa_id,
          data: linha.data,
          hora: linha.hora_fim,
          sentido: "saida",
          localId: linha.local_id,
          realizadoId: linha.id,
        }),
      );
    }
  }
  return resultado;
}

function desvio(args: Omit<Desvio, "organization_id" | "planeado_id" | "referencia_id" | "data"> & { dias: number }): Desvio {
  const { dias, ...resto } = args;
  return { ...resto, data: diaIso(dias), organization_id: ORG, planeado_id: null, referencia_id: null };
}

function codigo(
  id: string,
  cod: string,
  nome: string,
  campos: Partial<HrCodigoProcessamento>,
): HrCodigoProcessamento {
  return {
    id,
    organization_id: ORG,
    codigo: cod,
    nome,
    descricao: null,
    activo: true,
    modo_calculo: "manual",
    percentagem: null,
    valor_fixo: null,
    origem_automatica: null,
    created_at: CRIADO,
    updated_at: CRIADO,
    ...campos,
  };
}

function clausula(id: string, nome: string, categoria: string, texto: string) {
  return {
    id,
    organization_id: ORG,
    nome,
    categoria,
    corpo_html: `<p>${texto}</p>`,
    activo: true,
    created_at: CRIADO,
    updated_at: CRIADO,
  };
}

/** A configuração inicial dos campos da admissão: os de pessoa no convite, os de RH fora dele. */
export function camposDeAdmissaoIniciais(): ConfiguracaoCampo[] {
  const pessoa: ConfiguracaoCampo[] = CAMPOS_OBRIGATORIOS_ADMISSAO.map((c) => ({
    codigo: c.codigo,
    origem: "pessoa",
    condicional: ["conjuge_situacao_profissional", "validade_documento", "nif", "niss"].includes(c.codigo),
    posicao: "convite",
    configuravel: true,
  }));
  const rh: ConfiguracaoCampo[] = [...CAMPOS_RH_OBRIGATORIOS, ...CAMPOS_RH_OPCIONAIS].map((c) => ({
    codigo: c.codigo,
    origem: "rh",
    condicional: false,
    posicao: "rh",
    configuravel: false,
  }));
  return [...pessoa, ...rh];
}

/** Ano e mês (1 a 12) do mês anterior ao de hoje. */
export function mesAnterior(): { ano: number; mes: number } {
  const hoje = diaIso(0);
  const ano = Number(hoje.slice(0, 4));
  const mes = Number(hoje.slice(5, 7));
  return mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
}

export function criarGestaoInicial(estado: EstadoRh): EstadoGestao {
  // Agosto ja foi processado e fechado; Setembro ja acabou e esta aberto, pronto a processar; Outubro ainda nao abriu.
  const periodoId = "per-setembro";
  return {
    picagens: picagensDasFichas(estado),
    faltas: estado.ordem.flatMap((id) => saidaGeradaDe(id).faltas),
    desvios: [
      desvio({ dias: -3, pessoa_id: "p-hugo", tipo: "planeado_sem_realizado", hora_inicio: "09:00", hora_fim: "13:00", minutos: 240, local_id: "loc-porto", detalhe: null }),
      desvio({ dias: -5, pessoa_id: "p-ines", tipo: "realizado_sem_planeado", hora_inicio: "18:00", hora_fim: "19:30", minutos: 90, local_id: "loc-porto", detalhe: null }),
      desvio({ dias: -1, pessoa_id: "p-rui", tipo: "pendente_par", hora_inicio: "14:00", hora_fim: null, minutos: null, local_id: "loc-colombo", detalhe: null }),
    ],
    obras: [],
    clausulas: [
      clausula("cl-conf", "Confidencialidade", "Geral", "O trabalhador compromete-se a guardar sigilo sobre a informação a que tenha acesso."),
      clausula("cl-exp", "Período experimental", "Contrato", "O contrato fica sujeito a um período experimental de 90 dias."),
      clausula("cl-local", "Local de trabalho", "Contrato", "O trabalho é prestado no centro de trabalho indicado, podendo ser alterado nos termos da lei."),
      clausula("cl-teletrab", "Teletrabalho", "Adenda", "As partes acordam o regime de teletrabalho até dois dias por semana."),
    ],
    codigos: [
      codigo("cod-he", "HE", "Horas extra", { descricao: "Trabalho suplementar em dia normal.", modo_calculo: "percentagem_hora_normal", percentagem: 25, origem_automatica: "horas_extra" }),
      codigo("cod-hen", "HEN", "Horas extra noturnas", { modo_calculo: "percentagem_hora_normal", percentagem: 25, origem_automatica: "horas_extra_noturnas" }),
      codigo("cod-fer", "FER", "Feriado trabalhado", { modo_calculo: "percentagem_hora_normal", percentagem: 100, origem_automatica: "feriado_trabalhado" }),
      codigo("cod-desc", "DESC", "Descanso trabalhado", { modo_calculo: "valor_fixo_ocorrencia", valor_fixo: 35, origem_automatica: "descanso_trabalhado" }),
      codigo("cod-pre", "PREM", "Prémio de assiduidade", { modo_calculo: "valor_fixo_mensal", valor_fixo: 40 }),
      codigo("cod-aj", "AJUSTE", "Ajuste manual", { descricao: "Valor lançado à mão, sem regra de cálculo." }),
      codigo("cod-velho", "COM", "Comissão antiga", { activo: false, descricao: "Já não se usa." }),
    ],
    minutosMinimosSubsidio: 240,
    periodos: [
      { id: "per-agosto", organization_id: ORG, ano: 2026, mes: 8, estado: "fechado", fechado_em: "2026-09-03T10:00:00Z", fechado_por: "p-sofia", created_at: CRIADO, created_by: "p-sofia" },
      { id: periodoId, organization_id: ORG, ano: 2026, mes: 9, estado: "aberto", fechado_em: null, fechado_por: null, created_at: CRIADO, created_by: "p-sofia" },
    ],
    lancamentos: [
      { id: "lan-1", periodo_id: periodoId, pessoa_id: "p-rui", organization_id: ORG, descricao: "Prémio de campanha", valor: 120, codigo_processamento_id: "cod-aj", anulado_em: null, anulado_por: null, anulado_motivo: null, created_at: CRIADO, created_by: "p-sofia", updated_at: CRIADO, updated_by: "p-sofia" },
      { id: "lan-2", periodo_id: periodoId, pessoa_id: "p-hugo", organization_id: ORG, descricao: "Ajuda de custo de deslocação", valor: 45.5, codigo_processamento_id: null, anulado_em: null, anulado_por: null, anulado_motivo: null, created_at: CRIADO, created_by: "p-sofia", updated_at: CRIADO, updated_by: "p-sofia" },
    ],
    admissaoCampos: camposDeAdmissaoIniciais(),
    regrasFimContrato: {
      ativo: true,
      dias_aviso: 30,
      renovacao_automatica: false,
      max_renovacoes: 2,
      duracao_renovacao_valor: 6,
      duracao_renovacao_unidade: "meses",
      ao_atingir_limite: "decisao_manual_rh",
    },
  };
}
