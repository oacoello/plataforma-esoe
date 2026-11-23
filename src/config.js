'use strict';

const VALORES_DE_EJEMPLO = ['esoe_secure_2026', 'esoe_jwt_secret_key_change_in_prod', 'changeme', 'cambiar'];
const CLAVE_CIFRADO_HEX = /^[0-9a-f]{64}$/i;

function leerEntero(valor, porDefecto) {
  const n = Number.parseInt(valor, 10);
  return Number.isFinite(n) && n > 0 ? n : porDefecto;
}

function leerLista(valor) {
  return String(valor || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

function leerEnteroAcotado(env, nombre, porDefecto, minimo, maximo) {
  const valor = env[nombre];
  if (valor === undefined || valor === '') return porDefecto;
  const numero = Number(valor);
  if (!Number.isSafeInteger(numero) || numero < minimo || numero > maximo) {
    const error = new Error(`Configuracion invalida: ${nombre} debe ser un entero entre ${minimo} y ${maximo}.`);
    error.code = 'CONFIG_INVALIDA';
    throw error;
  }
  return numero;
}

function leerBooleano(valor) {
  return ['1', 'true', 'si', 'yes'].includes(String(valor || '').trim().toLowerCase());
}

function dominioDeClerk(llavePublica) {
  const partes = /^pk_(test|live)_(.+)$/.exec(llavePublica || '');
  if (!partes) return '';
  const dominio = Buffer.from(partes[2], 'base64').toString('utf8').replace(/\$$/, '');
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(dominio) ? dominio : '';
}

function cargarConfig(env = process.env) {
  const entorno = env.NODE_ENV || 'development';
  const llavePublica = (env.CLERK_PUBLISHABLE_KEY || '').trim();
  const llaveSecreta = (env.CLERK_SECRET_KEY || '').trim();

  const config = {
    entorno,
    esProduccion: entorno === 'production',
    puerto: leerEntero(env.PORT, 8080),
    host: env.HOST || '0.0.0.0',
    origenesPermitidos: leerLista(env.CORS_ORIGINS),
    proxiesDeConfianza: leerEntero(env.TRUST_PROXY, 0),
    limitePeticiones: {
      ventanaMs: leerEntero(env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
      maximo: leerEntero(env.RATE_LIMIT_MAX, 300),
      maximoPublico: leerEntero(env.RATE_LIMIT_PUBLIC_MAX, 1200),
      almacen: env.RATE_LIMIT_STORE || (entorno === 'production' ? 'postgres' : 'memory')
    },
    databaseUrl: env.DATABASE_URL || '',
    baseDeDatos: {
      max: leerEnteroAcotado(env, 'DB_POOL_MAX', env.VERCEL === '1' ? 2 : 10, 1, 100),
      connectionTimeoutMillis: leerEnteroAcotado(env, 'DB_CONNECTION_TIMEOUT_MS', 3000, 100, 60000),
      idleTimeoutMillis: leerEnteroAcotado(env, 'DB_IDLE_TIMEOUT_MS', 30000, 1000, 600000),
      statement_timeout: leerEnteroAcotado(env, 'DB_STATEMENT_TIMEOUT_MS', 10000, 100, 120000)
    },
    clerk: {
      habilitado: Boolean(llavePublica && llaveSecreta),
      llavePublica,
      llaveSecreta,
      llaveJwt: (env.CLERK_JWT_KEY || '').replace(/\\n/g, '\n').trim(),
      dominio: dominioDeClerk(llavePublica),
      origenesAutorizados: leerLista(env.ORIGEN_PUBLICO)
    },
    integraciones: {
      claveCifrado: (env.CLAVE_CIFRADO || '').trim(),
      permitirRedPrivada: leerBooleano(env.INTEGRACIONES_RED_PRIVADA),
      tiempoMaximoMs: leerEntero(env.INTEGRACIONES_TIEMPO_MS, 10000)
    },
    voz: {
      token: (env.VOZ_TOKEN || '').trim(),
      limiteVerificacion: leerEntero(env.VOZ_LIMITE_VERIFICACION, 120)
    }
  };

  const errores = validarConfig(config);
  if (errores.length > 0) {
    const error = new Error(`Configuracion invalida:\n- ${errores.join('\n- ')}`);
    error.code = 'CONFIG_INVALIDA';
    throw error;
  }
  return Object.freeze(config);
}

function validarConfig(config) {
  const errores = [];
  const { clerk, integraciones } = config;

  if (clerk.llavePublica && !clerk.dominio) {
    errores.push('CLERK_PUBLISHABLE_KEY no tiene el formato esperado (pk_test_... o pk_live_...).');
  }
  if (Boolean(clerk.llavePublica) !== Boolean(clerk.llaveSecreta)) {
    errores.push('CLERK_PUBLISHABLE_KEY y CLERK_SECRET_KEY deben definirse juntas.');
  }
  if (integraciones.claveCifrado && !CLAVE_CIFRADO_HEX.test(integraciones.claveCifrado)) {
    errores.push('CLAVE_CIFRADO debe tener 64 caracteres hexadecimales (openssl rand -hex 32).');
  }
  if (config.voz.token && config.voz.token.length < 32) {
    errores.push('VOZ_TOKEN debe tener al menos 32 caracteres (openssl rand -hex 32).');
  }
  if (!['memory', 'postgres'].includes(config.limitePeticiones.almacen)) {
    errores.push('RATE_LIMIT_STORE debe ser memory o postgres.');
  }
  if (!config.esProduccion) return errores;

  if (config.limitePeticiones.almacen !== 'postgres') {
    errores.push('RATE_LIMIT_STORE debe ser postgres en produccion para compartir las cuotas entre instancias.');
  }

  if (!clerk.habilitado) {
    errores.push('CLERK_PUBLISHABLE_KEY y CLERK_SECRET_KEY son obligatorias en produccion.');
  }
  if (clerk.origenesAutorizados.length === 0) {
    errores.push('ORIGEN_PUBLICO es obligatorio en produccion (por ejemplo https://esoe.ejemplo.hn).');
  }
  for (const origen of clerk.origenesAutorizados) {
    try {
      const url = new URL(origen);
      if (url.protocol !== 'https:' || url.origin !== origen) throw new Error('Origen no canonico.');
    } catch {
      errores.push('ORIGEN_PUBLICO debe contener origenes HTTPS sin rutas, credenciales ni barra final.');
    }
  }
  if (!integraciones.claveCifrado) {
    errores.push('CLAVE_CIFRADO es obligatoria en produccion.');
  }
  if (!config.databaseUrl) {
    errores.push('DATABASE_URL es obligatoria en produccion.');
  } else if (VALORES_DE_EJEMPLO.some((s) => config.databaseUrl.includes(s))) {
    errores.push('DATABASE_URL usa una contrasena de ejemplo; genere una propia.');
  }
  return errores;
}

module.exports = { cargarConfig, validarConfig, dominioDeClerk };
