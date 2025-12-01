const jwt = require('jsonwebtoken');

module.exports = (config) => {
    const verifyTokenForSSE = async (req, res, next) => {
        let token = req.query.token || req.headers['authorization'];
        if (token && token.startsWith('Bearer ')) {
            token = token.slice(7);
        }

        if (!token) {
            res.writeHead(403, { 'Content-Type': 'text/event-stream', 'Connection': 'close' });
            res.write('event: error\n');
            res.write(`data: ${JSON.stringify({ message: "No token provided." })}\n\n`);
            return res.end();
        }

        try {
            const decoded = jwt.verify(token, config.JWT_SECRET);
            req.userId = decoded.id;
            next();
        } catch (err) {
            res.writeHead(401, { 'Content-Type': 'text/event-stream', 'Connection': 'close' });
            res.write('event: error\n');
            res.write(`data: ${JSON.stringify({ message: "Authentication failed." })}\n\n`);
            return res.end();
        }
    };

    return {
        verifyTokenForSSE
    };
};

