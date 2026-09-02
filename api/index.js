// Vercel Serverless Function Entry Point
const app = require('../server/server');

module.exports = (req, res) => {
  if (req.url) {
    if (req.url.startsWith('/api/index.js')) {
      const subPath = req.url.replace('/api/index.js', '');
      req.url = '/api' + (subPath ? (subPath.startsWith('/') || subPath.startsWith('?') ? subPath : '/' + subPath) : '');
    }
  }
  return app(req, res);
};

