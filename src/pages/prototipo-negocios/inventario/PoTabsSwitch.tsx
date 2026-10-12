// Escolhe a aba da folha da PO que se mostra (cada aba num painel com role=tabpanel).
import { TabAnulacoes, TabGuias, TabHistorico, TabLinhas, TabNotas, TabPortal, TabRececoes, type DlgPo } from "./PoTabs";
import type { Po } from "./tipos";

export function PoTabs({ tab, p, pedir }: { tab: string; p: Po; pedir: (d: DlgPo) => void }) {
  return (
    <div role="tabpanel" aria-labelledby={`fa-${tab}`} className="grid gap-3">
      {tab === "lines" && <TabLinhas p={p} pedir={pedir} />}
      {tab === "rec" && <TabRececoes p={p} pedir={pedir} />}
      {tab === "guias" && <TabGuias p={p} />}
      {tab === "portal" && <TabPortal p={p} pedir={pedir} />}
      {tab === "ann" && <TabAnulacoes p={p} />}
      {tab === "notes" && <TabNotas p={p} />}
      {tab === "hist" && <TabHistorico p={p} />}
    </div>
  );
}
