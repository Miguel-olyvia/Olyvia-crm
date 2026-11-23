// 23/11: o «03 Orçamento detalhado» da folha da Emylia (DocsCliente.tsx, orcamentoDetalhado), a partir da vista, para o documento do
// template no passo «Proposta» do CRM antes de existir a proposta real. Ficheiro à parte: puxa DocsCliente (a folha inteira).
import { orcamentoDetalhado } from "@/emylia/DocsCliente";
import { COR_FASE } from "@/emylia/planoObra";
import { estadoDaVista, type EstadoDosDocs, type VistaDoPortal } from "./dadosObra";
import type { GrupoDoOrcamento, OrcamentoObra } from "./capaEOrcamento";

/** Por zona quando a obra tem zonas, senão por fase (como a folha). null sem vista ou sem orçamento. */
export function orcamentoDaVista(v: VistaDoPortal | null | undefined, docs: EstadoDosDocs = {}): OrcamentoObra | null {
  if (!v?.d?.orc) return null;
  const S = estadoDaVista(v, docs);
  const d = S.deals[0];
  if (!d?.orc) return null;
  const { T, desconto, linhas, fases, zonas } = orcamentoDetalhado(d, S);
  const grupos: GrupoDoOrcamento[] = zonas.length
    ? zonas.map((g) => ({ chave: `z-${g.z}`, titulo: { tipo: "zona", zona: g.z }, cor: null, linhas: g.linhas, subtotal: g.total }))
    : fases.map((f) => {
      const L = linhas.filter((x) => x.fase === f.n);
      return { chave: `f-${f.n}`, titulo: { tipo: "fase", n: f.n }, cor: COR_FASE[f.n] ?? null, linhas: L, subtotal: L.reduce((a, x) => a + x.total, 0) };
    });
  return { grupos, desconto, mo: T.mo, mat: T.mat, ivaMo: T.ivaMo, ivaMat: T.ivaMat, total: T.total };
}
