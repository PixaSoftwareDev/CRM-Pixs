/**
 * Script inline que corre sincrónicamente durante el parseo del HTML (antes del
 * primer paint). En el server sale como `text/javascript` para que se ejecute;
 * en el cliente pasa a `text/plain` para que React no lo re-ejecute ni avise por
 * renderizar un <script>. `suppressHydrationWarning` tolera el cambio de type.
 * Ver node_modules/next/dist/docs/.../preventing-flash-before-hydration.md
 */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      // biome-ignore lint/security/noDangerouslySetInnerHtml: script anti-FOUC controlado por nosotros
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
