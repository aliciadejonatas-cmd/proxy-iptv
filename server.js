const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*' }));

app.get('/stream', async (req, res) => {
  const streamUrl = req.query.url;

  if (!streamUrl) {
    return res.status(400).send('URL não informada.');
  }

  try {
    const targetUrl = new URL(streamUrl);

    // Faz a chamada simulando 100% o comportamento do VLC Media Player no Windows
    const response = await fetch(targetUrl.href, {
      method: 'GET',
      headers: {
        'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18',
        'Accept': '*/*',
        'Range': 'bytes=0-',
        'Connection': 'keep-alive',
        'Host': targetUrl.host,
      },
    });

    if (!response.ok) {
      return res.status(response.status).send(`Erro IPTV: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || '';

    // Se for o arquivo de manifesto (.m3u8), reescreve os links internos para passarem por esse proxy
    if (contentType.includes('mpegurl') || contentType.includes('m3u8') || targetUrl.pathname.endsWith('.m3u8')) {
      const manifestText = await response.text();
      const serverProtocol = req.headers['x-forwarded-proto'] || req.protocol;
      const serverHost = req.get('host');
      const proxyBaseUrl = `${serverProtocol}://${serverHost}/stream?url=`;

      const rewrittenManifest = manifestText.split('\n').map(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const absoluteUrl = new URL(trimmed, targetUrl.href).href;
          return `${proxyBaseUrl}${encodeURIComponent(absoluteUrl)}`;
        }
        return line;
      }).join('\n');

      res.setHeader('Content-Type', 'application/x-mpegURL');
      return res.status(200).send(rewrittenManifest);
    }

    // Se for um bloco de vídeo (.ts), repassa o fluxo direto
    res.setHeader('Content-Type', contentType || 'video/mp2t');
    response.body.pipe(res);

  } catch (error) {
    return res.status(500).send(`Erro interno: ${error.message}`);
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
