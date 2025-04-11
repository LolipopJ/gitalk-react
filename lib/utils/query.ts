export const parseSearchQuery = (search: string = location.search) => {
  const query: Record<string, string> = {};
  if (!search) return query;

  const queryString = search[0] === "?" ? search.substring(1) : search;
  queryString.split("&").forEach((queryStr) => {
    const [key, value] = queryStr.split("=");
    if (key) query[decodeURIComponent(key)] = decodeURIComponent(value || "");
  });

  return query;
};

export const stringifySearchQuery = (query: Record<string, string>) => {
  const queryString = Object.keys(query)
    .map((key) => `${key}=${encodeURIComponent(query[key] || "")}`)
    .join("&");
  return queryString;
};
