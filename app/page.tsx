"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";

type Row = Record<string, any>;
type Property = { label: string; tipo: string; contrato: string; selectedProperty: any };

const EMPTY_VALUES = {
  propertyDevelopment: "", status: "", location: "", profession: "", subprofession: "",
  predefinedIncidence: "", provider: "", orderType: "", vb: 0, complaint: "",
  openDate1: null, openDate2: null, finishDate1: null, finishDate2: null,
  realFinishDate1: null, realFinishDate2: null,
};

const COLS: [string, string][] = [
  ["referencia", "Ref."],
  ["state", "Estado"],
  ["reabierta", "Reab."],
  ["room", "Estancia"],
  ["profession", "Oficio"],
  ["urgencia", "Urgencia"],
  ["tipoSolicitud", "Tipo"],
  ["openDate", "Apertura"],
  ["diasDesdeEnvio", "Días"],
  ["fechaFinPrevisto", "Fin previsto"],
  ["closeDate", "Cierre"],
  ["descProveedor", "Proveedor"],
  ["description", "Descripción"],
];

function badgeClass(s: string) {
  const x = (s || "").toLowerCase();
  if (x.includes("pend")) return "badge pend";
  if (x.includes("proces")) return "badge proc";
  if (x.includes("cerr") || x.includes("final")) return "badge otro";
  return "badge otro";
}
function parseDate(d: string | null): number {
  if (!d) return 0;
  const m = /^(\d{2})-(\d{2})-(\d{4})/.exec(d);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]).getTime();
  const t = Date.parse(d);
  return isNaN(t) ? 0 : t;
}

const DASH = <span className="muted">—</span>;
function renderCell(r: Row, k: string): ReactNode {
  const v = r[k];
  if (k === "state") return <span className={badgeClass(v)}>{v}</span>;
  if (k === "reabierta")
    return String(v) === "1" ? <span className="badge pend">Sí</span> : DASH;
  if (k === "description") return r.description || r.additionalInformation || DASH;
  return v === null || v === undefined || v === "" ? DASH : v;
}

export default function Page() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [propIdx, setPropIdx] = useState(0);

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [state, setState] = useState("");
  const [room, setRoom] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sortKey, setSortKey] = useState("referencia");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);

  // Carga sesion de sessionStorage
  useEffect(() => {
    const s = sessionStorage.getItem("pv_session");
    const p = sessionStorage.getItem("pv_properties");
    if (!s) { router.replace("/login"); return; }
    setSession(JSON.parse(s));
    setProperties(p ? JSON.parse(p) : []);
  }, [router]);

  const load = useCallback(async () => {
    if (!session || !properties.length) return;
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/backend/Incidence/getIncidences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session,
          values: { ...EMPTY_VALUES, selectedProperty: properties[propIdx].selectedProperty },
        }),
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      if (!Array.isArray(j.data)) {
        throw new Error(j.message || "Sesión caducada, vuelve a entrar");
      }
      setRows(j.data);
    } catch (e: any) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [session, properties, propIdx]);

  useEffect(() => { load(); }, [load]);

  const states = useMemo(() => [...new Set(rows.map((r) => r.state).filter(Boolean))].sort(), [rows]);
  const rooms = useMemo(() => [...new Set(rows.map((r) => r.room).filter(Boolean))].sort(), [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const fromT = from ? new Date(from).getTime() : null;
    const toT = to ? new Date(to).getTime() + 86400000 : null;
    let out = rows.filter((r) => {
      if (state && r.state !== state) return false;
      if (room && r.room !== room) return false;
      if (fromT || toT) {
        const t = parseDate(r.openDate);
        if (fromT && t < fromT) return false;
        if (toT && t > toT) return false;
      }
      if (needle) {
        const hay = `${r.referencia} ${r.room} ${r.description || ""} ${r.additionalInformation || ""} ${r.descProveedor || ""} ${r.tipoSolicitud || ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    out = [...out].sort((a, b) => {
      let av = a[sortKey], bv = b[sortKey];
      if (sortKey.toLowerCase().includes("date") || sortKey.startsWith("fecha")) {
        av = parseDate(av); bv = parseDate(bv);
      } else if (av != null && bv != null && !isNaN(+av) && !isNaN(+bv)) {
        av = +av; bv = +bv;
      } else {
        av = (av ?? "").toString().toLowerCase();
        bv = (bv ?? "").toString().toLowerCase();
      }
      return av < bv ? -sortDir : av > bv ? sortDir : 0;
    });
    return out;
  }, [rows, q, state, room, from, to, sortKey, sortDir]);

  function toggleSort(k: string) {
    if (sortKey === k) setSortDir((d) => (d === 1 ? -1 : 1));
    else { setSortKey(k); setSortDir(1); }
  }
  function tableData() {
    return filtered.map((r) => {
      const o: Record<string, any> = {};
      for (const [k, label] of COLS) {
        if (k === "reabierta") o[label] = String(r[k]) === "1" ? "Sí" : "No";
        else if (k === "description") o[label] = r.description || r.additionalInformation || "";
        else o[label] = r[k] ?? "";
      }
      return o;
    });
  }
  function exportXlsx() {
    const ws = XLSX.utils.json_to_sheet(tableData());
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Incidencias");
    XLSX.writeFile(wb, `incidencias_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }
  function exportCsv() {
    const ws = XLSX.utils.json_to_sheet(tableData());
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `incidencias_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }
  function logout() {
    sessionStorage.clear();
    router.replace("/login");
  }

  if (!session) return null;

  return (
    <>
      <header className="top">
        <h1>Incidencias</h1>
        {properties.length > 1 && (
          <select
            className="prop-sel"
            value={propIdx}
            onChange={(e) => setPropIdx(+e.target.value)}
          >
            {properties.map((p, i) => (
              <option key={i} value={i}>{p.label}</option>
            ))}
          </select>
        )}
        <div className="counter">
          {loading ? "cargando…" : <><b>{rows.length}</b> incidencias</>}
        </div>
        <button className="btn ghost" onClick={logout}>Salir</button>
      </header>

      <div className="wrap">
        <div className="toolbar">
          <input type="search" placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={state} onChange={(e) => setState(e.target.value)}>
            <option value="">Estado (todos)</option>
            {states.map((s) => (<option key={s} value={s}>{s}</option>))}
          </select>
          <select value={room} onChange={(e) => setRoom(e.target.value)}>
            <option value="">Estancia (todas)</option>
            {rooms.map((s) => (<option key={s} value={s}>{s}</option>))}
          </select>
          <label className="date">Desde <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="date">Hasta <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <button className="btn sec" onClick={() => { setQ(""); setState(""); setRoom(""); setFrom(""); setTo(""); }}>Limpiar</button>
          {!loading && (
            <span className="filt-note">{filtered.length} de {rows.length}</span>
          )}
          <div className="spacer" />
          <button className="btn sec" onClick={load} title="Refrescar">↻ Refrescar</button>
          <button className="btn" onClick={exportXlsx} disabled={!filtered.length}>Excel</button>
          <button className="btn" onClick={exportCsv} disabled={!filtered.length}>CSV</button>
        </div>

        {loading && <div className="loading">Cargando incidencias…</div>}
        {err && <div className="err">Error: {err}</div>}

        {!loading && !err && (
          <table>
            <thead>
              <tr>
                {COLS.map(([k, label]) => (
                  <th key={k} onClick={() => toggleSort(k)}>
                    {label}{sortKey === k ? (sortDir === 1 ? " ▲" : " ▼") : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  {COLS.map(([k]) => (
                    <td
                      key={k}
                      className={k === "referencia" ? "ref" : k === "description" ? "desc" : undefined}
                    >
                      {renderCell(r, k)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
