"""Lê a transcrição de uma chamada e preenche os campos definidos em campos.json.

O modelo recebe a transcrição e a definição dos campos e devolve, para cada
campo, o valor, a confiança (0 a 1) e o excerto da transcrição que o justifica.
Nunca inventa: o que não foi dito fica a null.

Motores (variável CHAMADAS_LLM):
  ollama     (por defeito) modelo local; CHAMADAS_MODELO_OLLAMA, por defeito qwen3:8b
  anthropic  Claude pela API; CHAMADAS_MODELO_ANTHROPIC, por defeito claude-opus-5-5
             (claude-haiku-5-5 é a opção barata). Precisa de ANTHROPIC_API_KEY.

Uso:  python extrair.py <nome>.transcricao.json [--campos campos.json] [--saida pasta]
Sai:  <nome>.extracao.json
"""
import argparse
import json
import os
import re
import sys
import unicodedata
from pathlib import Path

import requests

sys.stdout.reconfigure(encoding="utf-8")

OLLAMA_URL = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
MOTOR = os.environ.get("CHAMADAS_LLM", "ollama")
MODELO_OLLAMA = os.environ.get("CHAMADAS_MODELO_OLLAMA", "qwen3:8b")
MODELO_ANTHROPIC = os.environ.get("CHAMADAS_MODELO_ANTHROPIC", "claude-opus-5-5")
PENSAR = os.environ.get("CHAMADAS_PENSAR", "") == "1"  # modo de raciocínio do qwen3 (mais lento)

SISTEMA = """És um assistente de uma empresa de remodelações em Portugal. Recebes a transcrição
de uma chamada entre um comercial e um cliente e preenches uma ficha para preparar a visita.

Quem é quem: as linhas "Comercial:" são da pessoa da empresa, que faz as perguntas; as linhas
"Cliente:" são do cliente. O nome do cliente é o nome por que o comercial o trata (por exemplo
"Dona Inês"), nunca o nome com que o comercial se apresenta.

Regras:
- Só preenches o que foi dito na chamada. Se não foi dito, valor é null e confianca é 0.
- Uma pergunta do comercial não é uma resposta. "É uma moradia ou é um andar?" não diz nada;
  só a resposta do cliente conta. Se a resposta não se percebe, fica null.
- Nunca deduzes para além do razoável. "Terceiro andar sem elevador" permite acesso "dificil";
  não permite inventar o número de andares nem se há elevador. "Sexto direito" diz que é um
  andar (apartamento), não diz nada sobre elevador.
- A transcrição do lado do cliente vem do altifalante do telemóvel e tem frases sem sentido.
  Ignora o que não faz sentido; não o copies para as observações.
- Prazo é quando o cliente quer a obra pronta. A data da visita vai só para a disponibilidade,
  e se a data for alterada durante a chamada fica a última.
- Para campos de escolha, usa exatamente um dos valores permitidos (a chave, não o rótulo).
- Para sim/não, usa "sim" ou "nao". Se não foi falado, null (não uses "nao_sei" para o que não foi dito).
- A transcrição é automática e tem erros típicos: "um T3" pode vir "1T3", "uma T2" pode vir "1 T2".
- Para números, só o número (sem unidade, com ponto decimal). "quinze mil euros" é 15000.
- O excerto é uma citação curta e literal da transcrição que justifica o valor.
- A confianca é 1 quando o cliente o disse claramente, 0.5 quando é uma dedução razoável,
  0 quando não há informação.
- O resumo tem 2 a 4 frases, em português de Portugal, dirigido ao comercial que vai à visita.
- Responde só com JSON."""


def _sem_acentos(s: str) -> str:
    return unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode().lower().strip()


def _descricao_campos(fichas: list[dict]) -> str:
    linhas = []
    for f in fichas:
        linhas.append(f"\n## {f['rotulo']} (ficha '{f['ficha']}')")
        for c in f["campos"]:
            extra = ""
            if c["tipo"] == "escolha":
                extra = " valores: " + ", ".join(f"{o['valor']} ({o['rotulo']})" for o in c["opcoes"])
            elif c["tipo"] == "sim_nao":
                extra = " valores: sim, nao"
            elif c["tipo"] == "numero":
                unidade = c.get("unidade")
                extra = " número" + (f" em {unidade}" if unidade else "")
            ajuda = f" — {c['ajuda']}" if c.get("ajuda") else ""
            linhas.append(f"- {c['chave']}: {c['rotulo']} [{c['tipo']}]{extra}{ajuda}")
    return "\n".join(linhas)


def _esquema(chaves: list[str]) -> dict:
    campo = {
        "type": "object",
        "properties": {
            "valor": {"type": ["string", "number", "boolean", "null"]},
            "confianca": {"type": "number"},
            "excerto": {"type": "string"},
        },
        "required": ["valor", "confianca", "excerto"],
    }
    return {
        "type": "object",
        "properties": {
            "campos": {"type": "object", "properties": {k: campo for k in chaves}, "required": chaves},
            "resumo": {"type": "string"},
        },
        "required": ["campos", "resumo"],
    }


def _texto_transcricao(transcricao: dict) -> str:
    return "\n".join(f"{s['falante'].capitalize()}: {s['texto']}" for s in transcricao["segmentos"])


def _pedir_ollama(sistema: str, pedido: str, esquema: dict) -> dict:
    r = requests.post(f"{OLLAMA_URL}/api/chat", json={
        "model": MODELO_OLLAMA,
        "messages": [{"role": "system", "content": sistema}, {"role": "user", "content": pedido}],
        "format": esquema,
        "stream": False,
        "think": PENSAR,
        "options": {"temperature": 0, "num_ctx": 8192},
    }, timeout=600)
    r.raise_for_status()
    return json.loads(r.json()["message"]["content"])


def _pedir_anthropic(sistema: str, pedido: str, esquema: dict) -> dict:
    import anthropic  # só quando se usa este motor
    client = anthropic.Anthropic()
    msg = client.messages.create(
        model=MODELO_ANTHROPIC,
        max_tokens=16000,
        system=sistema + "\n\nO JSON tem de seguir este esquema:\n" + json.dumps(esquema, ensure_ascii=False),
        messages=[{"role": "user", "content": pedido}],
    )
    texto = "".join(b.text for b in msg.content if b.type == "text")
    m = re.search(r"\{.*\}", texto, re.S)
    if not m:
        raise RuntimeError("A resposta não trouxe JSON: " + texto[:200])
    return json.loads(m.group(0))


def _normalizar(campo: dict, bruto: dict) -> dict:
    valor = bruto.get("valor")
    conf = float(bruto.get("confianca") or 0)
    excerto = (bruto.get("excerto") or "").strip()
    rotulo_valor = None
    vazio = valor is None or str(valor).strip() == "" or _sem_acentos(str(valor)) in {"null", "none", "nao sei", "n/a"}
    if vazio:
        valor, conf = None, 0
    else:
        v = str(valor).strip()
        if isinstance(valor, bool):
            v = "sim" if valor else "nao"
        tipo = campo["tipo"]
        if tipo == "sim_nao":
            s = _sem_acentos(v)
            if s in {"sim", "true", "yes", "1"}:
                valor, rotulo_valor = True, "Sim"
            elif s in {"nao", "false", "no", "0"}:
                valor, rotulo_valor = False, "Não"
            else:
                valor, conf = None, 0
        elif tipo == "numero":
            m = re.search(r"-?\d+(?:[.,]\d+)?", v.replace(" ", ""))
            if m:
                num = float(m.group(0).replace(",", "."))
                if campo.get("minimo") is not None and num < campo["minimo"]:
                    conf = min(conf, 0.3)
                if campo.get("maximo") is not None and num > campo["maximo"]:
                    conf = min(conf, 0.3)
                valor = int(num) if campo.get("casas_decimais", 0) == 0 and num.is_integer() else num
                unidade = campo.get("unidade")
                rotulo_valor = f"{valor} {unidade}" if unidade else str(valor)
            else:
                valor, conf = None, 0
        elif tipo == "escolha":
            opcoes = campo.get("opcoes", [])
            achado = next((o for o in opcoes if _sem_acentos(o["valor"]) == _sem_acentos(v)
                           or _sem_acentos(o["rotulo"]) == _sem_acentos(v)), None)
            if achado:
                valor, rotulo_valor = achado["valor"], achado["rotulo"]
            else:
                valor, rotulo_valor, conf = None, None, 0
        else:
            valor, rotulo_valor = v, v
    # guarda: uma pergunta do comercial não é prova de nada; se o modelo só cita a pergunta,
    # o valor fica a rever
    if excerto.lower().startswith("comercial:") and "?" in excerto and campo["tipo"] in ("escolha", "sim_nao", "numero"):
        conf = min(conf, 0.3)
    if valor is None or conf < 0.25:
        estado, valor, rotulo_valor = "em_falta", None, None
    else:
        estado = "preenchido" if conf >= 0.75 else "rever"
    return {"chave": campo["chave"], "rotulo": campo["rotulo"], "tipo": campo["tipo"], "seccao": campo.get("seccao"),
            "valor": valor, "valor_rotulo": rotulo_valor, "confianca": round(conf, 2), "excerto": excerto, "estado": estado}


def extrair(transcricao_json: Path, campos_json: Path, saida: Path) -> Path:
    transcricao = json.loads(transcricao_json.read_text(encoding="utf-8"))
    definicao = json.loads(campos_json.read_text(encoding="utf-8"))
    fichas = definicao["fichas"]
    chaves = [c["chave"] for f in fichas for c in f["campos"]]
    pedido = ("# Campos a preencher\n" + _descricao_campos(fichas) +
              "\n\n# Transcrição da chamada\n" + _texto_transcricao(transcricao) +
              "\n\nPreenche o JSON com 'campos' (um objeto por chave, com valor, confianca e excerto) e 'resumo'.")
    esquema = _esquema(chaves)
    if MOTOR == "anthropic":
        bruto, modelo = _pedir_anthropic(SISTEMA, pedido, esquema), MODELO_ANTHROPIC
    else:
        bruto, modelo = _pedir_ollama(SISTEMA, pedido, esquema), MODELO_OLLAMA
    resultado = {
        "ficheiro": transcricao["ficheiro"],
        "motor": f"{MOTOR}:{modelo}",
        "resumo": (bruto.get("resumo") or "").strip(),
        "fichas": [{"ficha": f["ficha"], "rotulo": f["rotulo"],
                    "campos": [_normalizar(c, bruto.get("campos", {}).get(c["chave"], {})) for c in f["campos"]]}
                   for f in fichas],
    }
    nome = transcricao_json.name.replace(".transcricao.json", "")
    destino = saida / f"{nome}.extracao.json"
    destino.write_text(json.dumps(resultado, ensure_ascii=False, indent=2), encoding="utf-8")
    todos = [c for f in resultado["fichas"] for c in f["campos"]]
    n = {e: sum(1 for c in todos if c["estado"] == e) for e in ("preenchido", "rever", "em_falta")}
    print(f"{nome}: {n['preenchido']} preenchidos, {n['rever']} a rever, {n['em_falta']} em falta ({resultado['motor']}) → {destino}")
    return destino


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("transcricao", type=Path)
    ap.add_argument("--campos", type=Path, default=Path(__file__).parent / "campos.json")
    ap.add_argument("--saida", type=Path, default=None)
    a = ap.parse_args()
    extrair(a.transcricao, a.campos, a.saida or a.transcricao.parent)
