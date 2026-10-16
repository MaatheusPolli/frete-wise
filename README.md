# FreteWise

API de cotaÃ§Ã£o de frete multi-transportadora: consulta provedores **em paralelo**, aplica regras de negÃ³cio (peso cubado, taxas, prazo) e devolve as opÃ§Ãµes ordenadas por preÃ§o e prazo â€” **sem deixar um provedor lento derrubar o checkout**.

![Tela do simulador](docs/screenshot.png)

## Destaques

- **Resultado parcial**: `Promise.allSettled` + timeout individual. Provedor fora do ar vira item em `failures`, nunca um 500.
- **Circuit breaker prÃ³prio** por provedor (fechado â†’ aberto â†’ meio-aberto), visÃ­vel em `GET /provedores`.
- **Decorators** `withTimeout`, `withBreaker`, `withMetrics` aplicados pelo `ProviderRegistry` â€” impossÃ­vel registrar provedor desprotegido.
- **Dinheiro em centavos (inteiro)**, com arredondamento explÃ­cito e testado.
- **Regras de precificaÃ§Ã£o** como pipeline de funÃ§Ãµes puras (`rules.reduce`).
- Config por env validada com Zod no boot, logs pino com `correlationId`, mÃ©tricas Prometheus em `/metrics`.
- **PersistÃªncia em PostgreSQL**: envios e histÃ³rico de cotaÃ§Ãµes, com migrations versionadas. Sem Docker, usa Postgres embutido (PGlite) gravando em disco.

## Arquitetura

```
POST /cotacoes
   â”‚
   â–¼  Fastify (validaÃ§Ã£o Zod)
QuotationService
   â”œâ”€â”€ resolve UF dos CEPs (ViaCEP â†’ fallback por faixa de CEP)
   â”œâ”€â”€ cache (memÃ³ria ou Redis) por origem+destino+peso arredondado
   â”œâ”€â”€ Promise.allSettled sobre providers decorados:
   â”‚       metrics( breaker( timeout( provider ) ) )
   â”‚       â”œâ”€â”€ CorreiosProvider        (tabela simulada, fator 6000)
   â”‚       â”œâ”€â”€ CsvTableProvider        (tabela CSV, fator 300 kg/mÂ³)
   â”‚       â””â”€â”€ ExpressoHttpProvider    (API HTTP, opcional)
   â”œâ”€â”€ PricingRules: ad valorem â†’ taxa por regiÃ£o â†’ prazo por UF â†’ frete grÃ¡tis
   â””â”€â”€ ordena por preÃ§o/prazo, marca "mais barato" e "mais rÃ¡pido"
```

### Diagrama de sequÃªncia (provedor lento)

```mermaid
sequenceDiagram
    participant C as Checkout
    participant API as FreteWise
    participant Co as Correios
    participant T as Transportadora CSV
    participant E as Expresso (lento)
    C->>API: POST /cotacoes
    par em paralelo
        API->>Co: quote()
        Co-->>API: PAC, SEDEX
    and
        API->>T: quote()
        T-->>API: RodoviÃ¡rio
    and
        API->>E: quote() (timeout 3s)
        Note over API,E: abort apÃ³s 3s â†’ breaker conta falha
    end
    API-->>C: 200 { offers: [...], failures: [expresso: TIMEOUT] }
    Note over API,E: apÃ³s N falhas o breaker abre:<br/>prÃ³ximas cotaÃ§Ãµes nem chamam o Expresso (~1 ms)
```

## Provedores

| Id | Tipo | Fator de cubagem | ObservaÃ§Ãµes |
|----|------|------------------|-------------|
| `correios` | Tabela simulada em cÃ³digo | 6000 cmÂ³/kg | PAC e SEDEX, atÃ© 30 kg, acrÃ©scimo por distÃ¢ncia entre regiÃµes |
| `transportadora-sul` | Tabela CSV (`apps/api/data/transportadora-sul.csv`) | 300 kg/mÂ³ | Faixas de peso por UF origem â†’ regiÃ£o destino |
| `expresso` | API HTTP (`EXPRESSO_API_URL`) | 6000 cmÂ³/kg | Habilitado sÃ³ se a env existir; mapeia reais â†’ centavos |
| ViaCEP | API pÃºblica real | â€” | Resolve UF; se falhar, usa faixa de CEP estÃ¡tica |

## API

### `POST /cotacoes`

```json
{
  "origin": { "cep": "01310-100" },
  "destination": { "cep": "80010-000" },
  "items": [{ "weightGrams": 1200, "lengthCm": 30, "widthCm": 20, "heightCm": 10, "quantity": 1, "valueCents": 15000 }]
}
```

Resposta (valores em centavos):

```json
{
  "correlationId": "â€¦",
  "offers": [
    { "providerId": "transportadora-sul", "service": "RodoviÃ¡rio", "price": 2365, "deadlineDays": 3,
      "breakdown": { "base": 2290, "fees": [{ "name": "Ad valorem", "value": 75 }] } }
  ],
  "failures": [{ "providerId": "expresso", "code": "TIMEOUT", "reason": "Timeout apÃ³s 3000ms" }],
  "cheapest": { "providerId": "transportadora-sul", "service": "RodoviÃ¡rio" },
  "fastest": { "providerId": "transportadora-sul", "service": "RodoviÃ¡rio" },
  "cached": false
}
```

CÃ³digos de falha: `TIMEOUT`, `CIRCUIT_OPEN`, `UPSTREAM_ERROR`, `INVALID_RESPONSE`, `UNSUPPORTED_ROUTE`.

### ContrataÃ§Ã£o e etiqueta â€” `POST /envios`

Mesmo corpo da cotaÃ§Ã£o + `providerId`, `service`, `sender` e `recipient` (`name`, `street`, `number`, `complement?`, `city`).
O **preÃ§o nunca vem do cliente**: o servidor recota e usa a oferta vigente (422 `OFFER_UNAVAILABLE` se ela nÃ£o existir mais).
Responde `201` com o envio, o cÃ³digo de rastreio (formato `AA00000000DBR`, com dÃ­gito verificador) e os links:

- `GET /envios/:codigo` â€” dados do envio
- `GET /envios/:codigo/etiqueta` â€” etiqueta **ZPL** (impressora tÃ©rmica 10x15 cm) com cÃ³digo de barras, destinatÃ¡rio e remetente

### Rastreamento â€” `GET /rastreamento/:codigo`

Linha do tempo simulada e determinÃ­stica, derivada da data de contrataÃ§Ã£o e do prazo:
`POSTADO` â†’ `EM_TRANSITO` (25% do prazo) â†’ `SAIU_PARA_ENTREGA` (90%) â†’ `ENTREGUE` (100%). Eventos do mais recente para o mais antigo.
Use `TRACKING_DAY_MS` para acelerar a simulaÃ§Ã£o em demos (ex.: `60000` = 1 dia vira 1 minuto).

- `GET /envios?limit=20&offset=0` â€” envios contratados (mais recentes primeiro), paginado

### HistÃ³rico de cotaÃ§Ãµes

Toda cotaÃ§Ã£o (inclusive as servidas do cache e as recotaÃ§Ãµes feitas na contrataÃ§Ã£o) Ã© gravada no banco para auditoria e anÃ¡lise de preÃ§o/falhas por provedor. A gravaÃ§Ã£o Ã© *best-effort*: se o banco cair, a cotaÃ§Ã£o continua respondendo normalmente.

- `GET /cotacoes?limit=20&offset=0` â€” histÃ³rico paginado
- `GET /cotacoes/:correlationId` â€” uma cotaÃ§Ã£o especÃ­fica (ofertas, falhas, duraÃ§Ã£o, se veio do cache)

### Outras rotas
- `GET /provedores` â€” estado do breaker, latÃªncia mÃ©dia, chamadas e falhas.
- `GET /metrics` â€” formato Prometheus.
- `GET /health` â€” inclui o estado do banco; responde `503` se o banco estiver fora

Envie `x-correlation-id` para propagar seu id; ele volta no header e no corpo e aparece como `correlationId` em **todos** os logs da requisiÃ§Ã£o (Fastify, service e cada provedor).

## Banco de dados

| Ambiente | Banco | Como |
|----------|-------|------|
| ProduÃ§Ã£o / Docker | PostgreSQL 16 | `DATABASE_URL=postgres://â€¦` (o `docker compose` jÃ¡ configura, com volume `pgdata`) |
| Dev local sem Docker | PGlite (Postgres em WASM) | PadrÃ£o quando nÃ£o hÃ¡ `DATABASE_URL`; grava em `apps/api/data/pgdata` (ignorado pelo git) |
| Testes | PGlite em memÃ³ria + PostgreSQL real no CI | `PGLITE_DATA_DIR=memory`; `TEST_DATABASE_URL` ativa os testes contra Postgres |

O mesmo SQL roda nos dois. As migrations (`apps/api/src/infra/db/migrations.ts`) sÃ£o aplicadas automaticamente no boot, em transaÃ§Ã£o, e registradas em `schema_migrations`. Nunca edite uma migration jÃ¡ publicada â€” crie uma nova versÃ£o.

Tabelas:
- `shipments` â€” envios contratados (preÃ§o em centavos `BIGINT`, endereÃ§os/itens/breakdown em `JSONB`), cÃ³digo de rastreio como chave e sequÃªncia `shipment_seq` para gerar cÃ³digos sem colisÃ£o entre reinÃ­cios.
- `quotations` â€” histÃ³rico de cotaÃ§Ãµes por `correlation_id`.

## Regras de negÃ³cio (padrÃ£o)

| Regra | Valor |
|-------|-------|
| Ad valorem | 0,5% do valor declarado |
| Taxa por regiÃ£o | +15% Norte, +8% Nordeste |
| Prazo adicional | AM/RR/AP +3, AC/RO +2, PA +1 dias |
| Frete grÃ¡tis | pedidos â‰¥ `FREE_SHIPPING_THRESHOLD_CENTS` (R$ 500) nos serviÃ§os econÃ´micos |

## Desempenho

Script: `pnpm --filter @frete-wise/api load` â€” gerador **open-loop** (dispara a cada 10 ms sem esperar respostas) a **100 req/s por 15 s**, com o provedor `expresso` **travado** (nunca responde) e timeout de 3 s.

| MÃ©trica | Resultado |
|---------|-----------|
| RequisiÃ§Ãµes | 1500 (0 erros, 0 nÃ£o-2xx) |
| p50 | 1 ms |
| **p95** | **3003 ms** (requisito: < 3500 ms) |
| p99 | 3005 ms |

As requisiÃ§Ãµes dos primeiros ~3 s esperam o timeout; assim que o breaker abre, as seguintes respondem em ~1 ms sem consultar o provedor travado.

## Executando

```bash
pnpm install
cp .env.example .env         # opcional
pnpm dev:api                  # http://localhost:3000
pnpm dev:web                  # http://localhost:5173 (proxy /api â†’ :3000)
pnpm test                     # testes da API e do front
pnpm coverage                 # cobertura da API e do front (mÃ­nimo 85% cada)
cp .env.example .env && docker compose up   # API + PostgreSQL + Redis (defina POSTGRES_PASSWORD no .env)
```

## Testes

- **UnitÃ¡rios**: Money (sem erro de float), peso cubado (volume enorme, peso zero), regras, breaker com timers falsos, cache, decorators.
- **Contrato**: cada adapter valida resposta bruta â†’ `Offer` com fixture gravada.
- **Banco**: dados sobrevivem a reinÃ­cio (PGlite em disco), migrations idempotentes, rollback de transaÃ§Ã£o, banco fora do ar nÃ£o derruba a cotaÃ§Ã£o, e o fluxo completo contra **PostgreSQL real** no CI.
- **IntegraÃ§Ã£o**: contrataÃ§Ã£o com recotaÃ§Ã£o no servidor, etiqueta ZPL, rastreamento avanÃ§ando no tempo, 404/422/400, logs com `correlationId`.
- **IntegraÃ§Ã£o** (MSW): sucesso, lentidÃ£o acima do timeout, 500, resposta malformada, erro de rede, breaker abrindo, ViaCEP fora do ar, cache.
- Cobertura atual da API: ~99% de linhas.

### Front (`apps/web`)

Vitest + jsdom + Testing Library, com `fetch` mockado:

- **QuoteForm**: envio de CEPs e itens (conversÃ£o de reais para centavos), adicionar/remover itens, estado de carregamento.
- **OfferTable**: ordem das ofertas, badges "mais barato"/"mais rÃ¡pido", breakdown de taxas, "GrÃ¡tis", aviso de resultado parcial, cache e rota sem ofertas.
- **ProviderStatus**: estados do breaker (fechado/aberto/meio-aberto), API indisponÃ­vel, polling a cada 5 s e recarga ao cotar.
- **ContractForm / TrackingPanel**: dados de remetente e destinatÃ¡rio, link da etiqueta, linha do tempo, busca por cÃ³digo e erros.
- **App**: fluxo completo de cotaÃ§Ã£o â†’ contrataÃ§Ã£o â†’ rastreamento, erro de validaÃ§Ã£o vindo da API e falha de rede.
- **api.ts**: cliente HTTP e formataÃ§Ã£o em BRL.
- Cobertura atual do front: ~98% de linhas.

## Estrutura

```
apps/api/src
â”œâ”€â”€ domain/     money, package (peso cubado), quote, regions, errors
â”œâ”€â”€ providers/  correios, csv-table, expresso-http, decorators/, registry
â”œâ”€â”€ services/   quotation.service, pricing-rules, shipment.service, label (ZPL)
â”œâ”€â”€ infra/      breaker, cache, http, cep-resolver, logger, db/ (conexÃ£o + migrations), shipment-store, quotation-store
â””â”€â”€ routes/     cotacoes, envios, provedores, health
apps/web/src    App, components/QuoteForm, OfferTable, ContractForm, TrackingPanel, ShipmentHistory, ProviderStatus
```

## PrÃ©-requisitos

- Node.js 22+
- pnpm 10+ (`corepack enable`)
- Docker (opcional, para Redis)

## VariÃ¡veis de ambiente

Veja `.env.example`. Todas tÃªm valor padrÃ£o e sÃ£o validadas no boot â€” um valor invÃ¡lido derruba a aplicaÃ§Ã£o na inicializaÃ§Ã£o com mensagem clara.

| VariÃ¡vel | PadrÃ£o | DescriÃ§Ã£o |
|----------|--------|-----------|
| `PORT` | 3000 | Porta HTTP |
| `LOG_LEVEL` | info | NÃ­vel de log pino |
| `PROVIDER_TIMEOUT_MS` | 3000 | Timeout individual por provedor |
| `BREAKER_FAILURE_THRESHOLD` | 5 | Falhas consecutivas para abrir o breaker |
| `BREAKER_RESET_MS` | 30000 | Tempo aberto antes de ir para meio-aberto |
| `CACHE_TTL_MS` | 300000 | TTL do cache de cotaÃ§Ã£o (0 desliga) |
| `REDIS_URL` | â€” | Usa Redis como cache; sem ela, cache em memÃ³ria |
| `CEP_API_URL` | ViaCEP | API de CEP |
| `EXPRESSO_API_URL` | â€” | Habilita o provedor HTTP `expresso` |
| `FREE_SHIPPING_THRESHOLD_CENTS` | 50000 | Valor mÃ­nimo do pedido para frete grÃ¡tis |
| `TRACKING_DAY_MS` | 86400000 | DuraÃ§Ã£o simulada de 1 dia no rastreamento |
| `DATABASE_URL` | â€” | PostgreSQL; sem ela usa PGlite |
| `PGLITE_DATA_DIR` | `./data/pgdata` | Pasta do PGlite (`memory` = sem persistÃªncia) |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | â€” | Usadas pelo `docker compose`; defina a senha no seu `.env` |

Nunca versione `.env` â€” o `.gitignore` jÃ¡ bloqueia `.env*` (exceto `.env.example`), chaves e certificados.

## Como adicionar um provedor

1. Crie uma classe que implemente `ShippingProvider` (`id`, `cubicFactor`, `quote()`), em `apps/api/src/providers/`.
2. Registre-a em `defaultProviders()` (`apps/api/src/container.ts`).
3. Timeout, circuit breaker e mÃ©tricas sÃ£o aplicados automaticamente pelo `ProviderRegistry` â€” o service nÃ£o muda.
4. Adicione um teste de contrato com uma fixture da resposta bruta.

## LimitaÃ§Ãµes conhecidas
- ContrataÃ§Ã£o e rastreamento sÃ£o **simulados** (nÃ£o chamam APIs reais de transportadoras); os dados ficam salvos no banco.

## LicenÃ§a

DistribuÃ­do sob a licenÃ§a [MIT](LICENSE).


## Licença

### Uso Pessoal
Este projeto é licenciado sob a **Licença MIT** para uso pessoal, educacional e não comercial.

### Uso Comercial
Se você deseja usar este projeto comercialmente, deve obter uma licença comercial do autor.

**Uso comercial inclui:**
- Incorporar em um produto comercial
- Oferecer como serviço
- Usar em atividades com fins lucrativos
- Implantação empresarial

**Para obter uma licença comercial:**
Email: ma.polli@hotmail.com
