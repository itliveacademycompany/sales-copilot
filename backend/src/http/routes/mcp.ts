import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { mcpServerYasa } from '../../mcp/server.js';
import { publicUrl } from '../../mcp/oauth.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * /mcp — Streamable HTTP (MCP spec 2025-06-18), STATELESS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Har POST — mustaqil: o'sha foydalanuvchi uchun yangi server, javob JSON.
 * Sessiya (Mcp-Session-Id) va SSE oqimi kerak emas: vositalar qisqa,
 * server bildirishnoma yubormaydi. Shu tufayli bir nechta backend nusxasi
 * orasida holat bo'lishish muammosi umuman yo'q.
 *
 * Token yo'q yoki yaroqsiz — 401 + `WWW-Authenticate` (RFC 9728): Claude shu
 * sarlavhadan avtorizatsiya serverini topadi va ulanish oqimini boshlaydi.
 */

function ruxsatSora(reply: FastifyReply) {
  reply
    .status(401)
    .header('WWW-Authenticate', `Bearer resource_metadata="${publicUrl()}/.well-known/oauth-protected-resource/mcp"`)
    .send({ error: 'invalid_token', error_description: 'Sotuv Intellekti\'ga Claude ulanishi orqali kiring' });
}

export function registerMcpRoutes(app: FastifyInstance): void {
  app.post('/mcp', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.oauth || !req.auth || !req.bearerToken) return ruxsatSora(reply);

    const server = mcpServerYasa({ app, token: req.bearerToken, auth: req.auth, oauth: req.oauth });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });

    // Javobni SDK yozadi — Fastify unga tegmasin. CORS sarlavhasi qo'lda:
    // hijack'dan keyin plugin qo'ygan sarlavhalar xom javobga tushmaydi.
    reply.hijack();
    if (req.headers.origin) {
      reply.raw.setHeader('Access-Control-Allow-Origin', req.headers.origin);
      reply.raw.setHeader('Vary', 'Origin');
    }
    reply.raw.on('close', () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req.raw, reply.raw, req.body);
    } catch (err) {
      req.log.error({ err }, 'mcp: so\'rovni qayta ishlashda xato');
      if (!reply.raw.headersSent) {
        reply.raw.writeHead(500, { 'content-type': 'application/json' });
        reply.raw.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: 'Ichki xato' }, id: null }));
      }
    }
  });

  // Stateless rejim: SSE oqimi va sessiyani yopish yo'q (spec bo'yicha 405).
  const yoq = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.oauth) return ruxsatSora(reply);
    reply.status(405).header('Allow', 'POST').send({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed' }, id: null });
  };
  app.get('/mcp', yoq);
  app.delete('/mcp', yoq);
}
