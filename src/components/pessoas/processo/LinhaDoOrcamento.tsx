// Uma linha do editor do orçamento: o serviço (e a unidade), a quantidade, o preço unitário, o total da linha e "Tirar". Os campos levam
// o nome do serviço no rótulo (só para leitores de ecrã) para os nomes serem únicos, e o erro de cada um, em alerta, liga-se-lhe por
// `aria-describedby`, tal como a unidade (na quantidade) e o total da linha (nos dois). O total da linha é um texto simples, e não uma
// região live: anunciaria a cada tecla.
import { Trash2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FOCO } from "@/components/negocio-metas/estilos";
import { MensagemErro } from "../CamposDataHora";
import { MarcaObrigatorio } from "./MarcaObrigatorio";
import { CATALOGO } from "./catalogoTrabalhos";
import { eur } from "./formatoOrcamento";
import { nomeDaLinha } from "./nomesOrcamento";
import { entradaDoCalculo, idsDaLinha, type LinhaEditavel } from "./orcamentoForm";

const P = "pessoasPagina.quote.";

interface LinhaDoOrcamentoProps {
  /** A base dos ids do editor. */
  id: string;
  linha: LinhaEditavel;
  /** Os campos por corrigir (só depois de tentar guardar). */
  erros: { quantidade: boolean; preco: boolean };
  aoMudar: (parcial: Partial<Pick<LinhaEditavel, "quantidade" | "preco">>) => void;
  aoTirar: () => void;
}

export function LinhaDoOrcamento({ id, linha, erros, aoMudar, aoTirar }: LinhaDoOrcamentoProps) {
  const { t } = useTranslation();
  const ids = idsDaLinha(id, linha);
  const nome = nomeDaLinha(t, linha);
  const total = entradaDoCalculo([linha], "0").linhas[0];
  const idUnidade = `${ids.quantidade}-unidade`;
  const idTotal = `${id}-${linha.id}-total`;
  const campo = (chave: "quantidade" | "preco", valor: string) => (
    <div className="space-y-1">
      <div className="flex items-baseline">
        <Label htmlFor={ids[chave]} className="text-xs">
          {t(`${P}${chave === "quantidade" ? "quantity" : "price"}`)}
          <span className="sr-only"> {t(`${P}forWork`, { work: nome })}</span>
        </Label>
        <MarcaObrigatorio />
      </div>
      <Input
        id={ids[chave]} value={valor} inputMode="decimal" autoComplete="off" aria-required="true" aria-invalid={erros[chave] || undefined}
        aria-describedby={[chave === "quantidade" ? idUnidade : null, idTotal, erros[chave] ? `${ids[chave]}-erro` : null].filter(Boolean).join(" ")}
        className={cn("min-h-11 w-28 text-right tabular-nums", FOCO, erros[chave] && "border-destructive")}
        onChange={(e) => aoMudar({ [chave]: e.target.value })}
      />
      {erros[chave] && <MensagemErro id={`${ids[chave]}-erro`} texto={t(`${P}error.${chave === "quantidade" ? "quantity" : "price"}`, { work: nome })} />}
    </div>
  );
  return (
    <li className="flex flex-wrap items-start gap-x-4 gap-y-2 py-3">
      <div className="min-w-40 flex-1">
        <p className="text-sm font-medium text-foreground">{nome}</p>
        <p id={idUnidade} className="text-xs text-muted-foreground">{t(`businessGoals.new.unit.${CATALOGO[linha.trabalho].unidade}`)}</p>
      </div>
      {campo("quantidade", linha.quantidade)}
      {campo("preco", linha.preco)}
      <span id={idTotal} className="min-w-28 pt-7 text-right text-sm tabular-nums text-foreground">
        {t(`${P}lineTotal`, { value: eur(total.quantidade * total.precoUnitario) })}{" "}
        <span className="sr-only">{t(`${P}forWork`, { work: nome })}</span>
      </span>
      <Button type="button" variant="ghost" className={cn("mt-5 min-h-11 min-w-11 gap-1.5", FOCO)} aria-label={t(`${P}removeLabel`, { work: nome })} onClick={aoTirar}>
        <Trash2 className="h-4 w-4" aria-hidden="true" />
        {t(`${P}remove`)}
      </Button>
    </li>
  );
}
