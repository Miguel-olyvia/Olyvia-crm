/**
 * O passo guiado de um ativo de serviço: «Escolha o equipamento do catálogo a que esta máquina corresponde», com pesquisa e uma
 * escolha única (botões de opção: as setas do teclado mudam de opção). Em erro, o aviso fica ligado à pesquisa (`aria-invalid`), que
 * é onde o foco cai.
 */
import { useId, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { normalizarTexto } from "./lib/filtrarAtivos";
import type { OpcaoEquipamento } from "./lib/tipos";

interface Props {
  id: string;
  opcoes: readonly OpcaoEquipamento[];
  valor: string;
  onChange: (id: string) => void;
  erro?: string | null;
}

export function SeletorEquipamento({ id, opcoes, valor, onChange, erro }: Props) {
  const { t } = useTranslation();
  const [procura, setProcura] = useState("");
  const idErro = useId();
  const idPasso = useId();
  const visiveis = useMemo(() => {
    const p = normalizarTexto(procura);
    return opcoes.filter((o) => p === "" || normalizarTexto(o.nome).includes(p));
  }, [opcoes, procura]);

  const vida = (o: OpcaoEquipamento): string =>
    o.vidaAnos ? t("ativos.campo.modeloAnos", { n: o.vidaAnos }) : o.vidaHoras ? t("ativos.campo.modeloHoras", { n: o.vidaHoras }) : "";

  return (
    <fieldset className="space-y-3" aria-describedby={idPasso}>
      <legend className="text-sm font-medium leading-none">
        {t("ativos.campo.modelo")}
        <span aria-hidden="true" className="ml-0.5 text-destructive">*</span>
        <span className="sr-only"> ({t("ativos.campo.obrigatorio")})</span>
      </legend>
      <p id={idPasso} className="text-sm text-muted-foreground">{t("ativos.passo.modelo")}</p>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-procurar`}>{t("ativos.campo.modeloPesquisa")}</Label>
        <Input
          id={`${id}-procurar`} type="search" value={procura} placeholder={t("ativos.campo.modeloPesquisaMarca")} autoComplete="off"
          aria-invalid={erro ? true : undefined} aria-describedby={erro ? idErro : undefined}
          className={cn("min-h-11", erro && "border-destructive")} onChange={(e) => setProcura(e.target.value)}
        />
      </div>
      <p aria-live="polite" className="text-xs text-muted-foreground">
        {visiveis.length === 0 ? t("ativos.campo.modeloNenhum") : visiveis.length === 1 ? t("ativos.campo.modeloContagem1") : t("ativos.campo.modeloContagem", { n: visiveis.length })}
      </p>
      <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
        {visiveis.map((o) => (
          <label
            key={o.id}
            className={cn(
              "flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-muted motion-reduce:transition-none",
              "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:checked]:border-primary has-[:checked]:bg-primary/5",
            )}
          >
            <input type="radio" name={id} value={o.id} checked={valor === o.id} onChange={() => onChange(o.id)} className="h-4 w-4 shrink-0 accent-primary" />
            <span className="min-w-0 flex-1 font-medium">{o.nome}</span>
            {vida(o) && <span className="shrink-0 text-xs text-muted-foreground">{vida(o)}</span>}
          </label>
        ))}
      </div>
      {erro && <p id={idErro} className="text-xs text-destructive">{erro}</p>}
    </fieldset>
  );
}
