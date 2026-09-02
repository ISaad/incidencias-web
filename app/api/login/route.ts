import { NextRequest, NextResponse } from "next/server";
import { cupe, ws, md5, COD_APP, Session } from "@/lib/api";

export const dynamic = "force-dynamic";

// Busca recursivamente todos los objetos que contienen `key`.
function findAll(obj: any, key: string, acc: any[] = []): any[] {
  if (Array.isArray(obj)) obj.forEach((x) => findAll(x, key, acc));
  else if (obj && typeof obj === "object") {
    if (key in obj) acc.push(obj);
    Object.values(obj).forEach((v) => findAll(v, key, acc));
  }
  return acc;
}

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ error: "Email y contraseña requeridos" }, { status: 400 });
    }

    // 1) login_app
    const login = await cupe("CUPE_BKND_WS_Admin/login_app", {
      usermail: email,
      password: md5(password),
      password_esta_encriptada: true,
      cod_app: COD_APP,
      cod_naturaleza_acceso: "A",
    });
    const actor = login?.data?.data?.[0];
    if (!actor?.token_sesion) {
      return NextResponse.json({ error: "Credenciales incorrectas" }, { status: 401 });
    }
    const token_sesion = actor.token_sesion;
    const id_actor = String(actor.ID_ACTOR);
    const nombre = `${actor.NOMBRE_ACTOR ?? ""} ${actor.APELLIDOS_ACTOR ?? ""}`.trim();

    const base = { cod_app: COD_APP, cod_naturaleza_acceso: "A", actor_id: id_actor, id_actor, token_sesion };

    // 2) get_menus_app_movil -> idAgrupacion + idubapi
    const menus = await cupe("CUPE_BKND_WS_SIC/get_menus_app_movil", base);
    const ent = findAll(menus?.data, "ID_ENTORNO_TRABAJO")[0];
    const idAgrupacion = String(ent?.ID_ENTORNO_TRABAJO ?? "");
    const idubapi = String(findAll(ent, "ID_BD_PRINEX")[0]?.ID_BD_PRINEX ?? "");

    const session: Session = { email, token_sesion, id_actor, idubapi, idAgrupacion, nombre };
    const baseA = { ...base, id_agrupacion_bd: idAgrupacion };

    // 3) contratos
    const contratos = await cupe("CUPE_BKND_WS_SIC/get_lista_contratos", baseA);
    const listaContratos = contratos?.data?.data ?? [];

    // 4) por contrato -> inmuebles -> selectedProperty
    const properties: any[] = [];
    for (const c of listaContratos) {
      const info = await cupe("CUPE_BKND_WS_SIC/get_info_contrato", {
        ...baseA,
        filtros: { id_contrato: c.ID_CONTRATO },
      });
      const inmuebles = findAll(info?.data, "COD_INMUEBLE");
      for (const inm of inmuebles) {
        try {
          const dat = await ws("Sic/getDatosInmueble", session, {
            COD_PROMOCION: c.COD_PROMOCION,
            COD_ACTO: c.COD_ACTO,
            COD_INMUEBLE: inm.COD_INMUEBLE,
          });
          const sp = dat?.data?.[0];
          if (!sp?.inmuebleId) continue;
          properties.push({
            label: inm.DESC_INMUEBLE || c.DESC_CONTRATO,
            tipo: inm.COD_TIPO_INMUEBLE || "",
            contrato: c.DESC_CONTRATO || "",
            selectedProperty: {
              promocionId: String(sp.promocionId),
              inmuebleId: String(sp.inmuebleId),
              operationId: String(sp.operacionId ?? sp.operationId),
              inmuebleEspecialId: null,
              uhedit: "",
              cliente: "",
              direccion: "",
            },
          });
        } catch {
          /* inmueble sin datos posventa: ignorar */
        }
      }
    }

    return NextResponse.json({ session, properties });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Error de login" }, { status: 500 });
  }
}
