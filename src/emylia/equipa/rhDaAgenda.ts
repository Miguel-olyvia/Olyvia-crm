// 28/10/2026: o RH que a agenda da Emylia lê, numa organização real. A agenda (pontes.ts: agendaDosMembros, ausenciasDosTecnicos) foi feita
// sobre a loja de exemplo do RH (components/rh-exemplo/dados/loja): as fichas e as ausências aprovadas de cada pessoa. Na Olyvia as
// ausências vêm da base (pessoas_ausencias_dias, pela rh_agenda_tecnicos: real/agendaReal.ts); aqui guarda-se o que veio, no mesmo
// formato (só o que a agenda usa: o nome da pessoa e os dias de ausência aprovados). Sem nada definido (os testes e o protótipo), a
// agenda usa a loja de exemplo, como antes.
import { useSyncExternalStore } from "react";
import { useEstadoRh } from "@/components/rh-exemplo/dados/loja";
import type { EstadoRh } from "@/components/rh-exemplo/dados/tiposLoja";

/** Uma pessoa do RH para a agenda: o nome e os dias ("aaaa-mm-dd") de ausência aprovada. */
export interface PessoaAgendaRh { id: string; nome: string; ausencias: readonly string[] }

/** O tipo único das ausências que vêm da base (a rh_agenda_tecnicos não diz o tipo: férias, baixa…). */
export const TIPO_AUSENCIA_REAL = { id: "rh-real", nome: "Ausência aprovada no RH" } as const;

/** O RH no formato da loja, só com o que a agenda lê (as fichas com a pessoa e as ausências, e o tipo da ausência). */
export function estadoRhDe(pessoas: readonly PessoaAgendaRh[]): EstadoRh {
  const fichas = Object.fromEntries(pessoas.map((p) => [p.id, {
    pessoa: { id: p.id, nome_completo: p.nome, estado_registo: "ativo", cargo: null },
    ausencias: { dias: p.ausencias.map((data) => ({ data, estado: "aprovado", tipo_id: TIPO_AUSENCIA_REAL.id, e_fim_semana: false })) },
  }]));
  return { ordem: pessoas.map((p) => p.id), fichas, locais: [], cargos: [], cargosPeriodos: [], modelos: [],
    tiposAusencia: [TIPO_AUSENCIA_REAL], filiais: [], papeis: [], minhaPessoaId: null } as unknown as EstadoRh;
}

let atual: EstadoRh | null = null;
const ouvintes = new Set<() => void>();
/** Define o RH real da agenda (null: volta à loja de exemplo). */
export function definirRhDaAgenda(pessoas: readonly PessoaAgendaRh[] | null): void {
  atual = pessoas ? estadoRhDe(pessoas) : null;
  for (const f of ouvintes) f();
}
export const lerRhDaAgenda = (): EstadoRh | null => atual;
const subscrever = (f: () => void) => { ouvintes.add(f); return () => { ouvintes.delete(f); }; };

/** O RH da agenda: o da base, se estiver definido; senão, a loja de exemplo. */
export function useRhDaAgenda(): EstadoRh {
  const real = useSyncExternalStore(subscrever, lerRhDaAgenda, lerRhDaAgenda);
  const exemplo = useEstadoRh((e) => e);
  return real ?? exemplo;
}
