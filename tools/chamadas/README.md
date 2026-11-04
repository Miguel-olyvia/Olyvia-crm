# Chamadas → ficha da visita (protótipo, 4 de novembro de 2026)

Transcreve as chamadas aos leads e preenche automaticamente a ficha que prepara a
visita do comercial. Tudo corre em casa: o áudio nunca sai do PC.

## Modo direto (o que se usa)

O telemóvel fica em alta voz, o microfone do PC ouve os dois lados e a transcrição
aparece no ecrã enquanto a chamada decorre. Cada fala é transcrita mal a pessoa
faz uma pausa e sai com quem falou. No fim, Enter: a ficha preenche-se e abre no browser.

```
microfone  →  ao_vivo.py                                   →  extrair.py  →  rever.py
              deteta pausas, faster-whisper em GPU            LLM local       ficha HTML
              (modelo em memória), falantes.py diz
              quem fala pela voz registada do comercial
```

Uma vez por comercial, registar a voz (20 s a falar normalmente):

```
python registar_voz.py tiago
```

Depois, em cada chamada:

```
python ao_vivo.py --comercial tiago
```

Sem voz registada também funciona: a primeira fala conta como do comercial e as
vozes vão-se separando a partir daí. É menos fiável.

Para testar sem telefone: `python ao_vivo.py --ficheiro exemplos/chamada-teste-maria-mono.wav --rapido`.

## Modo ficheiro (gravações já feitas)

```
gravação  →  transcrever.py  →  extrair.py  →  rever.py
(wav/mp3)    whisper.cpp GPU     LLM local       ficha HTML que o comercial
             um canal por        (qwen3:8b       confirma antes de entrar
             falante             no Ollama)      na lead
```

## O que faz cada peça

| Ficheiro | Faz | Sai |
|---|---|---|
| `ao_vivo.py` | Modo direto. Lê o microfone em blocos de 30 ms, corta em falas por energia (piso de ruído adaptativo, pausa de 0,8 s fecha a fala), transcreve cada fala com o faster-whisper, pede ao `falantes.py` quem falou, mostra no ecrã e vai gravando o JSON. No fim grava o WAV e corre a ficha. | `saida/<nome>.wav`, `.transcricao.json`, `.txt`, `.extracao.json`, `.revisao.html` |
| `falantes.py` | Impressão da voz de cada fala (ECAPA do SpeechBrain, CPU). Com a voz do comercial registada compara com ela; sem registo, agrupa em duas vozes a partir da primeira fala. | |
| `registar_voz.py` | Grava 20 s do microfone para `vozes/<nome>.wav`. | |
| `whisper_local.py` | faster-whisper em GPU com os dois remendos desta máquina (PyAV bloqueado, cuBLAS). | |
| `gerar_chamada_teste.py` | Cria uma chamada fictícia em português de Portugal com duas vozes (edge-tts). Comercial no canal esquerdo, cliente no direito. | `exemplos/<nome>.wav` (estéreo), `-mono.wav`, `.guiao.txt` |
| `transcrever.py` | Converte para WAV 16 kHz. Se for estéreo, transcreve cada canal à parte e junta pelos tempos. Corta os silêncios longos de cada canal antes do whisper (senão perde-se nos tempos) e devolve-os ao tempo original. | `saida/<nome>.transcricao.json` e `.txt` |
| `campos.json` | Definição dos campos a preencher: ficha "chamada" (preparação da visita) e ficha "local" (cópia dos campos de sistema do catálogo de campos configuráveis). | |
| `extrair.py` | Dá a transcrição e a definição dos campos ao LLM, com esquema JSON obrigatório. Cada campo sai com valor, confiança e excerto da chamada. Normaliza por tipo e valida as escolhas contra as opções. | `saida/<nome>.extracao.json` |
| `rever.py` | Ficha HTML pré-preenchida com o excerto ao lado de cada campo, estados Preenchido, A rever, Não falado, e a transcrição em baixo. "Guardar revisão" descarrega o JSON revisto. | `saida/<nome>.revisao.html` |
| `pipeline.py` | Encadeia tudo. `--vigiar` fica a ver a pasta `entrada/`. | |

## Correr

```
cd tools/chamadas
python gerar_chamada_teste.py                      # só para testes
python pipeline.py exemplos/chamada-teste-maria.wav
python pipeline.py --vigiar                        # trata o que cair em entrada/
```

Variáveis (todas opcionais):

| Variável | Por defeito | Para quê |
|---|---|---|
| `CHAMADAS_WHISPER` | `D:\tools\whisper\cuda\Release\whisper-cli.exe` | binário do whisper.cpp |
| `CHAMADAS_WHISPER_MODELO` | `D:\tools\whisper\ggml-large-v3.bin` | modelo |
| `CHAMADAS_LLM` | `ollama` | `ollama` (local) ou `anthropic` |
| `CHAMADAS_MODELO_OLLAMA` | `qwen3:8b` | modelo local (cabe em 8 GB de VRAM) |
| `CHAMADAS_MODELO_ANTHROPIC` | `claude-opus-5-5` | `claude-haiku-5-5` é a opção barata; precisa de `ANTHROPIC_API_KEY` e `pip install anthropic`. Motor escrito mas não testado (não há chave neste PC). |

Precisa de: ffmpeg no PATH, Python 3.12 com `numpy`, `requests`, `sounddevice`, `faster-whisper`,
`torch` (CPU chega) e `speechbrain`, `edge-tts` (só para gerar testes), whisper.cpp com CUDA (modo ficheiro),
Ollama com o modelo puxado (`ollama pull qwen3:8b`).

## Resultados na chamada de teste (3,4 min, duas vozes neurais)

| Modo | Transcrição | Falante certo | Ficha |
|---|---|---|---|
| Direto (ficheiro a fingir de microfone, voz do comercial registada) | 0,6 s por fala, máx. 1,2 s | 56 de 56 falas | 29 de 31 campos, 45 s no fim |
| Ficheiro estéreo (whisper.cpp) | 20 s no total | pelo canal | 26 de 31 campos |

Com o microfone real (sem telefone, só a sala) apareceram três problemas, já corrigidos:
o piso de ruído não subia durante a fala e o detetor nunca via pausas (agora desce depressa
e sobe devagar, sempre); em monólogos longos uma pausa de 0,4 s chega para fechar a fala;
e com fala fora do tema o whisper devolvia o prompt inicial em vez do que ouvia (o prompt
foi retirado). De 5 em 5 segundos sai uma linha com o nível do som, o piso e se está a ouvir
fala, para se ver logo se o microfone apanha. O teste completo com o telemóvel em alta voz
ainda não foi feito: é o próximo passo, com uma chamada a sério.

O whisper tem de sair da GPU antes do LLM arrancar: com os dois carregados a ficha
demorava 6 minutos em vez de 45 segundos (8 GB de VRAM não chegam para os dois).

## Decisões

- **Direto por falas, não por janela deslizante.** Transcrever a fala inteira quando a pessoa
  faz pausa dá texto limpo e uma fala por pessoa, que é o que a separação de vozes precisa.
  O custo é a latência de uma fala (a frase aparece quando termina), que ao telefone é natural.
- **Quem fala, pela voz registada do comercial.** Numa chamada só há duas pessoas e uma é sempre
  a mesma. Comparar cada fala com a voz dele é mais fiável do que diarização genérica
  e não precisa de modelos com registo no Hugging Face.
- **No modo ficheiro, separação pelo canal.** As centrais gravam um canal por lado.
- **Extração por LLM com esquema, não por keywords.** "Tem duas casas de banho mas só quero
  mexer na principal" preenche `n_casas_banho=2` e `divisoes=casa de banho`. Keywords não fazem isto.
- **A definição dos campos é dados, não código.** `campos.json` tem a mesma forma do
  `cfg_campos` da app. Na integração, lê-se a definição da empresa e a extração passa a
  preencher os campos que o admin configurou.
- **Nada entra na lead sem revisão humana.** A ficha HTML é o passo obrigatório. O JSON
  revisto é o que se grava.
- **Confiança por campo.** Abaixo de 0,75 fica "A rever" e aparece destacado.

## O que falta para produção

1. Origem das gravações: webhook ou pasta partilhada da central telefónica (depende de qual é).
2. Diarização para gravações mono.
3. Gravar o JSON revisto na lead e na ficha do local (edge function com sessão, como o
   levantamento por conversa).
4. Ler `campos.json` da configuração da empresa em vez do ficheiro.
5. Aviso de gravação e consentimento: o campo `consentimento_gravacao` só é "sim" se o cliente
   o disser depois de avisado. Convém que a central toque o aviso automaticamente.
6. Fila com vários trabalhadores se o volume subir (hoje é sequencial: 3,5 min de chamada
   demoram cerca de 20 s a transcrever na RTX 5070).
