# Looping

**Loop de execução até concluir, para o Claude Code.** O agente recebe um objetivo e/ou uma lista de
tarefas, registra tudo num backlog, executa, verifica com evidência e continua sozinho, criando e
resolvendo os bugs e melhorias que encontrar, até não sobrar nada pendente e uma varredura final não
achar nada novo. Um hook de parada impede o agente de encerrar antes disso.

```text
WHILE (itens abertos > 0  OU  a última varredura achou algo novo):
    pegar o próximo item → fazer → verificar com evidência → marcar feito
    varrer o escopo → registrar bugs e melhorias encontrados
FIM quando: backlog zerado E uma varredura sem novidades depois da última mudança
```

## Uso

```text
/looping analisa o painel inteiro até achar e corrigir os bugs --limite 15
```

- **Limite:** máximo de tarefas que o próprio agente pode criar (padrão 20). As suas não contam.
- **Pronto exige prova:** nenhum item fecha sem evidência (teste, build, print).
- **Ordem:** em andamento → bugs → tarefas → melhorias.

## Freios

| Situação | O que acontece |
|---|---|
| Item falhou 3 vezes | vira **travado** e sai da frente |
| Dois itens se quebram mutuamente | viram **conflito** e vão para você |
| Limite de descobertas atingido | o resto vira sugestão no relatório |
| 5 tentativas de parar sem avanço | o loop encerra como **estagnado** |

Mesmo com "autorizo tudo", `main`, deploy, apagar dados, `--force`, banco em produção, dinheiro e
mensagens para pessoas reais ficam preparados para você aprovar no fim.

## Instalação

```text
/plugin marketplace add unmartim/looping
/plugin install looping@looping
/plugin install looping-painel@looping
```

- `looping`: a skill e o hook de parada.
- `looping-painel`: painel ao lado do chat com o backlog ao vivo (mod do Claude Code).

Requer Node 18+. O estado fica em `.loop/backlog.json` na pasta do projeto; o hook só age em sessões com
loop ativo e ignora loops de outras sessões.

## Licença

[MIT](LICENSE)
