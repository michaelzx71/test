(function () {
  const canvas = document.getElementById("heroCanvas");
  const ctx = canvas && canvas.getContext("2d");
  let width = 0;
  let height = 0;
  let dpr = 1;
  let frame = 0;
  let mouseX = 0.72;
  let mouseY = 0.38;
  const lanes = [];
  const nodes = [];

  function resize() {
    if (!canvas || !ctx) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = canvas.clientWidth || window.innerWidth;
    height = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildScene();
  }

  function buildScene() {
    lanes.length = 0;
    nodes.length = 0;
    const laneCount = Math.max(10, Math.floor(width / 120));
    for (let i = 0; i < laneCount; i += 1) {
      lanes.push({
        x: (i + 0.5) * width / laneCount,
        speed: 0.24 + (i % 5) * 0.045,
        phase: Math.random() * 400,
        color: i % 4 === 0 ? "94,229,255" : (i % 4 === 1 ? "84,230,165" : (i % 4 === 2 ? "255,193,90" : "159,135,255"))
      });
    }
    const nodeCount = Math.max(34, Math.floor(width * height / 36000));
    for (let i = 0; i < nodeCount; i += 1) {
      nodes.push({
        x: Math.random() * width,
        y: Math.random() * height,
        r: 1 + Math.random() * 2.4,
        vx: -0.18 + Math.random() * 0.36,
        vy: -0.12 + Math.random() * 0.24,
        c: i % 5
      });
    }
  }

  function draw() {
    if (!ctx) return;
    frame += 1;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "rgba(2, 4, 10, 0.46)";
    ctx.fillRect(0, 0, width, height);

    const focusX = mouseX * width;
    const focusY = mouseY * height;

    lanes.forEach((lane, index) => {
      const pulseY = (frame * lane.speed + lane.phase) % (height + 180) - 90;
      ctx.strokeStyle = `rgba(${lane.color}, 0.13)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(lane.x, 0);
      ctx.lineTo(lane.x + Math.sin((frame + index * 17) / 80) * 28, height);
      ctx.stroke();

      const grad = ctx.createLinearGradient(lane.x, pulseY - 90, lane.x, pulseY + 90);
      grad.addColorStop(0, `rgba(${lane.color}, 0)`);
      grad.addColorStop(0.5, `rgba(${lane.color}, 0.88)`);
      grad.addColorStop(1, `rgba(${lane.color}, 0)`);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(lane.x, pulseY - 90);
      ctx.lineTo(lane.x + 18, pulseY + 90);
      ctx.stroke();
    });

    nodes.forEach((node, index) => {
      node.x += node.vx + (focusX - width / 2) * 0.000012;
      node.y += node.vy + (focusY - height / 2) * 0.000012;
      if (node.x < -20) node.x = width + 20;
      if (node.x > width + 20) node.x = -20;
      if (node.y < -20) node.y = height + 20;
      if (node.y > height + 20) node.y = -20;

      const palette = [
        "94,229,255",
        "84,230,165",
        "255,193,90",
        "255,107,122",
        "159,135,255"
      ];
      ctx.fillStyle = `rgba(${palette[node.c]}, ${0.28 + Math.sin(frame / 40 + index) * 0.16})`;
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2);
      ctx.fill();
    });

    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i];
        const b = nodes[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 128) continue;
        ctx.strokeStyle = `rgba(94, 229, 255, ${0.12 * (1 - dist / 128)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    ctx.strokeStyle = "rgba(255, 193, 90, 0.32)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 7; i += 1) {
      const x = focusX + Math.cos(frame / 80 + i) * (80 + i * 24);
      const y = focusY + Math.sin(frame / 80 + i) * (44 + i * 20);
      ctx.strokeRect(x - 18, y - 8, 36, 16);
    }

    requestAnimationFrame(draw);
  }

  function setupCanvas() {
    if (!canvas || !ctx) return;
    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", event => {
      mouseX = event.clientX / Math.max(1, window.innerWidth);
      mouseY = event.clientY / Math.max(1, window.innerHeight);
    }, { passive: true });
    requestAnimationFrame(draw);
  }

  function setupReveal() {
    const targets = document.querySelectorAll(".proof-band, .section-heading, .flow-line article, .advantage-card, .fastgpt-visual, .fastgpt-copy, .detail-pages article, .comparison div, .cta-section");
    targets.forEach(target => target.classList.add("reveal"));
    if (!("IntersectionObserver" in window)) {
      targets.forEach(target => target.classList.add("is-visible"));
      return;
    }
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    targets.forEach(target => observer.observe(target));
  }

  setupCanvas();
  setupReveal();
})();
