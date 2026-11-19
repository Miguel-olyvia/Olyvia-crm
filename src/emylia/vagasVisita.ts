// As vagas sugeridas para a visita (29/10/2026). Na V1 eram três datas fixas da demonstração (SLOTS: 15 e 16 de outubro); numa
// organização real (modo real) são os próximos dois dias úteis a seguir a hoje, sem fins de semana nem feriados nacionais.
// 19/11 (auditoria): cada vaga leva a data completa (ISO, com o ano) e a hora; o texto («qui 15/10 · 10:00») faz-se só para mostrar
// (rotuloVaga). Antes a vaga era só o texto e o motor punha-lhe sempre 2026.
import { feriadoDe } from "@/components/rh-exemplo/calendarioPessoa/feriados";
import { SLOTS } from "./motor";
import { modoReal } from "./acessosPortal";
import { isoDoDia, lerVaga, type Vaga } from "./vagaData";

/** Os próximos `n` dias úteis depois de `hoje` (sem sábados, domingos nem feriados nacionais). */
export function proximosDiasUteis(hoje: Date, n: number): Date[] {
  const out: Date[] = [];
  const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  while (out.length < n) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() === 0 || d.getDay() === 6 || feriadoDe(isoDoDia(d))) continue;
    out.push(new Date(d));
  }
  return out;
}

/** As três vagas: amanhã útil às 10:00 e às 15:00, e o dia útil seguinte às 09:30. */
export function vagasProximas(hoje = new Date()): Vaga[] {
  const [a, b] = proximosDiasUteis(hoje, 2);
  return [{ data: isoDoDia(a), hora: "10:00" }, { data: isoDoDia(a), hora: "15:00" }, { data: isoDoDia(b), hora: "09:30" }];
}

/** As vagas da demonstração (SLOTS, de outubro de 2026), com a data completa. */
let vagasDemo: Vaga[] | null = null;
const VAGAS_DEMO = (): Vaga[] => (vagasDemo ??= SLOTS.map((s) => lerVaga(s, new Date(2026, 0, 1))!));

/** As vagas a mostrar: as próximas numa organização real; as da demonstração no protótipo (e nos testes). */
export const vagasVisita = (hoje = new Date()): Vaga[] => (modoReal() ? vagasProximas(hoje) : VAGAS_DEMO());
