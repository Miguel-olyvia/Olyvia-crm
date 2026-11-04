// 03/11/2026: o que quem olha pode mudar no Catálogo e custos. As funções cat_* exigem a permissão na organização (fn_cat_exigir, erro
// CT001): serviços, ramos, perfis e equipamentos services.edit; estrutura e parâmetros services.manage_prices; produtos products.edit;
// PVP products.manage_prices. Sem a permissão, os controlos dessa parte ficam desligados (antes deixavam mexer e a gravação falhava).
// Sem provedor (protótipo, testes antigos) pode tudo, como antes.
import { createContext, useContext, type ReactNode } from "react";

export interface PermissoesCatalogo {
  /** services.edit: serviços (ficha, preço), ramos/categorias, perfis (salário dos técnicos) e equipamentos. */
  servicos: boolean;
  /** services.manage_prices: estrutura e parâmetros de custo. */
  custos: boolean;
  /** products.edit: produtos e consumíveis (criar, mudar, ligar a fornecedores). */
  produtos: boolean;
  /** products.manage_prices: PVP e preço do fornecedor preferido. */
  pvp: boolean;
}

export const PODE_TUDO: PermissoesCatalogo = { servicos: true, custos: true, produtos: true, pvp: true };

/** As permissões do Catálogo a partir do hasPermission do utilizador. */
export function permissoesCatalogo(hasPermission: (codigo: string) => boolean): PermissoesCatalogo {
  return {
    servicos: hasPermission("services.edit"),
    custos: hasPermission("services.manage_prices"),
    produtos: hasPermission("products.edit"),
    pvp: hasPermission("products.manage_prices"),
  };
}

/** O que se pode criar: serviços, equipamentos e técnicos (perfis) com services.edit; produtos e consumíveis com products.edit. */
export function podeCriarTipo(p: PermissoesCatalogo, tipo: "servico" | "produto" | "equipamento" | "consumivel" | "tecnico"): boolean {
  return tipo === "produto" || tipo === "consumivel" ? p.produtos : p.servicos;
}

const Contexto = createContext<PermissoesCatalogo>(PODE_TUDO);

export function ProvedorPermissoesCatalogo({ valor, children }: { valor: PermissoesCatalogo; children: ReactNode }) {
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export const usePermissoesCatalogo = (): PermissoesCatalogo => useContext(Contexto);

/** Desliga (nativamente, com <fieldset disabled>) todos os controlos lá dentro quando `pode` é falso, sem mudar o aspeto. */
export function SoLeitura({ pode, aviso, children }: { pode: boolean; aviso: string; children: ReactNode }) {
  return (
    <>
      {!pode && <p role="note" className="mt-4 rounded-lg border border-border bg-muted/40 px-3 py-2 text-[15px] text-muted-foreground">{aviso}</p>}
      <fieldset disabled={!pode} className="m-0 min-w-0 border-0 p-0">{children}</fieldset>
    </>
  );
}
