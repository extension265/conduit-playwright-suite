// Single place for the two URLs the suite talks to.
// Both can be overridden (e.g. to point at a self-hosted RealWorld backend) without touching code.
const UI_URL = process.env.UI_URL || 'https://conduit.bondaracademy.com';
const API_URL = process.env.API_URL || 'https://conduit-api.bondaracademy.com/api';

module.exports = { UI_URL, API_URL };
