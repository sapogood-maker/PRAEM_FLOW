# PRAEM OPS — Central Operacional Logística do Transporte SUS

Plataforma SaaS multi-tenant para operação, despacho e monitoramento em tempo real do transporte SUS municipal.

## Visão do produto

O **PRAEM OPS** centraliza filas de pacientes, gestão de rotas, acompanhamento de viagens e telemetria da frota em um painel operacional estilo dispatch center.

## Stack

### Frontend
- Next.js 15 + React + TypeScript
- TailwindCSS + componentes UI reutilizáveis
- Zustand (estado global)
- TanStack Query (estado de servidor)
- Leaflet + OpenStreetMap
- Porta `8087`

### Backend
- NestJS + TypeScript
- PostgreSQL + Prisma ORM
- JWT Auth (access + refresh)
- WebSocket Gateway (Socket.io)
- BullMQ + Redis (base para filas/jobs)
- Porta `3010`

### Infra
- Docker Compose (dev e prod)
- Coolify-ready
- Multi-tenant (`tenantId` em entidades operacionais)

## Estrutura de pastas

```txt
PRAEM_FLOW/
├── apps/
│   ├── web/
│   └── api/
├── packages/
│   └── shared/
├── docker/
│   ├── Dockerfile.web
│   ├── Dockerfile.api
│   └── nginx.conf
├── docker-compose.yml
├── docker-compose.prod.yml
├── .env.example
└── README.md
```

## Como rodar localmente

### 1) Instalar dependências

```bash
npm install
```

### 2) Subir infraestrutura local

```bash
docker compose up -d postgres redis
```

### 3) Executar backend e frontend

Terminal 1:
```bash
npm run dev -w apps/api
```

Terminal 2:
```bash
npm run dev -w apps/web
```

Acessos:
- Frontend: `http://localhost:8087`
- Backend: `http://localhost:3010`

## Deploy no Coolify

1. Conectar o repositório no Coolify.
2. Selecionar `docker-compose.prod.yml` como compose de produção.
3. Definir variáveis de ambiente conforme `.env.example`.
4. Publicar portas `3010` (API) e `8087` (WEB).
5. Habilitar restart policy e healthchecks (já incluídos no compose).

## Variáveis de ambiente

Use o arquivo `.env.example` como base:

- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `JWT_EXPIRES_IN`
- `JWT_REFRESH_EXPIRES_IN`
- `PORT`
- `NODE_ENV`
- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_WS_URL`
- `TELEGRAM_BOT_TOKEN`
- `APP_NAME`

## Roadmap

### MVP
- Auth JWT
- Dashboard com KPIs
- Fila inteligente
- Gestão básica de rotas/viagens
- Mapa operacional em tempo real

### Piloto
- Regras de prioridade clínica
- Otimização de rota com IA (heurísticas)
- Comunicação multicanal (Telegram/WhatsApp/SMS)
- Auditoria operacional completa

### Expansão
- Multi-prefeituras com isolamento avançado
- Previsão de demanda e SLA
- Integração com sistemas municipais e regulação
- Observabilidade e automações avançadas de operação
