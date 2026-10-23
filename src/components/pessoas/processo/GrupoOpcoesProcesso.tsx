// Uma escolha única com poucas opções (até 6, guidelines C8): um fieldset com legenda e botões de rádio de 44 px, com o erro (se houver)
// ligado ao grupo por `aria-describedby`. Serve a resposta da Direção e as condições da proposta (validade, pagamento, garantia).
import { useId, type Ref } from "react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { FOCO } from "@/components/negocio-metas/estilos";
import { MensagemErro } from "../CamposDataHora";
import { MarcaObrigatorio } from "./MarcaObrigatorio";

interface Opcao<T extends string> {
  valor: T;
  rotulo: string;
}

interface GrupoOpcoesProcessoProps<T extends string> {
  legenda: string;
  /** `""` = nada escolhido. */
  valor: T | "";
  opcoes: readonly Opcao<T>[];
  aoMudar: (valor: T) => void;
  /** O texto do erro, já traduzido; `null` sem erro. */
  erro?: string | null;
  /** Para levar o foco ao grupo quando há um erro: vai para a opção escolhida, ou para a primeira. */
  grupoRef?: Ref<HTMLDivElement>;
  /** A escolha é obrigatória (sem valor de partida): asterisco na legenda e `aria-required` no grupo. */
  obrigatorio?: boolean;
}

export function GrupoOpcoesProcesso<T extends string>({ legenda, valor, opcoes, aoMudar, erro, grupoRef, obrigatorio }: GrupoOpcoesProcessoProps<T>) {
  const id = useId();
  return (
    <fieldset className="space-y-2">
      <legend id={`${id}-legenda`} className="text-sm font-medium text-foreground">{legenda}{obrigatorio && <MarcaObrigatorio />}</legend>
      <RadioGroup
        ref={grupoRef} value={valor} onValueChange={(v) => aoMudar(v as T)} className="flex flex-wrap gap-2" aria-labelledby={`${id}-legenda`}
        required={obrigatorio} aria-invalid={erro ? true : undefined} aria-describedby={erro ? `${id}-erro` : undefined}
      >
        {opcoes.map((o) => (
          <div
            key={o.valor}
            className={cn("flex min-h-11 items-center gap-2 rounded-md border px-3", o.valor === valor ? "border-primary bg-primary/5" : "border-input")}
          >
            <RadioGroupItem id={`${id}-${o.valor}`} value={o.valor} className={FOCO} />
            <Label htmlFor={`${id}-${o.valor}`} className="cursor-pointer py-2 leading-snug">{o.rotulo}</Label>
          </div>
        ))}
      </RadioGroup>
      {erro && <MensagemErro id={`${id}-erro`} texto={erro} />}
    </fieldset>
  );
}
