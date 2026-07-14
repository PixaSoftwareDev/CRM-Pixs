import { asset } from "@/lib/basePath"
import { cn } from "@/lib/utils"

/**
 * Identidad de marca Pixs. El wordmark tiene dos archivos (letra negra sobre
 * blanco para light, letra blanca sobre negro para dark) que se intercambian
 * con la variante `dark:`. El isotipo (la "P") sirve igual en ambos temas.
 * Archivos en /public.
 */

export function Wordmark({ className }: { className?: string }) {
  return (
    <>
      {/* biome-ignore lint/performance/noImgElement: logo estático, next/image no aporta acá */}
      <img
        src={asset("/pixs_negra.png")}
        alt="Pixs"
        className={cn("block w-auto dark:hidden", className)}
      />
      {/* biome-ignore lint/performance/noImgElement: idem, variante dark */}
      <img
        src={asset("/pixs_blanca.png")}
        alt="Pixs"
        className={cn("hidden w-auto dark:block", className)}
      />
    </>
  )
}

export function LogoMark({ className }: { className?: string }) {
  return (
    // biome-ignore lint/performance/noImgElement: logo estático, next/image no aporta acá
    <img src={asset("/logo-p.png")} alt="Pixs" className={cn("object-contain", className)} />
  )
}
