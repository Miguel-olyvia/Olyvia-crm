/** Constrói a ficha completa de uma pessoa de exemplo a partir de uma linha da tabela de `exemplo.ts`. */
import type { Catalogos } from "@/components/rh-exemplo/dados/catalogos";
import { diaIso } from "@/components/rh-exemplo/dados/datas";
import { anexosDeExemplo, convitePendencias, documentosDeExemplo } from "@/components/rh-exemplo/dados/fichaDocs";
import { ausenciasDeExemplo, horariosDeExemplo } from "@/components/rh-exemplo/dados/fichaTempo";
import type { FichaRh } from "@/components/rh-exemplo/dados/tiposLoja";
import type {
  DiaSemana,
  EstadoVinculo,
  Genero,
  Pessoa,
  PessoaRetribuicao,
  PessoaVinculo,
  TipoContrato,
  TipoTrabalho,
} from "@/components/rh-exemplo/tipos";
import { periodoDoCargoEm } from "@/components/rh-exemplo/lib/cargosPeriodos";

export interface EspecPessoa {
  id: string;
  nome: string;
  apelido: string;
  cargoId: string;
  localId: string;
  filialId: string;
  tipo: TipoContrato;
  /** Dias relativos a hoje (negativo = passado) em que o contrato começa. */
  inicio: number;
  /** Dias relativos a hoje em que o contrato termina (`null` = sem termo). */
  fim: number | null;
  reportaA: string | null;
  conta: boolean;
  estado: EstadoVinculo;
  genero: Genero;
  nascimento: string;
  trabalho: TipoTrabalho;
  horas: number;
  dias: readonly DiaSemana[];
  parcial?: boolean;
  saida?: number;
  renovacoes?: number;
  historicoLocal?: boolean;
  convite?: "pendente" | "usado";
  pendencias?: string[];
}

const CIDADES: Record<string, { cidade: string; cp: string; distrito: string }> = {
  "fil-sede": { cidade: "Lisboa", cp: "1050-099", distrito: "Lisboa" },
  "fil-lisboa": { cidade: "Amadora", cp: "2700-123", distrito: "Lisboa" },
  "fil-porto": { cidade: "Matosinhos", cp: "4450-200", distrito: "Porto" },
  "fil-braga": { cidade: "Braga", cp: "4700-300", distrito: "Braga" },
  "fil-faro": { cidade: "Faro", cp: "8000-100", distrito: "Faro" },
};

const slug = (texto: string): string =>
  texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");

const quatro = (n: number): string => String(1000 + ((n * 7919) % 9000));

function vinculoDe(e: EspecPessoa, org: string): PessoaVinculo {
  return {
    id: `vin-${e.id}`,
    pessoa_id: e.id,
    organization_id: org,
    tipo_contrato: e.tipo,
    regime: e.parcial ? "tempo_parcial" : "tempo_inteiro",
    regime_contratual: "individual",
    horas_periodo: e.horas,
    data_inicio: diaIso(e.inicio),
    data_fim: e.fim === null ? null : diaIso(e.fim),
    motivo_termo: e.saida !== undefined ? "Caducidade do contrato a termo" : null,
    periodo_experimental_ate: diaIso(e.inicio + 90),
    entidade_legal_org_id: null,
    estado: e.estado,
    tipo_trabalho: e.trabalho,
    horas_frequencia: "semanal",
    horas_semanais_equivalentes: e.horas,
    tempo_trabalho_pct: e.parcial ? 75 : 100,
    dias_uteis: [...e.dias],
    politica_feriados: "nao_laboral",
    horas_anuais_maximas: null,
    horas_semanais_maximas: 48,
    periodo_experimental_dias: 90,
    categoria_funcao: "geral",
    periodo_experimental_origem: "sugerido",
    categoria_profissional: "Profissional de comércio",
    renovavel: e.tipo === "termo_certo" ? true : null,
    isencao_horario: false,
    formacao_inicio: null,
    formacao_fim: null,
  };
}

function retribuicaoDe(e: EspecPessoa, org: string, cat: Catalogos): PessoaRetribuicao {
  const de = diaIso(e.inicio);
  const salario = periodoDoCargoEm(cat.cargosPeriodos, e.cargoId, de > diaIso(0) ? diaIso(0) : de);
  return {
    id: `ret-${e.id}`,
    pessoa_id: e.id,
    organization_id: org,
    vinculo_id: `vin-${e.id}`,
    valor_base: salario?.salario_base ?? 1000,
    moeda: "EUR",
    periodicidade: "mensal",
    subsidio_alimentacao: 7.63,
    subsidio_alimentacao_modo: "cartao",
    valido_de: de,
    valido_ate: null,
    motivo: null,
    duodecimos_pct: 50,
    origem: "cargo",
  };
}

export function fichaDeEspec(
  e: EspecPessoa,
  idx: number,
  cat: Catalogos,
  org: string,
): FichaRh {
  const cargoNome = cat.cargos.find((c) => c.id === e.cargoId)?.nome ?? null;
  const localNome = cat.locais.find((l) => l.id === e.localId)?.nome ?? null;
  const nomeCompleto = `${e.nome} ${e.apelido}`;
  const cidade = CIDADES[e.filialId] ?? CIDADES["fil-sede"];
  const comFoto = idx % 4 === 0;
  const ultimos4Niss = quatro(idx + 31);
  const ultimos4Conta = quatro(idx + 41);

  const pessoa: Pessoa = {
    id: e.id,
    organization_id: org,
    numero_interno: `RH-${String(idx + 1).padStart(4, "0")}`,
    primeiro_nome: e.nome,
    apelido: e.apelido,
    nome_completo: nomeCompleto,
    email_trabalho: `${slug(e.nome)}.${slug(e.apelido)}@olyvia-exemplo.pt`,
    email_pessoal: `${slug(e.nome)}${slug(e.apelido).slice(0, 3)}@exemplo.pt`,
    telefone_trabalho: `21 ${quatro(idx + 1)} ${quatro(idx + 5).slice(0, 3)}`,
    cargo: cargoNome,
    cargo_id: e.cargoId,
    local_trabalho: localNome,
    local_id: e.localId,
    entidade_legal_org_id: null,
    reporta_a_pessoa_id: e.reportaA,
    data_admissao: diaIso(e.inicio),
    data_antiguidade: diaIso(e.inicio),
    data_saida: e.saida !== undefined ? diaIso(e.saida) : null,
    estado_registo: e.estado === "terminado" ? "arquivado" : "activo",
    notas: null,
    fotografia_anexo_id: comFoto ? `anx-foto-${e.id}` : null,
  };

  const sat = { pessoa_id: e.id, organization_id: org };
  const horariosEAusencias = {
    ...horariosDeExemplo(e, org),
    ausencias: ausenciasDeExemplo(e, org, cat),
  };
  const docs = documentosDeExemplo(e, org, cat);
  const convite = convitePendencias(e, pessoa.email_pessoal);

  return {
    pessoa,
    dadosPessoais: {
      id: `dp-${e.id}`,
      ...sat,
      data_nascimento: e.nascimento,
      ocultar_aniversario: false,
      genero: e.genero,
      nacionalidade: "PT",
      telefone_pessoal: `9${quatro(idx + 2)}${quatro(idx + 3).slice(0, 2)}${quatro(idx + 4).slice(0, 1)}00`.slice(0, 9),
      estado_civil: idx % 3 === 0 ? "casado" : "solteiro",
      dependentes: idx % 3 === 0 ? 1 : 0,
      irs_retencao_percentagem: 12.5,
      naturalidade_freguesia: "Arroios",
      naturalidade_concelho: "Lisboa",
      naturalidade_pais: "PT",
      conjuge_situacao_profissional: idx % 3 === 0 ? "trabalhador" : null,
      dependentes_deficientes: 0,
      habilitacao_academica: idx % 2 === 0 ? "licenciatura" : "secundario",
      habilitacao_data_conclusao: "2015-07-15",
    },
    identificacao: {
      id: `id-${e.id}`,
      ...sat,
      tipo_documento: "cartao_cidadao",
      numero_documento: `1${quatro(idx + 9)}${quatro(idx + 11)} 0 ZZ4`,
      validade_documento: diaIso(900 - idx * 40),
      nif: `2${quatro(idx + 1)}${quatro(idx + 2)}${String(idx % 10)}`.slice(0, 9),
      niss_ultimos4: ultimos4Niss,
      carta_conducao_numero: idx % 2 === 0 ? `L-${quatro(idx)}${quatro(idx + 1)} 0` : null,
      carta_conducao_categorias: idx % 2 === 0 ? "B" : null,
      carta_conducao_validade: idx % 2 === 0 ? diaIso(1500) : null,
    },
    morada: {
      id: `mo-${e.id}`,
      ...sat,
      tipo: "residencia",
      linha1: `Rua das Flores ${10 + idx * 3}, ${idx + 1}.º Esq.`,
      linha2: null,
      codigo_postal: cidade.cp,
      localidade: cidade.cidade,
      distrito: cidade.distrito,
      pais: "PT",
      is_principal: true,
    },
    emergencia: {
      id: `em-${e.id}`,
      ...sat,
      nome: `${["Ana", "Paulo", "Teresa", "Nuno"][idx % 4]} ${e.apelido}`,
      relacao: ["Mãe", "Pai", "Cônjuge", "Irmão"][idx % 4],
      telefone: `91${quatro(idx + 6)}${quatro(idx + 7).slice(0, 3)}`,
      telefone_alternativo: null,
      email: null,
      ordem: 1,
    },
    vinculos: [vinculoDe(e, org)],
    retribuicoes: [retribuicaoDe(e, org, cat)],
    horasVersoes: [
      {
        id: `hv-${e.id}`,
        ...sat,
        vinculo_id: `vin-${e.id}`,
        horas_periodo: e.horas,
        horas_frequencia: "semanal",
        horas_semanais_equivalentes: e.horas,
        valido_de: diaIso(e.inicio),
        valido_ate: e.estado === "terminado" && e.fim !== null ? diaIso(e.fim) : null,
        motivo: null,
        documento_id: null,
      },
    ],
    horarioPlaneado: horariosEAusencias.horarioPlaneado,
    horarioRealizado: horariosEAusencias.horarioRealizado,
    bancarios: {
      id: `ba-${e.id}`,
      ...sat,
      formato_conta: "iban",
      titular: nomeCompleto,
      banco: "Banco Exemplo",
      agencia: null,
      conta_ultimos4: ultimos4Conta,
      conta_pais: "PT",
      swift: null,
      is_principal: true,
    },
    saude: null,
    conta: e.conta
      ? {
          id: `ct-${e.id}`,
          ...sat,
          anew_user_id: `u-${e.id}`,
          entity_id: null,
          estado: "activa",
          ligada_em: `${diaIso(e.inicio)}T09:00:00Z`,
          revogada_em: null,
        }
      : null,
    fardamento: {
      id: `fa-${e.id}`,
      ...sat,
      tamanho_cima: idx % 2 === 0 ? "m" : "l",
      tamanho_cima_detalhe: null,
      tamanho_baixo: "40",
      tamanho_baixo_detalhe: null,
      tamanho_calcado: idx % 2 === 0 ? "40" : "43",
      tamanho_calcado_detalhe: null,
    },
    sindicalizacao: null,
    afectacoes: [
      ...(e.historicoLocal
        ? [
            {
              id: `af-ant-${e.id}`,
              ...sat,
              vinculo_id: `vin-${e.id}`,
              local_id: "loc-sede",
              valido_de: diaIso(e.inicio),
              valido_ate: diaIso(-300),
              motivo: "Integração na sede",
              origem: "declarada" as const,
              confirmada_por: null,
              confirmada_em: null,
            },
          ]
        : []),
      {
        id: `af-${e.id}`,
        ...sat,
        vinculo_id: `vin-${e.id}`,
        local_id: e.localId,
        valido_de: e.historicoLocal ? diaIso(-300) : diaIso(e.inicio),
        valido_ate: e.saida !== undefined ? diaIso(e.saida) : null,
        motivo: null,
        origem: "declarada",
        confirmada_por: null,
        confirmada_em: null,
      },
    ],
    colocacoes: [
      {
        id: `co-${e.id}`,
        ...sat,
        organograma_node_id: e.filialId,
        valido_de: diaIso(e.inicio),
        valido_ate: e.saida !== undefined ? diaIso(e.saida) : null,
        motivo: null,
      },
    ],
    cargosPeriodos: [
      { id: `pc-${e.id}`, pessoa_id: e.id, cargo_id: e.cargoId, valido_de: diaIso(e.inicio), valido_ate: null, motivo: null },
    ],
    documentos: docs,
    anexos: anexosDeExemplo(e, org, idx, comFoto),
    convite: convite.convite,
    pendencias: convite.pendencias,
    alteracoesVinculo: [],
    renovacoes: Array.from({ length: e.renovacoes ?? 0 }, (_, i) => ({
      id: `rn-${e.id}-${i + 1}`,
      vinculo_id: `vin-${e.id}`,
      numero: i + 1,
      tipo: "manual" as const,
      data_fim_anterior: diaIso(e.inicio + 180),
      data_fim_nova: e.fim === null ? null : diaIso(e.fim),
      feita_em: `${diaIso(e.inicio + 150)}T10:00:00Z`,
      motivo: "Renovação por necessidade de reforço da equipa",
    })),
    avisos: [],
    indicacoes: [],
    respostasFim: {},
    ausencias: horariosEAusencias.ausencias,
    segredos: {
      niss: `1${quatro(idx + 3)}${quatro(idx + 9).slice(0, 2)}${ultimos4Niss}`,
      conta: `PT50 0035 ${quatro(idx)} 0000 ${quatro(idx + 1)} ${ultimos4Conta}`,
    },
  };
}
