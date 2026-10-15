// Filtros e pesquisa da lista: estado, tipo, origem, responsável, prazo a vencer e texto. Cada controlo tem etiqueta
// (visível só para o leitor de ecrã, para a barra ficar compacta).
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { useTranslation } from "@/hooks/useTranslation";
import { RESPONSAVEIS } from "../dados/exemplo";
import { SEM_FILTROS, SEM_RESPONSAVEL, TODOS, haFiltros, type FiltrosGestao } from "../lib/filtros";
import { ESTADOS, TIPOS } from "../lib/tipos";

interface BarraFiltrosProps {
  filtros: FiltrosGestao;
  onChange: (f: FiltrosGestao) => void;
}

interface SeletorProps {
  id: string;
  rotulo: string;
  valor: string;
  opcoes: { value: string; label: string }[];
  onValor: (v: string) => void;
}

function Seletor({ id, rotulo, valor, opcoes, onValor }: SeletorProps) {
  return (
    <div className="min-w-[9rem]">
      <label htmlFor={id} className="sr-only">{rotulo}</label>
      <NativeSelect id={id} className="h-11" value={valor} options={opcoes} onValueChange={onValor} />
    </div>
  );
}

export function BarraFiltros({ filtros, onChange }: BarraFiltrosProps) {
  const { t } = useTranslation();
  const mudar = (parcial: Partial<FiltrosGestao>): void => onChange({ ...filtros, ...parcial });
  const todos = (chave: string) => ({ value: TODOS, label: t(chave) });
  return (
    <div role="search" aria-label={t("cd.filtros.titulo")} className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[14rem] flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <label htmlFor="den-pesquisa" className="sr-only">{t("cd.filtros.pesquisa")}</label>
        <Input id="den-pesquisa" type="search" className="h-11 pl-9" placeholder={t("cd.filtros.pesquisa")} value={filtros.texto} onChange={(e) => mudar({ texto: e.target.value })} />
      </div>
      <Seletor id="den-f-estado" rotulo={t("cd.filtros.estado")} valor={filtros.estado}
        opcoes={[todos("cd.filtros.todosEstados"), ...ESTADOS.map((v) => ({ value: v, label: t(`cd.estado.${v}`) }))]}
        onValor={(v) => mudar({ estado: v as FiltrosGestao["estado"] })} />
      <Seletor id="den-f-tipo" rotulo={t("cd.filtros.tipo")} valor={filtros.tipo}
        opcoes={[todos("cd.filtros.todosTipos"), ...TIPOS.map((v) => ({ value: v, label: t(`cd.tipo.${v}`) }))]}
        onValor={(v) => mudar({ tipo: v as FiltrosGestao["tipo"] })} />
      <Seletor id="den-f-origem" rotulo={t("cd.filtros.origem")} valor={filtros.origem}
        opcoes={[todos("cd.filtros.todasOrigens"), { value: "anonima", label: t("cd.origem.anonima") }, { value: "identificada", label: t("cd.origem.identificada") }]}
        onValor={(v) => mudar({ origem: v as FiltrosGestao["origem"] })} />
      <Seletor id="den-f-resp" rotulo={t("cd.filtros.responsavel")} valor={filtros.responsavel}
        opcoes={[todos("cd.filtros.todosResponsaveis"), { value: SEM_RESPONSAVEL, label: t("cd.semResponsavel") }, ...RESPONSAVEIS.map((r) => ({ value: r.id, label: r.nome }))]}
        onValor={(v) => mudar({ responsavel: v })} />
      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
        <Checkbox checked={filtros.soPrazo} onCheckedChange={(v) => mudar({ soPrazo: v === true })} />
        {t("cd.filtros.soPrazo")}
      </label>
      {haFiltros(filtros) && (
        <Button type="button" variant="ghost" className="min-h-11" onClick={() => onChange(SEM_FILTROS)}>{t("cd.filtros.limpar")}</Button>
      )}
    </div>
  );
}
