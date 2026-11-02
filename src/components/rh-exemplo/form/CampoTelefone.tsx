/**
 * Telefone do RH de exemplo com o seletor de indicativo sempre visível (cópia independente de `components/hr/form/CampoTelefone`,
 * que o exemplo não pode importar). Valor guardado numa só string «+<indicativo><dígitos>»; sem dígitos o valor é vazio e a
 * escolha do indicativo fica em estado local até haver número. `indicativos` limita as opções (o telefone pessoal só aceita os
 * dos SMS do contrato); um número guardado com outro indicativo continua visível. `rotuloIndicativo` vem já traduzido.
 */
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { DEFAULT_DIAL_CODE, joinInternationalPhone } from "@/lib/phone/splitInternationalPhone";
import { juntarTelefoneRh, opcoesDeIndicativo, partirTelefoneRh } from "@/lib/phone/indicativosRh";
import { cn } from "@/lib/utils";
import { descricaoDoCampo, Envolvente, useTocarCampo, type CampoBaseProps } from "./Campos";

interface CampoTelefoneProps extends CampoBaseProps {
  valor: string;
  onChange: (valor: string) => void;
  /** O nome acessível do seletor de indicativo, já traduzido. */
  rotuloIndicativo: string;
  placeholder?: string;
  disabled?: boolean;
  /** Só estes indicativos (ex.: INDICATIVOS_SMS_CONTRATO). Omitido = a lista completa. */
  indicativos?: readonly string[];
}

export function CampoTelefone({
  id, label, ajuda, erro, className, marcado, obrigatorio, recomendado, descritoPor,
  valor, onChange, rotuloIndicativo, placeholder, disabled, indicativos,
}: CampoTelefoneProps) {
  const tocar = useTocarCampo();
  const [escolhido, setEscolhido] = useState(DEFAULT_DIAL_CODE);
  const partido = partirTelefoneRh(valor);
  const indicativo = partido.digits !== "" ? partido.dialCode : escolhido;
  const opcoes = useMemo(() => opcoesDeIndicativo(indicativos, indicativo), [indicativos, indicativo]);
  return (
    <Envolvente
      id={id} label={label} ajuda={ajuda} erro={erro} className={className} marcado={marcado}
      obrigatorio={obrigatorio} recomendado={recomendado}
    >
      <div className="flex gap-2">
        <div className="w-36 shrink-0">
          <NativeSelect
            aria-label={typeof label === "string" ? `${rotuloIndicativo} – ${label}` : rotuloIndicativo}
            value={indicativo}
            options={opcoes}
            disabled={disabled}
            onValueChange={(novo) => {
              setEscolhido(novo);
              onChange(joinInternationalPhone(novo, partido.digits));
            }}
          />
        </div>
        <Input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          value={partido.digits}
          placeholder={placeholder ?? "912 345 678"}
          disabled={disabled}
          required={obrigatorio}
          aria-required={obrigatorio || undefined}
          aria-invalid={erro ? true : undefined}
          aria-describedby={descricaoDoCampo(id, { ajuda, erro, descritoPor })}
          className={cn("flex-1", erro && "border-destructive")}
          // Só dígitos e espaços; um número colado já internacional traz o seu indicativo. Fixa-se o indicativo visível: ao apagar
          // todos os dígitos o seletor não pode voltar ao +351 e dar o país errado ao número seguinte.
          onChange={(e) => {
            setEscolhido(indicativo);
            onChange(juntarTelefoneRh(indicativo, e.target.value));
          }}
          onBlur={() => tocar(id)}
        />
      </div>
    </Envolvente>
  );
}
