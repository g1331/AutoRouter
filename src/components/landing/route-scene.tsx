"use client";

import { useRef } from "react";
import { useLocale } from "next-intl";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  PARTICLE_COUNT,
  createParticleFormations,
  sampleParticleFormation,
  type FormationName,
} from "./particle-formations";
import styles from "./landing.module.css";

const FORMATIONS = createParticleFormations();
const SIZE = 600;
const TRANSITION_SECONDS = 1.1;

/** 固定轮廓内持续流动的粒子；跨区形变完整收敛，鼠标仅扰动附近粒子。 */
export function RouteScene() {
  const root = useRef<HTMLDivElement>(null);
  const locale = useLocale();
  useGSAP(
    () => {
      gsap.registerPlugin(ScrollTrigger);
      const scene = root.current!;
      const main = scene.closest("main")!;
      const canvas = scene.querySelector("canvas")!;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const anchors = Array.from(main.querySelectorAll<HTMLElement>("[data-scene-anchor]"));
      const mm = gsap.matchMedia();
      mm.add(
        {
          mobile: "(max-width: 767px)",
          desktop: "(min-width: 768px)",
          pointer: "(hover: hover) and (pointer: fine)",
          reduce: "(prefers-reduced-motion: reduce)",
        },
        (context) => {
          if (context.conditions!.reduce) return;
          // 只缓存不包含粒子锚点的内容面板；刷新及退出逐项恢复原始内联样式。
          const chapters = anchors.map((anchor) => ({
            panels: Array.from(
              anchor
                .closest("[data-scene-step]")
                ?.querySelectorAll<HTMLElement>("[data-scene-panel]") ?? []
            ).filter((panel) => !panel.contains(anchor)),
            entered: false,
          }));
          const panelStyles = chapters.flatMap(({ panels }) =>
            panels.map((panel) => ({ panel, style: panel.getAttribute("style") }))
          );
          const restorePanels = () => {
            for (const { panel, style } of panelStyles) {
              gsap.set(panel, { clearProps: "transform,opacity" });
              if (style === null) panel.removeAttribute("style");
              else panel.setAttribute("style", style);
            }
          };
          main.dataset.sceneActive = "true";
          gsap.set(scene, {
            position: "absolute",
            left: 0,
            top: 0,
            width: SIZE,
            height: SIZE,
            maxWidth: "none",
            margin: 0,
            transformOrigin: "0 0",
          });
          const current = FORMATIONS.hero.points.slice();
          const from = current.slice();
          const flowing = current.slice();
          const ahead = current.slice();
          const currentAhead = current.slice();
          const fromAhead = current.slice();
          const projected = new Float32Array(PARTICLE_COUNT * 4);
          const buckets = new Uint8Array(PARTICLE_COUNT);
          const turns = new Float32Array(12);
          let target = FORMATIONS.hero;
          let active = -1;
          let animation: gsap.core.Timeline | undefined;
          let mounted = true;
          let mainLeft = 0;
          let mainTop = 0;
          let docks: {
            name: FormationName;
            x: number;
            y: number;
            scale: number;
            center: number;
          }[] = [];
          let palette = { accent: "", fg: "", bg: "", ink: "" };
          const state = { progress: 1, accent: "", foreground: "" };
          const mouse = { x: 300, y: 300, strength: 0 };
          const mouseX = gsap.quickTo(mouse, "x", { duration: 0.22, ease: "power3.out" });
          const mouseY = gsap.quickTo(mouse, "y", { duration: 0.22, ease: "power3.out" });
          const mouseStrength = gsap.quickTo(mouse, "strength", {
            duration: 0.45,
            ease: "power3.out",
          });
          const view = { yaw: 0, pitch: 0 };
          const viewYaw = gsap.quickTo(view, "yaw", { duration: 0.6, ease: "power3.out" });
          const viewPitch = gsap.quickTo(view, "pitch", { duration: 0.6, ease: "power3.out" });
          const readPalette = () => {
            const css = getComputedStyle(main);
            palette = {
              accent: css.getPropertyValue("--vr-landing-accent").trim(),
              fg: css.getPropertyValue("--vr-landing-fg").trim(),
              bg: css.getPropertyValue("--vr-landing-bg").trim(),
              ink: css.getPropertyValue("--vr-landing-ink").trim(),
            };
          };
          // 复用坐标缓冲区；流动沿固定轨道，轮廓不会因停滚而退化成半成品。
          const draw = () => {
            if (active < 0 || document.hidden) return;
            const time = gsap.ticker.time;
            sampleParticleFormation(target, time, flowing);
            sampleParticleFormation(target, time + 0.65, ahead);
            ctx.clearRect(0, 0, SIZE, SIZE);
            ctx.lineCap = "round";
            const rotating = Math.abs(view.yaw) + Math.abs(view.pitch) > 0.0001;
            const yawCos = rotating ? Math.cos(view.yaw) : 1;
            const yawSin = rotating ? Math.sin(view.yaw) : 0;
            const pitchCos = rotating ? Math.cos(view.pitch) : 1;
            const pitchSin = rotating ? Math.sin(view.pitch) : 0;
            const lift = Math.sin(state.progress * Math.PI) ** 2;
            for (let band = 0; band < 6; band++) {
              const angle = (band - 2.5) * 0.22 * lift;
              turns[band * 2] = Math.cos(angle);
              turns[band * 2 + 1] = Math.sin(angle);
            }
            for (let i = 0; i < PARTICLE_COUNT; i++) {
              const offset = i * 3;
              for (let axis = 0; axis < 3; axis++) {
                current[offset + axis] =
                  from[offset + axis] +
                  (flowing[offset + axis] - from[offset + axis]) * state.progress;
                currentAhead[offset + axis] =
                  fromAhead[offset + axis] +
                  (ahead[offset + axis] - fromAhead[offset + axis]) * state.progress;
              }
              if (lift > 0.0001) {
                const band = i % 6;
                const cos = turns[band * 2];
                const sin = turns[band * 2 + 1];
                const x = current[offset] - 300;
                const y = current[offset + 1] - 300;
                const tx = currentAhead[offset] - 300;
                const ty = currentAhead[offset + 1] - 300;
                // 六层流束抬起并绕行；两端共用变换，打断时保存实际空间姿态。
                current[offset] = 300 + x * cos - y * sin;
                current[offset + 1] = 300 + x * sin + y * cos + (band - 2.5) * 14 * lift;
                current[offset + 2] += (band - 2.5) * 28 * lift;
                currentAhead[offset] = 300 + tx * cos - ty * sin;
                currentAhead[offset + 1] = 300 + tx * sin + ty * cos + (band - 2.5) * 14 * lift;
                currentAhead[offset + 2] += (band - 2.5) * 28 * lift;
              }
              let vx = current[offset] - SIZE / 2;
              let vy = current[offset + 1] - SIZE / 2;
              let z = current[offset + 2];
              // 先旋转真实三维坐标，再做透视投影；模型快照不包含相机朝向。
              if (rotating) {
                const depth = z * yawCos - vx * yawSin;
                vx = vx * yawCos + z * yawSin;
                z = vy * pitchSin + depth * pitchCos;
                vy = vy * pitchCos - depth * pitchSin;
              }
              const perspective = 850 / (850 - z);
              const baseX = SIZE / 2 + vx * perspective;
              const baseY = SIZE / 2 + vy * perspective;
              let x = baseX;
              let y = baseY;
              let proximity = 0;
              if (mouse.strength > 0.001) {
                const dx = x - mouse.x;
                const dy = y - mouse.y;
                const distance = Math.hypot(dx, dy);
                proximity = Math.max(0, 1 - distance / 115) * mouse.strength;
                const displacement = (proximity * proximity * 12) / (distance || 1);
                x += dx * displacement;
                y += dy * displacement;
              }
              const depth = Math.min(2, Math.max(0, Math.floor((z + 60) / 40)));
              buckets[i] = depth * 2 + (i % 5 === 0 ? 1 : 0);
              let tx = currentAhead[offset] - SIZE / 2;
              let ty = currentAhead[offset + 1] - SIZE / 2;
              let tz = currentAhead[offset + 2];
              if (rotating) {
                const depth = tz * yawCos - tx * yawSin;
                tx = tx * yawCos + tz * yawSin;
                tz = ty * pitchSin + depth * pitchCos;
                ty = ty * pitchCos - depth * pitchSin;
              }
              const nextPerspective = 850 / (850 - tz);
              const screen = i * 4;
              projected[screen] = x;
              projected[screen + 1] = y;
              projected[screen + 2] = SIZE / 2 + tx * nextPerspective + x - baseX;
              projected[screen + 3] = SIZE / 2 + ty * nextPerspective + y - baseY;
            }
            // 六个深度/颜色批次替代逐粒子提交；线段两端均从上一帧接续，不先缩成点。
            for (let bucket = 0; bucket < 6; bucket++) {
              const depth = Math.floor(bucket / 2);
              const color = bucket % 2 === 1 ? state.foreground : state.accent;
              ctx.globalAlpha = 0.48 + depth * 0.18;
              ctx.strokeStyle = color;
              ctx.fillStyle = color;
              ctx.lineWidth = 0.65 + depth * 0.2;
              ctx.beginPath();
              for (let i = 0; i < PARTICLE_COUNT; i++) {
                if (buckets[i] !== bucket) continue;
                const screen = i * 4;
                ctx.moveTo(projected[screen], projected[screen + 1]);
                ctx.lineTo(projected[screen + 2], projected[screen + 3]);
              }
              ctx.stroke();
              ctx.beginPath();
              for (let i = 0; i < PARTICLE_COUNT; i += 7) {
                if (buckets[i] !== bucket) continue;
                const screen = i * 4;
                ctx.moveTo(projected[screen] + 0.85, projected[screen + 1]);
                ctx.arc(projected[screen], projected[screen + 1], 0.85, 0, Math.PI * 2);
              }
              ctx.fill();
            }
            ctx.globalAlpha = 1;
          };
          const colorsFor = (name: FormationName) => ({
            accent: name === "cta" ? palette.ink : palette.accent,
            foreground:
              name === "routing" ||
              name === "capability-balancing" ||
              name === "capability-failover" ||
              name === "cta"
                ? palette.bg
                : palette.fg,
          });
          const select = (index: number, immediate = false) => {
            if (index === active && !immediate) return;
            const previous = active;
            const direction = index >= previous ? 1 : -1;
            active = index;
            const dock = docks[index];
            animation?.kill();
            mouseStrength(0);
            from.set(current);
            fromAhead.set(currentAhead);
            target = FORMATIONS[dock.name];
            state.progress = 0;
            const duration = immediate ? 0 : TRANSITION_SECONDS;
            animation = gsap.timeline();
            animation.to(
              scene,
              { x: dock.x, y: dock.y, scale: dock.scale, duration, ease: "power2.inOut" },
              0
            );
            animation.to(
              state,
              { progress: 1, ...colorsFor(dock.name), duration, ease: "power2.inOut" },
              0
            );
            // 内容与雕塑共用可打断的时间线；回访只从实时姿态接续，不重置入口。
            if (!immediate && previous >= 0 && chapters[previous].panels.length) {
              animation.to(
                chapters[previous].panels,
                {
                  y: -direction * 40,
                  rotationX: direction * 4,
                  scale: 0.97,
                  transformPerspective: 1000,
                  opacity: 1,
                  duration,
                  ease: "power2.inOut",
                },
                0
              );
            }
            const chapter = chapters[index];
            if (chapter.panels.length) {
              if (!immediate && !chapter.entered) {
                gsap.set(chapter.panels, {
                  y: direction * 56,
                  rotationX: -direction * 6,
                  scale: 0.96,
                  transformPerspective: 1000,
                  opacity: 1,
                });
              }
              animation.to(
                chapter.panels,
                {
                  y: 0,
                  rotationX: 0,
                  scale: 1,
                  transformPerspective: 1000,
                  opacity: 1,
                  duration,
                  ease: "power2.inOut",
                  stagger: { amount: immediate ? 0 : 0.16, from: direction > 0 ? "start" : "end" },
                },
                0
              );
            }
            chapter.entered = true;
            if (immediate) draw();
          };
          const nearest = (scroll: number) => {
            const center = scroll + window.innerHeight / 2;
            let index = 0;
            while (
              index + 1 < docks.length &&
              center > (docks[index].center + docks[index + 1].center) / 2
            )
              index++;
            return index;
          };
          // 几何只在刷新时批量读取；pointermove 使用 GSAP 缓存的位移和缩放。
          const measure = () => {
            const mainRect = main.getBoundingClientRect();
            mainLeft = mainRect.left + window.scrollX;
            mainTop = mainRect.top + window.scrollY;
            docks = anchors.map((anchor) => {
              const rect = anchor.getBoundingClientRect();
              const size = Math.min(rect.width, rect.height) * 0.94;
              return {
                name: anchor.dataset.sceneAnchor as FormationName,
                x: rect.left - mainRect.left + (rect.width - size) / 2,
                y: rect.top - mainRect.top + (rect.height - size) / 2,
                scale: size / SIZE,
                center: rect.top + window.scrollY + rect.height / 2,
              };
            });
            const dpr = Math.min(window.devicePixelRatio, 2);
            canvas.width = SIZE * dpr;
            canvas.height = SIZE * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            readPalette();
          };
          const onPointerMove = (event: PointerEvent) => {
            if (event.pointerType !== "mouse") return;
            const scale = Number(gsap.getProperty(scene, "scaleX"));
            const x =
              (event.clientX + window.scrollX - mainLeft - Number(gsap.getProperty(scene, "x"))) /
              scale;
            const y =
              (event.clientY + window.scrollY - mainTop - Number(gsap.getProperty(scene, "y"))) /
              scale;
            mouseX(x);
            mouseY(y);
            const inside = x >= 0 && x <= SIZE && y >= 0 && y <= SIZE;
            mouseStrength(inside ? 1 : 0);
            // 朝向由整个视口控制；粒子排斥仍只作用于图形内部的邻近区域。
            viewYaw((Math.min(1, Math.max(0, event.clientX / window.innerWidth)) - 0.5) * 0.5);
            viewPitch((0.5 - Math.min(1, Math.max(0, event.clientY / window.innerHeight))) * 0.32);
          };
          const onPointerLeave = () => {
            mouseStrength(0);
            viewYaw(0);
            viewPitch(0);
          };
          const onVisibility = () => {
            gsap.ticker.remove(draw);
            if (!document.hidden) gsap.ticker.add(draw);
          };
          measure();
          select(nearest(window.scrollY), true);
          const trigger = ScrollTrigger.create({
            start: 0,
            end: () => ScrollTrigger.maxScroll(window),
            onUpdate: (self) => select(nearest(self.scroll())),
            onRefreshInit: () => {
              animation?.kill();
              restorePanels();
              measure();
            },
            onRefresh: () => select(nearest(window.scrollY), true),
          });
          const themeObserver = new MutationObserver(() => {
            readPalette();
            gsap.killTweensOf(state, "accent,foreground");
            Object.assign(state, colorsFor(docks[active].name));
          });
          themeObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["class"],
          });
          if (context.conditions!.pointer) {
            document.addEventListener("pointermove", onPointerMove, { passive: true });
            document.documentElement.addEventListener("pointerleave", onPointerLeave);
            window.addEventListener("blur", onPointerLeave);
          }
          document.addEventListener("visibilitychange", onVisibility);
          onVisibility();
          void document.fonts.ready.then(() => {
            if (mounted) trigger.refresh();
          });
          return () => {
            mounted = false;
            themeObserver.disconnect();
            document.removeEventListener("visibilitychange", onVisibility);
            document.removeEventListener("pointermove", onPointerMove);
            document.documentElement.removeEventListener("pointerleave", onPointerLeave);
            window.removeEventListener("blur", onPointerLeave);
            gsap.ticker.remove(draw);
            mouseX.tween.kill();
            mouseY.tween.kill();
            mouseStrength.tween.kill();
            viewYaw.tween.kill();
            viewPitch.tween.kill();
            trigger.kill();
            animation?.kill();
            restorePanels();
            scene.removeAttribute("style");
            delete main.dataset.sceneActive;
          };
        }
      );
      return () => mm.revert();
    },
    { scope: root, dependencies: [locale], revertOnUpdate: true }
  );
  return (
    <div ref={root} className={styles.scene} aria-hidden="true" data-route-scene>
      <canvas className={styles.particleCanvas} width={SIZE} height={SIZE} />
      <svg className={styles.sceneFallback} viewBox="0 0 600 600">
        {Array.from({ length: PARTICLE_COUNT / 5 }, (_, index) => {
          const i = index * 5;
          const offset = i * 3;
          const perspective = 850 / (850 - FORMATIONS.hero.points[offset + 2]);
          return (
            <circle
              key={i}
              cx={300 + (FORMATIONS.hero.points[offset] - 300) * perspective}
              cy={300 + (FORMATIONS.hero.points[offset + 1] - 300) * perspective}
              r={(1.2 + (i % 4) * 0.25) * perspective}
            />
          );
        })}
      </svg>
    </div>
  );
}
