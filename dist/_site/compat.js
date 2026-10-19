(() => {
  'use strict';
  const config = {"name":"Nick Kozyrev","siteTitle":"Desire Design","hideFramerFavicon":true,"contactLabel":"telegram","contactUrl":"https://t.me/desire2223","fixTemplateMenu":true,"fixEmbedVideos":true,"hideListView":true,"hideNewsNavigation":true,"hideFramerBadge":true,"pageTitles":{"/":"Desire Design","/old-home":"Archive — Desire Design","/about":"About — Desire Design","/works/grid":"Desire Design","/works/list":"Desire Design","/news":"News — Desire Design","/categories/branding":"Branding — Desire Design","/categories/motion-direction":"Motion Design — Desire Design","/categories/branding/grid":"Branding — Desire Design","/categories/motion-direction/grid":"Motion Design — Desire Design","/categories/branding/list":"Branding — Desire Design","/categories/motion-direction/list":"Motion Design — Desire Design","/news/digital-poetics":"Digital Poetics — Desire Design","/news/the-aesthetics-of-technology":"The Aesthetics Of Technology — Desire Design","/news/human-machines":"Human Machines — Desire Design","/news/generative-design":"Generative Design — Desire Design","/news/beyond-the-screen":"Beyond The Screen — Desire Design","/news/architecture-in-motion":"Architecture In Motion — Desire Design","/works/fast-bill":"Fast Bill — Desire Design","/works/coffee-owl":"Coffee Owl — Desire Design","/works/kringga-showreel":"Kringga Showreel — Desire Design","/works/trustat":"Trustat — Desire Design","/works/union-studio":"Union Studio — Desire Design","/works/ghost-vpn":"Ghost VPN — Desire Design","/works/rik-showreels":"RIk Showreels — Desire Design","/works/punk-lab":"Punk Lab — Desire Design","/works/midnight-club":"Midnight Club — Desire Design","/works/lightning":"Lightning — Desire Design"},"assetVersion":"d9156a2063ce"};
  const upstream = 'https://framerusercontent.com';
  const originalSite = 'https://desiredesign.framer.website';
  const localize = value => {
    if (typeof value !== 'string') return value;
    const localized = value.replaceAll(upstream, location.origin + '/_framer').replaceAll(originalSite, location.origin);
    if (!config.assetVersion) return localized;
    return localized.replace(/\/_framer\/(?:sites|modules)\/[A-Za-z0-9_./~%-]+\.(?:mjs|js)(?:\?[^"'`\s<>]*)?/g, url => url.includes('portfolio-v=') ? url : url.replace(/(#.*)?$/, (_, fragment = '') => `${url.includes('?') ? '&' : '?'}portfolio-v=${config.assetVersion}${fragment}`));
  };
  function embed(value) {
    if (typeof value !== 'string' || !value.includes('<iframe')) return undefined;
    const match = value.match(/<iframe\b[^>]*\bsrc=["'](https:\/\/kinescope\.io\/embed\/[A-Za-z0-9]+)["']/i);
    return match?.[1];
  }
  const pageTitle = value => config.pageTitles?.[location.pathname.replace(/\/$/, '') || '/'] || config.siteTitle || value;
  window.__portfolio = { localize, embed, pageTitle, videoSource: value => embed(value) ? undefined : localize(value) };

  // Static hosts cannot answer Framer's multi-range query. The entire snapshot is
  // only 138 KB: cache full files once, then return the requested byte slices.
  const nativeFetch = window.fetch.bind(window);
  const collections = new Map();
  window.fetch = async (input, options) => {
    const url = new URL(input instanceof Request ? input.url : input, location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith('/_framer/cms/') || !url.pathname.endsWith('.framercms') || !url.searchParams.has('range')) return nativeFetch(input, options);
    const requested = url.searchParams.get('range');
    url.search = '';
    const key = url.href;
    if (!collections.has(key)) {
      const pending = nativeFetch(key).then(async response => {
        if (!response.ok) throw Error(`Collection request failed: ${response.status}`);
        return new Uint8Array(await response.arrayBuffer());
      }).catch(error => { collections.delete(key); throw error; });
      collections.set(key, pending);
    }
    const bytes = await collections.get(key);
    const ranges = requested.split(',').map(range => {
      if (!/^\d+-\d+$/.test(range)) throw Error('Invalid collection range');
      const [start, end] = range.split('-').map(Number);
      if (end < start || end >= bytes.length || !Number.isSafeInteger(end)) throw Error('Collection range outside snapshot');
      return bytes.subarray(start, end + 1);
    });
    const result = new Uint8Array(ranges.reduce((total, part) => total + part.length, 0));
    let offset = 0;
    for (const range of ranges) { result.set(range, offset); offset += range.length; }
    return new Response(result, { status: 200, headers: { 'Content-Type': 'application/octet-stream' } });
  };

  if (config.fixEmbedVideos) {
    function repairEmbeds() {
      for (const video of document.querySelectorAll('video[data-portfolio-embed]')) {
        // Linked gallery thumbnails retain their poster and open the project.
        if (video.closest('a') || video.dataset.portfolioRepaired) continue;
        const url = embed(`<iframe src="${video.dataset.portfolioEmbed}">`);
        if (!url) continue;
        video.dataset.portfolioRepaired = 'true';
        const frame = document.createElement('iframe');
        frame.src = url;
        frame.title = 'Project video';
        frame.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media';
        frame.allowFullscreen = true;
        frame.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;';
        video.insertAdjacentElement('afterend', frame);
        video.style.visibility = 'hidden';
      }
    }
    new MutationObserver(repairEmbeds).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-portfolio-embed'] });
  }
})();
