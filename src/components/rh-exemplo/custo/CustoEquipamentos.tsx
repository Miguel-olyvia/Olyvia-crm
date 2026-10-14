/**
 * Os equipamentos da pessoa (aba Custo): tipo, descrição, valor de aquisição, entrega, estado, amortização mensal (valor / 36
 * enquanto atribuído e nos primeiros 36 meses), meses restantes e valor por amortizar, no mês escolhido. «Atribuir
 * equipamento» abre o painel lateral; «Devolver» pede a data e o estado. Tudo em memória; o custo do mês muda logo.
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
import { EquipamentoSheet } from "./EquipamentoSheet";
import { dataPt, euros, nomeDoMes } from "./formato";

interface Props {
  pessoaId: string;
  pessoaNome: string;
  mes: string;
  autor: string;
  equipamentos: EquipamentoPessoa[];
}

function LinhaEquipamento({ e, mes, aoDevolver }: { e: EquipamentoPessoa; mes: string; aoDevolver: (e: EquipamentoPessoa) => void }) {
  const { t } = useTranslation();
  const s = situacaoDoEquipamento(e, mes);
  const devolvido = e.estado === "devolvido";
  const naoConta = s.amortizacaoMes === 0;
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
      <TableCell className="text-right tabular-nums">{euros(e.valor, "—")}</TableCell>
      <TableCell className="tabular-nums">{dataPt(e.entrega)}</TableCell>
      <TableCell>
        <Badge variant={devolvido ? "outline" : "secondary"} className="font-normal">{t(`rhCustos.eq.estado.${e.estado}`)}</Badge>
        {s.totalmenteAmortizado && <span className="mt-1 block text-xs text-muted-foreground">{t("rhCustos.eq.totalmenteAmortizado")}</span>}
      </TableCell>
      <TableCell className="text-right tabular-nums">{naoConta ? t("rhCustos.eq.semAmortizacao") : euros(s.amortizacaoMes, "—")}</TableCell>
      <TableCell className="text-right tabular-nums">{devolvido ? t("rhCustos.eq.semAmortizacao") : t("rhCustos.eq.meses", { n: s.mesesRestantes })}</TableCell>
      <TableCell className="text-right tabular-nums">{devolvido ? t("rhCustos.eq.semAmortizacao") : euros(s.porAmortizar, "—")}</TableCell>
      <TableCell>
        {!devolvido && (
          <Button type="button" size="sm" variant="outline" onClick={() => aoDevolver(e)} aria-label={t("rhCustos.eq.devolverAria", { descricao: e.descricao })} className={cn("min-h-11", FOCO)}>
            {t("rhCustos.eq.devolver")}
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

export function CustoEquipamentos({ pessoaId, pessoaNome, mes, autor, equipamentos }: Props) {
  const { t, language } = useTranslation();
  const [aAtribuir, setAAtribuir] = useState(false);
  const [aDevolver, setADevolver] = useState<EquipamentoPessoa | null>(null);
  const ordenados = [...equipamentos].sort((a, b) => b.entrega.localeCompare(a.entrega));
  const colunas = ["tipo", "descricao", "valor", "entrega", "estado", "amortizacao", "restantes", "porAmortizar"] as const;

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
                {colunas.map((c) => (
                  <TableHead key={c} scope="col" className={["valor", "amortizacao", "restantes", "porAmortizar"].includes(c) ? "text-right" : undefined}>
                    {t(`rhCustos.eq.${c}`)}
                  </TableHead>
                ))}
                <TableHead scope="col"><span className="sr-only">{t("rhCustos.eq.acoes")}</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ordenados.map((e) => <LinhaEquipamento key={e.id} e={e} mes={mes} aoDevolver={setADevolver} />)}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="mt-2 text-xs text-muted-foreground">{t("rhCustos.eq.mesNota", { mes: nomeDoMes(mes, language) })}</p>
      <p className="mt-1 text-xs text-muted-foreground">{t("rhCustos.eq.fardamentoNota")}</p>
      <EquipamentoSheet aberto={aAtribuir} pessoaId={pessoaId} pessoas={[{ id: pessoaId, nome: pessoaNome }]} autor={autor} aoFechar={() => setAAtribuir(false)} />
      <DevolverDialog equipamento={aDevolver} aoFechar={() => setADevolver(null)} />
    </Seccao>
  );
}
