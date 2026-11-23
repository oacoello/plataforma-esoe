ALTER TABLE plataformas_externas
    DROP CONSTRAINT plataformas_externas_url_base_key,
    ADD CONSTRAINT plataformas_externas_institucion_url_base_key UNIQUE (institucion_id, url_base);
