const jwt = require('jsonwebtoken');

module.exports = (config) => {
    const verifyToken = (req, res, next) => {
        let token = req.headers['authorization'];
        if (!token) return res.status(403).json({ auth: false, message: 'No token provided.' });

        if (token.startsWith('Bearer ')) {
            token = token.slice(7);
        }

        jwt.verify(token, config.JWT_SECRET, (err, decoded) => {
            if (err) {
                console.error("[JWT] Verification Error:", err.message);
                return res.status(401).json({ auth: false, message: 'Failed to authenticate token.' });
            }
            req.userId = decoded.id;
            req.username = decoded.username;
            req.userEmail = decoded.email;
            req.userRole = decoded.role;
            next();
        });
    };

    const verifyAdmin = (req, res, next) => {
        if (req.userRole !== 'admin') {
            return res.status(403).json({ message: "صلاحية الوصول مرفوضة. هذه العملية للمسؤول فقط." });
        }
        next();
    };

    return {
        verifyToken,
        verifyAdmin
    };
};
