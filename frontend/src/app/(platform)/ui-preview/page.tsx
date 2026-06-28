import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { FieldError } from "@/components/ui/FieldError";
import { Input } from "@/components/ui/Input";
import { LoadingState } from "@/components/ui/LoadingState";
import { Select } from "@/components/ui/Select";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/Table";

// Superficie de verificacion (R2): NO es una pantalla de producto, solo permite
// QA visual de los primitivos UI con los tokens de tema. Sin logica ni estado.
export default function UiPreviewPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold text-[var(--tx)]">Primitivos UI (verificación)</h1>

      <Card className="flex flex-col gap-4">
        <h2 className="text-base font-semibold text-[var(--tx)]">Campos y acciones</h2>
        <Input placeholder="Campo de texto" />
        <Select defaultValue="a">
          <option value="a">Opción A</option>
          <option value="b">Opción B</option>
        </Select>
        <div className="flex gap-3">
          <Button type="button">Acción primaria</Button>
          <Button type="button" disabled>
            Deshabilitado
          </Button>
        </div>
        <FieldError message="Mensaje de error de ejemplo" />
        <LoadingState />
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-[var(--tx)]">Estados (Badge)</h2>
        <div className="flex flex-wrap gap-2">
          <Badge tone="neutral">Neutral</Badge>
          <Badge tone="accent">Acento</Badge>
          <Badge tone="ok">OK</Badge>
          <Badge tone="info">Info</Badge>
          <Badge tone="warn">Aviso</Badge>
          <Badge tone="danger">Peligro</Badge>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-base font-semibold text-[var(--tx)]">Tabla</h2>
        <Table>
          <THead>
            <Tr>
              <Th>Nombre</Th>
              <Th>Estado</Th>
            </Tr>
          </THead>
          <TBody>
            <Tr>
              <Td>Fila uno</Td>
              <Td>
                <Badge tone="ok">Activo</Badge>
              </Td>
            </Tr>
            <Tr>
              <Td>Fila dos</Td>
              <Td>
                <Badge tone="warn">Pendiente</Badge>
              </Td>
            </Tr>
          </TBody>
        </Table>
      </Card>

      <EmptyState title="Sin resultados" description="No hay elementos para mostrar." />
    </div>
  );
}
