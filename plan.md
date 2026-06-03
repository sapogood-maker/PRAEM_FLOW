# WhatsApp Operational Communication Module - Implementation Plan

## Overview
Implement a lightweight, flexible WhatsApp communication system for PRAEM OPS using Evolution API, with dynamic template management, async queue-based sending, and operational event triggers.

**Key Principles:**
- Provider-agnostic (adapter-based for future migration to Meta/Zenvia/Twilio)
- No hardcoded messages (all editable via admin interface)
- Operational safeguards (dedup, rate limiting, spam protection)
- Full audit trail and delivery tracking
- PT-BR only
- Low cost, fast deployment

## Architecture

### 1. Database Schema (Prisma)
Add models to `apps/api/src/prisma/schema.prisma`:

**WhatsappTemplate:**
- id: String @id @default(uuid())
- tenantId: String
- code: String (unique per tenant: AGENDAMENTO_CONFIRMADO, MOTORISTA_A_CAMINHO, etc.)
- title: String (display name)
- category: String (BOOKING, DISPATCH, BOARDING, ARRIVAL, REMINDER, RECOVERY)
- message: String (PT-BR with {{variable}} placeholders)
- variables: Json (list of expected vars: ["patient_name", "driver_name", "date", "time", "hospital", "eta", "tracking_link"])
- active: Boolean @default(true)
- createdAt/updatedAt: DateTime
- tenant: Tenant relation
- messageLogs: WhatsappMessageLog[]

**WhatsappMessageLog:**
- id: String @id @default(uuid())
- tenantId: String
- patientId: String?
- tripId: String?
- routeId: String?
- templateId: String?
- phone: String (E.164 format, deduped)
- message: String (rendered final message)
- status: enum (PENDING, SENT, DELIVERED, FAILED, DUPLICATE)
- providerMessageId: String? (Evolution API response ID)
- deliveredAt: DateTime?
- failedReason: String?
- retryCount: Int @default(0)
- maxRetries: Int @default(3)
- createdAt/queuedAt/sentAt: DateTime
- tenant: Tenant relation
- patient: Patient? relation
- trip: Trip? relation
- route: Route? relation
- template: WhatsappTemplate? relation

### 2. API Module Structure
Path: `apps/api/src/modules/whatsapp/`

**Files:**
- `whatsapp.module.ts` — NestJS module with imports/providers/exports
- `whatsapp.service.ts` — Main WhatsApp service (orchestrator)
- `whatsapp.controller.ts` — HTTP endpoints (send test, queue status)
- `whatsapp-template.service.ts` — Template CRUD, validation
- `whatsapp-queue.service.ts` — Async queue management with Bull/Redis
- `evolution.adapter.ts` — Evolution API client (curl-based or HTTP)
- `whatsapp.types.ts` — Interfaces and enums

**Key Services:**

`WhatsappService`:
- `sendMessageFromTemplate(tenantId, patientId, templateCode, variables)` → queues message
- `sendDirectMessage(tenantId, phone, message)` → direct send (internal use)
- `processQueue()` → workers pull from queue, send, handle retries
- `checkDeliveryStatus(messageLogId)` → poll Evolution for delivery updates

`WhatsappTemplateService`:
- `getTemplate(tenantId, code)` → validate, render variables
- `renderMessage(template, variables)` → replace {{var}} placeholders
- `validateVariables(template, variables)` → ensure all required vars provided

`WhatsappQueueService`:
- Uses Redis/Bull for persistent async queue
- Retry logic (exponential backoff, max 3 retries)
- Deduplication by phone+templateCode+date window (2-hour window)
- Rate limiting (max 100 msgs/min per tenant)

`EvolutionAdapter`:
- POST /api/messages/send (Evolution API endpoint)
- Provider-agnostic: interface that can swap for Meta/Zenvia/etc.
- Error handling + retry with exponential backoff
- Delivery receipt webhook handler

### 3. Environment Variables
Add to `.env`:
```
EVOLUTION_API_URL=https://api.evolution.io/api
EVOLUTION_API_KEY=your-key-here
EVOLUTION_INSTANCE=your-instance-id
WHATSAPP_ENABLED=true
WHATSAPP_RATE_LIMIT=100
WHATSAPP_MAX_RETRIES=3
```

### 4. Web Admin Interface
Path: `apps/web/src/app/(dashboard)/admin/whatsapp/`

**Pages:**
- `page.tsx` — Template list/grid view
- `templates/page.tsx` — Create/edit template forms
- `templates/[id]/page.tsx` — Detail/edit view
- `logs/page.tsx` — Message delivery audit log
- `queue/page.tsx` — Queue status, manual retry

**Features:**
- Template CRUD (create, edit, deactivate)
- Preview with sample variables
- Test send to test phone number
- Category/status filtering
- Audit log with delivery status
- Manual retry for failed messages

### 5. Operational Event Triggers
Integrate into existing operational flows:

**routes.service.ts — Route Dispatched:**
```
onRouteDispatched(route) {
  → getPassengers → sendTemplate('AGENDAMENTO_CONFIRMADO')
}
```

**routes.service.ts — Driver Accepted:**
```
onDriverAccepted(route, driver) {
  → sendTemplate('MOTORISTA_A_CAMINHO', {driver_name, date, time})
}
```

**trips.service.ts — Boarding:**
```
onBoarding(trip) {
  → sendTemplate('EMBARQUE_REALIZADO')
}
```

**trips.service.ts — Arrival:**
```
onArrival(trip) {
  → sendTemplate('CHEGADA_PREVISTA', {eta, hospital})
}
```

**trips.service.ts — No-Show:**
```
onNoShow(trip) {
  → sendTemplate('NO_SHOW')
}
```

**trips.service.ts — Completion:**
```
onCompletion(trip) {
  → sendTemplate('FINALIZACAO')
}
```

**routes.service.ts — Stale Recovery:**
```
onStaleRecoveryTriggered(route) {
  → sendTemplate('RECOVERY_AVAILABLE', {recovery_actions_url})
}
```

### 6. Initial Template Defaults
Seed into database on first deploy:

```
AGENDAMENTO_CONFIRMADO
"Seu transporte PRAEM foi agendado para {{date}} às {{time}}. Confirme sua presença."

MOTORISTA_A_CAMINHO
"O motorista {{driver_name}} está a caminho."

EMBARQUE_REALIZADO
"Seu embarque foi confirmado."

CHEGADA_PREVISTA
"Previsão de chegada: {{eta}}"

LEMBRETE_CONSULTA
"Lembrete do seu atendimento em {{hospital}}"

NO_SHOW
"Identificamos ausência no embarque."

FINALIZACAO
"Viagem finalizada. Obrigado."

TRACKING_LINK
"Acompanhe seu transporte em tempo real: {{tracking_link}}"

RECOVERY_AVAILABLE
"Operação anterior detectada. {{recovery_actions_url}}"
```

### 7. Diagnostics & Safeguards

**Diagnostics Tags:**
```
[WHATSAPP] Message send/queue operation
[EVOLUTION] Evolution API calls, responses, errors
[MESSAGE] Template rendering, variable replacement
[TEMPLATE] Template CRUD, validation, defaults
[QUEUE] Queue operations, retries, dedup
```

**Safeguards:**
- **Deduplication:** Track phone+templateCode+createdAt window (2h default)
- **Rate limiting:** Max 100 msgs/min per tenant (configurable)
- **Retry limits:** Max 3 retries with exponential backoff (5s, 30s, 2min)
- **Phone validation:** E.164 format, allow only +55 (Brazil) + 2 digits area + 8-9 digit number
- **Spam protection:** Skip if patient opted out (future: implement opt-out tracking)
- **Queue persistence:** Redis-backed with message durability

## Implementation Steps

### Phase 1: Foundation (Database + Core Services)
- [ ] Add Prisma models (WhatsappTemplate, WhatsappMessageLog)
- [ ] Generate Prisma client
- [ ] Create whatsapp module structure
- [ ] Implement WhatsappTemplateService (CRUD, validation)
- [ ] Implement EvolutionAdapter (HTTP client, error handling)
- [ ] Add env vars to .env.example and seed

### Phase 2: Queue & Sending
- [ ] Implement WhatsappQueueService (Bull/Redis queue)
- [ ] Implement WhatsappService (orchestrator, send, retry)
- [ ] Add deduplication logic
- [ ] Add rate limiting
- [ ] Implement delivery tracking

### Phase 3: API Endpoints
- [ ] Create whatsapp.controller.ts
- [ ] POST /whatsapp/send (test send endpoint)
- [ ] GET /whatsapp/queue (queue status)
- [ ] GET /whatsapp/logs (audit log)
- [ ] POST /whatsapp/retry/:logId (manual retry)

### Phase 4: Web Admin UI
- [ ] Create template management pages
- [ ] Implement template CRUD forms
- [ ] Add preview functionality
- [ ] Build audit log viewer
- [ ] Add test send feature

### Phase 5: Event Integration
- [ ] Hook into routes.service dispatched event
- [ ] Hook into driver accepted event
- [ ] Hook into boarding event
- [ ] Hook into arrival event
- [ ] Hook into no-show event
- [ ] Hook into stale recovery event

### Phase 6: Diagnostics & Testing
- [ ] Add [WHATSAPP] [EVOLUTION] [MESSAGE] [TEMPLATE] [QUEUE] logs
- [ ] Validate multi-passenger routes
- [ ] Validate offline recovery
- [ ] Validate stale route recovery
- [ ] Validate retry queue behavior
- [ ] Test delivery audit trail

## Timeline Estimate
- Phase 1 (Foundation): 2-3 hours
- Phase 2 (Queue): 2 hours
- Phase 3 (API): 1 hour
- Phase 4 (Web UI): 2-3 hours
- Phase 5 (Integration): 1-2 hours
- Phase 6 (Testing): 1 hour
**Total: 9-12 hours**

## Success Criteria
✓ Database models created and migrations applied
✓ Evolution adapter tested with sandbox credentials
✓ WhatsappService handles send + retry + dedup
✓ Web admin can create/edit/preview templates
✓ Operational events trigger WhatsApp sends
✓ Audit log tracks all sends/failures
✓ Rate limiting + safeguards working
✓ All communication in PT-BR
✓ Diagnostics show [WHATSAPP] traces in logs
✓ Validation tests pass (multi-passenger, recovery, retry)
✓ Code committed and pushed to branch

