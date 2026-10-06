import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { CamposDinamicos } from "@/components/campos/CamposDinamicos";
import { CATALOGO_SISTEMA, type DefCampo } from "@/lib/campos/catalogo";
import {
  rotulo as rotuloEmpresa,
  rotuloOpcao,
  seccoesExtra,
  visivel,
  type FichaCombinada,
  type ValoresFormulario,
} from "@/lib/campos/definicoes";
import {
  CAMPOS_EXTERIOR,
  CAMPOS_INTERIOR,
  FICHA_TECNICA_VALORES_VAZIOS,
  LIMITES_FICHA_TECNICA,
  TIPOLOGIAS,
  comprimentoTexto,
  type ErrosFichaTecnica,
  type FichaTecnicaValores,
} from "@/lib/addresses/fichaTecnicaEdificio";

interface FichaTecnicaCamposProps {
  valor: FichaTecnicaValores;
  onChange: (valor: FichaTecnicaValores) => void;
  erros?: ErrosFichaTecnica;
  idPrefix: string;
  disabled?: boolean;
  /**
   * Secções abertas ao início. Por omissão abre-se cada secção que já tenha
   * dados; uma secção com erros abre-se sempre.
   */
  defaultOpen?: boolean;
  /**
   * Configuração da empresa (useCamposEmpresa().fichas.local): rótulos,
   * campos escondidos e campos da empresa. Sem ela, a ficha de sempre.
   */
  config?: FichaCombinada;
  /** Valores dos campos da empresa (cfg_campos). */
  extra?: ValoresFormulario;
  onExtraChange?: (extra: ValoresFormulario) => void;
  errosExtra?: Record<string, string>;
  /** Nome que a empresa dá ao "Local" (cfg_empresa.termos.local.singular). */
  termoLocal?: string;
}

type Seccao = "exterior" | "interior";

// Valor do rádio para "não indicado" (o Radix não aceita value="").
const NAO_INDICADO = "nd";

type CampoRadio =
  | "acesso" | "estacionamento" | "zona_estacionamento"
  | "tipologia" | "eletrica" | "gas" | "amianto";
type CampoNumero =
  | "impacto_percent" | "n_elevadores" | "n_andares" | "n_fracoes_por_andar"
  | "n_divisoes" | "n_casas_banho" | "ano_construcao";
type CampoSwitch = "tem_elevador" | "quadro_diferencial" | "habitada_durante_obra" | "animais";

const seccaoTemDados = (valor: FichaTecnicaValores, seccao: Seccao) =>
  (seccao === "exterior" ? CAMPOS_EXTERIOR : CAMPOS_INTERIOR).some(
    (c) => valor[c] !== FICHA_TECNICA_VALORES_VAZIOS[c] && valor[c] !== "",
  );

const seccaoTemErros = (erros: ErrosFichaTecnica | undefined, seccao: Seccao) => {
  if (!erros) return false;
  const campos: readonly string[] = seccao === "exterior" ? [...CAMPOS_EXTERIOR, "piso"] : CAMPOS_INTERIOR;
  return Object.keys(erros).some((k) => campos.includes(k) && !!erros[k as keyof ErrosFichaTecnica]);
};

/**
 * "Ficha do local" da morada de entrega, em duas secções colapsáveis:
 * Exterior — edifício e acessos — e Interior — a casa. Controlada (o pai
 * guarda o valor e os erros — ver validarFichaTecnica). O piso não está aqui:
 * é o campo "Andar" da morada.
 */
export const FichaTecnicaCampos = ({
  valor, onChange, erros, idPrefix, disabled, defaultOpen,
  config, extra, onExtraChange, errosExtra, termoLocal,
}: FichaTecnicaCamposProps) => {
  const { t } = useTranslation();
  const k = (chave: string) => t(`deliveryAddresses.building.${chave}`);

  // Configuração da empresa (sem ela, tudo como sempre).
  const vis = (campo: string) => visivel(config, campo);
  const rot = (campo: string, porOmissao: string) => rotuloEmpresa(config, campo, porOmissao);
  const opc = (campo: string, v: string, porOmissao: string) => rotuloOpcao(config, campo, v, porOmissao);
  const ajudaEmpresa = (campo: string) => {
    const d = config?.sistema[campo];
    const base = CATALOGO_SISTEMA.local.find((x) => x.chave === campo);
    return d?.ajuda && d.ajuda !== base?.ajuda ? <p className="text-xs text-muted-foreground">{d.ajuda}</p> : null;
  };
  const valoresExtra = extra ?? {};
  const extrasDe = (seccao: string): DefCampo[] => (config ? config.extra.filter((d) => d.seccao === seccao) : []);
  const outrasSeccoes = config ? seccoesExtra(config).filter((x) => x.chave !== "exterior" && x.chave !== "interior") : [];
  const extraTemDados = (campos: readonly DefCampo[]) =>
    campos.some((d) => valoresExtra[d.chave] !== undefined && valoresExtra[d.chave] !== "");
  // Contexto para as condições "só aparece se" sobre campos de sistema.
  const contexto: Record<string, unknown> = Object.fromEntries(
    Object.entries(valor).filter(([, v]) => v !== ""),
  );

  const [abertas, setAbertas] = useState<Record<string, boolean>>(() => ({
    exterior: defaultOpen ?? (seccaoTemDados(valor, "exterior") || extraTemDados(extrasDe("exterior"))),
    interior: defaultOpen ?? (seccaoTemDados(valor, "interior") || extraTemDados(extrasDe("interior"))),
    ...Object.fromEntries(outrasSeccoes.map((x) => [x.chave, defaultOpen ?? extraTemDados(x.campos)])),
  }));

  const set = <K extends keyof FichaTecnicaValores>(campo: K, v: FichaTecnicaValores[K]) => {
    const next: FichaTecnicaValores = { ...valor, [campo]: v };
    // Coerência: tirar o que deixa de fazer sentido.
    if (campo === "acesso" && v !== "dificil") next.impacto_percent = "";
    if (campo === "tem_elevador" && v === false) next.n_elevadores = "";
    if (campo === "estacionamento" && (v === "" || v === "sem_estacionamento")) next.zona_estacionamento = "";
    onChange(next);
  };

  const erro = (campo: keyof ErrosFichaTecnica) =>
    erros?.[campo] ? <p id={`${idPrefix}_${campo}_erro`} className="text-xs text-destructive">{erros[campo]}</p> : null;

  const radios = <K extends CampoRadio>(
    campo: K,
    label: string,
    opcoes: { value: Exclude<FichaTecnicaValores[K], "">; label: string }[],
  ) => !vis(campo) ? null : (
    <div className="space-y-1">
      <Label className="text-xs" id={`${idPrefix}_${campo}_label`}>{rot(campo, label)}</Label>
      <RadioGroup
        aria-labelledby={`${idPrefix}_${campo}_label`}
        aria-invalid={!!erros?.[campo]}
        className="flex flex-wrap gap-x-4 gap-y-1"
        value={valor[campo] || NAO_INDICADO}
        onValueChange={(v) => set(campo, (v === NAO_INDICADO ? "" : v) as FichaTecnicaValores[K])}
        disabled={disabled}
      >
        {[{ value: NAO_INDICADO, label: k("notSet") }, ...opcoes.map((o) => ({ ...o, label: opc(campo, o.value, o.label) }))].map((o) => (
          <div key={o.value} className="flex items-center gap-1.5">
            <RadioGroupItem value={o.value} id={`${idPrefix}_${campo}_${o.value}`} />
            <Label htmlFor={`${idPrefix}_${campo}_${o.value}`} className="text-sm font-normal">{o.label}</Label>
          </div>
        ))}
      </RadioGroup>
      {ajudaEmpresa(campo)}
      {erro(campo)}
    </div>
  );

  const caixa = (
    campo: CampoNumero | "area_util_m2",
    label: string,
    input: { inputMode: "numeric" | "decimal"; min?: number; max?: number; unidade?: string },
    extraDisabled?: boolean,
  ) => {
    const id = `${idPrefix}_${campo}`;
    const temErro = !!erros?.[campo];
    if (!vis(campo)) return null;
    return (
      <div className="space-y-1">
        <Label htmlFor={id} className="text-xs">{rot(campo, label)}</Label>
        <div className="relative">
          <Input
            id={id}
            // A área aceita vírgula decimal ("95,5"): campo de texto.
            type={input.inputMode === "decimal" ? "text" : "number"}
            inputMode={input.inputMode}
            step={input.inputMode === "numeric" ? 1 : undefined}
            min={input.min}
            max={input.max}
            value={valor[campo]}
            onChange={(e) => set(campo, e.target.value)}
            disabled={disabled || extraDisabled}
            aria-invalid={temErro}
            aria-describedby={temErro ? `${id}_erro` : undefined}
            className={cn(input.unidade && "pr-10", temErro && "border-destructive focus-visible:ring-destructive")}
          />
          {input.unidade && (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              {input.unidade}
            </span>
          )}
        </div>
        {ajudaEmpresa(campo)}
        {erro(campo)}
      </div>
    );
  };

  const inteiro = (campo: CampoNumero, label: string, extraDisabled?: boolean, max?: number) => {
    const limite = LIMITES_FICHA_TECNICA[campo] as { min: number; max?: number };
    return caixa(campo, label, { inputMode: "numeric", min: limite.min, max: max ?? limite.max }, extraDisabled);
  };

  const interruptor = (campo: CampoSwitch, label: string) => !vis(campo) ? null : (
    <div className="space-y-1">
      <Label htmlFor={`${idPrefix}_${campo}`} className="text-xs">{rot(campo, label)}</Label>
      <div className="flex h-10 items-center">
        <Switch
          id={`${idPrefix}_${campo}`}
          checked={valor[campo]}
          onCheckedChange={(v) => set(campo, v)}
          disabled={disabled}
        />
      </div>
      {ajudaEmpresa(campo)}
    </div>
  );

  const lista = <K extends "pavimento" | "canalizacao">(
    campo: K,
    label: string,
    opcoes: { value: Exclude<FichaTecnicaValores[K], "">; label: string }[],
  ) => {
    const id = `${idPrefix}_${campo}`;
    if (!vis(campo)) return null;
    return (
      <div className="space-y-1">
        <Label htmlFor={id} className="text-xs">{rot(campo, label)}</Label>
        <NativeSelect
          id={id}
          value={valor[campo]}
          onValueChange={(v) => set(campo, v as FichaTecnicaValores[K])}
          options={[{ value: "", label: k("notSet") }, ...opcoes.map((o) => ({ ...o, label: opc(campo, o.value, o.label) }))]}
          disabled={disabled}
          aria-invalid={!!erros?.[campo]}
        />
        {ajudaEmpresa(campo)}
        {erro(campo)}
      </div>
    );
  };

  const seccao = (s: string, titulo: string, conteudo: ReactNode) => {
    const padrao = s === "exterior" || s === "interior";
    const camposExtra = padrao ? extrasDe(s) : outrasSeccoes.find((x) => x.chave === s)?.campos ?? [];
    const comErros = (padrao && seccaoTemErros(erros, s as Seccao)) || camposExtra.some((d) => !!errosExtra?.[d.chave]);
    const open = abertas[s] || comErros;
    return (
      <Collapsible
        key={s}
        open={open}
        onOpenChange={(o) => setAbertas((prev) => ({ ...prev, [s]: o }))}
        className="rounded-md border"
        data-testid={`${idPrefix}_${s}`}
      >
        <CollapsibleTrigger
          type="button"
          className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium"
          disabled={comErros}
        >
          {titulo}
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 px-3 pb-3">{conteudo}</CollapsibleContent>
      </Collapsible>
    );
  };

  const anoAtual = new Date().getFullYear();
  const notasLen = comprimentoTexto(valor.notas_interior.trim());

  const blocoExtra = (campos: readonly DefCampo[]) =>
    campos.length > 0 ? (
      <CamposDinamicos
        campos={campos}
        valores={valoresExtra}
        onChange={(v) => onExtraChange?.(v)}
        erros={errosExtra}
        contexto={contexto}
        idPrefix={`${idPrefix}_x`}
        disabled={disabled}
      />
    ) : null;

  const exterior = (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-start">
        <div className="sm:col-span-3">
          {radios("acesso", k("access"), [
            { value: "facil", label: k("accessEasy") },
            { value: "dificil", label: k("accessHard") },
          ])}
        </div>
        {vis("acesso") && inteiro("impacto_percent", k("impact"), valor.acesso !== "dificil")}
      </div>
      {radios("estacionamento", k("parking"), [
        { value: "pago", label: k("parkingPaid") },
        { value: "nao_pago", label: k("parkingFree") },
        { value: "sem_estacionamento", label: k("parkingNone") },
      ])}
      {vis("estacionamento") && ((valor.estacionamento && valor.estacionamento !== "sem_estacionamento") || valor.zona_estacionamento)
        ? radios("zona_estacionamento", k("parkingZone"), [
            { value: "verde", label: k("zoneGreen") },
            { value: "amarela", label: k("zoneYellow") },
            { value: "vermelha", label: k("zoneRed") },
          ])
        : null}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
        {interruptor("tem_elevador", k("hasElevator"))}
        {vis("tem_elevador") && inteiro("n_elevadores", k("elevators"), !valor.tem_elevador)}
        {inteiro("n_andares", k("floors"))}
        {inteiro("n_fracoes_por_andar", k("unitsPerFloor"))}
      </div>
      {erros?.piso
        ? <p className="text-xs text-destructive">{erros.piso}</p>
        : vis("n_andares") ? <p className="text-xs text-muted-foreground">{k("floorHint")}</p> : null}
      {blocoExtra(extrasDe("exterior"))}
    </>
  );

  const interior = (
    <>
      {radios("tipologia", k("typology"), TIPOLOGIAS.map((tp) => ({ value: tp, label: tp })))}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-start">
        {caixa("area_util_m2", k("usableArea"), { inputMode: "decimal", unidade: "m²" })}
        {inteiro("n_divisoes", k("rooms"))}
        {inteiro("n_casas_banho", k("bathrooms"))}
        {inteiro("ano_construcao", k("yearBuilt"), false, anoAtual)}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
        {lista("pavimento", k("flooring"), [
          { value: "ceramico", label: k("flooringCeramic") },
          { value: "madeira", label: k("flooringWood") },
          { value: "flutuante", label: k("flooringLaminate") },
          { value: "vinilico", label: k("flooringVinyl") },
          { value: "outro", label: k("flooringOther") },
        ])}
        {lista("canalizacao", k("plumbing"), [
          { value: "ferro", label: k("plumbingIron") },
          { value: "pvc", label: k("plumbingPvc") },
          { value: "multicamada", label: k("plumbingMultilayer") },
          { value: "cobre", label: k("plumbingCopper") },
          { value: "misto", label: k("plumbingMixed") },
          { value: "nao_sei", label: k("dontKnow") },
        ])}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-start">
        <div className="sm:col-span-3">
          {radios("eletrica", k("electrical"), [
            { value: "antiga", label: k("electricalOld") },
            { value: "renovada", label: k("electricalRenovated") },
          ])}
        </div>
        {interruptor("quadro_diferencial", k("rcd"))}
      </div>
      {radios("gas", k("gas"), [
        { value: "canalizado", label: k("gasPiped") },
        { value: "garrafa", label: k("gasBottle") },
        { value: "sem", label: k("gasNone") },
      ])}
      {radios("amianto", k("asbestos"), [
        { value: "sim", label: k("yes") },
        { value: "nao", label: k("no") },
        { value: "nao_sei", label: k("dontKnow") },
      ])}
      <div className="grid grid-cols-2 gap-3">
        {interruptor("habitada_durante_obra", k("occupied"))}
        {interruptor("animais", k("pets"))}
      </div>
      {vis("notas_interior") && <div className="space-y-1">
        <Label htmlFor={`${idPrefix}_notas_interior`} className="text-xs">{rot("notas_interior", k("interiorNotes"))}</Label>
        <Textarea
          id={`${idPrefix}_notas_interior`}
          rows={3}
          value={valor.notas_interior}
          onChange={(e) => set("notas_interior", e.target.value)}
          disabled={disabled}
          aria-invalid={!!erros?.notas_interior}
          aria-describedby={erros?.notas_interior ? `${idPrefix}_notas_interior_erro` : undefined}
          className={erros?.notas_interior ? "border-destructive focus-visible:ring-destructive" : undefined}
        />
        <div className="flex justify-between gap-2">
          <div>{erro("notas_interior")}</div>
          <p className={cn("text-xs text-muted-foreground", notasLen > LIMITES_FICHA_TECNICA.notas_interior.max && "text-destructive")}>
            {notasLen}/{LIMITES_FICHA_TECNICA.notas_interior.max}
          </p>
        </div>
      </div>}
      {blocoExtra(extrasDe("interior"))}
      <p className="text-xs text-muted-foreground">{k("switchHint")}</p>
    </>
  );

  return (
    <div className="space-y-2" role="group" aria-labelledby={`${idPrefix}_titulo`}>
      <p id={`${idPrefix}_titulo`} className="text-sm font-medium">
        {termoLocal && termoLocal !== "Local" ? `${k("title")} — ${termoLocal}` : k("title")}
      </p>
      {(CAMPOS_EXTERIOR.some((c) => vis(c)) || extrasDe("exterior").length > 0) && seccao("exterior", k("exterior"), exterior)}
      {(CAMPOS_INTERIOR.some((c) => vis(c)) || extrasDe("interior").length > 0) && seccao("interior", k("interior"), interior)}
      {outrasSeccoes.map((x) => seccao(x.chave, x.rotulo, blocoExtra(x.campos)))}
    </div>
  );
};
