---
name: looping
description: Loop de execução até concluir. O agente recebe um objetivo e/ou uma lista de tarefas, registra tudo num backlog, executa, verifica com evidência e continua sozinho, criando e resolvendo as tarefas novas que encontrar (bugs e melhorias), até não sobrar nada pendente e uma varredura final não achar nada novo. Um hook de parada impede encerrar antes disso. Use quando o usuário disser "loop", "looping", "até acabar", "até não ter mais nada", "analisa até achar os bugs e corrige", "só para quando tudo estiver resolvido", ou passar uma ordem de trabalho em formato WHILE.
example-prompt: /looping analisa o painel inteiro até achar e corrigir os bugs --limite 15
---

# Looping

Você trabalha em loop até o objetivo estar cumprido de verdade. Um hook de parada lê o backlog: se você tentar
encerrar com item aberto, ou sem a varredura final limpa, ele manda você continuar.

```text
WHILE (itens abertos > 0  OU  a última varredura achou algo novo):
    pegar o próximo item → fazer → verificar com evidência → marcar feito
    varrer o escopo → registrar bugs e melhorias encontrados
FIM quando: backlog zerado E uma varredura sem novidades depois da última mudança
```

## REGRAS ABSOLUTAS (valem acima de tudo nesta skill)

1. **Não pare para perguntar.** Loop é para ir até acabar. Não encerre a resposta com pergunta, pedido de
   confirmação ou "quer que eu continue?". Diante de uma dúvida:
   - se dá para decidir com bom senso, decida, anote a decisão na evidência e siga;
   - se só o usuário pode decidir (dado que você não tem, credencial, escolha de negócio, ação da seção 5),
     registre `<s> add "[pergunta] <a dúvida>" --origem agente --tipo tarefa`, marque `fail` 3 vezes com o
     motivo "precisa do usuário" para ele virar **travado**, e **siga com os outros itens**. Todas as
     perguntas vão juntas no relatório final.
2. **Só o usuário encerra o loop.** Você nunca roda `stop` por conta própria; o script recusa sem
   `--pedido-do-usuario`, e você só passa essa flag quando o usuário mandou parar nesta conversa.
3. **O cartão do chat é sempre o do `card.mjs`.** Nunca escreva HTML de cartão, nunca resuma o backlog num
   cartão seu, nunca chame algo de "instantâneo". Um cartão que não sai do `card.mjs` está errado. Se o
   `card.mjs` falhar, diga o erro em texto, sem cartão substituto.
4. **Mostre o cartão ao vivo logo depois do `init`,** antes de começar o primeiro item (seção "No OpenBot").

`<s>` = `node <pasta desta skill>/scripts/loop.mjs`. Rode sempre na raiz do projeto: o estado fica em
`.loop/backlog.json` (adicione `.loop/` ao `.gitignore`).

## 1. Iniciar

1. Leia o pedido e extraia: **objetivo**, **escopo** (quais telas, pastas, fluxos), **critério de pronto** e o
   **limite** de tarefas que você pode criar sozinho. O padrão é 20; o usuário muda com `--limite N` ou dizendo
   "limite de N".
2. `<s> init "<objetivo em uma frase, com o escopo>" --limite N`
3. Registre cada tarefa que o usuário passou: `<s> add "<tarefa>" --origem usuario --tipo tarefa`.
   Elas não contam no limite.
4. Se o pedido for de análise ("analisa até achar bugs"), faça antes uma primeira varredura (seção 4) e
   registre o que achar.
5. Diga ao usuário em 3 linhas: objetivo, quantos itens começaram e o limite.

## 2. Ciclo de cada item

1. `<s> next` → `<s> start <id>`.
2. Faça a mudança mínima que resolve o item, dentro do escopo.
3. **Verifique de verdade:** rode o teste, o build, o typecheck, abra a tela, tire o print, chame a API. "Acho
   que funciona" não é verificação.
4. Passou: `<s> done <id> "<evidência>"`, por exemplo "vitest 541/541; print da tela em 390px sem overflow".
   Não passou: `<s> fail <id> "<motivo>"`. Na 3ª falha o item vira **travado** e sai da frente.
5. A correção quebrou algo que já estava feito? `<s> reopen <id-quebrado> --por <id-que-quebrou>`. Se dois
   itens se quebrarem mutuamente duas vezes, viram **conflito** e vão para o usuário.

Ordem automática: o que está em andamento → bugs → tarefas → melhorias; dentro de cada tipo, impacto alto
primeiro.

## 3. Registrar descobertas

Achou um bug ou uma melhoria enquanto trabalhava? Registre na hora e continue o item atual:

`<s> add "<título concreto>" --tipo bug|melhoria --impacto alto|medio|baixo`

- **Bug:** algo que não funciona como deveria, com passo para reproduzir.
- **Melhoria:** concreta e verificável ("contraste do botão 3.1 → 4.5", "formulário sem mensagem de erro").
  "Deixar mais moderno" não é melhoria registrável: transforme em algo específico antes de registrar.
- Fora do escopo do objetivo: não registre; cite no relatório final.
- Ao chegar no limite, o script recusa itens novos seus e os guarda como **sugestões** para o relatório.

## 4. Varredura

Quando o backlog zerar, varra de novo **todo o escopo**, não só o que você mexeu:

- código: build, typecheck, lint, testes;
- interface: cada tela do escopo em desktop e celular, console sem erro, estados vazio, carregando e erro;
- fluxos: o caminho principal de ponta a ponta;
- se o pedido for de design, use o Atelier (`inspect.mjs`) como critério.

Registre o que achar e então: `<s> sweep "<o que foi varrido>" --novos N`.
Com `N > 0`, o loop continua. O fim só chega com uma varredura `--novos 0` depois da última mudança.

## 5. Regras que valem mesmo com "autorizo tudo"

Num loop autônomo, um erro se repete sozinho. Por isso, **prepare e deixe para o usuário aprovar no fim**:
merge ou push na `main`, deploy em produção, apagar dados ou arquivos que você não criou, `--force` e reescrita
de histórico, migração de banco em produção, qualquer coisa que envolva dinheiro, mensagens ou e-mails para
pessoas reais, e mudança de credenciais. Registre como item `--tipo tarefa` com o título começando por
"[aprovação]" e marque `fail` com o motivo "precisa de aprovação". Ele fica travado e aparece no relatório.

Em repositório: trabalhe numa branch e faça commits por item ou por grupo de itens. Siga o fluxo de Git do
projeto.

## 6. Freios automáticos

| Situação | O que acontece |
|---|---|
| Item falhou 3 vezes | vira **travado**, você segue para o próximo |
| Dois itens se quebram mutuamente | viram **conflito**, os dois vão para o usuário |
| Limite de tarefas criadas por você | descobertas novas viram sugestões; o loop termina quando o backlog zerar |
| 5 tentativas de parar sem nenhum avanço | o hook libera e marca o loop como **estagnado** |
| A cada 3 itens concluídos | o script imprime um status; siga trabalhando (o cartão ao vivo já mostra) |

Itens travados e em conflito não impedem o fim do loop.

## 7. Encerrar

Quando o hook liberar (ou o usuário mandar parar, com `<s> stop "<motivo>" --pedido-do-usuario`), rode `<s> report` e entregue:

- o resultado em 1 linha e o motivo do fim;
- **feitos**, cada um com a evidência;
- **precisa de você:** travados, conflitos e itens "[aprovação]";
- **sugestões** além do limite e o que ficou fora do escopo.

Nunca diga que verificou algo que não rodou.

## No OpenBot: cartão ao vivo (obrigatório)

No OpenBot, o usuário acompanha o loop por um cartão no chat que **se atualiza sozinho** a cada 2 s
(lê um servidor local em 127.0.0.1 que o `init` sobe). Mostre-o **uma vez, logo depois do `init` e de
registrar as tarefas do usuário, antes de começar a trabalhar**. O `init` imprime `>>> MOSTRE O CARTÃO
AO VIVO AGORA` com o comando exato.

1. Na pasta do loop: `node <pasta desta skill>/scripts/card.mjs` imprime a página. **Use essa saída exatamente como vem.** Não escreva seu próprio HTML nem copie os itens para um cartão seu: um cartão feito à mão é uma foto e nunca se atualiza.
2. Passe a saída inteira para `openbot.html_render` com o título "Looping" (ferramenta do OpenBot:
   `openbot.tool_describe` com `["openbot.html_render"]` uma vez, depois `openbot.tool_call`).
3. Não mostre de novo a cada item: o mesmo cartão vai mudando. Mostre outro só se o usuário pedir ou se
   ele disser que o cartão parou ("sem conexão").
4. Não descreva o cartão no texto.
