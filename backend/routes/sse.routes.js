const express = require('express');
const router = express.Router();

const { sendEventToAll, sendEventToUser, addClient, removeClient } = require('../services/sse.service.js');

module.exports = (config, verifyTokenForSSE) => { // config is needed for JWT_SECRET in verifyTokenForSSE

    router.get('/', verifyTokenForSSE, (req, res) => {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'ngrok-skip-browser-warning': 'true'
        });

        const clientId = Date.now() + Math.random();
        const client = { id: clientId, res, userId: req.userId };
        addClient(client);

        sendEventToAll('user_status_changed', { userId: req.userId, status: 'online' });

        res.write(`event: connected\ndata: ${JSON.stringify({ message: 'Connected to SSE stream' })}\n\n`);

        const heartbeatInterval = setInterval(() => {
            try {
                if (res.writableEnded) {
                    clearInterval(heartbeatInterval);
                } else {
                    res.write('event: heartbeat\n');
                    res.write(`data: ${JSON.stringify({ timestamp: Date.now() })}\n\n`);
                }
            } catch (e) { 
                clearInterval(heartbeatInterval);
            }
        }, 15000);

        res.setTimeout(0);

        req.on('close', () => {
            removeClient(client);
            clearInterval(heartbeatInterval);
            if (!res.writableEnded) {
                res.end();
            }
        });
    });

    return router;
};