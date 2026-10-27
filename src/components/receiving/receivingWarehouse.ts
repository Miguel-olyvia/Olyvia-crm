// Armazém onde entra a receção ("Entra em" do painel "Dar entrada" e do leitor), escolhido ao carregar a Receção.
// No Olyvia 2.0 abrir uma PO na Receção põe o armazém dela (abrirRececaoDaPo: wh = p.wh). Na base real a PO não tem
// armazém: o equivalente é o armazém por omissão da organização (organization_inventory_settings.default_warehouse_id,
// o mesmo das Definições do Inventário). Ordem: o que já está no ecrã (cesto reposto) → o último escolhido neste
// dispositivo → o por omissão da organização → o único que existe → nenhum (o painel pede "Escolher o armazém").
export interface WarehousePick {
  /** O armazém já no ecrã (ex.: cesto reposto do sessionStorage). */
  current: string;
  /** O último escolhido neste dispositivo (localStorage). */
  remembered: string | null;
  /** organization_inventory_settings.default_warehouse_id (null sem definição ou sem permissão de leitura). */
  orgDefault: string | null;
  warehouses: readonly { id: string }[];
  /** A lista de armazéns falhou: não há como validar, mantém-se o atual. */
  loadError: boolean;
}

export function pickReceivingWarehouse(p: WarehousePick): string {
  const has = (id: string | null | undefined): id is string => !!id && p.warehouses.some((w) => w.id === id);
  if (p.loadError) return p.current;
  if (has(p.current)) return p.current;
  if (has(p.remembered)) return p.remembered;
  if (has(p.orgDefault)) return p.orgDefault;
  if (p.warehouses.length === 1) return p.warehouses[0].id;
  return "";
}
