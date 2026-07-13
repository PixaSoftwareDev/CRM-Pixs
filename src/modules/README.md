# modules/

Lógica de negocio por dominio (§6 del plan). Los componentes React **muestran**;
los módulos **deciden**. Cada dominio expone:

- `actions.ts` — Server Actions (escritura). Validan con Zod y chequean permisos.
- `queries.ts` — lecturas (para Server Components).
- `schemas.ts` — esquemas Zod compartidos cliente/servidor.
- `service.ts` — lógica pura, testeable, sin acoplar a React.

Dominios previstos: contacts · opportunities · projects · tasks · infra · payments · finance · scraping
