import { useState } from "react";
import { CheckCircle2, FileDown, Hammer, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/utils";
import { hojeIso, type FaturaPorValidar } from "@/hooks/financeiro/financeiro";
import { formatarData } from "./formatar";

type Acao = { id: string; tipo: "validar" | "anular" } | null;

/**
 * "Por validar pagamento": faturas registadas à espera de o dinheiro entrar.
 * Validar cria o recibo; o 1.º pagamento do contrato avisa Operações e Armazém.
 * Anular é para um registo feito por engano (fatura ainda não paga).
 */
export function PorValidar({
  lista,
  podeValidar,
  podeAnular,
  aGravar,
  aoValidar,
  aoAnular,
  aoAbrirPdf,
}: {
  lista: FaturaPorValidar[];
  podeValidar: boolean;
  podeAnular: boolean;
  aGravar: string | null;
  aoValidar: (f: FaturaPorValidar, data: string) => Promise<boolean>;
  aoAnular: (f: FaturaPorValidar, motivo: string) => Promise<boolean>;
  aoAbrirPdf: (caminho: string) => void;
}) {
  const [acao, setAcao] = useState<Acao>(null);
  const [data, setData] = useState(hojeIso());
  const [motivo, setMotivo] = useState("");

  const abrir = (id: string, tipo: "validar" | "anular") => {
    setAcao({ id, tipo });
    setData(hojeIso());
    setMotivo("");
  };

  if (lista.length === 0) {
    return (
      <p className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
        Nenhuma fatura à espera de pagamento.
      </p>
    );
  }

  return (
    <ul className="divide-y rounded-md border">
      {lista.map((f) => {
        const ocupada = aGravar === f.invoice_id;
        const aberta = acao?.id === f.invoice_id ? acao.tipo : null;
        return (
          <li key={f.invoice_id} className="px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-0.5">
                <p className="truncate font-medium">
                  <span className="font-mono">{f.numero}</span> · {f.cliente_nome}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatarData(f.data)} · {f.origem}
                  {f.atcud && <> · ATCUD {f.atcud}</>} · <span className="font-mono">{f.contrato_numero ?? "—"}</span>
                </p>
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  <Badge variant="secondary">{f.tranche_descricao}</Badge>
                  {f.dispara_obra && (
                    <Badge variant="outline" className="gap-1 border-emerald-500/50 text-emerald-700">
                      <Hammer className="h-3 w-3" /> 1.º pagamento: cria a obra
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-semibold tabular-nums">{formatCurrency(f.valor)}</span>
                {f.pdf_path && (
                  <Button variant="ghost" size="sm" onClick={() => aoAbrirPdf(f.pdf_path as string)} aria-label={`Abrir o PDF da fatura ${f.numero}`}>
                    <FileDown className="h-4 w-4" />
                  </Button>
                )}
                {podeAnular && !aberta && (
                  <Button variant="outline" size="sm" onClick={() => abrir(f.invoice_id, "anular")}>
                    <XCircle className="mr-1 h-4 w-4" /> Anular
                  </Button>
                )}
                {podeValidar && !aberta && (
                  <Button size="sm" onClick={() => abrir(f.invoice_id, "validar")}>
                    <CheckCircle2 className="mr-1 h-4 w-4" /> Validar pagamento
                  </Button>
                )}
              </div>
            </div>

            {aberta === "validar" && (
              <form
                className="mt-3 flex flex-wrap items-end gap-3 rounded-md border bg-muted/30 p-3"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (await aoValidar(f, data)) setAcao(null);
                }}
              >
                <div className="space-y-1">
                  <Label htmlFor={`pag-${f.invoice_id}`} className="text-xs">Data do pagamento</Label>
                  <Input id={`pag-${f.invoice_id}`} type="date" value={data} max={hojeIso()} onChange={(e) => setData(e.target.value)} />
                </div>
                <p className="min-w-[12rem] flex-1 text-xs text-muted-foreground">
                  {f.dispara_obra
                    ? "É o 1.º pagamento deste contrato: as Operações são avisadas para criar a obra e o Armazém para os materiais."
                    : "Fica o recibo deste pagamento."}
                </p>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setAcao(null)} disabled={ocupada}>
                    Cancelar
                  </Button>
                  <Button type="submit" size="sm" disabled={ocupada || !data}>
                    {ocupada ? "A validar…" : "Confirmar pagamento"}
                  </Button>
                </div>
              </form>
            )}

            {aberta === "anular" && (
              <form
                className="mt-3 flex flex-wrap items-end gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (await aoAnular(f, motivo)) setAcao(null);
                }}
              >
                <div className="min-w-[14rem] flex-1 space-y-1">
                  <Label htmlFor={`anular-${f.invoice_id}`} className="text-xs">Motivo da anulação</Label>
                  <Input
                    id={`anular-${f.invoice_id}`}
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    placeholder="Ex.: número trocado"
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setAcao(null)} disabled={ocupada}>
                    Cancelar
                  </Button>
                  <Button type="submit" variant="destructive" size="sm" disabled={ocupada || motivo.trim().length < 3}>
                    {ocupada ? "A anular…" : "Anular registo"}
                  </Button>
                </div>
              </form>
            )}
          </li>
        );
      })}
    </ul>
  );
}
