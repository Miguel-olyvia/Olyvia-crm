/**
 * Os equipamentos da pessoa (aba Custo): tipo, descrição, valor, entrega, estado, «Como conta» (pago de uma vez, repartido por
 * N meses ou todos os meses), o que conta no mês escolhido, o que já contou e o que falta contar. «Atribuir equipamento» abre o
 * painel lateral; «Devolver» pede a data e o estado; «Alterar como conta» muda a forma de contar. Vem da base e escreve na base
 * (só com a permissão de editar retribuições); depois de cada escrita a lista e o custo refazem-se. O devolvido conta até ao mês da devolução, inclusive.
 * «Termo» (só num ativo, com `hr.pessoas.documentos.emitir`) emite o termo de entrega ou de devolução como documento do RH, sem enviar nada.
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
import { usePermissionsOpcional } from "@/contexts/PermissionsContext";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { CorrigirDatasDialog } from "./CorrigirDatasDialog";
import { CorrigirEquipamentoDialog } from "./CorrigirEquipamentoDialog";
import { DevolverDialog } from "./DevolverDialog";
import { EditarContaDialog, type AlvoConta } from "./EditarContaDialog";
import { EquipamentoSheet, PERMISSAO_EDITAR_ATIVOS } from "./EquipamentoSheet";
import { dataPt, euros, nomeDoMes } from "./formato";
import { rotuloDoEquipamento } from "./rotuloConta";
import { TermoEquipamentoDialog } from "./TermoEquipamentoDialog";

// Quem emite o termo precisa de poder emitir documentos do RH (a base decide; aqui só se esconde o botão).
const PERMISSAO_EMITIR_DOCUMENTOS = "hr.pessoas.documentos.emitir";

interface Props {
  pessoaId: string;
  pessoaNome: string;
  mes: string;
  autor: string;
  equipamentos: EquipamentoPessoa[];
  /** Pode atribuir, devolver e alterar a conta (`hr.pessoas.retribuicao.edit`); sem isto a lista so se le. */
  podeGerir: boolean;
}

interface LinhaProps {
  e: EquipamentoPessoa;
  mes: string;
  podeGerir: boolean;
  /** Tem `ativos.edit`: só então se corrigem o valor, a vida, a renda e as datas de um equipamento que é um ativo. */
  podeCorrigir: boolean;
  /** Tem `hr.pessoas.documentos.emitir`: só então se emite o termo de um equipamento que é um ativo. */
  podeTermo: boolean;
  aoDevolver: (e: EquipamentoPessoa) => void;
  aoAlterar: (alvo: AlvoConta) => void;
  aoCorrigir: (e: EquipamentoPessoa) => void;
  aoCorrigirDatas: (e: EquipamentoPessoa) => void;
  aoTermo: (e: EquipamentoPessoa) => void;
}

function LinhaEquipamento({ e, mes, podeGerir, podeCorrigir, podeTermo, aoDevolver, aoAlterar, aoCorrigir, aoCorrigirDatas, aoTermo }: LinhaProps) {
  const { t, language } = useTranslation();
  const s = situacaoDoEquipamento(e, mes);
  const devolvido = e.estado === "devolvido";
  // Com ativo a renda é mensal pelo ativo; sem ele (a farda) pelo «como conta» da linha.
  const mensal = e.ativo ? e.ativo.forma === "alugado" : e.conta.modo === "todosMeses";
  const sem = t("rhCustos.eq.semValor");
  return (
    <TableRow className={devolvido ? "text-muted-foreground" : undefined}>
      <TableCell>{t(`rhCustos.eq.tipo.${e.tipo}`)}</TableCell>
      <TableCell>
        {e.descricao}
        {e.ativo?.codigo && <span className="block text-xs text-muted-foreground">{e.ativo.codigo}</span>}
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
        {rotuloDoEquipamento(t, e, language)}
        {s.completo && <span className="mt-1 block text-xs text-muted-foreground">{t("rhCustos.eq.tudoContado")}</span>}
      </TableCell>
      <TableCell className="text-right tabular-nums">{s.doMes === 0 ? sem : euros(s.doMes, "—")}</TableCell>
      <TableCell className="text-right tabular-nums">{euros(s.contado, "—")}</TableCell>
      <TableCell className="text-right tabular-nums">
        {s.falta === null ? sem : euros(s.falta, "—")}
        {s.mesesFalta !== null && s.mesesFalta > 0 && <span className="block text-xs text-muted-foreground">{t(s.mesesFalta === 1 ? "rhCustos.eq.mes1" : "rhCustos.eq.meses", { n: s.mesesFalta })}</span>}
      </TableCell>
      <TableCell>
        {podeGerir && (
          <div className="flex flex-wrap gap-1">
            {/* Só a farda tem conta própria; um equipamento que é um ativo corrige-se (com ativos.edit), nunca se «altera a conta». */}
            {!e.ativo && (
              <Button type="button" size="sm" variant="outline" onClick={() => aoAlterar({ tipo: "equipamento", item: e })} aria-label={t("rhCustos.conta.editarAria", { descricao: e.descricao })} className={cn("min-h-11", FOCO)}>
                {t("rhCustos.conta.editar")}
              </Button>
            )}
            {e.ativo && podeCorrigir && (
              <>
                <Button type="button" size="sm" variant="outline" onClick={() => aoCorrigir(e)} aria-label={t("rhCustos.eq.corrigir.aria", { descricao: e.descricao })} className={cn("min-h-11", FOCO)}>
                  {t("rhCustos.eq.corrigir.botao")}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => aoCorrigirDatas(e)} aria-label={t("rhCustos.eq.datas.aria", { descricao: e.descricao })} className={cn("min-h-11", FOCO)}>
                  {t("rhCustos.eq.datas.botao")}
                </Button>
              </>
            )}
            {e.ativo && !podeCorrigir && <span className="self-center text-xs text-muted-foreground">{t("rhCustos.eq.corrigir.pedirAdmin")}</span>}
            {!devolvido && (
              <Button type="button" size="sm" variant="outline" onClick={() => aoDevolver(e)} aria-label={t("rhCustos.eq.devolverAria", { descricao: e.descricao })} className={cn("min-h-11", FOCO)}>
                {t("rhCustos.eq.devolver")}
              </Button>
            )}
            {e.ativo && podeTermo && (
              <Button type="button" size="sm" variant="outline" onClick={() => aoTermo(e)} aria-label={t("ativos.termo.aria", { descricao: e.descricao })} className={cn("min-h-11", FOCO)}>
                {t("ativos.termo.botao")}
              </Button>
            )}
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}

const COLUNAS = ["tipo", "descricao", "valor", "entrega", "estado", "comoConta", "contaMes", "jaContou", "falta"] as const;
const COLUNAS_NUMERO: readonly string[] = ["valor", "contaMes", "jaContou", "falta"];

export function CustoEquipamentos({ pessoaId, pessoaNome, mes, autor, equipamentos, podeGerir }: Props) {
  const { t, language } = useTranslation();
  const [aAtribuir, setAAtribuir] = useState(false);
  const [aDevolver, setADevolver] = useState<EquipamentoPessoa | null>(null);
  const [aAlterar, setAAlterar] = useState<AlvoConta | null>(null);
  const [aCorrigir, setACorrigir] = useState<EquipamentoPessoa | null>(null);
  const [aCorrigirDatas, setACorrigirDatas] = useState<EquipamentoPessoa | null>(null);
  const [aTermo, setATermo] = useState<EquipamentoPessoa | null>(null);
  // A permissão dos Ativos (não a das retribuições do RH); fora do fornecedor de permissões (testes isolados) vale «não».
  const permissoes = usePermissionsOpcional();
  const podeCorrigir = permissoes?.hasPermission(PERMISSAO_EDITAR_ATIVOS) ?? false;
  const podeTermo = permissoes?.hasPermission(PERMISSAO_EMITIR_DOCUMENTOS) ?? false;
  const ordenados = [...equipamentos].sort((a, b) => b.entrega.localeCompare(a.entrega));

  return (
    <Seccao
      titulo={t("rhCustos.eq.titulo")}
      marca={podeGerir ? (
        <Button type="button" size="sm" onClick={() => setAAtribuir(true)} className={cn("ml-auto min-h-11 gap-2", FOCO)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t("rhCustos.eq.atribuir")}
        </Button>
      ) : undefined}
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
              {ordenados.map((e) => <LinhaEquipamento key={e.id} e={e} mes={mes} podeGerir={podeGerir} podeCorrigir={podeCorrigir} podeTermo={podeTermo} aoDevolver={setADevolver} aoAlterar={setAAlterar} aoCorrigir={setACorrigir} aoCorrigirDatas={setACorrigirDatas} aoTermo={setATermo} />)}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="mt-2 text-xs text-muted-foreground">{t("rhCustos.eq.mesNota", { mes: nomeDoMes(mes, language) })}</p>
      {equipamentos.some((e) => e.ativo) && <p className="mt-1 text-xs text-muted-foreground">{t("rhCustos.eq.regraDoMes")}</p>}
      <p className="mt-1 text-xs text-muted-foreground">{t("rhCustos.eq.fardamentoNota")}</p>
      <EquipamentoSheet aberto={aAtribuir} pessoaId={pessoaId} pessoas={[{ id: pessoaId, nome: pessoaNome }]} autor={autor} aoFechar={() => setAAtribuir(false)} />
      <DevolverDialog equipamento={aDevolver} aoFechar={() => setADevolver(null)} />
      <EditarContaDialog alvo={aAlterar} aoFechar={() => setAAlterar(null)} />
      <CorrigirEquipamentoDialog equipamento={aCorrigir} aoFechar={() => setACorrigir(null)} />
      <CorrigirDatasDialog equipamento={aCorrigirDatas} aoFechar={() => setACorrigirDatas(null)} />
      <TermoEquipamentoDialog equipamento={aTermo} pessoaId={pessoaId} aoFechar={() => setATermo(null)} />
    </Seccao>
  );
}
