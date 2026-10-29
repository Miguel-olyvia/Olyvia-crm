import { useMemo, useState, type Ref } from "react";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { COUNTRY_CODES } from "@/constants/countryCodes";
import { useTranslation } from "@/hooks/useTranslation";
import { DEFAULT_DIAL_CODE, joinInternationalPhone, splitInternationalPhone } from "@/lib/phone/splitInternationalPhone";

const N = "pessoasPagina.real.newLead.";

interface TelefoneProps {
  /** O id do texto visível do rótulo: dá o nome ao campo do número. */
  idRotulo: string;
  id: string;
  valor: unknown;
  aoMudar: (valor: string) => void;
  obrigatorio?: boolean;
  placeholder?: string | null;
  idDescricao?: string;
  invalido?: boolean;
  /** Para quem precisa de focar o campo do número (por exemplo a ficha da pessoa). */
  campoRef?: Ref<HTMLInputElement>;
  maxLength?: number;
}

/**
 * Telefone da lead com o seletor de indicativo sempre visível (cópia da lógica de LeadPhoneField). O valor guardado é uma só string
 * «+<indicativo><dígitos>». Sem dígitos o valor é vazio e não leva o indicativo, por isso a escolha fica em estado local até haver número.
 * Em vez do PhoneInput partilhado (que não liga o rótulo ao campo) usa dois controlos nativos com nome: o indicativo e o número.
 */
export function TelefoneNovaLead({ idRotulo, id, valor, aoMudar, obrigatorio, placeholder, idDescricao, invalido, campoRef, maxLength }: TelefoneProps) {
  const { t } = useTranslation();
  const [escolhido, setEscolhido] = useState(DEFAULT_DIAL_CODE);
  const partido = splitInternationalPhone(valor);
  const indicativo = partido.digits !== "" ? partido.dialCode : escolhido;
  // Um indicativo por opção (vários países partilham o mesmo): ganha o primeiro da lista.
  const opcoes = useMemo(() => {
    const vistos = new Set<string>();
    return COUNTRY_CODES.filter((c) => (vistos.has(c.dialCode) ? false : (vistos.add(c.dialCode), true)))
      .map((c) => ({ value: c.dialCode, label: `${c.flag} ${c.dialCode} ${c.code}` }));
  }, []);
  return (
    <div className="flex gap-2">
      <div className="w-36 shrink-0">
        <NativeSelect
          aria-label={t(`${N}phone.dialCode`)}
          value={opcoes.some((o) => o.value === indicativo) ? indicativo : ""}
          options={opcoes}
          onValueChange={(novo) => {
            setEscolhido(novo);
            aoMudar(joinInternationalPhone(novo, partido.digits));
          }}
        />
      </div>
      <Input
        id={id}
        ref={campoRef}
        maxLength={maxLength}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        aria-labelledby={idRotulo}
        aria-required={obrigatorio || undefined}
        aria-invalid={invalido || undefined}
        aria-describedby={idDescricao}
        className="flex-1"
        value={partido.digits}
        placeholder={placeholder ?? "912 345 678"}
        // Só dígitos e espaços (como o PhoneInput partilhado).
        onChange={(e) => aoMudar(joinInternationalPhone(indicativo, e.target.value.replace(/[^\d\s]/g, "")))}
      />
    </div>
  );
}
