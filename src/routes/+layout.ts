// Fully static, client-rendered: the plan lives in localStorage, so there is nothing to
// render on the server. The prerender produces an index.html shell for GitHub Pages.
export const prerender = true;
export const ssr = false;
