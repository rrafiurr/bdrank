(function () {
  'use strict';

  // Resolve the API base from this script's own src so the widget works when
  // the owner copies the snippet from any environment (prod, staging, local).
  var scriptEl = document.currentScript;
  var BASE_URL = '';
  if (scriptEl && scriptEl.src) {
    var m = scriptEl.src.match(/^(https?:\/\/[^\/]+)/);
    if (m) BASE_URL = m[1];
  }

  var BRAND_URL = BASE_URL || 'https://bdranks.com';
  var BRAND    = 'BdRanks';

  // ─── Styles ────────────────────────────────────────────────────────────────

  var CSS = [
    '.bdr-badge{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;',
    'font-size:14px;line-height:1.4;color:#1a1a1a;background:#fff;border:1px solid #e2e8f0;',
    'border-radius:10px;padding:16px 18px;max-width:320px;box-shadow:0 2px 8px rgba(0,0,0,.07);',
    'box-sizing:border-box;}',
    '.bdr-badge *{box-sizing:border-box;margin:0;padding:0;}',
    '.bdr-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;}',
    '.bdr-product{font-weight:600;font-size:15px;color:#1a1a1a;text-decoration:none;}',
    '.bdr-product:hover{text-decoration:underline;}',
    '.bdr-rating-row{display:flex;align-items:center;gap:8px;margin-bottom:8px;}',
    '.bdr-stars{display:flex;gap:2px;}',
    '.bdr-star{font-size:18px;}',
    '.bdr-avg{font-size:22px;font-weight:700;color:#1a1a1a;}',
    '.bdr-count{font-size:12px;color:#64748b;}',
    '.bdr-breakdown{margin-bottom:10px;}',
    '.bdr-bar-row{display:flex;align-items:center;gap:6px;margin-bottom:3px;}',
    '.bdr-bar-label{font-size:11px;color:#64748b;width:10px;text-align:right;flex-shrink:0;}',
    '.bdr-bar-track{flex:1;background:#f1f5f9;border-radius:3px;height:6px;overflow:hidden;}',
    '.bdr-bar-fill{background:#f59e0b;height:6px;border-radius:3px;transition:width .3s;}',
    '.bdr-bar-n{font-size:11px;color:#94a3b8;width:22px;text-align:right;flex-shrink:0;}',
    '.bdr-snippet{border-top:1px solid #f1f5f9;padding-top:10px;margin-top:10px;}',
    '.bdr-snippet-title{font-size:13px;font-weight:500;color:#334155;margin-bottom:2px;',
    'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.bdr-snippet-meta{font-size:11px;color:#94a3b8;}',
    '.bdr-seal{display:flex;align-items:center;justify-content:flex-end;gap:4px;',
    'margin-top:10px;border-top:1px solid #f1f5f9;padding-top:8px;}',
    '.bdr-seal a{font-size:10px;color:#94a3b8;text-decoration:none;font-weight:500;}',
    '.bdr-seal a:hover{color:#64748b;text-decoration:underline;}',
    '.bdr-seal-dot{width:6px;height:6px;background:#22c55e;border-radius:50%;}',
    '.bdr-error{font-size:12px;color:#ef4444;padding:8px 0;}',
  ].join('');

  function injectStyles() {
    if (document.getElementById('bdr-widget-css')) return;
    var s = document.createElement('style');
    s.id = 'bdr-widget-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  // ─── Render helpers ────────────────────────────────────────────────────────

  function stars(avg) {
    var full  = Math.round(avg);
    var html  = '';
    for (var i = 1; i <= 5; i++) {
      html += '<span class="bdr-star" aria-hidden="true">' + (i <= full ? '★' : '☆') + '</span>';
    }
    return '<div class="bdr-stars" role="img" aria-label="' + avg.toFixed(1) + ' out of 5 stars">' + html + '</div>';
  }

  function miniStars(rating) {
    var html = '';
    for (var i = 1; i <= 5; i++) {
      html += '<span style="font-size:11px;color:' + (i <= rating ? '#f59e0b' : '#e2e8f0') + '">' + (i <= rating ? '★' : '★') + '</span>';
    }
    return html;
  }

  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderBadge(data, container) {
    var cfg     = data.config;
    var product = data.product;
    var avg     = data.avg_rating || 0;
    var count   = data.review_count || 0;
    var bd      = data.breakdown || {};
    var latest  = data.latest_review;

    var ratingHTML = '';
    if (cfg.show_rating) {
      ratingHTML  = '<div class="bdr-rating-row">';
      ratingHTML += '<span class="bdr-avg">' + avg.toFixed(1) + '</span>';
      ratingHTML += stars(avg);
      if (cfg.show_count) {
        ratingHTML += '<span class="bdr-count">' + count + ' review' + (count !== 1 ? 's' : '') + '</span>';
      }
      ratingHTML += '</div>';
    } else if (cfg.show_count) {
      ratingHTML = '<div class="bdr-rating-row"><span class="bdr-count">' + count + ' review' + (count !== 1 ? 's' : '') + '</span></div>';
    }

    var breakdownHTML = '';
    if (cfg.show_breakdown && count > 0) {
      breakdownHTML = '<div class="bdr-breakdown">';
      for (var star = 5; star >= 1; star--) {
        var n   = bd[String(star)] || 0;
        var pct = count > 0 ? Math.round((n / count) * 100) : 0;
        breakdownHTML += '<div class="bdr-bar-row">';
        breakdownHTML += '<span class="bdr-bar-label">' + star + '</span>';
        breakdownHTML += '<div class="bdr-bar-track"><div class="bdr-bar-fill" style="width:' + pct + '%"></div></div>';
        breakdownHTML += '<span class="bdr-bar-n">' + n + '</span>';
        breakdownHTML += '</div>';
      }
      breakdownHTML += '</div>';
    }

    var snippetHTML = '';
    if (cfg.show_snippet && latest) {
      snippetHTML  = '<div class="bdr-snippet">';
      snippetHTML += '<div class="bdr-snippet-title">' + esc(latest.title) + '</div>';
      snippetHTML += '<div class="bdr-snippet-meta">' + miniStars(latest.rating) + ' &nbsp;' + esc(latest.date) + '</div>';
      snippetHTML += '</div>';
    }

    var productURL = product.url || (BRAND_URL + '/product/' + product.id);

    container.innerHTML =
      '<div class="bdr-badge">' +
        '<div class="bdr-header">' +
          '<a class="bdr-product" href="' + esc(productURL) + '" target="_blank" rel="noopener noreferrer">' +
            esc(product.name) +
          '</a>' +
        '</div>' +
        ratingHTML +
        breakdownHTML +
        snippetHTML +
        '<div class="bdr-seal">' +
          '<span class="bdr-seal-dot"></span>' +
          '<a href="' + esc(BRAND_URL) + '" target="_blank" rel="noopener noreferrer">Verified by ' + esc(BRAND) + '</a>' +
        '</div>' +
      '</div>';
  }

  function renderError(msg, container) {
    container.innerHTML = '<div class="bdr-badge"><p class="bdr-error">' + esc(msg) + '</p></div>';
  }

  // ─── Bootstrap ────────────────────────────────────────────────────────────

  function loadWidget(token, container) {
    var url = BASE_URL + '/api/v1/widget/' + encodeURIComponent(token);
    fetch(url)
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.error) {
          renderError(data.error === 'not_approved'
            ? 'Widget pending approval'
            : 'Widget unavailable', container);
        } else {
          renderBadge(data, container);
        }
      })
      .catch(function () {
        renderError('Could not load reviews', container);
      });
  }

  function init() {
    injectStyles();
    var scripts = document.querySelectorAll('script[data-bdranks-token]');
    for (var i = 0; i < scripts.length; i++) {
      var token = scripts[i].getAttribute('data-bdranks-token');
      if (!token) continue;
      var wrapper = document.createElement('div');
      scripts[i].parentNode.insertBefore(wrapper, scripts[i]);
      loadWidget(token, wrapper);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
