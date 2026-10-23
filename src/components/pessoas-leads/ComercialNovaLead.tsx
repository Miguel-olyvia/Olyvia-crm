import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type { ComercialLido, NoArvoreOrg } from "@/hooks/pessoas/novaLead/comerciaisNovaLead";
import { useTranslation } from "@/hooks/useTranslation";

const N = "pessoasPagina.real.newLead.";

interface ComercialProps {
  comerciais: readonly ComercialLido[];
  arvore: readonly NoArvoreOrg[];
  atribuidoId: string;
  aoMudarAtribuido: (id: string) => void;
  orgFiltro: string;
  aoMudarOrgFiltro: (id: string) => void;
  /** O distrito escrito na lead (campos `distrito` ou `district`), para sugerir só os comerciais dessa zona. */
  distritoDaLead: string;
}

const casa = (a: string, b: string): boolean => a.toLowerCase().includes(b.toLowerCase()) || b.toLowerCase().includes(a.toLowerCase());

/**
 * O comercial da lead (cópia de AnewLeads.tsx:7480-7563): filtra por organização e, se a lead tem distrito, mostra os comerciais dessa
 * zona (se não houver nenhum, mostra todos e diz-o). Só dados e callbacks.
 */
export function ComercialNovaLead({ comerciais, arvore, atribuidoId, aoMudarAtribuido, orgFiltro, aoMudarOrgFiltro, distritoDaLead }: ComercialProps) {
  const { t } = useTranslation();
  const distrito = distritoDaLead.trim();
  const daOrg = orgFiltro === "all" ? comerciais : comerciais.filter((u) => u.org_ids.includes(orgFiltro));
  const daZona = distrito ? daOrg.filter((u) => u.districts.length > 0 && u.districts.some((d) => casa(d, distrito))) : daOrg;
  const aMostrar = distrito ? daZona : daOrg;
  const mostraTodos = distrito !== "" && daZona.length === 0 && daOrg.length > 0;
  const lista = mostraTodos ? daOrg : aMostrar;
  const nomeDe = (u: ComercialLido): string => {
    const zonas = distrito && u.districts.length > 0 ? u.districts.filter((d) => casa(d, distrito)) : u.districts;
    return zonas.length > 0 ? `${u.name} (${zonas.join(", ")})` : u.name;
  };
  return (
    <section aria-labelledby="nl-atribuido-titulo" className="space-y-3 border-t pt-4">
      <h3 id="nl-atribuido-titulo" className="text-sm font-semibold text-foreground">{t(`${N}assign.label`)}</h3>
      {arvore.length > 1 && (
        <div>
          <Label htmlFor="nl-org-filtro" className="sr-only">{t(`${N}assign.filterOrg`)}</Label>
          <NativeSelect
            id="nl-org-filtro"
            value={orgFiltro}
            onValueChange={aoMudarOrgFiltro}
            options={[
              { value: "all", label: t(`${N}assign.allOrgs`) },
              ...arvore.map((n) => ({ value: n.id, label: `${n.depth > 0 ? `${"— ".repeat(n.depth)}` : ""}${n.name} (${n.type})` })),
            ]}
          />
        </div>
      )}
      <Label htmlFor="nl-atribuido" className="sr-only">{t(`${N}assign.label`)}</Label>
      <NativeSelect
        id="nl-atribuido"
        value={atribuidoId}
        placeholder={t(`${N}assign.placeholder`)}
        onValueChange={aoMudarAtribuido}
        options={lista.map((u) => ({ value: u.id, label: nomeDe(u) }))}
      />
      {daOrg.length === 0 && <p className="text-xs text-muted-foreground">{t(`${N}assign.none`)}</p>}
      {distrito !== "" && daZona.length > 0 && daZona.length < daOrg.length && (
        <p className="text-xs text-muted-foreground">{t(`${N}assign.showingFrom`)} {distritoDaLead}</p>
      )}
      {mostraTodos && (
        <p role="status" className="text-xs text-destructive/80">{t(`${N}assign.noneInZone`)} {distritoDaLead} — {t(`${N}assign.showingAll`)}</p>
      )}
    </section>
  );
}
