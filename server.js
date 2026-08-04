const express = require('express');
const cors = require('cors');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*' }));

app.get('/stream', (req, res) => {
  const streamUrl = req.query.url;

  if (!streamUrl) {
    return res.status(400).send('URL não informada.');
  }

  let targetUrl;
  try {
    targetUrl = new URL(streamUrl);
  } catch (err) {
    return res.status(400).send('URL inválida.');
  }

  const client = targetUrl.protocol === 'https:' ? https : http;

  const options = {
    hostname: targetUrl.hostname,
    port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
    path: targetUrl.pathname + targetUrl.search,
    method: 'GET',
    headers: {
      'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18',
      'Accept': '*/*',
      'Connection': 'keep-alive',
    },
  };

  const proxyReq = client.request(options, (proxyRes) => {
    const statusCode = proxyRes.statusCode || 500;

    // Se o IPTV retornar erro (como 403), repassa a resposta sem derrubar o servidor
    if (statusCode >= 400) {
      res.status(statusCode);
      return proxyRes.pipe(res);
    }

    const contentType = proxyRes.headers['content-type'] || '';

    // Se for manifesto M3U8, reescreve os links de mídia internos
    if (contentType.includes('mpegurl') || contentType.includes('m3u8') || targetUrl.pathname.endsWith('.m3u8')) {
      let body = '';
      proxyRes.setEncoding('utf8');
      
      proxyRes.on('data', (chunk) => {
        body += chunk;
      });

      proxyRes.on('end', () => {
        const serverProtocol = req.headers['x-forwarded-proto'] || req.protocol;
        const serverHost = req.get('host');
        const proxyBaseUrl = `${serverProtocol}://${serverHost}/stream?url=`;

        const rewrittenManifest = body.split('\n').map(line => {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            const absoluteUrl = new URL(trimmed, targetUrl.href).href;
            return `${proxyBaseUrl}${encodeURIComponent(absoluteUrl)}`;
          }
          return line;
        }).join('\n');

        res.setHeader('Content-Type', 'application/x-mpegURL');
        res.status(200).send(rewrittenManifest);
      });
    } else {
      // Se for segmento de vídeo TS, transmite diretamente
      res.setHeader('Content-Type', contentType || 'video/mp2t');
      proxyRes.pipe(res);
    }
  });

  proxyReq.on('error', (err) => {
    console.error('Erro de Conexão no Proxy:', err.message);
    if (!res.headersSent) {
      res.status(500).send(`Erro de conexão com o IPTV: ${err.message}`);
    }
  });

  proxyReq.end();
});

app.listen(PORT, () => {
  console.log(`Servidor Proxy rodando na porta ${PORT}`);
});
