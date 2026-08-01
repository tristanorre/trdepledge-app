import { deleteEquipmentImage, uploadEquipmentImage } from "@/lib/hire/equipment-image";

export const runtime = "nodejs";

// POST   /api/admin/hire/equipment/[id]/flyer   multipart, field "file"
// DELETE /api/admin/hire/equipment/[id]/flyer   no body
//
// The flyer is the spec sheet the card's "View the flyer" link opens. Until
// now it could only be set by a migration, which meant a tool Thomas added
// himself could never have one — and the six seeded ones could never be
// changed without a deploy.
//
// Same machinery as the photo route beside this one; see
// src/lib/hire/equipment-image.ts.

type Ctx = { params: { id: string } };

export async function POST(req: Request, { params }: Ctx) {
  return uploadEquipmentImage(req, params.id, "flyer");
}

export async function DELETE(_req: Request, { params }: Ctx) {
  return deleteEquipmentImage(params.id, "flyer");
}
