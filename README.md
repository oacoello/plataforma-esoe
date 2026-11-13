# Plataforma ESOE — Sistema de Administración Escolar (SMS)

Plataforma web integral desarrollada para la **Escuela de Suboficiales del Ejército (ESOE)**, enfocada en la gestión administrativa y académica (**SMS - School Management System**), con una base modular preparada para acoplar un **LMS (Learning Management System)** en etapas posteriores.

---

## 1. Paleta de Colores Institucional Aplicada

El sistema visual sigue estrictamente la paleta cromática definida:

* **Olive (`#6B8E5A`):** Acciones primarias, estados activos, aprobaciones (`>= 70%`) y confirmaciones.
* **Choco (`#5B3A2E`):** Navegación lateral, cabeceras estructurales, tipografía principal y jerarquía visual.
* **Beige (`#EADCC8`):** Superficies secundarias, encabezados de tabla, bordes y fondos cálidos de lectura.
* **Rust (`#B85E2E`):** Acentos secundarios, alertas de reprobación (`< 70%`), inasistencias y acciones de cierre.

---

## 2. Reglas de Negocio Implementadas

1. **Modalidades de Periodos Lectivos (4 Opciones Habilitadas):**
   * Semestral (`SEMESTRAL`)
   * Cuatrimestral (`CUATRIMESTRAL`)
   * Modular (`MODULAR`)
   * Año Lectivo Completo (`ANUAL`)
2. **Organización de Estudiantes:**
   * Los estudiantes se agrupan únicamente por **Promoción**.
3. **Asignación de Clases y Catedráticos:**
   * Cada clase (materia + promoción) tiene **1 único catedrático titular**; un catedrático puede impartir varias clases.
4. **Expediente del Estudiante:**
   * Incluye **Código del Alumno** (código numérico manejado a nivel de FFAA), **DNI**, **Condición (Militar / Civil)**, **Grado Militar** (en caso de ser militar), datos personales, tipo de sangre, procedencia y contacto de emergencia.
5. **Expediente del Catedrático:**
   * Incluye **Nombre completo**, **DNI**, **Título académico** y **Grado** (en caso de ser militar).
6. **Control de Asistencia:**
   * Registro de asistencia **por clase y sesión impartida** (`PRESENTE`, `AUSENTE`, `TARDANZA`, `EXCUSA`).
7. **Sistema de Calificaciones:**
   * Escala oficial de **0% a 100%**, con nota mínima aprobatoria de **70%**.

---

## 3. Cómo Probar la Interfaz Ahora Mismo (Sin Servidor)

Puedes abrir el archivo `index.html` directamente haciendo doble clic desde tu explorador de archivos en cualquier navegador moderno (Chrome, Edge, Firefox, Safari). Todos los cambios que realices (crear promociones, registrar alumnos, pasar asistencia o modificar notas) se guardan automáticamente en el almacenamiento local del navegador.

---

## 4. Despliegue en tu Servidor Proxmox (Cuando los Nodos Estén Activos)

1. Crea un contenedor **LXC (Ubuntu 24.04 o Debian 12)** en Proxmox con Docker y Docker Compose instalados.
2. Copia esta carpeta al contenedor (vía SCP/SFTP usando la IP de **Tailscale** de tu nodo).
3. Ejecuta:
   ```bash
   docker compose up -d --build
   ```
4. La plataforma quedará activa en el puerto `8080` con su base de datos PostgreSQL inicializada automáticamente mediante `database/schema.sql`.
