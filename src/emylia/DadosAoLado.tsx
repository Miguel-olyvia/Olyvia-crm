// 4/11 (Rúben): «ter os dados da lead como morada, contacto, nome, tipo de serviço ao lado, para ser mais fácil entrevistar». Em «Tudo na
// chamada», ao lado das perguntas da Lead e do Contacto: o que já se sabe do cliente (do negócio e do que a lead trouxe da Nova lead).
// Só lê: acompanha o que se vai escrevendo.
import { nomeLinha, type Negocio } from "./motor";

export function DadosAoLado({ d }: { d: Negocio }) {
  const x = d.dadosLead;
  const telEmail = d.tel.includes("@");
  const morada = d.f.morada
    ? [[d.f.morada, d.f.fracao].filter(Boolean).join(", "), [d.f.cp, d.f.localidade].filter(Boolean).join(" ")].filter(Boolean).join(" · ")
    : d.moradaLead ? `${[d.moradaLead.morada, d.moradaLead.fracao].filter(Boolean).join(", ")} · ${[d.moradaLead.cp, d.moradaLead.localidade].filter(Boolean).join(" ")} (por validar)` : d.local;
  const servico = nomeLinha(d) + (d.f.servico_validado === "Sim" ? " · confirmado" : "");
  const linhas: [string, string][] = [
    ["Nome", d.nome], ["Telefone", telEmail ? "" : d.tel], ["Email", d.f.email || (telEmail ? d.tel : "")], ["Morada", morada || ""],
    // 4/11 (Rúben): por baixo do tipo de serviço, o que o cliente pediu (e as notas da lead)
    ["Tipo de serviço", servico], ["O que o cliente pediu", d.f.pedido || ""], ["Notas da lead", x?.notas && x.notas !== d.f.pedido ? x.notas : ""],
    ["NIF", d.f.nif || ""], ["Empresa", x?.empresa ?? ""], ["Fonte", x?.fonte ?? ""], ["Campanha", x?.campanha ?? ""],
    ["Comercial", x?.comercial ?? ""], ...(x?.respostas ?? []).map((r): [string, string] => [r.l, r.v]),
  ];
  return (
    <aside aria-labelledby={`ao-lado-${d.id}`} className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-sm)] lg:sticky lg:top-4">
      <h2 id={`ao-lado-${d.id}`} className="text-lg font-semibold tracking-tight">O cliente</h2>
      <dl className="mt-3 space-y-3">
        {linhas.filter(([, v]) => v.trim() !== "").map(([l, v]) => (
          <div key={l} className="text-[15px] leading-snug">
            <dt className="text-sm text-muted-foreground">{l}</dt>
            <dd className="break-words font-medium">{v}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}
