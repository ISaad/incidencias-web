# Incidencias

Visor web **de solo lectura** para incidencias de posventa.
Mejora la app oficial con listado, filtros, ordenación y exportación.

## Características
- Login con tu cuenta de posventa (el mismo email/contraseña de la app oficial).
- Listado de incidencias con columnas relevantes.
- Filtros: búsqueda, estado, estancia, rango de fechas.
- Ordenación por cualquier columna.
- Refrescar y exportar a **Excel** o **CSV**.
- Selector de propiedad (vivienda, garaje, trastero…).

## Solo lectura
La app **nunca escribe**: un proxy en el servidor solo permite endpoints de lectura.
Cualquier intento de escritura devuelve 403.

## Stack
Next.js (App Router) sobre Vercel. El frontend llama a `/api/*` (mismo origen, sin CORS);
las funciones serverless reenvían al backend. No se guardan credenciales: el login se hace
en tiempo de ejecución y la sesión vive solo en el navegador.

## Desarrollo
```bash
npm install
npm run dev
```
No requiere variables de entorno.
