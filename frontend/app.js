/* Snip - URL shortener frontend. Vanilla JS + DOM APIs, no build step. */
(function () {
  "use strict";

  const root = document.getElementById("root");

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach((key) => {
      if (key === "class") node.className = attrs[key];
      else if (key.startsWith("on") && typeof attrs[key] === "function") {
        node.addEventListener(key.slice(2).toLowerCase(), attrs[key]);
      } else if (attrs[key] !== undefined && attrs[key] !== null && attrs[key] !== false) {
        node.setAttribute(key, attrs[key]);
      }
    });
    (children || []).forEach((child) => {
      if (child === null || child === undefined || child === false) return;
      node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    });
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  async function api(path, options) {
    const res = await fetch(window.API_BASE_URL + path, options);
    let body = null;
    try {
      body = await res.json();
    } catch (_) {
      body = null;
    }
    if (!res.ok) throw new Error((body && body.error) || "Request failed (" + res.status + ")");
    return body;
  }

  // ---------------------------------------------------------- sparkline
  function Sparkline(clicksByDay) {
    const width = 260;
    const height = 48;
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("width", width);
    svg.setAttribute("height", height);
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

    if (!clicksByDay.length) {
      const text = document.createElementNS(svgNS, "text");
      text.setAttribute("x", 4);
      text.setAttribute("y", height / 2 + 4);
      text.setAttribute("fill", "#9ca3af");
      text.setAttribute("font-size", "12");
      text.textContent = "No clicks yet";
      svg.appendChild(text);
      return svg;
    }

    const max = Math.max(...clicksByDay.map((d) => d.count), 1);
    const barWidth = width / clicksByDay.length;
    clicksByDay.forEach((d, i) => {
      const barHeight = Math.max(2, (d.count / max) * (height - 14));
      const rect = document.createElementNS(svgNS, "rect");
      rect.setAttribute("x", i * barWidth + 2);
      rect.setAttribute("y", height - barHeight - 12);
      rect.setAttribute("width", Math.max(2, barWidth - 4));
      rect.setAttribute("height", barHeight);
      rect.setAttribute("fill", "#0ea5e9");
      rect.setAttribute("rx", "2");
      const title = document.createElementNS(svgNS, "title");
      title.textContent = `${d.day}: ${d.count} click${d.count === 1 ? "" : "s"}`;
      rect.appendChild(title);
      svg.appendChild(rect);

      const label = document.createElementNS(svgNS, "text");
      label.setAttribute("x", i * barWidth + barWidth / 2);
      label.setAttribute("y", height - 2);
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("font-size", "8");
      label.setAttribute("fill", "#9ca3af");
      label.textContent = d.day.slice(5); // MM-DD
      svg.appendChild(label);
    });
    return svg;
  }

  // -------------------------------------------------------------- link card
  function LinkCard(link, onDelete) {
    const wrap = el("div", { class: "link-card" });

    const topRow = el("div", { class: "link-top" }, [
      el("div", {}, [
        el("a", { class: "short-url", href: link.short_url, target: "_blank", rel: "noopener" }, [
          link.short_url.replace(/^https?:\/\//, ""),
        ]),
        el("div", { class: "long-url" }, [link.long_url]),
      ]),
    ]);

    const copyBtn = el("button", { class: "btn btn-sm btn-ghost" }, ["Copy"]);
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(link.short_url);
        copyBtn.textContent = "Copied!";
        copyBtn.classList.add("copied-flag");
      } catch (_) {
        copyBtn.textContent = "Copy failed";
      }
      setTimeout(() => {
        copyBtn.textContent = "Copy";
        copyBtn.classList.remove("copied-flag");
      }, 1500);
    });

    const statsBtn = el("button", { class: "btn btn-sm btn-ghost" }, ["View stats"]);
    const deleteBtn = el("button", { class: "btn btn-sm btn-danger" }, ["Delete"]);
    deleteBtn.addEventListener("click", () => onDelete(link.code));

    topRow.appendChild(el("div", { class: "link-actions" }, [copyBtn, statsBtn, deleteBtn]));
    wrap.appendChild(topRow);

    wrap.appendChild(
      el("div", { class: "link-meta" }, [
        el("span", { class: "click-badge" }, [link.click_count + " click" + (link.click_count === 1 ? "" : "s")]),
        el("span", {}, ["created " + link.created_at.slice(0, 10)]),
      ])
    );

    const sparkWrap = el("div", { class: "sparkline-wrap" });
    let statsLoaded = false;
    statsBtn.addEventListener("click", async () => {
      if (statsLoaded) {
        clear(sparkWrap);
        wrap.removeChild(sparkWrap);
        statsLoaded = false;
        statsBtn.textContent = "View stats";
        return;
      }
      try {
        const data = await api("/api/links/" + link.code + "/stats");
        sparkWrap.appendChild(Sparkline(data.clicks_by_day));
        wrap.appendChild(sparkWrap);
        statsLoaded = true;
        statsBtn.textContent = "Hide stats";
      } catch (err) {
        alert(err.message);
      }
    });

    return wrap;
  }

  // ------------------------------------------------------------------- app
  function App() {
    const container = el("div", { class: "shell" });

    container.appendChild(
      el("div", { class: "hero" }, [
        el("h1", {}, [el("span", { class: "logo-dot" }), "Snip"]),
        el("p", {}, ["Paste a long URL, get a short one, track every click."]),
      ])
    );

    const urlInput = el("input", { type: "text", placeholder: "https://example.com/a/very/long/path?query=1" });
    const aliasInput = el("input", { type: "text", placeholder: "my-link (optional)", maxlength: "32" });
    const submitBtn = el("button", { class: "btn" }, ["Shorten"]);
    const errorBox = el("div");

    const form = el(
      "form",
      {
        class: "shorten-card",
        onSubmit: async (e) => {
          e.preventDefault();
          clear(errorBox);
          submitBtn.setAttribute("disabled", "true");
          submitBtn.textContent = "Shortening...";
          try {
            const payload = { url: urlInput.value.trim() };
            if (aliasInput.value.trim()) payload.custom_alias = aliasInput.value.trim();
            await api("/api/links", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            urlInput.value = "";
            aliasInput.value = "";
            loadLinks();
          } catch (err) {
            errorBox.appendChild(el("div", { class: "error-banner" }, [err.message]));
          } finally {
            submitBtn.removeAttribute("disabled");
            submitBtn.textContent = "Shorten";
          }
        },
      },
      [
        el("div", { class: "shorten-row" }, [urlInput, submitBtn]),
        el("div", { class: "alias-row" }, [
          el("label", {}, ["Custom alias:"]),
          aliasInput,
        ]),
        errorBox,
      ]
    );
    container.appendChild(form);

    container.appendChild(el("div", { class: "links-header" }, [el("h2", {}, ["Your links"])]));
    const listBox = el("div", {}, [el("div", { class: "empty-state" }, ["Loading..."])]);
    container.appendChild(listBox);

    async function deleteLink(code) {
      if (!window.confirm("Delete this short link?")) return;
      try {
        await api("/api/links/" + code, { method: "DELETE" });
        loadLinks();
      } catch (err) {
        alert(err.message);
      }
    }

    async function loadLinks() {
      try {
        const data = await api("/api/links");
        clear(listBox);
        if (!data.links.length) {
          listBox.appendChild(el("div", { class: "empty-state" }, ["No short links yet — create your first one above."]));
          return;
        }
        data.links.forEach((link) => listBox.appendChild(LinkCard(link, deleteLink)));
      } catch (err) {
        clear(listBox);
        listBox.appendChild(el("div", { class: "error-banner" }, [err.message]));
      }
    }

    loadLinks();
    return container;
  }

  root.appendChild(App());
})();
