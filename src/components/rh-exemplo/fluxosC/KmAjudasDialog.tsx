/**
 * Lancar quilometros ou ajudas de custo a uma pessoa, num periodo ainda aberto. O RH diz so o TIPO e a QUANTIDADE
 * (km, ou dias); o valor vem da regra salarial da organizacao (quantidade x valor em vigor no ultimo dia do periodo) e
 * calcula-o a base: aqui mostra-se apenas o valor da regra e uma previsao, nunca se envia um valor.
 * So se oferecem os tipos a que a pessoa tem direito. O erro (sem direito, sem regra, quantidade invalida) fica a vista
 * dentro do dialogo.
 */
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import type { NovoLancamentoPorQuantidade } from "@/components/rh-exemplo/hooks/useProcessamentoLancamentos";
import { euros } from "./formatosC";

export type TipoPorQuantidade = NovoLancamentoPorQuantidade["tipo"];

/** A quantidade escrita (aceita virgula decimal), maior que zero e com no maximo duas casas. `null` se nao for valida. */
export function lerQuantidade(texto: string): number | null {
  const limpo = texto.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(limpo)) return null;
  const n = Number(limpo);
  return n > 0 ? n : null;
}

/** O valor previsto: quantidade x valor da regra, ao centimo (a base calcula o valor final). */
export function valorPrevisto(quantidade: number, valorDaRegra: number): number {
  return Math.round((quantidade * valorDaRegra + Number.EPSILON) * 100) / 100;
}

interface KmAjudasProps {
  pessoa: { id: string; nome: string } | null;
  /** Os direitos da pessoa: so se oferecem os tipos a que tem direito. */
  direitos: { km: boolean; ajudas: boolean };
  /** Os valores da regra em vigor; `null` = sem regra (nao se pode lancar). */
  regra: { km_valor: number; ajudas_custo_dia: number } | null;
  aGravar: boolean;
  aoGuardar: (novo: NovoLancamentoPorQuantidade) => Promise<string | null>;
  aoFechar: () => void;
}

export function KmAjudasDialog({ pessoa, direitos, regra, aGravar, aoGuardar, aoFechar }: KmAjudasProps) {
  const { t } = useTranslation();
  const tipos: TipoPorQuantidade[] = [...(direitos.km ? (["km"] as const) : []), ...(direitos.ajudas ? (["ajudas"] as const) : [])];
  const [tipoEscolhido, setTipoEscolhido] = useState<TipoPorQuantidade | null>(null);
  const [quantidade, setQuantidade] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  if (!pessoa) return null;

  const tipo: TipoPorQuantidade | null = tipoEscolhido && tipos.includes(tipoEscolhido) ? tipoEscolhido : (tipos[0] ?? null);
  const valorDaRegra = tipo && regra ? (tipo === "km" ? regra.km_valor : regra.ajudas_custo_dia) : null;
  const numero = lerQuantidade(quantidade);
  const previsto = numero !== null && valorDaRegra !== null ? valorPrevisto(numero, valorDaRegra) : null;

  const fechar = () => {
    setTipoEscolhido(null);
    setQuantidade("");
    setErro(null);
    aoFechar();
  };
  const guardar = async () => {
    if (!tipo) return;
    if (numero === null) return setErro(t("rhFluxosC.lanc.erro.quantidade"));
    const falha = await aoGuardar({ pessoaId: pessoa.id, tipo, quantidade: numero });
    // Um erro conhecido da base volta como chave de traducao; os outros, ja como texto.
    if (falha) return setErro(falha.startsWith("rhFluxosC.") ? t(falha) : falha);
    toast.success(t("rhFluxosC.lanc.sucesso"));
    fechar();
  };

  return (
    <Dialog open onOpenChange={(a) => !a && fechar()}>
      <DialogContent>
        <form onSubmit={(e) => { e.preventDefault(); if (!aGravar && tipos.length > 0 && regra) void guardar(); }} className="space-y-4" noValidate>
        <DialogHeader>
          <DialogTitle>{t("rhFluxosC.lanc.titulo")}</DialogTitle>
          <DialogDescription>{pessoa.nome}</DialogDescription>
        </DialogHeader>
        {tipos.length === 0 ? (
          <p role="status" className="text-sm text-muted-foreground">{t("rhFluxosC.lanc.semDireito")}</p>
        ) : !regra ? (
          <p role="status" className="text-sm text-muted-foreground">{t("rhFluxosC.lanc.erro.semRegra")}</p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("rhFluxosC.lanc.explicacao")}</p>
            <div className="space-y-1.5">
              <Label htmlFor="ka-tipo">{t("rhFluxosC.lanc.tipo")}</Label>
              <Select value={tipo ?? undefined} onValueChange={(v) => { setTipoEscolhido(v as TipoPorQuantidade); setErro(null); }}>
                <SelectTrigger id="ka-tipo" className="min-h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {tipos.map((o) => (
                    <SelectItem key={o} value={o}>{t(`rhFluxosC.lanc.tipo.${o}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ka-quantidade">{t(`rhFluxosC.lanc.quantidade.${tipo}`)}</Label>
              <Input
                id="ka-quantidade"
                inputMode="decimal"
                className="min-h-11"
                value={quantidade}
                aria-invalid={erro ? true : undefined}
                aria-describedby={erro ? "ka-ajuda ka-erro" : "ka-ajuda"}
                onChange={(e) => { setQuantidade(e.target.value); setErro(null); }}
              />
              <p id="ka-ajuda" className="text-xs text-muted-foreground">
                {valorDaRegra !== null ? t(`rhFluxosC.lanc.valorRegra.${tipo}`, { valor: euros(valorDaRegra) }) : t("rhFluxosC.lanc.explicacao")}
                {previsto !== null ? ` ${t("rhFluxosC.lanc.previsto", { valor: euros(previsto) })}` : ""}
              </p>
            </div>
            {erro && <p id="ka-erro" role="alert" className="text-sm text-destructive">{erro}</p>}
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" className="min-h-11" onClick={fechar}>{t("rhFluxosC.comum.cancelar")}</Button>
          <Button type="submit" className="min-h-11" disabled={aGravar || tipos.length === 0 || !regra}>
            {aGravar && <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
            {t("rhFluxosC.comum.guardar")}
          </Button>
        </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
