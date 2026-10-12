// Exportar e importar das Contagens (linhas de uma contagem) e dos Armazéns: o XP.counts e o XP.warehouses do mockup. Sem React.
import { agora, contagemPorId, exigir, falhar, nomeProd, proximoId } from "./base";
import { cpGeo } from "./cadastros";
import type { DefImportacao } from "./csvInv";
import type { Armazem, Contagem, Inventario, LinhaContagem } from "./tipos";

/** As linhas de uma contagem: só a coluna "contada" se importa. */
export function defContagem(db: Inventario, id: string): DefImportacao<LinhaContagem> {
  return {
    rotulo: "linhas da contagem", ficheiro: "contagem", regra: "Só a coluna “contada” é importada.",
    cols: [["sku", (l) => l.sku], ["produto", (l) => nomeProd(db, l.sku)], ["sistema", (l) => l.sys], ["contada", (l) => (l.counted == null ? "" : l.counted)]],
    linhas: () => contagemPorId(db, id)?.lines ?? [],
    verificar(o, d) {
      const l = (contagemPorId(d, id) as Contagem).lines.find((x) => x.sku === o.sku);
      if (!l) return { key: o.sku, st: "Erro", msg: "Produto fora desta contagem." };
      if (o.contada !== "" && !/^\d+$/.test(o.contada)) return { key: o.sku, st: "Erro", msg: "Contada: inteiro ≥ 0." };
      const v = o.contada === "" ? null : Number(o.contada);
      return { key: o.sku, st: v === l.counted ? "Sem alterações" : "Atualizar" };
    },
    aplicar(o, d) {
      exigir("inventory.count");
      const c = contagemPorId(d, id) as Contagem;
      if (c.state !== "open") falhar("Contagem não está em curso.");
      const l = c.lines.find((x) => x.sku === o.sku);
      if (!l) return falhar("Produto fora desta contagem.");
      l.counted = o.contada === "" ? null : Number(o.contada);
      c.last = agora(d);
    },
  };
}

const sim = (v: boolean): string => (v ? "sim" : "nao");

/** Os armazéns (os não eliminados): o código identifica a linha; o armazém por defeito não pode ficar inativo nem deixar de servir clientes. */
export function defArmazens(db: Inventario): DefImportacao<Armazem> {
  return {
    rotulo: "armazéns", ficheiro: "armazens",
    cols: [["codigo", (w) => w.code], ["nome", (w) => w.name], ["morada", (w) => w.addr], ["codigo_postal", (w) => w.cp], ["cidade", (w) => w.city], ["ativo", (w) => sim(w.active)], ["serve_clientes", (w) => sim(w.serves)]],
    linhas: () => db.warehouses.filter((w) => !w.deleted),
    verificar(o, d) {
      if (!o.codigo || !o.nome) return { key: o.codigo || "?", st: "Erro", msg: "Código e nome obrigatórios." };
      if (o.codigo_postal && !/^\d{4}-\d{3}$/.test(o.codigo_postal)) return { key: o.codigo, st: "Erro", msg: "Código postal inválido." };
      const w = d.warehouses.find((x) => x.code === o.codigo);
      if (!w) return { key: o.codigo, st: "Novo" };
      if (d.settings.defaultWh === w.id && (o.ativo === "nao" || o.serve_clientes === "nao")) return { key: o.codigo, st: "Erro", msg: "Armazém por defeito tem de estar ativo e servir clientes." };
      const igual = w.name === o.nome && w.addr === o.morada && w.cp === o.codigo_postal && w.city === o.cidade && sim(w.active) === o.ativo && sim(w.serves) === o.serve_clientes;
      return { key: o.codigo, st: igual ? "Sem alterações" : "Atualizar" };
    },
    aplicar(o, d) {
      exigir("inventory.manage");
      let w = d.warehouses.find((x) => x.code === o.codigo);
      if (!w) {
        w = { id: proximoId(d, "W"), code: o.codigo, deleted: false, manager: "", phone: "", email: "", cap: "", name: "", addr: "", cp: "", city: "", lat: null, lng: null, active: true, serves: true };
        d.warehouses.push(w);
      }
      const geo = cpGeo(o.codigo_postal);
      Object.assign(w, { name: o.nome, addr: o.morada, cp: o.codigo_postal, city: o.cidade, active: o.ativo !== "nao", serves: o.serve_clientes !== "nao", lat: geo ? geo[0] : null, lng: geo ? geo[1] : null });
    },
  };
}
