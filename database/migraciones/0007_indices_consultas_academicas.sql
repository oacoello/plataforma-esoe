CREATE INDEX clases_por_titular_institucion ON clases (institucion_id, catedratico_id);
CREATE INDEX clases_por_promocion_institucion ON clases (institucion_id, promocion_id);
CREATE INDEX calificaciones_por_estudiante ON calificaciones (estudiante_id, clase_id);
CREATE INDEX asistencia_por_estudiante ON detalle_asistencia (estudiante_id, sesion_id);
CREATE INDEX cuentas_por_usuario ON cuentas_externas (usuario_id, plataforma_id);
