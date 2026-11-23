'use strict';

class AlmacenLimitesPostgres {
  constructor(db, prefijo) {
    this.db = db;
    this.prefix = `esoe:${prefijo}:`;
    this.localKeys = false;
    this.proximaLimpieza = 0;
  }

  init({ windowMs }) {
    this.ventanaMs = windowMs;
  }

  async ejecutar(sql, parametros) {
    try {
      return await this.db.consultar(sql, parametros);
    } catch (cause) {
      const error = new Error('No se pudo comprobar el limite de peticiones.', { cause });
      error.status = 503;
      throw error;
    }
  }

  async increment(clave) {
    if (Date.now() >= this.proximaLimpieza) {
      this.proximaLimpieza = Date.now() + 60000;
      await this.ejecutar('DELETE FROM limites_peticion WHERE vence_en <= CURRENT_TIMESTAMP');
    }
    const { rows } = await this.ejecutar(
      `INSERT INTO limites_peticion (clave,total,vence_en)
       VALUES ($1,1,CURRENT_TIMESTAMP + $2 * INTERVAL '1 millisecond')
       ON CONFLICT (clave) DO UPDATE
         SET total=CASE WHEN limites_peticion.vence_en <= CURRENT_TIMESTAMP THEN 1 ELSE limites_peticion.total+1 END,
             vence_en=CASE WHEN limites_peticion.vence_en <= CURRENT_TIMESTAMP
                          THEN CURRENT_TIMESTAMP + $2 * INTERVAL '1 millisecond' ELSE limites_peticion.vence_en END
       RETURNING total,vence_en`, [this.prefix + clave, this.ventanaMs]);
    const totalHits = Number(rows[0].total);
    if (!Number.isSafeInteger(totalHits) || totalHits < 1) throw new Error('Contador de peticiones invalido.');
    return { totalHits, resetTime: rows[0].vence_en };
  }

  async decrement(clave) {
    await this.ejecutar('UPDATE limites_peticion SET total=GREATEST(0,total-1) WHERE clave=$1', [this.prefix + clave]);
  }

  async resetKey(clave) {
    await this.ejecutar('DELETE FROM limites_peticion WHERE clave=$1', [this.prefix + clave]);
  }
}

module.exports = { AlmacenLimitesPostgres };
