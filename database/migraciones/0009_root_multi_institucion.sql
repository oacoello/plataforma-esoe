ALTER TABLE usuarios
    ADD COLUMN es_root BOOLEAN NOT NULL DEFAULT FALSE,
    ADD CONSTRAINT usuarios_root_es_admin CHECK (NOT es_root OR rol = 'ADMIN');
