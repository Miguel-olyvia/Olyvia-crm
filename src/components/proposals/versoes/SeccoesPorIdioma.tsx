import type { RefCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "@/hooks/useTranslation";
import { nomeNaFrase } from "./nomeNaFrase";
import type { CampoDeSeccao } from "./modeloVersoes";

export interface SeccaoParaTraduzir {
  id: string;
  type: string;
  label: string;
  visible: boolean;
  settings?: Record<string, unknown>;
}

interface SeccoesPorIdiomaProps {
  codigo: string;
  seccoes: SeccaoParaTraduzir[];
  valorDaSeccao: (seccaoId: string, campo: CampoDeSeccao) => string;
  onEscrever: (seccaoId: string, campo: CampoDeSeccao, valor: string) => void;
  /** Regista o envólucro de cada campo (chave `sections.<id>.<campo>`) para «ir para o campo». */
  registar?: (chave: string) => RefCallback<HTMLElement>;
}

/** Os tipos de secção que mostram um título próprio na proposta (o mesmo critério do editor em português). */
const COM_TITULO_VISIVEL = ["company_info", "client_info", "description", "value", "validity", "quotes", "quote_items", "notes", "terms"];

interface CampoDaLista {
  campo: CampoDeSeccao;
  rotulo: string;
  portugues: string;
  longo?: boolean;
}

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor : "";
}

function camposDe(seccao: SeccaoParaTraduzir, t: (chave: string) => string): CampoDaLista[] {
  const settings = seccao.settings ?? {};
  const campos: CampoDaLista[] = [{ campo: "label", rotulo: t("proposalTemplateEditor.versions.sections.label"), portugues: seccao.label }];
  if (seccao.type === "header") {
    campos.push({ campo: "customTitle", rotulo: t("proposalTemplateEditor.versions.sections.customTitle"), portugues: texto(settings.customTitle) });
  }
  if (COM_TITULO_VISIVEL.includes(seccao.type)) {
    campos.push({
      campo: "sectionLabel",
      rotulo: t("proposalTemplateEditor.versions.sections.sectionLabel"),
      portugues: texto(settings.sectionLabel) || seccao.label,
    });
  }
  if (seccao.type === "custom") {
    campos.push({ campo: "content", rotulo: t("proposalTemplateEditor.versions.sections.content"), portugues: texto(settings.content), longo: true });
  }
  return campos;
}

export function SeccoesPorIdioma({ codigo, seccoes, valorDaSeccao, onEscrever, registar }: SeccoesPorIdiomaProps) {
  const { t } = useTranslation();
  const idioma = nomeNaFrase(t, codigo);

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <h3 className="text-sm font-medium">{t("proposalTemplateEditor.versions.sections.heading", { language: idioma })}</h3>
        <p className="text-xs text-muted-foreground">{t("proposalTemplateEditor.versions.sections.hint")}</p>
      </div>

      {seccoes.map((seccao) => (
        <fieldset key={seccao.id} className="space-y-2 rounded-lg border bg-background p-3">
          <legend className="px-1 text-xs font-semibold">
            {seccao.label}
            {!seccao.visible && <span className="ml-1 font-normal text-muted-foreground">({t("proposalTemplateEditor.versions.sections.hidden")})</span>}
          </legend>
          {camposDe(seccao, t).map(({ campo, rotulo, portugues, longo }) => {
            const id = `seccao-${seccao.id}-${campo}`;
            const ajuda = `${id}-pt`;
            const props = {
              id,
              "aria-label": `${seccao.label} · ${rotulo}`,
              "aria-describedby": portugues ? ajuda : undefined,
              value: valorDaSeccao(seccao.id, campo),
              onChange: (e: { target: { value: string } }) => onEscrever(seccao.id, campo, e.target.value),
              className: "text-xs",
            };
            return (
              <div key={campo} ref={registar?.(`sections.${seccao.id}.${campo}`)} className="space-y-1 p-1">
                <Label htmlFor={id} className="text-xs text-muted-foreground">{rotulo}</Label>
                {longo ? <Textarea {...props} className="min-h-[90px] text-xs" /> : <Input {...props} className="h-9 text-xs" />}
                {portugues && (
                  <p id={ajuda} className="line-clamp-2 text-xs text-muted-foreground">
                    {t("proposalTemplateEditor.versions.sections.inPortuguese", { text: portugues })}
                  </p>
                )}
              </div>
            );
          })}
        </fieldset>
      ))}
    </div>
  );
}
