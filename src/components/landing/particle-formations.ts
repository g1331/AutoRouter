/** 所有姿态共享固定粒子索引；每个粒子占据连续的 x、y、z 三项。 */
export const PARTICLE_COUNT = 3600;

const TAU = Math.PI * 2;

/** 与页面停靠槽一一对应的九个姿态名称。 */
export type FormationName =
  | "hero"
  | "routing"
  | "capability-routing"
  | "capability-balancing"
  | "capability-quota"
  | "capability-billing"
  | "capability-keys"
  | "capability-failover"
  | "cta";

/** 只在接合段平滑转向，输入、处理和输出段保持可辨认的平行关系。 */
function transition(t: number, start: number, end: number) {
  const progress = Math.min(1, Math.max(0, (t - start) / (end - start)));
  return progress * progress * (3 - 2 * progress);
}

interface ParticleTrack {
  start: number;
  count: number;
  stride: number;
  closed: boolean;
}

/** 成形坐标与连续流动轨道共用固定粒子索引。 */
export interface ParticleFormation {
  points: Float32Array;
  tracks: ParticleTrack[];
}

function formation(): ParticleFormation {
  return { points: new Float32Array(PARTICLE_COUNT * 3), tracks: [] };
}

function tracks(
  target: ParticleFormation,
  start: number,
  count: number,
  stride: number,
  closed: boolean
) {
  for (let strand = 0; strand < stride; strand++) {
    target.tracks.push({
      start: start + strand,
      count: Math.ceil((count - strand) / stride),
      stride,
      closed,
    });
  }
}

/** 沿预计算轨道采样到调用方复用的缓冲区，不分配逐帧数组。 */
export function sampleParticleFormation(
  shape: ParticleFormation,
  seconds: number,
  output: Float32Array
) {
  for (const track of shape.tracks) {
    const length = track.closed ? track.count : track.count - 1;
    const period = track.closed ? length : length * 2;
    const travel = seconds * length * 0.055;
    for (let station = 0; station < track.count; station++) {
      let position = (station * (track.closed ? 1 : 2) + travel + track.start * 0.13) % period;
      if (!track.closed && position > length) position = period - position;
      const lower = Math.floor(position);
      const upper = track.closed ? (lower + 1) % track.count : Math.min(lower + 1, length);
      const fraction = position - lower;
      const a = (track.start + lower * track.stride) * 3;
      const b = (track.start + upper * track.stride) * 3;
      const destination = (track.start + station * track.stride) * 3;
      for (let axis = 0; axis < 3; axis++) {
        output[destination + axis] =
          shape.points[a + axis] + (shape.points[b + axis] - shape.points[a + axis]) * fraction;
      }
    }
  }
}

function put(target: ParticleFormation, index: number, x: number, y: number, z: number) {
  const offset = index * 3;
  target.points[offset] = x + z * 0.68;
  target.points[offset + 1] = y - z * 0.52;
  target.points[offset + 2] = z;
}

/**
 * 一次性生成九组确定性几何与轨道；每组 3600 个粒子。
 * 左侧输入、中央处理、右侧输出保持可读；管面与层叠节点用斜投影呈现厚度。
 * 最后按相机投影统一到 500 像素最大边长，深度限制在 ±60。
 */
export function createParticleFormations(): Record<FormationName, ParticleFormation> {
  const hero = formation();
  const routing = formation();
  const network = formation();
  const balancing = formation();
  const quota = formation();
  const billing = formation();
  const keys = formation();
  const failover = formation();
  const cta = formation();

  // 三路请求穿过紧凑的网关窗格后分发；窗格与流线各自保留连续轨道。
  for (let branch = 0; branch < 3; branch++) {
    const start = branch * 960;
    tracks(hero, start, 960, 16, false);
    for (let i = 0; i < 960; i++) {
      const t = Math.floor(i / 16) / 59;
      const across = (i % 16) / 15 - 0.5;
      const join = transition(t, 0.12, 0.43);
      const split = transition(t, 0.57, 0.88);
      const spacing = 118 - 92 * join + 92 * split;
      put(
        hero,
        start + i,
        65 + 470 * t,
        300 + (branch - 1) * spacing + Math.cos(across * TAU) * (24 - 10 * join),
        (branch - 1) * 22 + Math.sin(across * TAU) * (30 - 12 * join)
      );
    }
  }
  const gateway = [
    [264, 244, 264, 356],
    [336, 244, 336, 356],
    [264, 244, 336, 244],
    [264, 356, 336, 356],
    [288, 244, 288, 356],
    [312, 244, 312, 356],
  ];
  for (let line = 0; line < gateway.length; line++) {
    const start = 2880 + line * 120;
    const [x1, y1, x2, y2] = gateway[line];
    tracks(hero, start, 120, 4, false);
    for (let i = 0; i < 120; i++) {
      const t = Math.floor(i / 4) / 29;
      const across = (i % 4) - 1.5;
      put(hero, start + i, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, across * 28);
    }
  }

  // 单一入口穿过有厚度的接合窗后分为三路，出口前后错层但不改变分流关系。
  for (let branch = 0; branch < 3; branch++) {
    const start = branch * 1080;
    tracks(routing, start, 1080, 18, false);
    for (let i = 0; i < 1080; i++) {
      const t = Math.floor(i / 18) / 59;
      const across = (i % 18) / 17 - 0.5;
      const split = transition(t, 0.5, 0.8);
      put(
        routing,
        start + i,
        65 + 470 * t,
        300 + (branch - 1) * (7 + 111 * split) + Math.cos(across * TAU) * 18,
        (branch - 1) * 26 * split + Math.sin(across * TAU) * 24
      );
    }
  }
  const junction = [
    [264, 276, 332, 276],
    [264, 324, 332, 324],
    [264, 276, 264, 324],
    [332, 276, 332, 324],
  ];
  for (let line = 0; line < junction.length; line++) {
    const start = 3240 + line * 90;
    const [x1, y1, x2, y2] = junction[line];
    tracks(routing, start, 90, 3, false);
    for (let i = 0; i < 90; i++) {
      const t = Math.floor(i / 3) / 29;
      const across = (i % 3) - 1;
      put(routing, start + i, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, across * 34);
    }
  }

  // 三条平行候选仅在上路形成贯通出口；加密的选中流线保留完整首尾关系。
  for (let layer = 0; layer < 4; layer++) {
    const start = layer * 900;
    const selected = layer === 3;
    tracks(network, start, 900, 15, false);
    for (let i = 0; i < 900; i++) {
      const t = Math.floor(i / 15) / 59;
      const across = (i % 15) / 14 - 0.5;
      const x = selected ? 65 + 470 * t : 65 + 370 * t;
      const route = selected ? -1 : layer - 1;
      const branch = transition(x, 155, 255);
      const rejoin = selected ? transition(x, 425, 510) : 0;
      put(
        network,
        start + i,
        x,
        300 + route * 108 * branch * (1 - rejoin) + Math.cos(across * TAU) * (selected ? 20 : 12),
        (selected ? 28 : -24) + Math.sin(across * TAU) * 24
      );
    }
  }

  // 等宽、等长、等密度的三条分路在两端接合，表达均分而不是编织。
  for (let channel = 0; channel < 3; channel++) {
    const start = channel * 1200;
    tracks(balancing, start, 1200, 20, false);
    for (let i = 0; i < 1200; i++) {
      const t = Math.floor(i / 20) / 59;
      const across = (i % 20) / 19 - 0.5;
      const spread = transition(t, 0.12, 0.34) * (1 - transition(t, 0.76, 0.96));
      put(
        balancing,
        start + i,
        65 + 470 * t,
        300 + (channel - 1) * (8 + 102 * spread) + Math.cos(across * TAU) * 22,
        (channel - 1) * 24 * spread + Math.sin(across * TAU) * 28
      );
    }
  }

  // 宽入口压入中央窄闸；闸前四列短请求队列与闸后受限流束明显分离。
  tracks(quota, 0, 2400, 30, false);
  for (let i = 0; i < 2400; i++) {
    const t = Math.floor(i / 30) / 79;
    const across = (i % 30) / 29 - 0.5;
    const squeeze = transition(t, 0.22, 0.48);
    const release = transition(t, 0.58, 0.88);
    const width = 226 - 202 * squeeze + 32 * release;
    put(
      quota,
      i,
      65 + 470 * t,
      300 + across * width,
      Math.sin(across * Math.PI) * (54 - 30 * squeeze)
    );
  }
  for (let band = 0; band < 6; band++) {
    const start = 2400 + band * 200;
    if (band < 4) {
      tracks(quota, start, 200, 10, false);
      for (let i = 0; i < 200; i++) {
        const t = Math.floor(i / 10) / 19;
        const across = (i % 10) / 9 - 0.5;
        put(quota, start + i, 116 + band * 29 + 12 * t, 300 + across * 172, 38);
      }
    } else {
      tracks(quota, start, 200, 4, false);
      for (let i = 0; i < 200; i++) {
        const t = Math.floor(i / 4) / 49;
        const across = (i % 4) - 1.5;
        put(quota, start + i, 300, (band === 4 ? 154 : 318) + 128 * t, across * 28);
      }
    }
  }

  // 两路用量进入六层计量切片，再汇总为右侧单次请求的立体账单快照。
  for (let stream = 0; stream < 2; stream++) {
    const start = stream * 360;
    tracks(billing, start, 360, 6, false);
    for (let i = 0; i < 360; i++) {
      const t = Math.floor(i / 6) / 59;
      const angle = ((i % 6) / 6) * TAU;
      put(
        billing,
        start + i,
        65 + 170 * t,
        300 + (stream - 0.5) * 110 + Math.cos(angle) * 10,
        Math.sin(angle) * 16
      );
    }
  }
  for (let slice = 0; slice < 6; slice++) {
    const start = 720 + slice * 240;
    tracks(billing, start, 240, 4, true);
    for (let i = 0; i < 240; i++) {
      const perimeter = Math.floor(i / 4) / 15;
      const side = Math.floor(perimeter);
      const t = perimeter - side;
      const inset = (i % 4) * 2;
      const x = side === 0 ? 235 + 95 * t : side === 1 ? 330 : side === 2 ? 330 - 95 * t : 235;
      const z = side === 0 ? -38 : side === 1 ? -38 + 76 * t : side === 2 ? 38 : 38 - 76 * t;
      put(billing, start + i, x, 195 + slice * 42 + inset, z);
    }
  }
  tracks(billing, 2160, 720, 12, false);
  for (let i = 0; i < 720; i++) {
    const t = Math.floor(i / 12) / 59;
    const across = (i % 12) / 11 - 0.5;
    put(billing, 2160 + i, 330 + 115 * t, 300 + across * (160 - 100 * t), across * 48);
  }
  // 单张账单薄片：三行明细经分隔线汇总，不再用封闭盒体表示计费快照。
  const receiptLines = [
    [445, 220, 535, 220],
    [535, 220, 535, 380],
    [535, 380, 445, 380],
    [445, 380, 445, 220],
    [459, 254, 487, 254],
    [501, 254, 521, 254],
    [459, 278, 487, 278],
    [501, 278, 521, 278],
    [459, 302, 487, 302],
    [501, 302, 521, 302],
    [459, 329, 521, 329],
    [492, 351, 521, 351],
  ];
  for (let line = 0; line < receiptLines.length; line++) {
    const start = 2880 + line * 60;
    const [x1, y1, x2, y2] = receiptLines[line];
    tracks(billing, start, 60, 2, false);
    for (let i = 0; i < 60; i++) {
      const t = Math.floor(i / 2) / 29;
      put(billing, start + i, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t + (i % 2) * 2, 0);
    }
  }

  // 三道中央筛选孔径逐级收窄；被拒绝流线在对应闸面终止，内侧两路贯通。
  for (let gate = 0; gate < 3; gate++) {
    const aperture = gate === 0 ? 84 : gate === 1 ? 44 : 28;
    for (let side = 0; side < 2; side++) {
      const start = gate * 720 + side * 360;
      tracks(keys, start, 360, 6, false);
      for (let i = 0; i < 360; i++) {
        const t = Math.floor(i / 6) / 59;
        const across = (i % 6) / 5 - 0.5;
        const y = side === 0 ? 150 + (150 - aperture) * t : 300 + aperture + (150 - aperture) * t;
        put(keys, start + i, 245 + gate * 55, y, across * 82);
      }
    }
  }
  for (let stream = 0; stream < 6; stream++) {
    const start = 2160 + stream * 240;
    const distance = Math.abs(stream - 2.5);
    const end = distance > 2 ? 239 : distance > 1 ? 294 : 535;
    tracks(keys, start, 240, 4, false);
    for (let i = 0; i < 240; i++) {
      const t = Math.floor(i / 4) / 59;
      const across = (i % 4) / 3 - 0.5;
      put(
        keys,
        start + i,
        65 + (end - 65) * t,
        300 + (stream - 2.5) * 40 + across * 9,
        16 + across * 30
      );
    }
  }

  // 原路径保留断口；请求在前景分支转向另一个上游，而不是越过障碍回到原路。
  tracks(failover, 0, 2400, 24, false);
  for (let i = 0; i < 2400; i++) {
    const t = Math.floor(i / 24) / 99;
    const across = (i % 24) / 23 - 0.5;
    const detour = transition(t, 0.18, 0.74);
    put(
      failover,
      i,
      65 + 470 * t,
      330 - 118 * detour + Math.cos(across * TAU) * 18,
      28 * detour + Math.sin(across * TAU) * 24
    );
  }
  for (let side = 0; side < 2; side++) {
    const start = 2400 + side * 600;
    tracks(failover, start, 600, 12, false);
    for (let i = 0; i < 600; i++) {
      const t = Math.floor(i / 12) / 49;
      const across = (i % 12) / 11 - 0.5;
      put(
        failover,
        start + i,
        65 + side * 285 + 185 * t,
        330 + Math.cos(across * TAU) * 15,
        -28 + Math.sin(across * TAU) * 18
      );
    }
  }

  // 三路在中央汇合为向右延伸的交付流束，不聚成独立字形或箭头图标。
  for (let branch = 0; branch < 3; branch++) {
    const start = branch * 1200;
    tracks(cta, start, 1200, 24, false);
    for (let i = 0; i < 1200; i++) {
      const t = Math.floor(i / 24) / 49;
      const across = (i % 24) / 23 - 0.5;
      const join = transition(t, 0.18, 0.64);
      put(
        cta,
        start + i,
        65 + 470 * t,
        300 + (branch - 1) * (118 - 111 * join) + Math.cos(across * TAU) * (22 - 8 * join),
        (branch - 1) * 24 * (1 - join) + Math.sin(across * TAU) * 26
      );
    }
  }

  const formations: Record<FormationName, ParticleFormation> = {
    hero,
    routing,
    "capability-routing": network,
    "capability-balancing": balancing,
    "capability-quota": quota,
    "capability-billing": billing,
    "capability-keys": keys,
    "capability-failover": failover,
    cta,
  };

  // 在建模阶段匹配 850 / (850 - z) 相机；逐帧采样无需重复计算边界。
  // 投影统一居中并保留 50 像素边缘，供微扰、粒径与鼠标排斥使用。
  for (const shape of Object.values(formations)) {
    let depth = 0;
    for (let i = 2; i < shape.points.length; i += 3) {
      depth = Math.max(depth, Math.abs(shape.points[i]));
    }
    const depthScale = depth > 60 ? 60 / depth : 1;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < shape.points.length; i += 3) {
      shape.points[i + 2] *= depthScale;
      const perspective = 850 / (850 - shape.points[i + 2]);
      const x = (shape.points[i] - 300) * perspective;
      const y = (shape.points[i + 1] - 300) * perspective;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    const scale = 500 / Math.max(maxX - minX, maxY - minY);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    for (let i = 0; i < shape.points.length; i += 3) {
      const perspective = 850 / (850 - shape.points[i + 2]);
      shape.points[i] = 300 + (shape.points[i] - 300 - centerX / perspective) * scale;
      shape.points[i + 1] = 300 + (shape.points[i + 1] - 300 - centerY / perspective) * scale;
    }
  }

  return formations;
}
