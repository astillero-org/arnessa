# Plan de Mejora Total del Frontend - Arnessa AG-UI

## Estado actual: diagnóstico

### Lo que hay
- Next.js app con una sola página (`/`) que monta `FullScreenChat` + `SideChatWidget`
- SDK en `packages/agui-chat-sdk` con componentes React (ChatProvider, FullScreenChat, SideChatWidget, ChatComposer, MessageList, HistoryList)
- shadcn/ui instalado pero apenas usado (button, card, input, scroll-area, separator, sheet)
- Tailwind CSS con clases inline en todos los componentes
- Integración AG-UI funcional (HttpAgent, ChatController, ChatStore, event reducers)

### Problemas identificados

**UX/Diseño:**
1. **Layout de página demo es un dashboard muerto** - La página principal es un grid estático con una "Guía de inicio" y un indicador de "Conexión AG-UI" que no sirven de nada al usuario real. Es una landing page de desarrollador, no una interfaz de producto.
2. **El chat ocupa 600px fijos** en un contenedor con bordes, dejando 40% de la pantalla vacía. Un producto de generación de muebles necesita espacio para mostrar resultados visuales.
3. **Empty state genérico** - Solo un ícono de Sparkles con texto vago. No guía al usuario a hacer nada.
4. **HistoryList es hardcoded** - Los items son estáticos, no se conectan al store. "Hace 2 horas" es texto fijo, no datos reales.
5. **No hay visualización de resultados** - Para un producto de generación de muebles, no hay forma de ver imágenes, modelos 3D, o renders de los muebles generados. El chat solo muestra texto.
6. **SideChatWidget tiene UX confusa** - Un FAB azul que abre un panel lateral con el mismo chat duplicado. No hay valor añadido claro.
7. **Sin feedback visual durante generación** - Solo un spinner con texto "procesando". En un producto de generación de imágenes/muebles, el usuario necesita feedback de progreso real.

**Código:**
1. **Clases Tailwind kilométricas** - Strings de 200+ caracteres en className. Imposible mantener, imposible leer. Ejemplo: `className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-all text-[11px] font-bold border border-red-100 shadow-sm active:scale-95"`
2. **shadcn/ui infrautilizado** - Se instaló pero los componentes se escribieron a mano con tailwind inline. Los buttons, inputs, cards deberían usar shadcn.
3. **Componentes del SDK acoplan UI + lógica** - MessageList.tsx tiene 207 líneas con rendering, scroll logic, markdown parsing, y state management todo mezclado.
4. **No hay responsive design** - El grid es `md:grid-cols-3` pero el side chat es fijo a 440px. Mobile inexistente.
5. **No hay dark mode** - Solo light theme hardcoded.
6. **Sin tests** - A pesar de que la arquitectura documenta TDD, no hay un solo test.
7. **Sin loading states reales** - El skeleton/loading es un overlay flotante, no un placeholder proper.
8. **Sin error handling visual** - Si la conexión falla, el usuario no ve nada.

---

## Plan de mejora

### Fase 0: Fundamentos (debe hacerse primero)

#### 0.1 Extraer design tokens y usar shadcn/ui en serio
- Definir paleta de colores, spacing, typography como CSS variables en `globals.css`
- Reemplazar TODOS los botones, inputs, cards hechos a mano con componentes shadcn
- Crear variantes custom de shadcn para los casos específicos de Arnessa (ej: `ChatBubble`, `StatusBadge`)
- Eliminar las clases tailwind duplicadas creando composiciones reutilizables via `cn()` y componentes propios

#### 0.2 Refactor de componentes del SDK
- **MessageList.tsx** → descomponer en:
  - `MessageBubble` (user/assistant bubble con markdown)
  - `ToolResultCard` (resultado de herramienta, expandible)
  - `ActivityIndicator` (eventos de actividad)
  - `CustomEventRenderer` (eventos custom)
  - `EmptyState` (estado vacío con CTAs)
- **ChatComposer.tsx** → usar shadcn `Input` + `Button`, extraer lógica de submit
- **FullScreenChat.tsx** → simplificar a composición de sub-componentes
- **HistoryList.tsx** → conectar a datos reales del store, no hardcodear items

#### 0.3 Responsive desde el inicio
- Mobile-first layout
- Chat fullscreen en mobile, split-view en desktop
- SideChatWidget como bottom sheet en mobile, drawer en desktop
- Breakpoints: `sm` (640px), `md` (768px), `lg` (1024px)

---

### Fase 1: Rediseño de la experiencia principal

#### 1.1 Nueva página principal - Layout de producto
Eliminar el layout de "dashboard demo" y crear una interfaz de producto real:

```
┌─────────────────────────────────────────────────┐
│  [Logo] Arnessa Studio          [History] [Settings] │
├────────────────────┬────────────────────────────┤
│                    │                            │
│   Chat Panel       │   Canvas / Preview Panel   │
│   (conversación    │   (visualización de        │
│    con el agente)  │    muebles generados,      │
│                    │    imágenes, renders)       │
│                    │                            │
│                    │                            │
├────────────────────┴────────────────────────────┤
│  [Input: Describe el mueble...]        [Enviar] │
└─────────────────────────────────────────────────┘
```

**Justificación:** Arnessa es una plataforma de generación de muebles. El output es visual. Necesita un canvas donde mostrar resultados, no solo un chat.

#### 1.2 Canvas/Preview Panel
- Panel derecho que muestra el resultado de la generación
- Soporta: imágenes, galerías, especificaciones técnicas del mueble
- Cuando no hay resultado: mostrar ejemplos/inspiración
- Conectar via `CustomEvent` o `ActivityMessage` del backend para recibir resultados visuales

#### 1.3 Empty State que guía al usuario
En vez del ícono genérico actual, mostrar:
- 3-4 prompts de ejemplo clickeables ("Sillón moderno minimalista", "Mesa de comedor para 6 personas", etc.)
- Un mini-carousel de ejemplos de muebles generados previamente
- CTA claro: "Describe tu mueble ideal para comenzar"

#### 1.4 Historial real
- Conectar `HistoryList` al store con datos reales de `threadId`
- Mostrar preview del último mueble generado en cada thread
- Persistir en localStorage como mínimo (sessionStorage si no hay backend de persistencia)
- Poder renombrar y eliminar conversaciones

---

### Fase 2: Mejoras de UX durante la generación

#### 2.1 Progress feedback real
- Cuando el agente ejecuta tools, mostrar qué está haciendo: "Analizando dimensiones...", "Generando render 3D...", "Aplicando materiales..."
- Usar `ActivityMessage` con `activityType` específicos para cada paso
- Barra de progreso o stepper visual que muestre el pipeline de generación

#### 2.2 Streaming visual
- El texto del asistente ya hace streaming (TEXT_MESSAGE_*) - mantener
- Agregar streaming de imágenes: mostrar placeholder blur → imagen progresiva
- Mostrar variaciones/opciones cuando el agente las genere

#### 2.3 Error states
- Conexión perdida → banner con retry
- Generación fallida → mensaje con opción de reintentar
- Backend caído → pantalla de estado con auto-reconnect
- Timeout → "La generación está tardando más de lo usual. ¿Quieres esperar o cancelar?"

#### 2.4 Estados del chat mejorados
- Typing indicator con animación (dots o wave)
- "El agente está pensando..." con indicador visual
- Confirmación visual cuando se envía un mensaje (checkmark)
- Scroll-to-bottom button cuando hay mensajes nuevos fuera de viewport

---

### Fase 3: Pulido visual y detalles

#### 3.1 Dark mode
- Implementar toggle dark/light usando shadcn theme system
- Respetar `prefers-color-scheme` del OS
- Persistir preferencia en localStorage

#### 3.2 Animaciones y transiciones
- Mensajes entrando con animación suave (no los `animate-in` agresivos actuales)
- Transiciones de panel (chat ↔ historial) con animación de slide
- Micro-interacciones: hover en burbujas, focus en input, send button

#### 3.3 Tipografía y spacing
- Definir escala tipográfica consistente (no los `text-[10px]`, `text-[11px]`, `text-[13px]` arbitrarios actuales)
- Usar la escala de Tailwind: `text-xs`, `text-sm`, `text-base`, `text-lg`
- Spacing consistente entre mensajes, padding uniforme

#### 3.4 Accesibilidad
- Roles ARIA en chat (`role="log"`, `role="listitem"` en mensajes)
- Focus management: tab navigation funcional
- Screen reader support: anuncios de nuevos mensajes
- Contraste suficiente en todos los estados (revisar los grays actuales)
- Labels en todos los botones de ícono

---

### Fase 4: Features de producto

#### 4.1 Galería de diseños
- Vista grid de todos los muebles generados
- Filtros por tipo, estilo, fecha
- Detalle de cada diseño con especificaciones

#### 4.2 Compartir y exportar
- Compartir diseño por link
- Exportar especificaciones como PDF
- Descargar imágenes en alta resolución

#### 4.3 Iteración sobre diseños
- "Hazlo más grande", "Cambia el color a azul" → aplicar sobre diseño existente
- Historial de iteraciones de un mismo mueble
- Comparar versiones side-by-side

#### 4.4 Onboarding
- Tour guiado para nuevos usuarios
- Tooltips contextuales
- Ejemplos interactivos

---

## Priorización

| Fase | Esfuerzo | Impacto | Prioridad |
|------|----------|---------|-----------|
| 0.1 Design tokens + shadcn | 2-3 días | Alto (deuda técnica) | **P0** |
| 0.2 Refactor componentes SDK | 2-3 días | Alto (mantenibilidad) | **P0** |
| 0.3 Responsive | 1-2 días | Alto (usabilidad) | **P0** |
| 1.1 Layout de producto | 2-3 días | **Crítico** (UX) | **P0** |
| 1.2 Canvas/Preview | 3-4 días | **Crítico** (core feature) | **P0** |
| 1.3 Empty state | 0.5 días | Alto (onboarding) | **P1** |
| 1.4 Historial real | 2 días | Alto (funcionalidad) | **P1** |
| 2.1 Progress feedback | 1-2 días | Alto (UX) | **P1** |
| 2.2 Streaming visual | 2-3 días | Medio-Alto | **P1** |
| 2.3 Error states | 1 día | Alto (robustez) | **P1** |
| 2.4 Estados del chat | 1 día | Medio | **P2** |
| 3.1 Dark mode | 1 día | Medio | **P2** |
| 3.2 Animaciones | 1-2 días | Medio (polish) | **P2** |
| 3.3 Tipografía | 0.5 días | Medio | **P2** |
| 3.4 Accesibilidad | 2 días | Alto (compliance) | **P2** |
| 4.x Features de producto | 5-10 días | Alto | **P3** |

## Resumen ejecutivo

El frontend actual funciona como prueba de concepto del protocolo AG-UI, pero **no es un producto**. La inversión principal está en el core (ChatController, ChatStore, event reducers) que está bien diseñado. La UI, en cambio, es un wrapper apresurado con tailwind inline sin estructura.

**Las 3 acciones que más impacto tienen:**
1. **Rediseñar el layout** de dashboard-demo a interfaz de producto con chat + canvas de preview
2. **Usar shadcn/ui de verdad** y eliminar los 500+ líneas de clases tailwind custom
3. **Conectar los datos reales** (historial, estados, errores) en vez de hardcodear

Con las Fases 0 y 1 completadas (~2 semanas), el frontend pasa de "demo técnica" a "producto usable".
