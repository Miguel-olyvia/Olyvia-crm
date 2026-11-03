// O telefone do cliente com o seletor de indicativo do país (2/11/2026, reunião: "falta aí o seletor do país"; o envio da proposta
// dava «inválido» sem o +351). Os mesmos indicativos e a mesma forma de guardar do RH (src/lib/phone/indicativosRh.ts, do Miguel):
// o valor é uma só string «+<indicativo><dígitos>». Um número colado já com indicativo usa o dele.
import { useMemo, useState } from "react";
import { NativeSelect } from "@/components/ui/native-select";
import { DEFAULT_DIAL_CODE, joinInternationalPhone } from "@/lib/phone/splitInternationalPhone";
import { juntarTelefoneRh, opcoesDeIndicativo, partirTelefoneRh } from "@/lib/phone/indicativosRh";
import { cn } from "@/lib/utils";

/** O que está escrito à moda antiga (912 345 678, 00351…) lido como indicativo e dígitos; sem indicativo, o +351. */
export function partirTelefoneCliente(valor: string): { indicativo: string; digitos: string } {
  const t = (valor || "").trim();
  if (!t || t.includes("@")) return { indicativo: DEFAULT_DIAL_CODE, digitos: "" };
  const p = partirTelefoneRh(t);
  if (p.dialCode) return { indicativo: p.dialCode, digitos: p.digits };
  return { indicativo: DEFAULT_DIAL_CODE, digitos: t.replace(/\D/g, "") };
}

export function TelefoneIndicativo({ id, valor, mudar, sair, rotulo = "Telefone", classeInput, required, autoFocus }: {
  id?: string;
  valor: string;
  mudar: (v: string) => void;
  /** Ao sair do número (para quem grava no blur). */
  sair?: (v: string) => void;
  rotulo?: string;
  classeInput?: string;
  required?: boolean;
  autoFocus?: boolean;
}) {
  const inicial = partirTelefoneCliente(valor);
  const [escolhido, setEscolhido] = useState(inicial.indicativo);
  const partido = partirTelefoneCliente(valor);
  const indicativo = partido.digitos ? partido.indicativo : escolhido;
  const opcoes = useMemo(() => opcoesDeIndicativo(undefined, indicativo), [indicativo]);
  return (
    <div className="flex gap-2">
      <div className="w-32 shrink-0">
        <NativeSelect aria-label={`Indicativo do país – ${rotulo}`} value={indicativo} options={opcoes}
          onValueChange={(novo) => {
            setEscolhido(novo);
            const v = partido.digitos ? joinInternationalPhone(novo, partido.digitos) : "";
            mudar(v);
            if (v) sair?.(v);
          }} />
      </div>
      <input id={id} type="tel" inputMode="tel" autoComplete="tel-national" value={partido.digitos} placeholder="912 345 678"
        required={required} autoFocus={autoFocus} aria-label={id ? undefined : rotulo}
        className={cn("min-w-0 flex-1", classeInput ?? "h-11 rounded-lg border border-input bg-card px-3 text-[15px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/30")}
        onChange={(e) => { setEscolhido(indicativo); mudar(juntarTelefoneRh(indicativo, e.target.value)); }}
        onBlur={(e) => sair?.(juntarTelefoneRh(indicativo, e.target.value))} />
    </div>
  );
}

/** O telefone do negócio («Quem pede»): escreve-se aqui e grava-se no negócio ao sair do número ou ao mudar o indicativo. */
export function TelefoneComRascunho({ id, d, run, classe }: { id?: string; d: { tel: string }; run: (fn: () => void) => void; classe?: string }) {
  const [v, setV] = useState(d.tel);
  const gravar = (x: string) => { const t = x.trim(); if (t && t !== d.tel) run(() => { d.tel = t; }); };
  return <TelefoneIndicativo id={id} valor={v} mudar={setV} sair={gravar} classeInput={classe} />;
}
