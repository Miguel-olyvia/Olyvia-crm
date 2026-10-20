// Tipos da «Nova lead» de Pessoas: o que se escreve, o que a base devolve da procura de duplicados e o que a regra decide.

/** Os três identificadores fortes: na mesma organização, qualquer um que coincida bloqueia. */
export type CampoForte = "email" | "telefone" | "nif";

/** O que a pessoa escreveu no formulário e que serve para procurar duplicados (já aparado; vazio é null). */
export interface Escrito {
  nome: string;
  email: string | null;
  telefone: string | null;
  /** O NIF escrito (só para mostrar ao próprio e calcular o hash no servidor; nunca se grava neste fluxo). */
  nif: string | null;
}

/** Uma linha de neg_procurar_duplicados, já em camelCase: uma por pessoa e campo que coincide. */
export interface LinhaDuplicado {
  /** O número da pessoa nesta resposta (só agrupa linhas; null nas linhas do grupo). */
  pessoa: number | null;
  campo: CampoForte;
  ambito: "organizacao" | "grupo";
  /** Só vem quando quem procura vê uma lead ou um cliente vivo da pessoa no seu âmbito. */
  entityId: string | null;
  nome: string | null;
  visivel: boolean | null;
  organizacaoId: string | null;
  organizacaoNome: string | null;
}

/** Uma lead da pessoa encontrada (as de estado vivo e as perdidas, rejeitadas ou convertidas, todas as que a pessoa vê). */
export interface LeadConhecida {
  id: string;
  /** `anew_leads.status` tal como está na base (new, contacted, lost, rejected, converted, cancelled...). */
  estado: string;
  /** Verdadeiro quando a abordagem está encerrada (`closure_result` preenchido). */
  encerrada: boolean;
  motivoEncerramento: string | null;
  criadaEm: string | null;
  atribuidoA: string | null;
}

/** Uma pessoa desta organização que coincide com o que se escreveu, com o que se leu dela com a sessão de quem cria. */
export interface PessoaEncontrada {
  /** Nulo quando a RLS a esconde (caso 18). */
  entityId: string | null;
  nome: string | null;
  visivel: boolean;
  campos: CampoForte[];
  emailPrincipal: string | null;
  /** Todos os emails da pessoa (o escrito pode coincidir com um secundário). */
  emails: string[];
  telefonePrincipal: string | null;
  telefones: string[];
  leads: LeadConhecida[];
  /** Existe um cliente vivo (de qualquer estado). */
  temCliente: boolean;
  /** Cliente que não está `inactive`: «Já é cliente». */
  clienteAtivo: boolean;
  criadaEm: string | null;
}

/** Outra empresa do grupo onde existe uma pessoa com estes dados: só informação (nunca id nem nome da pessoa). */
export interface OutraEmpresa {
  organizacaoId: string | null;
  nome: string;
  campos: CampoForte[];
}

/** O resultado da procura, pronto para a regra. */
export interface ResultadoDuplicados {
  pessoas: PessoaEncontrada[];
  grupo: OutraEmpresa[];
}

export type EstadoLinha = "igual" | "diferente" | "coincide" | "naoIndicado";

/** Uma linha da tabela lado a lado (Campo, O que escreveu, Na ficha existente). */
export interface LinhaLadoALado {
  campo: "nome" | "email" | "telefone" | "nif";
  escrito: string | null;
  existente: string | null;
  estado: EstadoLinha;
}

/** O que «Atualizar dados» faz, por ordem: confirmar, substituir contactos, juntar à lead, reabrir. */
export interface PlanoAtualizar {
  leadId: string;
  /** A lead está `lost` ou `rejected`: volta a `new`. */
  reabrirLead: boolean;
  /** A abordagem está encerrada: `neg_reabrir_abordagem` com esta lead. */
  reabrirAbordagem: boolean;
  email: { antigo: string | null; novo: string } | null;
  telefone: { antigo: string | null; novo: string } | null;
}

export interface PessoaBloqueio {
  entityId: string;
  nome: string;
  papel: "lead" | "cliente" | null;
  jaECliente: boolean;
  estado: string | null;
  encerrada: boolean;
  motivoEncerramento: string | null;
  atribuidoA: string | null;
  criadaEm: string | null;
  campos: CampoForte[];
  ladoALado: LinhaLadoALado[];
  /** «Abrir existente»: só quando a ficha de Pessoas abre a pessoa (tem lead ou cliente). */
  podeAbrir: boolean;
  /** «Atualizar dados»: só com uma pessoa, que tem uma lead que se possa atualizar e não é cliente ativo. */
  atualizar: PlanoAtualizar | null;
}

export type DecisaoDuplicados =
  | { tipo: "criar"; grupo: OutraEmpresa[] }
  | { tipo: "bloquear"; pessoas: PessoaBloqueio[]; semAcesso: boolean; grupo: OutraEmpresa[] };
