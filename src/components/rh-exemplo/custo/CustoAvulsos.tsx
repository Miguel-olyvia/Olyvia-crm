/**
 * Os valores avulsos da pessoa (fluxo 11): quilómetros e ajudas de custo, com autor, data e «Como conta» (por omissão, pago de
 * uma vez, no mês da data). O RH regista, altera como conta e anula (a anulação pede motivo, e o valor continua visível mas deixa
 * de contar). A própria pessoa vê só a lista, para conferir.
 */
import { useState } from "react";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Seccao } from "@/components/ficha-comum/Seccao";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { anularAvulso } from "@/components/rh-exemplo/dados/lojaCusto";
import { CampoTexto } from "@/components/rh-exemplo/form/Campos";
import type { ErroAnulacao } from "@/components/rh-exemplo/lib/custo";
import { valorDoAvulsoNoMes, type AvulsoCusto } from "@/components/rh-exemplo/lib/custoMes";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { AvulsoDialog } from "./AvulsoDialog";
import { EditarContaDialog, type AlvoConta } from "./EditarContaDialog";
import { euros } from "./formato";
import { rotuloDaConta } from "./rotuloConta";

interface AnularProps {
  avulso: AvulsoCusto | null;
  autor: string;
  aoFechar: () => void;
}

function AnularDialog({ avulso, autor, aoFechar }: AnularProps) {
  const { t } = useTranslation();
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<ErroAnulacao | null>(null);
  const confirmar = () => {
    if (!avulso) return;
    const { erro: recusa } = anularAvulso(avulso.id, motivo, autor, true);
    setErro(recusa);
    if (!recusa) aoFechar();
  };
  return (
    <Dialog open={avulso !== null} onOpenChange={(aberto) => !aberto && aoFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("rhA.custo.anularTitulo")}</DialogTitle>
          <DialogDescription>{avulso ? `${avulso.descricao} · ${euros(avulso.valor, "—")}` : ""}</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); confirmar(); }}>
          <CampoTexto id="rhA-anular-motivo" label={t("rhA.custo.motivo")} valor={motivo} onChange={setMotivo} ajuda={t("rhA.custo.motivoAjuda")} />
          {erro && <p role="alert" className="text-sm font-medium text-destructive">{t(`rhA.custo.erro.${erro}`)}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={aoFechar} className={cn("min-h-11", FOCO)}>{t("common.cancel")}</Button>
            <Button type="submit" variant="destructive" className={cn("min-h-11", FOCO)}>{t("rhA.custo.anular")}</Button>
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
  aoAnular: (a: AvulsoCusto) => void;
  aoAlterar: (alvo: AlvoConta) => void;
}

function LinhaAvulso({ a, mes, podeGerir, aoAnular, aoAlterar }: LinhaProps) {
  const { t, language } = useTranslation();
  const doMes = a.anulado ? 0 : valorDoAvulsoNoMes(a, mes);
  return (
    <TableRow className={a.anulado ? "text-muted-foreground" : undefined}>
      <TableCell className="tabular-nums">{a.data}</TableCell>
      <TableCell>{t(`rhA.custo.tipo.${a.tipo}`)}</TableCell>
      <TableCell>
        <span className={a.anulado ? "line-through" : undefined}>{a.descricao}</span>
        {a.anulado && (
          <span className="block text-xs">
            <Badge variant="outline" className="mr-1 font-normal">{t("rhA.custo.anulado")}</Badge>
            {t("rhA.custo.anuladoPor", { motivo: a.anulado.motivo, quem: a.anulado.por })}
          </span>
        )}
      </TableCell>
      <TableCell className={cn("text-right tabular-nums", a.anulado && "line-through")}>{euros(a.valor, "—")}</TableCell>
      <TableCell>{rotuloDaConta(t, a.conta, language)}</TableCell>
      <TableCell className="text-right tabular-nums">{doMes === 0 ? t("rhCustos.eq.semValor") : euros(doMes, "—")}</TableCell>
      <TableCell className="text-xs">{a.autor}<span className="block tabular-nums">{a.criadoEm.slice(0, 10)}</span></TableCell>
      {podeGerir && (
        <TableCell>
          {!a.anulado && (
            <div className="flex flex-wrap gap-1">
              <Button type="button" size="sm" variant="outline" onClick={() => aoAlterar({ tipo: "avulso", item: a })} aria-label={t("rhCustos.conta.editarAria", { descricao: a.descricao })} className={cn("min-h-11", FOCO)}>
                {t("rhCustos.conta.editar")}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => aoAnular(a)} className={cn("min-h-11", FOCO)}>
                {t("rhA.custo.anular")}
              </Button>
            </div>
          )}
        </TableCell>
      )}
    </TableRow>
  );
}

interface CustoAvulsosProps {
  pessoaId: string;
  autor: string;
  avulsos: AvulsoCusto[];
  /** O mês escolhido: a coluna «Conta neste mês» mostra o que cada valor conta nele. */
  mes: string;
  /** `false` na visão da pessoa: só lê. */
  podeGerir: boolean;
}

export function CustoAvulsos({ pessoaId, autor, avulsos, mes, podeGerir }: CustoAvulsosProps) {
  const { t } = useTranslation();
  const [aRegistar, setARegistar] = useState(false);
  const [aAnular, setAAnular] = useState<AvulsoCusto | null>(null);
  const [aAlterar, setAAlterar] = useState<AlvoConta | null>(null);
  const ordenados = [...avulsos].sort((a, b) => b.data.localeCompare(a.data));

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
                <TableHead>{t("rhA.custo.registadoPor")}</TableHead>
                {podeGerir && <TableHead><span className="sr-only">{t("rhA.custo.acoes")}</span></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {ordenados.map((a) => <LinhaAvulso key={a.id} a={a} mes={mes} podeGerir={podeGerir} aoAnular={setAAnular} aoAlterar={setAAlterar} />)}
            </TableBody>
          </Table>
        </div>
      )}
      {podeGerir && (
        <>
          <AvulsoDialog open={aRegistar} pessoaId={pessoaId} autor={autor} aoFechar={() => setARegistar(false)} />
          <AnularDialog key={aAnular?.id ?? "nenhum"} avulso={aAnular} autor={autor} aoFechar={() => setAAnular(null)} />
          <EditarContaDialog alvo={aAlterar} aoFechar={() => setAAlterar(null)} />
        </>
      )}
    </Seccao>
  );
}
