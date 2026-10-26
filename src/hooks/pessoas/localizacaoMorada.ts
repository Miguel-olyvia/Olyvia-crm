// «Estou no local»: a morada da obra a partir da localização do dispositivo, pela mesma via do protótipo (src/pages/prototipo-negocios/Localizacao.tsx):
// o browser dá a posição e o OpenStreetMap (Nominatim, pesquisa inversa) dá a morada. Só se devolve rua, código postal e localidade; as coordenadas
// ficam aqui dentro e nunca se guardam. Vive em @/hooks/pessoas porque é a única via das páginas de Pessoas e Negócio para o exterior (ver semBase.test.ts). ATENÇÃO: a CSP (`connect-src`) e a `Permissions-Policy: geolocation=()` do vercel.json bloqueiam as duas
// coisas em produção; este módulo falha com um motivo claro (`semSuporte`, `negada`, `servico`) em vez de inventar outra via.
import { captureFlowError } from "@/lib/observability/captureFlowError";
import type { MoradaObraForm } from "@/components/negocio-metas/moradaObra";

export const URL_MORADAS = "https://nominatim.openstreetmap.org/reverse";

/** Tempo máximo do pedido ao serviço de moradas; passado isto é «serviço indisponível». */
const TEMPO_LIMITE_MS = 10_000;
const CODIGO_POSTAL = /^\d{4}-\d{3}$/;

/** Os motivos pelos quais «Estou no local» falha; cada um tem o seu texto (`address.here.err.<motivo>`). */
export const MOTIVOS_LOCALIZACAO = ["semSuporte", "negada", "posicao", "servico", "semMorada"] as const;
export type MotivoErroLocalizacao = (typeof MOTIVOS_LOCALIZACAO)[number];

export class ErroLocalizacao extends Error {
  constructor(readonly motivo: MotivoErroLocalizacao) {
    super(motivo);
    this.name = "ErroLocalizacao";
  }
}

type Pedir = (url: string, opcoes?: RequestInit) => Promise<Response>;

const texto = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const primeiro = (...v: unknown[]): string => v.map(texto).find((x) => x !== "") ?? "";

/** A morada de um ponto (rua e número, código postal 0000-000 e localidade); o andar nunca se sabe. Lança `ErroLocalizacao`. */
export async function moradaDaPosicao(latitude: number, longitude: number, pedir: Pedir = (u, o) => fetch(u, o)): Promise<Omit<MoradaObraForm, "andar">> {
  const url = `${URL_MORADAS}?format=jsonv2&addressdetails=1&zoom=18&accept-language=pt&lat=${latitude}&lon=${longitude}`;
  let resposta: Response;
  try {
    resposta = await pedir(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(TEMPO_LIMITE_MS) });
  } catch (erro) {
    // Rede, CSP ou tempo esgotado: a pessoa vê «serviço», o erro original vai para a observabilidade.
    captureFlowError(erro, "pessoas-neg");
    throw new ErroLocalizacao("servico");
  }
  if (!resposta.ok) {
    captureFlowError(new Error(`moradaDaPosicao: HTTP ${resposta.status}`), "pessoas-neg");
    throw new ErroLocalizacao("servico");
  }
  let corpo: unknown;
  try {
    corpo = await resposta.json();
  } catch (erro) {
    captureFlowError(erro, "pessoas-neg");
    throw new ErroLocalizacao("servico");
  }
  const a = (typeof corpo === "object" && corpo !== null && "address" in corpo ? (corpo as { address: unknown }).address : null) as Record<string, unknown> | null;
  if (!a || typeof a !== "object") throw new ErroLocalizacao("semMorada");
  const via = primeiro(a.road, a.pedestrian, a.footway, a.residential);
  const rua = [via, texto(a.house_number)].filter(Boolean).join(" ");
  // O Nominatim junta por vezes a união de freguesias entre parênteses: fica só o nome.
  const localidade = primeiro(a.town, a.city, a.village, a.suburb, a.hamlet).replace(/\s*\(.*\)\s*$/, "");
  if (!rua && !localidade) throw new ErroLocalizacao("semMorada");
  const cp = texto(a.postcode);
  return { rua, codigoPostal: CODIGO_POSTAL.test(cp) ? cp : "", localidade };
}

const PERMISSAO_NEGADA = 1;
const OPCOES_POSICAO: PositionOptions = { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 };

function posicaoDoDispositivo(): Promise<GeolocationCoordinates> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator) || !navigator.geolocation) {
      reject(new ErroLocalizacao("semSuporte"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(p.coords),
      (e) => reject(new ErroLocalizacao(e.code === PERMISSAO_NEGADA ? "negada" : "posicao")),
      OPCOES_POSICAO,
    );
  });
}

export interface MoradaDoLocal {
  morada: Omit<MoradaObraForm, "andar">;
  /** A precisão da posição, em metros, para avisar quando é fraca. */
  precisaoMetros: number;
}

/** Pede a posição ao dispositivo e traduz-a numa morada. Só devolve a morada e a precisão: as coordenadas não saem. */
export async function obterMoradaDoLocal(pedir?: Pedir): Promise<MoradaDoLocal> {
  const coords = await posicaoDoDispositivo();
  const morada = await moradaDaPosicao(coords.latitude, coords.longitude, pedir);
  return { morada, precisaoMetros: Math.round(coords.accuracy) };
}
