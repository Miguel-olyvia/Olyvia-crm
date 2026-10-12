// Escolhe o separador da folha da PO que se mostra (cada um num painel com role=tabpanel).
import { TabAnulacoes, TabGuias, TabHistorico, TabNotas, TabPortal, TabRececoes } from "./PoTabs";
import { TabLinhas } from "./PoTabLinhas";
import type { AcoesPo, EstadoPd } from "./poTipos";
import type { Po } from "./tipos";

interface Props { tab: string; p: Po; a: AcoesPo; pd: EstadoPd; setPd: (f: (x: EstadoPd) => EstadoPd) => void }

export function PoTabs({ tab, p, a, pd, setPd }: Props) {
  return (
    <div role="tabpanel" aria-labelledby={`fa-${tab}`} className="stack">
      {tab === "lines" && <TabLinhas p={p} a={a} pd={pd} setPd={setPd} />}
      {tab === "rec" && <TabRececoes p={p} a={a} />}
      {tab === "guias" && <TabGuias p={p} />}
      {tab === "portal" && <TabPortal p={p} a={a} />}
      {tab === "ann" && <TabAnulacoes p={p} />}
      {tab === "notes" && <TabNotas pd={pd} setPd={setPd} />}
      {tab === "hist" && <TabHistorico p={p} />}
    </div>
  );
}
