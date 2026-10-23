// Os campos do painel "Nova pessoa". Reaproveitam os campos do formulário real (`form/Campos`: etiqueta ligada ao controlo,
// aria-required, aria-invalid e aria-describedby para a ajuda e o erro) e põem por cima uma linha fina com duas etiquetas de
// texto (nunca só cor): "obrigatório" e a posição na configuração da admissão ("no convite", "na ficha", "opcional").
import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { CampoPais, CampoSelect, CampoTexto, type OpcaoSelect } from "@/components/rh-exemplo/form/Campos";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { posicaoDoCampo, useNova } from "./contextoNova";
import type { GrupoNova } from "./tiposNova";

export const GRELHA = "grid gap-x-6 gap-y-2 sm:grid-cols-2";

interface BaseProps {
  /** O grupo do formulário e a chave do valor. */
  g: GrupoNova;
  k: string;
  /** O id do controlo (o mesmo que a validação devolve). */
  id: string;
  rotulo: string;
  /** O código da configuração da admissão, se o campo lá existe. */
  codigo?: string;
  ajuda?: string;
  largo?: boolean;
}

function useValor(g: GrupoNova, k: string): string {
  const { valores } = useNova();
  return String((valores[g] as unknown as Record<string, unknown>)[k] ?? "");
}

function useDefinir(g: GrupoNova, k: string): (valor: string) => void {
  const { alterar } = useNova();
  return (valor) => (alterar as (grupo: GrupoNova, patch: Record<string, unknown>) => void)(g, { [k]: valor });
}

/** A linha de um campo: linha fina por cima e as etiquetas "obrigatório" e de posição. */
export function LinhaCampo({ id, codigo, largo, children }: { id: string; codigo?: string; largo?: boolean; children: ReactNode }) {
  const { t } = useTranslation();
  const ctx = useNova();
  const obrigatorio = ctx.obrigatorio(id);
  const posicao = posicaoDoCampo(ctx, codigo, id);
  return (
    <div className={cn("border-t border-border/60 pt-1.5 pb-2", largo && "sm:col-span-2")}>
      <div aria-hidden="true" className="flex min-h-5 flex-wrap justify-end gap-1.5 text-xs text-muted-foreground">
        {obrigatorio && <span className="font-medium text-foreground">{t("rhNova.obrigatorio")}</span>}
        {posicao && <span className="rounded-sm border border-border px-1.5">{t(`rhNova.pos.${posicao}`)}</span>}
      </div>
      {children}
    </div>
  );
}

interface TextoProps extends BaseProps {
  tipo?: "text" | "email" | "date" | "tel" | "number";
  placeholder?: string;
  min?: string | number;
  max?: string | number;
}

export function CampoT({ g, k, id, rotulo, codigo, ajuda, largo, tipo, placeholder, min, max }: TextoProps) {
  const ctx = useNova();
  const definir = useDefinir(g, k);
  return (
    <LinhaCampo id={id} codigo={codigo} largo={largo}>
      <CampoTexto
        id={id} label={rotulo} valor={useValor(g, k)} onChange={definir} tipo={tipo} ajuda={ajuda} placeholder={placeholder}
        erro={ctx.erro(id)} obrigatorio={ctx.obrigatorio(id)} min={min} max={max}
      />
    </LinhaCampo>
  );
}

interface SelectProps extends BaseProps {
  opcoes: OpcaoSelect[];
  /** Com texto, o campo aceita ficar sem escolha (é o rótulo dessa opção). */
  vazio?: string;
  placeholder?: string;
}

export function CampoS({ g, k, id, rotulo, codigo, ajuda, largo, opcoes, vazio, placeholder }: SelectProps) {
  const ctx = useNova();
  const { t } = useTranslation();
  return (
    <LinhaCampo id={id} codigo={codigo} largo={largo}>
      <CampoSelect
        id={id} label={rotulo} valor={useValor(g, k)} onChange={useDefinir(g, k)} opcoes={opcoes} vazioLabel={vazio}
        placeholder={placeholder ?? t("rhNova.escolher")} ajuda={ajuda} erro={ctx.erro(id)} obrigatorio={ctx.obrigatorio(id)}
      />
    </LinhaCampo>
  );
}

export function CampoP({ g, k, id, rotulo, codigo, ajuda, largo }: BaseProps) {
  const ctx = useNova();
  return (
    <LinhaCampo id={id} codigo={codigo} largo={largo}>
      <CampoPais
        id={id} label={rotulo} valor={useValor(g, k)} onChange={useDefinir(g, k)} ajuda={ajuda} erro={ctx.erro(id)}
        obrigatorio={ctx.obrigatorio(id)}
      />
    </LinhaCampo>
  );
}

/** Um interruptor sim/não guardado como texto "sim"/"nao" ou como booleano, conforme o grupo. */
export function CampoI({ g, k, id, rotulo, ajuda, largo }: Omit<BaseProps, "codigo">) {
  const { valores, alterar } = useNova();
  const atual = (valores[g] as unknown as Record<string, unknown>)[k] === true;
  const ajudaId = ajuda ? `${id}-ajuda` : undefined;
  return (
    <LinhaCampo id={id} largo={largo}>
      <div className="flex min-h-11 items-start justify-between gap-4 rounded-md border p-3">
        <div className="space-y-0.5">
          <Label htmlFor={id}>{rotulo}</Label>
          {ajuda && <p id={ajudaId} className="text-xs text-muted-foreground">{ajuda}</p>}
        </div>
        <Switch
          id={id} checked={atual} aria-describedby={ajudaId}
          onCheckedChange={(v) => (alterar as (grupo: GrupoNova, patch: Record<string, unknown>) => void)(g, { [k]: v })}
        />
      </div>
    </LinhaCampo>
  );
}

/** Texto longo (adaptações, observações). */
export function CampoLongo({ g, k, id, rotulo, ajuda }: Omit<BaseProps, "codigo" | "largo">) {
  const ctx = useNova();
  const definir = useDefinir(g, k);
  const erro = ctx.erro(id);
  return (
    <LinhaCampo id={id} largo>
      <div className="space-y-1.5">
        <Label htmlFor={id}>{rotulo}</Label>
        <Textarea
          id={id} rows={3} value={useValor(g, k)} onChange={(e) => definir(e.target.value)} aria-invalid={erro ? true : undefined}
          aria-describedby={erro ? `${id}-erro` : ajuda ? `${id}-ajuda` : undefined}
        />
        {ajuda && !erro && <p id={`${id}-ajuda`} className="text-xs text-muted-foreground">{ajuda}</p>}
        {erro && <p id={`${id}-erro`} className="text-xs text-destructive">{erro}</p>}
      </div>
    </LinhaCampo>
  );
}
