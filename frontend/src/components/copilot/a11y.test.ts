import assert from "node:assert/strict";
import { test } from "node:test";

import {
  APPROVAL_APPROVE_LABEL,
  APPROVAL_REJECT_LABEL,
  COPILOT_APPROVAL_LABEL,
  COPILOT_TRANSCRIPT_LABEL,
  approvalRegionProps,
} from "@/components/copilot/a11y";

test("approvalRegionProps: región agrupada, enfocable y etiquetada como que requiere aprobación", () => {
  const props = approvalRegionProps();
  assert.equal(props.role, "group");
  assert.equal(props.tabIndex, -1);
  assert.match(props["aria-label"], /aprobación/i);
  assert.equal(props["aria-label"], COPILOT_APPROVAL_LABEL);
});

test("approvalRegionProps: incluye la acción/recurso del plan en la etiqueta cuando existe", () => {
  const props = approvalRegionProps({ actionType: "create", targetResource: "prescriptions" });
  assert.match(props["aria-label"], /aprobación/i);
  assert.match(props["aria-label"], /create → prescriptions/);
});

test("approvalRegionProps: sin plan completo no agrega detalle (no rompe)", () => {
  assert.equal(approvalRegionProps({ actionType: "create" })["aria-label"], COPILOT_APPROVAL_LABEL);
  assert.equal(approvalRegionProps(null)["aria-label"], COPILOT_APPROVAL_LABEL);
});

test("etiquetas en español, no vacías", () => {
  for (const label of [
    COPILOT_TRANSCRIPT_LABEL,
    COPILOT_APPROVAL_LABEL,
    APPROVAL_APPROVE_LABEL,
    APPROVAL_REJECT_LABEL,
  ]) {
    assert.ok(label.trim().length > 0);
  }
});
