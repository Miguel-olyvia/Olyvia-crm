// O âmbito por permissão sensível de UM vínculo (NONE, OWNED, TEAM, ORG), como em MembershipScopesDialog. Fica recolhido
// até se pedir, porque uma role pode ter dezenas de permissões com âmbito.
import { useId, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FOCO } from "@/components/negocio-metas/estilos";
import { ajustarAmbito, ambitoAtual } from "./regrasVinculos";
import { textoAmbito } from "./textos";
import type { Ambito, Permissao } from "./tipos";

const NIVEIS: Ambito[] = ["NONE", "OWNED", "TEAM", "ORG"];

interface AmbitosVinculoFormProps {
  /** As permissões com âmbito que a role do vínculo dá. */
  permissoes: Permissao[];
  ambitos: Record<string, Ambito>;
  desativado: boolean;
  aoMudar: (ambitos: Record<string, Ambito>) => void;
}

export function AmbitosVinculoForm({ permissoes, ambitos, desativado, aoMudar }: AmbitosVinculoFormProps) {
  const { t } = useTranslation();
  const id = useId();
  const [aberto, setAberto] = useState(false);
  if (permissoes.length === 0) return <p className="text-sm text-muted-foreground">{t("usersProfiles.links.noScope")}</p>;
  const Seta = aberto ? ChevronDown : ChevronRight;
  return (
    <div className="space-y-2">
      <button
        type="button" aria-expanded={aberto} aria-controls={`${id}-lista`} onClick={() => setAberto(!aberto)}
        className={cn("inline-flex min-h-11 items-center gap-1.5 rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline dark:text-violet-300", FOCO)}
      >
        <Seta className="h-4 w-4" aria-hidden="true" />
        {t(aberto ? "usersProfiles.form.links.scopeHide" : "usersProfiles.form.links.scopeShow", { n: permissoes.length })}
      </button>
      {aberto && (
        <ul id={`${id}-lista`} className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
          {permissoes.map((p, i) => (
            <li key={p.codigo} className="flex items-center justify-between gap-3 border-b border-border/60 py-1">
              <Label htmlFor={`${id}-${i}`} className="min-w-0 text-sm font-normal text-muted-foreground">{p.nome}</Label>
              <Select
                value={ambitoAtual(ambitos, p.codigo)} disabled={desativado}
                onValueChange={(nivel) => aoMudar(ajustarAmbito(ambitos, p.codigo, nivel as Ambito, permissoes))}
              >
                <SelectTrigger id={`${id}-${i}`} className={cn("h-11 w-36 shrink-0", FOCO)}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {NIVEIS.map((n) => <SelectItem key={n} value={n} className="min-h-11">{textoAmbito(t, n)}</SelectItem>)}
                </SelectContent>
              </Select>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
