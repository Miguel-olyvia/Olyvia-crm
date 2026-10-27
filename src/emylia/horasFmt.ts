// 27/10: as horas mostradas sem casas a mais ("62,62 h" → "63 h"; abaixo de 10 h, à meia hora). Não serve para valores de edição.
import { nfmt } from "./motor";

export const hfmt = (h: number) => nfmt(h >= 10 ? Math.round(h) : Math.round(h * 2) / 2);
