const jwt = require('jsonwebtoken');

module.exports = function(req, res, next) {
    // Get token from the Authorization header
    const authHeader = req.header('Authorization');

    // Check if header exists and is correctly formatted ('Bearer <token>')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'No token, authorization denied.' });
    }

    try {
        // Extract token from 'Bearer <token>'
        const token = authHeader.split(' ')[1];
        
        // Verify the token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Attach the user payload to the request object
        req.user = decoded.user;
        
        // Continue to the next middleware or the route handler
        next();
    } catch (error) {
        res.status(401).json({ message: 'Token is not valid.' });
    }
};
