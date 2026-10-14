import { Check, Minus } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { MODULOS, PERMISSOES } from "./catalogoExemplo";
import { MarcaPerigosa } from "./pecas";
import type { Role } from "./tipos";

/** A matriz da role: um painel por módulo (Accordion), uma linha por ação, com "Tem" ou "Não tem" em texto e ícone. */
export function MatrizPermissoes({ role }: { role: Role }) {
  const { t } = useTranslation();
  const tem = (codigo: string) => role.permissoes.includes(codigo);
  return (
    <Accordion type="multiple" defaultValue={[MODULOS[0]]} className="w-full">
      {MODULOS.map((modulo) => {
        const doModulo = PERMISSOES.filter((p) => p.modulo === modulo);
        const n = doModulo.filter((p) => tem(p.codigo)).length;
        return (
          <AccordionItem key={modulo} value={modulo}>
            <AccordionTrigger className="min-h-11 py-2 text-left">
              <span className="flex flex-1 flex-wrap items-center gap-x-3">
                <span>{t(`usersProfiles.module.${modulo}`)}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {t("usersProfiles.matrix.count", { n, total: doModulo.length })}
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <ul className="divide-y divide-border/60">
                {doModulo.map((p) => {
                  const Icone = tem(p.codigo) ? Check : Minus;
                  return (
                    <li key={p.codigo} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 text-sm">
                      <span className="min-w-28 font-medium text-foreground">{t(`usersProfiles.action.${p.acao}`)}</span>
                      {p.perigosa && <MarcaPerigosa />}
                      <span className="ml-auto inline-flex items-center gap-1 text-foreground">
                        <Icone className="h-4 w-4 shrink-0" aria-hidden="true" />
                        {tem(p.codigo) ? t("usersProfiles.matrix.has") : t("usersProfiles.matrix.hasNot")}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}
