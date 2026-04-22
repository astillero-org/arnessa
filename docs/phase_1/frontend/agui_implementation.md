# Implementación extensible de AG-UI en React desde cero

## Resumen ejecutivo

AG-UI es un protocolo abierto, ligero y basado en eventos que estandariza la conexión bidireccional entre *frontends* orientados a usuario y *backends* agentic, normalizando cómo fluyen el estado del agente, las intenciones de UI y las interacciones del usuario mediante un *stream* de eventos. [\[1\]](https://docs.ag-ui.com/introduction) En la práctica, esta naturaleza “event-sourced” permite construir una UI de chat robusta (con streaming, estado compartido y herramientas) sobre una capa de conectividad genérica como HttpAgent, que envía un RunAgentInput vía POST y recibe un *stream* de BaseEvent (p. ej. por SSE). [\[2\]](https://docs.ag-ui.com/concepts/architecture)

Este informe propone una arquitectura React “desde cero” (UI propia) pero **alineada con el SDK TypeScript de AG-UI** (paquetes @ag-ui/core y @ag-ui/client) para maximizar compatibilidad con el protocolo y reducir lógica ad-hoc. [\[3\]](https://docs.ag-ui.com/sdk/js/core/overview?utm_source=chatgpt.com) La solución se diseña como un **núcleo reutilizable** (controlador \+ *store* \+ registros de renderizado) que se consume tanto como **cliente completo** (aplicación standalone) como en **modo SDK inyectable** (widget/paquete React). La extensibilidad se centra en dos ejes:

* **Whitelabeling**: tematización por tokens (CSS variables), *overrides* de componentes y configuración de marca sin bifurcar el código.

* **Eventos personalizados en la misma UI de chat**: soporte nativo a CustomEvent (type: CUSTOM, name, value) como mecanismo de extensión del protocolo [\[4\]](https://docs.ag-ui.com/sdk/js/core/events) y, para UI “durable”/streamable, uso de ActivityMessage emitidos por ACTIVITY\_SNAPSHOT/ACTIVITY\_DELTA (frontend-only) con selección de renderizador por activityType. [\[5\]](https://docs.ag-ui.com/concepts/messages)

## Requisitos y supuestos

**Requisitos funcionales (derivados del enunciado y del protocolo):**

* Conectar un frontend React con un backend compatible con AG-UI usando un *stream* de eventos (mínimo RUN\_STARTED \+ RUN\_FINISHED o RUN\_ERROR por ejecución). [\[6\]](https://docs.ag-ui.com/concepts/events)

* Soportar historial y sincronización mediante mensajes (Message\[\]) y snapshots (MESSAGES\_SNAPSHOT), y streaming de texto mediante TEXT\_MESSAGE\_START/CONTENT/END. [\[5\]](https://docs.ag-ui.com/concepts/messages)

* Permitir whitelabeling (marca/tema/estilos) sin reescribir la UI (no especificado en la doc; se propone un patrón estándar).

* Permitir **eventos personalizados** renderizados dentro del feed del chat:

* Vía CustomEvent para extensiones “open-ended” (name, value). [\[4\]](https://docs.ag-ui.com/sdk/js/core/events)

* Vía ActivityMessage para elementos UI estructurados “frontend-only” (progreso, estado, checklists) y actualizables con JSON Patch. [\[5\]](https://docs.ag-ui.com/concepts/messages)

**Requisitos no funcionales:**

* Extensibilidad: añadir nuevos “tipos” de eventos UI sin tocar el núcleo (registro/plug-in).

* Rendimiento: evitar re-render completos ante streams largos; procesar eventos incrementalmente; soportar compacción/serialización del stream. [\[7\]](https://docs.ag-ui.com/concepts/serialization)

* Integrabilidad: paquete SDK embebible en otras apps React, minimizando acoplamientos.

**Supuestos (no especificados por la documentación o por el enunciado):**

* Identidad/autorización: no especificado; se asume que el backend se autentica mediante headers (p. ej. Authorization) configurables en HttpAgent. [\[8\]](https://docs.ag-ui.com/sdk/js/client/http-agent?utm_source=chatgpt.com)

* Persistencia: no especificado; se propone persistir el stream serializado (JSON) y aplicar compacción antes de almacenar. [\[7\]](https://docs.ag-ui.com/concepts/serialization)

* UI/estilos: no especificado; se propone CSS variables \+ overrides y evitar inyectar HTML crudo por seguridad (propuesta razonable).

## Stack y arquitectura recomendados

**Base AG-UI (recomendación fuerte):**

* **Tipos y contrato de datos**: @ag-ui/core define RunAgentInput, Message, Tool, Context, etc., y su tipado es el “contrato” de integración. [\[9\]](https://docs.ag-ui.com/sdk/js/core/types)

* **Conectividad y procesamiento de eventos**: @ag-ui/client aporta AbstractAgent, HttpAgent, Middleware y AgentSubscriber, además de un events$ observable (ReplaySubject) para consumir el stream. [\[10\]](https://docs.ag-ui.com/sdk/js/client/abstract-agent)

**Arquitectura propuesta (núcleo \+ adaptadores \+ UI):**

* ChatController (núcleo, agnóstico a React): encapsula un AbstractAgent/HttpAgent, gestiona runAgent(), añade mensajes del usuario al historial y publica un estado derivado (mensajes, items de timeline, estado de ejecución).

* ChatStore (núcleo): mantiene el estado incremental; consume agent.events$ [\[11\]](https://docs.ag-ui.com/sdk/js/client/abstract-agent) y/o AgentSubscriber para callbacks de más alto nivel como onMessagesChanged, onCustomEvent, onActivitySnapshotEvent, etc. [\[12\]](https://docs.ag-ui.com/sdk/js/client/subscriber)

* RendererRegistry (extensibilidad UI):

* Renderers por Message.role (user, assistant, tool, activity, reasoning, …). [\[13\]](https://docs.ag-ui.com/sdk/js/core/types)

* Renderers por ActivityMessage.activityType (ej. "PLAN", "SEARCH"). [\[14\]](https://docs.ag-ui.com/sdk/js/core/events)

* Renderers por CustomEvent.name. [\[4\]](https://docs.ag-ui.com/sdk/js/core/events)

* En React: ChatProvider (context), ChatWindow, MessageList, Composer, etc., consumiendo el *store* con suscripciones incrementales.

**Elección de framework/stack para React**

La documentación no prescribe un framework específico para UI web; sí muestra una app demo (“dojo”) con scripts next dev, next build, next start (indicando un uso de Next.js en su *tooling* de ejemplo), pero esto no constituye una recomendación normativa para tu producto. [\[15\]](https://docs.ag-ui.com/quickstart/server)

Propuesta práctica (marcando lo no especificado):

* **Cliente completo (standalone)**: React \+ TypeScript \+ *bundler* moderno (no especificado). Requisito clave: buena experiencia para streaming/eventos y *code splitting*.

* **SDK inyectable**: librería ESM \+ tipos TypeScript; React como peerDependency (no especificado); objetivo: minimizar duplicación de React y permitir *tree-shaking*.

Justificación (analítica, no normativa): AG-UI ya define la capa de eventos/tipos/cliente (HttpAgent, AgentSubscriber, events$). [\[10\]](https://docs.ag-ui.com/sdk/js/client/abstract-agent) Por tanto, el “stack” de UI debe optimizar integración y extensibilidad **en torno a esos contratos** más que reinventar la conectividad.

## Diseño de proyecto y contratos principales

**Estrategia de repositorio:** monorepo con dos entregables que comparten núcleo.

* apps/chat-standalone: aplicación completa (demo/producción).

* packages/agui-react-sdk: paquete embebible (componentes \+ API pública \+ mount opcional).

### Estructura de carpetas propuesta

**Standalone (app completa)**

repo/  
  apps/  
    chat-standalone/  
      package.json  
      tsconfig.json  
      public/  
      src/  
        main.tsx  
        App.tsx  
        routes/                       \# (opcional) routing de la app  
        agui/  
          agent/  
            createHttpAgent.ts         \# HttpAgentConfig, headers, url, etc.  
            capabilities.ts            \# getCapabilities \+ feature gating (si aplica)  
          store/  
            ChatController.ts          \# orquesta agent \+ store \+ runAgent()  
            ChatStore.ts               \# estado incremental \+ suscripciones  
            reducers/  
              applyBaseEvent.ts        \# reduce BaseEvent \-\> estado UI  
              applyCustomEvent.ts      \# reduce CustomEvent \-\> timeline  
              applyActivityEvents.ts   \# ActivitySnapshot/Delta \-\> ActivityMessage  
            serialization/  
              serialize.ts             \# JSON stringify/parse del stream  
              compact.ts               \# compactEvents wrapper  
          registry/  
            MessageRendererRegistry.ts \# role \-\> renderer  
            ActivityRendererRegistry.ts\# activityType \-\> renderer  
            CustomEventRegistry.ts     \# name \-\> schema/renderer/handlers  
          types/  
            timeline.ts                \# TimelineItem unificado (Message \+ custom)  
            whitelabel.ts  
        ui/  
          components/  
            ChatWindow.tsx  
            MessageList.tsx  
            MessageItem.tsx  
            Composer.tsx  
            Toolbar.tsx  
          renderers/  
            default/  
              UserBubble.tsx  
              AssistantBubble.tsx  
              ToolResult.tsx  
              ActivityDefault.tsx  
              CustomEventDefault.tsx  
          theming/  
            ThemeProvider.tsx  
            tokens.ts  
            themes/  
              light.ts  
              dark.ts  
          styles/  
            tokens.css                 \# CSS variables base  
            components.css  
        tests/  
          ...  
  packages/  
    agui-react-sdk/  
      ...  
  pnpm-workspace.yaml (o equivalente)  \# no especificado

**SDK (paquete embebible)**

repo/  
  packages/  
    agui-react-sdk/  
      package.json  
      tsconfig.json  
      src/  
        index.ts                      \# exports públicos  
        core/  
          ChatController.ts  
          ChatStore.ts  
          registry/  
            CustomEventRegistry.ts  
            ActivityRendererRegistry.ts  
            MessageRendererRegistry.ts  
          types/  
            public.ts                 \# tipos/contratos públicos  
        react/  
          ChatProvider.tsx  
          ChatWidget.tsx              \# componente principal embebible  
          hooks/  
            useChatState.ts           \# selector/suscripción al store  
            useChatActions.ts         \# sendMessage, abortRun, etc.  
        theming/  
          ThemeProvider.tsx  
          tokens.ts  
          defaultTheme.ts  
        mount/  
          mountWidget.ts              \# API imperativa opcional (inyectar en DOM)  
        styles/  
          tokens.css  
          widget.css  
      build/                          \# artefactos  
      README.md

### Componentes React principales y contratos

| Componente | Responsabilidad | Props principales | Extensión |
| :---- | :---- | :---- | :---- |
| ChatWidget | Wrapper embebible: crea ChatController, monta layout, aplica tema | agent: AbstractAgent \\| HttpAgent, theme, brand, renderers, customEvents, tools, context | Override de renderers; inyección de registries |
| ChatProvider | Contexto para estado/acciones | controller, children | Permite sustituir store/controlador |
| ChatWindow | Layout: header \+ lista \+ composer | headerSlot?, footerSlot?, showReasoning? | Slots, overrides |
| MessageList | Render incremental del timeline | items, renderItem, virtualize? | Virtualización / renderItem |
| MessageItem | Selección de renderer por tipo (Message, Activity, Custom) | item, registry | Registro enchufable |
| Composer | Entrada texto \+ adjuntos; crea UserMessage | onSend, capabilities? | Plugins de input multimodal |
| ToolCallPanel (opcional) | UI human-in-the-loop para tool calls | toolCall, onResolve | Tool-specific UI |

**Notas de alineación con el contrato AG-UI:**

* UserMessage.content puede ser string o InputContent\[\] (multimodal), por lo que Composer debe producir cualquiera de las dos formas. [\[13\]](https://docs.ag-ui.com/sdk/js/core/types)

* ActivityMessage existe como mensaje “frontend-only” y se emite con ACTIVITY\_SNAPSHOT/ACTIVITY\_DELTA; se renderiza por activityType. [\[5\]](https://docs.ag-ui.com/concepts/messages)

* CustomEvent es un evento del protocolo con semántica definida por la aplicación (name, value). [\[4\]](https://docs.ag-ui.com/sdk/js/core/events)

### API pública, clases y tipos del SDK

| Elemento público | Tipo | Propósito | Relación con AG-UI |
| :---- | :---- | :---- | :---- |
| createChatController(options) | función | Crear controlador con agent, registries, persistencia | Consume runAgent() y events$ del AbstractAgent [\[11\]](https://docs.ag-ui.com/sdk/js/client/abstract-agent) |
| ChatController | clase | Acciones: sendUserMessage, run, abort, hydrate/dehydrate | abortRun(): void existe en AbstractAgent/HttpAgent [\[16\]](https://docs.ag-ui.com/sdk/js/client/abstract-agent) |
| ChatWidget | React component | Widget listo para incrustar | Integra mensajes/Activity/Custom |
| CustomEventDefinition | interfaz | Registro de custom events: nombre, schema, renderer, reducer | Se vincula a CustomEvent.name/value [\[17\]](https://docs.ag-ui.com/sdk/js/core/events) |
| ActivityRenderer | interfaz | Renderer por activityType | Se vincula a ActivityMessage.activityType [\[18\]](https://docs.ag-ui.com/concepts/messages) |
| WhitelabelConfig | interfaz | Marca/tema/tokens/overrides | No especificado en la doc |
| serializeEventStream() / hydrateEventStream() | funciones | Persistir/restaurar stream | Serialización/compacción recomendadas por AG-UI [\[7\]](https://docs.ag-ui.com/concepts/serialization) |

### Grafo de clases y relaciones

classDiagram  
  direction LR

  class AbstractAgent {  
    \+runAgent(parameters, subscriber) Promise\~RunAgentResult\~  
    \+subscribe(subscriber) unsubscribeHandle  
    \+abortRun() void  
    \+events$ Observable\~BaseEvent\~  
    \+messages Message\[\]  
    \+state State  
  }

  class HttpAgent {  
    \+url string  
    \+headers Record\~string,string\~  
    \#requestInit(input) RequestInit  
  }

  AbstractAgent \<|-- HttpAgent

  class ChatController {  
    \-agent AbstractAgent  
    \-store ChatStore  
    \-customRegistry CustomEventRegistry  
    \-activityRegistry ActivityRendererRegistry  
    \-messageRegistry MessageRendererRegistry  
    \+sendUserMessage(message) Promise  
    \+run(parameters) Promise  
    \+abort() void  
    \+dehydrate() SerializedStream  
    \+hydrate(stream) void  
  }

  class ChatStore {  
    \-timeline TimelineItem\[\]  
    \-runStatus RunStatus  
    \-lastError Error?  
    \+getState() ChatState  
    \+subscribe(listener) Unsubscribe  
    \+applyEvent(event) void  
  }

  class CustomEventRegistry {  
    \+register(definition) void  
    \+resolve(name) CustomEventDefinition?  
  }

  class ActivityRendererRegistry {  
    \+register(activityType, renderer) void  
    \+resolve(activityType) ActivityRenderer?  
  }

  class MessageRendererRegistry {  
    \+register(role, renderer) void  
    \+resolve(role) MessageRenderer?  
  }

  ChatController \--\> AbstractAgent : usa  
  ChatController \--\> ChatStore : orquesta  
  ChatController \--\> CustomEventRegistry : render/validación  
  ChatController \--\> ActivityRendererRegistry : render actividades  
  ChatController \--\> MessageRendererRegistry : render roles

Este grafo se apoya en que AbstractAgent expone runAgent(...), abortRun() y el observable events$ (ReplaySubject) para consumir eventos “en vivo” y también con suscripción tardía. [\[19\]](https://docs.ag-ui.com/sdk/js/client/abstract-agent)

## Patrón de whitelabeling

La documentación de AG-UI no prescribe un sistema de tematización UI (whitelabel); por tanto, se propone un patrón estándar que **no interfiere** con el protocolo y que se puede portar tanto al cliente completo como al SDK.

### Modelo propuesto

* **Tokens**: contrato de diseño en TypeScript \+ implementación como CSS variables (colores, tipografía, radios, sombras, spacing).

* **Themes**: presets de tokens (Light/Dark/BrandX).

* **Overrides**: 1\) *Override visual* (tokens \+ clases CSS) 2\) *Override estructural* (sustitución de componentes/renderer)

Esto encaja con AG-UI porque la UI se alimenta de Message\[\], ActivityMessage y eventos CustomEvent, pero su presentación es responsabilidad de la app. [\[20\]](https://docs.ag-ui.com/concepts/messages)

### Ejemplo de configuración whitelabel

export type WhitelabelConfig \= {  
  brand: {  
    name: string  
    logoUrl?: string  
    assistantDisplayName?: string  
  }  
  theme: {  
    tokens: Partial\<DesignTokens\>  
    mode?: "light" | "dark"  
  }  
  overrides?: {  
    components?: Partial\<{  
      AssistantBubble: React.ComponentType\<AssistantBubbleProps\>  
      UserBubble: React.ComponentType\<UserBubbleProps\>  
      CustomEventDefault: React.ComponentType\<CustomEventProps\>  
    }\>  
  }  
}

**Aplicación de tokens (CSS variables)**

/\* tokens.css \*/  
.agui {  
  \--agui-color-bg: \#ffffff;  
  \--agui-color-fg: \#111111;  
  \--agui-color-primary: \#2f6fed;  
  \--agui-radius-md: 12px;  
  \--agui-space-3: 12px;  
}

**Idea clave de extensibilidad:** el whitelabeling no debe “ramificar” el renderizado del stream: se limita a tokens/overrides, mientras el *store* y registries mantienen contratos estables.

## Custom events en la UI de chat

AG-UI ofrece **dos mecanismos complementarios** para “eventos que aparecen en la interfaz de chat”:

* CustomEvent: *extension mechanism* del protocolo (type: CUSTOM, name, value) para semántica definida por la app/equipo. [\[4\]](https://docs.ag-ui.com/sdk/js/core/events)

* ActivityMessage \+ ACTIVITY\_SNAPSHOT/ACTIVITY\_DELTA: mensajes UI estructurados “frontend-only”, pensados para progreso/estado y susceptibles de actualizarse con JSON Patch; además, el propio doc enfatiza que son personalizables por activityType. [\[5\]](https://docs.ag-ui.com/concepts/messages)

La solución extensible propuesta soporta ambos con el mismo patrón: **registro \+ validación \+ render**.

### Definición y registro

**Contrato de AG-UI para custom events**

CustomEvent está definido como:

* type: EventType.CUSTOM

* name: string

* value: any [\[17\]](https://docs.ag-ui.com/sdk/js/core/events)

**Registro propuesto en el SDK**

import { z } from "zod"  
import type { CustomEvent } from "@ag-ui/core"

export type CustomEventDefinition\<T\> \= {  
  name: string  
  schema: z.ZodType\<T\>              // validación de value  
  toTimelineItem?: (value: T) \=\> TimelineItem  
  render: React.ComponentType\<{ value: T; event: CustomEvent }\>  
}

export class CustomEventRegistry {  
  private defs \= new Map\<string, CustomEventDefinition\<any\>\>()

  register\<T\>(def: CustomEventDefinition\<T\>) {  
    this.defs.set(def.name, def)  
  }

  resolve(name: string) {  
    return this.defs.get(name)  
  }  
}

La doc del SDK indica que existen **esquemas Zod** para validar eventos, incluyendo CustomEventSchema, mediante un discriminatedUnion("type", ...). [\[17\]](https://docs.ag-ui.com/sdk/js/core/events) Esto justifica implementar una segunda capa de validación: la del “sobre” (AG-UI) \+ la del “payload” (aplicación).

### Serialización y persistencia

AG-UI recomienda serializar el **stream completo** (p. ej. JSON), restaurarlo y compactarlo; además describe beneficios como restaurar historial y estado UI tras recargas. [\[21\]](https://docs.ag-ui.com/concepts/serialization)

En particular:

* compactEvents *reduce secuencias verbosas* de streaming, preservando semántica, y **deja eventos custom “unchanged”** como *pass-through*. [\[22\]](https://docs.ag-ui.com/sdk/js/client/compaction)  
  Esto es clave: los custom events se pueden persistir/recuperar sin lógica especial, siempre que su value sea serializable.

**Estrategia propuesta:**

* Guardar BaseEvent\[\] como JSON (append-only por threadId/runId).

* Aplicar compactEvents antes de persistir o antes de export/analytics. [\[23\]](https://docs.ag-ui.com/sdk/js/client/compaction)

* Para UI durable (p. ej. checklists), preferir ActivityMessage (snapshot/delta) y persistirlo ya como parte del transcript (o derivado del stream).

### Renderizado en el timeline del chat

**Normalización a un TimelineItem interno**

type TimelineItem \=  
  | { kind: "message"; message: Message }  
  | { kind: "activity"; message: ActivityMessage }  
  | { kind: "custom"; name: string; value: unknown; timestamp?: number }

* Message y ActivityMessage vienen tipados por @ag-ui/core. [\[13\]](https://docs.ag-ui.com/sdk/js/core/types)

* custom se deriva de CustomEvent (no es un Message del contrato). [\[17\]](https://docs.ag-ui.com/sdk/js/core/events)

**Aplicación de eventos al store**

* ACTIVITY\_SNAPSHOT crea/actualiza ActivityMessage y se selecciona renderer por activityType. [\[14\]](https://docs.ag-ui.com/sdk/js/core/events)

* ACTIVITY\_DELTA aplica JSON Patch (patch: any\[\] // RFC 6902) sobre el content de la actividad. [\[24\]](https://docs.ag-ui.com/sdk/js/core/events)

* CUSTOM genera TimelineItem.kind="custom" y se renderiza por name.

**Flujo de extremo a extremo (custom event)**

sequenceDiagram  
  autonumber  
  participant UI as React UI  
  participant C as ChatController  
  participant A as HttpAgent/AbstractAgent  
  participant S as AG-UI Server  
  participant R as CustomEventRegistry

  UI-\>\>C: registerCustomEvent(def)  
  C-\>\>R: register(def)

  UI-\>\>C: sendUserMessage(text)  
  C-\>\>A: agent.messages.push(UserMessage)  
  C-\>\>A: runAgent(parameters, subscriber)

  A-\>\>S: POST RunAgentInput (Accept: text/event-stream)  
  S--\>\>A: stream BaseEvent... (incl. CUSTOM)

  A--\>\>C: events$ / subscriber.onCustomEvent({ event })  
  C-\>\>R: resolve(event.name)  
  alt schema OK  
    C-\>\>C: timeline.push({kind:"custom", ...})  
  else schema FAIL  
    C-\>\>C: timeline.push({kind:"custom", name:"unknown", ...})  
  end  
  C--\>\>UI: store update (suscripción)  
  UI-\>\>UI: render en MessageList

* HttpAgent por defecto usa POST con Accept: "text/event-stream" y body JSON.stringify(input). [\[25\]](https://docs.ag-ui.com/sdk/js/client/http-agent?utm_source=chatgpt.com)

* AgentSubscriber tiene onCustomEvent(...) específico para custom events, además de onEvent general. [\[12\]](https://docs.ag-ui.com/sdk/js/client/subscriber)

### Seguridad y performance (propuesta razonable, alineada con el contrato)

**Seguridad**

* Tratar CustomEvent.value como **datos**, nunca como HTML, porque value: any no garantiza forma/seguridad. [\[17\]](https://docs.ag-ui.com/sdk/js/core/events)

* Validar value con schema asociado a name (Zod u otro) y rechazar/aislar payloads no válidos (esto complementa el CustomEventSchema del SDK). [\[17\]](https://docs.ag-ui.com/sdk/js/core/events)

* Definir una allowlist de eventos soportados (registro explícito); para name desconocido, render genérico seguro.

**Performance**

* Evitar re-render completo del feed: el *store* debe aplicar eventos incrementalmente (p. ej. añadir un item o actualizar uno existente).

* Para streams largos, aplicar compacción (compactEvents) antes de persistir o para preparar “snapshots” UI/analítica. [\[23\]](https://docs.ag-ui.com/sdk/js/client/compaction)

* Para UI que requiere actualizaciones progresivas (progreso/estado), preferir ActivitySnapshot/Delta con JSON Patch, ya que el protocolo lo contempla explícitamente. [\[14\]](https://docs.ag-ui.com/sdk/js/core/events)

## Packaging, pruebas e integración

### Estrategia de carga/packaging

**Transporte y conectividad**

* AG-UI es “transport agnostic” y menciona compatibilidad con SSE, webhooks, WebSockets, etc. [\[26\]](https://docs.ag-ui.com/concepts/architecture)

* Para web, HttpAgent está diseñado para conectarse a un endpoint que acepta POST RunAgentInput y emite un stream de BaseEvent. [\[2\]](https://docs.ag-ui.com/concepts/architecture)

**Cliente completo (standalone)** (no especificado, propuesta):

* Bundles separados por rutas/pantallas.

* Carga diferida de:

* renderers “pesados” (p. ej. visualizadores de actividad complejos)

* módulos multimodales (si se usan InputContent\[\]) [\[13\]](https://docs.ag-ui.com/sdk/js/core/types)

**SDK embebible**

* Publicar en ESM para favorecer tree-shaking (propuesta).

* Marcar react/react-dom como peerDependencies (propuesta).

* Exponer:

* ChatWidget (React)

* mountWidget(container, options) (imperativo opcional)

* CSS:

* tokens.css (mínimo) \+ widget.css (componentes)

* Integración por CDN: no especificado por AG-UI; opción razonable: build adicional UMD/IIFE para \<script\> \+ mountWidget().

**Capacidades (feature gating)**

Si se adopta la propuesta de capabilities discovery, un HttpAgent puede consultar capacidades en GET {url}/capabilities (o capabilitiesUrl override) para adaptar UI (mostrar/hide attachments, reasoning toggle, etc.). Esto está descrito como convención en el documento *draft*. [\[27\]](https://docs.ag-ui.com/drafts/agent-capabilities)

### Estrategia de pruebas (propuesta razonable, apoyada en contratos AG-UI)

* Unit tests del reducer de eventos:

* Aplicar secuencias TEXT\_MESSAGE\_START/CONTENT/END y validar transcript. [\[14\]](https://docs.ag-ui.com/sdk/js/core/events)

* Aplicar ACTIVITY\_SNAPSHOT \+ ACTIVITY\_DELTA y validar ActivityMessage.content actualizado. [\[14\]](https://docs.ag-ui.com/sdk/js/core/events)

* Aplicar CUSTOM y validar que pasa por registry/schema. [\[17\]](https://docs.ag-ui.com/sdk/js/core/events)

* Contract tests del “puente” con HttpAgent:

* Verificar que se envía RunAgentInput y se acepta text/event-stream. [\[28\]](https://docs.ag-ui.com/sdk/js/client/http-agent?utm_source=chatgpt.com)

* Integration tests UI:

* Montar ChatWidget con un “agent stub” (subclase de AbstractAgent) que emita un observable con eventos (patrón mostrado en la doc de arquitectura/agentes). [\[29\]](https://docs.ag-ui.com/concepts/architecture)

* Tests de persistencia:

* serializar BaseEvent\[\], restaurar y compactar. [\[7\]](https://docs.ag-ui.com/concepts/serialization)

### Ejemplo de integración en otra app React

**1\) Crear el agente**

import { HttpAgent } from "@ag-ui/client"

export const agent \= new HttpAgent({  
  url: "https://api.example.com/v1/agent",  
  headers: {  
    Authorization: "Bearer your-api-key",  
  },  
})

La configuración HttpAgentConfig y el ejemplo de creación están documentados. [\[8\]](https://docs.ag-ui.com/sdk/js/client/http-agent?utm_source=chatgpt.com)

**2\) Montar el widget**

import { ChatWidget } from "@tu-org/agui-react-sdk"  
import { agent } from "./agent"

export function SupportChat() {  
  return (  
    \<ChatWidget  
      agent={agent}  
      whitelabel={{  
        brand: { name: "Acme", assistantDisplayName: "Acme Assistant" },  
        theme: { mode: "light", tokens: { colorPrimary: "\#ff5500" } },  
      }}  
      customEvents={\[  
        // definiciones registradas (name \+ schema \+ renderer)  
      \]}  
    /\>  
  )  
}

**3\) Añadir un mensaje de usuario y ejecutar el run**

El doc muestra que el historial se mantiene en agent.messages y se pueden añadir mensajes con agent.messages.push(...). [\[30\]](https://docs.ag-ui.com/concepts/agents?utm_source=chatgpt.com)

## Inventario de APIs de AG-UI utilizadas

A continuación se listan **fragmentos textuales** relevantes de la documentación (endpoints, props, APIs) que sustentan los contratos anteriores.

**Instalación de paquetes base**

npm install @ag-ui/core

[\[31\]](https://docs.ag-ui.com/sdk/js/core/overview?utm_source=chatgpt.com)

npm install @ag-ui/client

[\[32\]](https://docs.ag-ui.com/sdk/js/client/overview?utm_source=chatgpt.com)

**RunAgentInput (cuerpo del POST en HTTP API)**

type RunAgentInput \= {  
  threadId: string  
  runId: string  
  parentRunId?: string  
  state: any  
  messages: Message\[\]  
  tools: Tool\[\]  
  context: Context\[\]  
  forwardedProps: any  
}

[\[33\]](https://docs.ag-ui.com/sdk/js/core/types)

**HttpAgentConfig y ejemplo de creación**

interface HttpAgentConfig extends AgentConfig {  
  url: string // Endpoint URL for the agent service  
  headers?: Record\<string, string\> // Optional HTTP headers  
}

[\[8\]](https://docs.ag-ui.com/sdk/js/client/http-agent?utm_source=chatgpt.com)

const agent \= new HttpAgent({  
  url: "https://api.example.com/v1/agent",  
  headers: {  
    Authorization: "Bearer your-api-key",  
  },  
})

[\[8\]](https://docs.ag-ui.com/sdk/js/client/http-agent?utm_source=chatgpt.com)

**Request por defecto (SSE) en HttpAgent.requestInit()**

{  
  method: "POST",  
  headers: {  
    ...this.headers,  
    "Content-Type": "application/json",  
    Accept: "text/event-stream",  
  },  
  body: JSON.stringify(input),  
  signal: this.abortController.signal,  
}

[\[34\]](https://docs.ag-ui.com/sdk/js/client/http-agent?utm_source=chatgpt.com)

**API de ejecución y observabilidad en AbstractAgent**

runAgent(parameters?: RunAgentParameters, subscriber?: AgentSubscriber): Promise\<RunAgentResult\>

[\[11\]](https://docs.ag-ui.com/sdk/js/client/abstract-agent)

events$: Observable\<BaseEvent\>

[\[11\]](https://docs.ag-ui.com/sdk/js/client/abstract-agent)

**AgentSubscriber hooks relevantes para UI y extensibilidad**

onCustomEvent?(params: { event: CustomEvent } & AgentSubscriberParams): MaybePromise\<AgentStateMutation | void\>

[\[12\]](https://docs.ag-ui.com/sdk/js/client/subscriber)

onActivityDeltaEvent?(params: { event: ActivityDeltaEvent; activityMessage?: ActivityMessage } & AgentSubscriberParams): MaybePromise\<AgentStateMutation | void\>

[\[12\]](https://docs.ag-ui.com/sdk/js/client/subscriber)

interface AgentStateMutation {  
  messages?: Message\[\] // Update the message history  
  state?: State // Update the agent state  
  stopPropagation?: boolean // Prevent further subscribers from processing this event  
}

[\[12\]](https://docs.ag-ui.com/sdk/js/client/subscriber)

**Enumeración EventType y definición de CustomEvent (core events)**

enum EventType {  
  ...  
  RAW \= "RAW",  
  CUSTOM \= "CUSTOM",  
  RUN\_STARTED \= "RUN\_STARTED",  
  RUN\_FINISHED \= "RUN\_FINISHED",  
  RUN\_ERROR \= "RUN\_ERROR",  
  ...  
}

[\[35\]](https://docs.ag-ui.com/sdk/js/core/events)

type CustomEvent \= BaseEvent & {  
  type: EventType.CUSTOM  
  name: string  
  value: any  
}

[\[17\]](https://docs.ag-ui.com/sdk/js/core/events)

**Events de actividad (snapshot/delta) y campos de JSON Patch**

type ActivitySnapshotEvent \= BaseEvent & {  
  type: EventType.ACTIVITY\_SNAPSHOT  
  messageId: string  
  activityType: string  
  content: Record\<string, any\>  
  replace?: boolean  
}

[\[36\]](https://docs.ag-ui.com/sdk/js/core/events)

type ActivityDeltaEvent \= BaseEvent & {  
  type: EventType.ACTIVITY\_DELTA  
  messageId: string  
  activityType: string  
  patch: any\[\] // RFC 6902 JSON Patch operations  
}

[\[24\]](https://docs.ag-ui.com/sdk/js/core/events)

**ActivityMessage como frontend-only y personalizable**

Structured UI messages that exist only on the frontend.  
...  
Customizable: define your own activityType and content and render a matching UI component.

[\[18\]](https://docs.ag-ui.com/concepts/messages)

**Compacción para persistencia (compactEvents)**

function compactEvents(events: BaseEvent\[\]): BaseEvent\[\]

[\[23\]](https://docs.ag-ui.com/sdk/js/client/compaction)

**Capabilities endpoint (convención en draft)**

/\*\* Override the capabilities endpoint. Defaults to {url}/capabilities \*/  
capabilitiesUrl?: string

[\[37\]](https://docs.ag-ui.com/drafts/agent-capabilities)

Remote agents expose a GET /capabilities endpoint that returns the AgentCapabilities JSON object.

[\[37\]](https://docs.ag-ui.com/drafts/agent-capabilities)

**Ejemplo de endpoint servidor SSE (quickstart)**

@app.post("/")  
async def agentic\_chat\_endpoint(input\_data: RunAgentInput, request: Request):  
...  
return StreamingResponse(  
    event\_generator(),  
    media\_type="text/event-stream"  
)

[\[15\]](https://docs.ag-ui.com/quickstart/server)

---

[\[1\]](https://docs.ag-ui.com/introduction) AG-UI Overview \- Agent User Interaction Protocol

[https://docs.ag-ui.com/introduction](https://docs.ag-ui.com/introduction)

[\[2\]](https://docs.ag-ui.com/concepts/architecture) [\[26\]](https://docs.ag-ui.com/concepts/architecture) [\[29\]](https://docs.ag-ui.com/concepts/architecture) Core architecture \- Agent User Interaction Protocol

[https://docs.ag-ui.com/concepts/architecture](https://docs.ag-ui.com/concepts/architecture)

[\[3\]](https://docs.ag-ui.com/sdk/js/core/overview?utm_source=chatgpt.com) [\[31\]](https://docs.ag-ui.com/sdk/js/core/overview?utm_source=chatgpt.com) Overview \- Agent User Interaction Protocol

[https://docs.ag-ui.com/sdk/js/core/overview?utm\_source=chatgpt.com](https://docs.ag-ui.com/sdk/js/core/overview?utm_source=chatgpt.com)

[\[4\]](https://docs.ag-ui.com/sdk/js/core/events) [\[14\]](https://docs.ag-ui.com/sdk/js/core/events) [\[17\]](https://docs.ag-ui.com/sdk/js/core/events) [\[24\]](https://docs.ag-ui.com/sdk/js/core/events) [\[35\]](https://docs.ag-ui.com/sdk/js/core/events) [\[36\]](https://docs.ag-ui.com/sdk/js/core/events) Events \- Agent User Interaction Protocol

[https://docs.ag-ui.com/sdk/js/core/events](https://docs.ag-ui.com/sdk/js/core/events)

[\[5\]](https://docs.ag-ui.com/concepts/messages) [\[18\]](https://docs.ag-ui.com/concepts/messages) [\[20\]](https://docs.ag-ui.com/concepts/messages) Messages \- Agent User Interaction Protocol

[https://docs.ag-ui.com/concepts/messages](https://docs.ag-ui.com/concepts/messages)

[\[6\]](https://docs.ag-ui.com/concepts/events) Events \- Agent User Interaction Protocol

[https://docs.ag-ui.com/concepts/events](https://docs.ag-ui.com/concepts/events)

[\[7\]](https://docs.ag-ui.com/concepts/serialization) [\[21\]](https://docs.ag-ui.com/concepts/serialization) Serialization \- Agent User Interaction Protocol

[https://docs.ag-ui.com/concepts/serialization](https://docs.ag-ui.com/concepts/serialization)

[\[8\]](https://docs.ag-ui.com/sdk/js/client/http-agent?utm_source=chatgpt.com) [\[25\]](https://docs.ag-ui.com/sdk/js/client/http-agent?utm_source=chatgpt.com) [\[28\]](https://docs.ag-ui.com/sdk/js/client/http-agent?utm_source=chatgpt.com) [\[34\]](https://docs.ag-ui.com/sdk/js/client/http-agent?utm_source=chatgpt.com) HttpAgent \- Agent User Interaction Protocol

[https://docs.ag-ui.com/sdk/js/client/http-agent?utm\_source=chatgpt.com](https://docs.ag-ui.com/sdk/js/client/http-agent?utm_source=chatgpt.com)

[\[9\]](https://docs.ag-ui.com/sdk/js/core/types) [\[13\]](https://docs.ag-ui.com/sdk/js/core/types) [\[33\]](https://docs.ag-ui.com/sdk/js/core/types) Types \- Agent User Interaction Protocol

[https://docs.ag-ui.com/sdk/js/core/types](https://docs.ag-ui.com/sdk/js/core/types)

[\[10\]](https://docs.ag-ui.com/sdk/js/client/abstract-agent) [\[11\]](https://docs.ag-ui.com/sdk/js/client/abstract-agent) [\[16\]](https://docs.ag-ui.com/sdk/js/client/abstract-agent) [\[19\]](https://docs.ag-ui.com/sdk/js/client/abstract-agent) AbstractAgent \- Agent User Interaction Protocol

[https://docs.ag-ui.com/sdk/js/client/abstract-agent](https://docs.ag-ui.com/sdk/js/client/abstract-agent)

[\[12\]](https://docs.ag-ui.com/sdk/js/client/subscriber) AgentSubscriber \- Agent User Interaction Protocol

[https://docs.ag-ui.com/sdk/js/client/subscriber](https://docs.ag-ui.com/sdk/js/client/subscriber)

[\[15\]](https://docs.ag-ui.com/quickstart/server) Server \- Agent User Interaction Protocol

[https://docs.ag-ui.com/quickstart/server](https://docs.ag-ui.com/quickstart/server)

[\[22\]](https://docs.ag-ui.com/sdk/js/client/compaction) [\[23\]](https://docs.ag-ui.com/sdk/js/client/compaction) Stream Compaction \- Agent User Interaction Protocol

[https://docs.ag-ui.com/sdk/js/client/compaction](https://docs.ag-ui.com/sdk/js/client/compaction)

[\[27\]](https://docs.ag-ui.com/drafts/agent-capabilities) [\[37\]](https://docs.ag-ui.com/drafts/agent-capabilities) Agent Capabilities Discovery \- Agent User Interaction Protocol

[https://docs.ag-ui.com/drafts/agent-capabilities](https://docs.ag-ui.com/drafts/agent-capabilities)

[\[30\]](https://docs.ag-ui.com/concepts/agents?utm_source=chatgpt.com) Agents \- Agent User Interaction Protocol

[https://docs.ag-ui.com/concepts/agents?utm\_source=chatgpt.com](https://docs.ag-ui.com/concepts/agents?utm_source=chatgpt.com)

[\[32\]](https://docs.ag-ui.com/sdk/js/client/overview?utm_source=chatgpt.com) Client package overview \- AG-UI

[https://docs.ag-ui.com/sdk/js/client/overview?utm\_source=chatgpt.com](https://docs.ag-ui.com/sdk/js/client/overview?utm_source=chatgpt.com)