import { NextRequest, NextResponse } from "next/server";
import { ws, Session } from "@/lib/api";

export const dynamic = "force-dynamic";

// SEGUNDA escritura permitida en la app: anadir UNA foto a una incidencia.
// El cliente sube varias llamando a esta ruta en serie (una peticion por foto).
// Payload copiado del gestor web de Prinex (add-picture -> addNewElement en
// posventa/js/app.*.js): `picture/addPicture` con la imagen en base64.
const CARPETA_APERTURA = "1"; // TIPOS_CARPETA.APERTURA: fotos de apertura (cliente)
const TIPO_OBJETO_INCIDENCIA = 2; // TIPOS_OBJETO.INCIDENCIA
const MAX_BYTES = 10 * 1024 * 1024; // limite que aplica el gestor

async function countPictures(session: Session, id: string): Promise<number | null> {
  const r = await ws("Document/getDocuments", session, {
    tipoObjetoId: String(TIPO_OBJETO_INCIDENCIA),
    carpetaId: CARPETA_APERTURA,
    objetoId: id,
    obtenerParteAlta: false,
  });
  return Array.isArray(r) ? r.length : null;
}

export async function POST(req: NextRequest) {
  const { session, id, name, mime, base64 } = (await req.json().catch(() => ({}))) as {
    session?: Session;
    id?: string | number;
    name?: string;
    mime?: string;
    base64?: string;
  };
  if (!session?.token_sesion) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (!id || !name || !base64 || !/^image\/(jpeg|jpg|png|gif|webp)$/.test(mime || "")) {
    return NextResponse.json({ error: "Faltan datos o el fichero no es una imagen" }, { status: 400 });
  }
  if ((base64.length * 3) / 4 > MAX_BYTES) {
    return NextResponse.json({ error: "Imagen demasiado grande (máx. 10MB)" }, { status: 413 });
  }

  const before = await countPictures(session, String(id));

  const res = await ws("picture/addPicture", session, {
    picture: base64,
    description: name.replace(/\.[^.]+$/, ""),
    name,
    mime,
    tipoObjetoId: TIPO_OBJETO_INCIDENCIA,
    carpetaId: CARPETA_APERTURA,
    objetoId: String(id),
  }).catch((e) => ({ result: "NOK", description: String(e) }));

  if (res?.result === "NOK" || res?.data?.mensajeSesion) {
    return NextResponse.json(
      { error: res?.description || res?.descriptionNOK || res?.data?.mensajeSesion || "Prinex rechazó la foto", res },
      { status: 400 }
    );
  }

  // Verificacion: debe haber una foto mas en la carpeta
  const after = await countPictures(session, String(id));
  const verified = before != null && after != null ? after > before : null;
  if (verified === false) {
    return NextResponse.json(
      { error: "Prinex respondió pero la foto no aparece en la incidencia", res },
      { status: 502 }
    );
  }
  return NextResponse.json({ ok: true, verified, res });
}
