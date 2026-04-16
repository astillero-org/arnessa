# Arquitectura MVP: Chatbot SDK + Demo App (React, Next.js, shadcn)

## 1. Objetivo

Definir una arquitectura frontend que:

1. Implemente un cliente compatible con [agui_implementation.md](agui_implementation.md).
2. Use React + Next.js (lado cliente) + shadcn/ui como base de UI.
3. Priorice un enfoque SDK/componente reusable de forma independiente.
4. Incluya una demo app para validar integración y UX end-to-end.
5. Implemente, como mínimo:
	- Un chat full screen con historial.
	- Un side chat activable por botones, con navegación a historial al presionar Back dentro del componente.
6. Siga estrategia first-test then code (TDD pragmático) con herramientas de testing desde el inicio.

## 2. Principios de diseño

1. Protocolo primero: el núcleo se alinea al contrato AG-UI (eventos, mensajes, run lifecycle).
2. UI desacoplada del transporte: HttpAgent/AbstractAgent y adaptación de eventos aislados en core.
3. SDK first: lo primero en diseñarse es un paquete reusable, la demo solo consume ese paquete.
4. Render extensible: registro de renderers para mensajes, actividades y eventos custom.
5. Estado incremental: evitar rerender global ante streaming largo.
6. Test-first: cada bloque funcional se implementa con pruebas previas de contrato y comportamiento.

## 3. Alcance MVP

### Incluye

1. Cliente AG-UI en frontend usando el diseño de [agui_implementation.md](agui_implementation.md).
2. SDK React con componentes base y API pública para embebido.
3. Demo app Next.js que monta el SDK.
4. Modos de UI:
	- Full screen chat.
	- Side chat (panel lateral) invocable por botones.
5. Historial en ambos modos.
6. Back en side chat para volver a la vista de historial del propio componente.
7. Suite mínima de pruebas unitarias, integración y e2e.

### No incluye en MVP

1. Auth avanzada multitenant.
2. Editor visual de temas.
3. Analytics avanzada de uso.
4. Persistencia backend de largo plazo fuera del flujo base.

## 4. Stack técnico

1. Framework: Next.js (App Router).
2. UI: React client components (use client) + shadcn/ui + Tailwind CSS.
3. Protocolo/cliente: @ag-ui/core y @ag-ui/client.
4. Estado de runtime del chat: store interno + controladores del SDK (sin acoplar a global store de app host).
5. Testing:
	- Unit/integration: Vitest + Testing Library.
	- API mocking: MSW.
	- E2E: Playwright.
	- Accesibilidad básica: axe-core en pruebas de componentes críticos.

## 5. Arquitectura propuesta

## 5.1 Monorepo y paquetes

1. packages/agui-chat-sdk
	- Núcleo reusable del chat.
	- Componentes UI exportables.
	- Contratos de extensión (renderers, temas, custom events).
2. apps/chat-demo
	- App Next.js de demostración.
	- Monta el SDK en páginas de ejemplo.

## 5.2 Capas

1. Capa Core
	- ChatController: orquesta run, abort, hydrate/dehydrate y sincronización con agent.
	- ChatStore: estado incremental del timeline, run status e historial.
	- Event reducers: mapeo de BaseEvent hacia estado UI.
2. Capa UI SDK
	- Componentes de chat (full/side), historial, composer, toolbar.
	- Registro de renderers para mensajes y custom events.
	- Theming y branding por tokens.
3. Capa Demo App
	- Botones para abrir side chat.
	- Ruta dedicada para full screen.
	- Datos mock o backend real configurable.

## 5.3 Contrato de integración con AG-UI

El SDK debe implementar el cliente de [agui_implementation.md](agui_implementation.md) con estos puntos obligatorios:

1. Crear agente HTTP con endpoint AG-UI.
2. Ejecutar runAgent con payload de mensajes/hilo.
3. Consumir stream de eventos y aplicar reducers incrementales.
4. Soportar al menos:
	- RUN_STARTED, RUN_FINISHED, RUN_ERROR.
	- MESSAGES_SNAPSHOT.
	- TEXT_MESSAGE_START, TEXT_MESSAGE_CONTENT, TEXT_MESSAGE_END.
	- CUSTOM.
	- ACTIVITY_SNAPSHOT y ACTIVITY_DELTA.
5. Exponer hooks/callbacks para extensiones del host app.

## 6. Componentes mínimos del MVP

## 6.1 FullScreenChat

Responsabilidad:

1. Ocupa toda la vista principal.
2. Muestra conversación activa y acceso al historial.
3. Permite seleccionar conversación previa y continuarla.

Composición sugerida:

1. Header de sesión.
2. Panel de historial (izquierda) + timeline (centro).
3. Composer inferior.

## 6.2 SideChatWidget

Responsabilidad:

1. Widget lateral colapsable (drawer/sheet) activable por botones externos.
2. Vista principal de conversación en panel lateral.
3. Botón Back interno que lleva a la vista de historial del widget.

Composición sugerida:

1. Trigger buttons en host app (ejemplo: soporte, ventas).
2. Side panel con dos estados internos:
	- Estado Chat.
	- Estado Historial.
3. Botón Back visible en estado Chat para volver a Historial.

Regla UX MVP:

1. Al abrir side chat, se entra a Chat de la conversación actual.
2. Back cambia a Historial sin cerrar el panel.
3. Seleccionar hilo en Historial vuelve a Chat con ese hilo.

## 6.3 HistoryList

Responsabilidad:

1. Listar conversaciones por threadId.
2. Mostrar metadatos mínimos (título, último mensaje, fecha).
3. Permitir crear nueva conversación.

## 6.4 ChatComposer

Responsabilidad:

1. Entrada de texto y envío.
2. Estado disabled durante ejecución cuando aplique.
3. Integración mínima con acciones de run y abort.

## 7. API pública del SDK (MVP)

1. ChatProvider
	- Provee estado y acciones a componentes.
2. FullScreenChat
	- Vista completa con historial integrado.
3. SideChatWidget
	- Widget lateral con navegación Chat/Historial y Back.
4. createChatController(options)
	- Inicializa core y conecta con agent.
5. Tipos públicos
	- WhitelabelConfig
	- CustomEventDefinition
	- ChatSDKOptions

## 8. Whitelabeling y extensibilidad

1. Base visual con shadcn/ui, pero tokens de marca centralizados.
2. Theme tokens por CSS variables para color, tipografía, radios, spacing.
3. Overrides permitidos en:
	- Renderers de mensaje por rol.
	- Renderers por custom event name.
	- Componentes de shell (header, empty states).
4. Default seguro para eventos custom desconocidos.

## 9. Enfoque first-test then code

## 9.1 Herramientas

1. Vitest para lógica de reducers y store.
2. Testing Library para componentes React.
3. MSW para simular backend AG-UI y streams.
4. Playwright para journeys reales (full y side chat).
5. axe-core para checks de accesibilidad en componentes clave.

## 9.2 Orden de implementación guiado por pruebas

Fase 1: Core de eventos

1. Prueba: reducer crea estado run al recibir RUN_STARTED.
2. Prueba: reducer cierra run con RUN_FINISHED o RUN_ERROR.
3. Prueba: secuencia TEXT_MESSAGE_* compone mensaje final.
4. Código mínimo para pasar pruebas.

Fase 2: Historial

1. Prueba: crear hilo nuevo lo agrega a HistoryList.
2. Prueba: seleccionar hilo hidrata timeline correcto.
3. Código mínimo para pasar pruebas.

Fase 3: FullScreenChat

1. Prueba de render de historial + timeline + composer.
2. Prueba de envío de mensaje y actualización incremental.
3. Código mínimo para pasar pruebas.

Fase 4: SideChatWidget

1. Prueba: botón externo abre panel lateral.
2. Prueba: botón Back dentro del widget cambia de Chat a Historial.
3. Prueba: elegir hilo desde Historial vuelve a Chat con ese hilo.
4. Código mínimo para pasar pruebas.

Fase 5: Custom events y activity

1. Prueba: evento CUSTOM conocido usa renderer registrado.
2. Prueba: CUSTOM desconocido cae en renderer default seguro.
3. Prueba: ACTIVITY_SNAPSHOT + ACTIVITY_DELTA actualizan UI durable.
4. Código mínimo para pasar pruebas.

Fase 6: E2E

1. Journey full screen con historial.
2. Journey side chat con botón de apertura y back a historial.
3. Smoke de reconexión/hidratación básica.

## 10. Estructura sugerida de carpetas

apps/
  chat-demo/
	 app/
		fullscreen/page.tsx
		side/page.tsx
		layout.tsx
	 components/
		DemoOpenButtons.tsx
	 tests/
		e2e/
		  fullscreen.spec.ts
		  sidechat.spec.ts

packages/
  agui-chat-sdk/
	 src/
		core/
		  ChatController.ts
		  ChatStore.ts
		  reducers/
			 applyBaseEvent.ts
		react/
		  ChatProvider.tsx
		  FullScreenChat.tsx
		  SideChatWidget.tsx
		  HistoryList.tsx
		  ChatComposer.tsx
		theming/
		  tokens.css
		  theme.ts
		registry/
		  CustomEventRegistry.ts
		index.ts
	 tests/
		unit/
		integration/

## 11. Criterios de aceptación del MVP

1. El SDK puede conectarse a un backend AG-UI y renderizar respuestas en streaming.
2. Existe componente FullScreenChat funcional con historial.
3. Existe componente SideChatWidget activable por botones externos.
4. SideChatWidget implementa navegación Back hacia historial dentro del propio componente.
5. El demo app monta ambos modos (full y side) sin duplicar lógica core.
6. El repositorio incluye pipeline de pruebas first-test then code con unit, integration y e2e.

## 12. Roadmap inmediato

1. Crear scaffolding de packages/agui-chat-sdk y apps/chat-demo.
2. Configurar testing stack al inicio (Vitest, Testing Library, MSW, Playwright, axe).
3. Implementar Fase 1 y Fase 2 con TDD.
4. Construir componentes FullScreenChat y SideChatWidget con shadcn/ui.
5. Cerrar con pruebas e2e y documentación de integración en host apps.
