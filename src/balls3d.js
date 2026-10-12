// 3D models of every ball and boss, built from three.js primitives (no model files).
// Pass in THREE: createKit(THREE).ball('spider') → a Group, radius 1, its face toward +z.
// The game draws them through ball3d.js when the 3D preview is on (?3d); the Claude Design showroom uses the same file.
export const BALL_IDS = ['basic', 'leech', 'cell', 'spider', 'ninja', 'train', 'magnet', 'bomb', 'turtle', 'lightning', 'hedgehog', 'ice', 'poison', 'chain', 'forge', 'chess'];
export const BOSS_IDS = ['slime', 'frost', 'dragon', 'golem'];

export function createKit(THREE) {
  const INK = '#0A0E1F';
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const ball = new THREE.SphereGeometry(1, 96, 64);
  const gloss = (color, o = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.32, metalness: 0.04, clearcoat: 1, clearcoatRoughness: 0.14, ...o });
  const metal = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.28, metalness: 0.85, ...o });
  const lamp = (color, k = 1.4) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k, roughness: 0.4 });
  const mesh = (geo, mat, p = [0, 0, 0]) => { const m = new THREE.Mesh(geo, mat); m.position.set(...p); return m; };
  const group = (...kids) => { const g = new THREE.Group(); g.add(...kids); return g; };
  const sphere = (r, mat, p) => mesh(new THREE.SphereGeometry(r, 32, 24), mat, p);
  const canvasTex = (w, h, draw) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    return t;
  };
  // A point on the ball: lat up from the equator, lon to the right of the front (radians).
  const at = (lat, lon, r = 1) => V(r * Math.cos(lat) * Math.sin(lon), r * Math.sin(lat), r * Math.cos(lat) * Math.cos(lon));
  // Stand an object on the surface, its +y pointing straight out.
  const stick = (obj, lat, lon, r = 1) => { const p = at(lat, lon, r); obj.position.copy(p); obj.quaternion.setFromUnitVectors(V(0, 1, 0), p.clone().normalize()); return obj; };
  const tube = (pts, r, mat) => mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, r, 12), mat);
  // Bend a flat piece (drawn in the xy plane around 0,0, thickness along +z) onto the front of the ball.
  const wrap = (m, r0 = 1) => {
    m.updateMatrix(); m.geometry = m.geometry.clone(); m.geometry.applyMatrix4(m.matrix);
    m.position.set(0, 0, 0); m.rotation.set(0, 0, 0); m.scale.set(1, 1, 1);
    const p = m.geometry.attributes.position, v = V(0, 0, 0);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), d = p.getZ(i);
      v.set(x, y, Math.sqrt(Math.max(0.02, 1 - x * x - y * y))).normalize().multiplyScalar(r0 + d);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    m.geometry.computeVertexNormals();
    return m;
  };
  const flat = (shape, depth, mat, bevel = 0.012) => mesh(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 12, steps: 1 }), mat);
  const shape = pts => { const s = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y))); s.closePath(); return s; };
  const eye = (r = 0.15, look = [0, 0]) => group(sphere(r, gloss('#FFFFFF')), sphere(r * 0.52, gloss(INK), [look[0] * r * 0.3, look[1] * r * 0.3, r * 0.62]));
  const putEye = (e, lat, lon) => { const p = at(lat, lon, 0.96); e.position.copy(p); e.lookAt(p.clone().multiplyScalar(2)); return e; };
  const angryEyes = (lat = 0.2, spread = 0.36, r = 0.17) => {
    const g = new THREE.Group();
    for (const s of [-1, 1]) {
      g.add(putEye(eye(r, [-s * 0.6, -0.3]), lat, s * spread));
      const brow = mesh(new THREE.BoxGeometry(0.42, 0.09, 0.08, 16, 1, 1), gloss(INK));
      brow.position.set(s * Math.sin(spread) * 0.92, Math.sin(lat) + r + 0.07, 0); brow.rotation.z = s * 0.38;
      g.add(wrap(brow, 1.0));
    }
    return g;
  };
  const bumpTex = (w, h, draw) => { const t = canvasTex(w, h, draw); t.colorSpace = THREE.NoColorSpace; return t; };

  const B = {
    basic() { // a silver glass ball with a lens seam
      const g = group(mesh(ball, gloss('#8FA3BF', { metalness: 0.35, roughness: 0.2 })));
      const seam = gloss('#55698A');
      for (const s of [-1, 1]) g.add(tube(Array.from({ length: 25 }, (_, i) => { const t = i / 24 * 2 - 1; return at(t * 0.92, s * 0.34 * Math.cos(t * Math.PI / 2), 1.004); }), 0.032, seam));
      for (const s of [-1, 1]) g.add(sphere(0.045, seam, at(s * 0.95, 0).toArray()));
      return g;
    },
    leech() { // red, two white fangs, a sucker
      const g = group(mesh(ball, gloss('#D4374A')));
      for (const [lat, lon, k] of [[0.95, 0.5, 1], [0.38, 1.0, 0.85]]) {
        const fang = mesh(new THREE.ConeGeometry(0.13 * k, 0.5 * k, 24), gloss('#FFFFFF'));
        fang.geometry.translate(0, 0.25 * k, 0);
        g.add(stick(fang, lat, lon, 0.96));
      }
      const sucker = sphere(0.24, gloss('#9E1F2C'));
      sucker.scale.set(1, 1, 0.35); g.add(stick(sucker, 0.28, 0.42, 0.97));
      g.add(tube([at(-0.55, -0.55, 1.005), at(-0.7, -0.15, 1.005), at(-0.62, 0.25, 1.005)], 0.03, gloss('#8A1424')));
      return g;
    },
    cell(ring = true) { // a see-through green cell with its nucleus
      const shell = mesh(ball, gloss('#35B86B', { transparent: true, opacity: 0.55, depthWrite: false, roughness: 0.12 }));
      const g = group(sphere(0.42, gloss('#1F7A45'), [0.12, 0.04, 0.18]), sphere(0.16, gloss('#145C33'), [0.16, 0.06, 0.52]));
      for (const [x, y, z, r] of [[-0.45, 0.42, 0.35, 0.1], [0.5, -0.35, 0.4, 0.08], [-0.3, -0.45, 0.5, 0.09], [0.48, 0.45, 0.2, 0.07]]) { const o = sphere(r, gloss('#A8F5C8'), [x, y, z]); o.scale.set(1.4, 0.8, 1); g.add(o); }
      if (ring) g.add(mesh(new THREE.TorusGeometry(0.86, 0.03, 12, 96), gloss('#BFF5D6'), [0, 0, 0.5]));
      g.add(shell);
      return g;
    },
    spider() { // purple, eight jointed legs, googly eyes and an hourglass
      const g = group(mesh(ball, gloss('#7A5BD8')));
      const legMat = gloss('#9B85FF');
      const legs = [];
      for (const s of [-1, 1]) for (const [k, lat] of [[0, 0.6], [1, 0.22], [2, -0.16], [3, -0.52]]) {
        const lon = s * (1.2 + (k - 1.5) * 0.28), root = at(lat, lon, 0.92), out = root.clone().setY(0).normalize();
        const knee = out.clone().multiplyScalar(0.42).add(V(0, 0.36 - k * 0.06, 0)), foot = out.clone().multiplyScalar(0.72).add(V(0, -0.34 - k * 0.08, 0));
        const leg = group(tube([V(0, 0, 0), knee, foot], 0.07, legMat), sphere(0.085, legMat, knee.toArray()));
        leg.position.copy(root); legs.push([leg, (k + (s > 0 ? 0 : 1)) % 2]); g.add(leg);
      }
      g.userData.tick = t => { for (const [leg, ph] of legs) leg.rotation.y = Math.sin(t * 16 + ph * Math.PI) * 0.2; }; // it scuttles
      g.userData.anim = { frames: 6, period: Math.PI / 8 }; // one step of the legs, as pictures
      g.add(putEye(eye(0.17, [0.3, 0.4]), 0.46, 0.22), putEye(eye(0.14, [0.3, 0.4]), 0.36, 0.55));
      const hg = flat(shape([[-0.17, 0.26], [0.17, 0.26], [0.02, 0], [0.17, -0.26], [-0.17, -0.26], [-0.02, 0]]), 0.04, gloss('#24175A'));
      g.add(wrap(hg, 0.99));
      hg.rotation.y = -0.12;
      return g;
    },
    ninja() { // dark, a red headband with two tails
      const g = group(mesh(ball, gloss('#3A4256')));
      const pts = []; for (let i = 0; i <= 8; i++) { const lat = 0.12 + i / 8 * 0.3; pts.push(new THREE.Vector2(Math.cos(lat) * 1.025, Math.sin(lat) * 1.025)); }
      const band = mesh(new THREE.LatheGeometry(pts, 96), gloss('#E8394A', { side: THREE.DoubleSide }));
      band.rotation.z = -0.12; g.add(band);
      g.add(sphere(0.06, gloss('#FFFFFF'), at(0.27, 0.45, 1.04).toArray()));
      const knot = sphere(0.13, gloss('#E8394A'), at(0.28, -1.45, 1.02).toArray()); g.add(knot);
      const tails = [];
      for (const [a, len] of [[2.35, 0.75], [2.7, 0.62]]) {
        const tail = mesh(new THREE.BoxGeometry(0.13, len, 0.03), gloss('#E8394A'));
        tail.geometry.translate(0, -len / 2, 0);
        tail.position.copy(knot.position); tail.rotation.set(0.15, -0.5, a - Math.PI); g.add(tail); tails.push([tail, a - Math.PI]);
      }
      g.userData.tick = t => tails.forEach(([tail, z], i) => { tail.rotation.z = z + Math.sin(t * 7 + i * 1.3) * 0.18; });
      g.userData.anim = { frames: 6, period: Math.PI * 2 / 7 };
      return g;
    },
    train() { // a red engine: dark face plate, gold ring and rivets, a headlamp, a chimney and a cow-catcher
      const g = group(mesh(ball, gloss('#E02424')));
      const gold = metal('#F2C12E', { roughness: 0.3 });
      const plate = mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.12, 64), gloss('#1D2338')); plate.rotation.x = Math.PI / 2; plate.position.z = 0.82; g.add(plate);
      g.add(mesh(new THREE.TorusGeometry(0.6, 0.05, 16, 96), gold, [0, 0, 0.88]));
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + 0.39; g.add(sphere(0.04, gold, [Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0.9])); }
      g.add(sphere(0.17, lamp('#FFE27A', 1.6), [0, -0.02, 0.88]), mesh(new THREE.TorusGeometry(0.19, 0.035, 12, 48), gold, [0, -0.02, 0.92]));
      g.add(mesh(new THREE.BoxGeometry(0.42, 0.05, 0.02), gloss('#C9D4E6'), [0, 0.3, 0.95]));
      for (let i = 0; i < 20; i++) { const a = i / 20 * Math.PI * 2, s = Math.sin(0.95); const p = V(Math.cos(a) * s, Math.sin(a) * s, Math.cos(0.95)); const d = mesh(new THREE.BoxGeometry(0.1, 0.035, 0.03), gold); d.position.copy(p.multiplyScalar(1.01)); d.lookAt(p.clone().multiplyScalar(2)); d.rotateZ(a + Math.PI / 2); g.add(d); }
      const stack = group(mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.34, 32), gloss('#1D2338'), [0, 0.17, 0]), mesh(new THREE.CylinderGeometry(0.26, 0.2, 0.1, 32), gloss('#1D2338'), [0, 0.36, 0]),
        mesh(new THREE.TorusGeometry(0.16, 0.03, 12, 32), gold, [0, 0.22, 0]), sphere(0.07, gloss('#FFFFFF'), [0, 0.45, 0]));
      stack.children[2].rotation.x = Math.PI / 2; g.add(stick(stack, 1.25, 0, 0.96));
      for (let i = -2; i <= 2; i++) { const w = mesh(new THREE.BoxGeometry(0.08, 0.34, 0.06), gold); stick(w, -0.95, i * 0.22, 0.98); w.rotateX(0.5); g.add(w); }
      return g;
    },
    magnet() { // red north, blue south, a white band
      const tex = canvasTex(1024, 512, (c, w, h) => {
        c.fillStyle = '#FF5A36'; c.fillRect(0, 0, w, h / 2); c.fillStyle = '#3A6FF0'; c.fillRect(0, h / 2, w, h / 2);
        c.fillStyle = '#E9EEF8'; c.fillRect(0, h / 2 - 16, w, 32);
        c.font = '900 130px Rubik, Arial Black, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#FFFFFF';
        for (const [txt, y] of [['N', h * 0.3], ['S', h * 0.7]]) { c.save(); c.translate(w * 0.25, y); c.scale(0.8, 1); c.fillText(txt, 0, 0); c.restore(); }
      });
      return group(mesh(ball, gloss('#FFFFFF', { map: tex })));
    },
    bomb() { // black iron, a metal cap, a fuse and a spark
      const g = group(mesh(ball, gloss('#24242F', { roughness: 0.22 })));
      const cap = mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.2, 32), metal('#8A93A6')); cap.geometry.translate(0, 0.1, 0);
      g.add(stick(cap, 0.95, 0.5, 0.95));
      const top = at(0.95, 0.5, 1.17);
      g.add(tube([top, top.clone().add(V(0.05, 0.25, 0)), top.clone().add(V(0.3, 0.4, 0.05)), top.clone().add(V(0.5, 0.32, 0.08))], 0.035, gloss('#C9A46B', { clearcoat: 0 })));
      const spark = top.clone().add(V(0.52, 0.32, 0.08));
      const fizz = group(sphere(0.08, lamp('#FFE27A', 2.4)));
      for (let i = 0; i < 4; i++) { const ray = mesh(new THREE.ConeGeometry(0.035, 0.32, 8), lamp('#FFF4C2', 2)); ray.rotation.z = i * Math.PI / 4; fizz.add(ray); }
      fizz.position.copy(spark); g.add(fizz);
      g.userData.tick = t => { fizz.scale.setScalar(0.8 + 0.35 * Math.abs(Math.sin(t * 23))); fizz.rotation.z = t * 6; };
      g.userData.anim = { frames: 4, period: Math.PI / 23 };
      return g;
    },
    turtle(pal = ['#B8E07A', '#5E8F22', '#8BBF3F']) { // a green shell of raised hex plates
      const hexes = (c, w, h, line, fill, glow) => {
        c.fillStyle = fill; c.fillRect(0, 0, w, h);
        const R = w / 20, dx = R * Math.sqrt(3), dy = R * 1.5;
        for (let row = -1; row * dy < h + R; row++) for (let col = -1; col * dx < w + R; col++) {
          const x = col * dx + (row % 2 ? dx / 2 : 0), y = row * dy;
          c.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; c[k ? 'lineTo' : 'moveTo'](x + Math.cos(a) * R * 0.9, y + Math.sin(a) * R * 0.9); } c.closePath();
          if (glow) { c.fillStyle = glow; c.fill(); }
          c.lineWidth = R * 0.22; c.strokeStyle = line; c.stroke();
        }
      };
      const map = canvasTex(1024, 512, (c, w, h) => hexes(c, w, h, ...pal));
      const bump = bumpTex(1024, 512, (c, w, h) => hexes(c, w, h, '#000000', '#000000', '#FFFFFF'));
      return group(mesh(ball, gloss('#FFFFFF', { map, bumpMap: bump, bumpScale: 4, roughness: 0.4 })));
    },
    lightning() { // yellow with a white bolt and crackles
      const g = group(mesh(ball, gloss('#FFD23F')));
      const bolt = [[0.15, 0.6], [-0.3, -0.03], [0.04, -0.03], [-0.13, -0.58], [0.34, 0.11], [0.0, 0.11]];
      g.add(wrap(flat(shape(bolt.map(([x, y]) => [x * 1.16 - 0.01, y * 1.12])), 0.04, gloss(INK)), 0.99), wrap(flat(shape(bolt), 0.07, gloss('#FFFFFF')), 1.0));
      const zap = lamp('#FFF4C2', 1.2), arcs = [];
      for (const [lat, lon, dir] of [[0.5, -1.1, -1], [-1.1, 0.2, 0], [0.2, 1.25, 1]]) {
        const p = at(lat, lon, 1.02), o = p.clone().normalize();
        arcs.push(tube([p, p.clone().add(o.clone().multiplyScalar(0.18)).add(V(0.08 * dir, 0.08, 0)), p.clone().add(o.clone().multiplyScalar(0.34)).add(V(-0.04, -0.04, 0)), p.clone().add(o.clone().multiplyScalar(0.5)).add(V(0.06 * dir, 0.05, 0))], 0.022, zap));
      }
      g.add(...arcs);
      g.userData.tick = t => arcs.forEach((a, i) => { a.visible = (Math.floor(t * 9) + i) % 3 !== 0; });
      g.userData.anim = { frames: 3, period: 1 / 3 };
      return g;
    },
    hedgehog() { // brown, a coat of spikes and a cream snout
      const g = group(mesh(ball, gloss('#9C6B4A', { roughness: 0.5, clearcoat: 0.3 })));
      const face = V(0.42, 0.25, 0.87).normalize(), spikeMat = gloss('#5E3A22', { roughness: 0.45 }), coat = new THREE.Group();
      g.add(coat);
      const N = 130;
      for (let i = 0; i < N; i++) {
        const y = 1 - (i + 0.5) / N * 2, r = Math.sqrt(1 - y * y), a = i * 2.39996;
        const d = V(Math.cos(a) * r, y, Math.sin(a) * r);
        if (d.dot(face) > 0.72) continue;
        const spike = mesh(new THREE.ConeGeometry(0.1, 0.42, 10), spikeMat); spike.geometry.translate(0, 0.21, 0);
        spike.position.copy(d.clone().multiplyScalar(0.9)); spike.quaternion.setFromUnitVectors(V(0, 1, 0), d); coat.add(spike);
      }
      g.userData.tick = (t, e) => { coat.scale.setScalar((e?.cd?.curl ?? 0) > t ? 1.22 : 1); }; // curled up (its super): the spikes stand out
      g.userData.state = (t, e) => ((e?.cd?.curl ?? 0) > t ? 'curl' : '');
      const snout = sphere(0.36, gloss('#F0D2A8', { roughness: 0.45 })); snout.position.copy(face.clone().multiplyScalar(0.82)); g.add(snout);
      g.add(sphere(0.08, gloss(INK), face.clone().multiplyScalar(1.17).add(V(0.03, -0.02, 0)).toArray()));
      for (const dx of [-0.32, 0.1]) g.add(sphere(0.07, gloss(INK), face.clone().add(V(dx, 0.32, -0.08)).normalize().multiplyScalar(1.0).toArray()));
      return g;
    },
    ice(snowflake = true) { // icy and see-through, a white snowflake
      const g = group(mesh(ball, gloss('#8FE3FF', { roughness: 0.06, transparent: true, opacity: 0.88, emissive: '#2A8FB8', emissiveIntensity: 0.25 })));
      const flake = gloss('#FFFFFF', { emissive: '#FFFFFF', emissiveIntensity: 0.35 });
      for (let k = 0; k < (snowflake ? 6 : 0); k++) {
        const a = k * Math.PI / 3;
        const parts = [[0, 0, 0.66, 0.07], [0.4, 0.8, 0.24, 0.055], [0.4, -0.8, 0.24, 0.055], [0.2, 0.75, 0.16, 0.05], [0.2, -0.75, 0.16, 0.05]];
        for (const [cy, rot, len, w] of parts) {
          const p = mesh(new THREE.BoxGeometry(w, len, 0.035, 1, 16, 1), flake);
          p.geometry.translate(0, len / 2, 0);
          const arm = new THREE.Object3D(); arm.rotation.z = a;
          p.position.set(0, cy === 0 ? 0.04 : cy, 0.02); p.rotation.z = cy === 0 ? 0 : rot;
          arm.add(p); arm.updateMatrixWorld(true);
          p.updateMatrixWorld(true); p.geometry = p.geometry.clone().applyMatrix4(p.matrixWorld); p.position.set(0, 0, 0); p.rotation.set(0, 0, 0);
          g.add(wrap(p, 1.0));
        }
      }
      return g;
    },
    poison() { // toxic green with dark spots and spikes
      const g = group(mesh(ball, gloss('#5FD03A')));
      for (const [lat, lon, r] of [[-0.2, -0.4, 0.2], [0.38, -0.1, 0.13], [-0.58, 0.3, 0.15], [0.08, 0.42, 0.11], [-0.25, 0.08, 0.09], [0.55, -0.6, 0.1]]) { const s = sphere(r, gloss('#2A7F16')); s.scale.set(1, 0.45, 1); g.add(stick(s, lat, lon, 0.99)); }
      for (const [lat, lon] of [[1.05, 0.15], [0.62, 0.78], [0.12, 1.15]]) { const sp = mesh(new THREE.ConeGeometry(0.12, 0.42, 16), gloss('#2F7A1A')); sp.geometry.translate(0, 0.21, 0); g.add(stick(sp, lat, lon, 0.95)); }
      return g;
    },
    chain() { // dark red, two crossed chains and a gold padlock
      const g = group(mesh(ball, gloss('#C5313A')));
      const steel = metal('#DFE6F2', { roughness: 0.22 });
      for (const tilt of [0.78, -0.78]) {
        const n = 22;
        for (let i = 0; i < n; i++) {
          const a = -1.25 + i / (n - 1) * 2.5, p = V(Math.sin(a), 0, Math.cos(a)).multiplyScalar(1.04).applyAxisAngle(V(0, 0, 1), tilt);
          const t = V(Math.cos(a), 0, -Math.sin(a)).applyAxisAngle(V(0, 0, 1), tilt);
          const link = mesh(new THREE.TorusGeometry(0.085, 0.032, 12, 24), steel);
          link.scale.set(1.5, 1, 1); link.position.copy(p);
          link.quaternion.setFromUnitVectors(V(1, 0, 0), t); link.rotateX(i % 2 ? Math.PI / 2 : 0); g.add(link);
        }
      }
      const gold = metal('#F2C12E', { roughness: 0.3 });
      const lock = group(mesh(new THREE.BoxGeometry(0.4, 0.32, 0.16), gold), mesh(new THREE.TorusGeometry(0.12, 0.035, 12, 24, Math.PI), steel, [0, 0.16, 0]),
        mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 16), gloss(INK), [0, 0.02, 0.085]), mesh(new THREE.BoxGeometry(0.03, 0.08, 0.02), gloss(INK), [0, -0.04, 0.085]));
      lock.children[2].rotation.x = Math.PI / 2; lock.position.set(0, -0.02, 1.1); lock.scale.setScalar(1.2); g.add(lock);
      return g;
    },
    forge() { // polished gold with a smith's hammer
      const g = group(mesh(ball, metal('#E0B23A', { roughness: 0.24, metalness: 0.75 })));
      const hammer = group(mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.95, 16), gloss('#7A4A26', { clearcoat: 0.3 }), [0, -0.1, 0]),
        mesh(new THREE.BoxGeometry(0.46, 0.22, 0.22), metal('#C8D0DE', { roughness: 0.3 }), [0, 0.42, 0]));
      hammer.position.set(0.05, 0.02, 1.08); hammer.rotation.z = -0.75; g.add(hammer);
      return g;
    },
    chess() { // an 8×8 board wrapped round the front
      const map = canvasTex(1024, 1024, (c, w) => { const s = w / 8; for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { c.fillStyle = (x + y) % 2 ? '#2B2F3A' : '#EDE6D6'; c.fillRect(x * s, y * s, s, s); } });
      const geo = new THREE.SphereGeometry(1, 96, 64), p = geo.attributes.position, uv = geo.attributes.uv;
      for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) * 0.5 + 0.5, p.getY(i) * 0.5 + 0.5); // seen from the front, like the board in the game
      const body = mesh(geo, gloss('#FFFFFF', { map })); body.userData.body = true;
      return group(body);
    },
  };

  const crown = (fill, gems) => {
    const g = group(mesh(new THREE.CylinderGeometry(0.5, 0.46, 0.2, 48, 1, true), metal(fill, { side: THREE.DoubleSide })));
    for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; const pt = mesh(new THREE.ConeGeometry(0.1, 0.34, 16), metal(fill)); pt.position.set(Math.sin(a) * 0.48, 0.26, Math.cos(a) * 0.48); g.add(pt); if (gems) g.add(sphere(0.06, gloss(gems), [Math.sin(a) * 0.51, 0, Math.cos(a) * 0.51])); }
    return g;
  };
  const BOSS = {
    slime() { const g = B.cell(false); const c = crown('#FFCC33', '#FF4D6D'); c.position.y = 0.95; c.rotation.z = 0.12; g.add(c, angryEyes()); return g; },
    frost() {
      const g = B.ice(false), ice = gloss('#BFEFFF', { transparent: true, opacity: 0.92, emissive: '#7FD8FF', emissiveIntensity: 0.25 });
      for (const [lon, h] of [[-0.6, 0.38], [-0.25, 0.55], [0.1, 0.62], [0.45, 0.5], [0.8, 0.36]]) { const s = mesh(new THREE.ConeGeometry(0.12, h, 6), ice); s.geometry.translate(0, h / 2, 0); g.add(stick(s, 1.05, lon * 0.9, 0.93)); }
      g.add(angryEyes(0.1)); return g;
    },
    dragon() {
      const lava = canvasTex(1024, 512, (c, w, h) => {
        c.fillStyle = '#FF7A2F'; c.fillRect(0, 0, w, h); c.strokeStyle = '#7A1E08'; c.lineWidth = 9; c.lineCap = 'round';
        let s = 7; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
        for (let i = 0; i < 40; i++) { let x = r() * w, y = r() * h; c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 120; y += (r() - 0.5) * 80; c.lineTo(x, y); } c.stroke(); }
      });
      const g = group(mesh(ball, gloss('#FFFFFF', { map: lava, emissive: '#FF4A1A', emissiveIntensity: 0.18 })));
      for (const s of [-1, 1]) {
        const horn = mesh(new THREE.ConeGeometry(0.16, 0.7, 20, 8), gloss('#FFE08A')), p = horn.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) { const y = p.getY(i) + 0.35; p.setX(i, p.getX(i) + s * 0.35 * y * y); }
        horn.geometry.translate(0, 0.35, 0); horn.geometry.computeVertexNormals();
        g.add(stick(horn, 0.95, s * 0.55, 0.93));
      }
      g.add(sphere(0.07, lamp('#FFB347', 2), at(0.62, 0, 1.0).toArray()), angryEyes(0.18));
      return g;
    },
    golem() {
      const g = B.turtle(['#F4F7FC', '#6E7789', '#B8C1D2']); g.children[0].material.metalness = 0.5; // the Iron Golem: a steel shell
      const ant = group(mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.4, 16), metal('#7C8597'), [0, 0.2, 0]), sphere(0.11, lamp('#FF4D5E', 1.8), [0, 0.46, 0]));
      g.add(stick(ant, 1.3, 0, 0.95), angryEyes(0.12)); return g;
    },
  };

  // The light the models are shown in: a cool sky, a warm key from the upper left, a blue rim from behind.
  let env = null;
  function studio(renderer) { // what the gloss reflects: a sky above, the floor below, a big bright window up-left, a cool one behind right
    const W = 512, H = 256, data = new Float32Array(W * H * 4), lin = h => new THREE.Color(h);
    const sky = lin('#CFE3FF'), hor = lin('#6F8FC8'), floor = lin('#141A2E');
    const win = [[V(-0.66, 0.66, 0.35).normalize(), 0.3, 16, lin('#FFFFFF')], [V(0.75, 0.25, -0.6).normalize(), 0.35, 5, lin('#9FDcFF')]];
    const d = V(0, 0, 0), c = new THREE.Color();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const phi = ((x + 0.5) / W - 0.5) * Math.PI * 2, lat = ((y + 0.5) / H - 0.5) * Math.PI;
      d.set(Math.cos(phi) * Math.cos(lat), Math.sin(lat), Math.sin(phi) * Math.cos(lat));
      if (d.y > 0) c.copy(hor).lerp(sky, Math.min(1, d.y * 2)); else c.copy(hor).lerp(floor, Math.min(1, -d.y * 6));
      for (const [dir, r, k, col] of win) { const t = THREE.MathUtils.smoothstep(d.dot(dir), Math.cos(r), Math.cos(r * 0.55)); if (t > 0) c.add(col.clone().multiplyScalar(t * k)); }
      data.set([c.r, c.g, c.b, 1], (y * W + x) * 4);
    }
    const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.FloatType);
    tex.mapping = THREE.EquirectangularReflectionMapping; tex.needsUpdate = true;
    const pm = new THREE.PMREMGenerator(renderer); env = pm.fromEquirectangular(tex).texture; pm.dispose(); tex.dispose();
  }
  function stage(scene, renderer) {
    if (renderer && !env) studio(renderer);
    if (env) scene.environment = env;
    scene.add(new THREE.HemisphereLight('#DCEBFF', '#2A3558', 0.45));
    const key = new THREE.DirectionalLight('#FFFFFF', 1.3); key.position.set(-2.5, 3.2, 4); scene.add(key);
    const rim = new THREE.DirectionalLight('#8FD8FF', 1.6); rim.position.set(3, 1.5, -3); scene.add(rim);
    const fill = new THREE.DirectionalLight('#FFE6C7', 0.5); fill.position.set(2, -1, 3); scene.add(fill);
  }
  // A soft round shadow to stand a model on.
  const shadowTex = canvasTex(256, 256, (c, w) => { const gr = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); gr.addColorStop(0, 'rgba(5,8,20,0.55)'); gr.addColorStop(1, 'rgba(5,8,20,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, w); });
  function shadow(r = 1) { const m = mesh(new THREE.PlaneGeometry(2.6 * r, 2.6 * r), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }), [0, -1.08 * r, 0]); m.rotation.x = -Math.PI / 2; return m; }

  // A skin paints the body: the picture (a square canvas with the skin on a disc) is mapped onto the ball from the front.
  const front = new THREE.SphereGeometry(1, 96, 64);
  for (let i = 0, p = front.attributes.position, uv = front.attributes.uv; i < p.count; i++) uv.setXY(i, p.getX(i) * 0.5 + 0.5, p.getY(i) * 0.5 + 0.5);
  function skin(g, canvas) {
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    g.traverse(o => { if (o.isMesh && (o.geometry === ball || o.userData.body)) { o.geometry = front; o.material = gloss('#FFFFFF', { map: tex }); } });
    return tex;
  }

  // ---------- arena props, seen from above: +z comes up out of the floor, radius 1 = the obstacle's radius ----------
  const upZ = geo => geo.rotateX(Math.PI / 2); // three's cylinders and cones stand along y; on the floor they stand along z
  const PROP = {
    rock(arena) { // a faceted boulder: sandstone in the canyon, grey moon rock in space
      const c = { canyon: '#C98A4B', space: '#7A7F92' }[arena] ?? '#7A7F92';
      const geo = new THREE.IcosahedronGeometry(1, 1), p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 0.86 + 0.14 * Math.sin(x * 5.1 + y * 3.7 + z * 2.3); p.setXYZ(i, x * k, y * k, Math.max(-0.2, z * k * 0.72)); }
      geo.computeVertexNormals();
      return group(mesh(geo, new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, flatShading: true })));
    },
    ice() { // a hexagonal crystal
      const g = group(mesh(upZ(new THREE.CylinderGeometry(1, 1, 0.8, 6)).rotateZ(Math.PI / 6), gloss('#BFF3FF', { roughness: 0.05, transparent: true, opacity: 0.92, emissive: '#5FC8F0', emissiveIntensity: 0.2 })));
      for (let k = 0; k < 3; k++) { const l = mesh(new THREE.BoxGeometry(1.5, 0.07, 0.04), gloss('#FFFFFF', { emissive: '#FFFFFF', emissiveIntensity: 0.5 }), [0, 0, 0.42]); l.rotation.z = k * Math.PI / 3 + Math.PI / 6; g.add(l); }
      return g;
    },
    mushroom() { // a bouncy red cap with white spots
      const cap = mesh(new THREE.SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), gloss('#E0304A'));
      cap.scale.set(1, 1, 0.6);
      const g = group(cap);
      for (const [th, ph, r] of [[0, 0, 0.22], [0.75, 0.3, 0.16], [0.8, 2.2, 0.15], [0.7, 4.1, 0.17], [1.05, 5.4, 0.12], [1.1, 1.3, 0.12]]) {
        const spot = sphere(r, gloss('#FFFFFF')); spot.scale.set(1, 1, 0.35);
        spot.position.set(Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th) * 0.6); spot.lookAt(spot.position.clone().multiplyScalar(2)); g.add(spot);
      }
      return g;
    },
    spike(arena) { // a trap: a ring of cones on a base (ice on the frost peak, stone in the temple, steel elsewhere)
      const [c, base] = arena === 'frost' ? ['#E6F7FF', '#3E7FB0'] : arena === 'temple' ? ['#D9D2C0', '#6E5A3A'] : ['#E1E6EE', '#3A3F4A'];
      const g = group(mesh(upZ(new THREE.CylinderGeometry(0.84, 0.88, 0.2, 32)), gloss(base, { roughness: 0.5 })));
      const tip = arena === 'frost' ? gloss(c, { roughness: 0.1, transparent: true, opacity: 0.95 }) : metal(c, { roughness: 0.3 });
      for (let k = 0; k < 7; k++) { // leaning out, so from above they read as a star of blades
        const a = k / 7 * Math.PI * 2, cone = mesh(new THREE.ConeGeometry(0.2, 0.78, 12).translate(0, 0.39, 0), tip, [Math.cos(a) * 0.32, Math.sin(a) * 0.32, 0.1]);
        cone.quaternion.setFromUnitVectors(V(0, 1, 0), V(Math.cos(a), Math.sin(a), 0.55).normalize()); g.add(cone);
      }
      g.add(mesh(upZ(new THREE.ConeGeometry(0.22, 0.9, 12)), tip, [0, 0, 0.54]));
      return g;
    },
    saw(i) { // a buzz saw with a glowing hub (turned by the caller)
      const pts = []; for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2, r = k % 2 ? 0.78 : 1; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
      const g = group(mesh(new THREE.ExtrudeGeometry(shape(pts), { depth: 0.12, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1 }), metal('#C8CFDB', { roughness: 0.22 })));
      for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2; g.add(mesh(upZ(new THREE.CylinderGeometry(0.13, 0.13, 0.05, 16)), gloss('#1A1F2E'), [Math.cos(a) * 0.45, Math.sin(a) * 0.45, 0.17])); }
      g.add(mesh(upZ(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 24)), lamp(i % 2 ? '#FF2BD6' : '#00F0FF', 1.4), [0, 0, 0.2]));
      return g;
    },
    lollipop(i) { // a swirl lollipop lying flat (turned by the caller)
      const top = canvasTex(256, 256, (c, w) => {
        c.fillStyle = '#FFFFFF'; c.fillRect(0, 0, w, w); c.strokeStyle = i ? '#FF4D8D' : '#33C7A6'; c.lineWidth = 22; c.lineCap = 'round'; c.beginPath();
        for (let k = 0; k <= 80; k++) { const a = k * 0.24, rr = k / 80 * w * 0.46; c[k ? 'lineTo' : 'moveTo'](w / 2 + Math.cos(a) * rr, w / 2 + Math.sin(a) * rr); }
        c.stroke();
      });
      const side = gloss('#FFFFFF'), face = gloss('#FFFFFF', { map: top });
      return group(mesh(upZ(new THREE.CylinderGeometry(1, 1, 0.3, 48)), [side, face, side]));
    },
    barrel() { // a barrel, lid up: iron hoops and the lid's planks
      const wood = gloss('#A8642A', { roughness: 0.55, clearcoat: 0.2 }), iron = metal('#3A3F4A', { roughness: 0.4 });
      const g = group(mesh(upZ(new THREE.CylinderGeometry(1, 0.94, 1.1, 40)), wood));
      g.add(mesh(new THREE.TorusGeometry(0.97, 0.07, 10, 48), iron, [0, 0, 0.5]), mesh(new THREE.TorusGeometry(0.76, 0.05, 10, 48), iron, [0, 0, 0.56]));
      for (const x of [-0.38, 0, 0.38]) g.add(mesh(new THREE.BoxGeometry(0.04, 1.3, 0.02), gloss('#5C3410'), [x, 0, 0.56]));
      return g;
    },
    idol() { // a stone idol's head: a rounded block with a carved face
      const sq = new THREE.Shape(), r = 0.45, s = 0.86;
      sq.moveTo(-s + r, -s); sq.lineTo(s - r, -s); sq.quadraticCurveTo(s, -s, s, -s + r); sq.lineTo(s, s - r); sq.quadraticCurveTo(s, s, s - r, s);
      sq.lineTo(-s + r, s); sq.quadraticCurveTo(-s, s, -s, s - r); sq.lineTo(-s, -s + r); sq.quadraticCurveTo(-s, -s, -s + r, -s);
      const g = group(mesh(new THREE.ExtrudeGeometry(sq, { depth: 0.7, bevelEnabled: true, bevelThickness: 0.14, bevelSize: 0.14, bevelSegments: 3 }), new THREE.MeshStandardMaterial({ color: '#8E7A5A', roughness: 0.85 })));
      const dark = new THREE.MeshStandardMaterial({ color: '#3A2E1E', roughness: 0.9 });
      g.add(mesh(new THREE.BoxGeometry(0.42, 0.17, 0.06), dark, [-0.36, 0.25, 0.84]), mesh(new THREE.BoxGeometry(0.42, 0.17, 0.06), dark, [0.36, 0.25, 0.84]), mesh(new THREE.BoxGeometry(0.66, 0.14, 0.06), dark, [0, -0.32, 0.84]));
      return g;
    },
    soccer() { // the match ball (turned by the caller)
      const map = canvasTex(256, 256, (c, w) => {
        c.fillStyle = '#FFFFFF'; c.fillRect(0, 0, w, w); c.fillStyle = '#1A1F2E';
        const pent = (x, y, rr, rot) => { c.beginPath(); for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2 - Math.PI / 2 + rot; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.closePath(); c.fill(); };
        pent(w / 2, w / 2, w * 0.16, 0);
        for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2 - Math.PI / 2; pent(w / 2 + Math.cos(a) * w * 0.39, w / 2 + Math.sin(a) * w * 0.39, w * 0.1, Math.PI); }
      });
      return group(mesh(front, gloss('#FFFFFF', { map })));
    },
    wagon(v) { // a train car seen from above, nose toward +x (1 unit = 10 arena units): 0 purple coach with a gem, 1 orange
      // tank, 2 green box car, 3 blue coach, 4 the express's car; 5, 6, 7 the locomotive (blue yours, red theirs, gold express)
      const loco = v >= 5, body = ['#8E5BE8', '#F28A1E', '#2FA65A', '#2E86E0', '#6A45D8', '#2E7BE0', '#D9452B', '#F2B632'][v] ?? '#8E5BE8';
      const gold = metal('#F2C12E', { roughness: 0.3 }), dark = gloss('#1D2338', { roughness: 0.4 });
      const slab = (w, h, d, r) => {
        const s = new THREE.Shape(), x = w / 2, y = h / 2;
        s.moveTo(-x + r, -y); s.lineTo(x - r, -y); s.quadraticCurveTo(x, -y, x, -y + r); s.lineTo(x, y - r); s.quadraticCurveTo(x, y, x - r, y);
        s.lineTo(-x + r, y); s.quadraticCurveTo(-x, y, -x, y - r); s.lineTo(-x, -y + r); s.quadraticCurveTo(-x, -y, -x + r, -y);
        return new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.12, bevelSegments: 3 });
      };
      const g = group(mesh(new THREE.BoxGeometry(2.8, 1.5, 0.3), gloss('#2A2F3A', { roughness: 0.5 }), [0, 0, 0.15])); // the chassis
      if (loco) {
        g.add(mesh(slab(1.7, 1.6, 0.7, 0.45), gloss(body), [0.42, 0, 0.3]), mesh(slab(0.95, 1.7, 1.15, 0.25), dark, [-0.9, 0, 0.3])); // boiler, cab
        g.add(mesh(new THREE.BoxGeometry(0.7, 1.75, 0.12), gloss(body), [-0.9, 0, 1.6])); // the cab's roof
        const stack = mesh(upZ(new THREE.CylinderGeometry(0.24, 0.3, 0.7, 24)), dark, [0.85, 0, 1.25]); g.add(stack, mesh(new THREE.TorusGeometry(0.27, 0.06, 10, 24), gold, [0.85, 0, 1.5]));
        g.add(sphere(0.2, lamp('#FFE27A', 1.8), [1.4, 0, 0.75]), mesh(new THREE.TorusGeometry(0.2, 0.05, 10, 24).rotateY(Math.PI / 2), gold, [1.42, 0, 0.75]));
        g.add(mesh(new THREE.ConeGeometry(0.62, 0.5, 4).rotateZ(-Math.PI / 2).rotateX(Math.PI / 4), gold, [1.58, 0, 0.32])); // the cow-catcher
        g.add(mesh(new THREE.BoxGeometry(1.5, 0.12, 0.08), gold, [0.42, 0.62, 1.12]), mesh(new THREE.BoxGeometry(1.5, 0.12, 0.08), gold, [0.42, -0.62, 1.12])); // trim
      } else if (v === 1) { // a tank lying along the car, a hatch on top
        g.add(mesh(new THREE.CapsuleGeometry(0.72, 1.2, 8, 24).rotateZ(Math.PI / 2), gloss(body), [0, 0, 0.95]));
        g.add(mesh(upZ(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 24)), gloss('#7A3A0E'), [0, 0, 1.7]), mesh(new THREE.TorusGeometry(0.72, 0.05, 10, 32).rotateY(Math.PI / 2), dark, [0.7, 0, 0.95]), mesh(new THREE.TorusGeometry(0.72, 0.05, 10, 32).rotateY(Math.PI / 2), dark, [-0.7, 0, 0.95]));
      } else {
        g.add(mesh(slab(2.6, 1.6, 0.75, 0.32), gloss(body), [0, 0, 0.3]));
        if (v === 0) g.add(mesh(new THREE.OctahedronGeometry(0.34), gloss('#FFFFFF', { emissive: '#C9B6FF', emissiveIntensity: 0.4 }), [0, 0, 1.45]));
        if (v === 2) for (const x of [-0.8, 0, 0.8]) g.add(mesh(new THREE.BoxGeometry(0.08, 1.5, 0.05), gloss('#17572E'), [x, 0, 1.18]));
        if (v === 3) g.add(mesh(new THREE.BoxGeometry(2.1, 0.26, 0.06), lamp('#FFE08A', 0.9), [0, 0, 1.19]));
        if (v === 4) g.add(mesh(new THREE.BoxGeometry(2.4, 0.22, 0.06), gold, [0, 0, 1.19]));
      }
      return g;
    },
    link(edge) { // one steel chain link from above: lying flat (an oval ring) or on its edge (a bar)
      const l = mesh(new THREE.TorusGeometry(0.62, 0.2, 14, 36), metal('#D5DCE8', { roughness: 0.18 }));
      l.scale.set(1.45, 1, 1);
      if (edge) l.rotation.x = Math.PI / 2;
      return group(l);
    },
    padlock() { // the trap's gold padlock, standing up toward you
      const gold = metal('#F2C12E', { roughness: 0.25 });
      const g = group(mesh(new THREE.BoxGeometry(1.5, 1.2, 0.6), gold, [0, -0.35, 0]), mesh(new THREE.TorusGeometry(0.5, 0.14, 12, 32, Math.PI), metal('#C9D1DE', { roughness: 0.2 }), [0, 0.25, 0]));
      g.add(mesh(upZ(new THREE.CylinderGeometry(0.16, 0.16, 0.1, 20)), gloss(INK), [0, -0.25, 0.31]), mesh(new THREE.BoxGeometry(0.12, 0.34, 0.1), gloss(INK), [0, -0.5, 0.31]));
      return g;
    },
  };

  // ---------- the arena walls: a raised, bevelled frame round the field, casting its shadow on the floor ----------
  // Built in arena units, x right and y up the screen (arena y negated); the floor is z = 0 and the walls come up toward the camera.
  function walls({ W, H, M, color }) {
    const scene = new THREE.Scene(), b = 7, P = (x, y) => [x, -y];
    const out = shape([P(-M + b, -M + b), P(W + M - b, -M + b), P(W + M - b, H + M - b), P(-M + b, H + M - b)]);
    const hole = new THREE.Path();
    [P(-b, -b), P(-b, H + b), P(W + b, H + b), P(W + b, -b)].forEach(([x, y], i) => (i ? hole.lineTo(x, y) : hole.moveTo(x, y)));
    hole.closePath(); out.holes.push(hole);
    const frame = mesh(new THREE.ExtrudeGeometry(out, { depth: 12, bevelEnabled: true, bevelThickness: 6, bevelSize: b, bevelSegments: 5, curveSegments: 4 }), new THREE.MeshStandardMaterial({ color, roughness: 0.62 }));
    frame.castShadow = true; scene.add(frame);
    const floor = mesh(new THREE.PlaneGeometry(W + 2 * M, H + 2 * M), new THREE.ShadowMaterial({ opacity: 0.5 }), [W / 2, -H / 2, 0]);
    floor.receiveShadow = true; scene.add(floor);
    scene.add(new THREE.HemisphereLight('#E4EEFF', '#3A3550', 1.0));
    const sun = new THREE.DirectionalLight('#FFFFFF', 2.2);
    sun.position.set(W / 2 - 300, -H / 2 + 340, 300); sun.target.position.set(W / 2, -H / 2, 0);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005; sun.shadow.radius = 14; sun.shadow.blurSamples = 20; // soft, like a cloudy day
    Object.assign(sun.shadow.camera, { left: -360, right: 360, top: 360, bottom: -360, near: 1, far: 1400 });
    scene.add(sun, sun.target);
    const camera = new THREE.OrthographicCamera(-(W / 2 + M), W / 2 + M, H / 2 + M, -(H / 2 + M), 1, 1000);
    camera.position.set(W / 2, -H / 2, 500); camera.lookAt(W / 2, -H / 2, 0);
    return { scene, camera };
  }

  // ---------- chests: a wooden treasure chest (classic) or a ball that splits open (capsule); the lid is a child that can open ----------
  const CHEST = {
    box: { body: '#B5763A', lid: '#C98A4B', band: '#5A6478', trim: '#9AA3B5', gem: null },
    big: { body: '#2F6FE0', lid: '#4C8DFF', band: '#C9D1DE', trim: '#F2C12E', gem: '#FFFFFF' },
    mega: { body: '#6E36C8', lid: '#8E55EE', band: '#F2C12E', trim: '#FFE27A', gem: '#FF4D6D' },
  };
  const rbox = (w, h, d, r) => { // a rounded box, centred
    const s = new THREE.Shape(), x = w / 2, y = h / 2;
    s.moveTo(-x + r, -y); s.lineTo(x - r, -y); s.quadraticCurveTo(x, -y, x, -y + r); s.lineTo(x, y - r); s.quadraticCurveTo(x, y, x - r, y);
    s.lineTo(-x + r, y); s.quadraticCurveTo(-x, y, -x, y - r); s.lineTo(-x, -y + r); s.quadraticCurveTo(-x, -y, -x + r, -y);
    const g = new THREE.ExtrudeGeometry(s, { depth: d - 0.12, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 3 });
    return g.translate(0, 0, -(d - 0.12) / 2);
  };
  const crownOn = (fill, gem) => {
    const g = group(mesh(new THREE.CylinderGeometry(0.34, 0.3, 0.14, 40, 1, true), metal(fill, { side: THREE.DoubleSide })));
    for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2, pt = mesh(new THREE.ConeGeometry(0.07, 0.22, 12), metal(fill)); pt.position.set(Math.sin(a) * 0.32, 0.17, Math.cos(a) * 0.32); g.add(pt, sphere(0.045, gloss(gem), [Math.sin(a) * 0.35, 0, Math.cos(a) * 0.35])); }
    return g;
  };
  const emblem = (kind, c, depth) => { // the lock plate on the front: a keyhole, a star or a ruby
    const g = group(mesh(rbox(0.44, 0.5, 0.1, 0.08), metal(c.trim, { roughness: 0.3 }), [0, 0, depth]));
    if (kind === 'box') g.add(mesh(upZ(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 16)), gloss(INK), [0, 0.05, depth + 0.07]), mesh(new THREE.BoxGeometry(0.06, 0.14, 0.05), gloss(INK), [0, -0.06, depth + 0.07]));
    if (kind === 'big') { const st = []; for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 0.08 : 0.18; st.push([Math.cos(a) * r, -Math.sin(a) * r]); } g.add(mesh(new THREE.ExtrudeGeometry(shape(st), { depth: 0.05, bevelEnabled: false }), gloss('#1E4FB0'), [0, 0, depth + 0.05])); }
    if (kind === 'mega') g.add(mesh(new THREE.OctahedronGeometry(0.15), gloss(c.gem, { emissive: c.gem, emissiveIntensity: 0.25 }), [0, 0, depth + 0.1]));
    return g;
  };
  function treasure(kind) {
    const c = CHEST[kind] ?? CHEST.box, W = 2.2, H = 0.95, D = 1.4, R = D / 2;
    const wood = col => gloss(col, { roughness: 0.55, clearcoat: 0.3 }), strap = metal(c.band, { roughness: 0.35 });
    const g = group(mesh(rbox(W, H, D, 0.12), wood(c.body), [0, H / 2, 0]));
    for (const x of [-0.7, 0.7]) g.add(mesh(new THREE.BoxGeometry(0.2, H + 0.02, D + 0.05), strap, [x, H / 2, 0]));
    g.add(mesh(new THREE.BoxGeometry(W + 0.05, 0.12, D + 0.05), strap, [0, H - 0.04, 0]));
    for (const x of [-1, 1]) for (const z of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), metal(c.trim, { roughness: 0.3 }), [x * (W / 2 - 0.08), 0.12, z * (D / 2 - 0.08)])); // corner caps
    g.add(emblem(kind, c, D / 2 + 0.02).translateY(H * 0.62));
    const lid = new THREE.Group(); lid.position.set(0, H, -R); g.add(lid); // hinged at the back
    const shell = mesh(new THREE.CylinderGeometry(R, R, W, 40, 1, false, 0, Math.PI).rotateZ(Math.PI / 2), wood(c.lid), [0, 0, R]);
    lid.add(shell);
    for (const x of [-0.7, 0.7]) lid.add(mesh(new THREE.TorusGeometry(R + 0.03, 0.09, 10, 32, Math.PI).rotateY(Math.PI / 2), strap, [x, 0, R]));
    if (kind === 'mega') { const cr = crownOn(c.trim, c.gem); cr.position.set(0, R + 0.04, R); lid.add(cr); }
    if (kind === 'big') lid.add(mesh(new THREE.TorusGeometry(R + 0.02, 0.05, 8, 32, Math.PI).rotateY(Math.PI / 2), metal(c.trim), [0, 0, R]));
    for (let k = 0; k < 14; k++) { const a = k * 2.4, rr = 0.25 + (k % 5) * 0.12; const coin = mesh(upZ(new THREE.CylinderGeometry(0.15, 0.15, 0.05, 20)), metal('#FFC93B', { roughness: 0.25, emissive: '#7A4A08', emissiveIntensity: 0.3 })); coin.rotation.set(Math.PI / 2 + Math.sin(k) * 0.4, 0, k); coin.position.set(Math.cos(a) * rr * 1.6, H + 0.02 + (k % 3) * 0.05, Math.sin(a) * rr * 0.8); g.add(coin); } // treasure, seen when it opens
    g.userData.lid = lid;
    g.position.y = -0.85;
    return g;
  }
  function cube(kind) { // a chunky rounded box with a ball on its front
    const c = CHEST[kind] ?? CHEST.box, S = 1.8, H = 1.05;
    const g = group(mesh(rbox(S, H, S, 0.24), gloss(c.body, { roughness: 0.35 }), [0, H / 2, 0]));
    g.add(mesh(rbox(S + 0.06, 0.18, S + 0.06, 0.08), metal(c.band, { roughness: 0.3 }), [0, H - 0.1, 0]));
    const ball = group(sphere(0.38, gloss(c.trim, { metalness: 0.3 })), mesh(new THREE.TorusGeometry(0.38, 0.05, 10, 40), gloss(INK)));
    if (kind === 'mega') ball.add(mesh(new THREE.OctahedronGeometry(0.16), gloss(c.gem, { emissive: c.gem, emissiveIntensity: 0.25 }), [0, 0, 0.36]));
    else if (kind === 'big') ball.add(sphere(0.12, gloss('#1E4FB0'), [0, 0, 0.32]));
    else ball.add(mesh(upZ(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 16)), gloss(INK), [0, 0.04, 0.37]), mesh(new THREE.BoxGeometry(0.06, 0.12, 0.05), gloss(INK), [0, -0.06, 0.37]));
    ball.position.set(0, H * 0.42, S / 2 + 0.06); g.add(ball);
    const lid = new THREE.Group(); lid.position.set(0, H, -S / 2); g.add(lid);
    lid.add(mesh(rbox(S + 0.1, 0.42, S + 0.1, 0.24), gloss(c.lid, { roughness: 0.3 }), [0, 0.21, S / 2]));
    if (kind === 'mega') { const cr = crownOn(c.trim, c.gem); cr.position.set(0, 0.5, S / 2); lid.add(cr); }
    if (kind === 'big') lid.add(mesh(new THREE.TorusGeometry(0.5, 0.06, 10, 40).rotateX(Math.PI / 2), metal(c.trim), [0, 0.44, S / 2]));
    for (let k = 0; k < 14; k++) { const a = k * 2.4, rr = 0.2 + (k % 5) * 0.12; const coin = mesh(upZ(new THREE.CylinderGeometry(0.15, 0.15, 0.05, 20)), metal('#FFC93B', { roughness: 0.25, emissive: '#7A4A08', emissiveIntensity: 0.3 })); coin.rotation.set(Math.PI / 2 + Math.sin(k) * 0.4, 0, k); coin.position.set(Math.cos(a) * rr * 1.4, H + 0.02 + (k % 3) * 0.05, Math.sin(a) * rr * 1.2); g.add(coin); }
    g.userData.lid = lid;
    g.position.y = -0.75;
    return g;
  }
  // A crate like a garage game's: planks with dark gaps between them, iron corner posts, a padlock; the lid is a plank top.
  const grain = canvasTex(128, 128, (c, w) => {
    c.fillStyle = '#FFFFFF'; c.fillRect(0, 0, w, w);
    for (let i = 0; i < 22; i++) {
      c.strokeStyle = `rgba(80, 45, 15, ${0.07 + (i % 4) * 0.05})`; c.lineWidth = 1 + (i % 3);
      const y = (i * 37) % w; c.beginPath(); c.moveTo(0, y);
      for (let x = 0; x <= w; x += 16) c.lineTo(x, y + Math.sin(x / 19 + i) * 3);
      c.stroke();
    }
  });
  const CRATE = {
    box: { wood: '#C98F52', core: '#4A2A12', iron: '#5E6675', mark: null },
    big: { wood: '#4383E8', core: '#14306A', iron: '#DDE3EC', mark: '#FFFFFF' },
    mega: { wood: '#8C52E2', core: '#30155E', iron: '#F2C12E', mark: '#FF4D6D' },
  };
  const coins = (g, y, sx, sz) => { for (let k = 0; k < 14; k++) { const a = k * 2.4, rr = 0.2 + (k % 5) * 0.12; const coin = mesh(upZ(new THREE.CylinderGeometry(0.15, 0.15, 0.05, 20)), metal('#FFC93B', { roughness: 0.25, emissive: '#7A4A08', emissiveIntensity: 0.3 })); coin.rotation.set(Math.PI / 2 + Math.sin(k) * 0.4, 0, k); coin.position.set(Math.cos(a) * rr * sx, y + (k % 3) * 0.05, Math.sin(a) * rr * sz); g.add(coin); } };
  const padlock = (col, p) => group(mesh(rbox(0.36, 0.3, 0.12, 0.06), metal(col, { roughness: 0.4 }), p),
    mesh(new THREE.TorusGeometry(0.11, 0.035, 8, 20, Math.PI), metal('#C9D1DE', { roughness: 0.3 }), [p[0], p[1] + 0.15, p[2]]),
    mesh(upZ(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 12)), gloss(INK), [p[0], p[1] - 0.02, p[2] + 0.07]));
  function crate(kind) {
    const c = CRATE[kind] ?? CRATE.box, W = 2.1, H = 1.2, D = 1.5, wood = gloss(c.wood, { map: grain }), iron = metal(c.iron, { roughness: 0.45 }), ph = H / 3;
    const g = group(mesh(new THREE.BoxGeometry(W - 0.1, H - 0.04, D - 0.1), gloss(c.core), [0, H / 2, 0]));
    for (let i = 0; i < 3; i++) {
      const y = ph * (i + 0.5);
      for (const z of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(W - 0.1, ph - 0.07, 0.1), wood, [0, y, z * (D / 2 - 0.05)]));
      for (const x of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.1, ph - 0.07, D - 0.1), wood, [x * (W / 2 - 0.05), y, 0]));
    }
    for (const x of [-1, 1]) for (const z of [-1, 1]) {
      g.add(mesh(new THREE.BoxGeometry(0.2, H + 0.04, 0.2), iron, [x * (W / 2 - 0.04), H / 2, z * (D / 2 - 0.04)]));
      for (const y of [0.18, H / 2, H - 0.18]) g.add(sphere(0.04, iron, [x * (W / 2 - 0.04), y, z * (D / 2 + 0.07)]));
    }
    if (kind === 'big') { const st = []; for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 0.11 : 0.26; st.push([Math.cos(a) * r, -Math.sin(a) * r]); } g.add(mesh(new THREE.ExtrudeGeometry(shape(st), { depth: 0.03, bevelEnabled: false }), gloss(c.mark), [0, H * 0.34, D / 2 + 0.005])); }
    if (kind === 'mega') g.add(mesh(rbox(0.44, 0.34, 0.06, 0.06), metal(c.iron), [0, H * 0.32, D / 2 + 0.03]), mesh(new THREE.OctahedronGeometry(0.13), gloss(c.mark, { emissive: c.mark, emissiveIntensity: 0.25 }), [0, H * 0.32, D / 2 + 0.11]));
    g.add(padlock(kind === 'box' ? '#8A93A3' : c.iron, [0, H - 0.2, D / 2 + 0.1]));
    coins(g, H - 0.02, 1.5, 0.9);
    const lid = new THREE.Group(); lid.position.set(0, H, -D / 2); g.add(lid);
    for (let i = 0; i < 3; i++) lid.add(mesh(new THREE.BoxGeometry(W + 0.04, 0.16, D / 3 - 0.05), wood, [0, 0.08, D / 6 + i * D / 3]));
    for (const x of [-1, 1]) for (const z of [0.1, D - 0.1]) lid.add(mesh(new THREE.BoxGeometry(0.24, 0.2, 0.24), iron, [x * (W / 2 - 0.04), 0.1, z]));
    lid.add(mesh(new THREE.BoxGeometry(0.2, 0.2, 0.05), iron, [0, -0.02, D + 0.04])); // the hasp the padlock hangs on
    g.userData.lid = lid;
    g.position.y = -0.8;
    return g;
  }

  // A steel safe: a dial, a handle wheel and bolts on a door that swings open on its left hinges; gold bars inside.
  const SAFE = {
    box: { paint: '#7D8CA3', door: '#66758C', trim: '#D3D9E3', gem: null },
    big: { paint: '#2F6FE0', door: '#2457B8', trim: '#E8EEF7', gem: '#FFFFFF' },
    mega: { paint: '#E2A925', door: '#C48A12', trim: '#FFF0B3', gem: '#FF4D6D' },
  };
  function safe(kind) {
    const c = SAFE[kind] ?? SAFE.box, W = 1.9, H = 1.55, D = 1.45, T = 0.16, paint = metal(c.paint, { roughness: 0.5, metalness: 0.6 }), trim = metal(c.trim, { roughness: 0.35 }), dark = gloss('#1A1F2E');
    const g = group(mesh(new THREE.BoxGeometry(W, T, D), paint, [0, T / 2, 0]), mesh(new THREE.BoxGeometry(W, T, D), paint, [0, H - T / 2, 0]),
      mesh(new THREE.BoxGeometry(T, H, D), paint, [-W / 2 + T / 2, H / 2, 0]), mesh(new THREE.BoxGeometry(T, H, D), paint, [W / 2 - T / 2, H / 2, 0]),
      mesh(new THREE.BoxGeometry(W, H, T), paint, [0, H / 2, -D / 2 + T / 2]), mesh(new THREE.BoxGeometry(W - 2 * T - 0.02, H - 2 * T - 0.02, D - T), gloss('#1A1F2E', { side: THREE.BackSide }), [0, H / 2, T / 2]));
    for (const x of [-1, 1]) for (const z of [-1, 1]) g.add(mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.12, 16), dark, [x * (W / 2 - 0.22), -0.05, z * (D / 2 - 0.22)]));
    for (let i = 0; i < 3; i++) g.add(mesh(new THREE.BoxGeometry(0.42, 0.18, 0.5), metal('#FFC93B', { roughness: 0.3, emissive: '#7A4A08', emissiveIntensity: 0.3 }), [-0.42 + i * 0.42, T + 0.09, D / 2 - 0.35]));
    for (let i = 0; i < 2; i++) g.add(mesh(new THREE.BoxGeometry(0.42, 0.18, 0.5), metal('#FFC93B', { roughness: 0.3, emissive: '#7A4A08', emissiveIntensity: 0.3 }), [-0.21 + i * 0.42, T + 0.27, D / 2 - 0.35]));
    const lid = new THREE.Group(); lid.position.set(-W / 2 + 0.02, H / 2, D / 2); g.add(lid); // hinged on the left
    const door = group(mesh(rbox(W - 0.04, H - 0.04, 0.16, 0.1), paint, [W / 2, 0, 0.08]), mesh(rbox(W - 0.4, H - 0.4, 0.06, 0.08), gloss(c.door), [W / 2, 0, 0.18]));
    for (const y of [-0.45, 0.45]) door.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.28, 16), trim, [-0.02, y, 0.1]));
    for (const x of [0.3, W - 0.3]) for (const y of [-0.5, 0.5]) door.add(sphere(0.05, trim, [x, y, 0.22]));
    const dial = group(mesh(upZ(new THREE.CylinderGeometry(0.27, 0.29, 0.08, 40)), trim), mesh(upZ(new THREE.CylinderGeometry(0.17, 0.17, 0.06, 32)), gloss(INK), [0, 0, 0.05]));
    for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; dial.add(mesh(new THREE.BoxGeometry(0.025, 0.07, 0.02), gloss(INK), [Math.sin(a) * 0.23, Math.cos(a) * 0.23, 0.045]).rotateZ(-a)); }
    dial.add(c.gem ? mesh(new THREE.OctahedronGeometry(0.08), gloss(c.gem, { emissive: c.gem, emissiveIntensity: 0.25 }), [0, 0, 0.12]) : mesh(new THREE.BoxGeometry(0.04, 0.12, 0.04), trim, [0, 0.05, 0.1]));
    dial.position.set(W / 2 - 0.3, 0.12, 0.25); door.add(dial);
    const wheel = group(mesh(upZ(new THREE.CylinderGeometry(0.07, 0.07, 0.1, 16)), trim));
    for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2; wheel.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.42, 10), trim, [0, 0, 0.04]).rotateZ(a), sphere(0.055, trim, [Math.sin(a) * 0.21, Math.cos(a) * 0.21, 0.04]), sphere(0.055, trim, [-Math.sin(a) * 0.21, -Math.cos(a) * 0.21, 0.04])); }
    wheel.position.set(W / 2 + 0.38, -0.2, 0.26); door.add(wheel);
    lid.add(door);
    g.userData.lid = lid;
    g.position.y = -0.78;
    return g;
  }

  // How a chest is finished: 'gloss' keeps the shiny paint; 'matte' is soft paint and wood that barely reflect;
  // 'toon' is flat bands of colour with an ink outline, like a cartoon.
  const ramp = new THREE.DataTexture(new Uint8Array([120, 120, 120, 255, 190, 190, 190, 255, 255, 255, 255, 255]), 3, 1);
  ramp.minFilter = ramp.magFilter = THREE.NearestFilter; ramp.needsUpdate = true;
  const ink = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
  ink.onBeforeCompile = s => { s.vertexShader = s.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = position + normal * 0.035;'); };
  function finish(g, look) {
    if (look === 'gloss') return g;
    const hulls = [];
    g.traverse(o => {
      if (!o.isMesh) return;
      const m = o.material, hard = m.metalness > 0.5, base = { color: m.color, map: m.map, side: m.side, emissive: m.emissive, emissiveIntensity: m.emissiveIntensity };
      o.material = look === 'toon' ? new THREE.MeshToonMaterial({ ...base, gradientMap: ramp })
        : new THREE.MeshStandardMaterial({ ...base, roughness: hard ? 0.5 : 0.85, metalness: hard ? 0.35 : 0, envMapIntensity: 0.35 });
      if (look === 'toon') hulls.push(o);
    });
    for (const o of hulls) o.add(new THREE.Mesh(o.geometry, ink));
    return g;
  }
  const LOOK = { matte: 'matte', toon: 'toon', crate: 'matte', safe: 'matte', 'crate-toon': 'toon', 'safe-toon': 'toon' };
  // ---------- menu icons: chunky toy-like objects for the buttons (shop, balls, clan, profile, quests, leaders, friends, duel, gear) ----------
  const toyBall = (col, r, p) => { const b = group(sphere(r, gloss(col)), mesh(new THREE.SphereGeometry(r * 0.32, 20, 12), gloss('#FFFFFF', { transparent: true, opacity: 0.7 }), [-r * 0.38, r * 0.42, r * 0.72])); b.children[1].scale.set(1, 0.6, 0.4); b.position.set(...p); return b; };
  const bust = (shirt, skin = '#FFD7B0', hair = '#5A3A22', p = [0, 0, 0], s = 1) => {
    const g = group(mesh(new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), gloss(shirt), [0, -1.05, 0]));
    g.children[0].scale.set(1.05, 0.8, 0.8);
    g.add(sphere(0.62, gloss(skin, { roughness: 0.6, clearcoat: 0.2 }), [0, 0.2, 0]));
    const cap = mesh(new THREE.SphereGeometry(0.66, 40, 20, 0, Math.PI * 2, 0, Math.PI * 0.42), gloss(hair), [0, 0.24, -0.02]); cap.rotation.x = -0.25; g.add(cap);
    for (const x of [-0.22, 0.22]) g.add(sphere(0.08, gloss(INK), [x, 0.22, 0.56]));
    g.position.set(...p); g.scale.setScalar(s);
    return g;
  };
  const star5 = (r, inner) => { const st = []; for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, q = k % 2 ? inner : r; st.push([Math.cos(a) * q, -Math.sin(a) * q]); } return shape(st); };
  const ICON = {
    shop() { // a market stall: a counter, two posts, a red-and-white striped awning, a gold coin sign
      const wood = gloss('#C98A4B', { roughness: 0.55, clearcoat: 0.2 }), dark = gloss('#8A5A2B', { roughness: 0.6 });
      const g = group(mesh(rbox(2.3, 1.0, 1.0, 0.12), wood, [0, -0.85, 0]), mesh(new THREE.BoxGeometry(2.45, 0.16, 1.15), dark, [0, -0.3, 0.02]));
      for (const x of [-1.05, 1.05]) g.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.4, 12), dark, [x, 0.38, 0.2]));
      for (let i = 0; i < 6; i++) {
        const w = 2.6 / 6, x = -1.3 + w * (i + 0.5), m = gloss(i % 2 ? '#FFFFFF' : '#FF4D5E');
        const strip = mesh(new THREE.BoxGeometry(w + 0.01, 0.12, 0.95), m, [x, 1.12, 0.12]); strip.rotation.x = 0.5; g.add(strip);
        g.add(mesh(new THREE.CylinderGeometry(w / 2, w / 2, 0.12, 20, 1, false, Math.PI / 2, Math.PI).rotateX(Math.PI / 2), m, [x, 0.9, 0.56]));
      }
      g.add(mesh(upZ(new THREE.CylinderGeometry(0.34, 0.34, 0.1, 32)), metal('#FFC93B', { roughness: 0.3 }), [0, -0.78, 0.55]), mesh(new THREE.ExtrudeGeometry(star5(0.2, 0.09), { depth: 0.04, bevelEnabled: false }), gloss('#F08A00'), [0, -0.78, 0.6]));
      return g;
    },
    balls() { return group(toyBall('#FF4D5E', 0.85, [0.45, 0.45, -0.2]), toyBall('#4CC9F0', 0.95, [-0.4, -0.35, 0.3])); },
    clan() { // a blue flag with a gold star on a wooden pole
      const g = group(mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.7, 14), gloss('#8A5A2B'), [-1.1, -0.15, 0]), sphere(0.18, metal('#FFC93B'), [-1.1, 1.25, 0]));
      const cloth = new THREE.PlaneGeometry(2.2, 1.5, 20, 6), p = cloth.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, Math.sin((x + 1) * 2.2) * 0.16 * (x + 1)); }
      cloth.computeVertexNormals();
      g.add(mesh(cloth, gloss('#4CC9F0', { side: THREE.DoubleSide }), [0.02, 0.38, 0]));
      g.add(mesh(new THREE.ExtrudeGeometry(star5(0.44, 0.19), { depth: 0.04, bevelEnabled: false }), gloss('#FFCC33'), [0.02, 0.38, 0.22]));
      return g;
    },
    profile() { return bust('#4CC9F0', undefined, undefined, [0, -0.05, 0], 1.25); },
    friends() { return group(bust('#FFCC33', '#F2C29A', '#2A1A10', [0.62, 0.05, -0.3], 0.95), bust('#4CC9F0', '#FFD7B0', '#7A4A22', [-0.55, -0.15, 0.3], 1.0)); },
    quests() { // a clipboard with a paper and a big green tick
      const g = group(mesh(rbox(1.9, 2.4, 0.16, 0.18), gloss('#C98A4B', { roughness: 0.55 }), [0, -0.1, 0]), mesh(rbox(1.55, 1.95, 0.05, 0.06), gloss('#FFFFFF', { roughness: 0.7 }), [0, -0.2, 0.11]));
      g.add(mesh(rbox(0.9, 0.42, 0.22, 0.1), metal('#C9D1DE', { roughness: 0.3 }), [0, 1.05, 0.06]));
      const tick = new THREE.Shape(); tick.moveTo(-0.55, 0); tick.lineTo(-0.3, 0.25); tick.lineTo(-0.1, 0.02); tick.lineTo(0.42, 0.62); tick.lineTo(0.66, 0.38); tick.lineTo(-0.1, -0.48); tick.closePath();
      g.add(mesh(new THREE.ExtrudeGeometry(tick, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2 }), gloss('#2FB85A'), [0, -0.25, 0.14]));
      return g;
    },
    leaders() { // a gold crown with a ruby
      const gold = metal('#FFC93B', { roughness: 0.25 }), g = group(mesh(new THREE.CylinderGeometry(1.0, 0.92, 0.7, 48, 1, true), gold.clone(), [0, -0.5, 0]));
      g.children[0].material.side = THREE.DoubleSide;
      for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2 + Math.PI / 2, pt = mesh(new THREE.ConeGeometry(0.3, 0.95, 16), gold, [Math.cos(a) * 0.93, 0.1, Math.sin(a) * 0.93]); g.add(pt, sphere(0.13, metal('#FFE27A', { roughness: 0.2 }), [Math.cos(a) * 0.93, 0.6, Math.sin(a) * 0.93])); }
      g.add(mesh(new THREE.OctahedronGeometry(0.26), gloss('#FF4D6D', { emissive: '#FF4D6D', emissiveIntensity: 0.2 }), [0, -0.45, 1.0]));
      g.add(mesh(new THREE.TorusGeometry(0.97, 0.07, 10, 48).rotateX(Math.PI / 2), gold, [0, -0.85, 0]));
      g.rotation.x = 0.25;
      return g;
    },
    duel() { // two crossed swords
      const sword = a => { const s = group(mesh(new THREE.BoxGeometry(0.22, 2.4, 0.08), metal('#E6EDF7', { roughness: 0.2 }), [0, 0.45, 0]), mesh(new THREE.ConeGeometry(0.16, 0.36, 4), metal('#E6EDF7', { roughness: 0.2 }), [0, 1.82, 0]),
        mesh(rbox(0.95, 0.2, 0.18, 0.06), metal('#FFC93B'), [0, -0.78, 0]), mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.6, 12), gloss('#8A5A2B'), [0, -1.18, 0]), sphere(0.15, metal('#FFC93B'), [0, -1.5, 0])); s.rotation.z = a; return s; };
      return group(sword(0.75), sword(-0.75));
    },
    gear() { // a chunky steel cog
      const s = new THREE.Shape(), n = 8;
      for (let k = 0; k < n * 4; k++) { const a = (k / (n * 4)) * Math.PI * 2, r = (k % 4 === 1 || k % 4 === 2) ? 1.3 : 1.0; k ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
      s.holes.push(new THREE.Path().absarc(0, 0, 0.42, 0, Math.PI * 2, true));
      return group(mesh(new THREE.ExtrudeGeometry(s, { depth: 0.35, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 3 }).translate(0, 0, -0.17), metal('#AEB8C8', { roughness: 0.35 })));
    },
  };
  function capsule(kind) {
    const c = CHEST[kind] ?? CHEST.box, top = { box: '#F4EFE6', big: '#EAF2FF', mega: '#FFF0B8' }[kind] ?? '#F4EFE6';
    const g = group(mesh(new THREE.SphereGeometry(1, 64, 32, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), gloss(c.body), [0, 0, 0]));
    g.add(mesh(new THREE.TorusGeometry(1.01, 0.09, 12, 64).rotateX(Math.PI / 2), metal(c.band, { roughness: 0.3 }), [0, 0, 0])); // the band round the middle
    const lid = new THREE.Group(); lid.position.set(0, 0, -1); g.add(lid);
    lid.add(mesh(new THREE.SphereGeometry(1, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2), gloss(top), [0, 0, 1]));
    if (kind === 'mega') { const cr = crownOn(c.trim, c.gem); cr.position.set(0, 0.98, 1); lid.add(cr); }
    if (kind === 'big') lid.add(mesh(new THREE.TorusGeometry(0.72, 0.05, 10, 48).rotateX(Math.PI / 2), metal(c.trim), [0, 0.68, 1]));
    const btn = group(mesh(upZ(new THREE.CylinderGeometry(0.3, 0.32, 0.14, 32)), metal(c.trim, { roughness: 0.3 })));
    if (kind === 'box') btn.add(mesh(upZ(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 16)), gloss(INK), [0, 0.04, 0.09]), mesh(new THREE.BoxGeometry(0.06, 0.12, 0.05), gloss(INK), [0, -0.06, 0.09]));
    if (kind === 'big') btn.add(sphere(0.12, gloss('#1E4FB0'), [0, 0, 0.08]));
    if (kind === 'mega') btn.add(mesh(new THREE.OctahedronGeometry(0.15), gloss(c.gem, { emissive: c.gem, emissiveIntensity: 0.25 }), [0, 0, 0.12]));
    btn.position.set(0, 0, 1.03); g.add(btn);
    g.userData.lid = lid;
    return g;
  }

  return {
    skin, walls,
    chest: (kind, style = 'classic', open = 0) => { // style: classic, matte, toon, crate, safe (crate-toon, safe-toon), cube, capsule
      const form = { capsule, cube, crate, safe }[style.split('-')[0]] ?? treasure, g = finish(form(kind), LOOK[style] ?? 'gloss');
      if (form === safe) g.userData.lid.rotation.y = -open * 1.3; else g.userData.lid.rotation.x = -open;
      return g;
    },
    prop: (kind, v) => (PROP[kind] ?? PROP.rock)(v),
    icon: (kind, look = 'gloss') => finish((ICON[kind] ?? ICON.balls)(), look),
    ball: id => (B[id] ?? B.basic)(),
    boss: id => { const g = (BOSS[id] ?? BOSS.slime)(); g.scale.setScalar(1.25); return g; },
    stage, shadow,
  };
}
