// A morada onde a visita do negócio vai por omissão, e de onde vem. Funções puras (sem rede nem relógio).
// A visita é na OBRA. Só quando o negócio ainda não tem nenhuma morada de obra é que vale a morada do CLIENTE (a da ficha da entidade,
// d.moradaLead, que o passo «Quem pede» pode editar); nunca se troca uma obra já escrita pela casa do cliente.
import { moradaDoTexto, type Negocio } from "@/emylia/motor";
import type { MoradaVisita } from "../pessoasTipos";

export type OrigemMoradaVisita = "obra" | "cliente";

export interface MoradaPorOmissao {
  morada: MoradaVisita | null;
  origem: OrigemMoradaVisita;
}

const t = (v: string | null | undefined): string => (v ?? "").trim();

/** Os rótulos da opção «igual à morada por omissão» (nunca «lead»). */
export const ROTULO_MORADA: Record<OrigemMoradaVisita, string> = { obra: "Na morada da obra", cliente: "Na morada do cliente" };

/**
 * Por esta ordem:
 * 1. a morada da obra do negócio (d.f.morada, d.f.cp, d.f.localidade; sem rua, o que o pedido escreveu em d.local) se algum destes está preenchido;
 * 2. o que o pedido escreveu em d.local, se traz um código postal (é a obra, como o cliente a indicou);
 * 3. a morada do cliente (d.moradaLead, da ficha da entidade): a obra ainda não tem morada;
 * 4. o texto de d.local sem código postal (como antes: só a rua, sem verificação de viagem).
 * Sem nada: null.
 */
export function moradaPorOmissaoDaVisita(d: Negocio): MoradaPorOmissao {
  const rua = t(d.f.morada), cp = t(d.f.cp), localidade = t(d.f.localidade), local = t(d.local);
  if (rua || cp || localidade) return { morada: { rua: rua || local, codigoPostal: cp, localidade, andar: "" }, origem: "obra" };
  const doPedido = moradaDoTexto(local);
  if (doPedido) return { morada: { rua: doPedido.morada, codigoPostal: doPedido.cp, localidade: doPedido.localidade, andar: doPedido.fracao }, origem: "obra" };
  const cliente = d.moradaLead?.de === "ficha" ? d.moradaLead : null;
  if (cliente && (t(cliente.morada) || t(cliente.cp) || t(cliente.localidade))) {
    return { morada: { rua: t(cliente.morada), codigoPostal: t(cliente.cp), localidade: t(cliente.localidade), andar: t(cliente.fracao) }, origem: "cliente" };
  }
  return { morada: local ? { rua: local, codigoPostal: "", localidade: "", andar: "" } : null, origem: "obra" };
}
