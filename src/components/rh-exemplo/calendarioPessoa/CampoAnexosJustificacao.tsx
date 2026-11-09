/**
 * Os anexos reais da justificação: escolhem-se ficheiros (PDF, JPEG ou PNG, até 10 MB, no máximo 4), que ficam na lista até a
 * justificação ser registada; só então sobem (duas fases, ver `FormularioJustificacaoDia`). Cada ficheiro mostra o seu estado
 * (por enviar, a enviar, enviado, não enviado), tem o seu botão de remover e, se falhou, «Tentar outra vez». Alvos de toque de
 * 44 px; os erros são anunciados e o estado do envio fica numa região `status`.
 */
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ResultadoEnvio } from "@/hooks/useAnexarJustificacao";
import { ACCEPT_ANEXOS, MAX_ANEXOS_JUSTIFICACAO_REAIS, chaveDoErroDeAnexo, tamanhoLegivel } from "@/lib/hr/justificacaoAnexos";
import { useTranslation } from "@/hooks/useTranslation";
import { MensagemDeErro } from "./MensagemDeErro";

export type FaseAnexoLocal = "por_enviar" | "a_enviar" | "enviado" | "falhou";

/** Um ficheiro escolhido, com o ponto em que o envio está. */
export interface AnexoLocal {
  id: string;
  ficheiro: File;
  fase: FaseAnexoLocal;
  /** O código de erro da Edge quando `fase` é `falhou`. */
  codigoErro: string | null;
  /** O resultado falhado da última tentativa (reserva e se o upload correu): «Tentar outra vez» repete só o que falta. */
  anterior?: ResultadoEnvio | null;
}

interface Props {
  base: string;
  anexos: readonly AnexoLocal[];
  /** Uma chave de tradução (o erro do campo). */
  erro?: string;
  /** Os ids que descrevem o campo (ajuda e erro), já juntos. */
  descritoPor?: string;
  /** Impede escolher e remover (por exemplo, enquanto se grava). */
  desactivado?: boolean;
  aoEscolher: (ficheiros: File[]) => void;
  aoRemover: (id: string) => void;
  /** Sem esta função não há «Tentar outra vez». */
  aoTentarOutraVez?: (id: string) => void;
}

export function CampoAnexosJustificacao({ base, anexos, erro, descritoPor, desactivado = false, aoEscolher, aoRemover, aoTentarOutraVez }: Props) {
  const { t } = useTranslation();
  const params = { max: String(MAX_ANEXOS_JUSTIFICACAO_REAIS) };
  const aEnviar = anexos.filter((a) => a.fase === "a_enviar").length;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`${base}-anexos`}>{t("rhJust.form.anexos", params)}</Label>
      <Input
        id={`${base}-anexos`} type="file" multiple accept={ACCEPT_ANEXOS} className="min-h-11"
        disabled={desactivado || anexos.length >= MAX_ANEXOS_JUSTIFICACAO_REAIS}
        aria-describedby={descritoPor}
        aria-invalid={erro ? true : undefined}
        onChange={(e) => { aoEscolher(Array.from(e.target.files ?? [])); e.target.value = ""; }}
      />
      <p id={`${base}-anexos-ajuda`} className="text-xs text-muted-foreground">{t("rhJust.form.anexosAjuda")}</p>
      <MensagemDeErro id={`${base}-anexos-erro`} erro={erro} params={params} />
      <p role="status" className="text-xs text-muted-foreground" data-testid="rhjd-anexos-estado">
        {aEnviar > 0 ? t("rhJust.anexo.estadoEnvio", { n: String(aEnviar) }) : ""}
      </p>
      {anexos.length > 0 && (
        <ul aria-label={t("rhJust.form.anexosLista")} className="space-y-1 text-sm">
          {anexos.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2" data-testid={`rhjd-anexo-${a.id}`}>
              <span className="break-all">{a.ficheiro.name}</span>
              <span className="text-xs text-muted-foreground">{tamanhoLegivel(a.ficheiro.size)}</span>
              <span className={`text-xs ${a.fase === "falhou" ? "font-medium text-destructive" : "text-muted-foreground"}`}>
                {t(`rhJust.anexo.${a.fase === "por_enviar" ? "porEnviar" : a.fase === "a_enviar" ? "aEnviar" : a.fase}`)}
              </span>
              {a.fase === "falhou" && a.codigoErro && <span role="alert" className="text-xs font-medium text-destructive">{t(chaveDoErroDeAnexo(a.codigoErro))}</span>}
              {a.fase === "falhou" && aoTentarOutraVez && (
                <Button type="button" variant="outline" className="min-h-11" aria-label={t("rhJust.anexo.tentarOutraVezNome", { nome: a.ficheiro.name })} onClick={() => aoTentarOutraVez(a.id)}>
                  {t("rhJust.anexo.tentarOutraVez")}
                </Button>
              )}
              {a.fase !== "enviado" && (
                <Button
                  type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0" disabled={desactivado || a.fase === "a_enviar"}
                  aria-label={t("rhJust.form.remover", { nome: a.ficheiro.name })} onClick={() => aoRemover(a.id)}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
