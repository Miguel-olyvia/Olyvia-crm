// 22/10/2026: a leitura do Eticadata (só leitura) para o protótipo, servida pelo servidor de desenvolvimento do Vite em /api/erp/fatura.
// É a ponte de leitura em pequeno: corre neste PC, que está na rede do servidor do ERP. Em produção isto passa para a ponte
// (docs/integracao-eticadata/README.md, secção 4). A consulta é a de docs/integracao-eticadata/consultas/2-fatura-paga.sql.
//
// Regras:
// - só SELECT, com parâmetros, ligação marcada como só de leitura e READ UNCOMMITTED (não bloqueia o ERP);
// - a ligação lê-se de D:\Olyvia\.eticadata (fora do git) ou de ETICADATA_LIGACAO; a BD é a de testes (Emp_Z004) salvo ETICADATA_BD;
// - só responde a pedidos deste PC (loopback): o servidor do Vite também está aberto à rede local.
import fs from "node:fs";
import type { Plugin } from "vite";

const FICHEIRO = process.env.ETICADATA_LIGACAO || "D:/Olyvia/.eticadata";
const BD = process.env.ETICADATA_BD || "Emp_Z004";
/** O que falta pagar abaixo disto conta como pago (arredondamentos por liquidar, ex.: 0,50 € em 18 109 €). */
export const TOLERANCIA_EUR = 1;

export type EstadoErp = "paga" | "paga em parte" | "vencida" | "por pagar" | "anulada";
export type ReciboErp = { n: string; data: string; valor: number; meio: string };
export type FaturaErp = {
  encontrada: true; numero: string; atcud: string; data: string; vencimento: string; nif: string; cliente: string;
  total: number; pago: number; emFalta: number; estado: EstadoErp; recibos: ReciboErp[]; bd: string; lidaEm: string;
};
export type RespostaErp = FaturaErp | { encontrada: false; numero: string; bd: string } | { erro: string };

/** "Server=host,porta;User ID=x;Password=y" → a configuração do mssql. */
function configDe(cs: string) {
  const kv = Object.fromEntries(cs.split(";").map((p) => p.split("=")).filter((p) => p.length >= 2)
    .map(([k, ...v]) => [k.trim().toLowerCase(), v.join("=").trim()]));
  const [hostInst, porta] = String(kv.server || kv["data source"] || "").split(",");
  const [server, instanceName] = hostInst.split("\\");
  return {
    server, port: porta ? Number(porta) : undefined, database: BD,
    user: kv["user id"] || kv.uid || kv.user, password: kv.password || kv.pwd,
    options: { encrypt: false, trustServerCertificate: true, readOnlyIntent: true, instanceName: porta ? undefined : instanceName },
    connectionTimeout: 15000, requestTimeout: 20000, pool: { max: 2, min: 0, idleTimeoutMillis: 60000 },
  };
}

const dia = (x: unknown) => (x instanceof Date ? x.toISOString().slice(0, 10) : "");
const n2 = (x: unknown) => Math.round(Number(x || 0) * 100) / 100;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pool: Promise<any> | null = null;
async function ligar() {
  if (!fs.existsSync(FICHEIRO)) throw new Error(`Falta o ficheiro da ligação ao Eticadata (${FICHEIRO}).`);
  const sql = (await import("mssql")).default;
  pool ??= new sql.ConnectionPool(configDe(fs.readFileSync(FICHEIRO, "utf8").trim())).connect().catch((e: unknown) => { pool = null; throw e; });
  return { sql, p: await pool };
}

/** O estado de uma fatura no Eticadata, pelo número tal como aparece no ERP (ex.: "FAT 15200126/538"). */
export async function lerFatura(numero: string): Promise<RespostaErp> {
  const { sql, p } = await ligar();
  const r = await p.request().input("numero", sql.VarChar(50), numero.trim()).query(`
    SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
    SELECT TOP 1 c.strCodSeccao, c.strAbrevTpDoc, c.strCodExercicio, c.intNumero, c.strNumero, c.strATCUD, c.dtmData, c.dtmDataVencimento,
           c.strCVDNumContrib, c.strCVDNome, c.fltTotal, c.fltValorPendente, c.bitAnulado
    FROM Mov_Venda_Cab c WHERE c.strNumero = @numero ORDER BY c.bitAnulado;
    SELECT lc.strNumero, lc.dtmData, l.fltAtribuido,
           STUFF((SELECT DISTINCT ', ' + ISNULL(tp.strDescricao, pg.strAbrevTpMovPagTes) FROM Mov_Liquidacao_CabPagamento pg
                  LEFT JOIN Tbl_Gce_Tipos_MovPag tp ON tp.strAbreviatura = pg.strAbrevTpMovPagTes
                  WHERE pg.strCodSeccao = lc.strCodSeccao AND pg.strCodExercicio = lc.strCodExercicio AND pg.strAbrevTpDoc = lc.strAbrevTpDoc AND pg.intNumero = lc.intNumero
                  FOR XML PATH('')), 1, 2, '') AS meio
    FROM Mov_Venda_Cab c
    JOIN Mov_Liquidacao_Lin l ON l.strCodSeccaoPend = c.strCodSeccao AND l.strAbrevTpDocPend = c.strAbrevTpDoc
         AND l.strCodExercicioPend = c.strCodExercicio AND l.intNumeroPend = c.intNumero AND l.bitAnulado = 0
    JOIN Mov_Liquidacao_Cab lc ON lc.strCodSeccao = l.strCodSeccao AND lc.strCodExercicio = l.strCodExercicio
         AND lc.strAbrevTpDoc = l.strAbrevTpDoc AND lc.intNumero = l.intNumero AND lc.bitAnulado = 0
    WHERE c.strNumero = @numero AND c.bitAnulado = 0
    ORDER BY lc.dtmData;`);
  const [cab, liq] = r.recordsets as Record<string, unknown>[][];
  const c = cab?.[0];
  if (!c) return { encontrada: false, numero: numero.trim(), bd: BD };
  const total = n2(c.fltTotal), emFalta = n2(c.fltValorPendente), venc = dia(c.dtmDataVencimento), hoje = new Date().toISOString().slice(0, 10);
  const estado: EstadoErp = c.bitAnulado ? "anulada" : emFalta < TOLERANCIA_EUR ? "paga" : emFalta < total ? (venc && venc < hoje ? "vencida" : "paga em parte") : venc && venc < hoje ? "vencida" : "por pagar";
  return {
    encontrada: true, numero: String(c.strNumero), atcud: String(c.strATCUD || ""), data: dia(c.dtmData), vencimento: venc,
    nif: String(c.strCVDNumContrib || ""), cliente: String(c.strCVDNome || ""), total, pago: n2(total - emFalta), emFalta, estado,
    recibos: (liq ?? []).map((x) => ({ n: String(x.strNumero), data: dia(x.dtmData), valor: n2(x.fltAtribuido), meio: String(x.meio || "") })),
    bd: BD, lidaEm: new Date().toISOString(),
  };
}

const local = (a?: string) => !!a && (a === "::1" || a === "127.0.0.1" || a === "::ffff:127.0.0.1");

/** O plugin do Vite: GET /api/erp/fatura?numero=FAT%2015200126/538 (só no servidor de desenvolvimento). */
export function eticadataLeitura(): Plugin {
  return {
    name: "olyvia-eticadata-leitura",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/api/erp/fatura", (req, res) => {
        const responder = (estado: number, corpo: RespostaErp) => {
          res.statusCode = estado; res.setHeader("Content-Type", "application/json; charset=utf-8"); res.setHeader("Cache-Control", "no-store");
          res.end(JSON.stringify(corpo));
        };
        if (req.method !== "GET") return responder(405, { erro: "Só leitura." });
        if (!local(req.socket.remoteAddress)) return responder(403, { erro: "A leitura do ERP só responde neste PC." });
        const numero = new URL(req.url || "", "http://x").searchParams.get("numero") || "";
        if (!/^[\w .\-/]{3,50}$/.test(numero)) return responder(400, { erro: "Número de fatura inválido." });
        lerFatura(numero).then((r) => responder(200, r), (e: Error) => responder(502, { erro: "Sem ligação ao Eticadata: " + (e?.message || String(e)) }));
      });
    },
  };
}
