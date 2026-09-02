// Helpers servidor para la API de posventa (cliente). SOLO LECTURA.
import crypto from "crypto";

const H = "https://apps.prinex.com";
export const CUPE = `${H}/cupe_backend/api`;
export const WS = `${H}/posventaws_2.0/index.php`;
export const COD_APP = "1053"; // codigo de aplicacion (constante)

export function md5(s: string) {
  return crypto.createHash("md5").update(s).digest("hex");
}

export type Session = {
  email: string;
  token_sesion: string;
  id_actor: string;
  idubapi: string;
  idAgrupacion: string;
  nombre: string;
};

export type SelectedProperty = {
  promocionId: string;
  inmuebleId: string;
  operationId: string;
  inmuebleEspecialId: null;
  uhedit: string;
  cliente: string;
  direccion: string;
};

export function credentials(s: Session) {
  return {
    email: s.email,
    idubapi: s.idubapi,
    idAgrupacion: s.idAgrupacion,
    flagPswEncript: false,
    origen: "SIC",
    usuarioConsulta: true,
    id_actor: s.id_actor,
    token_sesion: s.token_sesion,
    cod_naturaleza_acceso: "A",
  };
}

// Backend de auth/contratos (form-encoded: jsondata={"parametros":{...}})
export async function cupe(path: string, parametros: Record<string, any>) {
  const body = "jsondata=" + encodeURIComponent(JSON.stringify({ parametros }));
  const r = await fetch(`${CUPE}/${path}/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const j = await r.json();
  if (!j?.result?.ok) {
    throw new Error(j?.result?.message || `Error en ${path}`);
  }
  return j.result;
}

// Backend de incidencias (JSON: {credentials, values})
export async function ws(path: string, session: Session, values: any) {
  const r = await fetch(`${WS}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credentials: credentials(session), values }),
    cache: "no-store",
  });
  return r.json();
}

// Whitelist estricta de lectura para el proxy generico.
export const READ_ALLOWED = new Set<string>([
  "Incidence/getIncidences",
  "Incidence/getLogIncidence",
  "Incidence/getIncidenceById",
  "Incidence/getStatusTypes",
  "Document/getDocuments",
  "Document/getDocumentById",
  "Sic/getDatosInmueble",
  "configuracion/obtenerConfiguracion",
]);
