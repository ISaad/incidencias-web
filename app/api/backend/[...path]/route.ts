import { NextRequest, NextResponse } from "next/server";
import { ws, READ_ALLOWED, Session } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const path = params.path.join("/");

  // Solo lectura: bloquea cualquier endpoint fuera de la whitelist.
  if (!READ_ALLOWED.has(path)) {
    return NextResponse.json(
      { error: `Endpoint no permitido (app de solo lectura): ${path}` },
      { status: 403 }
    );
  }

  const { session, values } = (await req.json().catch(() => ({}))) as {
    session?: Session;
    values?: any;
  };
  if (!session?.token_sesion) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const data = await ws(path, session, values ?? {});
  return NextResponse.json(data);
}
