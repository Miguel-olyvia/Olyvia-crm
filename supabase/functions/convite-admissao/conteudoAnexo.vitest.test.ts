/**
 * @vitest-environment node
 *
 * A limpeza do conteudo dos anexos: PDF com conteudo activo recusado (inclusive
 * com escapes e dentro de object streams comprimidos), e imagens sem EXIF nem
 * bytes depois do fim.
 */
import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { limparAnexo, limparJpeg, limparPng, pdfSemConteudoActivo } from "./conteudoAnexo.ts";

const enc = (s: string) => new TextEncoder().encode(s);
const cat = (...partes: Uint8Array[]) => Uint8Array.from(partes.flatMap((p) => Array.from(p)));

const PDF_LIMPO = enc("%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n%%EOF\n");

function pdfComObjStm(conteudo: string, dicionarioExtra = "/Filter /FlateDecode"): Uint8Array {
  const corpo = dicionarioExtra.includes("FlateDecode") ? deflateSync(Buffer.from(conteudo, "latin1")) : enc(conteudo);
  return cat(
    enc(`%PDF-1.5\n4 0 obj\n<< /Type /ObjStm /N 1 /First 4 ${dicionarioExtra} /Length ${corpo.length} >>\nstream\n`),
    new Uint8Array(corpo),
    enc("\nendstream\nendobj\n%%EOF\n"),
  );
}

describe("pdfSemConteudoActivo", () => {
  it("um PDF simples passa", async () => {
    expect(await pdfSemConteudoActivo(PDF_LIMPO)).toBe(true);
  });

  it.each(["/JavaScript", "/JS", "/Launch", "/EmbeddedFile", "/OpenAction"])("recusa %s", async (nome) => {
    expect(await pdfSemConteudoActivo(enc(`%PDF-1.4\n1 0 obj\n<< ${nome} 3 0 R >>\nendobj\n`))).toBe(false);
  });

  it("recusa nomes com escape hexadecimal (/J#61vaScript, /O#70enAction)", async () => {
    expect(await pdfSemConteudoActivo(enc("%PDF-1.4\n1 0 obj\n<< /S /J#61vaScript >>\nendobj\n"))).toBe(false);
    expect(await pdfSemConteudoActivo(enc("%PDF-1.4\n1 0 obj\n<< /O#70enAction 3 0 R >>\nendobj\n"))).toBe(false);
  });

  it("nao confunde com nomes parecidos (/JSON, /Launcher)", async () => {
    expect(await pdfSemConteudoActivo(enc("%PDF-1.4\n1 0 obj\n<< /JSON 1 /Launcher 2 >>\nendobj\n"))).toBe(true);
  });

  it("recusa conteudo activo DENTRO de um object stream comprimido", async () => {
    expect(await pdfSemConteudoActivo(pdfComObjStm("1 0 << /S /JavaScript /JS (x) >>"))).toBe(false);
    expect(await pdfSemConteudoActivo(pdfComObjStm("1 0 << /S /J#61vaScript >>"))).toBe(false);
  });

  it("um object stream comprimido limpo passa", async () => {
    expect(await pdfSemConteudoActivo(pdfComObjStm("1 0 << /Type /Page >>"))).toBe(true);
  });

  it("se nao consegue analisar, recusa: object stream com filtro desconhecido, corrompido ou cifrado", async () => {
    expect(await pdfSemConteudoActivo(pdfComObjStm("1 0 << /Type /Page >>", "/Filter /LZWDecode"))).toBe(false);
    expect(await pdfSemConteudoActivo(pdfComObjStm("1 0 << /Type /Page >>", "/Filter /FlateDecode").subarray(0, 120))).toBe(false);
    expect(await pdfSemConteudoActivo(enc("%PDF-1.4\ntrailer << /Encrypt 5 0 R >>\n"))).toBe(false);
  });
});

describe("pdfSemConteudoActivo: evasoes e custo", () => {
  const ACTIVO = "1 0 << /S /JavaScript /JS (x) >>";

  it("uma string com 'obj' no dicionario nao esconde o object stream (a analise e por sintaxe, nao por 'obj' para tras)", async () => {
    const corpo = deflateSync(Buffer.from(ACTIVO, "latin1"));
    const pdf = cat(
      enc(`%PDF-1.5\n4 0 obj\n<< /Type /ObjStm /X (1 0 obj) /Y (endobj) /N 1 /First 4 /Filter /FlateDecode /Length ${corpo.length} >>\nstream\n`),
      new Uint8Array(corpo),
      enc("\nendstream\nendobj\n%%EOF\n"),
    );
    expect(await pdfSemConteudoActivo(pdf)).toBe(false);
  });

  it("recusa uma cadeia de filtros: duas camadas Flate no array, ou uma so declarada com dados em duas camadas", async () => {
    const duas = deflateSync(deflateSync(Buffer.from(ACTIVO, "latin1")));
    const cadeia = cat(
      enc(`%PDF-1.5\n4 0 obj\n<< /Type /ObjStm /N 1 /First 4 /Filter [/FlateDecode /FlateDecode] /Length ${duas.length} >>\nstream\n`),
      new Uint8Array(duas),
      enc("\nendstream\nendobj\n"),
    );
    expect(await pdfSemConteudoActivo(cadeia)).toBe(false);
    const umaDeclarada = cat(
      enc(`%PDF-1.5\n4 0 obj\n<< /Type /ObjStm /N 1 /First 4 /Filter /FlateDecode /Length ${duas.length} >>\nstream\n`),
      new Uint8Array(duas),
      enc("\nendstream\nendobj\n"),
    );
    expect(await pdfSemConteudoActivo(umaDeclarada)).toBe(false);
  });

  it("recusa filtros que nao se desfazem num object stream (ASCII85, ASCIIHex, RunLength, Crypt, predictor)", async () => {
    for (const filtro of ["/ASCII85Decode", "/ASCIIHexDecode", "/RunLengthDecode", "/Crypt", "/FlateDecode /Predictor 12"]) {
      expect(await pdfSemConteudoActivo(pdfComObjStm("1 0 << /Type /Page >>", `/Filter ${filtro}`)), filtro).toBe(false);
    }
  });

  it.each(["/AA", "/URI", "/SubmitForm", "/GoToR", "/GoToE", "/ImportData", "/RichMedia", "/3D", "/Rendition", "/XFA", "/AcroForm", "/Encrypt"])(
    "recusa %s (lista alargada)",
    async (nome) => {
      expect(await pdfSemConteudoActivo(enc(`%PDF-1.4\n1 0 obj\n<< ${nome} 3 0 R >>\nendobj\n`))).toBe(false);
    },
  );

  it("um /ObjStm que o leitor de estrutura nao viu (depois de uma string por fechar) recusa", async () => {
    const corpo = deflateSync(Buffer.from("1 0 << /Type /Page >>", "latin1"));
    const pdf = cat(
      enc("%PDF-1.5\n(lixo sem fechar\n4 0 obj\n<< /Type /ObjStm /N 1 /First 4 /Filter /FlateDecode >>\nstream\n"),
      new Uint8Array(corpo),
      enc("\nendstream\nendobj\n"),
    );
    expect(await pdfSemConteudoActivo(pdf)).toBe(false);
  });

  it("custo linear: 10 MB de 'stream' repetido, sem obj nem dicionarios, recusa depressa", async () => {
    const pdf = enc("stream\n".repeat(Math.floor((10 * 1024 * 1024) / 7)));
    const t0 = Date.now();
    expect(await pdfSemConteudoActivo(pdf)).toBe(false);
    expect(Date.now() - t0).toBeLessThan(3000);
  });

  it("custo linear: 10 MB de nomes vazios e de dicionarios abertos recusam depressa", async () => {
    for (const unidade of ["/", "<< /a ", "<<>> stream\n"]) {
      const pdf = enc(unidade.repeat(Math.floor((10 * 1024 * 1024) / unidade.length)));
      const t0 = Date.now();
      await pdfSemConteudoActivo(pdf);
      expect(Date.now() - t0, unidade).toBeLessThan(4000);
    }
  });

  it("um PDF normal com muitos streams curtos (sem object streams) passa", async () => {
    const partes = Array.from({ length: 300 }, (_, k) => `${k + 10} 0 obj\n<< /Length 3 >>\nstream\nabc\nendstream\nendobj\n`);
    expect(await pdfSemConteudoActivo(enc(`%PDF-1.4\n${partes.join("")}%%EOF\n`))).toBe(true);
  });
});

/** PNG minimo com um bloco eXIf, um tEXt e lixo depois do IEND. */
function bloco(tipo: string, dados: number[]): number[] {
  const n = dados.length;
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255, ...Array.from(enc(tipo)), ...dados, 0, 0, 0, 0];
}
const ASSINATURA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const IHDR = bloco("IHDR", [0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
const IDAT = bloco("IDAT", [1, 2, 3]);
const IEND = bloco("IEND", []);

describe("limparPng", () => {
  it("tira eXIf e tEXt e tudo o que vem depois do IEND; mantem o resto por ordem", () => {
    const sujo = Uint8Array.from([
      ...ASSINATURA_PNG, ...IHDR, ...bloco("eXIf", [1, 2, 3, 4]), ...bloco("tEXt", [65, 0, 66]), ...IDAT, ...IEND, 9, 9, 9,
    ]);
    const r = limparPng(sujo);
    expect(r.ok).toBe(true);
    if (r.ok) expect(Array.from(r.bytes)).toEqual([...ASSINATURA_PNG, ...IHDR, ...IDAT, ...IEND]);
  });

  it("recusa PNG truncado ou sem IHDR primeiro", () => {
    expect(limparPng(Uint8Array.from([...ASSINATURA_PNG, ...IHDR, ...IDAT])).ok).toBe(false);
    expect(limparPng(Uint8Array.from([...ASSINATURA_PNG, ...IDAT, ...IEND])).ok).toBe(false);
  });
});

describe("limparJpeg", () => {
  const SOI = [0xff, 0xd8];
  const SOF = [0xff, 0xc0, 0, 0x0b, 8, 0, 1, 0, 1, 1, 1, 0x11, 0];
  const SOS = [0xff, 0xda, 0, 0x08, 1, 1, 0, 0, 0x3f, 0];
  const DADOS = [0x12, 0xff, 0x00, 0x34]; // com um byte stuffed
  const EOI = [0xff, 0xd9];

  it("tira EXIF/GPS (APP1), IPTC (APP13), comentarios e bytes depois do EOI", () => {
    const exif = [0xff, 0xe1, 0, 0x08, 0x45, 0x78, 0x69, 0x66, 0, 0];
    const iptc = [0xff, 0xed, 0, 0x04, 1, 2];
    const com = [0xff, 0xfe, 0, 0x05, 65, 66, 67];
    const sujo = Uint8Array.from([...SOI, ...exif, ...iptc, ...com, ...SOF, ...SOS, ...DADOS, ...EOI, 0xde, 0xad]);
    const r = limparJpeg(sujo);
    expect(r.ok).toBe(true);
    if (r.ok) expect(Array.from(r.bytes)).toEqual([...SOI, ...SOF, ...SOS, ...DADOS, ...EOI]);
  });

  it("lista branca: cai qualquer APPn que nao seja JFIF, ICC ou Adobe, e os marcadores desconhecidos", () => {
    const app5 = [0xff, 0xe5, 0, 0x04, 1, 2];
    const app0Outro = [0xff, 0xe0, 0, 0x07, 0x4a, 0x46, 0x58, 0x58, 0]; // JFXX
    const dnl = [0xff, 0xdc, 0, 0x04, 0, 1];
    const adobe = [0xff, 0xee, 0, 0x0e, 0x41, 0x64, 0x6f, 0x62, 0x65, 0, 100, 0, 0, 0, 0, 1];
    const dqt = [0xff, 0xdb, 0, 0x03, 0];
    const sujo = Uint8Array.from([...SOI, ...app5, ...app0Outro, ...dnl, ...adobe, ...dqt, ...SOF, ...SOS, ...DADOS, ...EOI]);
    const r = limparJpeg(sujo);
    expect(r.ok).toBe(true);
    if (r.ok) expect(Array.from(r.bytes)).toEqual([...SOI, ...adobe, ...dqt, ...SOF, ...SOS, ...DADOS, ...EOI]);
  });

  it("orientacao: sai com a orientacao 6 num APP1 minimo e sem o GPS nem as outras etiquetas", () => {
    // TIFF little-endian: IFD0 com Orientation=6, Artist (texto com um segredo) e um ponteiro para GPS.
    const segredo = Array.from(enc("SEGREDO-GPS-41.15N"));
    const tiff = [
      0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, // II, 42, IFD0 em 8
      0x03, 0x00, // 3 entradas
      0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, // Orientation = 6
      0x3b, 0x01, 0x02, 0x00, segredo.length, 0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, // Artist -> offset 44
      0x25, 0x88, 0x04, 0x00, 0x01, 0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, // GPSInfo
      0x00, 0x00, 0x00, 0x00,
      ...segredo,
    ];
    const corpo = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff];
    const app1 = [0xff, 0xe1, ((corpo.length + 2) >> 8) & 255, (corpo.length + 2) & 255, ...corpo];
    const jfif = [0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0];
    const sujo = Uint8Array.from([...SOI, ...jfif, ...app1, ...SOF, ...SOS, ...DADOS, ...EOI]);
    const r = limparJpeg(sujo);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const texto = new TextDecoder("latin1").decode(r.bytes);
    expect(texto).not.toContain("SEGREDO");
    expect(texto).not.toContain("GPS");
    const minimo = [
      0xff, 0xe1, 0x00, 0x22, 0x45, 0x78, 0x69, 0x66, 0, 0, 0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8,
      0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0, 0, 0, 0, 0,
    ];
    // JFIF primeiro, depois o APP1 so com a orientacao, depois a imagem
    expect(Array.from(r.bytes)).toEqual([...SOI, ...jfif, ...minimo, ...SOF, ...SOS, ...DADOS, ...EOI]);
  });

  it("orientacao 1, ausente ou invalida: nao se escreve APP1", () => {
    const corpo = [0x45, 0x78, 0x69, 0x66, 0, 0, 0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, 9, 0, 0, 0, 0, 0, 0];
    const app1 = [0xff, 0xe1, 0, corpo.length + 2, ...corpo];
    const r = limparJpeg(Uint8Array.from([...SOI, ...app1, ...SOF, ...SOS, ...DADOS, ...EOI]));
    expect(r.ok).toBe(true);
    if (r.ok) expect(Array.from(r.bytes)).toEqual([...SOI, ...SOF, ...SOS, ...DADOS, ...EOI]);
  });

  it("recusa JPEG truncado (sem EOI)", () => {
    expect(limparJpeg(Uint8Array.from([...SOI, ...SOF, ...SOS, ...DADOS])).ok).toBe(false);
  });
});

describe("limparAnexo", () => {
  it("uma assinatura que nao e pdf, png nem jpeg e recusada", async () => {
    expect((await limparAnexo("gif", enc("GIF89a"))).ok).toBe(false);
  });
});
