// Campos de cada fase do negócio (protótipo, 09/10/2026).
// A Visita usa os campos de sistema da ficha do local e do diagnóstico
// (src/lib/campos/catalogo.ts no ramo feat/campos-configuraveis) e as
// colunas de anew_leads, deal_needs, proposals, client_contracts.
// No produto, cada empresa ajusta rótulos, ordem e obrigatórios.

export type Tipo = "sim_nao" | "escolha" | "varios" | "numero" | "texto" | "texto_longo" | "data";
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
      { k: "campanha", l: "Campanha", t: "texto", se: { k: "origem", v: ["Campanha", "Redes sociais"] } },
      { k: "recomendou", l: "Recomendado por", t: "texto", se: { k: "origem", v: ["Recomendação"] } },
      { k: "rgpd", l: "Autoriza o contacto (RGPD)", t: "sim_nao" },
    ],
  },
  {
    titulo: "Pedido",
    campos: [
      { k: "tipo_cliente", l: "Tipo de cliente", t: "escolha", op: ["Particular", "Empresa", "Condomínio"] },
      { k: "nif", l: "NIF", t: "texto", ph: "Opcional nesta fase" },
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
      { k: "tentativas", l: "Tentativas", t: "numero" },
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
      { k: "presentes", l: "Quem vai estar", t: "texto", ph: "Cliente e marido" },
      { k: "nota_visita", l: "Nota para a visita", t: "texto_longo" },
    ],
  },
];

// Ficha do local: os campos de sistema (anew_address_building / anew_address_extra).
export const EXTERIOR: Grupo = {
  titulo: "Local · exterior (edifício e acessos)",
  nota: "O comercial pode pré-preencher a partir da morada, antes da visita.",
  campos: [
    { k: "acesso", l: "Acesso", t: "escolha", op: ["Fácil", "Difícil"], papel: "plano" },
    { k: "impacto_percent", l: "Impacto", t: "numero", un: "%", ajuda: "Só com acesso difícil.", papel: "orcamento", se: { k: "acesso", v: ["Difícil"] } },
    { k: "estacionamento", l: "Estacionamento", t: "escolha", op: ["Pago", "Não pago", "Sem estacionamento"], papel: "sugestoes" },
    { k: "zona_estacionamento", l: "Zona de estacionamento", t: "escolha", op: ["Verde", "Amarela", "Vermelha"], papel: "sugestoes", se: { k: "estacionamento", v: ["Pago"] } },
    { k: "tem_elevador", l: "Tem elevador", t: "sim_nao", papel: "plano" },
    { k: "n_elevadores", l: "Nº de elevadores", t: "numero", se: { k: "tem_elevador", v: ["Sim"] } },
    { k: "n_andares", l: "Nº de andares do prédio", t: "numero" },
    { k: "andar", l: "Andar da fração", t: "numero", papel: "plano" },
    { k: "n_fracoes_por_andar", l: "Frações por andar", t: "numero" },
  ],
};

export const INTERIOR: Grupo = {
  titulo: "Local · interior",
  campos: [
    { k: "tipologia", l: "Tipologia", t: "escolha", op: ["T0", "T1", "T2", "T3", "T4", "T5+"] },
    { k: "area_util_m2", l: "Área útil", t: "numero", un: "m²" },
    { k: "n_divisoes", l: "Divisões", t: "numero" },
    { k: "n_casas_banho", l: "Casas de banho", t: "numero" },
    { k: "ano_construcao", l: "Ano de construção", t: "numero" },
    { k: "pavimento", l: "Pavimento da casa", t: "escolha", op: ["Cerâmico", "Madeira", "Flutuante", "Vinílico", "Outro"], papel: "sugestoes" },
    { k: "eletrica", l: "Instalação elétrica", t: "escolha", op: ["Antiga", "Renovada"] },
    { k: "quadro_diferencial", l: "Quadro com diferencial", t: "sim_nao" },
    { k: "canalizacao", l: "Canalização", t: "escolha", op: ["Ferro", "PVC", "Multicamada", "Cobre", "Misto", "Não sei"] },
    { k: "gas", l: "Gás", t: "escolha", op: ["Canalizado", "Garrafa", "Sem gás"], papel: "plano" },
    { k: "amianto", l: "Amianto", t: "escolha", op: SNS, papel: "sugestoes" },
    { k: "habitada_durante_obra", l: "Habitada durante a obra", t: "sim_nao", papel: "plano" },
    { k: "animais", l: "Animais", t: "sim_nao", papel: "sugestoes" },
    { k: "notas_interior", l: "Notas do interior", t: "texto_longo" },
  ],
};

// Diagnóstico da área (deal_needs.diag_*). As medidas ficam à parte, porque dão as quantidades.
export const AREA: Grupo = {
  titulo: "Área de intervenção",
  campos: [
    { k: "diag_tipo_area", l: "Divisão", t: "escolha", op: ["Casa de banho", "Cozinha", "Outra"], papel: "plano" },
    { k: "diag_intervencao_tipo", l: "Intervenção", t: "escolha", op: ["Remodelação total", "Remodelação parcial", "Só substituir"], papel: "plano" },
    { k: "diag_pe_direito_m", l: "Pé-direito", t: "numero", un: "m", papel: "plano" },
    { k: "diag_altura_revestimento", l: "Revestimento de parede até", t: "escolha", op: ["20 cm", "60 cm", "120 cm", "Ao teto"], papel: "plano" },
    { k: "diag_pontos_eletricos", l: "Pontos elétricos", t: "numero", papel: "plano" },
    { k: "diag_gas", l: "Gás na área", t: "escolha", op: ["Não há", "Manter", "Anular", "Instalar"], papel: "plano" },
    { k: "diag_toalheiro", l: "Toalheiro elétrico", t: "sim_nao", papel: "plano" },
    { k: "diag_janela", l: "Janela na área", t: "sim_nao", ajuda: "Sem janela, os trabalhos com pó são mais lentos.", papel: "plano" },
    { k: "diag_local_cortes", l: "Onde se fazem os cortes", t: "escolha", op: ["Na própria área", "Varanda", "Fora (garagem, rua)"], papel: "plano" },
    { k: "diag_distancia_entrada", l: "Da entrada até à área", t: "escolha", op: ["Curta (até 5 m)", "Média (5–15 m)", "Longa (+15 m)"], papel: "sugestoes" },
    { k: "diag_mobilada", l: "Casa mobilada no caminho", t: "escolha", op: ["Pouco", "Médio", "Muito"], papel: "sugestoes" },
    { k: "diag_portas_proteger", l: "Portas a proteger", t: "numero", papel: "sugestoes" },
    { k: "diag_demolir_descricao", l: "O que se demole", t: "texto_longo", ph: "Banheira, azulejo das paredes, pavimento" },
  ],
};

export const ESCOLHAS: Grupo = {
  titulo: "Escolhas do cliente",
  campos: [
    { k: "gama", l: "Gama", t: "escolha", op: ["Económica", "Média", "Alta"], papel: "orcamento" },
    { k: "materiais_cliente", l: "O cliente fornece materiais", t: "sim_nao", papel: "orcamento" },
    { k: "cor_estilo", l: "Cores e estilo", t: "texto", ph: "Branco, madeira clara" },
  ],
};

export const PROPOSTA: Grupo[] = [
  {
    titulo: "Proposta",
    campos: [
      { k: "validade", l: "Validade", t: "numero", un: "dias" },
      { k: "prazo_exec", l: "Prazo de execução", t: "numero", un: "dias úteis" },
      { k: "inicio_prev", l: "Início previsto", t: "data" },
      { k: "pagamento", l: "Condições de pagamento", t: "escolha", op: ["100% na adjudicação", "50% + 50% no fim", "30% + 40% + 30%"], papel: "fatura" },
      { k: "iva", l: "Taxa de IVA", t: "escolha", op: ["23%", "6% (reabilitação)"], papel: "fatura" },
      { k: "garantia", l: "Garantia", t: "numero", un: "anos" },
      { k: "notas_cliente", l: "Notas para o cliente", t: "texto_longo" },
    ],
  },
  {
    titulo: "Contrato",
    nota: "Gerado a partir da proposta aceite. Na venda direta não há contrato.",
    campos: [
      { k: "modelo_contrato", l: "Modelo", t: "escolha", op: ["Empreitada de remodelação", "Prestação de serviços"] },
      { k: "assinatura", l: "Assinatura", t: "escolha", op: ["Digital, no portal", "Presencial"] },
      { k: "representante", l: "Assina pela empresa", t: "texto" },
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

export function contagem(gs: Grupo[], v: Record<string, string>) {
  let n = 0, f = 0;
  for (const g of gs) for (const c of g.campos) if (visivel(c, v)) { n++; if (v[c.k]) f++; }
  return { n, f };
}
