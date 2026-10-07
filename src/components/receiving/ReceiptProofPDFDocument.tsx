import type { ReactNode } from 'react';
import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

// Comprovativo de receção de uma guia do fornecedor (Fase 2 — fatia 3).
//
// Molde: ProformaPDFDocument.tsx (documento auto-contido, dados 100% por props,
// cabeçalho e rodapé `fixed`). Aqui não há lógica de negócio: tudo chega já
// formatado em `ReceiptProofModel` (ver buildReceiptProofModel em
// src/utils/generateReceiptProofPdf.ts), para o modelo ser testável sem PDF.
//
// NÃO é documento de transporte (AT) nem fatura: o aviso está fixo no rodapé e
// repete-se em todas as páginas. Não tem números de série, ATCUD nem QR.
//
// Quebra de palavras: NÃO se mexe no Font.registerHyphenationCallback global
// (a proforma regista o seu). Cada <Text> usa um hyphenationCallback local
// (splitLongWord) que só parte tokens com mais de 24 caracteres sem espaços
// (SKUs, refs) em pedaços de 12 — nada mais é hifenizado. Não se inserem
// hífenes condicionais (U+00AD) no texto: no @react-pdf 4 desalinham os
// caracteres (o wrapWords tira-os da string mas os offsets ficam com eles).

/** Aviso fixo no rodapé de todas as páginas. */
export const RECEIPT_PROOF_NOTICE =
  'Comprovativo interno de conferência de mercadoria. Não é documento de transporte nem fatura.';

/** Aviso de documento provisório (guia ainda em aberto). */
export const RECEIPT_PROOF_PROVISIONAL = 'PROVISÓRIO — guia em aberto';

export interface ReceiptProofCompany {
  name: string | null;
  vat: string | null;
  address: string | null;
  phone?: string | null;
  email?: string | null;
  /** Data URI (base64). */
  logo_url?: string | null;
}

export interface ReceiptProofRow {
  key: string;
  ref: string;
  /** Referência do fornecedor, quando difere do SKU. */
  supplierRef: string | null;
  description: string;
  unit: string;
  /** Embalagens anunciadas na guia, ex.: "2 × PK10". */
  packaging: string | null;
  announced: string;
  received: string;
  difference: string;
  divergent: boolean;
}

export interface ReceiptProofModel {
  provisional: boolean;
  company: ReceiptProofCompany;
  noteLabel: string;
  documentDate: string;
  statusLabel: string;
  issuedAt: string;
  issuedBy: string;
  supplierName: string;
  supplierVat: string;
  warehouses: string;
  receivedBy: string;
  period: string;
  /** Vazio = todas as encomendas em aberto do fornecedor. */
  orders: string[];
  hasLines: boolean;
  rows: ReceiptProofRow[];
  totals: { label: string; value: string }[];
  /** Avisos acima da tabela ("Ainda nada recebido…", "sem linhas anunciadas…"). */
  notices: string[];
  /** Divergências e notas, uma por linha. */
  remarks: string[];
  /** Nome pré-preenchido na assinatura "Recebido por" ('' = em branco). */
  signatureReceiverName: string;
}

export interface ReceiptProofPDFDocumentProps {
  model: ReceiptProofModel;
}

/**
 * Callback de hifenização local: palavras com mais de 24 caracteres (SKUs,
 * refs sem espaços) partem-se em pedaços de 12; o resto nunca é partido.
 * Os pedaços juntos reproduzem a palavra exata, logo o texto não muda.
 */
export function splitLongWord(word: string): string[] {
  if (word.length <= 24 || /\s/.test(word)) return [word];
  const parts: string[] = [];
  const chars = Array.from(word);
  for (let i = 0; i < chars.length; i += 12) parts.push(chars.slice(i, i + 12).join(''));
  return parts;
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 30,
    // Espaço do rodapé fixo (aviso + provisório + empresa ≈ 3 linhas).
    paddingBottom: 66,
    paddingHorizontal: 35,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: '#111827',
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
    paddingBottom: 10,
    borderBottom: '2 solid #111827',
  },
  headerLeft: { flex: 1, paddingRight: 12 },
  companyName: { fontSize: 13, fontWeight: 'bold', marginBottom: 3 },
  companyLine: { fontSize: 8, color: '#4b5563', marginBottom: 1 },
  logo: { width: 130, height: 60, objectFit: 'contain' },
  docBlock: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  titleBox: { flex: 1, paddingRight: 12 },
  title: { fontSize: 17, fontWeight: 'bold', letterSpacing: 1, marginBottom: 3 },
  titleSub: { fontSize: 9, fontWeight: 'bold', color: '#b45309' },
  // Largura fixa e flexShrink 0 (ver nota na proforma): sem isto o bloco
  // encolhe por causa do título e os valores saem cortados.
  docMeta: { width: 235, flexShrink: 0 },
  metaRow: { flexDirection: 'row', marginBottom: 2 },
  metaLabel: { width: '42%', fontSize: 9, color: '#4b5563' },
  metaValue: { width: '58%', fontSize: 9, fontWeight: 'bold', textAlign: 'right' },
  provisionalBand: {
    backgroundColor: '#fef3c7',
    border: '1 solid #f59e0b',
    color: '#92400e',
    padding: 6,
    marginBottom: 12,
    fontSize: 9,
    fontWeight: 'bold',
  },
  section: { marginBottom: 12 },
  sectionTitle: {
    fontSize: 9,
    fontWeight: 'bold',
    marginBottom: 5,
    backgroundColor: '#f3f4f6',
    padding: 5,
  },
  row: { flexDirection: 'row', marginBottom: 2 },
  label: { width: '22%', fontSize: 9, fontWeight: 'bold' },
  value: { width: '78%', fontSize: 9 },
  notice: { fontSize: 8, color: '#4b5563', marginBottom: 4 },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#374151',
    color: '#ffffff',
    paddingVertical: 5,
    paddingHorizontal: 4,
    fontSize: 8,
    fontWeight: 'bold',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottom: '1 solid #e5e7eb',
    paddingVertical: 4,
    paddingHorizontal: 4,
    fontSize: 8,
  },
  subLine: { fontSize: 7, color: '#6b7280', marginTop: 1 },
  totalsBox: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderTop: '1 solid #111827',
    paddingTop: 5,
  },
  totalsItem: { flexDirection: 'row', marginRight: 14, marginBottom: 2 },
  totalsLabel: { fontSize: 9, color: '#4b5563', marginRight: 4 },
  totalsValue: { fontSize: 9, fontWeight: 'bold' },
  remark: { fontSize: 8, marginBottom: 3 },
  signatures: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  signatureBox: { width: '48%', border: '1 solid #d1d5db', paddingHorizontal: 8, paddingTop: 6, paddingBottom: 2 },
  signatureTitle: { fontSize: 9, fontWeight: 'bold', marginBottom: 6 },
  signatureLine: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 9 },
  signatureLabel: { fontSize: 8, color: '#4b5563', width: 58 },
  signatureFill: { flex: 1, borderBottom: '1 solid #9ca3af', fontSize: 9, minHeight: 12 },
  fixedFooter: {
    position: 'absolute',
    bottom: 18,
    left: 35,
    right: 35,
    paddingTop: 6,
    borderTop: '1 solid #d1d5db',
  },
  footerNotice: { fontSize: 8, fontWeight: 'bold', marginBottom: 2, paddingRight: 50 },
  footerProvisional: { fontSize: 8, fontWeight: 'bold', color: '#b45309', marginBottom: 2 },
  footerText: { fontSize: 7, color: '#6b7280', paddingRight: 50 },
  footerPage: { position: 'absolute', right: 0, bottom: 0, fontSize: 7, color: '#6b7280' },
});

const col = {
  ref: { width: '16%', paddingRight: 4 },
  description: { width: '36%', paddingRight: 4 },
  unit: { width: '7%', textAlign: 'center' as const },
  announced: { width: '11%', textAlign: 'right' as const },
  received: { width: '11%', textAlign: 'right' as const },
  difference: { width: '19%', textAlign: 'right' as const, paddingLeft: 4 },
};

/**
 * <Text> com quebra só em tokens compridos (splitLongWord). Usado em TODOS os
 * textos: sem a proforma carregada vale a hifenização inglesa por omissão
 * (partia "RE-CEÇÃO"), e o callback global não é nosso para mudar.
 */
const T = ({ style, children }: { style?: any; children?: ReactNode }) => (
  <Text style={style} hyphenationCallback={splitLongWord}>
    {children ?? ''}
  </Text>
);

const SignatureLine = ({ label, value }: { label: string; value?: string }) => (
  <View style={styles.signatureLine}>
    <T style={styles.signatureLabel}>{label}</T>
    <T style={styles.signatureFill}>{value || ' '}</T>
  </View>
);

export const ReceiptProofPDFDocument = ({ model }: ReceiptProofPDFDocumentProps) => {
  const { company } = model;
  const footerCompany = [company?.name, company?.vat ? `NIF ${company.vat}` : null].filter(Boolean).join(' · ');

  return (
    <Document title={`Comprovativo de receção ${model.noteLabel}`}>
      <Page size="A4" style={styles.page}>
        {/* Cabeçalho da empresa — repetido em todas as páginas. */}
        <View fixed style={styles.header}>
          <View style={styles.headerLeft}>
            <T style={styles.companyName}>{company?.name || ''}</T>
            {company?.vat ? <T style={styles.companyLine}>NIF: {company.vat}</T> : null}
            {company?.address ? <T style={styles.companyLine}>{company.address}</T> : null}
            {company?.phone ? <T style={styles.companyLine}>Tel.: {company.phone}</T> : null}
            {company?.email ? <T style={styles.companyLine}>{company.email}</T> : null}
          </View>
          {company?.logo_url ? <Image src={company.logo_url} style={styles.logo} /> : null}
        </View>

        {/* Título e metadados */}
        <View style={styles.docBlock}>
          <View style={styles.titleBox}>
            <T style={styles.title}>COMPROVATIVO DE RECEÇÃO</T>
            {model.provisional ? <T style={styles.titleSub}>{RECEIPT_PROOF_PROVISIONAL}</T> : null}
          </View>
          <View style={styles.docMeta}>
            <View style={styles.metaRow}>
              <T style={styles.metaLabel}>N.º guia fornecedor</T>
              <T style={styles.metaValue}>{model.noteLabel}</T>
            </View>
            <View style={styles.metaRow}>
              <T style={styles.metaLabel}>Data do documento</T>
              <T style={styles.metaValue}>{model.documentDate}</T>
            </View>
            <View style={styles.metaRow}>
              <T style={styles.metaLabel}>Estado</T>
              <T style={styles.metaValue}>{model.statusLabel}</T>
            </View>
            <View style={styles.metaRow}>
              <T style={styles.metaLabel}>Emitido em</T>
              <T style={styles.metaValue}>{model.issuedAt}</T>
            </View>
            <View style={styles.metaRow}>
              <T style={styles.metaLabel}>Emitido por</T>
              <T style={styles.metaValue}>{model.issuedBy}</T>
            </View>
          </View>
        </View>

        {model.provisional ? (
          <T style={styles.provisionalBand}>
            {`${RECEIPT_PROOF_PROVISIONAL}. As quantidades podem ainda mudar até a guia ser fechada.`}
          </T>
        ) : null}

        {/* Fornecedor */}
        <View style={styles.section} wrap={false}>
          <T style={styles.sectionTitle}>FORNECEDOR</T>
          <View style={styles.row}>
            <T style={styles.label}>Nome:</T>
            <T style={styles.value}>{model.supplierName}</T>
          </View>
          <View style={styles.row}>
            <T style={styles.label}>NIF:</T>
            <T style={styles.value}>{model.supplierVat}</T>
          </View>
        </View>

        {/* Receção */}
        <View style={styles.section} wrap={false}>
          <T style={styles.sectionTitle}>RECEÇÃO</T>
          <View style={styles.row}>
            <T style={styles.label}>Armazém:</T>
            <T style={styles.value}>{model.warehouses}</T>
          </View>
          <View style={styles.row}>
            <T style={styles.label}>Recebido por:</T>
            <T style={styles.value}>{model.receivedBy}</T>
          </View>
          <View style={styles.row}>
            <T style={styles.label}>Período:</T>
            <T style={styles.value}>{model.period}</T>
          </View>
        </View>

        {/* Encomendas */}
        <View style={styles.section}>
          <T style={styles.sectionTitle}>ENCOMENDAS</T>
          <T style={styles.value}>
            {model.orders.length === 0 ? 'Todas as encomendas em aberto do fornecedor' : model.orders.join(', ')}
          </T>
        </View>

        {/* Produtos */}
        <View style={styles.section}>
          <T style={styles.sectionTitle}>MERCADORIA (quantidades em unidades base)</T>
          {model.notices.map((n) => (
            <T key={n} style={styles.notice}>
              {n}
            </T>
          ))}
          {model.rows.length > 0 ? (
            <>
              {/* `fixed`: repete o cabeçalho da tabela nas páginas seguintes. */}
              <View fixed style={styles.tableHeader}>
                <T style={col.ref}>Ref./SKU</T>
                <T style={col.description}>Descrição</T>
                <T style={col.unit}>Un.</T>
                <T style={col.announced}>Anunciado</T>
                <T style={col.received}>Recebido</T>
                <T style={col.difference}>Diferença</T>
              </View>
              {model.rows.map((r) => (
                <View key={r.key} style={styles.tableRow} wrap={false}>
                  <View style={col.ref}>
                    <T>{r.ref}</T>
                    {r.supplierRef ? <T style={styles.subLine}>{`Forn.: ${r.supplierRef}`}</T> : null}
                  </View>
                  <View style={col.description}>
                    <T>{r.description}</T>
                    {r.packaging ? <T style={styles.subLine}>{`Anunciado na guia: ${r.packaging}`}</T> : null}
                  </View>
                  <T style={col.unit}>{r.unit}</T>
                  <T style={col.announced}>{r.announced}</T>
                  <T style={col.received}>{r.received}</T>
                  <T style={r.divergent ? { ...col.difference, fontWeight: 'bold', color: '#b45309' } : col.difference}>
                    {r.difference}
                  </T>
                </View>
              ))}
              <View style={styles.totalsBox} wrap={false}>
                {model.totals.map((t) => (
                  <View key={t.label} style={styles.totalsItem}>
                    <T style={styles.totalsLabel}>{t.label}</T>
                    <T style={styles.totalsValue}>{t.value}</T>
                  </View>
                ))}
              </View>
            </>
          ) : null}
        </View>

        {/* Divergências e notas */}
        {model.remarks.length > 0 ? (
          <View style={styles.section}>
            <T style={styles.sectionTitle}>DIVERGÊNCIAS E NOTAS</T>
            {model.remarks.map((r, i) => (
              <T key={i} style={styles.remark}>
                {`• ${r}`}
              </T>
            ))}
          </View>
        ) : null}

        {/* Assinaturas — nunca partidas entre páginas. */}
        <View style={styles.signatures} wrap={false}>
          <View style={styles.signatureBox}>
            <T style={styles.signatureTitle}>Recebido por</T>
            <SignatureLine label="Nome" value={model.signatureReceiverName} />
            <SignatureLine label="Assinatura" />
            <SignatureLine label="Data" />
          </View>
          <View style={styles.signatureBox}>
            <T style={styles.signatureTitle}>Entregue por — motorista</T>
            <SignatureLine label="Nome" />
            <SignatureLine label="Assinatura" />
            <SignatureLine label="Matrícula" />
            <SignatureLine label="Data" />
          </View>
        </View>

        {/* Rodapé fixo em todas as páginas. */}
        <View fixed style={styles.fixedFooter}>
          <T style={styles.footerNotice}>{RECEIPT_PROOF_NOTICE}</T>
          {model.provisional ? <T style={styles.footerProvisional}>{RECEIPT_PROOF_PROVISIONAL}</T> : null}
          {footerCompany ? <T style={styles.footerText}>{footerCompany}</T> : null}
          <Text style={styles.footerPage} render={({ pageNumber, totalPages }) => `Pág. ${pageNumber}/${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
};

export default ReceiptProofPDFDocument;
