/**
 * Tabelas em memoria para os testes com o Supabase simulado.
 *
 * Responde como o PostgREST ao que o codigo pede: aplica eq/in/is, ordena por TODAS as
 * chamadas a order() (a primeira manda, as seguintes desempatam, e a ordem estavel deixa
 * as linhas iguais pela ordem em que foram escritas) e respeita limit(). Assim um teste so
 * da razao a quem pede a ordem certa, em vez de depender de uma lista ja ordenada a mao.
 */
export type FakeRow = Record<string, unknown>;
export type FakeTables = Record<string, FakeRow[]>;

interface OrderBy {
  column: string;
  ascending: boolean;
}

const compare = (a: unknown, b: unknown): number => {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  return (a as string | number | boolean) < (b as string | number | boolean) ? -1 : 1;
};

export function fakeFrom(tables: FakeTables) {
  return (table: string) => {
    let rows: FakeRow[] = [...(tables[table] ?? [])];
    const orders: OrderBy[] = [];
    let max: number | null = null;

    const result = (): FakeRow[] => {
      const sorted = [...rows].sort((a, b) => {
        for (const { column, ascending } of orders) {
          const c = compare(a[column], b[column]);
          if (c !== 0) return ascending ? c : -c;
        }
        return 0;
      });
      return max === null ? sorted : sorted.slice(0, max);
    };

    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (column: string, value: unknown) => {
        rows = rows.filter((row) => row[column] === value);
        return chain;
      },
      in: (column: string, values: unknown[]) => {
        rows = rows.filter((row) => values.includes(row[column]));
        return chain;
      },
      is: (column: string, value: unknown) => {
        rows = rows.filter((row) => (row[column] ?? null) === value);
        return chain;
      },
      order: (column: string, options?: { ascending?: boolean }) => {
        orders.push({ column, ascending: options?.ascending !== false });
        return chain;
      },
      limit: (n: number) => {
        max = n;
        return chain;
      },
      maybeSingle: () => Promise.resolve({ data: result()[0] ?? null, error: null }),
      then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
        Promise.resolve({ data: result(), error: null }).then(onFulfilled, onRejected),
    };
    return chain;
  };
}
