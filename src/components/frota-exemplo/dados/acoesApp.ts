// Ações e utilitários só da Frota de exemplo da app real (as regras partilhadas estão em prototipo-negocios/frota/acoes.ts).
// - Pedir reposição: no protótipo cria pedidos de transferência no Inventário do protótipo; na app real, sem tabelas
//   fleet_* nem ligação ao Inventário real, fica registado no exemplo da Frota (F.pedidos), com estado "pedido".
// - Semanas do calendário: a segunda-feira de uma data e o deslocamento em semanas desde a semana de HOJE, para as
//   ligações "Ver no calendário" abrirem a semana certa.
import { HOJE, abaixoMin, addDias, d2n, falhar, fData, registar, uid, viatura, type Frota } from "./index";
import { stockCarrinhaExemplo } from "./exemplo";

/** A segunda-feira da semana de `d`. */
export function segundaFeira(d: string): string {
  const w = new Date(d + "T00:00:00Z").getUTCDay();
  return addDias(d, -((w + 6) % 7));
}
/** Quantas semanas vai `d` à frente (ou atrás) da semana de HOJE (0 = esta semana). */
export const semanaDe = (d: string): number => Math.round((d2n(segundaFeira(d)) - d2n(segundaFeira(HOJE))) / 7);
/** A ligação para o calendário das Atribuições na semana de `d`. */
export const linkCalendario = (d: string): string => {
  const s = semanaDe(d);
  return s ? `/frota/atribuicoes?semana=${s}` : "/frota/atribuicoes";
};

/** Os pedidos pendentes de uma carrinha. */
export const pedidosDaCarrinha = (F: Frota, vid: string) => (F.pedidos ?? []).filter((p) => p.vid === vid && p.estado === "pedido");

/**
 * "Pedir reposição ao armazém central": um pedido por artigo abaixo do mínimo, para o que falta até ao mínimo. Os
 * artigos que já têm pedido pendente não se repetem. Fica registado no exemplo; não cria transferências reais.
 */
export function pedirReposicaoExemplo(F: Frota, vid: string): string {
  const v = viatura(F, vid) ?? falhar("Viatura desconhecida.");
  if (!v.armazem) falhar(`A ${v.mat} não é um armazém móvel.`);
  const baixo = abaixoMin(stockCarrinhaExemplo(v));
  if (!baixo.length) falhar("Nenhum artigo da carrinha está abaixo do mínimo.");
  const pend = pedidosDaCarrinha(F, vid);
  const novos = baixo.filter((l) => !pend.some((p) => p.sku === l.sku));
  if (!novos.length) falhar("Já há pedidos de reposição pendentes para todos os artigos em falta.");
  const at = new Date().toISOString();
  F.pedidos = [...(F.pedidos ?? []), ...novos.map((l) => ({ id: uid("r"), vid, sku: l.sku, nome: l.nome, qty: l.min - l.qty, un: l.un, at, estado: "pedido" as const }))];
  return registar(F, "Pedido de reposição", vid,
    `Pedido de reposição registado no exemplo: armazém central → carrinha ${v.mat} (${novos.length} artigo${novos.length > 1 ? "s" : ""}).`,
    novos.map((l) => `${l.sku} × ${l.min - l.qty} ${l.un}`).join(", ") + ` · ${fData(HOJE)}`);
}
