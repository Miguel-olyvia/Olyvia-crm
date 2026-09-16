/**
 * O relatorio mensal de assiduidade de UMA pessoa, em React-PDF -- a versao
 * "para download" da mesma grelha que `RelatorioAssiduidadeMensalConteudo`
 * mostra no ecra. Mesmas colunas, mesmas funcoes de formatacao, mesmo
 * destaque de feriado/descanso trabalhado.
 *
 * NAO E HTML/CSS
 * ----------------
 * Segue o padrao de `QuotePDFDocument`: `Document`/`Page`/`View`/`Text` do
 * `@react-pdf/renderer`, com tabelas feitas de `View`s em `flexDirection: 'row'`
 * -- nao ha `<table>` nem CSS normal.
 */
import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { formatarDuracao } from "@/lib/hr/assiduidade";
import {
  formatarPlaneado,
  formatarRealizado,
} from "@/components/hr/RelatorioAssiduidadeMensalConteudo";
import type { DiaRelatorioMensal, ObraHoras, TotaisRelatorioMensal } from "@/hooks/useRelatorioAssiduidadeMensal";

const DIAS_SEMANA_ABREV = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"] as const;

const ESTADO_LABEL: Record<string, string> = {
  normal: "Normal",
  descanso: "Descanso",
  feriado: "Feriado",
  ausencia: "Ausência",
};

const FALTA_COMPLETA_NAO_REGISTADA = "Falta completa";
const FALTA_INCOMPLETA_NAO_REGISTADA = "Falta incompleta";

const styles = StyleSheet.create({
  page: {
    paddingTop: 30,
    paddingBottom: 30,
    paddingHorizontal: 30,
    fontFamily: "Helvetica",
    fontSize: 8,
    backgroundColor: "#ffffff",
  },
  header: {
    marginBottom: 12,
    borderBottom: "2 solid #000000",
    paddingBottom: 8,
  },
  organizacao: {
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 4,
  },
  pessoa: {
    fontSize: 11,
    marginBottom: 2,
  },
  detalhe: {
    fontSize: 8,
    color: "#6b7280",
  },
  mes: {
    fontSize: 10,
    fontWeight: "bold",
    marginTop: 4,
    textTransform: "capitalize",
  },
  table: {
    marginTop: 4,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#374151",
    padding: 4,
    fontWeight: "bold",
    color: "#ffffff",
    fontSize: 7,
  },
  tableRow: {
    flexDirection: "row",
    borderBottom: "1 solid #e5e7eb",
    paddingVertical: 3,
    paddingHorizontal: 4,
    fontSize: 7,
  },
  colData: { width: "10%" },
  colDia: { width: "8%" },
  colPlaneado: { width: "20%" },
  colRealizado: { width: "20%" },
  colExtra: { width: "16%", textAlign: "right" as const },
  colObra: { width: "10%", textAlign: "right" as const },
  colEstado: { width: "16%" },
  totais: {
    marginTop: 10,
    paddingTop: 6,
    borderTop: "1 solid #000000",
  },
  totaisLinha: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 3,
  },
  totalItem: {
    fontSize: 8,
    fontWeight: "bold",
    marginRight: 14,
    marginBottom: 2,
  },
  totaisFaltasBloco: {
    marginTop: 6,
    paddingTop: 4,
    borderTop: "1 solid #e5e7eb",
  },
  totaisFaltasTitulo: {
    fontSize: 8,
    fontWeight: "bold",
    marginBottom: 2,
    textTransform: "uppercase" as const,
  },
  totaisFaltasResumo: {
    fontSize: 7.5,
    color: "#555555",
    marginBottom: 3,
  },
  obrasSecao: {
    marginTop: 10,
    paddingTop: 6,
    borderTop: "1 solid #e5e7eb",
  },
  obrasTitulo: {
    fontSize: 9,
    fontWeight: "bold",
    marginBottom: 4,
  },
  obraLinha: {
    fontSize: 8,
    marginBottom: 2,
  },
});

const FUNDO_FERIADO = "#fef3c7";
const FUNDO_DESCANSO = "#dbeafe";
const FUNDO_SEM_REGISTO = "#ffe4e6";
const FUNDO_HORAS_EXTRA = "#dcfce7";

function trabalhouForaDoNormal(dia: DiaRelatorioMensal): boolean {
  return (dia.estado === "feriado" || dia.estado === "descanso") && dia.realizadoMinutos > 0;
}

/**
 * Mesma precedencia do ecra: feriado/descanso trabalhado e sem_registo so
 * ocorrem com `estado !== "normal"`, por isso o verde das horas extra (que
 * exige `estado === "normal"`) nunca os sobrepoe.
 */
function fundoDaLinha(dia: DiaRelatorioMensal): string | undefined {
  if (dia.estado === "sem_registo") return FUNDO_SEM_REGISTO;
  if (trabalhouForaDoNormal(dia)) return dia.estado === "feriado" ? FUNDO_FERIADO : FUNDO_DESCANSO;
  if (dia.estado === "normal" && dia.horasExtraMinutos > 0) return FUNDO_HORAS_EXTRA;
  return undefined;
}

function rotuloDoEstado(dia: DiaRelatorioMensal): string {
  if (dia.estado === "ausencia") return dia.categoriaAusencia ?? "Ausência";
  if (dia.estado === "sem_registo") {
    return dia.realizadoMinutos === 0 ? FALTA_COMPLETA_NAO_REGISTADA : FALTA_INCOMPLETA_NAO_REGISTADA;
  }
  return ESTADO_LABEL[dia.estado] ?? dia.estado;
}

export interface RelatorioAssiduidadeMensalPDFDocumentProps {
  organizacaoNome?: string | null;
  pessoaNome: string;
  cargo?: string | null;
  dataAdmissao?: string | null;
  nomeDoMes: string;
  dias: DiaRelatorioMensal[];
  totais: TotaisRelatorioMensal;
  obras: ObraHoras[];
}

export function RelatorioAssiduidadeMensalPDFDocument({
  organizacaoNome,
  pessoaNome,
  cargo,
  dataAdmissao,
  nomeDoMes,
  dias,
  totais,
  obras,
}: RelatorioAssiduidadeMensalPDFDocumentProps) {
  const obrasActivas = obras.filter((obra) => !obra.anulado_em);
  const diasFaltaRegistada = totais.diasComFaltaCompleta + totais.diasComFaltaIncompleta;
  const diasComFalhaNoTrabalho = diasFaltaRegistada + totais.diasSemRegisto;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {organizacaoNome && <Text style={styles.organizacao}>{organizacaoNome}</Text>}
          <Text style={styles.pessoa}>{pessoaNome}</Text>
          <Text style={styles.detalhe}>
            {cargo ?? "Sem cargo registado"}
            {dataAdmissao ? ` · Admissão em ${dataAdmissao}` : ""}
          </Text>
          <Text style={styles.mes}>{nomeDoMes}</Text>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.colData}>Data</Text>
            <Text style={styles.colDia}>Dia</Text>
            <Text style={styles.colPlaneado}>Planeado</Text>
            <Text style={styles.colRealizado}>Realizado</Text>
            <Text style={styles.colExtra}>H. extra</Text>
            <Text style={styles.colObra}>Obra</Text>
            <Text style={styles.colEstado}>Estado</Text>
          </View>

          {dias.map((dia) => {
            const trabalhou = trabalhouForaDoNormal(dia);
            const esconderValores = dia.estado !== "normal" && dia.estado !== "sem_registo" && !trabalhou;
            const backgroundColor = fundoDaLinha(dia);
            return (
              <View key={dia.iso} style={[styles.tableRow, backgroundColor ? { backgroundColor } : {}]} wrap={false}>
                <Text style={styles.colData}>{dia.iso}</Text>
                <Text style={styles.colDia}>{DIAS_SEMANA_ABREV[dia.diaSemana]}</Text>
                {esconderValores ? (
                  <Text style={[styles.colPlaneado, { width: "60%" }]}>{rotuloDoEstado(dia)}</Text>
                ) : (
                  <>
                    <Text style={styles.colPlaneado}>{formatarPlaneado(dia.planeadoIntervalos)}</Text>
                    <Text style={styles.colRealizado}>{formatarRealizado(dia.realizadoIntervalos)}</Text>
                    <Text style={styles.colExtra}>
                      {dia.horasExtraMinutos > 0
                        ? `+${formatarDuracao(dia.horasExtraMinutos)}${
                            dia.horasExtraNoturnasMinutos > 0
                              ? ` (${formatarDuracao(dia.horasExtraNoturnasMinutos)} noturnas)`
                              : ""
                          }`
                        : "—"}
                    </Text>
                    <Text style={styles.colObra}>{dia.obraHoras > 0 ? `${dia.obraHoras}h` : "—"}</Text>
                  </>
                )}
                {!esconderValores && (
                  <Text style={styles.colEstado}>
                    {rotuloDoEstado(dia)}
                    {trabalhou ? (dia.estado === "feriado" ? " (feriado trabalhado)" : " (descanso trabalhado)") : ""}
                    {dia.estado === "normal" && dia.horasExtraMinutos > 0 ? " (horas extra)" : ""}
                    {dia.temFalta ? ` · Falta de ${formatarDuracao(dia.minutosEmFalta)}` : ""}
                  </Text>
                )}
              </View>
            );
          })}
        </View>

        <View style={styles.totais}>
          <View style={styles.totaisLinha}>
            <Text style={styles.totalItem}>{totais.diasTrabalhados} dias trabalhados</Text>
            <Text style={styles.totalItem}>Planeado: {formatarDuracao(totais.planeadoMinutos)}</Text>
            <Text style={styles.totalItem}>Realizado: {formatarDuracao(totais.realizadoMinutos)}</Text>
            <Text style={styles.totalItem}>Horas extra: {formatarDuracao(totais.horasExtraMinutos)}</Text>
            {totais.horasExtraNoturnasMinutos > 0 && (
              <Text style={styles.totalItem}>
                Horas extra noturnas: {formatarDuracao(totais.horasExtraNoturnasMinutos)}
              </Text>
            )}
            <Text style={styles.totalItem}>Obra: {totais.obraHoras}h</Text>
            <Text style={styles.totalItem}>{totais.diasFeriadoTrabalhados} feriados trabalhados</Text>
          </View>
        </View>

        <View style={styles.totaisFaltasBloco}>
          <Text style={styles.totaisFaltasTitulo}>Faltas e dias por esclarecer</Text>
          {diasComFalhaNoTrabalho > 0 && (
            <Text style={styles.totaisFaltasResumo}>
              De {diasComFalhaNoTrabalho} dias com falha no trabalho, {diasFaltaRegistada} já foram
              registados como falta pelo RH; os restantes {totais.diasSemRegisto} ainda não têm falta
              associada.
            </Text>
          )}
          <View style={styles.totaisLinha}>
            <Text style={styles.totalItem}>{totais.diasComFaltaCompleta} faltas completas</Text>
            <Text style={styles.totalItem}>{totais.diasComFaltaIncompleta} faltas parciais</Text>
            <Text style={styles.totalItem}>{totais.diasSemRegisto} dias sem registo</Text>
          </View>
        </View>

        {obrasActivas.length > 0 && (
          <View style={styles.obrasSecao}>
            <Text style={styles.obrasTitulo}>Obras do mês</Text>
            {obrasActivas.map((obra) => (
              <Text key={obra.id} style={styles.obraLinha}>
                {obra.data} · {obra.horas}h · {obra.descricao}
              </Text>
            ))}
          </View>
        )}
      </Page>
    </Document>
  );
}
