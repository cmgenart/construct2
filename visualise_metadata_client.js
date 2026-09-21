(function () {
  var el = document.getElementById("build-data");
  if (!el) return;
  var build;
  try {
    build = JSON.parse(el.textContent);
  } catch (e) {
    return;
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function parse721(metadataMin) {
    var root;
    try {
      if (metadataMin && typeof metadataMin === "object") {
        root = metadataMin;
      } else {
        root = JSON.parse(metadataMin || "{}");
      }
    } catch (e) {
      return null;
    }
    var c721 = root && root["721"];
    if (!c721 || typeof c721 !== "object") return null;
    var policies = Object.keys(c721);
    if (!policies.length) return null;
    var policy = policies[0];
    var assets = c721[policy];
    if (!assets || typeof assets !== "object") return null;
    var assetNames = Object.keys(assets);
    if (!assetNames.length) return null;
    var assetName = assetNames[0];
    var inner = assets[assetName];
    return {
      policy: policy,
      assetName: assetName,
      inner: inner && typeof inner === "object" ? inner : {},
    };
  }

  function joinSrc(src) {
    if (src == null) return "";
    if (Array.isArray(src)) return src.join("");
    return String(src);
  }

  function flattenValue(v) {
    if (v == null) return "";
    if (Array.isArray(v)) return v.join("");
    if (typeof v === "object") return JSON.stringify(v, null, 2);
    return String(v);
  }

  function scanExternalLinks(val, found) {
    if (val == null) return;
    if (typeof val === "string") {
      var s = val.toLowerCase();
      if (s.indexOf("ipfs://") >= 0 || s.indexOf("ipfs/") >= 0) found.ipfs = true;
      if (/^https?:\/\//i.test(val) && !/^data:/i.test(val)) found.http = true;
      return;
    }
    if (Array.isArray(val)) {
      val.forEach(function (x) {
        scanExternalLinks(x, found);
      });
      return;
    }
    if (typeof val === "object") {
      Object.keys(val).forEach(function (k) {
        scanExternalLinks(val[k], found);
      });
    }
  }

  function metadataFlags(inner) {
    var found = { ipfs: false, http: false };
    var onchainHtml = false;
    scanExternalLinks(inner, found);
    if (Array.isArray(inner.files)) {
      inner.files.forEach(function (f) {
        var chunkSrc = joinSrc(f && f.src);
        if (chunkSrc.indexOf("data:") === 0) onchainHtml = true;
        scanExternalLinks(chunkSrc, found);
      });
    }
    return {
      onchain: onchainHtml && !found.ipfs && !found.http,
      ipfs: found.ipfs || found.http,
    };
  }

  function dataUriToBlobUrl(link) {
    if (!link || link.indexOf("data:") !== 0) return { url: link, revoke: null };
    var comma = link.indexOf(",");
    if (comma < 0) return { url: link, revoke: null };
    var meta = link.slice(0, comma);
    var body = link.slice(comma + 1);
    try {
      if (/%[0-9A-Fa-f]{2}/.test(body)) body = decodeURIComponent(body);
    } catch (e) {}
    if (typeof window.__advInjectArtConsoleHook === "function") {
      body = window.__advInjectArtConsoleHook(body);
    }
    var mime = "text/html";
    var semi = meta.indexOf(";");
    if (semi > 5) mime = meta.slice(5, semi) || mime;
    var blobUrl = URL.createObjectURL(
      new Blob([body], { type: mime + ";charset=utf-8" }),
    );
    return { url: blobUrl, revoke: blobUrl };
  }

  function byteLength(str) {
    if (!str) return 0;
    try {
      return new TextEncoder().encode(str).length;
    } catch (e) {
      return str.length;
    }
  }

  function poolPmUrl(minStr) {
    if (!minStr) return "";
    return (
      "https://pool.pm/test/metadata?metadata=" +
      encodeURIComponent(minStr).replace(/%/g, "%25")
    );
  }

  function getOutputs() {
    if (build.metadata_outputs && typeof build.metadata_outputs === "object") {
      return build.metadata_outputs;
    }
    if (build.metadata_min || build.metadata) {
      return {
        "metadata.json": {
          pretty: build.metadata || "",
          min: build.metadata_min || build.metadata || "",
          size: build.metadata_size,
        },
      };
    }
    return {};
  }

  function getActiveFile() {
    var select = document.getElementById("meta-file-select");
    if (select && select.value) return select.value;
    if (build.metadata_output_default) return build.metadata_output_default;
    var outputs = getOutputs();
    var keys = Object.keys(outputs);
    if (keys.indexOf("metadata.json") >= 0) return "metadata.json";
    return keys[0] || "metadata.json";
  }

  function getEntry(filename) {
    var outputs = getOutputs();
    return outputs[filename] || outputs[getActiveFile()] || null;
  }

  function updatePoolLink(minStr) {
    var url = poolPmUrl(minStr);
    document.querySelectorAll(".pool-link").forEach(function (a) {
      if (!url) {
        a.setAttribute("hidden", "hidden");
        return;
      }
      a.removeAttribute("hidden");
      a.onclick = function (e) {
        e.preventDefault();
        try {
          window.parent.postMessage(
            { type: "advBuilder:open-external", url: url },
            window.location.origin,
          );
        } catch (err) {
          window.open(url, "_blank", "noopener");
        }
      };
    });
  }

  function renderPreview(filename) {
    var entry = getEntry(filename);
    var mount = document.getElementById("meta-preview-root");
    if (!mount) return;
    var minStr = entry && entry.min ? entry.min : "";
    var parsed = parse721(minStr || "{}");

    if (window.__metaVizBlobRevoke) {
      URL.revokeObjectURL(window.__metaVizBlobRevoke);
      window.__metaVizBlobRevoke = null;
    }
    window.__metaVizSrc = "";
    var frame = document.getElementById("meta-viz-frame");
    if (frame) {
      frame.dataset.mounted = "";
      frame.removeAttribute("src");
    }

    if (!parsed) {
      mount.innerHTML =
        '<p class="preview-empty">Could not parse metadata JSON.</p>';
      return;
    }

    var inner = parsed.inner;
    var flags = metadataFlags(inner);
    var htmlFile = Array.isArray(inner.files)
      ? inner.files.find(function (f) {
          return f && String(f.mediaType || "").indexOf("text/html") >= 0;
        }) || inner.files[0]
      : null;
    var src = htmlFile ? joinSrc(htmlFile.src) : "";
    var fileLabel = htmlFile && htmlFile.name ? htmlFile.name : "";
    var displayName =
      inner.name != null ? flattenValue(inner.name) : parsed.assetName;

    var metaSize = entry && entry.size;
    if (metaSize == null || metaSize <= 0) {
      metaSize = byteLength(minStr);
    }

    var sizeHtml = "";
    if (metaSize > 0) {
      var maxSize = 15400;
      var kb = (metaSize / 1000).toFixed(3);
      var pct = ((metaSize / maxSize) * 100).toFixed(3);
      var overClass = metaSize > maxSize ? " over" : "";
      sizeHtml =
        '<span class="meta-size' +
        overClass +
        '">' +
        kb +
        " kb  (" +
        pct +
        "% of cardano limit)</span>";
    }

    var badges = "";
    if (flags.onchain) {
      badges += '<span class="badge onchain">On-chain</span>' + sizeHtml;
    } else if (sizeHtml) {
      badges += sizeHtml;
    }
    if (flags.ipfs) badges += '<span class="badge ipfs">IPFS</span>';

    var filesHtml = "";
    if (Array.isArray(inner.files) && inner.files.length) {
      inner.files.forEach(function (f, idx) {
        var chunkSrc = joinSrc(f && f.src);
        var n = f && f.name ? String(f.name) : "file " + (idx + 1);
        var mt = f && f.mediaType ? String(f.mediaType) : "";
        filesHtml +=
          '<div class="field"><div class="field-label">files[' +
          idx +
          "]</div>" +
          '<div class="field-value">' +
          esc(n) +
          (mt ? " · " + esc(mt) : "") +
          "<br>src: " +
          (chunkSrc.length
            ? esc(
                String(chunkSrc.length) +
                  " chars, " +
                  (Array.isArray(f.src) ? f.src.length : 1) +
                  " chunks",
              )
            : "<em>missing</em>") +
          "</div></div>";
      });
    }

    var fieldsHtml = "";
    var skip = { files: 1, name: 1 };
    var priority = ["artist", "description", "website", "properties"];
    var keys = Object.keys(inner).filter(function (k) {
      return !skip[k];
    });
    var ordered = [];
    priority.forEach(function (k) {
      if (keys.indexOf(k) >= 0) ordered.push(k);
    });
    keys.sort().forEach(function (k) {
      if (ordered.indexOf(k) < 0) ordered.push(k);
    });

    ordered.forEach(function (key) {
      var val = inner[key];
      var label = esc(key);
      var body;
      if (
        key === "properties" &&
        val &&
        typeof val === "object" &&
        !Array.isArray(val)
      ) {
        body =
          '<div class="traits">' +
          Object.keys(val)
            .map(function (trait) {
              return (
                '<span class="trait"><b>' +
                esc(trait) +
                "</b>" +
                esc(flattenValue(val[trait])) +
                "</span>"
              );
            })
            .join("") +
          "</div>";
      } else {
        body = '<div class="field-value">' + esc(flattenValue(val)) + "</div>";
      }
      fieldsHtml +=
        '<div class="field"><div class="field-label">' +
        label +
        "</div>" +
        body +
        "</div>";
    });

    var iframeBlock = src
      ? '<div class="viz-frame-wrap"><iframe id="meta-viz-frame" class="viz-frame" sandbox="allow-scripts allow-same-origin"></iframe></div>'
      : '<p class="preview-empty">No HTML file in metadata.</p>';

    mount.innerHTML =
      '<div class="meta-header"><span class="meta-policy">' +
      esc(parsed.policy) +
      "</span>" +
      badges +
      "</div>" +
      '<h1 class="meta-title">' +
      esc(displayName) +
      "</h1>" +
      iframeBlock +
      (fileLabel ? '<p class="file-name">' + esc(fileLabel) + "</p>" : "") +
      '<div class="fields">' +
      filesHtml +
      fieldsHtml +
      "</div>";

    window.__metaVizSrc = src;

    window.__metaMountVizFrame = function () {
      if (!src) return;
      var vizFrame = document.getElementById("meta-viz-frame");
      if (!vizFrame) return;

      var panel = document.querySelector('.panel[data-panel="preview"]');
      if (!panel || !panel.classList.contains("active")) return;

      if (vizFrame.dataset.mounted === "1") {
        if (window.__advVisApplyParams && window.__advVisLastParams) {
          var p = window.__advVisLastParams();
          if (p) window.__advVisApplyParams(p);
        }
        return;
      }

      vizFrame.dataset.mounted = "1";
      var resolved = dataUriToBlobUrl(src);
      if (resolved.revoke) {
        if (window.__metaVizBlobRevoke) URL.revokeObjectURL(window.__metaVizBlobRevoke);
        window.__metaVizBlobRevoke = resolved.revoke;
      }
      vizFrame.src = resolved.url;
      vizFrame.addEventListener(
        "load",
        function () {
          if (window.__advVisApplyParams && window.__advVisLastParams) {
            var params = window.__advVisLastParams();
            if (params) window.__advVisApplyParams(params);
          }
        },
        { once: true },
      );
    };
  }

  function showFile(filename) {
    var entry = getEntry(filename);
    var pretty = entry && entry.pretty ? entry.pretty : "";
    var minStr = entry && entry.min ? entry.min : pretty;
    var rawPre = document.getElementById("meta-raw-pre");
    if (rawPre) rawPre.textContent = pretty || minStr || "";
    updatePoolLink(minStr);
    renderPreview(filename);
    if (window.__metaMountVizFrame) window.__metaMountVizFrame();
  }

  var select = document.getElementById("meta-file-select");
  if (select) {
    select.addEventListener("change", function () {
      showFile(select.value);
    });
  }

  showFile(getActiveFile());
})();
