import { useId, useState } from "react";
import { AlertTriangle, CheckCircle2, CircleDashed, Copy, Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { textoSimples } from "@/lib/idiomaDocumento/texto";
import { useTranslation } from "@/hooks/useTranslation";
import { nomeNaFrase } from "./nomeNaFrase";
import type { CampoDeVerificacao, EstadoDoCampo } from "./modeloVersoes";

interface ListaDeVerificacaoProps {
  codigo: string;
  campos: CampoDeVerificacao[];
  /** Para dar nome às secções da lista. */
  seccoes: Array<{ id: string; label: string }>;
  desatualizado: boolean;
  onMarcarAtualizada: () => void;
  onRemover: (codigo: string) => void;
  /** Clicar num item leva ao campo (separador, scroll, foco e destaque). */
  onIrPara: (chave: string) => void;
  /** O último pedido não encontrou o campo no editor. */
  naoEncontrado: string | null;
}

const ICONE: Record<EstadoDoCampo, typeof CheckCircle2> = { traduzido: CheckCircle2, igual: Copy, falta: CircleDashed };
const COR: Record<EstadoDoCampo, string> = {
  traduzido: "text-emerald-700 dark:text-emerald-300",
  igual: "text-amber-700 dark:text-amber-300",
  falta: "text-destructive",
};
const CHAVE_ESTADO: Record<EstadoDoCampo, string> = {
  traduzido: "proposalTemplateEditor.versions.checklist.status.translated",
  igual: "proposalTemplateEditor.versions.checklist.status.same",
  falta: "proposalTemplateEditor.versions.checklist.status.missing",
};

export function ListaDeVerificacao({ codigo, campos, seccoes, desatualizado, onMarcarAtualizada, onRemover, onIrPara, naoEncontrado }: ListaDeVerificacaoProps) {
  const idBase = useId();
  const [listaAberta, setListaAberta] = useState(() => campos.some((c) => c.estado !== "traduzido"));
  const { t } = useTranslation();
  const [confirmarRemocao, setConfirmarRemocao] = useState(false);
  const idioma = nomeNaFrase(t, codigo);
  const porTraduzir = campos.filter((c) => c.estado !== "traduzido").length;

  const nomeDoCampo = (c: CampoDeVerificacao): string => {
    if (c.tipo === "texto") return t(`proposalTemplateEditor.versions.field.${c.campo}`);
    const seccao = seccoes.find((s) => s.id === c.seccaoId);
    return t("proposalTemplateEditor.versions.checklist.sectionField", {
      name: seccao?.label || c.seccaoId || "",
      field: t(`proposalTemplateEditor.versions.sections.${c.campo}`),
    });
  };

  return (
    <section className="space-y-2 rounded-lg border bg-background p-3" aria-label={t("proposalTemplateEditor.versions.checklist.title")}>
      {desatualizado && (
        <Alert>
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          <AlertDescription className="space-y-2">
            <p>{t("proposalTemplateEditor.versions.outdated.message")}</p>
            <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={onMarcarAtualizada}>
              {t("proposalTemplateEditor.versions.outdated.mark")}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {naoEncontrado && (
        <p role="status" className="text-xs text-amber-700 dark:text-amber-300">
          {t("proposalTemplateEditor.versions.checklist.notFound")}
        </p>
      )}

      {/* Aberta só ao início (se falta algo): não pode fechar-se sozinha quando se traduz o último campo. */}
      <details open={listaAberta} onToggle={(e) => setListaAberta(e.currentTarget.open)}>
        <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-md text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span>{t("proposalTemplateEditor.versions.checklist.title")}</span>
          <span className={porTraduzir > 0 ? "text-xs text-amber-700 dark:text-amber-300" : "text-xs text-emerald-700 dark:text-emerald-300"}>
            {porTraduzir > 0
              ? t("proposalTemplateEditor.versions.missingCount", { count: porTraduzir })
              : t("proposalTemplateEditor.versions.checklist.allDone")}
          </span>
        </summary>
        {campos.length > 0 && (
          <ul className="mt-2 space-y-2">
            {campos.map((c) => {
              const Icone = ICONE[c.estado];
              return (
                <li key={c.chave} className="rounded-md border text-xs">
                  <button
                    type="button"
                    aria-label={t("proposalTemplateEditor.versions.checklist.goTo", { field: nomeDoCampo(c) })}
                    aria-describedby={`${idBase}-${c.chave.replace(/\W/g, "_")}`}
                    onClick={() => onIrPara(c.chave)}
                    className="flex min-h-11 w-full items-start justify-between gap-2 rounded-md p-2 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="font-medium">{nomeDoCampo(c)}</span>
                    <span id={`${idBase}-${c.chave.replace(/\W/g, "_")}`} className={`inline-flex shrink-0 items-center gap-1 ${COR[c.estado]}`}>
                      <Icone className="h-3.5 w-3.5" aria-hidden="true" />
                      {t(CHAVE_ESTADO[c.estado])}
                    </span>
                  </button>
                  <p className="line-clamp-2 px-2 pb-2 text-muted-foreground">
                    <span className="font-medium">{t("proposalTemplateEditor.versions.checklist.portuguese")}: </span>
                    {textoSimples(c.base)}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </details>

      <Button type="button" variant="ghost" size="sm" className="min-h-11 text-destructive hover:text-destructive" onClick={() => setConfirmarRemocao(true)}>
        <Trash2 className="mr-1 h-4 w-4" aria-hidden="true" />
        {t("proposalTemplateEditor.versions.remove.button", { language: idioma })}
      </Button>

      <AlertDialog open={confirmarRemocao} onOpenChange={setConfirmarRemocao}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("proposalTemplateEditor.versions.remove.title", { language: idioma })}</AlertDialogTitle>
            <AlertDialogDescription>{t("proposalTemplateEditor.versions.remove.description", { language: idioma })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("proposalTemplateEditor.versions.remove.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => onRemover(codigo)} className="bg-destructive text-destructive-foreground">
              {t("proposalTemplateEditor.versions.remove.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
