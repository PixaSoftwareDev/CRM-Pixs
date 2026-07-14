import "server-only"

export type PlaceResult = {
  nombre: string
  sitioWeb?: string
  telefono?: string
  direccion?: string
}

/**
 * Recolección de empresas con OpenStreetMap — datos abiertos (ODbL), gratis y
 * sin API key (§7 Fase 4). Geocodifica la ubicación con Nominatim y consulta
 * negocios con Overpass. Cubre nombre/dirección muy bien; teléfono/web dependen
 * de lo que la comunidad haya cargado (más flojo en Argentina).
 */

const UA = "PixsCRM/1.0 (prospección de leads)"
const NOMINATIM = "https://nominatim.openstreetmap.org/search"
// Varios mirrors de Overpass: si uno está saturado (504), probamos el siguiente.
const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]

/**
 * Mapa de términos comunes (es) → filtros de tag OSM. Si la query cae acá,
 * busca por categoría; si no, cae a búsqueda por nombre.
 */
const CATEGORY_TAGS: Record<string, string> = {
  panaderia: "shop=bakery",
  panaderias: "shop=bakery",
  restaurante: "amenity=restaurant",
  restaurantes: "amenity=restaurant",
  bar: "amenity=bar",
  bares: "amenity=bar",
  cafe: "amenity=cafe",
  cafeteria: "amenity=cafe",
  cafeterias: "amenity=cafe",
  gimnasio: "leisure=fitness_centre",
  gimnasios: "leisure=fitness_centre",
  farmacia: "amenity=pharmacy",
  farmacias: "amenity=pharmacy",
  hotel: "tourism=hotel",
  hoteles: "tourism=hotel",
  ferreteria: "shop=hardware",
  ferreterias: "shop=hardware",
  peluqueria: "shop=hairdresser",
  peluquerias: "shop=hairdresser",
  supermercado: "shop=supermarket",
  supermercados: "shop=supermarket",
  kiosco: "shop=kiosk",
  kioscos: "shop=kiosk",
  veterinaria: "amenity=veterinary",
  veterinarias: "amenity=veterinary",
  dentista: "amenity=dentist",
  odontologo: "amenity=dentist",
  abogado: "office=lawyer",
  abogados: "office=lawyer",
  inmobiliaria: "office=estate_agent",
  inmobiliarias: "office=estate_agent",
  taller: "shop=car_repair",
  talleres: "shop=car_repair",
}

/** Normaliza (sin acentos, minúsculas) para matchear el diccionario. */
function norm(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim()
}

type OverpassResponse = { elements?: Array<{ tags?: Record<string, string> }> }

/** Ejecuta una query Overpass, probando mirrors si alguno está saturado (504). */
async function queryOverpass(ql: string): Promise<OverpassResponse> {
  let lastErr = "sin respuesta"
  for (const url of OVERPASS_MIRRORS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA },
        body: `data=${encodeURIComponent(ql)}`,
        signal: AbortSignal.timeout(30_000),
      })
      // Si está saturado devuelve HTML/504: probamos el siguiente mirror.
      if (!res.ok || !res.headers.get("content-type")?.includes("json")) {
        lastErr = `${url} → ${res.status}`
        continue
      }
      return (await res.json()) as OverpassResponse
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err)
    }
  }
  throw new Error(`Overpass no disponible (${lastErr}). Probá de nuevo en un momento.`)
}

/** Resuelve una ubicación de texto a un bounding box [S, W, N, E] con Nominatim. */
async function geocode(ubicacion: string): Promise<[number, number, number, number] | null> {
  const url = `${NOMINATIM}?format=json&limit=1&q=${encodeURIComponent(ubicacion)}`
  const res = await fetch(url, {
    headers: { "User-Agent": UA, "Accept-Language": "es" },
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) return null
  const data = (await res.json()) as Array<{ boundingbox?: [string, string, string, string] }>
  const bb = data[0]?.boundingbox
  if (!bb) return null
  // Nominatim: [south, north, west, east] → lo pasamos a [S, W, N, E] para Overpass.
  const [south, north, west, east] = bb.map(Number)
  return [south, west, north, east]
}

/**
 * Recolecta empresas. `query` es el rubro/nombre (ej. "panaderías") y `cantidad`
 * el máximo. Requiere una ubicación dentro de la query (ej. "panaderías en Rosario")
 * o resuelve sobre la query completa.
 */
export async function searchPlaces(query: string, cantidad = 20): Promise<PlaceResult[]> {
  // Separa "<rubro> en <ubicación>" si viene con "en".
  const enMatch = query.match(/^(.*?)\s+en\s+(.+)$/i)
  const rubro = (enMatch?.[1] ?? query).trim()
  const ubicacion = (enMatch?.[2] ?? query).trim()

  const bbox = await geocode(ubicacion)
  if (!bbox) throw new Error(`No pude ubicar "${ubicacion}" en el mapa`)
  const [s, w, n, e] = bbox

  const key = norm(rubro)
  const tag = CATEGORY_TAGS[key]

  // Construye el filtro: por categoría si la conocemos, si no por nombre (regex).
  const bboxStr = `(${s},${w},${n},${e})`
  const filtro = tag
    ? `[${tag.replace("=", '="')}"]`
    : `["name"~"${rubro.replace(/["\\]/g, "")}",i]`
  const overpassQL = `
    [out:json][timeout:25];
    (
      node${filtro}${bboxStr};
      way${filtro}${bboxStr};
    );
    out center ${Math.min(cantidad, 50)};
  `.trim()

  const data = await queryOverpass(overpassQL)

  const results: PlaceResult[] = []
  for (const el of data.elements ?? []) {
    const t = el.tags ?? {}
    if (!t.name) continue
    // Dirección a partir de los tags addr:* de OSM.
    const calle = [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(" ")
    const direccion =
      [calle, t["addr:city"], t["addr:state"]].filter(Boolean).join(", ") || undefined
    results.push({
      nombre: t.name,
      sitioWeb: t.website || t["contact:website"] || undefined,
      telefono: t.phone || t["contact:phone"] || undefined,
      direccion,
    })
    if (results.length >= cantidad) break
  }
  return results
}
