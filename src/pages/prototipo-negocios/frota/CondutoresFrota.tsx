// Os Condutores (pgCondutores do protótipo HTML): vêm de Pessoas (RH) — os técnicos do protótipo, o comercial e a gestora de frota.
// A carta, as categorias e a validade leem-se da ficha da pessoa; aqui não se escrevem.
import { Selo } from "../inventario/pecasInv";
import { dias, fData } from "./base";
import { useCtxFrota } from "./ctxFrota";
import { Btn, Cab, ChipF, Src, VazioF } from "./pecasFrota";
import { textoData, tomData, viaturaDe } from "./regras";

export function CondutoresFrota() {
  const { F, perfil, f, abrir, dlg } = useCtxFrota();
  if (perfil === "tecnico") return (
    <>
      <Cab titulo="Condutores" texto="Os teus dados de condutor." />
      <div className="card"><VazioF titulo="Só a gestão de frota vê a lista de condutores" texto="Os teus dados de carta estão na tua ficha de Pessoas." /></div>
    </>
  );
  const chip = f.cchip || "todas";
  const aCaducar = (p: (typeof F.pessoas)[number]) => !p.carta.length || (!!p.cartaVal && dias(p.cartaVal) <= 60);
  const l = F.pessoas.filter((p) => chip !== "carta" || aCaducar(p));
  return (
    <>
      <Cab titulo="Condutores" texto="Os condutores vêm de Pessoas (RH). A carta de condução, as categorias e a validade não se escrevem aqui, leem-se da ficha da pessoa."
        fonte={<Src t="pessoas + pessoas_identificacao.carta_conducao_numero/categorias/validade (ramo feature/rh-pessoas)" />} />
      <div className="card filters">
        <div className="chips" role="group" aria-label="Vistas">
          <ChipF k="cchip" v="todas" n={F.pessoas.length}>Todas as pessoas</ChipF>
          <ChipF k="cchip" v="carta" n={F.pessoas.filter(aCaducar).length}>Carta a caducar ou em falta</ChipF>
        </div>
      </div>
      <div className="tw">
        <table className="min-900">
          <caption className="sr">Condutores</caption>
          <thead><tr><th>Pessoa</th><th>Equipa</th><th>Carta</th><th>Validade</th><th>Viatura atual</th><th className="num">Multas</th><th><span className="sr">Ações</span></th></tr></thead>
          <tbody>
            {l.map((p) => {
              const v = viaturaDe(F, p.id), m = F.ocorr.filter((o) => o.tipo === "Multa" && o.pid === p.id).length;
              const t = tomData(p.cartaVal);
              return (
                <tr key={p.id}>
                  <td><div className="stk"><b>{p.nome}</b><small className="muted">{p.funcao}{p.tec ? " · técnico das obras" : ""}</small></div></td>
                  <td>{p.equipa}</td>
                  <td>{p.carta.length ? p.carta.map((c) => <Selo key={c} tom="neu" className="mr-1">{c}</Selo>) : <Selo tom="bad">Sem carta</Selo>}</td>
                  <td>{p.cartaVal ? <div className="stk"><span>{fData(p.cartaVal)}</span><Selo tom={t === "info" ? "ok" : t}>{textoData(p.cartaVal)}</Selo></div> : "—"}</td>
                  <td>{v ? <button type="button" className="link" onClick={() => abrir(v.id)}>{v.mat}</button> : <span className="muted">—</span>}</td>
                  <td className="num">{m}</td>
                  <td className="act">{!v && p.carta.length ? <Btn pequeno acao="atribuir" aoClicar={() => dlg("atribuir", { p: p.id })}>Atribuir viatura</Btn> : null}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
