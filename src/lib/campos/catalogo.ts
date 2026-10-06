/**
 * Campos configuráveis por empresa — tipos e catálogo dos campos de SISTEMA.
 *
 * Um campo de sistema é uma coluna da base (anew_address_building,
 * deal_needs.diag_*). O motor de planeamento e as sugestões de proteções/
 * logística leem-no pelo nome da coluna: é esse o seu "papel". A empresa só
 * lhe muda o rótulo, a ajuda, os rótulos das opções, a ordem, se é
 * obrigatório, ou esconde-o. Os valores, o tipo e os limites são nossos.
 *
 * As chaves têm de ser as mesmas de fn_cfg_chaves_sistema na migração
 * 20261209100000 (o teste catalogo.test.ts compara as duas).
 *
 * Ficheiro sem dependências (sem supabase), como fichaTecnicaEdificio.ts.
 */

export type Ficha = "local" | "diagnostico" | "cliente" | "lead";
export const FICHAS: readonly Ficha[] = ["local", "diagnostico", "cliente", "lead"];

export type TipoCampo = "sim_nao" | "escolha" | "numero" | "texto" | "texto_longo" | "data";
export const TIPOS_CAMPO: readonly TipoCampo[] = ["sim_nao", "escolha", "numero", "texto", "texto_longo", "data"];

export interface Opcao {
  valor: string;
  rotulo: string;
}

export interface Condicao {
  /** Chave de outro campo (da empresa ou de sistema). */
  campo: string;
  /** Valores (como texto: "true"/"false" para sim/não) em que o campo aparece. */
  valores: string[];
}

/** Uma linha de cfg_campos (o que se grava). */
export interface LinhaCampo {
  chave: string;
  sistema: boolean;
  seccao?: string | null;
  rotulo?: string | null;
  ajuda?: string | null;
  tipo?: TipoCampo | null;
  opcoes?: Opcao[];
  minimo?: number | null;
  maximo?: number | null;
  casas_decimais?: number;
  unidade?: string | null;
  obrigatorio?: boolean;
  ativo?: boolean;
  ordem?: number;
  condicao?: Condicao | null;
}

/** Para que serve um campo de sistema (mostrado no ecrã de configuração). */
export type Papel = "planeamento" | "sugestoes" | "regras" | "registo";

/** Definição completa de um campo (sistema já com os ajustes da empresa). */
export interface DefCampo {
  chave: string;
  sistema: boolean;
  seccao: string;
  rotulo: string;
  ajuda: string | null;
  tipo: TipoCampo;
  opcoes: Opcao[];
  minimo: number | null;
  maximo: number | null;
  casas_decimais: number;
  unidade: string | null;
  obrigatorio: boolean;
  ativo: boolean;
  ordem: number;
  condicao: Condicao | null;
  /** Só nos de sistema. */
  papeis: Papel[];
}

type Base = Omit<DefCampo, "sistema" | "ativo" | "obrigatorio" | "ordem" | "condicao" | "seccao" | "ajuda" | "casas_decimais" | "unidade" | "minimo" | "maximo" | "opcoes"> &
  Partial<Pick<DefCampo, "seccao" | "ajuda" | "casas_decimais" | "unidade" | "minimo" | "maximo" | "opcoes">>;

const SIM_NAO_SABE: Opcao[] = [{ valor: "sim", rotulo: "Sim" }, { valor: "nao", rotulo: "Não" }, { valor: "nao_sei", rotulo: "Não sei" }];

/** Secções conhecidas (as da empresa usam a chave que o admin escolher). */
export const SECCOES_PADRAO: Record<Ficha, { chave: string; rotulo: string }[]> = {
  local: [
    { chave: "exterior", rotulo: "Exterior — edifício e acessos" },
    { chave: "interior", rotulo: "Interior" },
  ],
  diagnostico: [{ chave: "planeamento", rotulo: "Planeamento da obra" }],
  cliente: [{ chave: "geral", rotulo: "Campos da empresa" }],
  lead: [{ chave: "geral", rotulo: "Campos da empresa" }],
};

const LOCAL: Base[] = [
  { chave: "acesso", seccao: "exterior", tipo: "escolha", rotulo: "Acesso", papeis: ["planeamento", "sugestoes"],
    opcoes: [{ valor: "facil", rotulo: "Fácil" }, { valor: "dificil", rotulo: "Difícil" }] },
  { chave: "impacto_percent", seccao: "exterior", tipo: "numero", rotulo: "Impacto (%)", papeis: ["sugestoes", "regras"],
    minimo: 0, maximo: 100, ajuda: "Só com acesso difícil." },
  { chave: "estacionamento", seccao: "exterior", tipo: "escolha", rotulo: "Estacionamento", papeis: ["sugestoes"],
    opcoes: [{ valor: "pago", rotulo: "Pago" }, { valor: "nao_pago", rotulo: "Não pago" }, { valor: "sem_estacionamento", rotulo: "Sem estacionamento" }] },
  { chave: "zona_estacionamento", seccao: "exterior", tipo: "escolha", rotulo: "Zona de estacionamento", papeis: ["sugestoes"],
    opcoes: [{ valor: "verde", rotulo: "Verde" }, { valor: "amarela", rotulo: "Amarela" }, { valor: "vermelha", rotulo: "Vermelha" }] },
  { chave: "tem_elevador", seccao: "exterior", tipo: "sim_nao", rotulo: "Tem elevador", papeis: ["planeamento", "sugestoes"] },
  { chave: "n_elevadores", seccao: "exterior", tipo: "numero", rotulo: "Nº de elevadores", papeis: ["registo"], minimo: 1, maximo: 50 },
  { chave: "n_andares", seccao: "exterior", tipo: "numero", rotulo: "Nº de andares", papeis: ["regras"], minimo: 0, maximo: 200 },
  { chave: "n_fracoes_por_andar", seccao: "exterior", tipo: "numero", rotulo: "Frações por andar", papeis: ["registo"], minimo: 0, maximo: 200 },
  { chave: "tipologia", seccao: "interior", tipo: "escolha", rotulo: "Tipologia", papeis: ["registo"],
    opcoes: ["T0", "T1", "T2", "T3", "T4", "T5+"].map((t) => ({ valor: t, rotulo: t })) },
  { chave: "area_util_m2", seccao: "interior", tipo: "numero", rotulo: "Área útil", papeis: ["registo"],
    minimo: 0, maximo: 10000, casas_decimais: 2, unidade: "m²" },
  { chave: "n_divisoes", seccao: "interior", tipo: "numero", rotulo: "Divisões", papeis: ["registo"], minimo: 0, maximo: 100 },
  { chave: "n_casas_banho", seccao: "interior", tipo: "numero", rotulo: "Casas de banho", papeis: ["registo"], minimo: 0, maximo: 50 },
  { chave: "ano_construcao", seccao: "interior", tipo: "numero", rotulo: "Ano de construção", papeis: ["registo"], minimo: 1800 },
  { chave: "pavimento", seccao: "interior", tipo: "escolha", rotulo: "Pavimento", papeis: ["sugestoes"],
    opcoes: [{ valor: "ceramico", rotulo: "Cerâmico" }, { valor: "madeira", rotulo: "Madeira" }, { valor: "flutuante", rotulo: "Flutuante" },
      { valor: "vinilico", rotulo: "Vinílico" }, { valor: "outro", rotulo: "Outro" }] },
  { chave: "eletrica", seccao: "interior", tipo: "escolha", rotulo: "Instalação elétrica", papeis: ["registo"],
    opcoes: [{ valor: "antiga", rotulo: "Antiga" }, { valor: "renovada", rotulo: "Renovada" }] },
  { chave: "quadro_diferencial", seccao: "interior", tipo: "sim_nao", rotulo: "Quadro com diferencial", papeis: ["registo"] },
  { chave: "canalizacao", seccao: "interior", tipo: "escolha", rotulo: "Canalização", papeis: ["registo"],
    opcoes: [{ valor: "ferro", rotulo: "Ferro" }, { valor: "pvc", rotulo: "PVC" }, { valor: "multicamada", rotulo: "Multicamada" },
      { valor: "cobre", rotulo: "Cobre" }, { valor: "misto", rotulo: "Misto" }, { valor: "nao_sei", rotulo: "Não sei" }] },
  { chave: "gas", seccao: "interior", tipo: "escolha", rotulo: "Gás", papeis: ["planeamento"],
    opcoes: [{ valor: "canalizado", rotulo: "Canalizado" }, { valor: "garrafa", rotulo: "Garrafa" }, { valor: "sem", rotulo: "Sem gás" }] },
  { chave: "amianto", seccao: "interior", tipo: "escolha", rotulo: "Amianto", papeis: ["sugestoes"], opcoes: SIM_NAO_SABE },
  { chave: "habitada_durante_obra", seccao: "interior", tipo: "sim_nao", rotulo: "Habitada durante a obra", papeis: ["planeamento", "sugestoes"] },
  { chave: "animais", seccao: "interior", tipo: "sim_nao", rotulo: "Animais", papeis: ["planeamento", "sugestoes"] },
  { chave: "notas_interior", seccao: "interior", tipo: "texto_longo", rotulo: "Notas do interior", papeis: ["registo"] },
];

const DIAGNOSTICO: Base[] = [
  { chave: "diag_tipo_area", tipo: "escolha", rotulo: "Divisão", papeis: ["planeamento", "sugestoes"],
    opcoes: [{ valor: "casa_banho", rotulo: "Casa de banho" }, { valor: "cozinha", rotulo: "Cozinha" }, { valor: "outro", rotulo: "Outra" }] },
  { chave: "diag_m2_pavimento", tipo: "numero", rotulo: "Pavimento", unidade: "m²", minimo: 0.1, maximo: 10000, casas_decimais: 2, papeis: ["planeamento"] },
  { chave: "diag_perimetro_m", tipo: "numero", rotulo: "Perímetro das paredes", unidade: "m", minimo: 0.1, maximo: 10000, casas_decimais: 2,
    ajuda: "Com a altura do revestimento, dá os m² de parede.", papeis: ["planeamento"] },
  { chave: "diag_pe_direito_m", tipo: "numero", rotulo: "Pé-direito", unidade: "m", minimo: 1.5, maximo: 10, casas_decimais: 2, papeis: ["planeamento"] },
  { chave: "diag_altura_revestimento", tipo: "escolha", rotulo: "Revestimento de parede até", papeis: ["planeamento"],
    opcoes: [{ valor: "20cm", rotulo: "20 cm" }, { valor: "60cm", rotulo: "60 cm" }, { valor: "120cm", rotulo: "120 cm" }, { valor: "teto", rotulo: "Ao teto" }] },
  { chave: "diag_pontos_agua", tipo: "numero", rotulo: "Pontos de água", minimo: 0, maximo: 50, papeis: ["planeamento"] },
  { chave: "diag_pontos_eletricos", tipo: "numero", rotulo: "Pontos elétricos", minimo: 0, maximo: 200, papeis: ["planeamento"] },
  { chave: "diag_gas", tipo: "escolha", rotulo: "Gás", papeis: ["planeamento"],
    opcoes: [{ valor: "sem", rotulo: "Não há" }, { valor: "manter", rotulo: "Manter" }, { valor: "anular", rotulo: "Anular" }, { valor: "instalar", rotulo: "Instalar" }] },
  { chave: "diag_toalheiro", tipo: "sim_nao", rotulo: "Toalheiro elétrico", papeis: ["planeamento"] },
  { chave: "diag_janela", tipo: "sim_nao", rotulo: "Janela na área", ajuda: "Trabalhos com pó: sem janela é mais lento.", papeis: ["planeamento"] },
  { chave: "diag_local_cortes", tipo: "escolha", rotulo: "Onde se fazem os cortes", papeis: ["planeamento", "sugestoes"],
    opcoes: [{ valor: "na_area", rotulo: "Na própria área" }, { valor: "varanda", rotulo: "Varanda" }, { valor: "fora", rotulo: "Fora (garagem, rua)" }] },
  { chave: "diag_distancia_entrada", tipo: "escolha", rotulo: "Da entrada da casa até à área", papeis: ["planeamento", "sugestoes"],
    opcoes: [{ valor: "curta", rotulo: "Curta (até 5 m)" }, { valor: "media", rotulo: "Média (5–15 m)" }, { valor: "longa", rotulo: "Longa (mais de 15 m)" }] },
  { chave: "diag_mobilada", tipo: "escolha", rotulo: "Casa mobilada no caminho", papeis: ["planeamento", "sugestoes"],
    opcoes: [{ valor: "pouco", rotulo: "Pouco" }, { valor: "medio", rotulo: "Médio" }, { valor: "muito", rotulo: "Muito" }] },
  { chave: "diag_portas_proteger", tipo: "numero", rotulo: "Portas a proteger", minimo: 0, maximo: 50, papeis: ["sugestoes"] },
  { chave: "diag_cliente_recusou_fotos", tipo: "sim_nao", rotulo: "O cliente não quis fotografias", papeis: ["registo"] },
];

const completar = (b: Base, i: number, seccaoPadrao: string): DefCampo => ({
  ajuda: null,
  casas_decimais: 0,
  unidade: null,
  minimo: null,
  maximo: null,
  opcoes: [],
  ...b,
  seccao: b.seccao || seccaoPadrao,
  sistema: true,
  ativo: true,
  obrigatorio: false,
  ordem: i,
  condicao: null,
});

/** Campos de sistema de cada ficha, pela ordem de sempre. */
export const CATALOGO_SISTEMA: Record<Ficha, readonly DefCampo[]> = {
  local: LOCAL.map((b, i) => completar(b, i, "exterior")),
  diagnostico: DIAGNOSTICO.map((b, i) => completar(b, i, "planeamento")),
  cliente: [],
  lead: [],
};

/** Chaves que um campo da empresa não pode usar (= fn_cfg_chaves_reservadas). */
export const CHAVES_RESERVADAS: Record<Ficha, readonly string[]> = {
  local: [...LOCAL.map((b) => b.chave), "piso", "andar_texto", "address_id", "mobilada", "distancia_entrada", "toalheiro"],
  diagnostico: [...DIAGNOSTICO.map((b) => b.chave), "diag_area_m2", "diag_demolir_descricao", "diag_demolir_m2",
    "diag_proteger_descricao", "diag_intervencao_tipo", "diag_intervencao_descricao", "diag_extra"],
  cliente: ["vip"],
  lead: ["name", "email", "phone", "nif", "notes"],
};

export const ROTULO_PAPEL: Record<Papel, string> = {
  planeamento: "Usado no planeamento",
  sugestoes: "Usado nas sugestões de proteção e logística",
  regras: "Entra nas regras de validação",
  registo: "Só registo",
};

export const ROTULO_TIPO: Record<TipoCampo, string> = {
  sim_nao: "Sim / não",
  escolha: "Escolha",
  numero: "Número",
  texto: "Texto curto",
  texto_longo: "Texto longo",
  data: "Data",
};

export const ROTULO_FICHA: Record<Ficha, string> = {
  local: "Ficha do local",
  diagnostico: "Diagnóstico",
  cliente: "Cliente",
  lead: "Lead",
};

export const CHAVE_VALIDA = /^[a-z][a-z0-9_]{0,39}$/;
export const VALOR_OPCAO_VALIDO = /^[a-z0-9][a-z0-9_+-]{0,39}$/;

/** "Horário de acesso" → "horario_acesso". */
export const chaveDeRotulo = (rotulo: string): string => {
  const base = rotulo
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return /^[a-z]/.test(base) ? base : `c_${base}`.slice(0, 40);
};

/** Valor de opção a partir do rótulo ("Manhã" → "manha"). */
export const valorDeRotulo = (rotulo: string): string =>
  rotulo.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9+-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "opcao";
