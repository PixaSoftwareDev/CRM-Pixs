# Sistema de Diseño — PIXS

Herramienta de uso diario para 3 personas no técnicas. Estándar: abrir la app y
saber qué hacer en 3 segundos. Referencias: Mercury Bank (claridad financiera),
Linear (densidad + productividad), Things 3 (cero fricción).

## Tematización con variables CSS

Todos los colores se definen como variables CSS en `globals.css` y se exponen a
Tailwind en `tailwind.config.ts`. El modo oscuro se activa con la clase `.dark`
sobre `<html>` (gestionada por `hooks/useTheme.ts` a partir del store de UI).
Esto permite cambiar tema sin recompilar y mantener un único origen de verdad.

## Grilla y espaciado

Grilla de 8px usando la escala de espaciado de Tailwind. Mantener consistencia:
secciones con `gap-4`/`gap-6`, padding de contenedores `p-4` (mobile) / `p-6`
(desktop).

## Tipografía

- Familia: **Inter** (con fallback a system-ui).
- Solo 2 pesos: 400 (regular), 500/600 (medium/semibold).
- Cuerpo mínimo 16px. Encabezados desde 24px (`text-2xl`).

## Color

- Marca: índigo `#6366f1` (un único color de acción primaria).
- Semánticos: success `#10b981`, warning `#f59e0b`, danger `#ef4444`, info `#3b82f6`.
- Neutros cálidos para superficies y texto. Light + dark completos.

## Botones

- **Acción primaria por pantalla**: una sola, alta (56px / `size="lg"`), color marca.
- Secundarias: 40px desktop. Targets táctiles mínimos de 48px en mobile.
- El resto: `secondary` o `ghost`.

## Estados

Toda vista contempla los 4 estados: loading (skeleton), error (mensaje + reintentar),
empty (ilustración + texto + CTA primaria), success.

## Confirmaciones destructivas

Texto literal del recurso, nunca genérico. Ej:
"Eliminar Factura N°0001-00000123. Esta acción no se puede deshacer."

## Idioma

Español rioplatense natural ("Cargar gasto", "Vence mañana", "Saldo a favor").
Nunca jerga técnica ni inglés en la UI.

## Accesibilidad (WCAG AA)

Contraste 4.5:1, navegación por teclado, ARIA en componentes interactivos,
foco visible global (`:focus-visible`). Modales con focus trap y cierre por Escape.

## Componentes agregados (CRM + Ventas)

- `ErrorState`: panel estándar de error con ícono, mensaje y botón "Reintentar".
  Usar en todas las vistas para el estado de error.
- `ContactPicker`: buscador con debounce (300ms) para elegir un contacto por nombre.
  Reemplaza al `Select` cuando hay que elegir un contacto/cliente en formularios.
- Selección de usuarios (asignados/responsables): sin endpoint de listado de usuarios,
  los formularios usan un input de texto con el ID prellenado al usuario actual.

## Por qué sin librería de componentes

Construimos todo desde cero (sin shadcn/radix) para tener control total sobre
accesibilidad, branding y peso del bundle, ajustado exactamente a estos principios.
