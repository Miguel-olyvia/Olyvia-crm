/**
 * Os equipamentos da pessoa (aba Custo): tipo, descrição, valor, entrega, estado, «Como conta» (pago de uma vez, repartido por
 * N meses ou todos os meses), o que conta no mês escolhido, o que já contou e o que falta contar. «Atribuir equipamento» abre o
 * painel lateral; «Devolver» pede a data e o estado; «Alterar como conta» muda a forma de contar. Tudo em memória; o custo muda logo.
 */
import { useState } from "react";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Seccao } from "@/components/ficha-comum/Seccao";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import type { EquipamentoPessoa } from "@/components/rh-exemplo/lib/equipamentos";
import { situacaoDoEquipamento } from "@/components/rh-exemplo/lib/equipamentos";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { DevolverDialog } from "./DevolverDialog";
import { EditarContaDialog, type AlvoConta } from "./EditarContaDialog";
import { EquipamentoSheet } from "./EquipamentoSheet";
import { dataPt, euros, nomeDoMes } from "./formato";
import { rotuloDaConta } from "./rotuloConta";

interface Props {
  pessoaId: string;
  pessoaNome: string;
  mes: string;
  autor: string;
  equipamentos: EquipamentoPessoa[];
}

interface LinhaProps {
  e: EquipamentoPessoa;
  mes: string;
  aoDevolver: (e: EquipamentoPessoa) => void;
  aoAlterar: (alvo: AlvoConta) => void;
}

function LinhaEquipamento({ e, mes, aoDevolver, aoAlterar }: LinhaProps) {
  const { t, language } = useTranslation();
  const s = situacaoDoEquipamento(e, mes);
  const devolvido = e.estado === "devolvido";
  const mensal = e.conta.modo === "todosMeses";
  const sem = t("rhCustos.eq.semValor");
  return (
    <TableRow className={devolvido ? "text-muted-foreground" : undefined}>
      <TableCell>{t(`rhCustos.eq.tipo.${e.tipo}`)}</TableCell>
      <TableCell>
        {e.descricao}
        {devolvido && e.devolucao && (
          <span className="block text-xs">
            {t("rhCustos.eq.devolvidoEm", { data: dataPt(e.devolucao), estado: t(`rhCustos.eq.estadoDevolucao.${e.estadoDevolucao ?? "bom"}`) })}
          </span>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums">{mensal ? t("rhCustos.eq.valorMes", { valor: euros(e.valor, "—") }) : euros(e.valor, "—")}</TableCell>
      <TableCell className="tabular-nums">{dataPt(e.entrega)}</TableCell>
      <TableCell>
        <Badge variant={devolvido ? "outline" : "secondary"} className="font-normal">{t(`rhCustos.eq.estado.${e.estado}`)}</Badge>
      </TableCell>
      <TableCell>
        {rotuloDaConta(t, e.conta, language)}
        {s.completo && <span className="mt-1 block text-xs text-muted-foreground">{t("rhCustos.eq.tudoContado")}</span>}
      </TableCell>
      <TableCell className="text-right tabular-nums">{s.doMes === 0 ? sem : euros(s.doMes, "—")}</TableCell>
      <TableCell className="text-right tabular-nums">{euros(s.contado, "—")}</TableCell>
      <TableCell className="text-right tabular-nums">
        {s.falta === null ? sem : euros(s.falta, "—")}
        {s.mesesFalta !== null && s.mesesFalta > 0 && <span className="block text-xs text-muted-foreground">{t(s.mesesFalta === 1 ? "rhCustos.eq.mes1" : "rhCustos.eq.meses", { n: s.mesesFalta })}</span>}
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          <Button type="button" size="sm" variant="outline" onClick={() => aoAlterar({ tipo: "equipamento", item: e })} aria-label={t("rhCustos.conta.editarAria", { descricao: e.descricao })} className={cn("min-h-11", FOCO)}>
            {t("rhCustos.conta.editar")}
          </Button>
          {!devolvido && (
            <Button type="button" size="sm" variant="outline" onClick={() => aoDevolver(e)} aria-label={t("rhCustos.eq.devolverAria", { descricao: e.descricao })} className={cn("min-h-11", FOCO)}>
              {t("rhCustos.eq.devolver")}
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

const COLUNAS = ["tipo", "descricao", "valor", "entrega", "estado", "comoConta", "contaMes", "jaContou", "falta"] as const;
const COLUNAS_NUMERO: readonly string[] = ["valor", "contaMes", "jaContou", "falta"];

export function CustoEquipamentos({ pessoaId, pessoaNome, mes, autor, equipamentos }: Props) {
  const { t, language } = useTranslation();
  const [aAtribuir, setAAtribuir] = useState(false);
  const [aDevolver, setADevolver] = useState<EquipamentoPessoa | null>(null);
  const [aAlterar, setAAlterar] = useState<AlvoConta | null>(null);
  const ordenados = [...equipamentos].sort((a, b) => b.entrega.localeCompare(a.entrega));

  return (
    <Seccao
      titulo={t("rhCustos.eq.titulo")}
      marca={(
        <Button type="button" size="sm" onClick={() => setAAtribuir(true)} className={cn("ml-auto min-h-11 gap-2", FOCO)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t("rhCustos.eq.atribuir")}
        </Button>
      )}
    >
      {ordenados.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("rhCustos.eq.vazio")}</p>
      ) : (
        <div className="overflow-x-auto">
          <Table aria-label={t("rhCustos.eq.tabela")}>
            <TableHeader>
              <TableRow>
                {COLUNAS.map((c) => (
                  <TableHead key={c} scope="col" className={COLUNAS_NUMERO.includes(c) ? "text-right" : undefined}>
                    {t(`rhCustos.eq.${c}`)}
                  </TableHead>
                ))}
                <TableHead scope="col"><span className="sr-only">{t("rhCustos.eq.acoes")}</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ordenados.map((e) => <LinhaEquipamento key={e.id} e={e} mes={mes} aoDevolver={setADevolver} aoAlterar={setAAlterar} />)}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="mt-2 text-xs text-muted-foreground">{t("rhCustos.eq.mesNota", { mes: nomeDoMes(mes, language) })}</p>
      <p className="mt-1 text-xs text-muted-foreground">{t("rhCustos.eq.fardamentoNota")}</p>
      <EquipamentoSheet aberto={aAtribuir} pessoaId={pessoaId} pessoas={[{ id: pessoaId, nome: pessoaNome }]} autor={autor} aoFechar={() => setAAtribuir(false)} />
      <DevolverDialog equipamento={aDevolver} aoFechar={() => setADevolver(null)} />
      <EditarContaDialog alvo={aAlterar} aoFechar={() => setAAlterar(null)} />
    </Seccao>
  );
}
