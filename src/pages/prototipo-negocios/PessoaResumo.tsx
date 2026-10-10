// Os números de cada separador da lista de Pessoas, e o que a ficha mostra enquanto ninguém está escolhido.
import { MousePointerClick } from "lucide-react";
import { eur, type Estado } from "./motor";
import { resumoClientes, resumoLeads, resumoTodos } from "./perfilDocs";
import type { SeparadorLista } from "./pessoasDocs";

interface Numero { rotulo: string; valor: string; nota?: string }

/** Os quatro (ou três) números do separador atual. */
export function numerosDe(S: Estado, aba: SeparadorLista): Numero[] {
  if (aba === "leads") {
    const r = resumoLeads(S);
    return [
      { rotulo: "Leads", valor: String(r.leads) }, { rotulo: "Por contactar", valor: String(r.porContactar) },
      { rotulo: "Atrasadas", valor: String(r.atrasadas) }, { rotulo: "Valor em jogo", valor: `${eur(r.valorEmJogo)} €`, nota: "só orçamentos feitos" },
    ];
  }
  if (aba === "clientes") {
    const r = resumoClientes(S);
    return [
      { rotulo: "Clientes", valor: String(r.clientes) }, { rotulo: "Valor contratado", valor: `${eur(r.valorContratado)} €` },
      { rotulo: "Obras em curso", valor: String(r.obrasEmCurso) }, { rotulo: "A receber", valor: `${eur(r.aReceber)} €`, nota: "exemplo" },
    ];
  }
  const r = resumoTodos(S);
  return [{ rotulo: "Pessoas", valor: String(r.pessoas) }, { rotulo: "Leads", valor: String(r.leads) }, { rotulo: "Clientes", valor: String(r.clientes) }];
}

export function FaixaResumo({ S, aba, grande }: { S: Estado; aba: SeparadorLista; grande?: boolean }) {
  const ns = numerosDe(S, aba);
  return (
    <dl className={grande ? "grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4" : "grid grid-cols-2 gap-x-4 gap-y-2"}>
      {ns.map((n) => (
        <div key={n.rotulo}>
          <dt className="text-[15px] text-muted-foreground">{n.rotulo}</dt>
          <dd className={grande ? "text-3xl font-semibold tabular-nums" : "text-lg font-semibold tabular-nums"}>
            {n.valor}{n.nota && <span className="ml-1.5 text-[15px] font-normal text-muted-foreground">{n.nota}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** A direita sem ninguém escolhido: os números e um convite. Nunca um espaço em branco. */
export function PainelVazio({ S, aba }: { S: Estado; aba: SeparadorLista }) {
  const nome = aba === "leads" ? "Leads" : aba === "clientes" ? "Clientes" : "Todas as pessoas";
  return (
    <div className="px-6 py-10 lg:px-10">
      <p className="flex items-center gap-2 text-[15px] text-muted-foreground"><MousePointerClick className="h-4 w-4" aria-hidden="true" />{nome}</p>
      <h2 className="mt-1 text-2xl font-semibold tracking-tight">Escolhe uma pessoa</h2>
      <p className="mt-2 max-w-prose text-base text-muted-foreground">
        Na lista à esquerda. Aqui aparece a ficha: contacto, origem, negócios, entradas e tudo o que se passou com ela.
      </p>
      <div className="mt-8 border-t border-border pt-6"><FaixaResumo S={S} aba={aba} grande /></div>
    </div>
  );
}
