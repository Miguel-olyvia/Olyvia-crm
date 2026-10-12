// O perfil simulado do mockup ("Simular perfil · menu filtrado por permissão"): muda que itens do menu do Inventário se veem.
// Vive num módulo (como a base do inventário) e não no Estado do protótipo. Só filtra o menu: as ações continuam a depender das regras da base.
import { useSyncExternalStore } from "react";

export type PerfilId = "admin" | "compras" | "armazem" | "consulta";
export interface Perfil { t: string; nota: string; perms: readonly string[] }

export const PERFIS: Record<PerfilId, Perfil> = {
  admin: { t: "Administrador", nota: "Vê e faz tudo.", perms: ["*"] },
  compras: { t: "Compras", nota: "Sem receção (consulta) e sem contagens.", perms: ["inventory.view", "contracts.view", "purchase_orders.view", "purchase_orders.manage", "purchase_orders.approve", "purchase_orders.view_prices", "suppliers.view", "suppliers.manage", "products.manage_prices"] },
  armazem: { t: "Fiel de armazém", nota: "Sem contratos (sem Saídas para clientes), sem preços de compra, sem aprovar.", perms: ["inventory.view", "inventory.manage", "inventory.receive", "inventory.count", "purchase_orders.view", "suppliers.view"] },
  consulta: { t: "Só consulta", nota: "Só leitura: sem preços, Receção em modo consulta.", perms: ["inventory.view", "purchase_orders.view"] },
};

let atual: PerfilId = "admin";
const ouvintes = new Set<() => void>();
export const lerPerfil = (): PerfilId => atual;
export function mudarPerfil(p: PerfilId): void { atual = p; for (const fn of ouvintes) fn(); }
export const esquecerPerfil = (): void => mudarPerfil("admin");
export function podePerfil(p: PerfilId, perm?: string): boolean { return !perm || PERFIS[p].perms.includes("*") || PERFIS[p].perms.includes(perm); }
export function usePerfil(): PerfilId {
  return useSyncExternalStore((fn) => { ouvintes.add(fn); return () => { ouvintes.delete(fn); }; }, lerPerfil, lerPerfil);
}
