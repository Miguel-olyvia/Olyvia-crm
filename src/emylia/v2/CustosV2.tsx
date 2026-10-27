// Custos da V2, na mesma página do Catálogo, com âncoras: Parâmetros, Perfis
// (salário → €/h, o salário só a Direção vê), Equipamentos (compra, vida útil, residual,
// manutenção → €/h) e Estrutura (Σ mensal ÷ horas produtivas). Edição na linha;
// tudo em memória (custosStore.ts). Ao mudar, os serviços em uso recebem o custo novo.
import { Lock, Plus, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { eur, nfmt, type Estado } from "../motor";
import type { LinhaCat } from "../catalogo";
import {
  CATEGORIAS_ESTRUTURA, LINHA_NOME, aplicarTodos, equipHora, horaPerfil, perfilIdDe, taxaEstrutura, totalEstrutura,
  type Custos, type CategoriaEstrutura,
} from "./custosModelo";
import { lerCustos, mudarCustos } from "./custosStore";
import { Contador, Escolha, NumeroCelula, Retirar, TextoCelula } from "./pecasCustos";

const TH = "px-2 py-2 text-left text-[15px] font-medium text-muted-foreground";
const TD = "px-2 py-1.5 align-middle";

export function CustosV2({ S, C, run, anunciar }: { S: Estado; C: Custos; run: (fn: () => void) => void; anunciar: (msg: string, desfazer?: Custos) => void }) {
  const direcao = S.role === "direcao";
  /** Muda os custos, leva-os aos serviços em uso e avisa (com "Anular" quando se retira). */
  const mudar = (fn: (c: Custos) => void, msg: string, comAnular = false) => {
    const antes = lerCustos();
    mudarCustos(fn);
    run(() => aplicarTodos(S, lerCustos()));
    anunciar(msg, comAnular ? antes : undefined);
  };
  const usamPerfil = (id: string) => Object.values(S.svc).filter((s) => perfilIdDe(C, s) === id).length;
  const nid = (pref: string, L: { id: string }[]) => pref + (Math.max(0, ...L.map((x) => Number(x.id.replace(/\D/g, "")) || 0)) + 1);

  return (
    <div className="mt-16 space-y-14">
      {/* ---------------------------------------------------------- parâmetros */}
      <section id="cat-parametros" aria-labelledby="par-t" className="scroll-mt-6">
        <h2 id="par-t" className="text-2xl font-semibold tracking-tight">Parâmetros</h2>
        <p className="mt-1 text-[15px] text-muted-foreground">Os números de base de todas as contas. Margem mínima geral {S.cfg.min}% e alvo {S.cfg.alvo}% (em Definições).</p>
        <div className="mt-3 divide-y divide-border border-y border-border">
          {([
            ["meses", "Meses de salário por ano", "meses"], ["tsu", "TSU da empresa", "%"], ["segurosAno", "Seguros e medicina, por técnico", "€/ano"],
            ["horasAno", "Horas produtivas de um técnico", "h/ano"], ["horasMes", "Horas produtivas da empresa", "h/mês"],
          ] as [keyof Custos["par"], string, string][]).map(([k, t, u]) => (
            <label key={k} className="flex min-h-14 items-center justify-between gap-4 py-2">
              <span className="text-[15px]">{t}</span>
              <span className="flex items-center gap-2">
                <NumeroCelula rotulo={t} v={C.par[k]} onSet={(n) => mudar((c) => { c.par[k] = n; }, `${t}: ${nfmt(n)} ${u}`)} />
                <span className="w-14 text-[15px] text-muted-foreground">{u}</span>
              </span>
            </label>
          ))}
          <Contador id="par-desat" rotulo="Preço de consumível desatualizado ao fim de" un="meses" v={C.par.mesesDesatualizado} minimo={1} maximo={36}
            onSet={(n) => mudar((c) => { c.par.mesesDesatualizado = n; }, `Desatualizado ao fim de ${n} meses`)} />
          {(["wc", "coz"] as LinhaCat[]).map((l) => (
            <Contador key={l} id={`par-min-${l}`} rotulo={<>Margem mínima · {LINHA_NOME[l]}{C.minLinha[l] == null && <span className="text-muted-foreground"> (a geral)</span>}</>}
              v={C.minLinha[l] ?? S.cfg.min} minimo={0} maximo={S.cfg.alvo}
              onSet={(n) => mudar((c) => { c.minLinha[l] = n; }, `Margem mínima de ${LINHA_NOME[l]}: ${n}%`)} />
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------- perfis */}
      <section id="cat-perfis" aria-labelledby="pf-t" className="scroll-mt-6">
        <h2 id="pf-t" className="text-2xl font-semibold tracking-tight">Perfis</h2>
        <p className="mt-1 text-[15px] text-muted-foreground">
          Custo/hora = salário × {nfmt(C.par.meses)} × (1 + TSU {nfmt(C.par.tsu)}%) + seguros, ÷ {nfmt(C.par.horasAno)} h produtivas.
          {!direcao && " O salário só a Direção vê e muda."}
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[600px] border-collapse">
            <thead><tr className="border-b border-border"><th scope="col" className={TH}>Perfil</th><th scope="col" className={cn(TH, "text-right")}>Salário bruto (€/mês)</th><th scope="col" className={cn(TH, "text-right")}>Custo/hora</th><th scope="col" className={cn(TH, "text-right")}>Serviços em uso</th><th scope="col" className={TH}><span className="sr-only">Retirar</span></th></tr></thead>
            <tbody>
              {C.perfis.map((p) => {
                const eh = horaPerfil(C, p.id).eh, n = usamPerfil(p.id);
                return (
                  <tr key={p.id} className="border-b border-border">
                    <td className={TD}><TextoCelula rotulo="Perfil" v={p.n} onSet={(v) => mudar((c) => { c.perfis.find((x) => x.id === p.id)!.n = v; }, "Perfil renomeado")} /></td>
                    <td className={cn(TD, "text-right")}>
                      {direcao
                        ? <NumeroCelula rotulo={`Salário de ${p.n}`} v={p.salario ?? 0} onSet={(v) => mudar((c) => { c.perfis.find((x) => x.id === p.id)!.salario = v > 0 ? v : null; }, `Salário de ${p.n} mudado`)} w="w-28" />
                        : <span className="inline-flex items-center gap-1.5 text-[15px] text-muted-foreground"><Lock className="h-4 w-4" aria-hidden="true" />Só a Direção</span>}
                    </td>
                    <td className={cn(TD, "text-right text-[15px] tabular-nums")}>
                      {eh == null
                        ? <span className="inline-flex items-center gap-1.5"><UserX className="h-4 w-4 text-warning" aria-hidden="true" />sem salário</span>
                        : `${eur(eh)} €/h`}
                    </td>
                    <td className={cn(TD, "text-right text-[15px] tabular-nums")}>{n}</td>
                    <td className={TD}><Retirar rotulo={n ? `${p.n} está em uso: não se retira` : `Retirar ${p.n}`} disabled={n > 0}
                      onClick={() => mudar((c) => { c.perfis = c.perfis.filter((x) => x.id !== p.id); }, `${p.n} retirado`, true)} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Button variant="outline" className="mt-3 min-h-11 text-[15px]" onClick={() => mudar((c) => { c.perfis.push({ id: nid("pf", c.perfis), n: "Novo perfil", salario: null }); }, "Perfil juntado")}>
          <Plus className="h-4 w-4" aria-hidden="true" />Juntar perfil
        </Button>
      </section>

      {/* ---------------------------------------------------------- equipamentos */}
      <section id="cat-equipamentos" aria-labelledby="eqp-t" className="scroll-mt-6">
        <h2 id="eqp-t" className="text-2xl font-semibold tracking-tight">Equipamentos</h2>
        <p className="mt-1 text-[15px] text-muted-foreground">€/h = (compra − residual) ÷ vida útil + manutenção do ano ÷ horas de uso por ano.</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse">
            <thead><tr className="border-b border-border">
              <th scope="col" className={TH}>Equipamento</th><th scope="col" className={cn(TH, "text-right")}>Compra €</th><th scope="col" className={cn(TH, "text-right")}>Vida útil (h)</th>
              <th scope="col" className={cn(TH, "text-right")}>Residual €</th><th scope="col" className={cn(TH, "text-right")}>Manutenção €/ano</th><th scope="col" className={cn(TH, "text-right")}>Uso h/ano</th>
              <th scope="col" className={cn(TH, "text-right")}>€/h</th><th scope="col" className={TH}><span className="sr-only">Retirar</span></th>
            </tr></thead>
            <tbody>
              {C.equip.map((e) => {
                const set = (k: "compra" | "vida" | "residual" | "manutAno" | "usoAno", t: string) => (v: number) => mudar((c) => { c.equip.find((x) => x.id === e.id)![k] = v; }, `${e.n}: ${t} mudado`);
                return (
                  <tr key={e.id} className="border-b border-border">
                    <td className={TD}><TextoCelula rotulo="Equipamento" v={e.n} onSet={(v) => mudar((c) => { c.equip.find((x) => x.id === e.id)!.n = v; }, "Equipamento renomeado")} /></td>
                    <td className={cn(TD, "text-right")}><NumeroCelula rotulo={`Compra de ${e.n}`} v={e.compra} onSet={set("compra", "preço de compra")} /></td>
                    <td className={cn(TD, "text-right")}><NumeroCelula rotulo={`Vida útil de ${e.n}`} v={e.vida} min={1} onSet={set("vida", "vida útil")} /></td>
                    <td className={cn(TD, "text-right")}><NumeroCelula rotulo={`Residual de ${e.n}`} v={e.residual} onSet={set("residual", "valor residual")} /></td>
                    <td className={cn(TD, "text-right")}><NumeroCelula rotulo={`Manutenção de ${e.n}`} v={e.manutAno} onSet={set("manutAno", "manutenção")} /></td>
                    <td className={cn(TD, "text-right")}><NumeroCelula rotulo={`Uso por ano de ${e.n}`} v={e.usoAno} onSet={set("usoAno", "uso por ano")} /></td>
                    <td className={cn(TD, "text-right text-[15px] tabular-nums")}>{eur(equipHora(e))}</td>
                    <td className={TD}><Retirar rotulo={`Retirar ${e.n}`} onClick={() => mudar((c) => {
                      c.equip = c.equip.filter((x) => x.id !== e.id);
                      for (const r of Object.values(c.receitas)) r.equip = r.equip.filter((u) => u.equip !== e.id);
                    }, `${e.n} retirado`, true)} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Button variant="outline" className="mt-3 min-h-11 text-[15px]" onClick={() => mudar((c) => { c.equip.push({ id: nid("e-novo-", c.equip), n: "Novo equipamento", compra: 500, vida: 1500, residual: 0, manutAno: 0, usoAno: 600 }); }, "Equipamento juntado")}>
          <Plus className="h-4 w-4" aria-hidden="true" />Juntar equipamento
        </Button>
      </section>

      {/* ---------------------------------------------------------- estrutura */}
      <section id="cat-estrutura" aria-labelledby="es-t" className="scroll-mt-6">
        <h2 id="es-t" className="text-2xl font-semibold tracking-tight">Estrutura</h2>
        <p className="mt-1 text-[15px] text-muted-foreground">
          Os custos fixos do mês. Taxa = Σ mensal ÷ horas produtivas da empresa.
          {S.cfg.estrutura ? " Está a somar ao custo dos serviços (Definições)." : " Não está a somar ao custo: fica dentro da margem (Definições)."}
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead><tr className="border-b border-border"><th scope="col" className={TH}>Custo</th><th scope="col" className={TH}>Categoria</th><th scope="col" className={cn(TH, "text-right")}>€/mês</th><th scope="col" className={TH}>Conta</th><th scope="col" className={TH}><span className="sr-only">Retirar</span></th></tr></thead>
            <tbody>
              {C.estrutura.map((l) => (
                <tr key={l.id} className="border-b border-border">
                  <td className={TD}><TextoCelula rotulo="Custo de estrutura" v={l.n} onSet={(v) => mudar((c) => { c.estrutura.find((x) => x.id === l.id)!.n = v; }, "Custo renomeado")} /></td>
                  <td className={TD}><Escolha rotulo={`Categoria de ${l.n}`} v={l.cat} opcoes={CATEGORIAS_ESTRUTURA} onSet={(v) => mudar((c) => { c.estrutura.find((x) => x.id === l.id)!.cat = v as CategoriaEstrutura; }, "Categoria mudada")} /></td>
                  <td className={cn(TD, "text-right")}><NumeroCelula rotulo={`Valor mensal de ${l.n}`} v={l.mensal} onSet={(v) => mudar((c) => { c.estrutura.find((x) => x.id === l.id)!.mensal = v; }, `${l.n}: ${eur(v)} €/mês`)} /></td>
                  <td className={TD}>
                    <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-[15px]">
                      <input type="checkbox" checked={l.ativo} className="h-5 w-5 accent-[hsl(var(--foreground))]"
                        onChange={() => mudar((c) => { const x = c.estrutura.find((y) => y.id === l.id)!; x.ativo = !x.ativo; }, l.ativo ? `${l.n} fora da conta` : `${l.n} na conta`)} />
                      Conta
                    </label>
                  </td>
                  <td className={TD}><Retirar rotulo={`Retirar ${l.n}`} onClick={() => mudar((c) => { c.estrutura = c.estrutura.filter((x) => x.id !== l.id); }, `${l.n} retirado`, true)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button variant="outline" className="mt-3 min-h-11 text-[15px]" onClick={() => mudar((c) => { c.estrutura.push({ id: nid("s", c.estrutura), n: "Novo custo", cat: "Outro", mensal: 0, ativo: true }); }, "Custo juntado")}>
          <Plus className="h-4 w-4" aria-hidden="true" />Juntar custo
        </Button>
        <p className="mt-4 flex flex-wrap justify-between gap-3 border-t border-border pt-4 text-[16px]">
          <span>{eur(totalEstrutura(C))} €/mês ÷ {nfmt(C.par.horasMes)} h produtivas</span>
          <span className="font-semibold tabular-nums">{eur(taxaEstrutura(C))} €/h de estrutura</span>
        </p>
        <p className="mt-2 text-[15px] text-muted-foreground">O orçamento do motor ainda soma 5,06 €/h fixos; esta taxa entra no custo do Catálogo da V2.</p>
      </section>
    </div>
  );
}
