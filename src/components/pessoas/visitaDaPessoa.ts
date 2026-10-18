// A visita nova de uma pessoa, em função pura: valida, decide o tipo (levantamento na primeira, revisita nas seguintes), resolve a morada
// e compõe o texto da atividade. A visita pertence à PESSOA (nunca a um pedido); o id e a ligação ao negócio dá-os o store dos registos.
import type { VisitaNegocio } from "@/components/negocio-metas/negocioMetas";
import type { VisitaPessoa } from "@/components/negocio-metas/registosTipos";
import { destinoInicial, moradaDaLead, resolverDestino, textoMoradaVisita, type DestinoVisita } from "./moradaVisita";
import type { Pessoa } from "./pessoasTipos";
import { validarVisita, type DadosAlterarVisita } from "./visitaPessoa";

/** O que se pede para marcar uma visita. */
export interface DadosVisitaPessoa {
  /** AAAA-MM-DD. */
  data: string;
  /** HH:MM; vazio = sem hora. */
  hora: string;
  nota: string;
  /** O texto da atividade, quando quem marca já o tem escrito (a chamada: "16/10 · 09:30 · morada"); senão compõe-se aqui. */
  detalhe?: string;
  /** Onde é a visita; sem isto, vale a morada da lead (se a tiver). */
  destino?: DestinoVisita;
}

/** A visita pronta a registar (sem id nem ligação ao negócio) e a linha da atividade. */
export interface VisitaPorRegistar {
  visita: Omit<VisitaPessoa, "id" | "negocioId">;
  detalhe: string;
}

/**
 * A visita que se marca, ou `null` se não se pode: dia em falta ou passado, hora ou nota inválidas, ou sem morada (a da lead, ou outra
 * com rua). `existentes` são as visitas que a pessoa já tem: as canceladas não contam para decidir o tipo.
 */
export function visitaNova(
  pessoa: Pick<Pessoa, "morada" | "comercial">, dados: DadosVisitaPessoa, existentes: readonly Pick<VisitaNegocio, "estado">[], hoje: string,
): VisitaPorRegistar | null {
  const lead = moradaDaLead(pessoa);
  const destino = dados.destino ?? destinoInicial(lead);
  if (validarVisita({ ...dados, destino }, hoje, lead)) return null;
  const onde = resolverDestino(destino, lead);
  const visita: Omit<VisitaPessoa, "id" | "negocioId"> = {
    pessoaId: "", data: dados.data, hora: dados.hora, feitoPor: pessoa.comercial, estado: "porFazer",
    tipo: existentes.some((v) => v.estado !== "cancelada") ? "revisita" : "levantamento", quemVaiEstar: "", duracao: "",
    morada: { ...onde.moradaVisita }, igualALead: onde.igualALead, nota: onde.notaAcesso ?? "",
  };
  const morada = textoMoradaVisita(onde.moradaVisita);
  const detalhe = dados.detalhe ?? [dados.hora ? `${dados.data} ${dados.hora}` : dados.data, dados.nota.trim(), morada].filter(Boolean).join(" · ");
  return { visita, detalhe };
}

/**
 * A visita com o novo dia, hora e morada (a nota de acesso passa a ser a nota da visita), ou `null` se os dados não servem. Mantém o que a
 * visita já tinha: o id, a ligação ao negócio, o resultado e o tipo. `detalhe` é a linha da atividade.
 */
export function alterarVisitaDaPessoa(
  pessoa: Pick<Pessoa, "morada">, visita: VisitaPessoa, dados: DadosAlterarVisita, hoje: string,
): { visita: VisitaPessoa; detalhe: string } | null {
  const lead = moradaDaLead(pessoa);
  if (validarVisita({ ...dados, nota: "" }, hoje, lead)) return null;
  const onde = resolverDestino(dados.destino, lead);
  const alterada: VisitaPessoa = {
    ...visita, data: dados.data, hora: dados.hora, morada: { ...onde.moradaVisita }, igualALead: onde.igualALead, nota: onde.notaAcesso ?? "",
  };
  const detalhe = [dados.hora ? `${dados.data} ${dados.hora}` : dados.data, textoMoradaVisita(onde.moradaVisita)].filter(Boolean).join(" · ");
  return { visita: alterada, detalhe };
}
