// Vercel Serverless Function Entry Point
const app = require('../server/server');

module.exports = (req, res) => {
  if (req.url && req.url.startsWith('/api/index.js')) {
    let subPath = req.url.replace('/api/index.js', '');
    if (subPath.startsWith('?')) {
      try {
        const urlObj = new URL(req.url, 'http://localhost');
        subPath = urlObj.searchParams.get('path') || '';
      } catch (e) {}
    }
    if (subPath && !subPath.startsWith('/')) subPath = '/' + subPath;
    req.url = '/api' + (subPath === '/' ? '' : subPath);
  }
  return app(req, res);
};

