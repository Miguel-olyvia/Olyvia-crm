// Os campos do motivo de uma perda: um da lista do Workflow, ou «Outro» com texto livre. Partilhados por «Perder negócio» e pela recusa da
// proposta. O erro diz-se em texto (`text-foreground`) ligado ao campo; a cor só vai no ícone.
import { useId, type Ref } from "react";
import { AlertCircle } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { FOCO } from "./estilos";
import { MAX_MOTIVO_OUTRO, MOTIVO_OUTRO, opcoesMotivoPerda, type ErroMotivoPerda } from "./perdaNegocio";

const L = "businessGoals.lose.";

/** O erro de um campo: o texto em `text-foreground` e a cor só no ícone (a cor não é o único sinal, nem o texto depende dela). */
export function MensagemErro({ id, texto }: { id: string; texto: string }) {
  return (
    <p id={id} role="alert" className="flex items-center gap-1.5 text-sm text-foreground">
      <AlertCircle className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
      {texto}
    </p>
  );
}

interface CamposMotivoPerdaProps {
  /** Os motivos da lista do Workflow (`ConfigWorkflow.motivosPerda`). */
  motivos: readonly string[];
  escolhido: string;
  outro: string;
  /** O erro a mostrar (só depois de tentar). */
  erro: ErroMotivoPerda | null;
  aoMudar: (parcial: { escolhido?: string; outro?: string }) => void;
  seletorRef?: Ref<HTMLSelectElement>;
  outroRef?: Ref<HTMLInputElement>;
}

export function CamposMotivoPerda({ motivos, escolhido, outro, erro, aoMudar, seletorRef, outroRef }: CamposMotivoPerdaProps) {
  const { t } = useTranslation();
  const id = useId();
  const opcoes = opcoesMotivoPerda(motivos).map((m) => ({ value: m, label: m === MOTIVO_OUTRO ? t(`${L}reason.other`) : m }));
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-motivo`}>{t(`${L}reason`)}</Label>
        <NativeSelect
          ref={seletorRef} id={`${id}-motivo`} value={escolhido} options={opcoes} placeholder={t(`${L}reason.placeholder`)}
          aria-invalid={erro === "motivoVazio" ? true : undefined} aria-describedby={erro === "motivoVazio" ? `${id}-motivo-erro` : undefined}
          className={cn("h-11", FOCO, erro === "motivoVazio" && "border-destructive")} onValueChange={(v) => aoMudar({ escolhido: v })}
        />
        {erro === "motivoVazio" && <MensagemErro id={`${id}-motivo-erro`} texto={t(`${L}error.motivoVazio`)} />}
      </div>
      {escolhido === MOTIVO_OUTRO && (
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-outro`}>{t(`${L}reason.otherLabel`)}</Label>
          <Input
            ref={outroRef} id={`${id}-outro`} value={outro} maxLength={MAX_MOTIVO_OUTRO} autoComplete="off"
            aria-invalid={erro === "outroVazio" ? true : undefined} aria-describedby={erro === "outroVazio" ? `${id}-outro-erro` : undefined}
            className={cn("min-h-11", FOCO, erro === "outroVazio" && "border-destructive")} onChange={(e) => aoMudar({ outro: e.target.value })}
          />
          {erro === "outroVazio" && <MensagemErro id={`${id}-outro-erro`} texto={t(`${L}error.outroVazio`)} />}
        </div>
      )}
    </>
  );
}
