import { Card } from "@/components/ui"
import type { DocumentEntity } from "@/db/schema"
import { listDocuments } from "@/modules/documents/queries"
import { DocumentsClient } from "./DocumentsClient"

/**
 * Sección de documentos de una entidad (proyecto o cliente). Trae la lista en
 * el server y delega la interacción (subir, ver, descargar, eliminar) al cliente.
 */
export async function DocumentsCard({
  entityType,
  entityId,
}: {
  entityType: DocumentEntity
  entityId: string
}) {
  const docs = await listDocuments(entityType, entityId)
  return (
    <Card>
      <DocumentsClient entityType={entityType} entityId={entityId} initial={docs} />
    </Card>
  )
}
