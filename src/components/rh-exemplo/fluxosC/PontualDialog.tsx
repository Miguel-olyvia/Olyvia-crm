/**
 * Acrescentar um valor pontual (positivo ou negativo) a uma pessoa, num periodo ainda aberto, e anular um valor pontual
 * (com motivo). Ambos gravam por `rpc_hr_processamento_lancamento_criar` / `_anular`, atraves do hook de lancamentos.
 * Quem chama passa as funcoes do hook, que devolvem o texto do erro (ou `null`); o erro fica a vista dentro do dialogo.
 */
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import type { NovoLancamentoProcessamento } from "@/components/rh-exemplo/hooks/useProcessamentoLancamentos";
import type { HrCodigoProcessamento, HrProcessamentoLancamento } from "@/components/rh-exemplo/tipos";
import { euros } from "./formatosC";

const SEM_CODIGO = "nenhum";

/** O valor escrito pelo utilizador (aceita virgula decimal). `null` = vazio, nao numerico ou zero. */
export function lerValorPontual(texto: string): number | null {
  const limpo = texto.trim().replace(",", ".");
  if (limpo === "") return null;
  const valor = Number(limpo);
  return Number.isFinite(valor) && valor !== 0 ? valor : null;
}

interface PontualProps {
  pessoa: { id: string; nome: string } | null;
  codigosActivos: readonly HrCodigoProcessamento[];
  aGravar: boolean;
  aoGuardar: (novo: NovoLancamentoProcessamento) => Promise<string | null>;
  aoFechar: () => void;
}

export function PontualDialog({ pessoa, codigosActivos, aGravar, aoGuardar, aoFechar }: PontualProps) {
  const { t } = useTranslation();
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [codigoId, setCodigoId] = useState(SEM_CODIGO);
  const [erro, setErro] = useState<string | null>(null);
  if (!pessoa) return null;

  const fechar = () => {
    setDescricao("");
    setValor("");
    setCodigoId(SEM_CODIGO);
    setErro(null);
    aoFechar();
  };
  const guardar = async () => {
    const numero = lerValorPontual(valor);
    if (!descricao.trim()) return setErro(t("rhFluxosC.proc.pontual.erro.descricao"));
    if (numero === null) return setErro(t("rhProcReal.pontual.erro.valor"));
    const falha = await aoGuardar({
      pessoaId: pessoa.id,
      descricao: descricao.trim(),
      valor: numero,
      codigoProcessamentoId: codigoId === SEM_CODIGO ? null : codigoId,
    });
    if (falha) return setErro(falha);
    toast.success(t("hr.vencimento.visaoGeral.lancamentoCriarSucesso"));
    fechar();
  };

  return (
    <Dialog open onOpenChange={(a) => !a && fechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("rhFluxosC.proc.pontual.titulo")}</DialogTitle>
          <DialogDescription>{pessoa.nome}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="pt-descricao">{t("rhFluxosC.proc.pontual.descricao")}</Label>
            <Textarea id="pt-descricao" rows={2} value={descricao} onChange={(e) => { setDescricao(e.target.value); setErro(null); }} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pt-valor">{t("rhFluxosC.proc.pontual.valor")}</Label>
            <Input id="pt-valor" inputMode="decimal" className="min-h-11" value={valor} onChange={(e) => { setValor(e.target.value); setErro(null); }} />
            <p className="text-xs text-muted-foreground">{t("rhProcReal.pontual.ajudaValor")}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pt-codigo">{t("hr.vencimento.visaoGeral.campoCodigo")}</Label>
            <Select value={codigoId} onValueChange={setCodigoId}>
              <SelectTrigger id="pt-codigo" className="min-h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_CODIGO}>{t("hr.vencimento.visaoGeral.semCodigo")}</SelectItem>
                {codigosActivos.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.codigo} · {c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" className="min-h-11" onClick={fechar}>{t("rhFluxosC.comum.cancelar")}</Button>
          <Button type="button" className="min-h-11" onClick={guardar} disabled={aGravar}>
            {aGravar && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {t("rhFluxosC.comum.guardar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface AnularProps {
  lancamento: HrProcessamentoLancamento | null;
  aGravar: boolean;
  aoAnular: (lancamentoId: string, motivo: string) => Promise<string | null>;
  aoFechar: () => void;
}

export function AnularLancamentoDialog({ lancamento, aGravar, aoAnular, aoFechar }: AnularProps) {
  const { t } = useTranslation();
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  if (!lancamento) return null;

  const fechar = () => {
    setMotivo("");
    setErro(null);
    aoFechar();
  };
  const anular = async () => {
    if (!motivo.trim()) return setErro(t("rhProcReal.pontual.erro.motivo"));
    const falha = await aoAnular(lancamento.id, motivo.trim());
    if (falha) return setErro(falha);
    toast.success(t("hr.vencimento.visaoGeral.lancamentoAnularSucesso"));
    fechar();
  };

  return (
    <Dialog open onOpenChange={(a) => !a && fechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("hr.vencimento.visaoGeral.anular")}</DialogTitle>
          <DialogDescription>{lancamento.descricao} · {euros(lancamento.valor)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="pt-motivo-anulacao">{t("hr.vencimento.visaoGeral.campoMotivoAnulacao")}</Label>
          <Textarea id="pt-motivo-anulacao" rows={2} value={motivo} onChange={(e) => { setMotivo(e.target.value); setErro(null); }} />
          {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" className="min-h-11" onClick={fechar}>{t("rhFluxosC.comum.cancelar")}</Button>
          <Button type="button" variant="destructive" className="min-h-11" onClick={anular} disabled={aGravar}>
            {aGravar && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {t("hr.vencimento.visaoGeral.anular")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
