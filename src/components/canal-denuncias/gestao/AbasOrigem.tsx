// As abas «Todas, Anónimas, Identificadas» da gestão, com a contagem de cada uma. São o filtro de origem da lista (o
// mesmo campo `origem` dos filtros): escolher uma aba é filtrar por ela. A identidade de uma anónima nunca aparece aqui.
import type { ReactNode } from "react";
import { Aba, ListaAbas, Tabs, TabsContent } from "@/components/ficha-comum/AbasSublinhadas";
import { useTranslation } from "@/hooks/useTranslation";
import type { FiltrosGestao } from "../lib/filtros";
import type { ContagemOrigem } from "../lib/organizacao";

type Origem = FiltrosGestao["origem"];

interface AbasOrigemProps {
  origem: Origem;
  contagem: ContagemOrigem;
  onChange: (origem: Origem) => void;
  /** O que fica por baixo das abas (filtros e lista): é o painel da aba escolhida. */
  children: ReactNode;
}

export function AbasOrigem({ origem, contagem, onChange, children }: AbasOrigemProps) {
  const { t } = useTranslation();
  return (
    <Tabs value={origem} onValueChange={(v) => onChange(v as Origem)} className="space-y-4">
      <ListaAbas aria-label={t("cdm.origem.abas")}>
        <Aba value="todos" rotulo={t("cdm.origem.todas")} contador={contagem.todas} />
        <Aba value="anonima" rotulo={t("cdm.origem.anonimas")} contador={contagem.anonimas} />
        <Aba value="identificada" rotulo={t("cdm.origem.identificadas")} contador={contagem.identificadas} />
      </ListaAbas>
      <TabsContent value={origem} className="mt-0 space-y-4">{children}</TabsContent>
    </Tabs>
  );
}
