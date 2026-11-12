// 12/11: quando o passo «O que o cliente quer» (CONTACTO[1]) do Contacto está feito. O grupo só tem textos longos (opcionais), por isso a
// contagem dos campos dava {n:0,f:0} e o passo nunca ficava feito. Fica feito quando o tipo de serviço foi confirmado na chamada
// (ServicoDaChamada: servico_validado = "Sim") E há pelo menos um serviço do Catálogo escolhido (servicos_pedidos, só os que existem).
// Se a empresa tornar algum campo do grupo obrigatório (editor de campos), esse também tem de estar preenchido.
import { servicosPedidos, type Estado, type Negocio } from "./motor";

export const servicoConfirmadoNaChamada = (d: Pick<Negocio, "f">): boolean => d.f.servico_validado === "Sim";

export function oQueQuerFeito(d: Negocio, S: Pick<Estado, "svc">, conta?: { f: number; n: number }): boolean {
  return servicoConfirmadoNaChamada(d) && servicosPedidos(d, S).length > 0 && (!conta || conta.f >= conta.n);
}
