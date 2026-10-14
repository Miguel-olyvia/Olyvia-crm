/**
 * Os valores avulsos da pessoa (fluxo 11): quilómetros, ajudas de custo e equipamento, com autor e data. O RH regista e anula
 * (a anulação pede motivo, e o valor continua visível mas deixa de contar). A própria pessoa vê só a lista, para conferir.
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
import { equipamentoPorMes, type ErroAnulacao } from "@/components/rh-exemplo/lib/custo";
import type { AvulsoCusto } from "@/components/rh-exemplo/lib/custoMes";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { AvulsoDialog } from "./AvulsoDialog";
import { euros } from "./formato";

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
  podeGerir: boolean;
  aoAnular: (a: AvulsoCusto) => void;
}

function LinhaAvulso({ a, podeGerir, aoAnular }: LinhaProps) {
  const { t } = useTranslation();
  return (
    <TableRow className={a.anulado ? "text-muted-foreground" : undefined}>
      <TableCell className="tabular-nums">{a.data}</TableCell>
      <TableCell>{t(`rhA.custo.tipo.${a.tipo}`)}</TableCell>
      <TableCell>
        <span className={a.anulado ? "line-through" : undefined}>{a.descricao}</span>
        {a.tipo === "equipamento" && !a.anulado && <span className="block text-xs">{t("rhA.custo.porMes", { valor: euros(equipamentoPorMes(a.valorUnitario), "—") })}</span>}
        {a.dataReal && <span className="block text-xs">{t("rhA.custo.notaDataReal", { data: a.dataReal, mes: a.mesContagem })}</span>}
        {a.anulado && (
          <span className="block text-xs">
            <Badge variant="outline" className="mr-1 font-normal">{t("rhA.custo.anulado")}</Badge>
            {t("rhA.custo.anuladoPor", { motivo: a.anulado.motivo, quem: a.anulado.por })}
          </span>
        )}
      </TableCell>
      <TableCell className={cn("text-right tabular-nums", a.anulado && "line-through")}>{euros(a.valor, "—")}</TableCell>
      <TableCell className="text-xs">{a.autor}<span className="block tabular-nums">{a.criadoEm.slice(0, 10)}</span></TableCell>
      {podeGerir && (
        <TableCell>
          {!a.anulado && (
            <Button type="button" size="sm" variant="outline" onClick={() => aoAnular(a)} className={cn("min-h-11", FOCO)}>
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
  autor: string;
  avulsos: AvulsoCusto[];
  /** `false` na visão da pessoa: só lê. */
  podeGerir: boolean;
}

export function CustoAvulsos({ pessoaId, autor, avulsos, podeGerir }: CustoAvulsosProps) {
  const { t } = useTranslation();
  const [aRegistar, setARegistar] = useState(false);
  const [aAnular, setAAnular] = useState<AvulsoCusto | null>(null);
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
                <TableHead>{t("rhA.custo.registadoPor")}</TableHead>
                {podeGerir && <TableHead><span className="sr-only">{t("rhA.custo.acoes")}</span></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {ordenados.map((a) => <LinhaAvulso key={a.id} a={a} podeGerir={podeGerir} aoAnular={setAAnular} />)}
            </TableBody>
          </Table>
        </div>
      )}
      {podeGerir && (
        <>
          <AvulsoDialog open={aRegistar} pessoaId={pessoaId} autor={autor} aoFechar={() => setARegistar(false)} />
          <AnularDialog key={aAnular?.id ?? "nenhum"} avulso={aAnular} autor={autor} aoFechar={() => setAAnular(null)} />
        </>
      )}
    </Seccao>
  );
}
