// Supabase simulado para os testes vitest das Edge Functions: tabelas em
// memoria, filtros eq/neq/is/in/gte, registo de leituras e escritas, e erros
// injectaveis por "tabela:operacao" (como o supabase-js, devolve {error} e
// nao lanca excepcao). Nada toca na base.

export type Row = Record<string, any>;
export type Erros = Record<string, { message: string }>;
export type Filtro = [string, any];

export function makeSupabase(tables: Record<string, Row[]>, erros: Erros = {}) {
  const writes: Array<{ table: string; op: string; payload: any; filters: Filtro[] }> = [];
  const reads: Array<{ table: string; filters: Filtro[] }> = [];
  const from = (table: string) => {
    const st = { op: 'select', payload: undefined as any, filters: [] as Filtro[] };
    const matches = (row: Row) =>
      st.filters.every(([c, v]) => {
        if (c.endsWith(' is')) return (row[c.slice(0, -3)] ?? null) === v;
        if (c.endsWith(' neq')) return row[c.slice(0, -4)] !== v;
        if (c.endsWith(' gte')) return String(row[c.slice(0, -4)]) >= String(v);
        if (c.endsWith(' in')) return (v as any[]).includes(row[c.slice(0, -3)]);
        return row[c] === v;
      });
    const b: any = {
      select: () => b,
      update: (p: any) => { st.op = 'update'; st.payload = p; return b; },
      insert: (p: any) => { st.op = 'insert'; st.payload = p; return b; },
      delete: () => { st.op = 'delete'; return b; },
      eq: (c: string, v: any) => { st.filters.push([c, v]); return b; },
      neq: (c: string, v: any) => { st.filters.push([c + ' neq', v]); return b; },
      gte: (c: string, v: any) => { st.filters.push([c + ' gte', v]); return b; },
      is: (c: string, v: any) => { st.filters.push([c + ' is', v]); return b; },
      in: (c: string, v: any[]) => { st.filters.push([c + ' in', v]); return b; },
      order: () => b,
      limit: () => b,
      maybeSingle: () => {
        reads.push({ table, filters: st.filters });
        const error = erros[`${table}:select`] ?? null;
        return Promise.resolve({ data: error ? null : (tables[table] ?? []).find(matches) ?? null, error });
      },
      then: (res: any, rej?: any) => {
        if (st.op === 'select') {
          reads.push({ table, filters: st.filters });
          const error = erros[`${table}:select`] ?? null;
          return Promise.resolve({ data: error ? null : (tables[table] ?? []).filter(matches), error }).then(res, rej);
        }
        writes.push({ table, op: st.op, payload: st.payload, filters: st.filters });
        return Promise.resolve({ data: null, error: erros[`${table}:${st.op}`] ?? null }).then(res, rej);
      },
    };
    return b;
  };
  return { client: { from }, writes, reads };
}
