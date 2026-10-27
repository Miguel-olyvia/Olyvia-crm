/**
 * Tipos da página «Organização» do RH de exemplo: a estrutura legal e física (grupo, empresas, filiais, centros) e as
 * duas ligações independentes de cada pessoa: o VÍNCULO LEGAL (empresa e filial) e o LOCAL DE TRABALHO (centro).
 * Tudo em memória; nada aqui fala com a base.
 */
export type TipoNo = "grupo" | "empresa" | "filial" | "centro";

export interface GrupoOrg {
  id: string;
  nome: string;
  nif: string;
  morada: string;
  responsavel: string;
}

export interface EmpresaOrg {
  id: string;
  nome: string;
  nif: string;
  /** Morada fiscal da entidade legal. */
  morada: string;
  responsavel: string;
}

export interface FilialOrg {
  id: string;
  empresaId: string;
  nome: string;
  morada: string;
  responsavel: string;
}

export interface CentroOrg {
  id: string;
  filialId: string;
  nome: string;
  morada: string;
  responsavel: string;
}

export interface EstruturaOrg {
  grupo: GrupoOrg;
  empresas: EmpresaOrg[];
  filiais: FilialOrg[];
  centros: CentroOrg[];
}

/** Para onde uma pessoa está ligada: o vínculo legal (empresa e filial) e o centro onde trabalha. */
export interface DestinoLigacao {
  empresaId: string;
  filialId: string;
  centroId: string;
}

export interface Ligacao extends DestinoLigacao {
  pessoaId: string;
  /** Início da ligação (AAAA-MM-DD). */
  desde: string;
}

export type TipoEvento = "ligar" | "alterar" | "desligar";

export interface EventoLigacao {
  id: string;
  pessoaId: string;
  data: string;
  tipo: TipoEvento;
  de: DestinoLigacao | null;
  para: DestinoLigacao | null;
  motivo: string;
}

export interface EstadoOrganizacao {
  ligacoes: Ligacao[];
  historico: EventoLigacao[];
}

export interface PessoaOrg {
  id: string;
  nome: string;
  cargo: string | null;
  /** A quem reporta («chefia»), quando alguém lhe está atribuído. */
  reportaAId: string | null;
}

/** Um nó da estrutura (grupo, empresa, filial, centro). */
export interface NoOrg {
  id: string;
  tipo: TipoNo;
  nome: string;
  filhos: NoArvore[];
  /** Pessoas com vínculo legal neste nó (0 nos centros, que não são entidades legais). */
  legais: number;
  /** Pessoas que trabalham neste centro; `null` nos nós que não são centros. */
  locais: number | null;
}

/** A linha «Sem centro atribuído»: quem tem vínculo legal numa filial ou empresa mas ainda não tem centro. Sem nome próprio (o texto é traduzido no ecrã). */
export interface NoSemCentro {
  id: string;
  tipo: "semCentro";
  nome: "";
  filhos: NoArvore[];
  /** Quantas pessoas tem (contando as que estão por baixo de uma chefia). */
  total: number;
}

/** Uma pessoa, como folha da árvore, debaixo do centro onde trabalha; os subordinados do mesmo centro ficam por baixo da chefia. */
export interface NoPessoa {
  id: string;
  tipo: "pessoa";
  pessoaId: string;
  nome: string;
  cargo: string | null;
  /** Tem equipa: alguém reporta a esta pessoa. */
  chefia: boolean;
  reportaAId: string | null;
  /** O nome de quem a pessoa reporta, quando se conhece. */
  reportaA: string | null;
  /** O nome da filial do vínculo legal, só quando difere da filial do centro onde trabalha. */
  vinculo: string | null;
  filhos: NoArvore[];
}

export type NoArvore = NoOrg | NoSemCentro | NoPessoa;

export type ErroLigacao =
  | "pessoaEmFalta"
  | "empresaInvalida"
  | "filialInvalida"
  | "filialForaDaEmpresa"
  | "centroInexistente"
  | "dataInvalida"
  | "jaLigada"
  | "naoLigada"
  | "motivoCurto"
  | "inicioNaoPosterior"
  | "falhaBase";

export type Resultado = { ok: true; estado: EstadoOrganizacao } | { ok: false; erro: ErroLigacao };

/** O resultado de uma gravacao na base: `mensagem` e a recusa ja traduzida pela base, quando a ha. */
export type ResultadoGravacao =
  | { ok: true; tipo: TipoEvento }
  | { ok: false; erro: ErroLigacao; mensagem?: string | null };

export interface PedidoLigacao {
  pessoaId: string;
  empresaId: string;
  filialId: string;
  /** `null` = «mesmo centro da filial». */
  centroId: string | null;
  desde: string;
  motivo: string;
}

/** Tamanho mínimo do motivo de um «Desligar». */
export const MOTIVO_MINIMO = 3;
