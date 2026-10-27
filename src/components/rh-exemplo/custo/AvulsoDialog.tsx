/**
 * Registar um valor avulso LIGADO A BASE: um lancamento pontual do processamento salarial (`hr_processamento_lancamentos`),
 * que conta de uma vez no mes do periodo que esta a ser visto. Escreve-se a descricao, o valor (positivo ou negativo) e,
 * se se quiser, o codigo de processamento. So se regista num periodo ABERTO: a base recusa nos fechados.
 * A base nao guarda o tipo (quilometros, ajuda de custo), a quantidade nem o valor unitario, e nao ha «repartido» nem
 * «todos os meses»: por isso esses campos nao existem aqui.
 * Na ficha a pessoa ja vem escolhida; no modulo «Custos» escolhe-se aqui (`pessoas`).
 */
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { CampoSelect, CampoTexto } from "@/components/rh-exemplo/form/Campos";
import { lerValorPontual } from "@/components/rh-exemplo/fluxosC/PontualDialog";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { nomeDoMes } from "./formato";
import type { PessoaEscolhivel } from "./EquipamentoSheet";
import type { AcoesLancamentos } from "./lancamentosCusto";

interface FormularioProps {
  /** A pessoa fixa (ficha); `null` para escolher no formulario. */
  pessoaId: string | null;
  pessoas?: readonly PessoaEscolhivel[];
  /** O mes («AAAA-MM») cujo periodo recebe o valor. */
  mes: string;
  acoes: AcoesLancamentos;
  aoFechar: () => void;
  /** Depois de registar: o mes em que o valor conta. */
  aoRegistar?: (mesContagem: string) => void;
}

function Formulario({ pessoaId, pessoas = [], mes, acoes, aoFechar, aoRegistar }: FormularioProps) {
  const { t, language } = useTranslation();
  const [quem, setQuem] = useState(pessoaId ?? "");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [codigoId, setCodigoId] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const guardar = async () => {
    if (quem === "") return setErro(t("rhCustos.erro.semPessoa"));
    if (!descricao.trim()) return setErro(t("rhFluxosC.proc.pontual.erro.descricao"));
    const numero = lerValorPontual(valor);
    if (numero === null) return setErro(t("rhProcReal.pontual.erro.valor"));
    const falha = await acoes.criar({
      pessoaId: quem,
      descricao: descricao.trim(),
      valor: numero,
      codigoProcessamentoId: codigoId === "" ? null : codigoId,
    });
    if (falha) return setErro(falha);
    aoRegistar?.(mes);
    aoFechar();
  };

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void guardar(); }} noValidate>
      {pessoaId === null && (
        <CampoSelect
          id="rhA-avulso-pessoa" label={t("rhCustos.pessoa")} valor={quem} onChange={setQuem} obrigatorio
          placeholder={t("rhCustos.escolherPessoa")} opcoes={pessoas.map((p) => ({ value: p.id, label: p.nome }))}
        />
      )}
      <CampoTexto id="rhA-avulso-descricao" label={t("rhA.custo.descricao")} valor={descricao} onChange={(v) => { setDescricao(v); setErro(null); }} obrigatorio />
      <CampoTexto
        id="rhA-avulso-valor" label={t("rhA.custo.valor")} tipo="number" step="0.01" valor={valor}
        onChange={(v) => { setValor(v); setErro(null); }} ajuda={t("rhProcReal.pontual.ajudaValor")} obrigatorio
      />
      <CampoSelect
        id="rhA-avulso-codigo" label={t("hr.vencimento.visaoGeral.campoCodigo")} valor={codigoId} onChange={setCodigoId}
        vazioLabel={t("hr.vencimento.visaoGeral.semCodigo")} opcoes={acoes.codigos.map((c) => ({ value: c.id, label: `${c.codigo} · ${c.nome}` }))}
      />
      <p className="rounded-md bg-muted/50 p-3 text-sm">{t("rhA.custo.contaDeUmaVez", { mes: nomeDoMes(mes, language) })}</p>
      {!acoes.periodoAberto && <p role="status" className="text-sm font-medium text-amber-800 dark:text-amber-300">{t("rhA.custo.periodoNaoAberto")}</p>}
      {erro && <p role="alert" className="text-sm font-medium text-destructive">{erro}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={aoFechar} className={cn("min-h-11", FOCO)}>{t("common.cancel")}</Button>
        <Button type="submit" disabled={acoes.aGravar || !acoes.periodoAberto} className={cn("min-h-11", FOCO)}>
          {acoes.aGravar && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
          {t("rhA.custo.registar")}
        </Button>
      </DialogFooter>
    </form>
  );
}

interface AvulsoDialogProps extends FormularioProps {
  open: boolean;
}

export function AvulsoDialog({ open, ...resto }: AvulsoDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={(aberto) => !aberto && resto.aoFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("rhA.custo.registarTitulo")}</DialogTitle>
          <DialogDescription>{t("rhA.custo.registarAjuda")}</DialogDescription>
        </DialogHeader>
        <Formulario {...resto} />
      </DialogContent>
    </Dialog>
  );
}
