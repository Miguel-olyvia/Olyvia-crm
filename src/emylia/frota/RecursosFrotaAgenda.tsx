// A Frota dentro da Agenda (Definições › Agenda › Recursos): as viaturas ativas da Frota são os recursos "Veículo", só de leitura aqui (a viatura
// gere-se na Frota), com o que as bloqueia nos próximos 14 dias e as manutenções marcadas (reservas pontuais, manutenções marcadas, oficina) e "Abrir na Frota" (só quando a
// moldura consegue abrir a Frota). Só as viaturas que são recurso da agenda (opção "Criar recurso na Agenda"). A "Carrinha Renault Master" que já estava nos recursos é a AA-12-BC.
import { Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HOJE, fDataC } from "./base";

/** A janela dos bloqueios (duas semanas: a manutenção agendada por omissão fica a 7 dias). */
const DIAS = 14;
import { useFrota } from "./loja";
import { bloqueiosSemana, pedirFrota, recursosFrota, useMolduraFrota } from "./pontes";
import { condutor } from "./regras";

export function RecursosFrotaAgenda() {
  const F = useFrota();
  const lista = recursosFrota(F);
  const comFrota = useMolduraFrota(); // só quando a moldura do protótipo consegue mesmo abrir a Frota
  return (
    <div className="mt-6">
      <h4 className="text-base font-semibold">Veículos da Frota</h4>
      <p className="mt-1 text-[15px] text-muted-foreground">As viaturas ativas da Frota são recursos da agenda. As reservas pontuais e as manutenções marcadas bloqueiam-nas nesses dias.</p>
      <ul className="mt-3 divide-y divide-border rounded-2xl border border-border bg-card" aria-label="Veículos da Frota">
        {lista.map((r) => {
          const bl = bloqueiosSemana(F, r.vid, DIAS);
          // as manutenções marcadas (ou em curso) desta viatura, mesmo depois da janela: também a bloqueiam nesses dias
          const mt = F.manut.filter((m) => m.vid === r.vid && m.estado !== "concluída" && (m.prev ?? m.data) >= HOJE).sort((a, b) => a.data.localeCompare(b.data));
          const c = condutor(F, r.vid);
          return (
            <li key={r.id} className="flex min-h-14 flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5" aria-label={r.nome}>
              <Truck className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <span className="min-w-[12rem] flex-1">
                <span className="block text-[15px] font-medium">{r.nome}</span>
                <span className="block text-[15px] text-muted-foreground">
                  {r.antigo ? `É o recurso “${r.antigo}”. ` : ""}{c ? `Com ${c.nome}. ` : "Livre para reserva. "}
                  {bl.length ? `Bloqueada: ${bl.map((b) => `${fDataC(b.data)} ${b.txt}`).join("; ")}.` : `Sem bloqueios nos próximos ${DIAS} dias.`}
                  {mt.length ? ` Manutenções marcadas: ${mt.map((m) => `${fDataC(m.data)} ${m.tipo}${m.estado === "em curso" ? " (em curso)" : ""}`).join("; ")}.` : ""}
                </span>
              </span>
              {comFrota ? <Button variant="outline" className="h-11 px-4 text-[15px]" onClick={() => pedirFrota({ aba: "viaturas", vid: r.vid })}>Abrir na Frota</Button> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
