# Protótipo de Negócios

Este protótipo é a proposta de 08–09/10/2026 para o fluxo comercial da Olyvia, num só item de menu, **Negócios**, com seis fases: **Lead → Contacto → Visita → Negócio → Financeiro → Obra**.

Cada fase pede os seus campos e só se passa à seguinte com eles preenchidos.

Funciona como se fosse a app, mas **só com dados de exemplo**:
- não usa a base de dados nem a sessão da Olyvia;
- o que se faz fica guardado no `localStorage` do browser de quem usa.

- **Rota:** `/prototipo/negocios`, pública e fora do `Layout` do CRM, registada em `src/App.tsx`.
- **Preview:** https://olyvia-crm-git-feat-negocios-prototipo-bmgest.vercel.app/prototipo/negocios. Pede o login da equipa bmgest no Vercel.
- **Ramo:** `feat/negocios-prototipo`.
- **Maquetas estáticas** (a 1.ª versão, de 08/10): `public/prototipo/maquetas.html`.

> **Backup antes de mexer:** ver [Backup](#backup) no fim. O estado de 09/10/2026 está guardado no commit `ec9c43c2`, de três formas locais.

---

## Como correr

```bash
npm install
npm run dev                                  # e abrir http://localhost:8080/prototipo/negocios
npx vitest run src/pages/prototipo-negocios  # os testes do motor (8)
npx tsc --noEmit -p tsconfig.app.json        # o tipo (há erros antigos noutros ficheiros da app; os do protótipo têm de ficar a zero)
```

- Para recomeçar a demonstração, use **Definições → Repor a demonstração** ou apague a chave `olyvia-prototipo-negocios` do `localStorage`.
- Se mudar a forma do estado guardado, suba `VERSAO` em `motor.ts`. Os dados antigos são então ignorados e o protótipo recomeça com os dados de exemplo.

---

## Dois aspetos

| Aspeto | O que é | Onde |
|---|---|---|
| **Simples** (por defeito) | A proposta de 09/10: fundo claro, cartões, uma coisa de cada vez, letra Lexend, contraste AA e leitura fácil para dislexia | os ficheiros `*Simples.tsx`, `CamposFase.tsx` (`CampoSimples`) e as classes `.calma` em `prototipo.css` |
| **Atual** | A estética de hoje da Olyvia, só para comparar | `PaginaNegocio.tsx` (`PaginaNegocio`, `FaseAtual`), `Hoje.tsx` e a moldura escura em `PrototipoNegocios.tsx` |

Troca-se com **"Comparar com o aspeto atual"** no menu. O estado fica em `S.aspeto`.

### O interruptor "Ver a V2" (só no aspeto simples)

No menu lateral, junto a "Comparar com o aspeto atual", e no menu "Mais" do telemóvel. Liga e desliga a V2 do protótipo **inteira**:

| | V2 desligada (por defeito) | V2 ligada |
|---|---|---|
| Menu | Leads, Clientes | **Pessoas** (no lugar dos dois) |
| Negócios | a lista de sempre, uma coluna por fase | `NegociosV2`: só negócios, por documento |
| Leads e Clientes | `LeadsSimples` e a página de Clientes | `PessoasSimples` |

- A escolha **não é do `Estado`**: vive num `useState` de `PrototipoNegocios.tsx`, gravado em `localStorage` na chave própria `olyvia-prototipo-v2` (`"1"` ou `"0"`). Não mexe na `VERSAO` e não é apagada por "Repor a demonstração".
- Ao ligar ou desligar, se a vista atual deixa de existir no menu, o protótipo muda para a equivalente: `leads` e `clientes` passam a `pessoas`, e `pessoas` passa a `leads`.
- No **aspeto atual** o interruptor não aparece e a V2 não se aplica.
- Enquanto se cria uma lead com a V2 ligada ("Nova lead" abre `A.novo()`), mostra-se a lista de Negócios de sempre, porque é ela que tem o formulário. Depois de criada, a lead vê-se em Pessoas.

**As regras de desenho, pedidas pelo Ruben:**
- um só botão primário por ecrã;
- texto a 15–16 px;
- alvos de pelo menos 44 px;
- escolher em vez de escrever;
- cor só nos ícones (`FASE_COR` e `BLOCO`), nunca no texto;
- nada de cartões dentro de cartões.

---

## Ficheiros

### Estado e regras (sem React)

| Ficheiro | O que tem |
|---|---|
| `motor.ts` | O modelo de dados (`Estado`, `Negocio`) e os dados de exemplo (`seed()`, incluindo a **Joana Ribeiro**, id 1050, com tudo preenchido). Também tem as **ações** (`acoes()`), o próximo passo (`proximo()`), o cálculo do orçamento (`tot`, `linhaCalc`, `alertas`), o plano da obra (`gerarPlano`), as **visitas** (`criarVisita`, `visitas`), as sugestões automáticas (`derivar`, `sugerir`) e o **portão de fase** (`portao` dentro de `acoes`). |
| `campos.ts` | Os campos de cada fase (`LEAD`, `CONTACTO`, `EXTERIOR`, `INTERIOR`, `AREA`, `ESCOLHAS`, `PROPOSTA`, `FINANCEIRO`, `OBRA`), os campos de cada visita (`grupoVisita(n)`), as regras de obrigatório (`obrigatorio`, `emFalta`) e os **campos à medida** (`AjusteGrupo`, `efetivo`, `camposAjustados`). |
| `setores.ts` | Os modelos de setor para os campos à medida: Remodelação, Climatização (AVAC) e Painéis solares. |
| `catalogo.ts` | Os 41 serviços **reais** da Mudelar vendidos fora dos pacotes, gerados a partir de `operacao-app/tools/planeamento/dados.mjs` (EXTRAS). Os preços são de exemplo. |
| `receitas.ts` | A receita detalhada de cada serviço: equipamentos (amortização), consumíveis e o custo/hora do técnico. São de exemplo, mas batem com o motor (há um teste). |

### Ecrãs (aspeto simples)

| Ficheiro | Ecrã |
|---|---|
| `PrototipoNegocios.tsx` | A raiz: o estado, a gravação, os avisos (toasts), a moldura dos dois aspetos e o encaminhamento entre ecrãs (`S.view`). |
| `HojeSimples.tsx` | O Hoje: o que é mais urgente, depois o resto, e a agenda. A agenda (`agenda()`) vem de `Hoje.tsx`. |
| `NegociosSimples.tsx` | A lista de Negócios, com uma coluna por fase. |
| `NegociosV2.tsx` | A **V2 da lista de Negócios** (10/10/2026), que aparece em Negócios quando o interruptor **Ver a V2** está ligado: só negócios, por fase de documento: Orçamento, Proposta, Contrato, e depois Financeiro (quatro colunas). A Obra vê-se em Operações. Lead, Contacto e Visita saem, porque são fases da pessoa. Uma pessoa pode ter vários negócios, e vários orçamentos podem juntar-se numa proposta conjunta. |
| `negociosDocs.ts` | A lógica da V2, sem React: `docFase` (a fase de documento a partir de `Orcamento.enviada`, `aceite` e `contrato`), os cartões (`cartoesV2`) e os **dados de exemplo** da V2 (marcados `demo`, só nesta camada: um segundo orçamento da Carla Nunes e uma proposta conjunta do Sérgio Pinto). Não muda o `Estado`, o `seed()` nem a `VERSAO`. O ficheiro não se chama `negociosV2.ts` porque, no Windows, colide com `NegociosV2.tsx`. |
| `LeadsSimples.tsx` | A página de **Leads** (menu "Leads", antes de Clientes, com a V2 desligada; o aspeto atual não a tem): lista curta por urgência (pesquisa, quatro chips e "Só as minhas", um só botão "Nova lead" que abre o formulário de novo negócio em Negócios) e, ao escolher uma lead, a ficha na mesma página, sem diálogo. A ficha tem contactos (Ligar, WhatsApp, Email), um botão com o próximo passo e quatro separadores: **Negócios** (os cartões da V2, com os de exemplo), **Informação** (com "Marcar como perdida"), **Submissões e registos** e **Histórico**. A ficha (`FichaLead`) e a linha (`LinhaLead`) são só desta página: desde 10/10 a página de Pessoas tem as suas (`PessoaFicha.tsx` e `PessoaLinha.tsx`). |
| `leadsDocs.ts` | A lógica dos Leads, sem React e sem mudar o `Estado`: quem é lead (pessoa, agrupada por nome, sem negócio em Financeiro ou Obra nem contrato assinado, e sem perdidos), a ordem por urgência, os filtros, o "há quanto tempo" (com um "hoje" fixo, 10/10/2026) e a informação de contacto e local. A origem, as submissões e os registos à mão vêm de `toquesDocs.ts`. Testes em `leadsDocs.test.ts`. |
| `PessoasSimples.tsx` | A página de **Pessoas** (só com a V2 ligada), refeita a 10/10/2026 para ser **lista primeiro**. É só a casca: guarda o estado (separador, pesquisa, filtros, ordem, pessoa aberta e separador da ficha, numa variável de módulo que `esquecerPessoas` apaga em "Repor a demonstração") e liga a lista ao painel. **Ninguém vem escolhido por defeito** e já não há painel "Escolhe uma pessoa": a lista ocupa a largura toda (até 1600 px) e, ao clicar numa pessoa, abre-se a ficha num painel. Ao abrir um negócio e voltar, o painel reabre na mesma pessoa e no mesmo separador (e com o mesmo negócio escolhido no separador Negócios); o foco **não** regressa a nenhuma linha, porque a página desmontou. |
| `PessoaLista.tsx`, `ListaTopo.tsx` | A lista e o seu cabeçalho fixo (em lg e acima), em **três faixas**: (1) "Pessoas", "Nova lead" (secundário) e a pesquisa; (2) os separadores shadcn `Tabs` Leads, Clientes e Todos com contagens e, à direita, o botão "Filtros" que abre num `Popover` o Ordenar (Urgência, Mais recentes, Valor), a Origem, o Comercial e "Com visita"; (3) uma só fila de chips (Todas, Por contactar, Atrasadas, Só as minhas; nos clientes sem "Por contactar"). Já não há resumo de duas linhas nem faixa de números: as contagens estão nos separadores e nos chips. O estado vazio, o "Limpar filtros", a região `aria-live` com a contagem e a nota única "Exemplo" no fim da lista mantêm-se. |
| `PessoaTabela.tsx`, `PessoaLinha.tsx` | As linhas. Em lg e acima uma tabela densa (shadcn `Table`, `th scope="col"`, legenda só para leitores de ecrã) com uma linha de cerca de 56 px por pessoa e sete colunas: Pessoa (avatar, nome, Lead ou Cliente), Serviço · localidade, Etapa (ícone da fase e palavras), Origem, Último contacto ("há 4 dias" ou "sem contacto há 10 dias"), Próximo passo (com o alerta "Atrasada" em ícone e texto) e Valor (leads: o que está em orçamento ou "—"; clientes: o contratado). A célula do nome tem **um botão** (o elemento acessível) e a linha toda é clicável. Abaixo de lg a tabela vira cartões de três linhas, sem scroll horizontal (`useDesktop.ts` diz se o ecrã é lg; sem `matchMedia` conta como pequeno). A 1440x900 a primeira linha começa a cerca de 180 px do topo e cabem as 11 pessoas (**estimativa pela soma das alturas, não medida no ecrã**). |
| `toquesDocs.ts` | Os **toques** de cada pessoa (11 pessoas da seed: 8 leads e 3 clientes): cada vez que entrou em contacto, online por formulário ou registada à mão. Um toque tem via, formulário, origem (da lista da empresa), canal (o mapa fixo: Meta Ads e TikTok Ads = Redes sociais pagas; Google Ads = Pesquisa; Outdoor, Panfleto e Feira = Offline; Influencer e Indicação = Parcerias; o resto Outros), campanha, UTM em bruto (com `gclid`, `fbclid`…), data, campos preenchidos, estado de revisão, motivo e aviso de conflito. Puro, determinístico e **de exemplo**: calcula-se a partir do nome, da linha, da origem, dos campos e da data de cada negócio, com uma tabela por pessoa para a variedade (Google Ads, Meta Ads, Indicação, chamada, Outdoor por QR, Site, uma UTM de TikTok "por mapear", uma lead que voltou por outra campanha, e um conflito de email e telefone). Não toca no `Estado` nem na seed. Testes em `toquesDocs.test.ts`. |
| `PessoaPainel.tsx` | O painel lateral com a ficha (shadcn `Sheet`, a deslizar da direita, largura `min(760px, 100vw)`, ecrã inteiro no telemóvel): ao abrir, o foco vai para o nome da pessoa (o título do painel); Esc e "Fechar" fecham e devolvem o foco à linha da pessoa; enquanto o painel está aberto, os avisos (toasts) passam para dentro dele (`alvoAvisos`, num portal), porque o Radix esconde o resto da página; as setas "Anterior" e "Seguinte" (com `aria-label` com o nome) passam à pessoa vizinha da lista sem fechar, com a posição "3 de 8" (`vizinhasDe` em `listaDocs.ts`). O botão X de série do `Sheet` fica escondido (está em inglês); o painel tem o seu "Fechar". |
| `PessoaFicha.tsx`, `FichaCabecalho.tsx` | A ficha no painel. O cabeçalho tem no máximo três faixas: (1) avatar, nome, "Lead · Por contactar · Amadora", a etiqueta "Atrasada" junto ao nome (na lista, também junto ao nome) e as setas e Fechar; (2) Ligar, WhatsApp e Email (secundários, com ícone e rótulo, só ícone com tooltip num ecrã estreito) e o botão primário do próximo passo, que quebra para baixo em vez de ficar cortado; (3) as seis etapas numa linha compacta (`.etapas` em `prototipo.css`: o nome de cada etapa a partir de 560 px, senão só os ícones e o nome da atual por baixo). A faixa de factos e os avisos passaram para o Resumo. Separadores shadcn: Resumo, Negócios, Entradas, Atividade e, nos clientes, Contratos e documentos; o cabeçalho e os separadores ficam fixos e o conteúdo rola. |
| `SepNegocios.tsx`, `NegocioBloco.tsx`, `iconeNegocio.ts` | O separador Negócios, em **mestre-detalhe**: à esquerda a lista simples dos negócios da pessoa (cada linha é um botão com `aria-pressed` quando o detalhe está ao lado, e `aria-expanded` com `aria-controls` quando está por baixo, nunca os dois: ícone do negócio, serviço como título, estado em palavras (Em preparação, Orçamento, Proposta, Contrato, Financeiro, Obra; `estadoCurto`) e valor ou "Sem valor ainda"); ao clicar, o detalhe aparece **ao lado** (a partir de 640 px de largura do separador, por container query) ou por baixo, com o foco nele. Sem negócio escolhido o detalhe diz "Escolhe um negócio"; com **um só**, vem escolhido (`negocioPorDefeito`). O detalhe tem estado, valor, probabilidade de fechar (exemplo), o próximo passo (botão), o percurso Levantamento, Orçamento, Proposta e Contrato numa linha fina (a partir de 440 px; senão lista) com o atual em texto e ícone, "O que falta para o orçamento" e "Documentos" (ícone por tipo). O orçamento, a proposta e a proposta conjunta (com as suas linhas) são documentos do negócio (`negociosAgrupados`), não negócios novos. O **ícone do negócio** é o `Handshake` do lucide, o mesmo do item "Negócios" do menu lateral: vem de `iconeNegocio.ts`, que o menu também usa, para não divergirem. |
| `listaDocs.ts` | As peças puras novas, sem React: a pessoa vizinha e a posição (`vizinhasDe`, `posicaoTexto`, sem dar a volta nos limites), o texto do último contacto (`contactoTexto`), a etapa em palavras (`etapaTexto`), o valor da coluna por papel (`valorColuna`) e o negócio escolhido por defeito (`negocioPorDefeito`). Testes em `listaDocs.test.ts`; a página inteira tem um teste de interface em `PessoasSimples.test.tsx`. |
| `FichaResumo.tsx` | O separador Resumo, **numa só coluna**: próximo passo e prazo (com a visita, se houver), avisos (só se houver), contacto (NIF só nos clientes), origem (origem, canal, campanha, via de entrada e formulário), "Sobre a pessoa" (saúde com barra e "exemplo", comercial, criada, tipo de cliente, contacto preferido; `factosResumo`), 3 notas no máximo e "Marcar como perdida" (só nas leads, com a confirmação no lugar do botão). Sem cartões dentro de cartões. |
| `FichaListas.tsx` | Os separadores que são listas: Negócios (com a probabilidade de exemplo e a proposta conjunta), Entradas (os toques de `toquesDocs`), Atividade (histórico, chamadas, emails e notas numa só linha do tempo) e Contratos e documentos (com pago e por pagar, de exemplo). |
| `perfilDocs.ts` | Os dados de cada pessoa, sem React e sem mudar o `Estado`: `perfilDe` (email, telefone, morada completa, NIF só nos clientes, comercial, criada, último contacto e dias sem contacto, saúde, visita, notas, chamadas e emails, origem e prazo), `atividadeDe`, `pagamentoDe`, `probabilidade`, `estadoCurto` e `factosResumo`. Tudo o que não vem da seed é de exemplo, calculado por regras fixas a partir do nome, das fases e das datas. Testes em `perfilDocs.test.ts`. |
| `pessoasDocs.ts` | A lógica de Pessoas, sem React: é **lead** a pessoa sem negócio em Financeiro ou Obra nem contrato assinado; é **cliente** a que tem. Um cliente com um negócio aberto que ainda não é contrato continua cliente e leva a etiqueta "Novo negócio em curso". Como a seed não tem nenhum, `negociosDemo` junta, só nesta camada (marcado "exemplo"), um orçamento de cozinha em fase de orçamento à Marta Lima. Também tem os dados do cliente (valor dos contratos, n.º de contratos, obras em curso, último negócio) e os contratos e documentos (contrato, fatura, recibo e obra, derivados de `fin` e `obra`). Também ordena (`ordenarPessoas`: urgência, mais recentes, valor) e filtra por origem e comercial (`filtrarPessoas`). Testes em `pessoasDocs.test.ts`. |
| `NegocioSimples.tsx` | A página do negócio: o cabeçalho, os passos da fase (um de cada vez), as fases feitas, o botão "Ouvir" (leitura em voz alta) e a mensagem de fase concluída. |
| `PaginaNegocio.tsx` | **`passosDaFase(ctx, d, simples)`**: os passos de cada fase, partilhados pelos dois aspetos. Também tem `BotaoFase` e o aspeto atual. |
| `CamposFase.tsx` | Os campos: `Campos` (os blocos), `CampoSimples` (botões, contador, datas rápidas), `Assistente` (o acordeão do aspeto atual) e o ícone de cada bloco (`BLOCO`). |
| `Visitas.tsx` | As várias visitas de um negócio, cada uma com os seus campos. |
| `ServicosCatalogo.tsx` | Os "serviços necessários": os do pacote e os juntados do Catálogo, com pesquisa e filtro por ofício. |
| `OrcamentoSimples.tsx` | O orçamento: total, margem e linhas. Ao tocar numa linha abre `CustoServico`. |
| `CustoServico.tsx` | O detalhe do custo de um serviço: técnico, equipamentos, consumíveis e estrutura. |
| `DocsCliente.tsx` | A proposta, o contrato e a fatura como documentos, com o IVA a **6% na mão de obra e 23% nos materiais** (`totais()`). Também tem a partilha: link, email, WhatsApp, ver como o cliente e imprimir. |
| `FasesSimples.tsx` | As fases Financeiro e Obra. |
| `OperacoesSimples.tsx` | As Operações (o plano da obra) e o Inventário. |
| `OutrosSimples.tsx` | Catálogo, Clientes, Marketing e Definições. |
| `CamposEditor.tsx` | O editor dos campos à medida, em Definições → Campos e formulários. |
| `Localizacao.tsx` | A morada pela localização do dispositivo. Usa o OpenStreetMap/Nominatim. |
| `pecas.tsx` | As peças comuns: `Ctx`, `IconeFase`, `Chip`, `Progresso`, `fazer`, e outras. |
| `prototipo.css` | Os ecrãs antigos (classes `.pg`), os tokens do aspeto simples (`.calma`) e a leitura fácil (`.leitura`). |
| `motor.test.ts` | Os testes: o fluxo da Ana Martins da Lead à Obra, a aprovação da Direção, os campos e as visitas, o exemplo completo, as receitas, o IVA e os campos à medida. |

---

## Como funciona (o essencial)

- **O estado é um objeto mutável.**
  - Uma ação corre dentro de `run(() => …)`. O `run` grava no `localStorage` e redesenha o ecrã.
  - Nada é imutável: as ações mudam o `S` no sítio.
- **Os campos** são definições (`Def`), e os valores ficam em `d.f[chave]`.
  - Os campos de cada visita usam a chave `v{n}_{campo}`.
  - Os tipos de campo são `escolha`, `sim_nao`, `contador`, `numero`, `texto`, `texto_longo` e `data`.
- **Obrigatório:**
  - Por defeito, tudo é obrigatório, menos o texto longo e os campos marcados `opcional`.
  - Quem decide em cada caso é `obrigatorio(c)`.
- **O portão de fase:**
  - Cada ação que muda de fase chama primeiro `portao(d, grupos, extras)`.
  - Se faltar algo, preenche `d.valida`, abre o negócio e o ecrã marca os campos em falta (`aria-invalid` e "Falta preencher").
- **Sugestões:**
  - `derivar()` preenche respostas a partir de outras. Por exemplo, a tipologia preenche a área, as divisões e as casas de banho.
  - As sugestões ficam marcadas em `d.sug` até alguém as confirmar ou mudar.
- **Campos à medida:**
  - Só se guardam os ajustes por grupo (`S.campos[titulo do grupo]`).
  - `efetivo(S.campos, grupo)` aplica-os, e usa-se nos passos, nos campos, no portão e nas fases feitas.
  - O `titulo` do grupo é a chave estável. O nome que a empresa vê é `nome`.
- **O IVA:**
  - As linhas de serviço são mão de obra, a 6%. As linhas de materiais levam 23%.
  - O desconto reparte-se pelas duas partes.

---

## O que é de exemplo e o que é real

- **Real:**
  - os nomes, ofícios, unidades e horas dos serviços do Catálogo (`catalogo.ts`);
  - os campos da ficha do local e do diagnóstico, que são os da app (`src/lib/campos/catalogo.ts`, no ramo `feat/campos-configuraveis`).
- **De exemplo:**
  - os preços;
  - o custo/hora do técnico (25 €/h);
  - as receitas (equipamentos e consumíveis);
  - os clientes;
  - os links do portal;
  - a empresa nos documentos (NIF 500 000 000).

---

## Backup

O estado do protótipo em **09/10/2026, commit `ec9c43c2`**, ficou guardado de três formas, todas locais neste PC:

1. **Etiqueta git** `backup/prototipo-negocios-2026-10-09`, no repositório local. Ainda não foi enviada para o GitHub.
   - Para ver o código como estava: `git checkout backup/prototipo-negocios-2026-10-09`.
   - Para ver as diferenças de agora: `git diff backup/prototipo-negocios-2026-10-09 -- src/pages/prototipo-negocios`.
   - Para recuperar só um ficheiro: `git checkout backup/prototipo-negocios-2026-10-09 -- src/pages/prototipo-negocios/motor.ts`.
2. **Bundle git** com o ramo inteiro e o histórico: `D:\Olyvia\backups\prototipo-negocios-2026-10-09\prototipo-negocios.bundle`.
   - Funciona sem o GitHub: `git clone -b feat/negocios-prototipo prototipo-negocios.bundle pasta-nova`.
   - Também se pode trazer para um repositório que já existe: `git fetch <caminho>/prototipo-negocios.bundle feat/negocios-prototipo:recuperado`.
3. **Cópia simples dos ficheiros** em `D:\Olyvia\backups\prototipo-negocios-2026-10-09\ficheiros\`.
   - Inclui a pasta `src/pages/prototipo-negocios`, o `public/prototipo/maquetas.html`, o `src/App.tsx` e o `vercel.json`.

O `README.md` dessa pasta explica cada forma.

---

## Notas para quem continua

- **Pessoas (V2): o botão Voltar do navegador sai do protótipo.** A ficha abre por estado, não por rota, e não se mexeu no histórico do navegador (`history.pushState`) por risco com o router. Para regressar à lista fecha-se o painel (Esc ou "Fechar").
- **Pessoas (V2): o que é de exemplo.** O negócio novo da Marta Lima, a saúde, as notas, os pagamentos, o prazo e as chamadas e emails são inventados; a lista tem um aviso único no fundo e as secções da ficha marcam "exemplo". Ao nível do campo marcam-se o email e o NIF inventados, o "quem vai" da visita por omissão e o tipo de cliente "Particular" por omissão. O bloco Origem e atribuição continua marcado por inteiro, porque mistura toques da seed com dados gerados.
- **Pessoas (V2): sem escolha automática.** A página abre só com a lista; a ficha só abre com um clique (ou ao voltar de um negócio, na mesma pessoa e no mesmo separador). `primeiraDaLista` e o painel "Escolhe uma pessoa" foram retirados.
- **Pessoas (V2): o que é de exemplo no negócio.** A probabilidade de fechar e o tipo de cliente por omissão são de exemplo; o valor estimado só existe quando já há orçamento. "O que falta para o orçamento" deriva da fase e dos grupos de campos do motor (não inventa passos), mas não conta os extras da visita que o motor também valida.
- **Pessoas (V2): sem memoização na lista.** O estado `S` muda no sítio, por isso um `useMemo` com `[S]` ficaria desatualizado. A lista recalcula por render (11 pessoas); o que se evitou foi recalcular o perfil dentro de `atividadeDe` (recebe o `Perfil` já calculado).
- **Pessoas (V2): contraste e leitura fácil.** Os controlos da página usam `BORDA_CTRL` (`hsl(220 10% 45%)`, cerca de 5:1 sobre branco e 4,6:1 sobre o fundo), porque o token global `--input` dá só 1,7:1 e não se mexeu. A classe `.pessoas-leitura` (em `prototipo.css`) reforça o espaçamento da leitura fácil só nesta página, sem alterar a regra global `.leitura`, O painel (`Sheet`) e o painel dos filtros abrem num portal fora de `.calma`, por isso levam as mesmas classes (`classePortal`). O cabeçalho da lista fica fixo com `sticky` dentro do `main`, sem altura fixa. Os avisos (toasts) passaram a z-index 650 para ficarem acima do painel (610) e abaixo dos menus (700).
- **O ramo está 2 commits atrás do `main`.** São mudanças do portal, de 09/10. Antes de levar o protótipo para o `main`, faça merge do `main` aqui.
- **O `vercel.json` abre duas coisas só para `/prototipo/*`:**
  - a localização do dispositivo (`geolocation=(self)`);
  - o Nominatim no `connect-src`.

  O resto da app continua com a localização bloqueada.
- **Os avisos do lint "Fast refresh only works…"** em `pecas.tsx` e `CamposFase.tsx` são esperados, porque esses ficheiros exportam funções. Não são erros.
- **O aspeto atual** já não recebe as novidades mais recentes. Por exemplo, os documentos e o editor de campos só existem no aspeto simples.
- **Ainda por fazer:**
  - os nomes das fases e as medidas configuráveis por setor;
  - modelos de documentos por setor;
  - ligar o protótipo à base de dados (tabelas de faturas, recibos, aprovações, receitas e campos por empresa).
