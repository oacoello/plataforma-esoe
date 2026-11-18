-- SMS-02. Las reglas de la estructura academica tambien en la base: la API las
-- valida primero, y la base las sostiene aunque alguien escriba sin pasar por ella.

ALTER TABLE periodos_lectivos
    ADD CONSTRAINT periodo_fechas_en_orden CHECK (fecha_fin > fecha_inicio);

ALTER TABLE promociones
    ADD CONSTRAINT promocion_anios_en_orden CHECK (anio_egreso >= anio_ingreso AND anio_egreso - anio_ingreso <= 10);

ALTER TABLE materias
    ADD CONSTRAINT materia_unidades_validas CHECK (unidades_valorativas BETWEEN 1 AND 20),
    ADD CONSTRAINT materia_horas_validas CHECK (horas_semanales BETWEEN 1 AND 40);
