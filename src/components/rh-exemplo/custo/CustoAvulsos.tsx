/**
 * Os valores avulsos da pessoa no mes visto: os lancamentos pontuais do processamento salarial (da base), que contam de
 * uma vez no mes do periodo. O RH regista e anula (a anulacao pede motivo, e o valor continua visivel mas deixa de
 * contar); so se escreve num periodo aberto. Nao ha quilometros, ajudas de custo, «repartido» nem «todos os meses»: a base
 * nao os guarda. A propria pessoa ve so a lista, para conferir.
 */
import { useState } from "react";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Seccao } from "@/components/ficha-comum/Seccao";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { CampoTexto } from "@/components/rh-exemplo/form/Campos";
import { anularAvulsoErro } from "@/components/rh-exemplo/lib/custo";
import { valorDoAvulsoNoMes, type AvulsoCusto } from "@/components/rh-exemplo/lib/custoMes";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { AvulsoDialog } from "./AvulsoDialog";
import { euros } from "./formato";
import type { AcoesLancamentos } from "./lancamentosCusto";
import { rotuloDaConta } from "./rotuloConta";

interface AnularProps {
  avulso: AvulsoCusto | null;
  acoes: AcoesLancamentos;
  aoFechar: () => void;
}

function AnularDialog({ avulso, acoes, aoFechar }: AnularProps) {
  const { t } = useTranslation();
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const confirmar = async () => {
    if (!avulso) return;
    const recusa = anularAvulsoErro(motivo, true);
    if (recusa) return setErro(t(`rhA.custo.erro.${recusa}`));
    const falha = await acoes.anular(avulso.id, motivo.trim());
    if (falha) return setErro(falha);
    aoFechar();
  };
  return (
    <Dialog open={avulso !== null} onOpenChange={(aberto) => !aberto && aoFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("rhA.custo.anularTitulo")}</DialogTitle>
          <DialogDescription>{avulso ? `${avulso.descricao} · ${euros(avulso.valor, "—")}` : ""}</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); void confirmar(); }}>
          <CampoTexto id="rhA-anular-motivo" label={t("rhA.custo.motivo")} valor={motivo} onChange={(v) => { setMotivo(v); setErro(null); }} ajuda={t("rhA.custo.motivoAjuda")} />
          {erro && <p role="alert" className="text-sm font-medium text-destructive">{erro}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={aoFechar} className={cn("min-h-11", FOCO)}>{t("common.cancel")}</Button>
            <Button type="submit" variant="destructive" disabled={acoes.aGravar} className={cn("min-h-11", FOCO)}>{t("rhA.custo.anular")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface LinhaProps {
  a: AvulsoCusto;
  mes: string;
  podeGerir: boolean;
  podeAnular: boolean;
  aoAnular: (a: AvulsoCusto) => void;
}

function LinhaAvulso({ a, mes, podeGerir, podeAnular, aoAnular }: LinhaProps) {
  const { t, language } = useTranslation();
  const doMes = a.anulado ? 0 : valorDoAvulsoNoMes(a, mes);
  return (
    <TableRow className={a.anulado ? "text-muted-foreground" : undefined}>
      <TableCell className="tabular-nums">{a.criadoEm.slice(0, 10)}</TableCell>
      <TableCell>{t(`rhA.custo.tipo.${a.tipo}`)}</TableCell>
      <TableCell>
        <span className={a.anulado ? "line-through" : undefined}>{a.descricao}</span>
        {a.anulado && (
          <span className="block text-xs">
            <Badge variant="outline" className="mr-1 font-normal">{t("rhA.custo.anulado")}</Badge>
            {a.anulado.por ? t("rhA.custo.anuladoPor", { motivo: a.anulado.motivo, quem: a.anulado.por }) : a.anulado.motivo}
          </span>
        )}
      </TableCell>
      <TableCell className={cn("text-right tabular-nums", a.anulado && "line-through")}>{euros(a.valor, "—")}</TableCell>
      <TableCell>{rotuloDaConta(t, a.conta, language)}</TableCell>
      <TableCell className="text-right tabular-nums">{doMes === 0 ? t("rhCustos.eq.semValor") : euros(doMes, "—")}</TableCell>
      {podeGerir && (
        <TableCell>
          {!a.anulado && (
            <Button type="button" size="sm" variant="outline" disabled={!podeAnular} onClick={() => aoAnular(a)} className={cn("min-h-11", FOCO)}>
              {t("rhA.custo.anular")}
            </Button>
          )}
        </TableCell>
      )}
    </TableRow>
  );
}

interface CustoAvulsosProps {
  pessoaId: string;
  avulsos: AvulsoCusto[];
  /** O mes escolhido: o periodo que recebe os valores, e a coluna «Conta neste mes». */
  mes: string;
  /** Registar e anular lancamentos do periodo do mes. */
  acoes: AcoesLancamentos;
  /** `false` na visao da pessoa: so le. */
  podeGerir: boolean;
}

export function CustoAvulsos({ pessoaId, avulsos, mes, acoes, podeGerir }: CustoAvulsosProps) {
  const { t } = useTranslation();
  const [aRegistar, setARegistar] = useState(false);
  const [aAnular, setAAnular] = useState<AvulsoCusto | null>(null);
  const ordenados = [...avulsos].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));

  return (
    <Seccao
      titulo={t("rhA.custo.avulsosTitulo")}
      marca={podeGerir && (
        <Button type="button" size="sm" onClick={() => setARegistar(true)} className={cn("ml-auto min-h-11 gap-2", FOCO)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t("rhA.custo.registar")}
        </Button>
      )}
    >
      {ordenados.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("rhA.custo.avulsosVazio")}</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("rhA.custo.data")}</TableHead>
                <TableHead>{t("rhA.custo.tipo")}</TableHead>
                <TableHead>{t("rhA.custo.descricao")}</TableHead>
                <TableHead className="text-right">{t("rhA.custo.valor")}</TableHead>
                <TableHead>{t("rhCustos.conta.titulo")}</TableHead>
                <TableHead className="text-right">{t("rhCustos.avulso.contaMes")}</TableHead>
                {podeGerir && <TableHead><span className="sr-only">{t("rhA.custo.acoes")}</span></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {ordenados.map((a) => (
                <LinhaAvulso key={a.id} a={a} mes={mes} podeGerir={podeGerir} podeAnular={acoes.periodoAberto} aoAnular={setAAnular} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {podeGerir && !acoes.periodoAberto && <p role="status" className="mt-2 text-xs text-muted-foreground">{t("rhA.custo.periodoNaoAberto")}</p>}
      {podeGerir && (
        <>
          <AvulsoDialog open={aRegistar} pessoaId={pessoaId} mes={mes} acoes={acoes} aoFechar={() => setARegistar(false)} />
          <AnularDialog key={aAnular?.id ?? "nenhum"} avulso={aAnular} acoes={acoes} aoFechar={() => setAAnular(null)} />
        </>
      )}
    </Seccao>
  );
}
