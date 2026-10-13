# Reunião de administração, 06/10/2026: ponto de situação da Olyvia

Pacote preparado a 03/10/2026 para a reunião de administração de terça-feira, 06/10/2026, na véspera da apresentação e demo de 07/10.

Pedido do dono da empresa: um resumo do que está feito na Olyvia, do que vamos fazer e das datas previstas de conclusão. A apresentação usa a marca do grupo BMLAR e mostra o potencial da plataforma para o grupo.

## Ficheiros

| Ficheiro | O que é |
|---|---|
| `Olyvia - ponto de situacao - administracao 06-10-2026.pptx` | A apresentação: 26 diapositivos com notas do orador |
| `Olyvia - ponto de situacao - administracao 06-10-2026.pdf` | A mesma apresentação, exportada pelo PowerPoint |
| `resumo-para-o-agente.md` | O conteúdo por secções, com uma mensagem-chave por diapositivo, para o agente de direção de funções de suporte trabalhar a apresentação |
| `levantamento-do-projeto.md` | O levantamento factual por trás da apresentação: números, o que está feito por área (com os commits), ramos por integrar e documentos de planeamento |
| `o-que-falta-reuniao-2026-10-02.md` | O que a reunião de Operações de 02/10 pediu, cruzado com o que já está no `main` |
| `perguntas-em-aberto.md` | Perguntas para levar à equipa (ex.: ao Ricardo) |
| `gerador/` | O script que gera a apresentação, os logótipos e a marca original |

## Estrutura da apresentação

1. **Abertura**: capa e agenda.
2. **01 Porquê a Olyvia**:
   - de ferramentas soltas (Word, Excel, Infraspeak, papel) a um só sistema;
   - a visão do grupo: captar → vender → transformar (Mudelar) → manter (BMG);
   - os números do projeto.
3. **02 O que já funciona**, com ecrãs ilustrativos:
   - o percurso do cliente em sete passos;
   - captação (Kanban de leads);
   - visitas (SMS no telemóvel);
   - do orçamento ao contrato;
   - levantamento na visita (ficha do local);
   - planeamento automático (Gantt);
   - no terreno (telemóvel do técnico);
   - a base da plataforma.
4. **03 O potencial**:
   - dados próprios: cada obra torna a próxima mais certa;
   - a manutenção da BMG na mesma plataforma;
   - a Olyvia como produto para outras empresas.
5. **04 Onde estamos**: cinco frentes em curso, três horizontes do que falta, calendário.
6. **05 Decisões**: as seis decisões pedidas à administração.
7. **Fecho**.

## Regras seguidas no conteúdo

- **Nenhuma data inventada.** As únicas datas fixadas são:
  - 03/10: planeamento automático em produção;
  - 05–06/10: testes;
  - 06/10: administração;
  - 07/10: demo.

  O resto aparece como "a definir", e a apresentação pede à administração que fixe as datas por frente.
- **Ecrãs ilustrativos.** Foram desenhados no próprio diapositivo e estão marcados como tal; não têm dados reais de clientes.
- **Potencial assinalado como potencial.** A BMG ainda não usa a plataforma, e a venda a outras empresas é uma decisão estratégica, não trabalho em curso.
- **Responsáveis por confirmar.** Onde o levantamento não identificou quem fez o trabalho (faturação), a apresentação diz "A confirmar".
- **Fontes:**
  - o histórico do repositório (`origin/main` e ramos por integrar, a 03/10);
  - a documentação do projeto;
  - a reunião de Operações de 02/10/2026.

## Marca

A marca vem de https://bmlar.pt. O grupo BMLAR junta a BMG Services (facility management) e a Mudelar (remodelação de interiores).

| Elemento | Valor |
|---|---|
| Fundo | preto, com o padrão de azulejo do site |
| Texto claro | osso `#F5F0E8` |
| Destaque principal | verde Mudelar `#81CEBA` / `#67A392` |
| BMG | azul `#4462FF` |
| Alertas e decisões | coral `#E84F70` |
| Olyvia | roxo `#763CE9`; o logótipo vai num cartão branco sobre fundo escuro |
| Letra no site | Jost (títulos) e Mulish (texto) |
| Letra na apresentação | Century Gothic e Calibri |

A letra muda porque o Century Gothic e o Calibri vêm com o Office e não falham noutro computador.

Os logótipos originais estão em `gerador/marca-original/` e as versões preparadas para os diapositivos em `gerador/assets/`.

## Voltar a gerar a apresentação

Precisa de Node 18 ou mais recente.

```bash
cd docs/administracao-2026-10-06/gerador
npm install
node build.js apresentacao.pptx
```

O texto da apresentação está em `build.js`, organizado por diapositivo. Para mudar conteúdo, edita-se aí e gera-se de novo.

Para gravar as cores e as letras no tema do PowerPoint, aponta-se a variável `APPLY_THEME` para o `apply_theme.js` da skill de apresentações do Claude:

```bash
APPLY_THEME=/caminho/para/pptx/scripts/apply_theme.js node build.js apresentacao.pptx
```

Sem esta variável, a apresentação sai igual à vista. Só o tema interno do Office mantém as cores de origem.

Para exportar o PDF no Windows, abre-se o `.pptx` no PowerPoint e grava-se como PDF. Também se pode correr no PowerShell:

```powershell
$pp = New-Object -ComObject PowerPoint.Application
$p = $pp.Presentations.Open("$PWD\apresentacao.pptx", $true, $false, $false)
$p.SaveAs("$PWD\apresentacao.pdf", 32); $p.Close(); $pp.Quit()
```

**Cuidado no gerador:** uma linha ou seta com largura ou altura negativas corrompe o ficheiro para o PowerPoint, mesmo que a validação passe. O helper `arrow` converte esses casos em `flipH`/`flipV`, por isso usa-se sempre esse helper.

## A seguir

- O agente de direção de funções de suporte pode trabalhar a partir de `resumo-para-o-agente.md`.
- Para trocar as ilustrações por capturas reais da plataforma, é preciso uma sessão iniciada na Olyvia e escolher ecrãs sem dados pessoais de clientes.
- Depois da reunião, registar aqui as decisões tomadas e as datas fixadas.
