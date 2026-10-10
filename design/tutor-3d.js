(function () {
  if (customElements.get('tutor-3d')) return;
  const V = '0.169.0';
  let libP;
  const lib = () => libP || (libP = import(`https://esm.sh/three@${V}`).then(async (T) => {
    let RoomEnvironment = null;
    try { RoomEnvironment = (await import(`https://esm.sh/three@${V}/examples/jsm/environments/RoomEnvironment.js`)).RoomEnvironment; } catch (e) {}
    return { T, RoomEnvironment };
  }));

  function radialTex(T, inner, outer) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, inner); gr.addColorStop(1, outer); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

  class Tutor3D extends HTMLElement {
    static get observedAttributes() { return ['pose', 'speaking', 'rleft', 'rright', 'roam', 'size', 'cap', 'accessory', 'acccolor']; }
    constructor() {
      super();
      this.p = { pose: 'explain', speaking: false, rleft: 0, rright: 1, roam: 0.7, size: 1, cap: '', accessory: 'none', acccolor: '' };
      this.attachShadow({ mode: 'open' }).innerHTML = '<style>:host{display:block;position:relative;width:100%;height:100%;pointer-events:none}canvas{display:block;width:100%;height:100%}</style>';
    }
    set(name, v) {
      if (name === 'pose') { const np = v || 'explain'; if (np === 'celebrate' && this.p.pose !== 'celebrate') this.spinT = 0; this.p.pose = np; }
      else if (name === 'cap' || name === 'accessory' || name === 'acccolor') { this.p[name] = v || ''; this.applyLook && this.applyLook(); }
      else if (name === 'speaking') this.p.speaking = v === true || v === 'true' || v === 'on' || v === '';
      else { const n = parseFloat(v); if (!isNaN(n)) this.p[name] = n; }
    }
    attributeChangedCallback(n, o, v) { this.set(n, v); }
    connectedCallback() {
      this.alive = true;
      lib().then((L) => { if (this.alive && !this.r) this.init(L); });
    }
    disconnectedCallback() {
      this.alive = false; cancelAnimationFrame(this.raf);
      this.ro && this.ro.disconnect(); this.io && this.io.disconnect();
      window.removeEventListener('pointermove', this.onMove);
      if (this.r) { this.r.dispose(); this.r.domElement.remove(); this.r = null; }
    }
    init({ T, RoomEnvironment }) {
      const r = this.r = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      r.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
      r.outputColorSpace = T.SRGBColorSpace; r.toneMapping = T.ACESFilmicToneMapping; r.toneMappingExposure = 1.18;
      r.shadowMap.enabled = true; r.shadowMap.type = T.PCFSoftShadowMap;
      this.shadowRoot.appendChild(r.domElement);
      const scene = this.scene = new T.Scene();
      const cam = this.cam = new T.PerspectiveCamera(28, 1, 0.1, 100);
      cam.position.set(0, 0.5, 9); cam.lookAt(0, -0.1, 0);
      if (RoomEnvironment) {
        try { const pm = new T.PMREMGenerator(r); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.55; } catch (e) {}
      }
      scene.add(new T.HemisphereLight(0xffffff, 0xe4e0d8, 1.2));
      const key = new T.DirectionalLight(0xfff5ea, 2.0); key.position.set(2.5, 6, 5); key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048); key.shadow.radius = 8; key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
      Object.assign(key.shadow.camera, { left: -7, right: 7, top: 5, bottom: -5, near: 1, far: 20 });
      scene.add(key);
      const fill = new T.DirectionalLight(0xe9f0ff, 0.6); fill.position.set(-5, 1.5, 3); scene.add(fill);
      const rim = new T.DirectionalLight(0xffffff, 1.4); rim.position.set(-2, 4, -5); scene.add(rim);

      this.groundY = -1.55;
      const blob = this.blob = new T.Mesh(new T.PlaneGeometry(1.9, 1.9), new T.MeshBasicMaterial({ map: radialTex(T, 'rgba(70,64,58,0.5)', 'rgba(70,64,58,0)'), transparent: true, depthWrite: false, toneMapped: false }));
      blob.rotation.x = -Math.PI / 2; blob.position.y = this.groundY + 0.002; scene.add(blob);

      const white = new T.MeshPhysicalMaterial({ color: 0xf7f7f5, roughness: 0.6, sheen: 1, sheenRoughness: 0.5, sheenColor: new T.Color(0xffffff), clearcoat: 0.12, clearcoatRoughness: 0.6 });
      const handMat = white.clone(); handMat.color.set(0xfdfdfc);
      const dark = new T.MeshPhysicalMaterial({ color: 0x131316, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 });
      const ink = new T.MeshStandardMaterial({ color: 0x2c2224, roughness: 0.55 });
      const mouthMat = new T.MeshStandardMaterial({ color: 0x3a2224, roughness: 0.7 });
      const tongueMat = new T.MeshStandardMaterial({ color: 0xe48c88, roughness: 0.6 });
      const cheekMat = new T.MeshBasicMaterial({ map: radialTex(T, 'rgba(250,140,150,0.75)', 'rgba(250,140,150,0)'), transparent: true, depthWrite: false });

      const root = this.root = new T.Group(); scene.add(root);
      const body = this.body = new T.Group(); root.add(body);
      const R = 0.8;
      const g = new T.SphereGeometry(R, 96, 64); const pos = g.attributes.position; const v = new T.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        if (v.y < 0) { const k = 1 + 0.1 * (-v.y / R); v.x *= k; v.z *= k; }
        if (v.y < -0.58) v.y = -0.58 + (v.y + 0.58) * 0.45;
        pos.setXYZ(i, v.x, v.y, v.z);
      }
      g.computeVertexNormals();
      const bodyMesh = new T.Mesh(g, white); bodyMesh.castShadow = true; bodyMesh.receiveShadow = true; body.add(bodyMesh);

      const Z = new T.Vector3(0, 0, 1);
      const place = (m, x, y, off = 0, parent = body) => {
        const z = Math.sqrt(Math.max(0, R * R - x * x - y * y)); const n = new T.Vector3(x, y, z).normalize();
        m.position.copy(n).multiplyScalar(R + off); m.quaternion.setFromUnitVectors(Z, n); parent.add(m); return m;
      };
      const hlMat = new T.MeshBasicMaterial({ color: 0xffffff });
      this.eyes = [-1, 1].map((sx) => { const e = new T.Mesh(new T.SphereGeometry(0.094, 36, 28), dark); e.scale.set(1, 1.1, 0.5); const h1 = new T.Mesh(new T.SphereGeometry(0.03, 16, 12), hlMat); h1.position.set(0.03, 0.035, 0.088); e.add(h1); const h2 = new T.Mesh(new T.SphereGeometry(0.013, 12, 8), hlMat); h2.position.set(-0.03, -0.035, 0.09); e.add(h2); return place(e, sx * 0.205, -0.01, -0.012); });
      this.happyEyes = [-1, 1].map((sx) => { const a = new T.Mesh(new T.TorusGeometry(0.075, 0.022, 10, 28, Math.PI * 0.85), ink); place(a, sx * 0.205, -0.02, 0.004); a.rotateZ(Math.PI * 0.075); a.visible = false; return a; });
      this.sleepEyes = [-1, 1].map((sx) => { const a = new T.Mesh(new T.TorusGeometry(0.07, 0.017, 10, 28, Math.PI * 0.8), ink); place(a, sx * 0.205, 0.01, 0.004); a.rotateZ(Math.PI + Math.PI * 0.1); a.visible = false; return a; });
      const brows = this.brows = new T.Group(); body.add(brows);
      this.browMeshes = []; [-1, 1].forEach((sx) => { const b = new T.Mesh(new T.TorusGeometry(0.05, 0.012, 10, 28, Math.PI * 0.7), ink); place(b, sx * 0.21, 0.16, 0.004, brows); b.rotateZ(Math.PI * 0.15 + sx * -0.1); b.userData.base = b.position.clone(); this.browMeshes.push(b); });
      this.smile = place(new T.Mesh(new T.TorusGeometry(0.048, 0.014, 10, 28, Math.PI * 0.8), ink), 0, -0.13, 0.004); this.smile.rotateZ(-Math.PI * 0.9);
      const open = this.open = new T.Group(); place(open, 0, -0.15, 0.0);
      const om = new T.Mesh(new T.SphereGeometry(0.066, 32, 16), mouthMat); om.scale.set(1.15, 1, 0.45); open.add(om);
      const tg = new T.Mesh(new T.SphereGeometry(0.036, 24, 12), tongueMat); tg.position.set(0, -0.03, 0.012); tg.scale.set(1.2, 0.6, 0.5); open.add(tg);
      [-1, 1].forEach((sx) => place(new T.Mesh(new T.PlaneGeometry(0.26, 0.15), cheekMat), sx * 0.37, -0.1, 0.008));

      const capMat = new T.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.7, sheen: 1, sheenRoughness: 0.5, sheenColor: new T.Color(0xb8c4ff) });
      const tint = (geo, ylo, yhi, c0, c1) => { const p = geo.attributes.position, cols = [], a = new T.Color(c0), b = new T.Color(c1), t = new T.Color(); for (let i = 0; i < p.count; i++) { const k = clamp((p.getY(i) - ylo) / (yhi - ylo), 0, 1); t.copy(a).lerp(b, k); cols.push(t.r, t.g, t.b); } geo.setAttribute('color', new T.Float32BufferAttribute(cols, 3)); return geo; };
      const goldMat = new T.MeshPhysicalMaterial({ color: 0xc9d2ff, roughness: 0.3, metalness: 0.35, clearcoat: 1 });
      const sparkMat = new T.MeshPhysicalMaterial({ color: 0xfbfaff, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05, iridescence: 0.6, iridescenceIOR: 1.4, emissive: 0xffffff, emissiveIntensity: 0.12 });
      const hat = this.hat = new T.Group(); hat.position.set(0.02, -0.02, 0); hat.rotation.set(-0.06, 0, -0.12); body.add(hat);
      const skull = new T.Mesh(tint(new T.CylinderGeometry(0.47, 0.52, 0.24, 64), -0.12, 0.12, 0x3d5ad6, 0x6a4fd0), capMat); skull.position.y = 0.77; skull.castShadow = true; hat.add(skull);
      const board = new T.Mesh(tint(new T.BoxGeometry(1.1, 0.05, 1.1), -0.025, 0.025, 0x5a4cc8, 0x7a5ce0), capMat); board.position.y = 0.91; board.rotation.y = Math.PI / 4; board.castShadow = true; hat.add(board);
      const btn = new T.Mesh(new T.SphereGeometry(0.045, 20, 12), goldMat); btn.position.y = 0.945; btn.scale.y = 0.6; hat.add(btn);
      const cordTop = new T.Mesh(new T.CylinderGeometry(0.011, 0.011, 0.52, 8), goldMat); cordTop.rotation.z = Math.PI / 2; cordTop.position.set(0.26, 0.945, 0.0); hat.add(cordTop);
      const tp = this.tassel = new T.Group(); tp.position.set(0.52, 0.945, 0); hat.add(tp);
      const cord = new T.Mesh(new T.CylinderGeometry(0.011, 0.011, 0.26, 8), goldMat); cord.position.y = -0.13; tp.add(cord);
      const tas = new T.Mesh(new T.CylinderGeometry(0.03, 0.05, 0.13, 16), goldMat); tas.position.y = -0.32; tp.add(tas);
      const sh = new T.Shape(); const k = 0.13, kx = 0.11, c = 0.012, e = 0.05;
      sh.moveTo(0, k); sh.bezierCurveTo(c, e, e, c, kx, 0); sh.bezierCurveTo(e, -c, c, -e, 0, -k); sh.bezierCurveTo(-c, -e, -e, -c, -kx, 0); sh.bezierCurveTo(-e, c, -c, e, 0, k);
      const spark = new T.Mesh(new T.ExtrudeGeometry(sh, { depth: 0.015, curveSegments: 24, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.008, bevelSegments: 6 }), sparkMat);
      spark.position.set(0, 0.77, 0.5); spark.rotation.x = -0.1; hat.add(spark);
      this.tasselSwing = { a: 0, v: 0, b: 0, w: 0 };
      const acc = this.acc = {};
      const frameMat = new T.MeshStandardMaterial({ color: 0x2b2b33, roughness: 0.35, metalness: 0.4 });
      const gl = new T.Group(); body.add(gl);
      [-1, 1].forEach((sx) => place(new T.Mesh(new T.TorusGeometry(0.125, 0.018, 12, 44), frameMat), sx * 0.205, -0.01, 0.035, gl));
      place(new T.Mesh(new T.TorusGeometry(0.045, 0.011, 8, 20, Math.PI), frameMat), 0, 0.0, 0.045, gl);
      acc.glasses = gl;
      const leafMat = new T.MeshPhysicalMaterial({ color: 0x62b46e, roughness: 0.45, sheen: 0.6, sheenColor: new T.Color(0xd8ffd0) });
      const lf = new T.Group();
      const stem = new T.Mesh(new T.CylinderGeometry(0.01, 0.013, 0.13, 8), new T.MeshStandardMaterial({ color: 0x4a7a3a, roughness: 0.6 })); stem.position.y = 0.06; stem.rotation.z = -0.15; lf.add(stem);
      const leaf1 = new T.Mesh(new T.SphereGeometry(0.11, 28, 14), leafMat); leaf1.scale.set(1, 0.2, 0.48); leaf1.position.set(0.09, 0.15, 0); leaf1.rotation.z = 0.55; lf.add(leaf1);
      const leaf2 = new T.Mesh(new T.SphereGeometry(0.08, 24, 12), leafMat); leaf2.scale.set(1, 0.2, 0.5); leaf2.position.set(-0.06, 0.12, 0.02); leaf2.rotation.z = -0.65; lf.add(leaf2);
      lf.position.set(-0.2, 0.935, 0.14); lf.scale.setScalar(1.7); hat.add(lf); acc.leaf = lf;
      const micBody = new T.MeshPhysicalMaterial({ color: 0x3a3a46, roughness: 0.5, sheen: 1, sheenColor: new T.Color(0xffffff), clearcoat: 0.12 });
      const micHead = new T.MeshPhysicalMaterial({ color: 0x5cc4c9, roughness: 0.5, sheen: 1, sheenColor: new T.Color(0xe6fffd), clearcoat: 0.2 });
      const mc = new T.Group();
      const handle = new T.Mesh(new T.CapsuleGeometry(0.048, 0.15, 10, 24), micBody); handle.position.y = 0.0; mc.add(handle);
      const head = new T.Mesh(new T.SphereGeometry(0.1, 36, 24), micHead); head.position.y = 0.2; mc.add(head);
      const ring = new T.Mesh(new T.TorusGeometry(0.058, 0.016, 12, 32), micBody); ring.rotation.x = Math.PI / 2; ring.position.y = 0.125; mc.add(ring);
      mc.position.set(0.02, 0.12, 0.16); mc.rotation.set(0.25, 0, -0.15); mc.scale.setScalar(1.6); acc.mic = mc;
      const bowMat = this.bowMat = new T.MeshPhysicalMaterial({ color: 0x7c5cf2, roughness: 0.5, sheen: 1, sheenColor: new T.Color(0xffffff) });
      const bow = new T.Group();
      [-1, 1].forEach((sx) => { const w = new T.Mesh(new T.ConeGeometry(0.08, 0.15, 24), bowMat); w.rotation.z = sx * Math.PI / 2; w.position.x = sx * 0.08; w.scale.z = 0.5; bow.add(w); });
      const kn = new T.Mesh(new T.SphereGeometry(0.038, 16, 10), bowMat); kn.scale.z = 0.6; bow.add(kn);
      place(bow, 0, -0.4, 0.06); acc.bowtie = bow;
      const hpMat = new T.MeshPhysicalMaterial({ color: 0xe0607a, roughness: 0.4, clearcoat: 0.6, sheen: 0.5, sheenColor: new T.Color(0xffffff) });
      const hp = new T.Group();
      [-1, 1].forEach((sx) => {
        const bud = new T.Group();
        const pod = new T.Mesh(new T.SphereGeometry(0.075, 24, 16), hpMat); pod.scale.set(0.8, 1, 0.8); bud.add(pod);
        const stem = new T.Mesh(new T.CapsuleGeometry(0.026, 0.11, 8, 16), hpMat); stem.position.set(0, -0.11, 0.02); bud.add(stem);
        bud.position.set(sx * 0.84, 0.0, 0.08); bud.rotation.set(0, sx * 0.25, sx * 0.15); bud.scale.setScalar(1.35); hp.add(bud);
      });
      body.add(hp); acc.headphones = hp;
      const scarfMat = new T.MeshPhysicalMaterial({ color: 0xf2b84b, roughness: 0.55, sheen: 0.8, sheenRoughness: 0.4, sheenColor: new T.Color(0xffffff), clearcoat: 0.15 });
      const tie = new T.Group();
      const tk = new T.Mesh(new T.SphereGeometry(0.055, 20, 14), scarfMat); tk.scale.set(1.15, 0.9, 0.55); tie.add(tk);
      const ts = new T.Shape(); ts.moveTo(-0.045, 0); ts.lineTo(0.045, 0); ts.lineTo(0.085, -0.25); ts.lineTo(0, -0.33); ts.lineTo(-0.085, -0.25); ts.closePath();
      const blade = new T.Mesh(new T.ExtrudeGeometry(ts, { depth: 0.01, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 4 }), scarfMat); blade.position.set(0, -0.035, -0.005); tie.add(blade);
      place(tie, 0, -0.36, 0.02); tie.rotateX(-0.12); acc.scarf = tie;
      const pencilMat = new T.MeshPhysicalMaterial({ color: 0x5cc4c9, roughness: 0.5, clearcoat: 0.3 });
      const pc = new T.Group();
      const pbody = new T.Mesh(new T.CylinderGeometry(0.04, 0.04, 0.32, 6), pencilMat); pc.add(pbody);
      const wood = new T.Mesh(new T.ConeGeometry(0.04, 0.09, 6), new T.MeshStandardMaterial({ color: 0xf2d3a0, roughness: 0.8 })); wood.position.y = 0.205; pc.add(wood);
      const lead = new T.Mesh(new T.SphereGeometry(0.014, 10, 8), new T.MeshStandardMaterial({ color: 0x2b2b33, roughness: 0.6 })); lead.position.y = 0.245; pc.add(lead);
      const ferr = new T.Mesh(new T.CylinderGeometry(0.042, 0.042, 0.035, 16), new T.MeshStandardMaterial({ color: 0xd9dbe2, roughness: 0.4, metalness: 0.5 })); ferr.position.y = -0.177; pc.add(ferr);
      const eras = new T.Mesh(new T.CapsuleGeometry(0.04, 0.02, 8, 16), new T.MeshStandardMaterial({ color: 0xf2a0aa, roughness: 0.8 })); eras.position.y = -0.215; pc.add(eras);
      pc.position.set(-0.04, 0.12, 0.14); pc.rotation.set(0.2, 0, 0.3); pc.scale.setScalar(1.3); acc.pencil = pc;
      this.accMats = { glasses: [frameMat, 0x2b2b33], leaf: [leafMat, 0x62b46e], mic: [micHead, 0x5cc4c9], bowtie: [bowMat, 0x7c5cf2], headphones: [hpMat, 0xe0607a], scarf: [scarfMat, 0xf2b84b], pencil: [pencilMat, 0x5cc4c9] };
      const book = this.book = new T.Group();
      const coverMat = new T.MeshPhysicalMaterial({ color: 0x1f8a92, roughness: 0.55, sheen: 0.5 });
      const pageMat = new T.MeshStandardMaterial({ color: 0xfbf8f0, roughness: 0.9 });
      [-1, 1].forEach((sx) => { const half = new T.Group(); half.rotation.z = sx * 0.22; const cv = new T.Mesh(new T.BoxGeometry(0.27, 0.014, 0.36), coverMat); cv.position.x = sx * 0.135; half.add(cv); const pg = new T.Mesh(new T.BoxGeometry(0.25, 0.024, 0.33), pageMat); pg.position.set(sx * 0.128, 0.018, 0); half.add(pg); book.add(half); });
      book.position.set(0, -0.3, 0.98); book.rotation.x = -0.85; book.scale.setScalar(1.25); book.visible = false; root.add(book);

      const mkHand = (side) => {
        const h = new T.Group();
        const m = new T.Mesh(new T.CapsuleGeometry(0.15, 0.06, 12, 28), handMat); m.scale.set(1, 1, 0.74); m.castShadow = true; m.receiveShadow = true; h.add(m);
        const th = new T.Mesh(new T.SphereGeometry(0.07, 24, 16), handMat); th.scale.set(0.85, 1.25, 0.8); th.position.set(-side * 0.135, -0.04, 0.05); th.rotation.z = side * 0.5; th.castShadow = true; h.add(th);
        h.userData = { vel: new T.Vector3(), side }; scene.add(h); return h;
      };
      this.hands = [mkHand(-1), mkHand(1)];
      this.hands[0].add(acc.mic); this.hands[1].add(acc.pencil);
      this.applyLook = () => {
        const hex = this.p.cap; const def = !hex; let base = null;
        try { base = def ? null : new T.Color(hex); } catch (e) { base = null; }
        const W = new T.Color(0xffffff);
        const c0 = base ? base.clone().multiplyScalar(0.8) : 0x3d5ad6, c1 = base ? base.clone() : 0x6a4fd0;
        const c2 = base ? base.clone().multiplyScalar(0.92) : 0x5a4cc8, c3 = base ? base.clone().lerp(W, 0.15) : 0x7a5ce0;
        tint(skull.geometry, -0.12, 0.12, c0, c1); tint(board.geometry, -0.025, 0.025, c2, c3);
        let a = this.p.accessory || 'none'; if (a === 'beaker') a = 'mic';
        Object.keys(this.accMats).forEach((k) => { const [m, d] = this.accMats[k]; if (!m) return; let col = d; if (k === a && this.p.acccolor) { try { col = new T.Color(this.p.acccolor); } catch (e) {} } m.color.set(col); }); Object.keys(acc).forEach((k) => { acc[k].visible = k === a; });
      };
      this.applyLook();
      this.tmp = { v: new T.Vector3(), q: new T.Quaternion(), e: new T.Euler(), vel: new T.Vector3(), prev: new T.Vector3() };
      this.look = { x: 0, y: 0, tx: 0, ty: 0 };
      this.state = { t: Math.random() * 10, blink: 2.5, blinkT: -1, speak: 0, brow: 0, yawPose: 0, inited: false, s: 1 };

      this.onMove = (e) => {
        const rc = this.getBoundingClientRect(); if (!rc.width) return;
        this.look.tx = clamp(((e.clientX - rc.left) / rc.width) * 2 - 1, -1.5, 1.5);
        this.look.ty = clamp(((e.clientY - rc.top) / rc.height) * 2 - 1, -1.5, 1.5);
      };
      window.addEventListener('pointermove', this.onMove);
      this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(this); this.resize();
      this.visible = true;
      this.io = new IntersectionObserver(([en]) => { this.visible = en.isIntersecting; }); this.io.observe(this);
      this.last = performance.now();
      const loop = (now) => { this.raf = requestAnimationFrame(loop); const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now; if (this.visible) this.tick(dt); };
      this.raf = requestAnimationFrame(loop);
    }
    resize() {
      const w = this.clientWidth, h = this.clientHeight; if (!w || !h || !this.r) return;
      this.r.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
    }
    tick(dt) {
      const S = this.state, P = this.p, tm = this.tmp;
      S.t += dt; const t = S.t;
      const halfH = Math.tan((this.cam.fov / 2) * Math.PI / 180) * 9, halfW = halfH * this.cam.aspect;
      const x0 = (clamp(P.rleft, 0, 1) * 2 - 1) * halfW, x1 = (clamp(P.rright, 0, 1) * 2 - 1) * halfW;
      const regionW = Math.max(0.5, x1 - x0), cx = (x0 + x1) / 2;
      const sTarget = clamp(Math.min(P.size, regionW / 2.7, (halfH * 2) / 3.8), 0.45, 1.6);
      S.s = S.inited ? damp(S.s, sTarget, 3, dt) : sTarget; const s = S.s;
      const A = clamp(P.roam, 0, 1);
      const roamX = Math.min(1.8, Math.max(0, regionW / 2 - 1.35 * s)) * A;
      const pose = P.pose;
      let tx = cx + roamX * (0.65 * Math.sin(t * 0.31) + 0.35 * Math.sin(t * 0.83 + 1.3));
      let ty = 0.15 + A * (0.32 * Math.sin(t * 0.53 + 0.5) + 0.12 * Math.sin(t * 1.37)) + 0.05 * Math.sin(t * 2.1);
      let tz = A * (0.7 * Math.sin(t * 0.41 + 2.0) + 0.2 * Math.sin(t * 1.1));
      if (pose === 'celebrate') ty += Math.abs(Math.sin(t * 4.2)) * 0.35;
      if (pose === 'shrug') ty += 0.08 * Math.max(0, Math.sin(t * 2));
      if (pose === 'read') { tx = cx; ty = 0.2 + 0.02 * Math.sin(t * 1.2); tz = 0; }
      const root = this.root;
      if (!S.inited) { root.position.set(tx, ty, tz); tm.prev.copy(root.position); S.inited = true; }
      root.position.x = damp(root.position.x, tx, 2.5, dt); root.position.y = damp(root.position.y, ty, 4, dt); root.position.z = damp(root.position.z, tz, 2.5, dt);
      tm.v.copy(root.position).sub(tm.prev).divideScalar(Math.max(dt, 1e-4)); tm.prev.copy(root.position);
      tm.vel.lerp(tm.v, 1 - Math.exp(-6 * dt));
      const L = this.look; L.x = damp(L.x, L.tx, 4, dt); L.y = damp(L.y, L.ty, 4, dt);
      const lookYaw = clamp((L.x * halfW - root.position.x) / halfW, -1, 1) * 0.45;
      S.yawPose = damp(S.yawPose, pose === 'point' ? 0.5 : 0, 3, dt);
      let spin = 0;
      if (this.spinT !== undefined && this.spinT !== null) { this.spinT += dt; const k = clamp(this.spinT / 1.0, 0, 1); spin = (1 - Math.pow(1 - k, 3)) * Math.PI * 2; if (k >= 1) this.spinT = null; }
      const ex = { read: [0.24, 0.1 * Math.sin(t * 0.6), 0.04 * Math.sin(t * 0.6)], sleep: [0.2, 0, 0.12 + 0.03 * Math.sin(t * 0.65)], think: [-0.22, 0.18, 0.12], listen: [0.04 * Math.sin(t * 2.2), -0.05, 0.28], shrug: [0, 0, 0.08 * Math.sin(t * 2)], wave: [0, -0.12, 0.06 * Math.sin(t * 4.5)] }[pose] || [0, 0, 0];
      S.ex = S.ex || [0, 0, 0]; for (let q = 0; q < 3; q++) S.ex[q] = damp(S.ex[q], ex[q], 4, dt);
      const yaw = clamp(tm.vel.x * 0.35, -0.5, 0.5) + (pose === 'point' ? S.yawPose : lookYaw * (pose === 'think' ? 0.3 : (pose === 'sleep' || pose === 'read') ? 0 : 1) + S.yawPose) + spin + S.ex[1];
      const pitch = clamp(-tm.vel.y * 0.18, -0.3, 0.3) + L.y * 0.18 * (pose === 'think' ? 0.2 : (pose === 'sleep' || pose === 'read') ? 0 : 1) + clamp(tm.vel.z * 0.12, -0.2, 0.2) + S.ex[0];
      const roll = clamp(-tm.vel.x * 0.28, -0.4, 0.4) + Math.sin(t * 0.9) * 0.05 * A + Math.sin(t * 0.7) * 0.07 + S.ex[2];
      root.rotation.set(pitch, yaw, roll, 'YXZ'); root.scale.setScalar(s);
      const sq = clamp(tm.vel.y * 0.07, -0.08, 0.1) + (pose === 'celebrate' ? Math.sin(t * 8.4) * 0.03 : 0);
      const br = pose === 'sleep' ? Math.sin(t * 1.3) * 0.035 : 0;
      this.body.scale.set(1 - sq * 0.5 - br * 0.4, 1 + sq + br, 1 - sq * 0.5 - br * 0.4);
      root.updateMatrixWorld(true);
      const ts = this.tasselSwing;
      ts.v += (-clamp(tm.vel.x * 0.45, -1, 1) - ts.a) * 60 * dt - ts.v * 5 * dt; ts.a += ts.v * dt;
      ts.w += (clamp(tm.vel.z * 0.35 + tm.vel.y * 0.2, -0.8, 0.8) - ts.b) * 60 * dt - ts.w * 5 * dt; ts.b += ts.w * dt;
      this.tassel.rotation.set(ts.b, 0, ts.a + 0.12);

      S.blink -= dt; if (S.blink <= 0) { S.blinkT = 0; S.blink = 2.5 + Math.random() * 3; }
      let eyeY = 1.12; if (S.blinkT >= 0) { S.blinkT += dt; const k = S.blinkT / 0.16; eyeY = 1.12 * (k < 0.5 ? 1 - k * 1.8 : (k - 0.5) * 1.8 + 0.1); if (k >= 1) { S.blinkT = -1; eyeY = 1.12; } }
      const happy = pose === 'celebrate';
      this.eyes.forEach((e) => { e.visible = !happy; e.scale.set(1, clamp(eyeY, 0.1, 1.1), 0.5); });
      const asleep = pose === 'sleep';
      if (asleep) this.eyes.forEach((e) => { e.visible = false; });
      this.happyEyes.forEach((a) => { a.visible = happy; });
      this.sleepEyes.forEach((a) => { a.visible = asleep; });
      this.book.visible = pose === 'read';
      this.acc.mic.visible = (this.p.accessory === 'mic' || this.p.accessory === 'beaker') && pose !== 'read';
      S.brow = damp(S.brow, happy ? 0.05 : P.speaking ? 0.015 + 0.012 * Math.sin(t * 3.1) : 0, 6, dt);
      this.brows.position.y = S.brow;
      const bt = { sleep: [-0.025, -0.025], think: [0.04, -0.01], shrug: [0.05, 0.05], listen: [0.02, -0.005], wave: [0.02, 0.02] }[pose] || [0, 0];
      S.bl = damp(S.bl || 0, bt[0], 6, dt); S.br = damp(S.br || 0, bt[1], 6, dt);
      this.browMeshes.forEach((b, i) => { b.position.y = b.userData.base.y + (i === 0 ? S.bl : S.br); });
      const target = happy ? 1 : asleep ? 0.18 + 0.04 * Math.sin(t * 1.3) : pose === 'read' ? 0 : P.speaking ? 0.35 + 0.55 * Math.abs(Math.sin(t * 8.5)) * (0.6 + 0.4 * Math.sin(t * 2.3)) : 0;
      S.speak = damp(S.speak, target, 18, dt);
      this.open.visible = S.speak > 0.06; this.smile.visible = !this.open.visible;
      this.open.scale.set(happy ? 1.25 : 1, Math.max(0.05, S.speak), 1);

      const poses = {
        explain: [[-0.98, -0.3 + 0.05 * Math.sin(t * 1.9), 0.3, -0.5, 0, 0.6], [0.96, 0.12 + 0.12 * Math.sin(t * 2.6), 0.35, 0.2, 0, -0.45 + 0.28 * Math.sin(t * 2.6)]],
        point: [[-0.95, -0.38 + 0.04 * Math.sin(t * 1.7), 0.2, 0, 0, 0.3], [1.15 + 0.07 * Math.sin(t * 5), 0.08, 0.25, 0, 0.2, -Math.PI / 2]],
        read: [[-0.38, -0.42, 1.0, -0.7, 0, 0.35], [0.38, -0.42 + 0.015 * Math.sin(t * 2), 1.0, -0.7, 0, -0.35]],
        sleep: [[-0.86, -0.5 + 0.03 * Math.sin(t * 1.3), 0.3, -0.3, 0, 0.9], [0.86, -0.5 + 0.03 * Math.sin(t * 1.3 + 0.4), 0.3, -0.3, 0, -0.9]],
        wave: [[-0.96, -0.36 + 0.04 * Math.sin(t * 1.8), 0.25, 0, 0, 0.4], [0.98, 0.62 + 0.04 * Math.sin(t * 9), 0.3, 0, 0, -0.25 + 0.55 * Math.sin(t * 9)]],
        think: [[-0.5, -0.62, 0.62, -0.4, 0, 1.3], [0.3, -0.42 + 0.02 * Math.sin(t * 1.5), 0.82, -0.6, 0, 0.5 + 0.08 * Math.sin(t * 3)]],
        listen: [[-0.98, -0.34 + 0.04 * Math.sin(t * 1.6), 0.25, 0, 0, 0.45], [0.9, 0.22 + 0.03 * Math.sin(t * 2.2), 0.05, 0, -0.9, -0.2]],
        shrug: [[-1.08, 0.02 + 0.1 * Math.max(0, Math.sin(t * 2)), 0.4, -1.2, 0, 1.3], [1.08, 0.02 + 0.1 * Math.max(0, Math.sin(t * 2)), 0.4, -1.2, 0, -1.3]],
        celebrate: [[-0.88, 0.95 + 0.12 * Math.sin(t * 8.4), 0.15, 0, 0, 0.35 + 0.15 * Math.sin(t * 8.4)], [0.88, 0.95 + 0.12 * Math.sin(t * 8.4 + 1), 0.15, 0, 0, -0.35 - 0.15 * Math.sin(t * 8.4 + 1)]],
      };
      const hp = poses[pose] || poses.explain;
      this.hands.forEach((h, i) => {
        const [lx, ly, lz, rx, ry, rz] = hp[i];
        tm.v.set(lx, ly, lz); root.localToWorld(tm.v);
        const u = h.userData; if (!u.init) { h.position.copy(tm.v); u.init = true; }
        u.vel.addScaledVector(tm.v.sub(h.position), 70 * dt); u.vel.multiplyScalar(Math.exp(-9 * dt)); h.position.addScaledVector(u.vel, dt);
        tm.e.set(rx, ry, rz); tm.q.setFromEuler(tm.e).premultiply(root.quaternion);
        h.quaternion.slerp(tm.q, 1 - Math.exp(-10 * dt)); h.scale.setScalar(s);
      });

      const hgt = root.position.y - this.groundY;
      this.blob.position.set(root.position.x, this.groundY + 0.002, root.position.z);
      this.blob.scale.setScalar(s * clamp(1.75 - 0.25 * hgt, 0.7, 1.6));
      this.blob.material.opacity = clamp(1.15 - 0.3 * hgt, 0.25, 1);
      this.r.render(this.scene, this.cam);
    }
  }
  ['pose', 'speaking', 'rleft', 'rright', 'roam', 'size'].forEach((k) => {
    Object.defineProperty(Tutor3D.prototype, k, { get() { return this.p[k]; }, set(v) { this.set(k, v); }, configurable: true });
  });
  customElements.define('tutor-3d', Tutor3D);
})();
