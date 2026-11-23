CREATE TABLE limites_peticion (
    clave VARCHAR(256) PRIMARY KEY,
    total BIGINT NOT NULL CHECK (total >= 0),
    vence_en TIMESTAMPTZ NOT NULL
);

CREATE INDEX limites_por_vencimiento ON limites_peticion (vence_en);
