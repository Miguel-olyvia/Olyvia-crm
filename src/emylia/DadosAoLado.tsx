// 4/11 (Rúben): «ter os dados da lead como morada, contacto, nome, tipo de serviço ao lado, para ser mais fácil entrevistar». Em «Tudo na
// chamada», ao lado das perguntas da Lead e do Contacto: o que já se sabe do cliente (do negócio e do que a lead trouxe da Nova lead).
// Só lê: acompanha o que se vai escrevendo.
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { nomeLinha, servicosPedidos, type Estado, type Negocio } from "./motor";

// 9/11 (Rúben, telemóvel): no telemóvel os dados ficam numa linha que se abre (antes empurravam a gravação da chamada um ecrã para baixo);
// no computador (ao lado das perguntas) abertos, como antes.
const aoLado = () => typeof window === "undefined" || typeof window.matchMedia !== "function" || window.matchMedia("(min-width: 1024px)").matches;

export function DadosAoLado({ d, S }: { d: Negocio; S: Pick<Estado, "svc"> }) {
  const x = d.dadosLead;
  const telEmail = d.tel.includes("@");
  const morada = d.f.morada
    ? [[d.f.morada, d.f.fracao].filter(Boolean).join(", "), [d.f.cp, d.f.localidade].filter(Boolean).join(" ")].filter(Boolean).join(" · ")
    : d.moradaLead ? `${[d.moradaLead.morada, d.moradaLead.fracao].filter(Boolean).join(", ")} · ${[d.moradaLead.cp, d.moradaLead.localidade].filter(Boolean).join(" ")} (por validar)` : d.local;
  const servico = nomeLinha(d) + (d.f.servico_validado === "Sim" ? " · confirmado" : "");
  const linhas: [string, string][] = [
    ["Nome", d.nome], ["Telefone", telEmail ? "" : d.tel], ["Email", d.f.email || (telEmail ? d.tel : "")], ["Morada", morada || ""],
    // 4/11 (Rúben): por baixo do tipo de serviço, o que o cliente pediu (e as notas da lead)
    ["Tipo de serviço", servico], ["Serviços pedidos", servicosPedidos(d, S).map((s) => s.n).join(", ")], ["O que o cliente pediu", d.f.pedido || ""], ["Notas da lead", x?.notas && x.notas !== d.f.pedido ? x.notas : ""],
    ["NIF", d.f.nif || ""], ["Empresa", x?.empresa ?? ""], ["Fonte", x?.fonte ?? ""], ["Campanha", x?.campanha ?? ""],
    ["Comercial", x?.comercial ?? ""], ...(x?.respostas ?? []).map((r): [string, string] => [r.l, r.v]),
  ];
  const [aberto, setAberto] = useState(aoLado);
  const resumo = [d.nome, telEmail ? "" : d.tel].filter((v) => v.trim()).join(" · ");
  return (
    <aside aria-labelledby={`ao-lado-${d.id}`} className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-sm)] sm:p-5 lg:sticky lg:top-4">
      <details open={aberto} onToggle={(e) => setAberto((e.currentTarget as HTMLDetailsElement).open)} className="group">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
        <h2 id={`ao-lado-${d.id}`} className="text-lg font-semibold tracking-tight">O cliente</h2>
        {!aberto && resumo && <span className="min-w-0 flex-1 truncate text-[15px] text-muted-foreground">{resumo}</span>}
        <ChevronDown className="ml-auto h-5 w-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <dl className="mt-3 space-y-3">
        {linhas.filter(([, v]) => v.trim() !== "").map(([l, v]) => (
          <div key={l} className="text-[15px] leading-snug">
            <dt className="text-sm text-muted-foreground">{l}</dt>
            <dd className="break-words font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      </details>
    </aside>
  );
}
