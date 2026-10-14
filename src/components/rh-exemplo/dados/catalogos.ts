/** Os catálogos da organização de exemplo: centros de trabalho, cargos, modelos de documento, tipos de ausência. */
import * as K from "@/components/rh-exemplo/dados/constantes";
import type { HrCargo } from "@/components/rh-exemplo/hooks/useCargos";
import type { HrCargoPeriodo } from "@/components/rh-exemplo/lib/cargosPeriodos";
import type { LocalTrabalho, PessoaDocumentoModelo, TipoLocal } from "@/components/rh-exemplo/tipos";
import type { AusenciaTipo, CategoriaAusencia } from "@/components/rh-exemplo/tiposAusencias";
import type { FilialExemplo } from "@/components/rh-exemplo/dados/tiposLoja";

export interface Catalogos {
  locais: LocalTrabalho[];
  cargos: HrCargo[];
  cargosPeriodos: HrCargoPeriodo[];
  modelos: PessoaDocumentoModelo[];
  tiposAusencia: AusenciaTipo[];
  filiais: FilialExemplo[];
  papeis: Array<{ id: string; name: string; code: string | null }>;
}

const CRIADO = "2024-01-02T09:00:00Z";

function local(
  id: string,
  nome: string,
  tipo: TipoLocal,
  cidade: string | null,
  filialId: string | null,
  contacto: string | null,
): LocalTrabalho {
  return {
    id,
    organization_id: K.ORGANIZACAO_EXEMPLO_ID,
    nome,
    codigo: id.replace("loc-", "").toUpperCase().slice(0, 4),
    tipo,
    organizacao_ref_id: filialId,
    morada: cidade ? `Rua de Exemplo ${id.length * 7}, ${cidade}` : null,
    cidade,
    codigo_postal: cidade ? "1000-001" : null,
    pais: "PT",
    latitude: null,
    longitude: null,
    organograma_node_id: filialId,
    contacto_nome: contacto,
    contacto_telefone: contacto ? "210 000 000" : null,
    activo: true,
    notas: null,
  };
}

function cargo(id: string, nome: string, horas: number | null): HrCargo {
  return {
    id,
    organization_id: K.ORGANIZACAO_EXEMPLO_ID,
    nome,
    horas_referencia: horas,
    activo: true,
    created_at: CRIADO,
    updated_at: CRIADO,
  };
}

function periodo(
  id: string,
  cargoId: string,
  salario: number,
  de: string,
  ate: string | null,
  motivo: string | null,
): HrCargoPeriodo {
  return {
    id,
    cargo_id: cargoId,
    salario_base: salario,
    periodicidade: "mensal",
    valido_de: de,
    valido_ate: ate,
    motivo,
  };
}

function tipo(
  codigo: string,
  nome: string,
  categoria: CategoriaAusencia,
  extra: Partial<AusenciaTipo> = {},
): AusenciaTipo {
  return {
    id: `at-${codigo.toLowerCase()}`,
    organization_id: K.ORGANIZACAO_EXEMPLO_ID,
    codigo,
    nome,
    descricao: null,
    categoria,
    cor: null,
    remunerada: true,
    desconta_saldo: false,
    conta_minimo_legal: false,
    exige_aprovacao_chefia: true,
    exige_aprovacao_rh: false,
    exige_justificacao: false,
    justificacao_sensivel: false,
    permite_meio_dia: true,
    inclui_fim_de_semana: false,
    inclui_feriados: false,
    antecedencia_minima_dias: 0,
    unidade_apresentacao: "dia",
    activo: true,
    ...extra,
  };
}

function modelo(id: string, nome: string, tipoDoc: PessoaDocumentoModelo["tipo"]): PessoaDocumentoModelo {
  return {
    id,
    organization_id: K.ORGANIZACAO_EXEMPLO_ID,
    nome,
    tipo: tipoDoc,
    corpo_html: `<h1>${nome}</h1><p>Texto de exemplo do modelo. Este documento é apenas uma apresentação.</p>`,
    variaveis: ["pessoa.nome_completo", "pessoa.cargo"],
    activo: true,
  };
}

export function catalogos(): Catalogos {
  return {
    locais: [
      local(K.LOCAL_SEDE, "Sede Lisboa", "sede", "Lisboa", K.FILIAL_SEDE, "Sofia Rebelo"),
      local(K.LOCAL_COLOMBO, "Loja Colombo", "loja", "Lisboa", K.FILIAL_LISBOA, "Rui Amaral"),
      local(K.LOCAL_PORTO, "Loja Porto", "loja", "Porto", K.FILIAL_PORTO, "Inês Cardoso"),
      local(K.LOCAL_BRAGA, "Loja Braga", "loja", "Braga", K.FILIAL_BRAGA, null),
      local(K.LOCAL_FARO, "Loja Faro", "loja", "Faro", K.FILIAL_FARO, null),
      local(K.LOCAL_ARMAZEM, "Armazém Azambuja", "armazem", "Azambuja", K.FILIAL_LISBOA, null),
      local(K.LOCAL_REMOTO, "Teletrabalho", "remoto", null, null, null),
    ],
    cargos: [
      cargo("cg-diretor", "Diretor/a Comercial", 40),
      cargo("cg-gerente", "Gerente de Loja", 40),
      cargo("cg-vendedor", "Vendedor/a", 40),
      cargo("cg-armazem", "Operador/a de Armazém", 40),
      cargo("cg-rh", "Técnico/a de Recursos Humanos", 40),
      cargo("cg-admin", "Assistente Administrativo/a", 40),
    ],
    cargosPeriodos: [
      periodo("cp-1", "cg-diretor", 3200, "2024-01-01", null, null),
      periodo("cp-2", "cg-gerente", 1850, "2024-01-01", null, null),
      periodo("cp-3", "cg-vendedor", 985, "2023-01-01", "2024-01-01", null),
      periodo("cp-4", "cg-vendedor", 1050, "2024-01-01", null, "Atualização anual"),
      periodo("cp-5", "cg-armazem", 980, "2024-01-01", null, null),
      periodo("cp-6", "cg-rh", 1500, "2024-01-01", null, null),
      periodo("cp-7", "cg-admin", 1100, "2024-01-01", null, null),
    ],
    modelos: [
      modelo("mod-contrato", "Contrato de trabalho sem termo", "contrato"),
      modelo("mod-adenda", "Adenda de alteração de horário", "adenda"),
      modelo("mod-declaracao", "Declaração de vínculo", "declaracao"),
      modelo("mod-recibo", "Recibo de entrega de fardamento", "recibo"),
      modelo("mod-outro", "Acordo de confidencialidade", "outro"),
    ],
    tiposAusencia: [
      tipo("FERIAS", "Férias", "ferias", { desconta_saldo: true, conta_minimo_legal: true, cor: "#2563eb" }),
      tipo("BAIXA_MEDICA", "Baixa médica", "doenca", {
        exige_justificacao: true,
        justificacao_sensivel: true,
        permite_meio_dia: false,
        cor: "#dc2626",
      }),
      tipo("CASAMENTO", "Casamento", "outro", { permite_meio_dia: false, inclui_fim_de_semana: true, cor: "#9333ea" }),
      tipo("DOENCA_FAMILIAR", "Doença de familiar", "falta_justificada", { exige_justificacao: true, cor: "#ea580c" }),
      tipo("MOTIVOS_FAMILIARES", "Motivos familiares", "falta_justificada", { cor: "#0d9488" }),
      tipo("TELETRABALHO", "Teletrabalho", "outro", { cor: "#64748b" }),
    ],
    filiais: [
      { id: K.FILIAL_SEDE, name: "Sede Lisboa" },
      { id: K.FILIAL_LISBOA, name: "Filial Lisboa" },
      { id: K.FILIAL_PORTO, name: "Filial Porto" },
      { id: K.FILIAL_BRAGA, name: "Filial Braga" },
      { id: K.FILIAL_FARO, name: "Filial Faro" },
    ],
    papeis: [
      { id: "papel-rh", name: "Recursos Humanos", code: "rh" },
      { id: "papel-chefia", name: "Chefia de loja", code: "chefia" },
      { id: "papel-colaborador", name: "Colaborador", code: "colaborador" },
    ],
  };
}
