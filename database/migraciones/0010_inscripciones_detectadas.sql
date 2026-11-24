ALTER TABLE plataformas_externas
    ADD COLUMN token_servicio_cifrado TEXT,
    ADD COLUMN servicio_configurado_en TIMESTAMPTZ;

CREATE TABLE inscripciones_detectadas (
    plataforma_id UUID NOT NULL REFERENCES plataformas_externas(id) ON DELETE CASCADE,
    usuario_id VARCHAR(64) NOT NULL,
    estado VARCHAR(16) NOT NULL CHECK (estado IN ('INSCRITO', 'NO_INSCRITO')),
    usuario_remoto_id INTEGER,
    nombre_remoto VARCHAR(150),
    coincidencia VARCHAR(16) CHECK (coincidencia IN ('CORREO', 'IDENTIDAD')),
    comprobado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (plataforma_id, usuario_id),
    CHECK (estado = 'NO_INSCRITO' OR (usuario_remoto_id IS NOT NULL AND coincidencia IS NOT NULL))
);

CREATE INDEX inscripciones_por_usuario ON inscripciones_detectadas (usuario_id, comprobado_en DESC);
