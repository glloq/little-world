import * as THREE from 'three';

/** Sky is visual only: one draw call, one 128² shared alpha map, no shadow pass or physics.
 * The dome follows the actual camera, not the interpolated player position. */
export function createSkyRenderer(scene: THREE.Scene, camera: THREE.PerspectiveCamera, seed: number) {
  // Reproducible A/B captures: ?sky=off | sun | 2d (default).
  const mode = new URLSearchParams(location.search).get('sky');
  const size = 128;
  const bytes = new Uint8Array(size * size * 4);
  // Generate a periodic, inexpensive multi-scale cloud atlas ONCE on the CPU.
  // Wrapped lattice noise avoids seams when the wind scrolls over long sessions.
  function hash(x: number, y: number) {
    let h = Math.imul(x + seed, 374761393) + Math.imul(y - seed, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }
  function noise(x: number, y: number, scale: number) {
    const fx = x * scale / size, fy = y * scale / size;
    const ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = fx - ix, ty = fy - iy;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const wrap = (v: number) => (v % scale + scale) % scale;
    const a = THREE.MathUtils.lerp(hash(wrap(ix), wrap(iy)), hash(wrap(ix + 1), wrap(iy)), sx);
    const b = THREE.MathUtils.lerp(hash(wrap(ix), wrap(iy + 1)), hash(wrap(ix + 1), wrap(iy + 1)), sx);
    return THREE.MathUtils.lerp(a, b, sy);
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const n = noise(x, y, 5) * .60 + noise(x, y, 11) * .29 + noise(x, y, 23) * .11;
    const i = (y * size + x) * 4;
    bytes[i] = bytes[i + 1] = bytes[i + 2] = Math.round(255 * n);
    bytes[i + 3] = 255;
  }
  const atlas = new THREE.DataTexture(bytes, size, size, THREE.RGBAFormat);
  atlas.wrapS = atlas.wrapT = THREE.RepeatWrapping;
  atlas.magFilter = atlas.minFilter = THREE.LinearFilter;
  atlas.generateMipmaps = false;
  atlas.needsUpdate = true;
  const uniforms = {
    baseColor: {value: new THREE.Color('#cce6e2')},
    sunDirection: {value: new THREE.Vector3(0, 1, 0)},
    sunAltitude: {value: 1},
    cloudCover: {value: 0},
    wind: {value: 0},
    time: {value: 0},
    enabledClouds: {value: 1},
    atlas: {value: atlas},
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
    vertexShader: `
      varying vec3 vSkyDir;
      void main() {
        vSkyDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 baseColor;
      uniform vec3 sunDirection;
      uniform float sunAltitude;
      uniform float cloudCover;
      uniform float wind;
      uniform float time;
      uniform float enabledClouds;
      uniform sampler2D atlas;
      varying vec3 vSkyDir;
      void main() {
        vec3 dir = normalize(vSkyDir);
        float horizon = 1.0 - smoothstep(-0.10, 0.38, dir.y);
        float daytime = smoothstep(-0.18, 0.18, sunAltitude);
        vec3 zenith = baseColor * vec3(.70, .83, 1.08);
        vec3 sky = mix(zenith, baseColor * 1.13, horizon * daytime);
        // All clouds and the solar disc share a single sky pass.
        vec2 cloudUv = dir.xz / max(dir.y + .48, .19) * .18;
        cloudUv += vec2(1.0, .36) * (time * (.000015 + wind * .000027));
        float density = texture2D(atlas, cloudUv).r;
        float mask = smoothstep(.81 - cloudCover * .48, .92 - cloudCover * .48, density);
        mask *= smoothstep(-.04, .19, dir.y) * enabledClouds;
        vec3 clouds = mix(vec3(.60, .65, .69), vec3(.99, .98, .94), daytime);
        sky = mix(sky, clouds, mask * .94);
        float angle = dot(dir, normalize(sunDirection));
        float sunVisible = smoothstep(-.035, .035, sunAltitude);
        float disc = smoothstep(.99976, .99988, angle);
        float halo = smoothstep(.986, 1.0, angle) * .25;
        float sunset = 1.0 - smoothstep(.0, .45, sunAltitude);
        vec3 sunlight = mix(vec3(1.0, .98, .83), vec3(1.0, .55, .21), sunset);
        sky += sunlight * (disc * .8 + halo) * sunVisible * (1.0 - mask);
        gl_FragColor = vec4(sky, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const geometry = new THREE.SphereGeometry(1, 24, 12);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'EnvironmentSky';
  mesh.renderOrder = -10000;
  mesh.frustumCulled = false;
  scene.add(mesh);
  let cloudsEnabled = true;
  function update(params: {color: THREE.Color; sunDirection: THREE.Vector3; sunAltitude: number; cloudCover: number; wind: number; time: number; detail: number; underground: boolean}) {
    mesh.visible = !params.underground && mode !== 'off';
    if (!mesh.visible) return;
    mesh.position.copy(camera.position);
    mesh.scale.setScalar(Math.max(camera.near * 2, camera.far * .8));
    uniforms.baseColor.value.copy(params.color);
    uniforms.sunDirection.value.copy(params.sunDirection);
    uniforms.sunAltitude.value = params.sunAltitude;
    uniforms.cloudCover.value = params.cloudCover;
    uniforms.wind.value = params.wind;
    uniforms.time.value = params.time;
    cloudsEnabled = params.detail < 2 && mode !== 'sun';
    uniforms.enabledClouds.value = cloudsEnabled ? 1 : 0;
  }
  return {
    update,
    get metrics() { return {mode: mode === 'off' || mode === 'sun' ? mode : '2d', visible: mesh.visible, clouds2d: mesh.visible && cloudsEnabled, clouds3d: 0, skyDrawCalls: mesh.visible ? 1 : 0, skyTextureBytes: bytes.byteLength}; },
    dispose() {mesh.removeFromParent(); geometry.dispose(); material.dispose(); atlas.dispose();},
  };
}
