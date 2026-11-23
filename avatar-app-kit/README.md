# Avatar App Kit de ESOE

Herramienta de servidor para preparar y enviar una solicitud de video con el SDK oficial `@higgsfield/client/v2`. Las credenciales nunca van al navegador.

Desde este directorio:

```bash
npm ci
npm run preparar
npm test
npm run verificar
```

`preparar` muestra el pedido sin llamar a la API ni consumir saldo. El modelo y los parámetros de Seedance reproducen la configuración de la captura proporcionada; su disponibilidad todavía requiere validación con una cuenta autorizada.

Para solicitar un video, configure `HF_CREDENTIALS` mediante las variables seguras del entorno o en `.env.local`, excluido de Git, y ejecute `npm run generar`. El comando puede consumir saldo de la API. No reintenta pedidos automáticamente. Un timeout local no cancela el pedido remoto: consulte su estado en Higgsfield antes de repetirlo. Los enlaces de resultados se guardan en `salidas/`, excluido de Git.

El video preparado no incluye voz ni sincronización de labios. El texto de saludo está en `solicitud.ts`. El audio Helena del trabajo anterior no está disponible y no se ha regenerado. La plataforma usa por ahora lectura opcional del navegador en el panel Asistente ESOE.

El cliente envía `HF_CREDENTIALS` completo en la cabecera `Authorization: Key …`. Así se admite tanto el formato del proveedor como la sustitución segura del proxy del entorno, sin intentar separar una credencial opaca. La cabecera personalizada reemplaza la composición predeterminada del SDK.

La verificación incluye TypeScript estricto, pruebas de validación de respuestas y auditoría de dependencias desde severidad baja. El resultado se interpreta con el contrato V2 instalado: `status`, `request_id` y `video.url`; únicamente se acepta un pedido completado con enlace HTTPS sin credenciales embebidas. El flujo de GitHub Actions ejecuta esta verificación junto con la de la plataforma.

Documentación del proveedor: https://docs.higgsfield.ai y https://www.npmjs.com/package/@higgsfield/client.
