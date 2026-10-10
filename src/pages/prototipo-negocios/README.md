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
| `NegociosSimples.tsx` | A lista de Negócios, com uma coluna por fase. Tem o seletor **Atual \| V2** no cabeçalho (estado local, por defeito "Atual"). |
| `NegociosV2.tsx` | A **V2 da lista de Negócios** (10/10/2026): só negócios, por fase de documento: Orçamento, Proposta, Contrato, e depois Financeiro (quatro colunas). A Obra vê-se em Operações. Lead, Contacto e Visita saem, porque são fases da pessoa. Uma pessoa pode ter vários negócios, e vários orçamentos podem juntar-se numa proposta conjunta. |
| `negociosDocs.ts` | A lógica da V2, sem React: `docFase` (a fase de documento a partir de `Orcamento.enviada`, `aceite` e `contrato`), os cartões (`cartoesV2`) e os **dados de exemplo** da V2 (marcados `demo`, só nesta camada: um segundo orçamento da Carla Nunes e uma proposta conjunta do Sérgio Pinto). Não muda o `Estado`, o `seed()` nem a `VERSAO`. O ficheiro não se chama `negociosV2.ts` porque, no Windows, colide com `NegociosV2.tsx`. |
| `LeadsSimples.tsx` | A página de **Leads** (menu "Leads", antes de Clientes; o aspeto atual não a tem): lista curta por urgência (pesquisa, quatro chips e "Só as minhas", um só botão "Nova lead" que abre o formulário de novo negócio em Negócios) e, ao escolher uma lead, a ficha na mesma página, sem diálogo. A ficha tem contactos (Ligar, WhatsApp, Email), um botão com o próximo passo e quatro separadores: **Negócios** (os cartões da V2, com os de exemplo), **Informação** (com "Marcar como perdida"), **Submissões** e **Histórico**. |
| `leadsDocs.ts` | A lógica dos Leads, sem React e sem mudar o `Estado`: quem é lead (pessoa, agrupada por nome, sem negócio em Financeiro ou Obra nem contrato assinado, e sem perdidos), a ordem por urgência, os filtros, o "há quanto tempo" (com um "hoje" fixo, 10/10/2026) e as **submissões de formulário de exemplo** (uma por lead, e uma segunda "Associada à ficha" quando a pessoa tem mais de um negócio, como a Carla Nunes). Estas submissões não existem no `Estado`: são calculadas a partir de `linha`, `origem`, `f` e `quando`, e aparecem marcadas "exemplo". Testes em `leadsDocs.test.ts`. |
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
