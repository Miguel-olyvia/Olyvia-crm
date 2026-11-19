// O conteúdo da obra em PDF (react-pdf), acrescentado depois das páginas dos orçamentos no PDF da proposta
// (generateProposalPdfBlob). Só apresentação: recebe o modelo já traduzido (documentoObraPdf.ts, que usa as mesmas
// funções do ecrã do portal) e desenha-o. A tipografia é a do QuotePDFDocument (Helvetica, sem fontes externas).
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { BlocoPdf, DocumentoObraPdf, ItemPdf, PartePdf } from "@/components/portal/obra/documentoObraPdf";

const CINZA = "#6b7280";
const LINHA = "#e5e7eb";

const s = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 48, paddingHorizontal: 40, fontFamily: "Helvetica", fontSize: 9.5, color: "#111827", backgroundColor: "#ffffff" },
  titulo: { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 14 },
  bloco: { marginBottom: 16 },
  blocoTitulo: { flexDirection: "row", alignItems: "baseline", fontSize: 12, fontFamily: "Helvetica-Bold", marginBottom: 6, paddingBottom: 4, borderBottom: `1 solid ${LINHA}` },
  numero: { fontSize: 10, fontFamily: "Helvetica-Bold", marginRight: 8 },
  texto: { marginBottom: 6, lineHeight: 1.4 },
  discreto: { color: CINZA },
  rotulo: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: CINZA, textTransform: "uppercase", letterSpacing: 0.8, marginTop: 4, marginBottom: 2 },
  item: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3, borderBottom: `0.5 solid ${LINHA}` },
  itemTexto: { flex: 1, paddingRight: 8 },
  valor: { marginLeft: 12, textAlign: "right", minWidth: 40 },
  nota: { color: CINZA, fontSize: 8.5, marginTop: 1 },
  marca: { width: 6, height: 6, borderRadius: 3, marginTop: 3, marginRight: 6 },
  marcador: { width: 10 },
  fase: { marginBottom: 8 },
  faseTitulo: { flexDirection: "row", alignItems: "center", fontFamily: "Helvetica-Bold", marginBottom: 2 },
  faseCorpo: { marginLeft: 3, paddingLeft: 9, borderLeft: `1 solid ${LINHA}` },
  barra: { flexDirection: "row", height: 6, borderRadius: 3, overflow: "hidden", marginBottom: 8, backgroundColor: LINHA },
  assinaturas: { flexDirection: "row", marginTop: 18, marginBottom: 8 },
  assinatura: { flex: 1, marginRight: 24, paddingTop: 4, borderTop: `1 solid ${CINZA}` },
  quem: { fontSize: 7.5, color: CINZA, textTransform: "uppercase", letterSpacing: 1 },
  secaoTitulo: { fontFamily: "Helvetica-Bold", marginTop: 6, marginBottom: 2 },
  paginas: { position: "absolute", bottom: 20, left: 0, right: 40, textAlign: "right", fontSize: 8, color: CINZA },
});

function Item({ x, marcador }: { x: ItemPdf; marcador?: boolean }) {
  return (
    <View style={s.item} wrap={false}>
      {marcador && <Text style={s.marcador}>•</Text>}
      {x.cor && <View style={[s.marca, { backgroundColor: x.cor }]} />}
      <View style={s.itemTexto}>
        <Text>{x.texto}</Text>
        {(x.notas ?? []).map((n, i) => <Text key={i} style={s.nota}>{n}</Text>)}
      </View>
      {(x.valores ?? []).map((v, i) => <Text key={i} style={s.valor}>{v}</Text>)}
    </View>
  );
}

function Parte({ p }: { p: PartePdf }) {
  switch (p.tipo) {
    case "texto":
      return <Text style={p.discreto ? [s.texto, s.discreto] : s.texto}>{p.texto}</Text>;
    case "lista":
      return (
        <View style={{ marginBottom: 6 }}>
          {p.titulo && <Text style={s.rotulo}>{p.titulo}</Text>}
          {p.itens.map((x, i) => <Item key={i} x={x} marcador={p.marcadores} />)}
        </View>
      );
    case "fase":
      return (
        <View style={s.fase}>
          <View style={s.faseTitulo} minPresenceAhead={40}>
            <View style={[s.marca, { backgroundColor: p.cor, marginTop: 0 }]} />
            <Text>{p.titulo}</Text>
          </View>
          <View style={s.faseCorpo}>
            {p.grupos.map((g, i) => <Parte key={i} p={{ tipo: "lista", titulo: g.titulo, itens: g.itens }} />)}
          </View>
        </View>
      );
    case "barra":
      return (
        <View style={s.barra}>
          {p.segmentos.map((g, i) => <View key={i} style={{ width: `${Math.max(0, g.fracao) * 100}%`, backgroundColor: g.cor }} />)}
        </View>
      );
    case "assinaturas":
      return (
        <View style={s.assinaturas} wrap={false}>
          {p.itens.map((a, i) => (
            <View key={i} style={s.assinatura}>
              <Text style={s.quem}>{a.quem}</Text>
              <Text>{a.nome}</Text>
            </View>
          ))}
        </View>
      );
    case "secao":
      return (
        <View style={{ marginBottom: 4 }}>
          <Text style={s.secaoTitulo} minPresenceAhead={30}>{p.titulo}{p.etiqueta ? ` (${p.etiqueta})` : ""}</Text>
          {Array.isArray(p.corpo)
            ? p.corpo.map((x, i) => <Item key={i} x={{ texto: x }} marcador />)
            : <Text style={[s.texto, s.discreto]}>{p.corpo}</Text>}
        </View>
      );
  }
}

function Bloco({ b, cor }: { b: BlocoPdf; cor?: string }) {
  return (
    <View style={s.bloco}>
      <View style={s.blocoTitulo} minPresenceAhead={60}>
        {b.n !== null && <Text style={[s.numero, { color: cor ?? CINZA }]}>{String(b.n).padStart(2, "0")}</Text>}
        <Text>{b.titulo}</Text>
      </View>
      {b.partes.map((p, i) => <Parte key={i} p={p} />)}
    </View>
  );
}

export interface ObraPDFDocumentProps {
  documento: DocumentoObraPdf;
  /** A cor principal do template (os números das secções), como no ecrã. */
  cor?: string;
}

export function ObraPDFDocument({ documento, cor }: ObraPDFDocumentProps) {
  return (
    <Document title={documento.titulo} language={documento.idioma}>
      <Page size="A4" style={s.page}>
        <Text style={s.titulo}>{documento.titulo}</Text>
        {documento.blocos.map((b, i) => <Bloco key={i} b={b} cor={cor} />)}
        <Text style={s.paginas} fixed render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
      </Page>
    </Document>
  );
}
