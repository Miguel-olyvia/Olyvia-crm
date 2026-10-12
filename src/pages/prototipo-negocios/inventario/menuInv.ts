// A estrutura do menu do Inventário (o grupo do menu geral), igual à do mockup (NAV e AREAS): a entrada Hoje, o grupo Compras e o grupo Armazém, e os contadores de cada item.
// Os contadores são as contas do mockup (função counts() e o objeto badge da barra lateral), calculadas da base em memória.
import { Home, ShoppingCart, Warehouse, type LucideIcon } from "lucide-react";
import { contadores } from "./contadores";
import type { AbaInv } from "./ctxInv";
import type { Inventario } from "./tipos";

export interface ItemMenu { aba: AbaInv; t: string; novo?: boolean; perm?: string }
export interface GrupoMenu { id: "compras" | "armazem"; t: string; icone: LucideIcon; itens: readonly ItemMenu[] }

export const GRUPOS: readonly GrupoMenu[] = [
  { id: "compras", t: "Compras", icone: ShoppingCart, itens: [{ aba: "po", t: "Encomendas", perm: "purchase_orders.view" }, { aba: "sup", t: "Fornecedores", perm: "suppliers.view" }] },
  { id: "armazem", t: "Armazém", icone: Warehouse, itens: [
    { aba: "stock", t: "Existências" }, { aba: "mov", t: "Movimentos", novo: true }, { aba: "ec", t: "Saídas para clientes", perm: "contracts.view" },
    { aba: "guia", t: "Receção" }, { aba: "cont", t: "Contagens", perm: "inventory.count" }, { aba: "wh", t: "Armazéns" },
  ] },
];
export const ICONE_INVENTARIO = ShoppingCart;
export const ICONE_HOJE = Home;

export type TomPilula = "" | "warn" | "bad";
export interface Pilula { n: number; tom: TomPilula; dica: string }

/** O nome de cada ecrã, tal como o mockup o usa (NAV). */
export const NOME_ABA: Record<AbaInv, string> = {
  hoje: "Hoje", po: "Encomendas", sup: "Fornecedores", stock: "Existências", mov: "Movimentos", ec: "Saídas para clientes", guia: "Receção", cont: "Contagens", wh: "Armazéns",
};
export const grupoDe = (aba: AbaInv): GrupoMenu | undefined => GRUPOS.find((g) => g.itens.some((i) => i.aba === aba));

/** O total do Hoje: a soma de toda a fila de trabalho (as 11 linhas). */
export function totalFila(db: Inventario): number {
  const c = contadores(db);
  return c.pending + c.late + c.ecReady + c.ecNoSup + c.transfers + c.prices + c.low + c.stalled + c.guiasDiv + c.awaiting + c.catUnlinked;
}

/** O contador de cada item do menu; sem contador (zero) não há pílula. */
export function pilulas(db: Inventario): Partial<Record<AbaInv, Pilula>> {
  const c = contadores(db);
  const todas: Partial<Record<AbaInv, Pilula>> = {
    po: { n: c.pending, tom: "warn", dica: "Por aprovar" },
    sup: { n: c.prices + c.awaiting, tom: "warn", dica: "Preços por aprovar e fornecedores à espera da ficha" },
    stock: { n: c.low, tom: "bad", dica: "Abaixo do ponto de encomenda" },
    ec: { n: c.ecReady, tom: "", dica: "Prontas a expedir" },
    guia: { n: c.guiasOpen, tom: "", dica: "Guias abertas" },
    cont: { n: c.stalled, tom: "warn", dica: "Contagem parada" },
  };
  return Object.fromEntries(Object.entries(todas).filter(([, p]) => p && p.n > 0)) as Partial<Record<AbaInv, Pilula>>;
}

/** O título e o texto de cada ecrã, tal como o mockup os usa (função head()), palavra por palavra. */
export const TITULOS: Record<AbaInv, [string, string]> = {
  hoje: ["Hoje", "Tudo o que precisa de ação no inventário, por ordem do fluxo. Os números vêm do estado atual e mudam quando age."],
  po: ["Encomendas a fornecedor", "Rascunhos gerados pelas Encomendas Clientes ou criados à mão, aprovação, portal do fornecedor e receção — numa só lista. Todas as linhas abrem, incluindo recebidas."],
  sup: ["Fornecedores", "Criar um fornecedor é convidá-lo para o portal: ele preenche a ficha e o catálogo. Dados, artigos, preços e portal ficam na ficha; o que está na tabela edita-se com um clique."],
  stock: ["Existências", "Stock por produto e armazém. Livre = stock − reservas das Encomendas Clientes (FIFO); encomendas a caminho não contam."],
  mov: ["Movimentos", "Livro completo e imutável: cada entrada, saída, transferência, ajuste, devolução e quebra. Os históricos de 50/30 linhas passam a ser este ecrã, filtrado."],
  ec: ["Saídas para clientes", "Encomendas Clientes: o que existe em stock é reservado (FIFO) e sai do armazém de expedição; o que falta vai para a encomenda ao fornecedor preferencial. Requer inventário + contratos."],
  guia: ["Receção", "Receber mercadoria por código no telemóvel ou manualmente na encomenda. A receção fecha o fluxo: a parte para EC serve a encomenda de cliente; a parte para stock entra livre e atualiza o custo médio."],
  cont: ["Contagens", "Contagens físicas por armazém e categoria. Só fecham sem diferenças por resolver; as diferenças ajustadas geram movimentos de ajuste no livro."],
  wh: ["Armazéns", "Onde está o stock. Só armazéns ativos e que servem clientes entram na reserva FIFO das Encomendas Clientes; um armazém desligado continua a receber e guardar stock."],
};
