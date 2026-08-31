import {
  ORIGENS,
  PRIORIDADES,
  ROTULO_ORIGEM,
  ROTULO_PRIORIDADE,
  ROTULO_TIPO_TAREFA,
  TIPOS_TAREFA,
} from "./tipos";

/**
 * O nome que cada empresa dá às listas fixas.
 *
 * O módulo nasceu com o vocabulário de uma empresa de manutenção de
 * edifícios. Uma empresa de limpezas não faz "proação"; uma construtora não
 * tem "criticidade crítica", tem "para a obra"; uma frota de camiões não tem
 * "pisos".
 *
 * ⚠ Renomeia-se, não se inventa. O código por baixo — `alta`, `proacao`,
 * `edificio` — é o motor: ordena a lista de trabalho, escolhe o ícone,
 * desenha a árvore. A empresa muda o nome, a ordem, e esconde o que não usa.
 * A base recusa um valor que não conheça (`db/listas-configuraveis.sql`).
 *
 * Este ficheiro é a metade pura: pega no que veio da base e no que está
 * escrito no código, e devolve a lista final. Sem base de dados, para se
 * poder testar.
 */

export const LISTAS = [
  "prioridade",
  "criticidade",
  "tipo_tarefa",
  "tipo_local",
  "origem",
] as const;
export type Lista = (typeof LISTAS)[number];

/** Uma linha da tabela `ops_rotulo`. */
export interface RotuloGravado {
  lista: string;
  valor: string;
  nome: string;
  ordem: number;
  ativo: boolean;
}

/** Uma opção pronta a pôr numa caixa de escolha. */
export interface Opcao {
  valor: string;
  nome: string;
  ativo: boolean;
}

/* As criticidades e os tipos de local não tinham rótulos em `tipos.ts` —
   viviam espalhados pelos ecrãs. Ficam aqui, com os outros. */
const CRITICIDADES = ["baixa", "normal", "alta", "critica"] as const;
const TIPOS_LOCAL = ["morada", "edificio", "piso", "espaco"] as const;

const ROTULO_CRITICIDADE: Record<string, string> = {
  baixa: "Baixa",
  normal: "Normal",
  alta: "Alta",
  critica: "Crítica",
};

const ROTULO_TIPO_LOCAL: Record<string, string> = {
  morada: "Morada",
  edificio: "Edifício",
  piso: "Piso",
  espaco: "Espaço",
};

/** O que o código traz de origem, por lista e por ordem. */
export const DE_ORIGEM: Record<Lista, readonly Opcao[]> = {
  prioridade: PRIORIDADES.map((v) => ({ valor: v, nome: ROTULO_PRIORIDADE[v], ativo: true })),
  criticidade: CRITICIDADES.map((v) => ({ valor: v, nome: ROTULO_CRITICIDADE[v], ativo: true })),
  tipo_tarefa: TIPOS_TAREFA.map((v) => ({ valor: v, nome: ROTULO_TIPO_TAREFA[v], ativo: true })),
  tipo_local: TIPOS_LOCAL.map((v) => ({ valor: v, nome: ROTULO_TIPO_LOCAL[v], ativo: true })),
  origem: ORIGENS.map((v) => ({ valor: v, nome: ROTULO_ORIGEM[v], ativo: true })),
};

/** Como se chama esta lista, para quem a está a configurar. */
export const NOME_DA_LISTA: Record<Lista, string> = {
  prioridade: "Prioridade da ordem",
  criticidade: "Criticidade do equipamento",
  tipo_tarefa: "Natureza da tarefa",
  tipo_local: "Nível do local",
  origem: "Origem da ordem",
};

/** Para que serve, em linguagem de quem decide. */
export const PARA_QUE_SERVE: Record<Lista, string> = {
  prioridade: "Ordena a lista de trabalho. O que está em cima é o que se faz primeiro.",
  criticidade: "Diz que equipamentos não podem parar. Sobe as ordens deles na lista.",
  tipo_tarefa: "O que se está a fazer — não o formato da resposta.",
  tipo_local: "Os degraus da árvore de sítios, do mais largo ao mais estreito.",
  origem: "De onde veio o trabalho. Escolhe o ícone e o caminho que a ordem segue.",
};

/**
 * A lista final: o que o código traz, com o que a empresa mudou por cima.
 *
 * Um valor sem linha na base fica como está no código — é o que faz uma
 * empresa que nunca abriu as Definições ver tudo a funcionar.
 */
export function opcoesDaLista(
  lista: Lista,
  gravados: readonly RotuloGravado[]
): Opcao[] {
  const meus = new Map(
    gravados.filter((r) => r.lista === lista).map((r) => [r.valor, r])
  );

  return DE_ORIGEM[lista]
    .map((o, i) => {
      const meu = meus.get(o.valor);
      return {
        valor: o.valor,
        // Um nome gravado em branco não devia existir (a base recusa-o), mas
        // se existir vale mais o nome de origem do que uma caixa vazia.
        nome: meu?.nome.trim() ? meu.nome.trim() : o.nome,
        ativo: meu ? meu.ativo : true,
        ordem: meu ? meu.ordem : i,
        posicao: i,
      };
    })
    .sort((a, b) => a.ordem - b.ordem || a.posicao - b.posicao)
    .map(({ valor, nome, ativo }) => ({ valor, nome, ativo }));
}

/** Só o que se mostra numa caixa de escolha para trabalho novo. */
export function opcoesAtivas(lista: Lista, gravados: readonly RotuloGravado[]): Opcao[] {
  return opcoesDaLista(lista, gravados).filter((o) => o.ativo);
}

/**
 * O nome de um valor.
 *
 * Escondido continua a ter nome: uma ordem de há dois anos com prioridade
 * "urgente" mostra "urgente", mesmo que a empresa já não use essa opção.
 * Reescrever o passado para arrumar o presente perde o histórico.
 */
export function nomeDe(
  lista: Lista,
  valor: string | null | undefined,
  gravados: readonly RotuloGravado[]
): string {
  if (!valor) return "—";
  const o = opcoesDaLista(lista, gravados).find((x) => x.valor === valor);
  return o ? o.nome : valor;
}

/**
 * Se esconder este valor deixa a lista vazia.
 *
 * A base também recusa — mas o botão tem de estar desligado antes de se
 * carregar nele, e não a dar erro depois.
 */
export function ficaSemNenhuma(
  lista: Lista,
  valor: string,
  gravados: readonly RotuloGravado[]
): boolean {
  return opcoesDaLista(lista, gravados).filter((o) => o.ativo && o.valor !== valor).length === 0;
}
