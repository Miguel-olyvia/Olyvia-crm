// 27/11 (Rúben: «sinto o estúdio lento»): o Estúdio da obra fazia em cada desenho a ocupação dos técnicos, os alertas (três vezes) e as
// propostas dos agentes: ~0,1 s por vez numa obra de 50 tarefas com 30 obras na base, e um desenho a cada clique, painel ou separador.
// Agora faz-se uma vez e guarda-se, enquanto a obra (o JSON dela, as adendas e o resumo do inventário) e o contexto não mudam. O contexto
// (`chave`) é novo sempre que os dados da página mudam (o run/redesenhar refaz o ctx), por isso o que vem das outras obras também conta.
import type { Estado, Negocio } from "../motor";
import { ocupacaoDosTecnicos } from "../preparacaoObra";
import type { ResumoEcNeg } from "../inventario/ponteNegocios";
import { alertasDaObra, type Alerta } from "./alertasObra";
import { propostasDosAgentes, type Proposta } from "./agentes";

export interface ContasObra { ocup: Map<string, Set<string>>; alertas: Alerta[]; propostas: Proposta[] }

const cache = new WeakMap<object, Map<number, { sig: string; v: ContasObra }>>();

export function contasDaObra(chave: object, d: Negocio, S: Pick<Estado, "deals" | "role"> & Partial<Estado>, inv?: ResumoEcNeg | null): ContasObra {
  let porObra = cache.get(chave);
  if (!porObra) { porObra = new Map(); cache.set(chave, porObra); }
  const sig = `${S.role}|${S.deals?.length ?? 0}|${JSON.stringify(d.obra)}|${JSON.stringify(d.adendas ?? null)}|${JSON.stringify(inv ?? null)}`;
  const m = porObra.get(d.id);
  if (m && m.sig === sig) return m.v;
  const ocup = ocupacaoDosTecnicos(S as Estado, d.id);
  const alertas = alertasDaObra(d, S as Estado, ocup, inv);
  let propostas: Proposta[] = [];
  try { propostas = propostasDosAgentes(d, S as Estado, ocup, inv, alertas); } catch (e) { console.warn("agentes", e); }
  const v = { ocup, alertas, propostas };
  porObra.set(d.id, { sig, v });
  return v;
}
