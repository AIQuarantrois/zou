import { notFound } from "next/navigation";
import { q } from "@/lib/db";
import ProDetail from "./ProDetail";
import type { Pro } from "../shared";

type Params = Promise<{ id: string }>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ProDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const rows = await q(`SELECT p.*, u.email FROM pros p JOIN users u ON u.id = p.user_id WHERE p.id = $1`, [id]);
  const pro = rows[0] as Pro | undefined;
  if (!pro) notFound();
  return <ProDetail initial={pro} />;
}
