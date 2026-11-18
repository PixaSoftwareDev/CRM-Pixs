/**
 * Textos libres que escribe la gente (títulos, descripciones, comentarios, notas).
 * No tienen límite visible: solo un tope de seguridad muy holgado contra abusos,
 * que nadie debería alcanzar escribiendo a mano.
 */
import { z } from "zod";

/** Tope de seguridad para títulos (una línea). */
export const TITLE_MAX = 10_000;
/** Tope de seguridad para cuerpos: descripciones, comentarios, notas, motivos. */
export const BODY_MAX = 100_000;

const tooLong = (max: number) => `El texto es demasiado largo (máximo ${max.toLocaleString("es-AR")} caracteres)`;

/** Título de una línea: sin límite práctico. */
export const titleText = () => z.string().trim().max(TITLE_MAX, { message: tooLong(TITLE_MAX) });
/** Texto largo (descripción, comentario, nota): sin límite práctico. */
export const bodyText = () => z.string().trim().max(BODY_MAX, { message: tooLong(BODY_MAX) });
