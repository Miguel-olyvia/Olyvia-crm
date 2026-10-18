// Encerrar a abordagem de uma pessoa, em memória: funções puras e imutáveis (o dia de hoje chega por parâmetro). Quando a pessoa não tem
// interesse, ou a obra é inviável, ficam o resultado e o motivo na pessoa e NÃO se cria negócio. Substitui "perder a pessoa" e
// reativa-se. Uma ação que não se aplica devolve o próprio estado.
// Motivos (decisão por defeito, reversível): a lista fixa de `MOTIVOS_PERDA` mais "Outro", com texto livre.
import { somarDias } from "@/components/negocio-metas/novoNegocio";
import { MOTIVOS_PERDA } from "./opcoesPessoa";
import type { EstadoPessoas, ItemAtividade, MotivoEncerramento, Pessoa, ResultadoEncerramento } from "./pessoasTipos";

export const RESULTADOS_ENCERRAMENTO: readonly ResultadoEncerramento[] = ["semInteresse", "obraInviavel"];
/** A lista fixa de motivos de perda e, no fim, "outro" (texto livre). */
export const MOTIVOS_ENCERRAMENTO: readonly MotivoEncerramento[] = [...MOTIVOS_PERDA, "outro"];
/** O máximo de caracteres do motivo escrito à mão. */
export const MAX_MOTIVO_OUTRO = 140;

export interface DadosEncerramento {
  resultado: ResultadoEncerramento;
  motivo: MotivoEncerramento;
  /** O texto do motivo "outro" (obrigatório, aparado, até `MAX_MOTIVO_OUTRO`); ignorado nos outros motivos. */
  motivoOutro?: string;
  /** AAAA-MM-DD. */
  hoje: string;
  /** Uma pessoa com um negócio aberto não tem abordagem a encerrar (quem chama conhece os negócios). */
  temNegocioAberto?: boolean;
}

/** O que a ficha pede para encerrar a abordagem (o dia e o negócio aberto sabe-os o estado). */
export type PedidoEncerrar = Omit<DadosEncerramento, "hoje" | "temNegocioAberto">;

type Estado = Pick<EstadoPessoas, "pessoas" | "atividade">;

/** O texto livre aparado, se o motivo é "outro" e o texto serve; `null` se o motivo é da lista; `undefined` se o texto não serve. */
function textoDoMotivo(d: Pick<DadosEncerramento, "motivo" | "motivoOutro">): string | null | undefined {
  if (d.motivo !== "outro") return null;
  const texto = (d.motivoOutro ?? "").trim();
  return texto !== "" && texto.length <= MAX_MOTIVO_OUTRO ? texto : undefined;
}

const valido = (d: DadosEncerramento): boolean =>
  RESULTADOS_ENCERRAMENTO.includes(d.resultado) && MOTIVOS_ENCERRAMENTO.includes(d.motivo) && textoDoMotivo(d) !== undefined;

/** O detalhe da linha da atividade: o texto livre, ou a chave do motivo da lista. */
const detalheDaAtividade = (motivo: MotivoEncerramento, outro: string | undefined): Pick<ItemAtividade, "detalhe" | "chaveDetalhe"> =>
  motivo === "outro" ? { detalhe: outro ?? "", chaveDetalhe: undefined } : { detalhe: "", chaveDetalhe: `pessoasPagina.lost.${motivo}` };

const novoId = (e: Estado, tipo: string): string => `novo-${tipo}-${e.atividade.length + 1}`;
const mudar = (pessoas: Pessoa[], id: string, f: (p: Pessoa) => Pessoa): Pessoa[] => pessoas.map((p) => (p.id === id ? f(p) : p));

/**
 * Encerra a abordagem: guarda `encerrada` (resultado, motivo e dia) na pessoa, tira-lhe o próximo contacto e regista a linha na atividade.
 * Não cria negócio nem pedido. Fica como está uma pessoa que não existe, já encerrada ou perdida, com negócio aberto, ou dados inválidos
 * (resultado ou motivo fora da lista, ou "outro" sem texto).
 */
export function encerrarAbordagem<E extends Estado>(estado: E, id: string, dados: DadosEncerramento): E {
  const alvo = estado.pessoas.find((p) => p.id === id);
  if (!alvo || alvo.encerrada || alvo.perdida || dados.temNegocioAberto || !valido(dados)) return estado;
  const outro = textoDoMotivo(dados) ?? undefined;
  const item: ItemAtividade = {
    id: novoId(estado, "encerrar"), pessoaId: id, tipo: "historico", titulo: "", chaveTitulo: "pessoasPagina.close.activity.closed",
    ...detalheDaAtividade(dados.motivo, outro), quando: dados.hoje, exemplo: false,
  };
  return {
    ...estado,
    pessoas: mudar(estado.pessoas, id, (p) => ({
      ...p, proximoContacto: null, proximoHora: undefined,
      encerrada: { resultado: dados.resultado, motivo: dados.motivo, ...(outro === undefined ? {} : { motivoOutro: outro }), data: dados.hoje },
    })),
    atividade: [item, ...estado.atividade],
  };
}

/** Reativa a abordagem: limpa o encerramento, repõe o próximo contacto para amanhã e regista-o na atividade. Só vale em encerradas. */
export function reativarAbordagem<E extends Estado>(estado: E, id: string, hoje: string): E {
  const alvo = estado.pessoas.find((p) => p.id === id);
  if (!alvo?.encerrada) return estado;
  const item: ItemAtividade = {
    id: novoId(estado, "reabrir"), pessoaId: id, tipo: "historico", titulo: "", chaveTitulo: "pessoasPagina.close.activity.reopened",
    ...detalheDaAtividade(alvo.encerrada.motivo, alvo.encerrada.motivoOutro), quando: hoje, exemplo: false,
  };
  return {
    ...estado,
    pessoas: mudar(estado.pessoas, id, ({ encerrada: _encerrada, ...resto }) => ({ ...resto, proximoContacto: somarDias(hoje, 1) })),
    atividade: [item, ...estado.atividade],
  };
}
