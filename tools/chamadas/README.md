# Chamadas → ficha da visita (protótipo, 4 de novembro de 2026)

Transcreve as chamadas aos leads e preenche automaticamente a ficha que prepara a
visita do comercial. Tudo corre em casa: o áudio nunca sai do PC.

## No browser (o que se usa)

```
python tools/chamadas/servidor.py        →  http://127.0.0.1:8765/
```

A página pede o microfone do PC, manda o áudio por WebSocket para o servidor (onde está
a GPU), e mostra as falas com quem falou enquanto a chamada decorre, com um medidor de som.
"Terminar e preencher a ficha" fecha a chamada, corre o LLM e mostra a ficha para rever na
própria página. Em baixo ficam as chamadas anteriores, com ficha e transcrição.

Escolhe-se o comercial pela voz registada (`vozes/<nome>.wav`, feita com `registar_voz.py`).
Hoje corre no PC da comercial; para servir vários PCs põe-se o servidor numa máquina com
GPU, `--host 0.0.0.0`, e https à frente (o browser só dá o microfone em https ou localhost).

### Na app Olyvia (ramo feature/rh-pessoas)

No Negócio, «Tudo na chamada» tem o painel «Chamada em direto» (src/emylia/ChamadaDireto.tsx):
a app manda ao motor os campos da Lead e do Contacto (k, l, t, op) no arranque, o motor
extrai com essa definição e devolve `extracao` no fim; a comercial confirma e «Preencher»
escreve nos campos vazios. O motor tem de estar a correr no PC (`python tools/chamadas/servidor.py`);
`localStorage.olyvia.chamadas.motor` aponta para outro PC. `?teste=1` no endereço mostra
«Testar com a chamada de exemplo», que usa o WAV do motor em vez do microfone.

## Modo direto no Terminal

O mesmo motor sem browser: o telemóvel em alta voz, o microfone do PC ouve os dois lados
e a transcrição aparece no Terminal. No fim, Enter: a ficha preenche-se e abre no browser.

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
| `servidor.py` + `pagina.html` | Modo browser. FastAPI com um WebSocket por chamada: recebe int16 a 16 kHz, dá à `Sessao` e devolve as falas; serve as fichas de `saida/`. Uma chamada de cada vez na GPU. | |
| `ao_vivo.py` | Classe `Sessao` (o motor: VAD, whisper, falantes, gravação, ficha) e o modo Terminal. Lê o microfone em blocos de 30 ms, corta em falas por energia (piso de ruído adaptativo, pausa de 0,8 s fecha a fala), transcreve cada fala com o faster-whisper, pede ao `falantes.py` quem falou, mostra no ecrã e vai gravando o JSON. No fim grava o WAV e corre a ficha. | `saida/<nome>.wav`, `.transcricao.json`, `.txt`, `.extracao.json`, `.revisao.html` |
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

## O que as entrevistas reais ensinaram (4 de novembro, duas gravações da Catarina)

Duas chamadas reais, gravadas pelo PC com o telemóvel em alta voz (3 min e 25 s):

- **O VAD por energia não serve para telefone.** Passou a usar-se o VAD Silero que vem no
  faster-whisper, em modo contínuo (estado guardado entre blocos de 32 ms). Pausa de 0,4 s
  fecha a fala; ao telefone responde-se depressa.
- **A primeira voz é o cliente a atender ("Estou?").** Sem voz registada, a primeira voz conta
  como cliente (`--primeiro comercial` para o contrário). Com a voz da comercial registada
  (feita a partir das falas limpas dela na gravação) as falas dela ficam todas certas.
- **A resposta vem colada à pergunta.** A mesma fala traz as duas pessoas, por isso o falante
  é decidido frase a frase (segmento do whisper), não pela fala inteira.
- **O lado do cliente é o ponto fraco.** Vem abafado pelo altifalante do telemóvel: o whisper
  transcreve mal e inventa frases ("Eu também te amo"), e a voz fica difícil de reconhecer.
  O que ajuda: volume do telemóvel no máximo e o telemóvel junto ao microfone.
- **Prompt inicial fora; hotwords dentro.** Com o prompt, fala fora do tema devolvia o próprio
  prompt. As hotwords ("Mudelar, walk-in shower, SPC, poliban, base de duche") corrigem o
  vocabulário sem esse efeito.
- **O Qwen 8B adivinha.** Toma a pergunta "é moradia ou andar?" como resposta, inventa
  "sem elevador" e marca campos não falados com confiança 0,5. Há uma guarda (pergunta do
  comercial não é prova) e as regras do prompt foram reforçadas, mas um modelo maior ou o
  Claude (só texto) fará melhor. Por isso a revisão humana é obrigatória. O modo de
  raciocínio do Qwen (`CHAMADAS_PENSAR=1`) é pior: inventa mais e com confiança total.
  Na entrevista completa, sem pensar: 6 campos certos (nome, morada, o que quer, divisões,
  visita, pavimento), 1 errado (prazo = data do pré-agendamento) e 6 a rever.
- **Decisão (4 de novembro): fica tudo local.** O motor Claude está escrito em `extrair.py`
  (`CHAMADAS_LLM=anthropic`, chave em `.env.local`) mas não foi testado nem se usa.
- **Sem internet nos modelos.** O cliente do Hugging Face ia confirmar versões e ficava
  pendurado; os modelos carregam em modo offline (`CHAMADAS_ONLINE=1` para atualizar).

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

## Online (a app no Vercel, o motor neste PC)

O áudio continua a ser processado neste PC, onde está a GPU. A app, no Vercel, liga-se ao
motor por um túnel https com WebSocket e um segredo partilhado:

1. Segredo: o motor arranca com CHAMADAS_TOKEN definido (o valor fica em tools/chamadas/segredo.txt,
   fora do git). Sem token, o motor recusa o WebSocket e as rotas /api (401), exceto /api/estado,
   que só diz se o segredo bate certo.
2. Túnel: cloudflared tunnel --url http://127.0.0.1:8765 dá um endereço https://….trycloudflare.com
   (muda de cada vez; um túnel com nome fixo precisa de cloudflared tunnel login, um clique do Rúben).
3. App: no painel «Chamada em direto», «Motor» abre as definições: endereço wss://….trycloudflare.com/ws
   e o segredo, guardados no browser de cada comercial. Na build do Vercel podem ir por defeito em
   VITE_CHAMADAS_MOTOR_URL e VITE_CHAMADAS_MOTOR_SEGREDO.
4. CSP: o vercel.json só deixa a app ligar-se ao Supabase; para o túnel é preciso juntar
   https://*.trycloudflare.com wss://*.trycloudflare.com ao connect-src (ou o nome fixo do túnel).
5. O AudioWorklet vem de public/chamadas/captura.worklet.js, e não de um blob, por causa dessa CSP.

O ambiente «testarh» do Vercel (https://olyvia-crm-env-testarh-bmgest.vercel.app) publica o ramo
feature/rh-pessoas a cada push.

## Sem GPU: transcrição e campos pelo Gemini (4 de novembro, fim do dia)

Decisão do Rúben: o motor não pode depender do PC dele, e sem GPU. A transcrição e a extração
passam para a API do Gemini; o motor fica leve (VAD, voz do comercial, WebSocket) e corre em
qualquer servidor pequeno. O código do whisper e do Qwen continua cá, só se escolhe por variáveis:

| Variável | Valor | Faz |
|---|---|---|
| CHAMADAS_STT | gemini ou whisper | quem transcreve cada fala |
| CHAMADAS_LLM | gemini, ollama ou anthropic | quem preenche os campos |
| CHAMADAS_GEMINI_MODELO | gemini-3.1-flash-lite | transcrição (2 s por fala, bom em PT) |
| CHAMADAS_MODELO_GEMINI | gemini-3.8-flash | campos e resumo |
| GEMINI_API_KEY | a chave | em tools/chamadas/.env, fora do git |

Medido a 4 de novembro: gemini-3.1-flash-lite transcreve uma fala de 6 s em 1,9 s e acerta
«um T3»; gemini-3.5-flash-lite em 1,2 s mas perde frases; gemini-3.8-flash em 3 a 10 s.
Na extração, o gemini-3.8-flash na entrevista real deu nome, morada completa com andar e
localidade, apartamento deduzido do «sexto direito», visita, e não inventou elevador nem
proprietária (6 preenchidos, 2 a rever, 23 em falta, 23 s). Custo de referência: cerca de
0,12 dólares por hora de áudio transcrita, e cêntimos por chamada na extração.

### Instalar num servidor sem GPU (Linux)

    python3 -m venv .venv && . .venv/bin/activate
    pip install -r tools/chamadas/requirements-servidor.txt
    cp tools/chamadas/.env.exemplo tools/chamadas/.env   # e preencher as chaves
    CHAMADAS_TOKEN=um-segredo python tools/chamadas/servidor.py --host 0.0.0.0 --porta 8765

À frente, um https com WebSocket (Caddy ou nginx) num nome fixo, p. ex. chamadas.olyvia-ai.com,
e esse nome no connect-src do vercel.json e no painel «Motor» da app. O ffmpeg só é preciso
para o modo ficheiro; o direto não o usa.
