/* Skills Manager — site behaviour. Everything here is progressive enhancement: the page
   reads, links and downloads correctly without it. */
(() => {
  "use strict";

  document.documentElement.classList.remove("no-js");

  const zh = document.documentElement.lang.toLowerCase().startsWith("zh");
  const t = zh
    ? { copied: "已复制", copyFailed: "复制失败，请手动选择命令", openMenu: "打开菜单", closeMenu: "关闭菜单" }
    : { copied: "Copied", copyFailed: "Copy failed — select the command instead", openMenu: "Open menu", closeMenu: "Close menu" };

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const live = document.querySelector(".sr-live");
  const announce = (text) => { if (live) { live.textContent = ""; requestAnimationFrame(() => { live.textContent = text; }); } };

  /* Header: takes the ink of the chapter under it. Chapters are flat fields marked with
     data-field; the one under the header's lower edge decides, and CSS does the 300ms change. */
  const header = document.querySelector(".site-header");
  const fields = Array.from(document.querySelectorAll("[data-field]"));
  if (header && fields.length) {
    let ticking = false;
    const place = () => {
      ticking = false;
      // One pixel under the header's edge: a chapter scrolled exactly to the top (nav link,
      // scroll-padding) counts as the chapter under the header, sub-pixel rounding aside.
      const y = header.offsetHeight + 1;
      let current = "paper";
      for (const el of fields) {
        const r = el.getBoundingClientRect();
        if (r.top <= y && r.bottom > y) { current = el.dataset.field; break; }
      }
      if (document.documentElement.dataset.hdr !== current) document.documentElement.dataset.hdr = current;
    };
    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(place); } };
    place();
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll);
  }

  /* The footer's language links are the one manual switch: lang.js keeps to the choice. */
  document.querySelectorAll(".footer-langs a").forEach((a) => {
    a.addEventListener("click", () => {
      try { localStorage.setItem("skills-manager-lang", a.lang.toLowerCase().startsWith("zh") ? "zh" : "en"); } catch (e) { /* The link still works. */ }
    });
  });

  /* Mobile navigation. */
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.getElementById("nav");
  if (toggle && nav) {
    const setOpen = (open) => {
      nav.classList.toggle("open", open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? t.closeMenu : t.openMenu);
    };
    toggle.addEventListener("click", () => setOpen(!nav.classList.contains("open")));
    nav.addEventListener("click", (e) => { if (e.target.closest("a")) setOpen(false); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && nav.classList.contains("open")) { setOpen(false); toggle.focus(); } });
    document.addEventListener("click", (e) => {
      if (nav.classList.contains("open") && !nav.contains(e.target) && !toggle.contains(e.target)) setOpen(false);
    });
    window.matchMedia("(min-width: 901px)").addEventListener("change", (e) => { if (e.matches) setOpen(false); });
  }

  /* Not on a Mac: say so next to the download, since the DMG is of no use there. iPadOS
     Safari calls itself a Mac but has a touch screen, which a Mac never does. */
  const platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || "";
  const isMac = /mac/i.test(platform) && !(navigator.maxTouchPoints > 1);
  if (!isMac) document.querySelectorAll("[data-not-mac]").forEach((el) => { el.hidden = false; });

  /* On a Mac whose macOS is too old: say that too. The user agent string froze at 10.15, so
     only browsers that answer the high-entropy hint tell the real version. */
  const MIN_MACOS = 26;
  const oldMac = document.querySelectorAll("[data-old-macos]");
  if (isMac && oldMac.length && navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
    navigator.userAgentData.getHighEntropyValues(["platformVersion"]).then(({ platformVersion }) => {
      const major = parseInt(platformVersion, 10);
      if (!(major > 0 && major < MIN_MACOS)) return;
      oldMac.forEach((el) => {
        el.querySelectorAll("[data-macos-version]").forEach((v) => { v.textContent = major; });
        el.hidden = false;
      });
    }).catch(() => { /* no answer: the page's text still states the requirement */ });
  }

  /* Copy buttons. */
  const copyText = async (text) => {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.cssText = "position:fixed;top:0;left:0;opacity:0";
    document.body.appendChild(area);
    area.select();
    try { if (!document.execCommand("copy")) throw new Error("execCommand"); }
    finally { area.remove(); }
  };
  document.querySelectorAll("[data-copy]").forEach((button) => {
    let timer;
    button.addEventListener("click", async () => {
      try {
        await copyText(button.dataset.copy);
        button.classList.add("copied");
        announce(t.copied);
        clearTimeout(timer);
        timer = setTimeout(() => button.classList.remove("copied"), 1600);
      } catch {
        announce(t.copyFailed);
      }
    });
  });

  /* Latest release: version, direct DMG link and size. The page ships with the release
     current at build time, so this only ever moves it forward. */
  const REPO = "ddhjy/skills-manager-releases";
  const CACHE_KEY = "skills-manager.release";
  const CACHE_TTL = 60 * 60 * 1000;
  const DMG = /^SkillsManager-\d+\.\d+\.\d+\.dmg$/;
  const formatSize = (bytes) => `${(bytes / 1e6).toFixed(1)} MB`;
  const shippedName = document.querySelector("[data-dmg-name]");
  const shipped = ((shippedName && shippedName.textContent.match(/\d+\.\d+\.\d+/)) || [""])[0];
  const applyRelease = (release) => {
    const tag = release.tag_name;
    if (!/^v\d+\.\d+\.\d+$/.test(tag)) return;
    if (shipped && tag.slice(1).localeCompare(shipped, undefined, { numeric: true }) <= 0) return;
    const dmg = (release.assets || []).find((a) => DMG.test(a.name));
    document.querySelectorAll("[data-version]").forEach((el) => { el.textContent = tag; });
    document.querySelectorAll("[data-release-link]").forEach((el) => { if (release.html_url) el.href = release.html_url; });
    if (!dmg) return;
    document.querySelectorAll("[data-download-dmg]").forEach((el) => { el.href = dmg.browser_download_url; });
    document.querySelectorAll("[data-dmg-name]").forEach((el) => { el.textContent = dmg.name; });
    document.querySelectorAll("[data-dmg-size]").forEach((el) => { el.textContent = formatSize(dmg.size); });
  };
  const loadRelease = async () => {
    try {
      const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null");
      if (cached && Date.now() - cached.at < CACHE_TTL) { applyRelease(cached.release); return; }
    } catch { /* ignore a bad cache */ }
    try {
      const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: "application/vnd.github+json" } });
      if (!res.ok) return;
      const release = await res.json();
      applyRelease(release);
      try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), release })); } catch { /* storage full or disabled */ }
    } catch { /* offline: the shipped links still work */ }
  };
  if ("requestIdleCallback" in window) requestIdleCallback(loadRelease, { timeout: 2000 }); else setTimeout(loadRelease, 300);

  /* The agent picker: choose an agent and a skill name, read where the skill goes. The paths
     come from the <option>s, which are the same table the app ships. */
  const select = document.getElementById("agent-select");
  const skillInput = document.getElementById("skill-name");
  const answer = document.getElementById("agent-answer");
  if (select && skillInput && answer) {
    const form = document.getElementById("picker");
    if (form) form.addEventListener("submit", (e) => e.preventDefault());
    const quick = Array.from(document.querySelectorAll(".quick button[data-agent]"));
    const placeholder = (answer.querySelector("[data-ag-project]").textContent.match(/^<[^>]*>/) || ["<project>"])[0];
    const icon = answer.querySelector("[data-ag-icon]");
    const render = () => {
      const opt = select.options[select.selectedIndex];
      if (!opt) return;
      const skill = (skillInput.value.trim().replace(/[\\/\s]+/g, "-").replace(/^-+|-+$/g, "") || "frontend-design").slice(0, 64);
      answer.querySelector("[data-ag-name]").textContent = opt.textContent;
      answer.querySelector("[data-ag-global]").textContent = `~/${opt.dataset.dir}/${skill}`;
      answer.querySelector("[data-ag-lib]").textContent = `~/.skills-manager/skills/${skill}`;
      answer.querySelector("[data-ag-project]").textContent = `${placeholder}/${opt.dataset.project}/${skill}`;
      if (icon) {
        if (opt.dataset.icon) { icon.src = opt.dataset.icon; icon.hidden = false; } else { icon.hidden = true; }
      }
      quick.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.agent === opt.value)));
    };
    select.addEventListener("change", render);
    skillInput.addEventListener("input", render);
    quick.forEach((b) => b.addEventListener("click", () => { select.value = b.dataset.agent; render(); }));
    render();
  }

  /* Entrances: once, when a block comes into view. */
  const revealed = document.querySelectorAll(".reveal");
  if (revealed.length && !reduceMotion.matches && "IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) { entry.target.classList.add("in"); io.unobserve(entry.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    revealed.forEach((el) => io.observe(el));
  } else {
    revealed.forEach((el) => el.classList.add("in"));
  }

  /* A link into a folded block — the agent table — opens it on the way. */
  const unfold = (id) => {
    for (let node = id && document.getElementById(id); node; node = node.parentElement) {
      if (node.tagName === "DETAILS") node.open = true;
    }
  };
  const unfoldHash = () => unfold(decodeURIComponent(location.hash.slice(1)));
  unfoldHash();
  addEventListener("hashchange", unfoldHash);
  /* In-page links: a fixed, short glide however far the target is; with reduced motion it
     simply arrives. */
  let glide = 0;
  document.addEventListener("click", (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = decodeURIComponent(a.getAttribute("href").slice(1));
    unfold(id);
    const target = id && document.getElementById(id);
    if (!target || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    const root = document.documentElement;
    const from = window.scrollY;
    const pad = parseFloat(getComputedStyle(root).scrollPaddingTop) || 0;
    const to = Math.max(0, Math.min(root.scrollHeight - window.innerHeight, from + target.getBoundingClientRect().top - pad));
    if (location.hash !== `#${id}`) history.pushState(null, "", `#${id}`);
    const run = ++glide;
    const start = performance.now();
    const ms = reduceMotion.matches ? 0 : 320;
    const step = (now) => {
      if (run !== glide) return;
      const k = ms ? Math.min(1, (now - start) / ms) : 1;
      window.scrollTo(0, from + (to - from) * (1 - (1 - k) ** 3));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  ["wheel", "touchstart", "keydown"].forEach((type) => addEventListener(type, () => { glide += 1; }, { passive: true }));
})();
