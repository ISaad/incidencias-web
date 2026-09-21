import { NextRequest, NextResponse } from "next/server";
import { ws, Session } from "@/lib/api";

export const dynamic = "force-dynamic";

// UNICA escritura permitida en la app: cambiar la descripcion de una incidencia.
// `Incidence/updateIncidence` sobrescribe la incidencia completa, asi que se lee
// el registro actual y se reenvia tal cual cambiando solo `description`.
// Mapeo copiado del gestor web de Prinex (saveIncidencia en posventa/js/app.*.js).
function buildPayload(inc: any, complaint: string[], description: string) {
  const bool01 = (v: any) => (v === true || v === 1 || v === "1" ? 1 : 0);
  return {
    codigoTipoSolicitud: inc.codigoTipoSolicitud,
    answerDate: inc.fechaRespuestaObra,
    approvedAmount: inc.costeAprobado,
    complaint, // ids de tipos de reclamacion; el backend hace foreach, null rompe
    contact: null,
    crearActorRolProveedor: false,
    declinedAmount: inc.costeRechazado,
    description,
    estimatedAmount: inc.costeEstimado,
    fechaReapertura: inc.fechaReapertura,
    finishDateNotification: inc.fechaNotificacionFinPrevisto,
    hours: inc.horas ? inc.horas : null,
    id: inc.id,
    initialFinishDate: inc.fechaFinPrevisto,
    invoiced: inc.facturado,
    notificationDate: inc.fechaAviso,
    obs: inc.observaciones,
    observacionesProveedor: inc.observacionesProveedor,
    orderTypeId: inc.tipoParteId,
    predefinedIncidenceId: inc.incidenciaPredefinidaId,
    proffesion2Id: inc.suboficioId,
    proffesionId: inc.oficioId,
    providerId: inc.proveedorId,
    reabierta: bool01(inc.reabierta),
    realAmount: inc.costeReal,
    realFinishDate: inc.fechaFinReal,
    realFinishDateNotification: inc.fechaNotificacionFinReal,
    recidivist: bool01(inc.reincidente),
    refuseDateNotification: inc.fechaNotificacionRechazo,
    responsableId: inc.responsableId,
    roomId: inc.estanciaId,
    severityId: inc.urgenciaId,
    visitId: inc.visitaId,
    revisada: bool01(inc.Revisada),
    fechaRevision: inc.fechaRevision,
    evaluado: inc.evaluado,
  };
}

function unwrap(r: any) {
  const o = r?.data && !Array.isArray(r.data) && typeof r.data === "object" && "id" in r.data ? r.data : r;
  return Array.isArray(o) ? o[0] : o;
}

async function getById(session: Session, id: string) {
  return unwrap(await ws("Incidence/getIncidenceById", session, { incidenceId: id }));
}

// Tipos de reclamacion actuales (el gestor los reenvia en `complaint`). null si no se pueden leer.
async function getComplaintIds(session: Session, id: string): Promise<string[] | null> {
  const r = await ws("complaintType/getComplaintTypesByIncidence", session, { incidenceId: id });
  const d = r?.data;
  if (!d || typeof d !== "object" || d.mensajeSesion) return null;
  return Object.values(d).map((x: any) => x?.tipoReclamacionId).filter((x) => x != null);
}

// Campos que no deberian cambiar al editar la descripcion.
const IGNORE = new Set(["descripcion", "description", "fechaModificacion", "fechaUltimaModificacion"]);
function diff(a: any, b: any) {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  return [...keys].filter(
    (k) => !IGNORE.has(k) && JSON.stringify(a?.[k]) !== JSON.stringify(b?.[k])
  );
}

export async function POST(req: NextRequest) {
  const { session, id, description, dryRun } = (await req.json().catch(() => ({}))) as {
    session?: Session;
    id?: string | number;
    description?: string;
    dryRun?: boolean;
  };
  if (!session?.token_sesion) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (!id || typeof description !== "string" || !description.trim()) {
    return NextResponse.json({ error: "Faltan id o descripción" }, { status: 400 });
  }

  // 1) Registro actual completo
  const before = await getById(session, String(id));
  if (!before || String(before.id) !== String(id) || !("descripcion" in before)) {
    return NextResponse.json(
      { error: "No se pudo leer la incidencia completa; no se envía nada", raw: before },
      { status: 502 }
    );
  }

  const complaint = await getComplaintIds(session, String(id));
  if (!complaint) {
    return NextResponse.json(
      { error: "No se pudieron leer los tipos de reclamación; no se envía nada" },
      { status: 502 }
    );
  }

  const values = buildPayload(before, complaint, description.trim());
  if (dryRun) return NextResponse.json({ dryRun: true, before, values });

  // 2) Escritura
  const res = await ws("Incidence/updateIncidence", session, values);
  const failed = res?.result === "NOK" || res?.data?.mensajeSesion;

  // 3) Verificacion: releer y comprobar que solo cambio la descripcion (tambien si fallo,
  // por si el backend aplico algo a medias)
  const after = await getById(session, String(id));
  const complaintAfter = await getComplaintIds(session, String(id));
  const changed = diff(before, after);
  if (complaintAfter && JSON.stringify([...complaint].sort()) !== JSON.stringify([...complaintAfter].sort())) {
    changed.push("reclamaciones");
  }
  const report = changed.map((k) =>
    k === "reclamaciones"
      ? { campo: k, antes: complaint, despues: complaintAfter }
      : { campo: k, antes: before[k], despues: after?.[k] }
  );
  if (failed) {
    return NextResponse.json(
      {
        error: res?.description || res?.descriptionNOK || res?.data?.mensajeSesion || "Prinex rechazó el cambio",
        descripcionCambiada: after?.descripcion !== before.descripcion,
        changed: report,
        res,
      },
      { status: 400 }
    );
  }
  if (changed.length) {
    console.warn("[description] campos cambiados inesperadamente", id, changed.map((k) => ({ k, antes: before[k], despues: after?.[k] })));
  }
  return NextResponse.json({
    ok: after?.descripcion === description.trim(),
    descripcion: after?.descripcion,
    changed: report,
    res,
  });
}
