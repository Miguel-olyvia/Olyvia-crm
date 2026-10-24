// As páginas do Portal do Fornecedor simulado (20/10, demo), como as do portal real: Início (SupplierPortal.tsx), Encomendas
// (SupplierPortalOrders.tsx: separadores de estado com contagem, cartões no telemóvel e tabela no ecrã largo). Catálogo e Os meus dados: CatalogoDadosPortal.tsx.
import { ArrowRight, ClipboardList, Package, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtD } from "../inventario/base";
import { useInventario } from "../inventario/loja";
import { podeExpedir, poTotals } from "../inventario/po";
import type { Fornecedor } from "../inventario/tipos";
import { FILTROS_PORTAL, contagensPortal, dinheiro, noFiltro, porConfirmar, posDoPortal, type FiltroPortal } from "./dadosPortal";
import { SelosPortal } from "./SelosPortal";

const plural = (n: number, um: string, varios: string): string => (n === 1 ? `1 ${um}` : `${n.toLocaleString("pt-PT")} ${varios}`);

export function InicioPortal({ s, empresa, irEncomendas, irCatalogo }: { s: Fornecedor; empresa: string; irEncomendas: (f: FiltroPortal) => void; irCatalogo: () => void }) {
  const db = useInventario();
  const L = posDoPortal(db, s.id);
  const conf = L.filter(porConfirmar).length, exp = L.filter(podeExpedir).length;
  const artigos = db.catalog.filter((c) => c.sup === s.id && !c.inactive).length;
  const nome = (s.invite?.name || s.contact || "").trim().split(/\s+/)[0];
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold text-foreground sm:text-2xl">{nome ? `Olá, ${nome}` : "Bem-vindo"}</h1>
        <p className="text-[15px] text-muted-foreground">
          Portal do Fornecedor de <span className="font-medium text-foreground">{s.name}</span>. Aqui recebe e confirma as encomendas e mantém o seu catálogo atualizado para as empresas com quem trabalha.
        </p>
      </div>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><ClipboardList className="h-4 w-4 text-primary" aria-hidden="true" />Encomendas</CardTitle>
          <CardDescription className="text-[15px]">
            {conf === 0 ? "Não tem encomendas por confirmar." : plural(conf, "encomenda por confirmar", "encomendas por confirmar")}
            {exp > 0 ? ` · ${plural(exp, "por expedir", "por expedir")}` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="h-11 w-full gap-2 sm:w-auto" variant={conf || exp ? "default" : "outline"} onClick={() => irEncomendas(conf ? "to_confirm" : exp ? "to_ship" : "all")}>
            {conf ? "Ver encomendas por confirmar" : exp ? "Ver encomendas por expedir" : "Ver encomendas"}<ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Package className="h-4 w-4 text-primary" aria-hidden="true" />Catálogo</CardTitle>
          <CardDescription className="text-[15px]">{plural(artigos, "artigo ativo", "artigos ativos")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" className="h-11 w-full gap-2 sm:w-auto" onClick={irCatalogo}>Gerir catálogo<ArrowRight className="h-4 w-4" aria-hidden="true" /></Button>
        </CardContent>
      </Card>
      <section className="space-y-3" aria-labelledby="pf-empresas">
        <h2 id="pf-empresas" className="text-base font-semibold text-foreground">Empresas com acesso</h2>
        <div className="rounded-lg border bg-background p-4">
          <p className="truncate text-[15px] font-medium text-foreground">{empresa}</p>
          <p className="text-sm text-muted-foreground">{plural(L.length, "encomenda no portal", "encomendas no portal")}</p>
        </div>
      </section>
    </div>
  );
}

export function EncomendasPortal({ s, filtro, setFiltro, abrir }: { s: Fornecedor; filtro: FiltroPortal; setFiltro: (f: FiltroPortal) => void; abrir: (id: string) => void }) {
  const db = useInventario();
  const todas = posDoPortal(db, s.id);
  const n = contagensPortal(todas);
  const L = todas.filter((p) => noFiltro(p, filtro));
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground sm:text-2xl">Encomendas</h1>
        <p className="text-[15px] text-muted-foreground">Encomendas que as empresas lhe enviaram pelo portal. Abra uma encomenda para ver o detalhe, confirmar e expedir.</p>
      </div>
      <div role="tablist" aria-label="Estado das encomendas" className="flex gap-1 overflow-x-auto border-b">
        {FILTROS_PORTAL.map(([f, rot]) => (
          <button key={f} type="button" role="tab" aria-selected={f === filtro} onClick={() => setFiltro(f)}
            className={cn("flex h-11 shrink-0 items-center gap-1.5 border-b-2 px-3 text-[15px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
              f === filtro ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {f === "to_ship" && <Truck className="h-4 w-4" aria-hidden="true" />}{rot}
            <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">{n[f]}</span>
          </button>
        ))}
      </div>
      {L.length === 0 ? (
        <p className="py-10 text-center text-[15px] text-muted-foreground" role="status">Não há encomendas neste estado.</p>
      ) : (
        <>
          <ul className="space-y-2 md:hidden" aria-label="Encomendas">
            {L.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => abrir(p.id)} className="block w-full space-y-1.5 rounded-lg border bg-background p-3 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-foreground">{p.id}</p>
                    <SelosPortal p={p} className="justify-end" />
                  </div>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>{fmtD(p.date)} · {p.lines.length} linha(s)</span><span className="font-medium text-foreground">{dinheiro(poTotals(p).total)}</span>
                  </div>
                  {p.portal.promised && <p className="text-sm text-muted-foreground">Entrega prevista: {fmtD(p.portal.promised)}</p>}
                </button>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto rounded-lg border bg-background md:block">
            <Table>
              <TableHeader>
                <TableRow><TableHead>Encomenda</TableHead><TableHead>Data</TableHead><TableHead>Entrega prevista</TableHead><TableHead>Estado</TableHead><TableHead className="text-right">Linhas</TableHead><TableHead className="text-right">Total</TableHead><TableHead><span className="sr-only">Abrir</span></TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {L.map((p) => (
                  <TableRow key={p.id} className="cursor-pointer" onClick={() => abrir(p.id)}>
                    <TableCell className="font-semibold">{p.id}</TableCell>
                    <TableCell className="tabular-nums">{fmtD(p.date)}</TableCell>
                    <TableCell className="tabular-nums">{fmtD(p.portal.promised || p.due)}</TableCell>
                    <TableCell><SelosPortal p={p} /></TableCell>
                    <TableCell className="text-right tabular-nums">{p.lines.length}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{dinheiro(poTotals(p).total)}</TableCell>
                    <TableCell className="text-right"><Button variant="ghost" className="h-11" aria-label={`Abrir ${p.id}`} onClick={(e) => { e.stopPropagation(); abrir(p.id); }}>Abrir<ArrowRight className="h-4 w-4" aria-hidden="true" /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
