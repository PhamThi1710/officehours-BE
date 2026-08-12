const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(query.limit, 10) || DEFAULT_LIMIT));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

function toPaginatedResponse({ rows, count }, { page, limit }, mapItem = (item) => item) {
  return {
    items: rows.map(mapItem),
    page,
    limit,
    total: count,
    total_pages: Math.ceil(count / limit),
  };
}

module.exports = { parsePagination, toPaginatedResponse };
