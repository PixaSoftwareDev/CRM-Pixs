import "server-only"
import { serverEnv } from "@/lib/env"

export type PlaceResult = {
  nombre: string
  sitioWeb?: string
  telefono?: string
  direccion?: string
}

/**
 * Recolección con Google Places API (Text Search New). Devuelve empresas
 * para una query + ubicación (§7 Fase 4). Solo datos profesionales/de empresa.
 */
export async function searchPlaces(query: string, cantidad = 20): Promise<PlaceResult[]> {
  const env = serverEnv()
  if (!env.GOOGLE_PLACES_API_KEY) {
    throw new Error("Falta GOOGLE_PLACES_API_KEY")
  }

  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": env.GOOGLE_PLACES_API_KEY,
      "X-Goog-FieldMask":
        "places.displayName,places.websiteUri,places.nationalPhoneNumber,places.formattedAddress",
    },
    body: JSON.stringify({ textQuery: query, pageSize: Math.min(cantidad, 20) }),
  })

  if (!res.ok) {
    throw new Error(`Google Places respondió ${res.status}: ${await res.text()}`)
  }

  const data = (await res.json()) as {
    places?: Array<{
      displayName?: { text?: string }
      websiteUri?: string
      nationalPhoneNumber?: string
      formattedAddress?: string
    }>
  }

  return (data.places ?? []).map((p) => ({
    nombre: p.displayName?.text ?? "(sin nombre)",
    sitioWeb: p.websiteUri,
    telefono: p.nationalPhoneNumber,
    direccion: p.formattedAddress,
  }))
}
