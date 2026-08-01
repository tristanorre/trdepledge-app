import { deleteEquipmentImage, uploadEquipmentImage } from "@/lib/hire/equipment-image";

export const runtime = "nodejs";

// POST   /api/admin/hire/equipment/[id]/photo   multipart, field "file"
// DELETE /api/admin/hire/equipment/[id]/photo   no body
//
// One photo per item. Uploading replaces whatever was there; the old blob is
// deleted only AFTER the new one is safely in place. That ordering, the size
// and type limits, and the never-unlink-a-seeded-file rule all live in
// src/lib/hire/equipment-image.ts, shared with the flyer route beside this
// one — see there for why.

type Ctx = { params: { id: string } };

export async function POST(req: Request, { params }: Ctx) {
  return uploadEquipmentImage(req, params.id, "photo");
}

export async function DELETE(_req: Request, { params }: Ctx) {
  return deleteEquipmentImage(params.id, "photo");
}
