/**
 * Modelos de partida por setor. Aplicar um modelo substitui a configuração
 * das fichas e os nomes da empresa; depois o admin ajusta à vontade.
 *
 * "Remodelação residencial" é a ficha de sempre (a da Mudelar): sem ajustes.
 * Os outros escondem campos de sistema que não se aplicam e acrescentam
 * campos próprios do setor. Os campos de sistema continuam lá (escondidos):
 * voltam a aparecer com um clique e o que já estiver gravado não se perde.
 */

import type { Ficha, LinhaCampo } from "./catalogo";
import type { Termos } from "./termos";

export interface ModeloSetor {
  chave: string;
  nome: string;
  descricao: string;
  fichas: Partial<Record<Ficha, LinhaCampo[]>>;
  termos: Partial<Termos>;
}

const esconder = (...chaves: string[]): LinhaCampo[] =>
  chaves.map((chave) => ({ chave, sistema: true, ativo: false }));

const renomear = (chave: string, rotulo: string, ajuda?: string): LinhaCampo =>
  ({ chave, sistema: true, rotulo, ajuda: ajuda ?? null });

const opcoes = (...rotulos: [string, string][]) => rotulos.map(([valor, rotulo]) => ({ valor, rotulo }));

export const MODELOS_SETOR: readonly ModeloSetor[] = [
  {
    chave: "remodelacao_residencial",
    nome: "Remodelação residencial",
    descricao: "Casas de banho, cozinhas e remodelações em casas habitadas. É a ficha de sempre.",
    fichas: { local: [], diagnostico: [], cliente: [], lead: [] },
    termos: {},
  },
  {
    chave: "comercial",
    nome: "Lojas e escritórios",
    descricao: "Obras em espaços comerciais. Interessa o horário, a credenciação e se o espaço continua aberto.",
    fichas: {
      local: [
        ...esconder("tipologia", "n_casas_banho", "n_divisoes", "animais", "gas"),
        renomear("habitada_durante_obra", "Espaço aberto ao público durante a obra",
          "Conta como \"habitada\" no planeamento: mais proteção e limpeza diária."),
        renomear("area_util_m2", "Área do espaço"),
        { chave: "horario_trabalho", sistema: false, seccao: "acessos", tipo: "escolha", rotulo: "Horário permitido para trabalhar",
          opcoes: opcoes(["dia", "Dia (horário normal)"], ["noite", "Só à noite"], ["fim_semana", "Só ao fim de semana"]) },
        { chave: "exige_credenciacao", sistema: false, seccao: "acessos", tipo: "sim_nao", rotulo: "Exige credenciação da equipa" },
        { chave: "quem_credencia", sistema: false, seccao: "acessos", tipo: "texto", rotulo: "Quem credencia",
          condicao: { campo: "exige_credenciacao", valores: ["true"] } },
        { chave: "cargas_descargas", sistema: false, seccao: "acessos", tipo: "escolha", rotulo: "Cargas e descargas",
          opcoes: opcoes(["cais", "Cais próprio"], ["rua", "Na rua"], ["horario", "Só em horário marcado"]) },
      ],
      diagnostico: [
        renomear("diag_mobilada", "Mobiliário/equipamento no caminho"),
        renomear("diag_distancia_entrada", "Da entrada do espaço até à área"),
        esconder("diag_toalheiro")[0],
      ],
      cliente: [
        { chave: "nome_espaco", sistema: false, tipo: "texto", rotulo: "Nome do espaço / insígnia" },
        { chave: "responsavel_espaco", sistema: false, tipo: "texto", rotulo: "Responsável no espaço" },
      ],
      lead: [],
    },
    termos: {
      cliente: { singular: "Cliente", plural: "Clientes" },
      local: { singular: "Espaço", plural: "Espaços" },
    },
  },
  {
    chave: "condominios",
    nome: "Condomínios",
    descricao: "Partes comuns de prédios. O interior da casa não interessa; interessam a administração e as frações.",
    fichas: {
      local: [
        ...esconder("tipologia", "area_util_m2", "n_divisoes", "n_casas_banho", "pavimento", "eletrica",
          "quadro_diferencial", "canalizacao", "gas", "animais"),
        renomear("habitada_durante_obra", "Prédio habitado durante a obra"),
        { chave: "n_fracoes_total", sistema: false, seccao: "condominio", tipo: "numero", rotulo: "Total de frações", minimo: 1, maximo: 2000 },
        { chave: "administracao", sistema: false, seccao: "condominio", tipo: "escolha", rotulo: "Administração",
          opcoes: opcoes(["profissional", "Empresa de administração"], ["condomino", "Um condómino"]) },
        { chave: "aprovado_assembleia", sistema: false, seccao: "condominio", tipo: "sim_nao", rotulo: "Obra aprovada em assembleia" },
        { chave: "data_assembleia", sistema: false, seccao: "condominio", tipo: "data", rotulo: "Data da assembleia",
          condicao: { campo: "aprovado_assembleia", valores: ["true"] } },
        { chave: "zona_comum", sistema: false, seccao: "condominio", tipo: "escolha", rotulo: "Zona da intervenção",
          opcoes: opcoes(["fachada", "Fachada"], ["cobertura", "Cobertura"], ["escadas", "Escadas e patamares"],
            ["garagem", "Garagem"], ["elevador", "Elevador"], ["outra", "Outra"]) },
      ],
      diagnostico: [esconder("diag_toalheiro")[0], renomear("diag_tipo_area", "Tipo de área")],
      cliente: [
        { chave: "nipc_condominio", sistema: false, tipo: "texto", rotulo: "NIPC do condomínio" },
        { chave: "contacto_administracao", sistema: false, tipo: "texto", rotulo: "Contacto da administração" },
      ],
      lead: [],
    },
    termos: {
      cliente: { singular: "Condomínio", plural: "Condomínios" },
      local: { singular: "Prédio", plural: "Prédios" },
      obra: { singular: "Intervenção", plural: "Intervenções" },
    },
  },
  {
    chave: "manutencao",
    nome: "Manutenção de equipamentos",
    descricao: "Assistência e manutenção (AVAC, elevadores, caldeiras…). O que importa é o equipamento e o contrato.",
    fichas: {
      local: [
        ...esconder("tipologia", "n_divisoes", "n_casas_banho", "ano_construcao", "pavimento", "eletrica",
          "quadro_diferencial", "canalizacao", "amianto", "animais", "n_fracoes_por_andar"),
        renomear("habitada_durante_obra", "Instalação em funcionamento durante a intervenção"),
        { chave: "tipo_equipamento", sistema: false, seccao: "equipamento", tipo: "escolha", rotulo: "Equipamento",
          opcoes: opcoes(["avac", "AVAC / climatização"], ["caldeira", "Caldeira / esquentador"], ["elevador", "Elevador"],
            ["bomba", "Bomba de calor"], ["solar", "Painéis solares"], ["outro", "Outro"]) },
        { chave: "marca_modelo", sistema: false, seccao: "equipamento", tipo: "texto", rotulo: "Marca e modelo" },
        { chave: "n_serie", sistema: false, seccao: "equipamento", tipo: "texto", rotulo: "Nº de série" },
        { chave: "ano_instalacao", sistema: false, seccao: "equipamento", tipo: "numero", rotulo: "Ano de instalação", minimo: 1950, maximo: 2100 },
        { chave: "contrato_manutencao", sistema: false, seccao: "equipamento", tipo: "sim_nao", rotulo: "Tem contrato de manutenção" },
        { chave: "periodicidade", sistema: false, seccao: "equipamento", tipo: "escolha", rotulo: "Periodicidade",
          opcoes: opcoes(["mensal", "Mensal"], ["trimestral", "Trimestral"], ["semestral", "Semestral"], ["anual", "Anual"]),
          condicao: { campo: "contrato_manutencao", valores: ["true"] } },
      ],
      diagnostico: [
        ...esconder("diag_altura_revestimento", "diag_perimetro_m", "diag_pe_direito_m", "diag_toalheiro",
          "diag_local_cortes", "diag_mobilada", "diag_portas_proteger"),
        { chave: "avaria", sistema: false, seccao: "planeamento", tipo: "escolha", rotulo: "Tipo de pedido",
          opcoes: opcoes(["preventiva", "Manutenção preventiva"], ["avaria", "Avaria"], ["instalacao", "Instalação nova"]) },
        { chave: "urgencia", sistema: false, seccao: "planeamento", tipo: "escolha", rotulo: "Urgência",
          opcoes: opcoes(["normal", "Normal"], ["urgente", "Urgente (24 h)"], ["critica", "Crítica (mesmo dia)"]) },
      ],
      cliente: [{ chave: "n_contrato", sistema: false, tipo: "texto", rotulo: "Nº do contrato de manutenção" }],
      lead: [],
    },
    termos: {
      local: { singular: "Instalação", plural: "Instalações" },
      obra: { singular: "Intervenção", plural: "Intervenções" },
      negocio: { singular: "Pedido", plural: "Pedidos" },
    },
  },
];
