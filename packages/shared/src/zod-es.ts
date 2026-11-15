/**
 * Mensajes de validación en español para todo el sistema (web y API usan la misma
 * copia de Zod). Antes, un campo sin mensaje propio mostraba el de Zod en inglés
 * ("Too small: expected string to have >=1 characters").
 * Los mensajes propios de cada campo siguen ganando; esto cubre lo que no tiene.
 */
import { z } from "zod";

const fmt = (n: unknown) => (typeof n === "number" || typeof n === "bigint" ? Number(n).toLocaleString("es-AR") : String(n));

z.config(z.locales.es());
z.config({
  customError: (iss) => {
    switch (iss.code) {
      case "too_small":
        if (iss.origin === "string") return Number(iss.minimum) <= 1 ? "Completá este campo" : `Tiene que tener al menos ${fmt(iss.minimum)} caracteres`;
        if (iss.origin === "array" || iss.origin === "set") return Number(iss.minimum) <= 1 ? "Agregá al menos uno" : `Agregá al menos ${fmt(iss.minimum)}`;
        if (iss.origin === "number" || iss.origin === "bigint") {
          return iss.inclusive ? `No puede ser menor a ${fmt(iss.minimum)}` : `Tiene que ser mayor a ${fmt(iss.minimum)}`;
        }
        return undefined;
      case "too_big":
        if (iss.origin === "string") return `Máximo ${fmt(iss.maximum)} caracteres`;
        if (iss.origin === "array" || iss.origin === "set") return `Como máximo ${fmt(iss.maximum)}`;
        if (iss.origin === "number" || iss.origin === "bigint") {
          return iss.inclusive ? `No puede ser mayor a ${fmt(iss.maximum)}` : `Tiene que ser menor a ${fmt(iss.maximum)}`;
        }
        return undefined;
      case "invalid_type":
        if (iss.input === undefined || iss.input === null) return "Completá este campo";
        if (iss.expected === "number" || iss.expected === "int") return "Tiene que ser un número";
        return "Dato inválido";
      case "invalid_format":
        if (iss.format === "email") return "Email inválido";
        if (iss.format === "uuid" || iss.format === "guid") return "Elegí una opción de la lista";
        if (iss.format === "date" || iss.format === "datetime") return "Fecha inválida";
        if (iss.format === "url") return "Dirección web inválida";
        return "Formato inválido";
      case "invalid_value":
        return "Elegí una opción de la lista";
      case "not_multiple_of":
        return "Valor inválido";
      case "unrecognized_keys":
        return "Hay datos que no corresponden";
      default:
        return undefined;
    }
  },
});
