/**
 * Validacao em runtime do que as RPCs do fluxo 2 devolvem.
 *
 * Um `data` nulo (ou sem as chaves) com `error` nulo NAO e um sucesso: o ecra
 * mostraria "feito" sobre uma resposta que ninguem leu, e os numeros do aviso
 * ("de X para Y") seriam `undefined`. Quem chama trata `null` como erro.
 */
import type { Periodicidade } from "@/types/hr";

/** O que `rpc_hr_pessoa_mudar_cargo` devolve. */
export interface ResultadoMudarCargo {
  cargo_anterior_id: string | null;
  cargo_id: string;
  desde: string;
  salario_antes: number | null;
  periodicidade_antes: Periodicidade | null;
  salario_depois: number | null;
  periodicidade_depois: Periodicidade | null;
  versoes_criadas: number;
}

/** O que `rpc_hr_cargo_definir_salario` devolve. */
export interface ResultadoDefinirSalario {
  periodo_id: string;
  pessoas_actualizadas: number;
  pessoas_sem_retribuicao: number;
}

type Objecto = Record<string, unknown>;

function comoObjecto(valor: unknown): Objecto | null {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Objecto)
    : null;
}

const eTexto = (v: unknown): v is string => typeof v === "string";
const eNumero = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const ouNulo =
  (teste: (v: unknown) => boolean) =>
  (v: unknown): boolean =>
    v === null || teste(v);

/** Todas as chaves presentes (mesmo que `null`) e do tipo certo. */
function cumpre(objecto: Objecto, regras: Record<string, (v: unknown) => boolean>): boolean {
  return Object.entries(regras).every(
    ([chave, teste]) => Object.prototype.hasOwnProperty.call(objecto, chave) && teste(objecto[chave]),
  );
}

export function lerResultadoMudarCargo(data: unknown): ResultadoMudarCargo | null {
  const o = comoObjecto(data);
  if (
    !o ||
    !cumpre(o, {
      cargo_anterior_id: ouNulo(eTexto),
      cargo_id: eTexto,
      desde: eTexto,
      salario_antes: ouNulo(eNumero),
      periodicidade_antes: ouNulo(eTexto),
      salario_depois: ouNulo(eNumero),
      periodicidade_depois: ouNulo(eTexto),
      versoes_criadas: eNumero,
    })
  ) {
    return null;
  }
  return o as unknown as ResultadoMudarCargo;
}

export function lerResultadoDefinirSalario(data: unknown): ResultadoDefinirSalario | null {
  const o = comoObjecto(data);
  if (
    !o ||
    !cumpre(o, {
      periodo_id: eTexto,
      pessoas_actualizadas: eNumero,
      pessoas_sem_retribuicao: eNumero,
    })
  ) {
    return null;
  }
  return o as unknown as ResultadoDefinirSalario;
}
