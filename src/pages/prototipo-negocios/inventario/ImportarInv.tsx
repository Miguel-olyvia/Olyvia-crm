// Exportar e importar CSV, igual ao mockup (XP, doExport, importDlg, impPreview, impApply): o mesmo formato nos dois sentidos, colunas com os nomes do mockup,
// "Colar a exportação atual como modelo", escolher ficheiro, pré-visualização (Novo / Atualizar / Sem alterações / Erro) e importar só as linhas válidas.
import { useState } from "react";
import { Download, Eye, Upload } from "lucide-react";
import { ErroInv } from "./base";
import { objetosDe, paraCsv, type DefImportacao, type EstadoImp, type Verificacao } from "./csvInv";
import { Dlg } from "./DialogosInv";
import { useCtxInv } from "./ctxInv";
import { Pri, Sec, Selo } from "./pecasInv";

/** O botão "Exportar" do mockup (doExport): descarrega o CSV e avisa quantas linhas saíram. */
export function BotaoExportar<R>({ def, pequeno, novo }: { def: DefImportacao<R>; pequeno?: boolean; novo?: boolean }) {
  const { avisar } = useCtxInv();
  const exportar = (): void => {
    const l = def.linhas();
    try {
      const b = new Blob([paraCsv(def, l)], { type: "text/csv;charset=utf-8" }); const u = URL.createObjectURL(b);
      const a = document.createElement("a"); a.href = u; a.download = `${def.ficheiro}.csv`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 2000);
      avisar(`Exportado: ${l.length} linha(s) para ${def.ficheiro}.csv (mesmas colunas da importação).`);
    } catch { avisar("O navegador bloqueou a transferência.", true); }
  };
  return <Sec className={pequeno ? "btn-sm" : undefined} onClick={exportar}><Download className="ic" aria-hidden="true" />Exportar{novo ? <> <span className="new">Novo</span></> : null}</Sec>;
}

const TOM: Record<EstadoImp, "ok" | "info" | "neu" | "bad"> = { Novo: "ok", Atualizar: "info", "Sem alterações": "neu", Erro: "bad" };

/** O diálogo "Importar ..." do mockup. */
export function ImportarDlg<R>({ def, aoFechar }: { def: DefImportacao<R>; aoFechar: () => void }) {
  const { db, agir, avisar } = useCtxInv();
  const [texto, setTexto] = useState("");
  const [prev, setPrev] = useState<Verificacao[] | null>(null);
  const cnt = (k: EstadoImp): number => (prev ? prev.filter((r) => r.st === k).length : 0);
  const validas = cnt("Novo") + cnt("Atualizar");
  const pre = (): void => {
    try { setPrev(objetosDe(def, texto).map((o) => def.verificar(o, db))); } catch (e) { if (e instanceof ErroInv) avisar(e.message, true); else throw e; }
  };
  const importar = (): void => {
    let n = 0;
    const r = agir((d) => {
      const rows = objetosDe(def, texto); const checks = rows.map((o) => def.verificar(o, d));
      rows.forEach((o, i) => { const c = checks[i]; if (c.st === "Novo" || c.st === "Atualizar") { def.aplicar(o, d, c); n++; } });
    }, () => `${n} linha(s) importadas.`);
    if (r.ok) aoFechar();
  };
  const ficheiro = (f: File | undefined): void => { if (!f) return; const r = new FileReader(); r.onload = () => { setTexto(String(r.result)); setPrev(null); }; r.readAsText(f, "utf-8"); };
  return (
    <Dlg aberto aoFechar={aoFechar} largo titulo={`Importar ${def.rotulo}`}
      rodape={<><Sec onClick={aoFechar}>Cancelar</Sec><Sec onClick={pre}><Eye className="ic" aria-hidden="true" />Pré-visualizar</Sec><Pri disabled={!validas} onClick={importar}>Importar {prev ? validas : ""} linha(s)</Pri></>}>
      <div className="alert info"><div>Mesmo formato da exportação (no produto: XLSX; neste mockup: CSV com <b>;</b>). Colunas: <span className="mono">{def.cols.map((c) => c[0]).join(";")}</span>{def.regra ? <><br />{def.regra}</> : null}</div></div>
      <div className="row">
        <button type="button" className="btn btn-sm" onClick={() => { setTexto(paraCsv(def, def.linhas()).replace(/^\uFEFF/, "")); setPrev(null); }}><Download className="ic" aria-hidden="true" />Colar a exportação atual como modelo</button>
        <label className="btn btn-sm"><Upload className="ic" aria-hidden="true" />Escolher ficheiro CSV<input type="file" accept=".csv,text/csv" className="sr" onChange={(e) => ficheiro(e.target.files?.[0])} /></label>
      </div>
      <label className="fl"><span>Conteúdo CSV</span><textarea rows={7} className="mono" value={texto} onChange={(e) => { setTexto(e.target.value); setPrev(null); }} /></label>
      {prev && (
        <>
          <div className="row"><Selo tom="ok">{cnt("Novo")} Novo</Selo><Selo tom="info">{cnt("Atualizar")} Atualizar</Selo><Selo tom="neu">{cnt("Sem alterações")} Sem alterações</Selo><Selo tom="bad">{cnt("Erro")} Erro</Selo></div>
          <div className="tw"><table className="min-560"><thead><tr><th>#</th><th>Chave</th><th>Estado</th><th>Detalhe</th></tr></thead>
            <tbody>{prev.length ? prev.map((r, i) => <tr key={i}><td>{i + 2}</td><td className="mono">{r.key}</td><td><Selo tom={TOM[r.st]}>{r.st}</Selo></td><td>{r.msg ?? ""}</td></tr>) : <tr><td colSpan={4} className="muted">Sem linhas.</td></tr>}</tbody></table></div>
        </>
      )}
    </Dlg>
  );
}
