"""Gera a ficha de revisão em HTML a partir da extração.

O comercial vê o formulário pré-preenchido, com o excerto da chamada ao lado de
cada campo, corrige o que for preciso e carrega em "Guardar": sai um JSON revisto
(<nome>.revisto.json) pronto a entrar na lead. Nada entra na lead sem esta revisão.

Uso:  python rever.py <nome>.extracao.json [--saida pasta]
Sai:  <nome>.revisao.html
"""
import argparse
import html
import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

CSS = """
:root{--fundo:#f6f5f2;--cartao:#fff;--texto:#1d1d1b;--suave:#6b6b66;--linha:#e6e3dc;--ok:#1f7a4d;--okf:#e3f3ea;
--rever:#9a6300;--reverf:#fff3d6;--falta:#8a8a85;--faltaf:#f0efeb;--primario:#1d4ed8}
*{box-sizing:border-box}body{margin:0;background:var(--fundo);color:var(--texto);font:15px/1.45 system-ui,Segoe UI,Roboto,sans-serif}
main{max-width:1100px;margin:0 auto;padding:24px 16px 80px}h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 10px}
.meta{color:var(--suave);font-size:13px}.resumo{background:var(--cartao);border:1px solid var(--linha);border-radius:10px;padding:14px 16px;margin:16px 0}
table{width:100%;border-collapse:collapse;background:var(--cartao);border:1px solid var(--linha);border-radius:10px;overflow:hidden}
th,td{padding:10px 12px;text-align:left;vertical-align:top;border-top:1px solid var(--linha)}th{font-size:12px;color:var(--suave);text-transform:uppercase;letter-spacing:.03em;border-top:0;background:#faf9f6}
td.campo{width:24%;font-weight:600}td.valor{width:30%}td.excerto{color:var(--suave);font-size:13px;font-style:italic}
input,select,textarea{width:100%;padding:7px 9px;border:1px solid var(--linha);border-radius:7px;font:inherit;background:#fff}textarea{min-height:64px}
.estado{display:inline-block;font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;white-space:nowrap}
.preenchido{color:var(--ok);background:var(--okf)}.rever{color:var(--rever);background:var(--reverf)}.em_falta{color:var(--falta);background:var(--faltaf)}
tr.rever td.campo{border-left:3px solid var(--rever)}tr.em_falta td{opacity:.75}
.barra{position:fixed;bottom:0;left:0;right:0;background:#fff;border-top:1px solid var(--linha);padding:12px 16px;display:flex;gap:12px;align-items:center;justify-content:center}
button{background:var(--primario);color:#fff;border:0;border-radius:8px;padding:10px 18px;font:inherit;font-weight:600;cursor:pointer}
.transcricao{background:var(--cartao);border:1px solid var(--linha);border-radius:10px;padding:12px 16px;font-size:14px}
.transcricao p{margin:4px 0}.transcricao .t{color:var(--suave);font-size:12px;margin-right:8px}.transcricao b.comercial{color:#1d4ed8}.transcricao b.cliente{color:#7c2d12}
"""

JS = """
function guardar(){
  const dados = JSON.parse(document.getElementById('dados').textContent);
  for (const f of dados.fichas) for (const c of f.campos) {
    const el = document.querySelector(`[name="${c.chave}"]`);
    if (!el) continue;
    let v = el.value;
    if (c.tipo === 'sim_nao') v = v === '' ? null : v === 'sim';
    else if (c.tipo === 'numero') v = v === '' ? null : Number(v);
    else v = v === '' ? null : v;
    c.valor_revisto = v;
    c.alterado = JSON.stringify(v) !== JSON.stringify(c.valor);
  }
  dados.revisto_em = new Date().toISOString();
  const blob = new Blob([JSON.stringify(dados, null, 2)], {type: 'application/json'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = dados.nome + '.revisto.json'; a.click();
}
"""


def _controlo(c: dict) -> str:
    chave, tipo, valor = c["chave"], c["tipo"], c["valor"]
    if tipo == "sim_nao":
        sel = "" if valor is None else ("sim" if valor else "nao")
        ops = [("", "—"), ("sim", "Sim"), ("nao", "Não")]
        return f'<select name="{chave}">' + "".join(
            f'<option value="{v}"{" selected" if v == sel else ""}>{r}</option>' for v, r in ops) + "</select>"
    if tipo == "escolha":
        ops = [("", "—")] + [(o["valor"], o["rotulo"]) for o in c.get("opcoes", [])]
        return f'<select name="{chave}">' + "".join(
            f'<option value="{html.escape(v)}"{" selected" if v == (valor or "") else ""}>{html.escape(r)}</option>' for v, r in ops) + "</select>"
    if tipo == "numero":
        return f'<input name="{chave}" type="number" step="any" value="{"" if valor is None else valor}">'
    if tipo == "texto_longo":
        return f'<textarea name="{chave}">{html.escape(valor or "")}</textarea>'
    return f'<input name="{chave}" type="text" value="{html.escape(valor or "")}">'


ESTADO = {"preenchido": "Preenchido", "rever": "A rever", "em_falta": "Não falado"}


def rever(extracao_json: Path, saida: Path, transcricao_json: Path | None = None) -> Path:
    ext = json.loads(extracao_json.read_text(encoding="utf-8"))
    nome = extracao_json.name.replace(".extracao.json", "")
    transcricao_json = transcricao_json or extracao_json.with_name(f"{nome}.transcricao.json")
    trans = json.loads(transcricao_json.read_text(encoding="utf-8")) if transcricao_json.exists() else None

    # opções precisam de ir para o HTML; o JSON embutido leva o resto
    campos_def = json.loads((Path(__file__).parent / "campos.json").read_text(encoding="utf-8"))
    opcoes = {c["chave"]: c.get("opcoes", []) for f in campos_def["fichas"] for c in f["campos"]}

    partes = [f"<!doctype html><html lang='pt'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>",
              f"<title>Revisão da chamada — {html.escape(nome)}</title><style>{CSS}</style></head><body><main>",
              f"<h1>Preparação da visita — {html.escape(nome)}</h1>",
              f"<div class='meta'>Gravação {html.escape(ext['ficheiro'])} · extração {html.escape(ext['motor'])}"
              + (f" · {trans['modo']}" if trans else "") + "</div>",
              f"<div class='resumo'><b>Resumo para o comercial</b><br>{html.escape(ext.get('resumo') or '(sem resumo)')}</div>"]
    for f in ext["fichas"]:
        partes.append(f"<h2>{html.escape(f['rotulo'])}</h2><table><tr><th>Campo</th><th>Valor</th><th>Estado</th><th>Na chamada</th></tr>")
        for c in f["campos"]:
            c = {**c, "opcoes": c.get("opcoes") or opcoes.get(c["chave"], [])}
            conf = f" · {int(c['confianca'] * 100)}%" if c["valor"] is not None else ""
            partes.append(f"<tr class='{c['estado']}'><td class='campo'>{html.escape(c['rotulo'])}</td><td class='valor'>{_controlo(c)}</td>"
                          f"<td><span class='estado {c['estado']}'>{ESTADO[c['estado']]}{conf}</span></td>"
                          f"<td class='excerto'>{html.escape(c['excerto']) if c['excerto'] else ''}</td></tr>")
        partes.append("</table>")
    if trans:
        partes.append("<h2>Transcrição</h2><div class='transcricao'>")
        for s in trans["segmentos"]:
            m, seg = divmod(int(s["inicio"]), 60)
            partes.append(f"<p><span class='t'>{m}:{seg:02d}</span><b class='{s['falante']}'>{s['falante'].capitalize()}:</b> {html.escape(s['texto'])}</p>")
        partes.append("</div>")
    dados = {**ext, "nome": nome}
    partes.append(f"<script id='dados' type='application/json'>{json.dumps(dados, ensure_ascii=False).replace('</', '<\\/')}</script>")
    partes.append("</main><div class='barra'><span class='meta'>Corrija o que for preciso e guarde. Só depois entra na lead.</span>"
                  "<button onclick='guardar()'>Guardar revisão</button></div>")
    partes.append(f"<script>{JS}</script></body></html>")
    destino = saida / f"{nome}.revisao.html"
    destino.write_text("\n".join(partes), encoding="utf-8")
    print(f"{nome}: ficha de revisão → {destino}")
    return destino


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("extracao", type=Path)
    ap.add_argument("--saida", type=Path, default=None)
    a = ap.parse_args()
    rever(a.extracao, a.saida or a.extracao.parent)
