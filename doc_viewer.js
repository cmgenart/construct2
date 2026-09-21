(function (global) {
  'use strict';

  const DOCS_PREFIX = '/docs/';
  const DOC_LINK_RE = /^\/docs\/(.+)$/i;
  const RUNTIME_DOC_RE = /^\/runtimes\/(.+\.md)$/i;
  const LIB_DOC_RE = /^\/lib\/(.+\.md)$/i;

  let md = null;
  let customLoader = null;
  let mdFenceDefault = null;
  let mermaidReady = false;
  let backEl = null;
  let titleEl = null;
  let bodyEl = null;
  let backBtn = null;
  let closeBtn = null;
  let history = [];
  let currentRel = '';

  function getMermaidTheme() {
    return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'default';
  }

  function ensureMermaid() {
    const api = global.mermaid;
    if (!api || typeof api.initialize !== 'function') return null;
    const theme = getMermaidTheme();
    if (!mermaidReady || ensureMermaid._theme !== theme) {
      api.initialize({
        startOnLoad: false,
        theme: theme,
        securityLevel: 'strict',
      });
      mermaidReady = true;
      ensureMermaid._theme = theme;
    }
    return api;
  }

  function getMarkdownIt() {
    if (md) return md;
    const factory = global.markdownit || global.markdownIt;
    if (typeof factory !== 'function') return null;
    md = factory({
      html: false,
      linkify: true,
      typographer: true,
      breaks: false,
    });
    mdFenceDefault = md.renderer.rules.fence || function (tokens, idx, options, env, self) {
      return self.renderToken(tokens, idx, options);
    };
    md.renderer.rules.fence = function (tokens, idx, options, env, self) {
      const token = tokens[idx];
      const lang = (token.info || '').trim().split(/\s+/g)[0];
      if (lang === 'mermaid') {
        return '<pre class="mermaid">' + md.utils.escapeHtml(token.content.trim()) + '</pre>\n';
      }
      return mdFenceDefault(tokens, idx, options, env, self);
    };
    return md;
  }

  async function renderMermaidBlocks(container) {
    const api = ensureMermaid();
    if (!api || typeof api.run !== 'function') return;
    const nodes = container.querySelectorAll('pre.mermaid');
    if (!nodes.length) return;
    try {
      await api.run({ nodes: nodes });
    } catch (_) {
      /* mermaid leaves inline error markup on failure */
    }
  }

  function urlForRel(rel) {
    if (!rel) return '';
    const parts = rel.split('/').map(encodeURIComponent);
    if (rel.startsWith('docs/')) return DOCS_PREFIX + parts.slice(1).join('/');
    if (rel.startsWith('runtimes/') || rel.startsWith('lib/')) return '/' + parts.join('/');
    return DOCS_PREFIX + parts.join('/');
  }

  function parseDocHref(href) {
    if (!href) return null;
    const trimmed = href.trim();
    if (/^https?:\/\//i.test(trimmed)) return { kind: 'external', url: trimmed };
    let m = trimmed.match(DOC_LINK_RE);
    if (m) {
      const rel = 'docs/' + m[1];
      return { kind: 'doc', rel: rel, url: urlForRel(rel) };
    }
    m = trimmed.match(RUNTIME_DOC_RE);
    if (m) {
      const rel = 'runtimes/' + m[1];
      return { kind: 'doc', rel: rel, url: urlForRel(rel) };
    }
    m = trimmed.match(LIB_DOC_RE);
    if (m) {
      const rel = 'lib/' + m[1];
      return { kind: 'doc', rel: rel, url: urlForRel(rel) };
    }
    if (/\.md$/i.test(trimmed) && !trimmed.includes('://')) {
      let rel = trimmed.replace(/^\.?\//, '');
      if (!rel.startsWith('docs/') && !rel.startsWith('runtimes/') && !rel.startsWith('lib/')) {
        rel = 'docs/' + rel;
      }
      return { kind: 'doc', rel: rel, url: urlForRel(rel) };
    }
    return null;
  }

  function resolveRelativeDoc(current, href) {
    const parsed = parseDocHref(href);
    if (parsed) return parsed;
    if (!current) return null;
    const baseParts = current.split('/');
    baseParts.pop();
    const hrefParts = href.split('/');
    for (const part of hrefParts) {
      if (part === '' || part === '.') continue;
      if (part === '..') baseParts.pop();
      else baseParts.push(part);
    }
    const rel = baseParts.join('/');
    return {
      kind: 'doc',
      rel: rel,
      url: urlForRel(rel),
    };
  }

  function docTitleFromRel(rel) {
    if (!rel) return 'Documentation';
    const base = rel.split('/').pop() || rel;
    return base.replace(/\.md$/i, '').replace(/[-_]/g, ' ');
  }

  function setBackEnabled() {
    if (backBtn) backBtn.disabled = history.length === 0;
  }

  function closeViewer() {
    if (!backEl) return;
    backEl.classList.remove('open');
    backEl.hidden = true;
    backEl.setAttribute('aria-hidden', 'true');
    history = [];
    currentRel = '';
    setBackEnabled();
  }

  function openViewer() {
    if (!backEl) return;
    backEl.hidden = false;
    backEl.classList.add('open');
    backEl.setAttribute('aria-hidden', 'false');
  }

  function showLoading(title) {
    if (titleEl) titleEl.textContent = title || 'Documentation';
    if (bodyEl) {
      bodyEl.className = 'thin-scroll doc-viewer-loading';
      bodyEl.textContent = 'Loading…';
    }
    openViewer();
  }

  function showError(message) {
    if (bodyEl) {
      bodyEl.className = 'thin-scroll doc-viewer-error';
      bodyEl.textContent = message || 'Could not load document.';
    }
  }

  function renderMarkdown(text) {
    const parser = getMarkdownIt();
    if (!parser) {
      showError('Markdown viewer unavailable (markdown-it not loaded).');
      return;
    }
    bodyEl.className = 'thin-scroll markdown-body';
    bodyEl.innerHTML = parser.render(text);
    renderMermaidBlocks(bodyEl);
  }

  function renderPlain(text) {
    bodyEl.className = 'thin-scroll';
    bodyEl.innerHTML = '<pre class="doc-viewer-plain"></pre>';
    bodyEl.querySelector('.doc-viewer-plain').textContent = text;
  }

  async function loadDoc(url, rel, title, pushHistory) {
    if (pushHistory && currentRel && currentRel !== rel) {
      history.push({ url: urlForRel(currentRel), rel: currentRel, title: titleEl?.textContent || '' });
    }
    currentRel = rel || '';
    setBackEnabled();
    showLoading(title || docTitleFromRel(rel));

    try {
      let text;
      if (typeof customLoader === 'function') {
        text = await customLoader(rel);
      } else {
        const res = await fetch(url);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        text = await res.text();
      }
      if (titleEl) titleEl.textContent = title || docTitleFromRel(rel);
      if (/\.md$/i.test(rel || url)) renderMarkdown(text);
      else renderPlain(text);
    } catch (err) {
      showError('Could not load document: ' + (err.message || String(err)));
    }
  }

  function openDoc(url, opts) {
    opts = opts || {};
    const parsed = parseDocHref(url);
    if (!parsed || parsed.kind !== 'doc') return false;
    loadDoc(parsed.url, parsed.rel, opts.title, opts.pushHistory !== false);
    return true;
  }

  function onViewerLinkClick(ev) {
    const a = ev.target.closest('a[href]');
    if (!a || !bodyEl || !bodyEl.contains(a)) return;
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#')) return;
    const external = /^https?:\/\//i.test(href);
    if (external) {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      return;
    }
    const resolved = resolveRelativeDoc(currentRel, href);
    if (!resolved || resolved.kind !== 'doc') return;
    ev.preventDefault();
    loadDoc(resolved.url, resolved.rel, docTitleFromRel(resolved.rel), true);
  }

  function onDocumentClick(ev) {
    const a = ev.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href || /^https?:\/\//i.test(href)) return;
    let rel = '';
    let fetchUrl = href;
    const parsed = parseDocHref(href);
    if (parsed && parsed.kind === 'doc') {
      rel = parsed.rel;
      fetchUrl = parsed.url;
    } else if (href === '/parameters/DRIVERS_README.txt') {
      rel = 'docs/PARAMETERS.md';
      fetchUrl = '/docs/user/PARAMETERS.md';
    } else return;
    if (!/\.md$/i.test(rel) && rel !== 'DRIVERS_README.txt') return;
    ev.preventDefault();
    const label = (a.textContent || '').trim();
    const title = !label || /^open the full guide$/i.test(label)
      ? docTitleFromRel(rel)
      : label;
    loadDoc(fetchUrl, rel, title, false);
  }

  function initDocViewer() {
    backEl = document.getElementById('doc-viewer-back');
    titleEl = document.getElementById('doc-viewer-title');
    bodyEl = document.getElementById('doc-viewer-body');
    backBtn = document.getElementById('doc-viewer-back-btn');
    closeBtn = document.getElementById('doc-viewer-close');
    if (!backEl || !bodyEl) return;

    closeBtn?.addEventListener('click', closeViewer);
    backBtn?.addEventListener('click', () => {
      const prev = history.pop();
      setBackEnabled();
      if (!prev) return;
      loadDoc(prev.url, prev.rel, prev.title, false);
    });
    backEl.addEventListener('click', (ev) => {
      if (ev.target === backEl) closeViewer();
    });
    bodyEl.addEventListener('click', onViewerLinkClick);
    document.addEventListener('click', onDocumentClick);
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && backEl.classList.contains('open')) closeViewer();
    });
  }

  global.advDocViewer = {
    initDocViewer: initDocViewer,
    openDoc: openDoc,
    closeDocViewer: closeViewer,
    setDocLoader: function (fn) { customLoader = fn; },
  };
  global.initDocViewer = initDocViewer;
  global.openDocViewer = openDoc;
})(typeof window !== 'undefined' ? window : globalThis);
