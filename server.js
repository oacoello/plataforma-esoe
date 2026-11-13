const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname)));

// Endpoint de salud para monitoreo en Proxmox / Docker
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'ESOE-SMS-Platform',
    timestamp: new Date().toISOString()
  });
});

// Fallback SPA para navegacion web en cualquier dispositivo
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[ESOE-SMS] Servidor web activo en http://0.0.0.0:${PORT}`);
});
