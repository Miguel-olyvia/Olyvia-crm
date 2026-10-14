// Os perfis simulados da Frota (PERFIS e pode() do protótipo HTML): a gestora de frota faz tudo, o técnico (João Silva, p1) só regista km,
// abastecimentos, ocorrências e reposição de stock da sua viatura, e o financeiro só despesas, importações e renovações.
// Vive num módulo (como perfil.ts do Inventário), fora do Estado do protótipo.
import { useSyncExternalStore } from "react";

export type PerfilFrota = "gestor" | "tecnico" | "financeiro";
export type AcaoFrota = "atribuir" | "km" | "abastecer" | "despesa" | "importar" | "manut" | "estado" | "ocorrencia" | "identificar" | "renovar" | "nova" | "stock";

export const PERFIS_FROTA: Record<PerfilFrota, string> = { gestor: "Gestora de frota · Sofia Martins", tecnico: "Técnico · João Silva", financeiro: "Financeiro" };
/** A pessoa do perfil Técnico (só vê a sua viatura). */
export const PESSOA_TECNICO = "p1";

let atual: PerfilFrota = "gestor";
const ouvintes = new Set<() => void>();
export const lerPerfilFrota = (): PerfilFrota => atual;
export function mudarPerfilFrota(p: PerfilFrota): void { atual = p; for (const fn of ouvintes) fn(); }
export const esquecerPerfilFrota = (): void => mudarPerfilFrota("gestor");
export function usePerfilFrota(): PerfilFrota {
  return useSyncExternalStore((fn) => { ouvintes.add(fn); return () => { ouvintes.delete(fn); }; }, lerPerfilFrota, lerPerfilFrota);
}

export function pode(p: PerfilFrota, acao: AcaoFrota): boolean {
  if (p === "gestor") return true;
  if (p === "financeiro") return ["despesa", "importar", "renovar"].includes(acao);
  return ["km", "abastecer", "ocorrencia", "stock"].includes(acao);
}
export const porqueNao = (p: PerfilFrota): string =>
  p === "tecnico" ? "Como técnico, só registas km, abastecimentos e ocorrências da tua viatura." : "O perfil Financeiro não atribui viaturas nem muda estados.";
