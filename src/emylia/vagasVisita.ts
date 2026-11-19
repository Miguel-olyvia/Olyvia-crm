// As vagas sugeridas para a visita (29/10/2026). Na V1 eram três datas fixas da demonstração (SLOTS: 15 e 16 de outubro); numa
// organização real (modo real) são os próximos dois dias úteis a seguir a hoje, sem fins de semana nem feriados nacionais, no formato
// que o motor lê ("qui 15/10 · 10:00").
import { feriadoDe } from "@/components/rh-exemplo/calendarioPessoa/feriados";
import { SLOTS } from "./motor";
import { modoReal } from "./acessosPortal";

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const rotulo = (d: Date, hora: string) => `${DIAS[d.getDay()]} ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} · ${hora}`;

/** Os próximos `n` dias úteis depois de `hoje` (sem sábados, domingos nem feriados nacionais). */
export function proximosDiasUteis(hoje: Date, n: number): Date[] {
  const out: Date[] = [];
  const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  while (out.length < n) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() === 0 || d.getDay() === 6 || feriadoDe(iso(d))) continue;
    out.push(new Date(d));
  }
  return out;
}

/** As três vagas: amanhã útil às 10:00 e às 15:00, e o dia útil seguinte às 09:30. */
export function vagasProximas(hoje = new Date()): string[] {
  const [a, b] = proximosDiasUteis(hoje, 2);
  return [rotulo(a, "10:00"), rotulo(a, "15:00"), rotulo(b, "09:30")];
}

/** As vagas a mostrar: as próximas numa organização real; as da demonstração no protótipo (e nos testes). */
export const vagasVisita = (hoje = new Date()): string[] => (modoReal() ? vagasProximas(hoje) : SLOTS);
