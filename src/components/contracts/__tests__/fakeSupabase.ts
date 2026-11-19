// Supabase simulado para os testes do contrato (sem rede, sem base de dados).
// Cada `from(tabela)` devolve um construtor encadeável (select/eq/order/limit/...) que se resolve com os dados
// da tabela em `estadoFalso.tables`: um objeto serve `.single()/.maybeSingle()`, uma lista serve o resto.
// Uma tabela que não está no estado devolve null (single) ou lista vazia. Os `.update(...)` ficam registados.

export interface EstadoFalso {
  tables: Record<string, unknown>;
  updates: Array<{ table: string; payload: unknown }>;
}

export const estadoFalso: EstadoFalso = { tables: {}, updates: [] };

export function reporEstadoFalso(tables: Record<string, unknown> = {}): void {
  estadoFalso.tables = tables;
  estadoFalso.updates = [];
}

function dadosDaTabela(tabela: string, single: boolean): unknown {
  const valor = estadoFalso.tables[tabela];
  if (valor === undefined) return single ? null : [];
  if (Array.isArray(valor)) return single ? (valor[0] ?? null) : valor;
  return single ? valor : [valor];
}

export function makeFakeSupabase() {
  return {
    from(tabela: string) {
      let single = false;
      const construtor: any = new Proxy(
        {},
        {
          get(_alvo, propriedade) {
            if (propriedade === "then") {
              return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
                Promise.resolve({ data: dadosDaTabela(tabela, single), error: null }).then(resolve, reject);
            }
            return (...args: unknown[]) => {
              if (propriedade === "single" || propriedade === "maybeSingle") single = true;
              if (propriedade === "update") estadoFalso.updates.push({ table: tabela, payload: args[0] });
              return construtor;
            };
          },
        },
      );
      return construtor;
    },
  };
}
