// Converts [label](https://...) patterns to clickable <a> tags.
// HTML is escaped first so no injection is possible.
export const parseLinks = (text: string): string => {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped.replace(
    /\[([^\]]{1,200})\]\((https?:\/\/[^\s)]{1,500})\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="underline hover:no-underline break-all">$1</a>',
  );
};
