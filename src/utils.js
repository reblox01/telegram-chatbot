const MAX_LENGTH = 4000;

function sanitizeText(text) {
  if (!text) return '';
  return String(text)
    .replace(/[<>]/g, '') // Remove HTML brackets
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, ''); // Remove control chars
}

function validateInput(text, maxLength = 4000) {
  if (typeof text !== 'string') return false;
  if (text.length === 0 || text.length > maxLength) return false;
  return true;
}

function truncate(text, maxLen = MAX_LENGTH) {
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}

function escapeMarkdown(text) {
  if (!text) return '';
  return String(text).replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

function parseTimeArg(timeStr) {
  if (!timeStr) return null;
  const match = String(timeStr).match(/^(\d+)(s|m|h|d)$/i);
  if (!match) return null;
  
  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  
  const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return value * multipliers[unit];
}

function formatUptime(startMs) {
  const seconds = Math.floor((Date.now() - startMs) / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);
  
  return parts.join(' ');
}

module.exports = { sanitizeText, validateInput, truncate, escapeMarkdown, parseTimeArg, formatUptime };
