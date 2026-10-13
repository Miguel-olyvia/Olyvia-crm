import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  ORIGENS_FATURA,
  avisoDeValor,
  hojeIso,
  problemaNaFatura,
  problemaNoPdf,
  valorParaInput,
  type DadosFatura,
  type OrigemFatura,
  type TranchePorFaturar,
} from "@/hooks/financeiro/financeiro";

const CHAVE_ORIGEM = "financeiro.origem";

/** O programa usado da última vez (conveniência por pessoa; sem storage, vazio). */
function origemLembrada(): OrigemFatura | "" {
  try {
    const v = localStorage.getItem(CHAVE_ORIGEM);
    return (ORIGENS_FATURA as readonly string[]).includes(v ?? "") ? (v as OrigemFatura) : "";
  } catch {
    return "";
  }
}

function lembrarOrigem(o: string) {
  try {
    localStorage.setItem(CHAVE_ORIGEM, o);
  } catch {
    /* sem storage: não faz mal */
  }
}

/**
 * Registar a fatura de uma tranche, na própria linha da lista "Por faturar".
 * A fatura já foi emitida no programa certificado; aqui só se copia o número,
 * a data, o valor e (se houver) o ATCUD e o PDF.
 */
export function RegistarFaturaForm({
  tranche,
  aGravar,
  aoRegistar,
  aoCancelar,
}: {
  tranche: TranchePorFaturar;
  aGravar: boolean;
  aoRegistar: (dados: DadosFatura, pdf: File | null) => void;
  aoCancelar: () => void;
}) {
  const [dados, setDados] = useState<DadosFatura>(() => ({
    numero: "",
    data: hojeIso(),
    valor: valorParaInput(tranche.valor_sugerido),
    origem: origemLembrada(),
    atcud: "",
  }));
  const [pdf, setPdf] = useState<File | null>(null);
  const [tentou, setTentou] = useState(false);

  const id = (campo: string) => `fin-${tranche.contract_id}-${tranche.tranche_ordem}-${campo}`;
  const mudar = (campo: keyof DadosFatura) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDados((d) => ({ ...d, [campo]: e.target.value }));

  const problema = problemaNaFatura(dados) ?? problemaNoPdf(pdf);
  const aviso = avisoDeValor(dados.valor, tranche.valor_sugerido);

  const submeter = (e: React.FormEvent) => {
    e.preventDefault();
    setTentou(true);
    if (problema || aGravar) return;
    if (dados.origem) lembrarOrigem(dados.origem);
    aoRegistar(dados, pdf);
  };

  return (
    <form
      onSubmit={submeter}
      className="mt-3 space-y-3 rounded-md border bg-muted/30 p-3"
      aria-label={`Registar fatura de ${tranche.cliente_nome}, ${tranche.tranche_descricao}`}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor={id("numero")} className="text-xs">N.º da fatura *</Label>
          <Input id={id("numero")} value={dados.numero} onChange={mudar("numero")} placeholder="FT 2026/123" autoFocus />
        </div>
        <div className="space-y-1">
          <Label htmlFor={id("data")} className="text-xs">Data *</Label>
          <Input id={id("data")} type="date" value={dados.data} max={hojeIso()} onChange={mudar("data")} />
        </div>
        <div className="space-y-1">
          <Label htmlFor={id("valor")} className="text-xs">Valor (€) *</Label>
          <Input id={id("valor")} inputMode="decimal" value={dados.valor} onChange={mudar("valor")} />
          {aviso && <p className="text-xs text-amber-700">{aviso}</p>}
        </div>
        <div className="space-y-1">
          <Label htmlFor={id("origem")} className="text-xs">Emitida no *</Label>
          <NativeSelect
            id={id("origem")}
            value={dados.origem}
            placeholder="Escolher…"
            onValueChange={(v) => setDados((d) => ({ ...d, origem: v as OrigemFatura }))}
            options={ORIGENS_FATURA.map((o) => ({ value: o, label: o }))}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={id("atcud")} className="text-xs">ATCUD</Label>
          <Input id={id("atcud")} value={dados.atcud} onChange={mudar("atcud")} placeholder="ABCD1234-123" />
        </div>
        <div className="space-y-1 sm:col-span-1 lg:col-span-3">
          <Label htmlFor={id("pdf")} className="text-xs">PDF da fatura</Label>
          <Input
            id={id("pdf")}
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => setPdf(e.target.files?.[0] ?? null)}
          />
        </div>
      </div>

      {tentou && problema && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {problema}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={aoCancelar} disabled={aGravar}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={aGravar}>
          {aGravar ? "A registar…" : "Registar fatura"}
        </Button>
      </div>
    </form>
  );
}
