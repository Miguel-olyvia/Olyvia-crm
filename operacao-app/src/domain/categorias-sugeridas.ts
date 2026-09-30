/**
 * Um catálogo de arranque para as categorias de equipamento.
 *
 * O problema que isto resolve, dito por quem estava a montar a operação:
 * "faltam muitas categorias, só tenho duas". E tinha razão — a lista começa
 * vazia, e cada categoria era um formulário. Quem está a montar uma operação
 * a sério tem trinta para meter, não duas.
 *
 * ⚠ Isto **não** é uma lista fechada. É uma sugestão: escolhe-se o que serve,
 * ignora-se o resto, e continua a poder-se criar do zero. Uma empresa de
 * limpezas não quer elevadores, e não tem de os ver mais do que uma vez.
 *
 * Os códigos são curtos porque aparecem no código do equipamento
 * (`EXT-0007`) e são lidos em voz alta ao telefone.
 */

export interface CategoriaSugerida {
  codigo: string;
  nome: string;
}

export interface FamiliaDeCategorias {
  /** O nome do ofício, para quem está a escolher. */
  familia: string;
  /** Uma linha a dizer a quem serve. */
  paraQuem: string;
  categorias: readonly CategoriaSugerida[];
}

export const SUGESTOES: readonly FamiliaDeCategorias[] = [
  {
    familia: "Segurança contra incêndio",
    paraQuem: "Quem faz manutenção obrigatória e tem de provar datas.",
    categorias: [
      { codigo: "EXT", nome: "Extintores" },
      { codigo: "BIA", nome: "Bocas de incêndio" },
      { codigo: "SADI", nome: "Deteção de incêndio" },
      { codigo: "SPRK", nome: "Sprinklers" },
      { codigo: "ILUM", nome: "Iluminação de emergência" },
      { codigo: "PCF", nome: "Portas corta-fogo" },
      { codigo: "DESE", nome: "Desenfumagem" },
    ],
  },
  {
    familia: "Climatização e águas",
    paraQuem: "Manutenção de edifícios e condomínios.",
    categorias: [
      { codigo: "AVAC", nome: "AVAC" },
      { codigo: "CHIL", nome: "Chillers" },
      { codigo: "SPLT", nome: "Splits e multi-splits" },
      { codigo: "VENT", nome: "Ventilação" },
      { codigo: "CALD", nome: "Caldeiras" },
      { codigo: "TERM", nome: "Termoacumuladores" },
      { codigo: "BOMB", nome: "Bombas e grupos hidropressores" },
      { codigo: "DEPO", nome: "Depósitos de água" },
    ],
  },
  {
    familia: "Eletricidade e energia",
    paraQuem: "Quem tem quadros, geradores ou postos de transformação.",
    categorias: [
      { codigo: "QE", nome: "Quadros elétricos" },
      { codigo: "PT", nome: "Postos de transformação" },
      { codigo: "GER", nome: "Geradores" },
      { codigo: "UPS", nome: "UPS" },
      { codigo: "FV", nome: "Painéis fotovoltaicos" },
      { codigo: "CARR", nome: "Carregadores elétricos" },
      { codigo: "PARA", nome: "Para-raios" },
    ],
  },
  {
    familia: "Elevação e acessos",
    paraQuem: "Edifícios com elevadores, portões ou cais.",
    categorias: [
      { codigo: "ELEV", nome: "Elevadores" },
      { codigo: "MONT", nome: "Monta-cargas" },
      { codigo: "PORT", nome: "Portões automáticos" },
      { codigo: "BARR", nome: "Barreiras e cancelas" },
      { codigo: "CAIS", nome: "Cais de carga" },
    ],
  },
  {
    familia: "Segurança e controlo",
    paraQuem: "Quem faz manutenção de sistemas de segurança.",
    categorias: [
      { codigo: "CCTV", nome: "Videovigilância" },
      { codigo: "INTR", nome: "Intrusão" },
      { codigo: "ACES", nome: "Controlo de acessos" },
      { codigo: "INTC", nome: "Intercomunicadores" },
    ],
  },
  {
    familia: "Limpeza",
    paraQuem: "Empresas de limpeza e condomínios.",
    categorias: [
      { codigo: "AREA", nome: "Áreas comuns" },
      { codigo: "WC", nome: "Instalações sanitárias" },
      { codigo: "EXTR", nome: "Espaços exteriores" },
      { codigo: "VIDR", nome: "Vidros e fachadas" },
      { codigo: "RESI", nome: "Resíduos e contentores" },
    ],
  },
  {
    familia: "Obras e remodelações",
    paraQuem: "Quem entra numa casa e tem de provar em que estado a encontrou.",
    categorias: [
      { codigo: "CANA", nome: "Canalização" },
      { codigo: "ELET", nome: "Eletricidade" },
      { codigo: "CARP", nome: "Carpintaria" },
      { codigo: "PINT", nome: "Pinturas" },
      { codigo: "ALVE", nome: "Alvenarias" },
      { codigo: "SERR", nome: "Serralharia" },
      { codigo: "COBE", nome: "Coberturas" },
    ],
  },
  {
    familia: "Espaços verdes e frota",
    paraQuem: "Jardinagem, piscinas e quem tem carrinhas para manter.",
    categorias: [
      { codigo: "REGA", nome: "Sistemas de rega" },
      { codigo: "PISC", nome: "Piscinas" },
      { codigo: "JARD", nome: "Equipamento de jardim" },
      { codigo: "VIAT", nome: "Viaturas" },
    ],
  },
];

/** Todas as sugestões numa lista só. */
export const TODAS_AS_SUGESTOES: readonly CategoriaSugerida[] = SUGESTOES.flatMap(
  (f) => f.categorias
);

/**
 * As sugestões que esta organização ainda não tem.
 *
 * Compara-se pelo código e pelo nome, os dois sem maiúsculas nem espaços à
 * volta: quem escreveu "extintor" à mão não quer ver "Extintores" oferecido
 * como se fosse coisa nova. Não é perfeito — nem tenta ser. Uma sugestão
 * repetida é um incómodo; a base recusa o código duplicado de qualquer forma.
 */
export function porUsar(
  familia: FamiliaDeCategorias,
  jaExistem: readonly { codigo: string; nome: string }[]
): CategoriaSugerida[] {
  const codigos = new Set(jaExistem.map((c) => normalizar(c.codigo)));
  const nomes = new Set(jaExistem.map((c) => normalizar(c.nome)));
  return familia.categorias.filter(
    (s) => !codigos.has(normalizar(s.codigo)) && !nomes.has(normalizar(s.nome))
  );
}

/** Quantas sugestões sobram, no catálogo todo. */
export function quantasPorUsar(
  jaExistem: readonly { codigo: string; nome: string }[]
): number {
  return SUGESTOES.reduce((n, f) => n + porUsar(f, jaExistem).length, 0);
}

function normalizar(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
