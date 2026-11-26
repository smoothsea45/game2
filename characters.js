import * as THREE from './vendor/three.module.js';

const dye = {
  ink: '#292b2a', shoe: '#46372b', sole: '#cdb98d', hemp: '#e7d9ad',
  linen: '#f6e8cc', brown: '#885b38', bamboo: '#a87b44', straw: '#dbbb74',
  face: '#c98e68', cheek: '#dca780', paper: '#f2e7bc'
};

const costumes = {
  master:     { jacket: '#286567', sleeve: '#316d70', hem: '#235654', sash: '#ba8956', trousers: '#cfbc96', hat: 'gat', face: '#be8966' },
  apprentice: { jacket: '#70a9a2', sleeve: '#bcd1bd', hem: '#618c80', sash: '#495853', trousers: '#dfcc9f', hat: 'wrap', face: '#d4a179' },
  porter:     { jacket: '#ab925a', sleeve: '#e0c79c', hem: '#927947', sash: '#715137', trousers: '#65777b', hat: 'wrap', face: '#b7815d' },
  rival:      { jacket: '#98503e', sleeve: '#a76149', hem: '#7f4437', sash: '#dbaf64', trousers: '#aaa087', hat: 'straw', face: '#bb8661' },
  vendor:     { jacket: '#b97753', sleeve: '#d19572', hem: '#496d70', sash: '#943f40', trousers: '#5a7976', hat: 'braid', face: '#d7a17b' },
  resident:   { jacket: '#a8a69b', sleeve: '#dccfba', hem: '#657785', sash: '#70745e', trousers: '#7d8c8b', hat: 'wrap', face: '#c59276' }
};

const unit = new THREE.BoxGeometry(1, 1, 1);
const faceShape = new THREE.SphereGeometry(1, 8, 6);
const sharedMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const cylinders = new Map();

function cylinder(upperRadius, sides) {
  const key = upperRadius + '-' + sides;
  if (!cylinders.has(key)) {
    cylinders.set(key, new THREE.CylinderGeometry(upperRadius, 1, 1, sides));
  }
  return cylinders.get(key);
}

// Each independently animated body part is one vertex-coloured mesh.
function part() {
  const positions = [];
  const normals = [];
  const colours = [];

  function add(geometry, x, y, z, width, height, depth, colour, rx = 0, ry = 0, rz = 0) {
    const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz));
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z), rotation, new THREE.Vector3(width, height, depth)
    );
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
    const paint = new THREE.Color(colour);
    const p = new THREE.Vector3();
    const n = new THREE.Vector3();
    const source = geometry.attributes;
    const count = geometry.index ? geometry.index.count : source.position.count;
    for (let i = 0; i < count; i++) {
      const j = geometry.index ? geometry.index.getX(i) : i;
      p.fromBufferAttribute(source.position, j).applyMatrix4(matrix);
      n.fromBufferAttribute(source.normal, j).applyNormalMatrix(normalMatrix);
      positions.push(p.x, p.y, p.z);
      normals.push(n.x, n.y, n.z);
      colours.push(paint.r, paint.g, paint.b);
    }
  }

  return {
    box: (...args) => add(unit, ...args),
    oval: (...args) => add(faceShape, ...args),
    taper: (ratio, sides, ...args) => add(cylinder(ratio, sides), ...args),
    mesh() {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, sharedMaterial);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    }
  };
}

function torso(id, clothes) {
  const p = part();
  const skirt = id === 'master' || id === 'vendor' || id === 'rival';
  const length = skirt ? 0.58 : 0.28;
  p.taper(0.73, 10, 0, 0.96 - length / 2, 0, skirt ? 0.33 : 0.29, length, 0.21, clothes.hem);
  p.taper(1.16, 8, 0, 1.13, 0, 0.265, 0.49, 0.188, clothes.jacket);
  p.taper(1, 10, 0, 0.957, 0, 0.284, 0.076, 0.207, clothes.sash);
  p.box(0.15, 0.87, 0.17, 0.059, 0.18, 0.025, clothes.sash, 0, 0, 0.16);
  p.box(0.06, 1.266, 0.188, 0.062, 0.30, 0.025, dye.linen, -0.06, 0, -0.56);
  p.box(-0.058, 1.306, 0.188, 0.055, 0.19, 0.026, dye.hemp, -0.06, 0, 0.63);
  if (id === 'apprentice') {
    p.box(0, 0.94, 0.202, 0.36, 0.38, 0.03, dye.hemp, 0.025);
  }
  p.taper(1.06, 8, 0, 1.398, 0.004, 0.091, 0.14, 0.088, clothes.face);
  p.oval(0, 1.596, 0.005, 0.215, 0.251, 0.192, clothes.face);
  p.box(0, 1.565, 0.184, 0.065, 0.06, 0.06, dye.cheek);
  for (const side of [-1, 1]) {
    p.box(side * 0.081, 1.625, 0.175, 0.048, 0.021, 0.025, dye.ink);
    p.oval(side * 0.202, 1.58, -0.004, 0.034, 0.057, 0.046, clothes.face);
  }
  p.oval(0, 1.726, -0.017, 0.218, 0.136, 0.193, dye.ink);
  if (clothes.hat === 'gat') {
    p.taper(0.58, 16, 0, 1.812, -0.01, 0.388, 0.067, 0.359, '#353b37');
    p.taper(0.77, 12, 0, 1.935, -0.01, 0.169, 0.226, 0.16, '#252e2d');
    p.taper(0.98, 12, 0, 1.852, -0.01, 0.175, 0.031, 0.166, '#56554a');
    p.box(-0.046, 1.522, 0.18, 0.077, 0.029, 0.027, dye.ink, 0, 0, 0.13);
    p.box(0.046, 1.522, 0.18, 0.077, 0.029, 0.027, dye.ink, 0, 0, -0.13);
    p.taper(2.2, 5, 0, 1.44, 0.143, 0.035, 0.085, 0.024, dye.ink);
  } else if (clothes.hat === 'straw') {
    p.taper(0.13, 12, 0, 1.858, -0.019, 0.356, 0.226, 0.335, dye.straw);
    p.taper(0.88, 12, 0, 1.773, -0.019, 0.363, 0.041, 0.34, dye.bamboo);
  } else if (clothes.hat === 'braid') {
    p.oval(0, 1.583, -0.207, 0.128, 0.131, 0.093, dye.ink);
    p.box(0, 1.49, -0.218, 0.075, 0.12, 0.05, clothes.sash, 0.1);
  } else {
    p.taper(1, 10, 0, 1.713, -0.004, 0.226, 0.077, 0.195, dye.linen);
    p.taper(0.85, 8, 0, 1.851, -0.038, 0.081, 0.101, 0.079, dye.ink);
    p.box(-0.155, 1.644, -0.148, 0.072, 0.19, 0.06, dye.hemp, 0, 0, -0.21);
  }

  if (id === 'porter' || id === 'rival') {
    for (const side of [-1, 1]) {
      p.box(side * 0.156, 1.16, -0.25, 0.055, 0.91, 0.065, dye.bamboo, -0.14, 0, side * -0.14);
      p.box(side * 0.162, 1.19, 0.172, 0.055, 0.41, 0.046, dye.brown, 0.02, 0, side * 0.16);
    }
    p.box(0, 0.893, -0.32, 0.48, 0.055, 0.35, dye.bamboo);
    p.box(0, 1.21, -0.254, 0.34, 0.065, 0.051, dye.straw);
  }
  return p.mesh();
}

function createArm(side, clothes) {
  const p = part();
  p.taper(0.74, 7, 0.038 * side, -0.142, 0, 0.139, 0.324, 0.124, clothes.sleeve, 0, 0, 0.15 * side);
  p.taper(1, 7, 0.063 * side, -0.301, 0.014, 0.112, 0.081, 0.104, dye.hemp, -0.20);
  p.oval(0.06 * side, -0.376, 0.034, 0.083, 0.085, 0.075, clothes.face);
  const mesh = p.mesh();
  mesh.position.set(0.258 * side, 1.343, 0);
  return mesh;
}

function createLeg(side, clothes) {
  const p = part();
  p.taper(1.2, 8, 0, -0.244, 0, 0.134, 0.48, 0.133, clothes.trousers);
  p.taper(1.37, 8, 0, -0.55, -0.002, 0.084, 0.22, 0.094, dye.hemp);
  p.oval(0, -0.666, 0.055, 0.131, 0.077, 0.197, dye.shoe);
  p.box(0, -0.718, 0.057, 0.183, 0.037, 0.262, dye.sole);
  const mesh = p.mesh();
  mesh.position.set(0.137 * side, 0.746, 0);
  return mesh;
}

function paperLoad() {
  const p = part();
  for (let layer = 0; layer < 3; layer++) {
    const y = 1.001 + layer * 0.123;
    p.box(0, y, -0.39, 0.68, 0.119, 0.397, layer % 2 ? dye.paper : dye.hemp);
    p.box(-0.273, y + 0.012, -0.39, 0.031, 0.125, 0.402, dye.straw);
    p.box(0.175, y + 0.012, -0.39, 0.031, 0.125, 0.402, dye.straw);
  }
  return p.mesh();
}

export function makePerson(id) {
  const clothes = costumes[id] ?? costumes.resident;
  const group = new THREE.Group();
  group.name = 'person-' + id;
  const body = new THREE.Group();
  const trunk = torso(id, clothes);
  const leftArm = createArm(-1, clothes);
  const rightArm = createArm(1, clothes);
  const leftLeg = createLeg(-1, clothes);
  const rightLeg = createLeg(1, clothes);
  const load = paperLoad();
  load.visible = false;
  group.add(body);
  body.add(trunk, leftArm, rightArm, leftLeg, rightLeg, load);
  const phase = (id.charCodeAt(0) * 0.67) % (Math.PI * 2);

  return {
    group,
    animate(actor, simSeconds) {
      group.position.set(actor.x, 0, actor.z);
      group.rotation.y = actor.heading || 0;
      load.visible = actor.cargo > 0;
      const walk = actor.mode === 'walk';
      const working = actor.mode === 'work';
      const step = walk ? Math.sin(simSeconds * 6.8 + phase) : 0;
      const workBeat = working ? Math.sin(simSeconds * 3.65 + phase) : 0;

      body.position.y = walk ? Math.abs(step) * 0.052 : 0;
      body.rotation.x = load.visible ? 0.085 : workBeat * 0.045;
      body.rotation.z = walk ? step * 0.031 : 0;
      leftLeg.rotation.x = step * 0.55;
      rightLeg.rotation.x = -step * 0.55;
      if (working) {
        leftArm.rotation.x = -0.67 + workBeat * 0.53;
        rightArm.rotation.x = -0.74 + workBeat * 0.63;
      } else {
        const rest = load.visible ? -0.48 : -0.07;
        leftArm.rotation.x = rest - step * 0.47;
        rightArm.rotation.x = rest + step * 0.47;
      }
    }
  };
}
