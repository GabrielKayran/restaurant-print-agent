# Restaurant Print Agent

Agente standalone que roda no PC do restaurante, conecta ao backend via Socket.IO, recebe notificacoes de novos pedidos e envia automaticamente para as impressoras termicas.

## Como instalar

### 1. Baixe o executavel

Baixe o `print-agent.exe` da aba de releases e coloque em uma pasta.

### 2. Execute

Duplo-clique no `print-agent.exe`. Na primeira execucao, o agente vai pedir a **API Key**:

```
============================================
   Print Agent — Primeira execucao
============================================

Cole a chave do agente (API Key) gerada no
painel: Configuracoes > Impressoras > Chave

API Key: pk_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

A chave e salva automaticamente — voce so precisa colar uma vez.

Em seguida, o agente pergunta se deseja iniciar automaticamente ao ligar o PC:

```
Deseja que o agente inicie automaticamente ao ligar o PC? (S/n): S
Atalho criado! O agente vai iniciar automaticamente.
```

### 3. Pronto

O agente vai:
1. Detectar todas as impressoras instaladas no PC
2. Registra-las no sistema
3. Ficar ouvindo novos pedidos em tempo real
4. Imprimir automaticamente nos tickets corretos

### Onde gerar a API Key?

No painel web: **Configuracoes > Impressoras > Chave do Agente > Gerar Nova Chave**

## Como funciona

1. Na primeira execucao, pede a API Key (gerada no painel)
2. Descobre impressoras instaladas no Windows
3. Registra no backend via `POST /agent/printers/register`
4. Conecta via Socket.IO (namespace `/printing`)
5. Quando um pedido e criado, o backend emite `print.job.created`
6. O agente busca o payload, gera comandos ESC/POS e envia para a impressora
7. Se a conexao cair, faz polling HTTP apos 30s como fallback
8. Ao reconectar, busca pedidos pendentes acumulados

## Resiliencia

- **Socket + Polling mutuamente exclusivos**: so um roda por vez
- **Trava local por job**: previne processamento duplicado via `Set<jobId>`
- **Retry automatico**: 3 tentativas com 5s de delay para falhas de impressora
- **Auto-reconnect**: Socket.IO reconecta com backoff exponencial
- **Crash-safe**: todos os erros sao capturados e logados; o agente nunca fecha

## Desenvolvimento

### Rodar em modo dev

```bash
npm install
AGENT_API_URL=http://localhost:3000 npm run dev
```

### Rodar testes

```bash
npm test
```

### Build do executavel

```bash
npm run build
npm run package
```

O `.exe` sera gerado na pasta `build/`.

### Remover inicio automatico

Se o agente foi configurado para iniciar automaticamente e voce quer desativar:

```bash
print-agent.exe --uninstall
```

## Variaveis de ambiente

| Variavel | Descricao | Default |
|---|---|---|
| `AGENT_API_URL` | URL da API (dev only, em producao e hardcoded no build) | `https://api.meuchef.com.br` |
