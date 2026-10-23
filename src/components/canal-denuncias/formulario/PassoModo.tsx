// Passo 0: anónima ou identificada. A escolha vem primeiro porque decide o que se pede a seguir.
import { Check, EyeOff, UserRound } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Campo } from "../comum/Campo";
import { GrupoRadios } from "../comum/GrupoRadios";
import type { DadosFormulario, ErrosFormulario } from "../lib/formulario";

export interface PassoProps {
  dados: DadosFormulario;
  erros: ErrosFormulario;
  onChange: (parcial: Partial<DadosFormulario>) => void;
}

interface CartaoModoProps {
  anonima: boolean;
  escolhido: boolean;
  onEscolher: () => void;
  descritoPor: string | undefined;
}

function CartaoModo({ anonima, escolhido, onEscolher, descritoPor }: CartaoModoProps) {
  const { t } = useTranslation();
  const Icone = anonima ? EyeOff : UserRound;
  const chave = anonima ? "anonima" : "identificada";
  return (
    <label
      className={cn(
        "relative flex min-h-11 cursor-pointer gap-3 rounded-lg border p-4",
        "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background",
        escolhido ? "border-primary bg-primary/10" : "border-input bg-card hover:border-foreground/40",
      )}
    >
      <input
        type="radio"
        name="modo-denuncia"
        checked={escolhido}
        onChange={onEscolher}
        aria-describedby={descritoPor}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
      <Icone className="mt-0.5 h-5 w-5 shrink-0 text-primary dark:text-violet-300" aria-hidden="true" />
      <span className="min-w-0 space-y-1">
        <span className="flex items-center gap-1.5 font-medium">
          {t(`cd.modo.${chave}.titulo`)}
          {escolhido && <Check className="h-4 w-4 text-primary dark:text-violet-300" aria-hidden="true" />}
        </span>
        <span className="block text-sm text-muted-foreground">{t(`cd.modo.${chave}.explica`)}</span>
      </span>
    </label>
  );
}

function CamposIdentificado({ dados, erros, onChange }: PassoProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <Campo id="den-nome" rotulo={t("cd.campo.nome")} ajuda={t("cd.ajuda.opcional")}>
        {(a) => <Input {...a} autoComplete="name" value={dados.nome} onChange={(e) => onChange({ nome: e.target.value })} />}
      </Campo>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="den-email" rotulo={t("cd.campo.email")} erro={erros.email ? t(erros.email) : undefined}>
          {(a) => <Input {...a} type="email" autoComplete="email" value={dados.email} onChange={(e) => onChange({ email: e.target.value })} />}
        </Campo>
        <Campo id="den-telefone" rotulo={t("cd.campo.telefone")}>
          {(a) => <Input {...a} type="tel" autoComplete="tel" value={dados.telefone} onChange={(e) => onChange({ telefone: e.target.value })} />}
        </Campo>
      </div>
      <GrupoRadios
        nome="den-contactar"
        legenda={t("cd.campo.podemContactar")}
        valor={dados.podemContactar ? "sim" : "nao"}
        opcoes={[{ valor: "sim", rotulo: t("cd.sim") }, { valor: "nao", rotulo: t("cd.nao") }]}
        onChange={(v) => onChange({ podemContactar: v === "sim" })}
        erro={erros.contacto ? t(erros.contacto) : undefined}
      />
      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
        <Checkbox checked={dados.soResponsavel} onCheckedChange={(v) => onChange({ soResponsavel: v === true })} />
        {t("cd.campo.soResponsavel")}
      </label>
    </div>
  );
}

export function PassoModo(props: PassoProps) {
  const { t } = useTranslation();
  const { dados, erros, onChange } = props;
  const idErro = erros.anonima ? "den-modo-erro" : undefined;
  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label={t("cd.modo.pergunta")} className="grid gap-3 sm:grid-cols-2">
        <CartaoModo anonima escolhido={dados.anonima === true} onEscolher={() => onChange({ anonima: true })} descritoPor={idErro} />
        <CartaoModo anonima={false} escolhido={dados.anonima === false} onEscolher={() => onChange({ anonima: false })} descritoPor={idErro} />
      </div>
      {erros.anonima && <p id="den-modo-erro" className="text-sm text-destructive">{t(erros.anonima)}</p>}
      {dados.anonima === true && <p role="note" className="text-sm text-muted-foreground">{t("cd.modo.anonima.nota")}</p>}
      {dados.anonima === false && <CamposIdentificado {...props} />}
    </div>
  );
}
