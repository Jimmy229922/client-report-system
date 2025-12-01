const multer = require('multer');

const handleUploadErrors = (uploadMiddleware) => (req, res, next) => {
    uploadMiddleware(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            return res.status(400).json({ message: `خطأ في رفع الملف: ${err.message}` });
        } else if (err) {
            return res.status(500).json({ message: `حدث خطأ غير متوقع أثناء الرفع: ${err.message}` });
        }
        next();
    });
};

module.exports = {
    handleUploadErrors
};
