/**
 * Um campo de número do formulário de ativos: texto com teclado numérico (aceita «1 234,50» e «1234.5»; a conversão e a validação
 * são de `validarAtivo.ts`). Usa o mesmo envólucro dos campos do RH (etiqueta, ajuda, erro e `aria-describedby` ligados).
 */
import { Input } from "@/components/ui/input";
import { Envolvente, descricaoDoCampo, type CampoBaseProps } from "@/components/rh-exemplo/form/Campos";
import { cn } from "@/lib/utils";

interface Props extends CampoBaseProps {
  valor: string;
  onChange: (valor: string) => void;
  /** `decimal` para euros, `numeric` para meses inteiros. */
  modo?: "decimal" | "numeric";
}

export function CampoNumero({ id, label, ajuda, erro, className, descritoPor, obrigatorio, valor, onChange, modo = "decimal" }: Props) {
  return (
    <Envolvente id={id} label={label} ajuda={ajuda} erro={erro} className={className} obrigatorio={obrigatorio}>
      <Input
        id={id}
        type="text"
        inputMode={modo}
        autoComplete="off"
        value={valor}
        required={obrigatorio}
        aria-required={obrigatorio || undefined}
        aria-invalid={erro ? true : undefined}
        aria-describedby={descricaoDoCampo(id, { ajuda, erro, descritoPor })}
        className={cn("min-h-11", erro && "border-destructive")}
        onChange={(e) => onChange(e.target.value)}
      />
    </Envolvente>
  );
}
