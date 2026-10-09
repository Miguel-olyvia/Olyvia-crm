// Campos de cada fase do negócio (protótipo, 09/10/2026).
// A Visita usa os campos de sistema da ficha do local e do diagnóstico
// (src/lib/campos/catalogo.ts no ramo feat/campos-configuraveis) e as
// colunas de anew_leads, deal_needs, proposals, client_contracts.
// No produto, cada empresa ajusta rótulos, ordem e obrigatórios.

export type Tipo = "sim_nao" | "escolha" | "varios" | "numero" | "contador" | "texto" | "texto_longo" | "data";
export type Papel = "plano" | "sugestoes" | "orcamento" | "fatura";

export interface Def {
  k: string;
  l: string;
  t: Tipo;
  op?: string[];
  un?: string;
  ajuda?: string;
  ph?: string;
  papel?: Papel;
  se?: { k: string; v: string[] };
  /** Por defeito tudo é obrigatório para passar de fase, menos o texto livre (notas). */
  opcional?: boolean;
  /** Contador: limites e o nome do zero (ex.: andar 0 = "R/C"). */
  min?: number;
  max?: number;
  zero?: string;
  /** Sub-bloco dentro do grupo, com título próprio (para partir os formulários longos). */
  bloco?: string;
}
export interface Grupo { titulo: string; nota?: string; campos: Def[] }

const SNS = ["Sim", "Não", "Não sei"];

export const LEAD: Grupo[] = [
  {
    titulo: "Contacto",
    campos: [
      { k: "email", l: "Email", t: "texto", ph: "nome@exemplo.pt" },
      { k: "pref", l: "Prefere ser contactado por", t: "escolha", op: ["Telefone", "WhatsApp", "Email"] },
      { k: "hora", l: "Melhor hora", t: "escolha", op: ["Manhã", "Tarde", "Fim do dia"] },
      { k: "idioma", l: "Idioma", t: "escolha", op: ["Português", "Inglês", "Francês"] },
    ],
  },
  {
    titulo: "Origem",
    campos: [
      { k: "origem", l: "Origem", t: "escolha", op: ["Site", "Campanha", "Telefone", "Recomendação", "Redes sociais", "Loja"] },
      { k: "campanha", l: "Campanha", t: "escolha", op: ["Campanha de outono · Meta Ads", "Google Ads", "Folheto na caixa do correio"], se: { k: "origem", v: ["Campanha", "Redes sociais"] } },
      { k: "recomendou", l: "Recomendado por", t: "texto", se: { k: "origem", v: ["Recomendação"] } },
      { k: "rgpd", l: "Autoriza o contacto (RGPD)", t: "sim_nao" },
    ],
  },
  {
    titulo: "Pedido",
    campos: [
      { k: "tipo_cliente", l: "Tipo de cliente", t: "escolha", op: ["Particular", "Empresa", "Condomínio"] },
      { k: "nif", l: "NIF", t: "texto", opcional: true, ajuda: "Pede-se na fatura, se ainda não o tiver." },
      { k: "concelho", l: "Concelho", t: "texto" },
      { k: "pedido", l: "O que o cliente pediu", t: "texto_longo" },
    ],
  },
];

export const CONTACTO: Grupo[] = [
  {
    titulo: "Chamada",
    campos: [
      { k: "resultado", l: "Resultado", t: "escolha", op: ["Atendeu · interessado", "Atendeu · ligar mais tarde", "Não atendeu", "Sem interesse", "Número errado"] },
      { k: "tentativas", l: "Tentativas", t: "contador", min: 1, max: 9 },
      { k: "religar", l: "Voltar a ligar em", t: "data", se: { k: "resultado", v: ["Atendeu · ligar mais tarde", "Não atendeu"] } },
    ],
  },
  {
    titulo: "Qualificação",
    campos: [
      { k: "imovel", l: "Tipo de imóvel", t: "escolha", op: ["Apartamento", "Moradia", "Loja", "Escritório"] },
      { k: "posse", l: "O cliente é", t: "escolha", op: ["Proprietário", "Inquilino", "Administração"] },
      { k: "decisor", l: "Quem decide", t: "escolha", op: ["O próprio", "Com a família", "Administração"] },
      { k: "orc_cliente", l: "Orçamento do cliente", t: "escolha", op: ["Até 3.000 €", "3.000 a 6.000 €", "6.000 a 10.000 €", "Mais de 10.000 €", "Não sabe"] },
      { k: "prazo", l: "Para quando", t: "escolha", op: ["Urgente (1 mês)", "1 a 3 meses", "3 a 6 meses", "Sem pressa"] },
      { k: "outros_orc", l: "Pediu outros orçamentos", t: "sim_nao" },
    ],
  },
  {
    titulo: "Morada da obra",
    nota: "A 1.ª morada do cliente é a fiscal. A da obra pode ser outra, e é dela que sai a distância ao armazém.",
    campos: [
      { k: "morada", l: "Rua e número", t: "texto" },
      { k: "cp", l: "Código postal", t: "texto", ph: "0000-000" },
      { k: "localidade", l: "Localidade", t: "texto" },
      { k: "fracao", l: "Andar / fração", t: "texto", ph: "3.º Esq." },
    ],
  },
  {
    titulo: "Preparar a visita",
    campos: [
      { k: "duracao", l: "Duração prevista", t: "escolha", op: ["1 h", "1 h 30", "2 h"] },
      { k: "presentes", l: "Quem vai estar", t: "escolha", op: ["O cliente", "O casal", "A família", "Outra pessoa"] },
      { k: "nota_visita", l: "Nota para a visita", t: "texto_longo" },
    ],
  },
];

// Ficha do local: os campos de sistema (anew_address_building / anew_address_extra).
export const EXTERIOR: Grupo = {
  titulo: "Local · exterior (edifício e acessos)",
  nota: "O comercial pode pré-preencher a partir da morada, antes da visita.",
  campos: [
    { k: "acesso", bloco: "Acesso e estacionamento", l: "Acesso", t: "escolha", op: ["Fácil", "Difícil"], papel: "plano" },
    { k: "impacto_percent", bloco: "Acesso e estacionamento", l: "Impacto no preço", t: "escolha", op: ["5%", "10%", "15%", "20%"], ajuda: "Só com acesso difícil.", papel: "orcamento", se: { k: "acesso", v: ["Difícil"] } },
    { k: "estacionamento", bloco: "Acesso e estacionamento", l: "Estacionamento", t: "escolha", op: ["Pago", "Não pago", "Sem estacionamento"], papel: "sugestoes" },
    { k: "zona_estacionamento", bloco: "Acesso e estacionamento", l: "Zona de estacionamento", t: "escolha", op: ["Verde", "Amarela", "Vermelha"], papel: "sugestoes", se: { k: "estacionamento", v: ["Pago"] } },
    { k: "tem_elevador", bloco: "O prédio", l: "Tem elevador", t: "sim_nao", papel: "plano" },
    { k: "n_elevadores", bloco: "O prédio", l: "Nº de elevadores", t: "contador", min: 1, max: 6, se: { k: "tem_elevador", v: ["Sim"] } },
    { k: "n_andares", bloco: "O prédio", l: "Andares do prédio", t: "contador", min: 1, max: 40 },
    { k: "andar", bloco: "O prédio", l: "Andar da fração", t: "contador", min: 0, max: 40, zero: "R/C", papel: "plano" },
    { k: "n_fracoes_por_andar", bloco: "O prédio", l: "Frações por andar", t: "contador", min: 1, max: 20 },
  ],
};

export const INTERIOR: Grupo = {
  titulo: "Local · interior",
  campos: [
    { k: "tipologia", bloco: "A casa", l: "Tipologia", t: "escolha", op: ["T0", "T1", "T2", "T3", "T4", "T5+"] },
    { k: "area_util_m2", bloco: "A casa", l: "Área útil", t: "numero", un: "m²" },
    { k: "n_divisoes", bloco: "A casa", l: "Divisões", t: "contador", min: 1, max: 20 },
    { k: "n_casas_banho", bloco: "A casa", l: "Casas de banho", t: "contador", min: 0, max: 10 },
    { k: "ano_construcao", bloco: "A casa", l: "Época de construção", t: "escolha", op: ["Antes de 1950", "1950 a 1970", "1970 a 1990", "1990 a 2010", "Depois de 2010"] },
    { k: "pavimento", bloco: "A casa", l: "Pavimento da casa", t: "escolha", op: ["Cerâmico", "Madeira", "Flutuante", "Vinílico", "Outro"], papel: "sugestoes" },
    { k: "eletrica", bloco: "Instalações", l: "Instalação elétrica", t: "escolha", op: ["Antiga", "Renovada"] },
    { k: "quadro_diferencial", bloco: "Instalações", l: "Quadro com diferencial", t: "sim_nao" },
    { k: "canalizacao", bloco: "Instalações", l: "Canalização", t: "escolha", op: ["Ferro", "PVC", "Multicamada", "Cobre", "Misto", "Não sei"] },
    { k: "gas", bloco: "Instalações", l: "Gás", t: "escolha", op: ["Canalizado", "Garrafa", "Sem gás"], papel: "plano" },
    { k: "amianto", bloco: "Durante a obra", l: "Amianto", t: "escolha", op: SNS, papel: "sugestoes" },
    { k: "habitada_durante_obra", bloco: "Durante a obra", l: "Habitada durante a obra", t: "sim_nao", papel: "plano" },
    { k: "animais", bloco: "Durante a obra", l: "Animais", t: "sim_nao", papel: "sugestoes" },
    { k: "notas_interior", bloco: "Durante a obra", l: "Notas do interior", t: "texto_longo" },
  ],
};

// Diagnóstico da área (deal_needs.diag_*). As medidas ficam à parte, porque dão as quantidades.
export const AREA: Grupo = {
  titulo: "Área de intervenção",
  campos: [
    { k: "diag_tipo_area", bloco: "A divisão", l: "Divisão", t: "escolha", op: ["Casa de banho", "Cozinha", "Outra"], papel: "plano" },
    { k: "diag_intervencao_tipo", bloco: "A divisão", l: "Intervenção", t: "escolha", op: ["Remodelação total", "Remodelação parcial", "Só substituir"], papel: "plano" },
    { k: "diag_pe_direito_m", bloco: "A divisão", l: "Pé-direito", t: "escolha", op: ["2,4 m", "2,5 m", "2,6 m", "2,7 m", "2,8 m", "3 m ou mais"], papel: "plano" },
    { k: "diag_altura_revestimento", bloco: "A divisão", l: "Revestimento de parede até", t: "escolha", op: ["20 cm", "60 cm", "120 cm", "Ao teto"], papel: "plano" },
    { k: "diag_pontos_eletricos", bloco: "Instalações da divisão", l: "Pontos elétricos", t: "contador", min: 0, max: 30, papel: "plano" },
    { k: "diag_gas", bloco: "Instalações da divisão", l: "Gás na área", t: "escolha", op: ["Não há", "Manter", "Anular", "Instalar"], papel: "plano" },
    { k: "diag_toalheiro", bloco: "Instalações da divisão", l: "Toalheiro elétrico", t: "sim_nao", papel: "plano" },
    { k: "diag_janela", bloco: "Instalações da divisão", l: "Janela na área", t: "sim_nao", ajuda: "Sem janela, os trabalhos com pó são mais lentos.", papel: "plano" },
    { k: "diag_local_cortes", bloco: "Trabalho e proteções", l: "Onde se fazem os cortes", t: "escolha", op: ["Na própria área", "Varanda", "Fora (garagem, rua)"], papel: "plano" },
    { k: "diag_distancia_entrada", bloco: "Trabalho e proteções", l: "Da entrada até à área", t: "escolha", op: ["Curta (até 5 m)", "Média (5–15 m)", "Longa (+15 m)"], papel: "sugestoes" },
    { k: "diag_mobilada", bloco: "Trabalho e proteções", l: "Casa mobilada no caminho", t: "escolha", op: ["Pouco", "Médio", "Muito"], papel: "sugestoes" },
    { k: "diag_portas_proteger", bloco: "Trabalho e proteções", l: "Portas a proteger", t: "contador", min: 0, max: 20, papel: "sugestoes" },
    { k: "diag_demolir_descricao", bloco: "Trabalho e proteções", l: "O que se demole", t: "texto_longo", ph: "Banheira, azulejo das paredes, pavimento" },
  ],
};

export const ESCOLHAS: Grupo = {
  titulo: "Escolhas do cliente",
  campos: [
    { k: "gama", l: "Gama", t: "escolha", op: ["Económica", "Média", "Alta"], papel: "orcamento" },
    { k: "materiais_cliente", l: "O cliente fornece materiais", t: "sim_nao", papel: "orcamento" },
    { k: "cor_estilo", l: "Cores e estilo", t: "texto", ph: "Branco, madeira clara", opcional: true },
  ],
};

export const PROPOSTA: Grupo[] = [
  {
    titulo: "Proposta",
    campos: [
      { k: "validade", l: "Validade", t: "escolha", op: ["15 dias", "30 dias", "60 dias"] },
      { k: "prazo_exec", l: "Prazo de execução", t: "contador", min: 1, max: 60, un: "dias úteis" },
      { k: "inicio_prev", l: "Início previsto", t: "data" },
      { k: "pagamento", l: "Condições de pagamento", t: "escolha", op: ["100% na adjudicação", "50% + 50% no fim", "30% + 40% + 30%"], papel: "fatura" },
      { k: "iva", l: "Taxa de IVA", t: "escolha", op: ["23%", "6% (reabilitação)"], papel: "fatura" },
      { k: "garantia", l: "Garantia", t: "escolha", op: ["1 ano", "2 anos", "5 anos"] },
      { k: "notas_cliente", l: "Notas para o cliente", t: "texto_longo" },
    ],
  },
  {
    titulo: "Contrato",
    nota: "Gerado a partir da proposta aceite. Na venda direta não há contrato.",
    campos: [
      { k: "modelo_contrato", l: "Modelo", t: "escolha", op: ["Empreitada de remodelação", "Prestação de serviços"] },
      { k: "assinatura", l: "Assinatura", t: "escolha", op: ["Digital, no portal", "Presencial"] },
      { k: "representante", l: "Assina pela empresa", t: "escolha", op: ["Rúben", "Direção"] },
      { k: "multa", l: "Penalização por atraso", t: "sim_nao" },
    ],
  },
];

export const FINANCEIRO: Grupo[] = [
  {
    titulo: "Dados de faturação",
    campos: [
      { k: "nome_fiscal", l: "Nome fiscal", t: "texto" },
      { k: "nif_fat", l: "NIF", t: "texto" },
      { k: "morada_fiscal_igual", l: "Morada fiscal igual à da obra", t: "sim_nao" },
      { k: "morada_fiscal", l: "Morada fiscal", t: "texto", se: { k: "morada_fiscal_igual", v: ["Não"] } },
      { k: "email_fat", l: "Email para as faturas", t: "texto" },
    ],
  },
  {
    titulo: "Fatura",
    campos: [
      { k: "serie", l: "Série", t: "escolha", op: ["FT 2026", "FT 2026-OBRAS"] },
      { k: "tranche", l: "Tranche", t: "escolha", op: ["Única", "1.ª (adjudicação)", "2.ª (a meio)", "3.ª (no fim)"] },
      { k: "vencimento", l: "Vencimento", t: "escolha", op: ["Pronto pagamento", "15 dias", "30 dias"] },
      { k: "metodo", l: "Método de pagamento", t: "escolha", op: ["Transferência", "Referência MB", "MB Way", "Cheque"] },
    ],
  },
  {
    titulo: "Pagamento",
    nota: "Por agora valida-se à mão. Quando o portal aceitar pagamentos, isto preenche-se sozinho.",
    campos: [
      { k: "data_pag", l: "Data do pagamento", t: "data" },
      { k: "valor_recebido", l: "Valor recebido", t: "numero", un: "€" },
      { k: "conta", l: "Conta de destino", t: "escolha", op: ["Banco A · conta à ordem", "Banco B · conta obras"] },
      { k: "comprovativo", l: "Referência ou comprovativo", t: "texto" },
    ],
  },
];

export const OBRA: Grupo[] = [
  {
    titulo: "Preparar a obra",
    campos: [
      { k: "responsavel", l: "Responsável de obra", t: "escolha", op: ["Filipe", "Hugo"] },
      { k: "inicio", l: "Início", t: "data" },
      { k: "horario", l: "Horário permitido", t: "escolha", op: ["Dias úteis 8h–17h", "Dias úteis 9h–18h", "Com sábados"] },
      { k: "chaves", l: "Acesso à casa", t: "escolha", op: ["O cliente abre", "Chave entregue", "Código", "Porteiro"] },
      { k: "contacto_local", l: "Contacto no local", t: "texto" },
      { k: "condominio", l: "Condomínio avisado", t: "sim_nao" },
      { k: "contentor", l: "Contentor de entulho", t: "escolha", op: ["Não", "Na via pública (licença)", "Em espaço privado"] },
      { k: "protecoes", l: "Proteções", t: "texto_longo", ajuda: "Sugeridas a partir da ficha do local." },
    ],
  },
  {
    titulo: "Fecho",
    campos: [
      { k: "vistoria", l: "Vistoria final", t: "data" },
      { k: "auto_rececao", l: "Auto de receção assinado", t: "sim_nao" },
      { k: "satisfacao", l: "Satisfação do cliente", t: "escolha", op: ["1", "2", "3", "4", "5"] },
      { k: "notas_fecho", l: "Remates e notas", t: "texto_longo" },
    ],
  },
];

export const PAPEL_ROT: Record<Papel, string> = {
  plano: "entra no plano da obra",
  sugestoes: "dá sugestões de proteção e logística",
  orcamento: "mexe no orçamento",
  fatura: "vai para a fatura",
};

export const visivel = (c: Def, v: Record<string, string>) => !c.se || c.se.v.includes(v[c.se.k] || "");

/** Obrigatório para passar de fase: tudo, menos o texto livre e o que está marcado como opcional. */
export const obrigatorio = (c: Def) => !c.opcional && c.t !== "texto_longo";

/** Campos obrigatórios preenchidos e total (os condicionais só contam quando aparecem). */
export function contagem(gs: Grupo[], v: Record<string, string>) {
  let n = 0, f = 0;
  for (const g of gs) for (const c of g.campos) if (visivel(c, v) && obrigatorio(c)) { n++; if (v[c.k]) f++; }
  return { n, f };
}

/** Os campos obrigatórios que ainda estão vazios. */
export function emFalta(gs: Grupo[], v: Record<string, string>): Def[] {
  const r: Def[] = [];
  for (const g of gs) for (const c of g.campos) if (visivel(c, v) && obrigatorio(c) && !v[c.k]) r.push(c);
  return r;
}

/* ------------------------------------------------------------------ visitas */
// Um negócio pode ter várias visitas (levantamento, medição técnica, escolha de
// materiais…). Os campos de cada uma guardam-se em d.f com o prefixo v{n}_.
const VISITA_BASE: Def[] = [
  { k: "tipo", l: "Tipo de visita", t: "escolha", op: ["Levantamento", "Medição técnica", "Escolha de materiais", "Revisita"] },
  { k: "estado", l: "Estado", t: "escolha", op: ["Marcada", "Feita", "Cancelada"] },
  { k: "data", l: "Dia", t: "data" },
  { k: "hora", l: "Hora", t: "escolha", op: ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00", "17:00"] },
  { k: "quem", l: "Quem vai", t: "escolha", op: ["Rúben (comercial)", "Hugo (técnico)", "Filipe (Operações)"] },
  { k: "presentes", l: "Quem vai estar", t: "escolha", op: ["O cliente", "O casal", "A família", "Outra pessoa"] },
  { k: "duracao", l: "Duração", t: "escolha", op: ["30 min", "1 h", "1 h 30", "2 h"] },
  { k: "motivo", l: "Porque se cancelou", t: "escolha", op: ["O cliente pediu", "Imprevisto nosso", "Não estava ninguém"], se: { k: "estado", v: ["Cancelada"] } },
  { k: "combinado", l: "O que ficou combinado", t: "texto_longo", ph: "Ex.: o cliente escolhe o pavimento até sexta" },
];
export const CAMPOS_VISITA = VISITA_BASE.map((c) => c.k);

/** O grupo de campos da visita n (as chaves e as condições com o prefixo v{n}_). */
export function grupoVisita(n: number): Grupo {
  const p = (k: string) => `v${n}_${k}`;
  return {
    titulo: `Visita ${n}`,
    campos: VISITA_BASE.map((c) => ({ ...c, k: p(c.k), se: c.se ? { k: p(c.se.k), v: c.se.v } : undefined })),
  };
}
