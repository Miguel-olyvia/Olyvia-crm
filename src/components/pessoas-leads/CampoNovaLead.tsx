import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useOpcoesCampoNovaLead } from "@/hooks/pessoas/novaLead/useOpcoesCampoNovaLead";
import type { DefinicaoCampo } from "@/hooks/pessoas/novaLead/fluxoNovaLead";
import { useTranslation } from "@/hooks/useTranslation";
import { isPhoneField } from "@/lib/phone/isPhoneField";
import { TelefoneNovaLead } from "./TelefoneNovaLead";

const N = "pessoasPagina.real.newLead.";

interface CampoProps {
  campo: DefinicaoCampo;
  valor: unknown;
  aoMudar: (valor: unknown) => void;
  campanhaId: string | null;
  /** A mensagem de erro do campo: liga-se ao campo (aria-invalid e aria-describedby) e mostra-se por baixo. */
  erro?: string;
}

const normalizar = (v: string): string => v.trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

/**
 * Um campo do formulário (cópia de DynamicFormField, sem base: as opções de distrito vêm de useOpcoesCampoNovaLead). Cada campo tem o
 * rótulo ligado, a ajuda e o erro ligados por aria-describedby, e o erro marca-o com aria-invalid.
 */
export function CampoNovaLead({ campo, valor, aoMudar, campanhaId, erro }: CampoProps) {
  const { t } = useTranslation();
  const distritos = useOpcoesCampoNovaLead(campo.field_type, campanhaId);
  const id = `nl-campo-${campo.field_key}`;
  const idAjuda = `${id}-ajuda`;
  const idErro = `${id}-erro`;
  const descricao = [campo.help_text ? idAjuda : null, erro ? idErro : null].filter(Boolean).join(" ") || undefined;
  const comuns = { id, "aria-required": campo.is_required || undefined, "aria-invalid": erro ? true : undefined, "aria-describedby": descricao };
  const opcoes = campo.options?.options ?? [];
  const texto = typeof valor === "string" ? valor : valor == null ? "" : String(valor);

  const rotulo = (
    <Label htmlFor={id} id={`${id}-rotulo`}>
      {campo.field_label}
      {campo.is_required && (
        <>
          <span aria-hidden="true" className="ml-1 text-destructive">*</span>
          <span className="sr-only"> ({t(`${N}required`)})</span>
        </>
      )}
    </Label>
  );
  const rodape = (
    <>
      {campo.help_text && <p id={idAjuda} className="text-xs text-muted-foreground">{campo.help_text}</p>}
      {erro && <p id={idErro} className="text-xs text-destructive">{erro}</p>}
    </>
  );

  if (campo.field_type === "select" && campo.display_style === "checkbox" && opcoes.length > 0) {
    const escolhidos: string[] = Array.isArray(valor) ? (valor as string[]) : valor ? [String(valor)] : [];
    return (
      <fieldset className="space-y-2" aria-describedby={descricao} aria-invalid={erro ? true : undefined}>
        <legend className="text-sm font-medium leading-none">
          {campo.field_label}
          {campo.is_required && <span className="sr-only"> ({t(`${N}required`)})</span>}
        </legend>
        <div className="grid grid-cols-2 gap-2">
          {opcoes.map((opcao) => {
            const idOpcao = `${id}-${normalizar(opcao).replace(/\W+/g, "-")}`;
            return (
              <label key={opcao} htmlFor={idOpcao} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border p-2 hover:bg-muted/50">
                <Checkbox
                  id={idOpcao}
                  checked={escolhidos.includes(opcao)}
                  onCheckedChange={(marcado) => aoMudar(marcado ? [...escolhidos, opcao] : escolhidos.filter((v) => v !== opcao))}
                />
                <span className="text-sm">{opcao}</span>
              </label>
            );
          })}
        </div>
        {rodape}
      </fieldset>
    );
  }

  if (campo.field_type === "select" && opcoes.length > 0) {
    return (
      <div className="space-y-2">
        {rotulo}
        <NativeSelect {...comuns} value={texto} placeholder={campo.placeholder ?? t(`${N}field.select`)} onValueChange={aoMudar}
          options={opcoes.map((o) => ({ value: o, label: o }))} />
        {rodape}
      </div>
    );
  }

  if (campo.field_type === "ref_district") {
    // O valor guardado pode ser o id, o nome ou o nome com outra grafia: só o nome certo seleciona uma opção.
    const guardado = texto.trim();
    const escolhido = guardado && guardado !== "-"
      ? (distritos.find((d) => d.id === guardado) ?? distritos.find((d) => d.name === guardado) ?? distritos.find((d) => normalizar(d.name) === normalizar(guardado)))?.name ?? ""
      : "";
    return (
      <div className="space-y-2">
        {rotulo}
        <NativeSelect {...comuns} value={escolhido} placeholder={t(`${N}field.selectDistrict`)} onValueChange={aoMudar}
          options={distritos.map((d) => ({ value: d.name, label: d.name }))} />
        {rodape}
      </div>
    );
  }

  if (campo.field_type === "textarea") {
    return (
      <div className="space-y-2">
        {rotulo}
        <Textarea {...comuns} rows={3} value={texto} placeholder={campo.placeholder ?? undefined} onChange={(e) => aoMudar(e.target.value)} />
        {rodape}
      </div>
    );
  }

  if (campo.field_type === "boolean") {
    return (
      <div className="space-y-2">
        <div className="flex min-h-11 items-center justify-between gap-3">
          {rotulo}
          <Switch {...comuns} checked={valor === true} onCheckedChange={aoMudar} />
        </div>
        {rodape}
      </div>
    );
  }

  if (isPhoneField(campo) && campo.field_type !== "email") {
    return (
      <div className="space-y-2">
        {rotulo}
        <TelefoneNovaLead id={id} idRotulo={`${id}-rotulo`} valor={valor} aoMudar={aoMudar} obrigatorio={campo.is_required}
          placeholder={campo.placeholder} idDescricao={descricao} invalido={Boolean(erro)} />
        {rodape}
      </div>
    );
  }

  const tipo = campo.field_type === "email" ? "email" : campo.field_type === "date" ? "date" : campo.field_type === "number" ? "number" : "text";
  return (
    <div className="space-y-2">
      {rotulo}
      <Input {...comuns} type={tipo} value={texto} placeholder={campo.placeholder ?? (tipo === "email" ? "email@exemplo.pt" : undefined)}
        onChange={(e) => aoMudar(e.target.value)} />
      {rodape}
    </div>
  );
}
