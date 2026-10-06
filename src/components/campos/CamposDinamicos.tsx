import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { DefCampo } from "@/lib/campos/catalogo";
import { condicaoCumprida, type ValoresFormulario } from "@/lib/campos/definicoes";

interface CamposDinamicosProps {
  campos: readonly DefCampo[];
  valores: ValoresFormulario;
  onChange: (valores: ValoresFormulario) => void;
  erros?: Record<string, string>;
  /** Valores dos campos de sistema, para as condições "só aparece se". */
  contexto?: Record<string, unknown>;
  idPrefix: string;
  disabled?: boolean;
  className?: string;
}

// Valor do rádio para "não indicado" (o Radix não aceita value="").
const NAO_INDICADO = "__nd";

/**
 * Formulário dos campos da empresa (cfg_campos), montado a partir da
 * definição. Campos fechados sempre que possível: sim/não e escolhas curtas
 * como botões, escolhas longas como lista. A validação é a de
 * validarValores — este componente só mostra os erros que o pai lhe passa.
 */
export const CamposDinamicos = ({
  campos, valores, onChange, erros, contexto, idPrefix, disabled, className,
}: CamposDinamicosProps) => {
  const ctx = { ...(contexto ?? {}), ...valores };
  const visiveis = campos.filter((d) => d.ativo && !d.sistema && condicaoCumprida(d, ctx));
  if (!visiveis.length) return null;

  const set = (chave: string, v: string | boolean | undefined) => {
    const next = { ...valores };
    if (v === undefined || v === "") delete next[chave];
    else next[chave] = v;
    onChange(next);
  };

  const erro = (d: DefCampo) =>
    erros?.[d.chave] ? <p id={`${idPrefix}_${d.chave}_erro`} className="text-xs text-destructive">{erros[d.chave]}</p> : null;

  const etiqueta = (d: DefCampo, htmlFor?: string) => (
    <Label htmlFor={htmlFor} id={`${idPrefix}_${d.chave}_label`} className="text-xs">
      {d.rotulo}
      {d.obrigatorio && <span className="text-destructive" aria-hidden> *</span>}
    </Label>
  );

  const ajuda = (d: DefCampo) => (d.ajuda ? <p className="text-xs text-muted-foreground">{d.ajuda}</p> : null);

  const campo = (d: DefCampo) => {
    const id = `${idPrefix}_${d.chave}`;
    const temErro = !!erros?.[d.chave];
    const v = valores[d.chave];

    if (d.tipo === "sim_nao" || (d.tipo === "escolha" && d.opcoes.length <= 4)) {
      const opcoes = d.tipo === "sim_nao"
        ? [{ valor: "true", rotulo: "Sim" }, { valor: "false", rotulo: "Não" }]
        : d.opcoes;
      const atual = v === undefined ? NAO_INDICADO : String(v);
      return (
        <div key={d.chave} className="space-y-1 sm:col-span-2">
          {etiqueta(d)}
          <RadioGroup
            aria-labelledby={`${idPrefix}_${d.chave}_label`}
            aria-invalid={temErro}
            className="flex flex-wrap gap-x-4 gap-y-1"
            value={atual}
            onValueChange={(x) => set(d.chave, x === NAO_INDICADO ? undefined : d.tipo === "sim_nao" ? x === "true" : x)}
            disabled={disabled}
          >
            {[{ valor: NAO_INDICADO, rotulo: "Não indicado" }, ...opcoes].map((o) => (
              <div key={o.valor} className="flex items-center gap-1.5">
                <RadioGroupItem value={o.valor} id={`${id}_${o.valor}`} />
                <Label htmlFor={`${id}_${o.valor}`} className="text-sm font-normal">{o.rotulo}</Label>
              </div>
            ))}
          </RadioGroup>
          {ajuda(d)}
          {erro(d)}
        </div>
      );
    }

    if (d.tipo === "escolha") {
      return (
        <div key={d.chave} className="space-y-1">
          {etiqueta(d, id)}
          <NativeSelect
            id={id}
            value={typeof v === "string" ? v : ""}
            onValueChange={(x) => set(d.chave, x)}
            options={[{ value: "", label: "Não indicado" }, ...d.opcoes.map((o) => ({ value: o.valor, label: o.rotulo }))]}
            disabled={disabled}
            aria-invalid={temErro}
          />
          {ajuda(d)}
          {erro(d)}
        </div>
      );
    }

    if (d.tipo === "texto_longo") {
      return (
        <div key={d.chave} className="space-y-1 sm:col-span-2">
          {etiqueta(d, id)}
          <Textarea
            id={id}
            rows={3}
            value={typeof v === "string" ? v : ""}
            onChange={(e) => set(d.chave, e.target.value)}
            disabled={disabled}
            aria-invalid={temErro}
            aria-describedby={temErro ? `${id}_erro` : undefined}
            className={temErro ? "border-destructive focus-visible:ring-destructive" : undefined}
          />
          {ajuda(d)}
          {erro(d)}
        </div>
      );
    }

    // numero, texto, data
    return (
      <div key={d.chave} className="space-y-1">
        {etiqueta(d, id)}
        <div className="relative">
          <Input
            id={id}
            type={d.tipo === "data" ? "date" : "text"}
            inputMode={d.tipo === "numero" ? (d.casas_decimais > 0 ? "decimal" : "numeric") : undefined}
            value={typeof v === "string" ? v : ""}
            onChange={(e) => set(d.chave, e.target.value)}
            disabled={disabled}
            aria-invalid={temErro}
            aria-describedby={temErro ? `${id}_erro` : undefined}
            className={cn(d.unidade && "pr-12", temErro && "border-destructive focus-visible:ring-destructive")}
          />
          {d.unidade && (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              {d.unidade}
            </span>
          )}
        </div>
        {ajuda(d)}
        {erro(d)}
      </div>
    );
  };

  return <div className={cn("grid grid-cols-1 sm:grid-cols-2 gap-3 items-start", className)}>{visiveis.map(campo)}</div>;
};
