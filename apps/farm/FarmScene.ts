/**
 * 一块田 · 3D 院子。
 *
 * 刻意不复用 room3d 的房间系统：那边是「格子 + 墙 + 碰撞」的室内模型，院子是无墙
 * 户外，硬接进去要改 150 多个文件。这里只要一个干净的 three.js 场景，角色照样是
 * 同一套 chibi 素体（createVisitor），动作也照样是它自己的骨骼动画。
 *
 * 职责边界：这个文件只负责「画」和「动」，不判断能不能种、熟没熟——那些在 engine。
 */

import * as THREE from 'three';
import { createVisitor, type ChibiVisitor } from '../room3d/chibi/visitor';
import type { HairSettings, Parts } from '../room3d/chibi/types';
import type { CropId } from '../../utils/farm/crops';

const PLOT_SIZE = 1.0;
const PLOT_GAP = 1.52;
const PLOT_TOP = 0.12;

export interface PlotVisual {
    crop: CropId | null;
    stage: 0 | 1 | 2 | 3 | 4;
}

export interface FarmSceneOptions {
    host: HTMLElement;
    onPlotClick: (index: number) => void;
}

export class FarmScene {
    private renderer: THREE.WebGLRenderer;
    private scene = new THREE.Scene();
    private camera: THREE.PerspectiveCamera;
    private lastFrame = 0;
    private raf = 0;
    private disposed = false;

    private plotGroups: THREE.Group[] = [];
    private plotHits: THREE.Mesh[] = [];
    private plotCrops: (THREE.Group | null)[] = [];
    private plotState: PlotVisual[] = [];

    private houseGroup = new THREE.Group();
    private houseTexCache = new Map<number, THREE.Texture>();
    private cropTexCache = new Map<string, THREE.Texture>();
    private houseLevel = 1;

    private actor: ChibiVisitor | null = null;
    private placeholder: THREE.Group | null = null;
    private actorHome = new THREE.Vector3(0, 0, 2.35);
    private moveTarget: THREE.Vector3 | null = null;
    private moveSpeed = 0.95;
    private onArrive: (() => void) | null = null;
    private facing = 0;
    private motion: 'idle' | 'walk' | 'water' = 'idle';
    private motionUntil = 0;
    private elapsed = 0;

    private drops: { mesh: THREE.Mesh; vy: number; life: number }[] = [];
    private dropGeo = new THREE.SphereGeometry(0.035, 6, 6);
    private clockTexture: THREE.Texture;

    constructor(opts: FarmSceneOptions) {
        const { host } = opts;
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFShadowMap;
        this.renderer.setSize(host.clientWidth || 360, host.clientHeight || 480);
        host.appendChild(this.renderer.domElement);
        this.renderer.domElement.style.display = 'block';
        this.renderer.domElement.style.touchAction = 'manipulation';

        this.scene.background = new THREE.Color('#bfe3f2');
        this.scene.fog = new THREE.Fog('#bfe3f2', 14, 26);

        this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 60);
        this.camera.position.set(0, 2.32, 4.35);
        this.camera.lookAt(0, 0.42, -0.55);

        this.clockTexture = makeGrassTexture();

        this.buildLights();
        this.buildGround();
        this.buildPlots();
        this.buildHouse();
        this.bindPointer(opts.onPlotClick);
        this.resize();
        this.loop();
    }

    // ---------- 场景搭建 ----------

    private buildLights() {
        const hemi = new THREE.HemisphereLight('#e8f4ff', '#7a9a58', 0.95);
        this.scene.add(hemi);
        const sun = new THREE.DirectionalLight('#fff2d8', 1.55);
        sun.position.set(4.2, 7.5, 3.4);
        sun.castShadow = true;
        sun.shadow.mapSize.set(1024, 1024);
        sun.shadow.camera.left = -8;
        sun.shadow.camera.right = 8;
        sun.shadow.camera.top = 8;
        sun.shadow.camera.bottom = -8;
        sun.shadow.camera.far = 24;
        sun.shadow.bias = -0.0012;
        this.scene.add(sun);
    }

    private buildGround() {
        const geo = new THREE.PlaneGeometry(40, 40);
        const mat = new THREE.MeshLambertMaterial({ map: this.clockTexture });
        const ground = new THREE.Mesh(geo, mat);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);


    }

    private buildPlots() {
        const topMat = new THREE.MeshLambertMaterial({ color: '#5d4130' });
        const sideMat = new THREE.MeshLambertMaterial({ color: '#6a4b36' });
        const boxGeo = new THREE.BoxGeometry(PLOT_SIZE + 0.1, PLOT_TOP, PLOT_SIZE + 0.1);

        for (let i = 0; i < 4; i++) {
            const group = new THREE.Group();
            const col = i % 2;
            const row = Math.floor(i / 2);
            group.position.set(
                (col === 0 ? -1 : 1) * (PLOT_GAP / 2),
                0,
                (row === 0 ? -1 : 1) * (PLOT_GAP / 2) - 0.15,
            );

            const box = new THREE.Mesh(boxGeo, [sideMat, sideMat, topMat, sideMat, sideMat, sideMat]);
            box.position.y = PLOT_TOP / 2;
            box.castShadow = false;
            box.receiveShadow = true;
            box.userData.plotIndex = i;
            group.add(box);
            this.plotHits.push(box);

            // 顶面再叠一层细土，避免纯色发闷
            const soil = new THREE.Mesh(
                new THREE.PlaneGeometry(PLOT_SIZE - 0.02, PLOT_SIZE - 0.02, 6, 6),
                new THREE.MeshLambertMaterial({ color: '#6d4d38' }),
            );
            const pos = soil.geometry.attributes.position as THREE.BufferAttribute;
            for (let v = 0; v < pos.count; v++) {
                pos.setZ(v, (Math.random() - 0.5) * 0.012);
            }
            pos.needsUpdate = true;
            soil.geometry.computeVertexNormals();
            soil.rotation.x = -Math.PI / 2;
            soil.position.y = PLOT_TOP + 0.001;
            group.add(soil);

            this.scene.add(group);
            this.plotGroups.push(group);
            this.plotCrops.push(null);
            this.plotState.push({ crop: null, stage: 0 });
        }
    }

    private buildHouse() {
        this.houseGroup.position.set(0, 0, -3.15);
        this.scene.add(this.houseGroup);
        this.applyHouseLevel(1);
    }

    private applyHouseLevel(level: number) {
        const clamped = Math.min(4, Math.max(1, Math.round(level)));
        if (clamped === this.houseLevel && this.houseGroup.children.length) return;
        this.houseLevel = clamped;

        this.houseGroup.clear();

        let tex = this.houseTexCache.get(clamped);
        if (!tex) {
            const loader = new THREE.TextureLoader();
            tex = loader.load(`${import.meta.env.BASE_URL}farm/house-${clamped}.png`, () => {
                // 图到齐了才知道真实内容边界，重排一次盒子的尺寸
                if (this.houseLevel === clamped) {
                    this.houseLevel = 0;
                    this.applyHouseLevel(clamped);
                }
            });
            tex.colorSpace = THREE.SRGBColorSpace;
            this.houseTexCache.set(clamped, tex);
        }

        const worldW = 2.25;
        const img = tex.image as HTMLImageElement | undefined;
        const ratio = img && img.width ? img.height / img.width : 0.78;
        const worldH = worldW * ratio;
        const depth = 0.72;

        // 贴图顶部是透明的，实心盒子直接按整张图做会从后面露出来一块。
        // 量一次不透明范围，盒子只做「房子本体」那么高。
        const solid = img && img.width ? solidBounds(img) : { top: 0, bottom: 1, left: 0, right: 1 };
        const solidH = worldH * (solid.bottom - solid.top);
        const solidW = worldW * (solid.right - solid.left);
        const solidCy = worldH * (1 - solid.bottom) + solidH / 2;

        const bodyMat = new THREE.MeshLambertMaterial({ color: '#cbb99d' });
        // 顶面用深色：俯视时会看到盒子顶部，土黄色露在屋顶上方很跳
        const roofMat = new THREE.MeshLambertMaterial({ color: '#6f7b6d' });
        const wallH = solidH * 0.56;
        const wallCy = solidCy - solidH / 2 + wallH / 2;
        const body = new THREE.Mesh(
            new THREE.BoxGeometry(solidW * 0.94, wallH, depth),
            [bodyMat, bodyMat, roofMat, bodyMat, bodyMat, bodyMat],
        );
        body.position.set(worldW * ((solid.left + solid.right) / 2 - 0.5), wallCy, -depth / 2);
        body.castShadow = true;
        body.receiveShadow = true;
        this.houseGroup.add(body);

        const faceMat = new THREE.MeshLambertMaterial({
            map: tex,
            transparent: true,
            alphaTest: 0.35,
        });
        const face = new THREE.Mesh(new THREE.PlaneGeometry(worldW, worldH), faceMat);
        face.position.set(0, worldH / 2, 0.055);
        face.castShadow = false;
        this.houseGroup.add(face);
    }

    // ---------- 作物 ----------

    private cropTexture(crop: CropId, stage: number) {
        const key = `${crop}-${stage}`;
        const cached = this.cropTexCache.get(key);
        if (cached) return cached;
        const t = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}farm/${crop}-${stage}.png`);
        t.colorSpace = THREE.SRGBColorSpace;
        this.cropTexCache.set(key, t);
        return t;
    }

    setPlot(index: number, visual: PlotVisual) {
        const prev = this.plotState[index];
        const group = this.plotGroups[index];
        if (!group || !prev) return;
        if (prev.crop === visual.crop && prev.stage === visual.stage) return;
        this.plotState[index] = { ...visual };

        const old = this.plotCrops[index];
        if (old) {
            // 作物是挂在 scene 上的，不在 group 里：这里必须从父节点摘掉，
            // 否则旧的一株会一直留在原地，新的一株叠在同一个位置
            old.removeFromParent();
            const materials = new Set<THREE.Material>();
            const geometries = new Set<THREE.BufferGeometry>();
            old.traverse(o => {
                if (!(o instanceof THREE.Mesh)) return;
                (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => materials.add(m));
                geometries.add(o.geometry);
            });
            materials.forEach(m => m.dispose());
            geometries.forEach(g => g.dispose());
            this.plotCrops[index] = null;
        }

        if (!visual.crop || visual.stage <= 0) return;

        const tex = this.cropTexture(visual.crop, visual.stage);
        // 第一阶段的芽在画布上本来就小，补一点缩放，免得种下去像没种
        const boost = visual.stage === 1 ? 1.18 : 1;
        const h = 0.92 * boost;
        const mat = new THREE.MeshLambertMaterial({
            map: tex,
            transparent: true,
            alphaTest: 0.38,
            side: THREE.DoubleSide,
        });
        const geo = new THREE.PlaneGeometry(h, h);

        const holder = new THREE.Group();
        const p1 = new THREE.Mesh(geo, mat);
        p1.position.y = h / 2;
        const p2 = new THREE.Mesh(geo, mat);
        p2.position.y = h / 2;
        p2.rotation.y = Math.PI / 2;
        holder.add(p1, p2);
        holder.position.set(
            group.position.x + (Math.random() - 0.5) * 0.04,
            PLOT_TOP,
            group.position.z + (Math.random() - 0.5) * 0.04,
        );
        holder.userData.plotIndex = index;
        this.scene.add(holder);
        this.plotCrops[index] = holder;
    }

    setHouseLevel(level: number) {
        this.applyHouseLevel(level);
    }

    // ---------- 角色 ----------

    async setActor(parts: Parts, hair?: HairSettings) {
        if (this.disposed) return;
        const visitor = await createVisitor(parts, hair);
        if (this.disposed) {
            visitor.dispose();
            return;
        }
        if (this.actor) {
            this.actor.root.removeFromParent();
            this.actor.dispose();
        }
        this.actor = visitor;
        visitor.root.position.copy(this.actorHome);
        visitor.root.rotation.y = 0;
        this.scene.add(visitor.root);
        this.moveSpeed = Math.max(0.75, visitor.walkSpeed * 0.72);
    }

    /**
     * 形象加载失败时的兜底：一个最简单的小人，能站能走。
     * 比「田里空无一人」好——玩家会以为角色没来，而不是以为功能坏了。
     */
    setPlaceholderActor() {
        if (this.actor || this.placeholder) return;
        const g = new THREE.Group();
        const skin = new THREE.MeshLambertMaterial({ color: '#f3cfae' });
        const cloth = new THREE.MeshLambertMaterial({ color: '#7d9b6a' });
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.135, 20, 16), skin);
        head.position.y = 0.78;
        head.castShadow = true;
        const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.26, 6, 12), cloth);
        torso.position.y = 0.47;
        torso.castShadow = true;
        const legGeo = new THREE.CapsuleGeometry(0.055, 0.18, 4, 8);
        const legL = new THREE.Mesh(legGeo, cloth);
        legL.position.set(-0.07, 0.18, 0);
        const legR = new THREE.Mesh(legGeo, cloth);
        legR.position.set(0.07, 0.18, 0);
        g.add(head, torso, legL, legR);
        g.position.copy(this.actorHome);
        this.scene.add(g);
        this.placeholder = g;
        this.moveSpeed = 0.8;
    }

    /** 角色走到某块地旁边，站定后触发回调。 */
    walkToPlot(index: number, onArrive?: () => void) {
        const group = this.plotGroups[index];
        if (!group) return;
        const target = group.position.clone();
        // 站在地块靠观众这一侧，免得挡住作物
        target.z += 0.92;
        target.y = 0;
        this.onArrive = onArrive ?? null;
        this.moveTarget = target;
    }

    /** 原地做一个动作，比如浇水。 */
    playAction(kind: 'water', durationMs = 1600) {
        this.motion = kind;
        this.motionUntil = this.elapsed + durationMs;
        if (kind === 'water') this.spawnDrops();
    }

    private spawnDrops() {
        const mat = new THREE.MeshLambertMaterial({ color: '#8fd0ef', transparent: true, opacity: 0.9 });
        for (let i = 0; i < 10; i++) {
            const mesh = new THREE.Mesh(this.dropGeo, mat.clone());
            const anchor = this.actor ? this.actor.root.position : new THREE.Vector3();
            mesh.position.set(anchor.x + (Math.random() - 0.5) * 0.5, 0.75 + Math.random() * 0.15, anchor.z - 0.35);
            this.scene.add(mesh);
            this.drops.push({ mesh, vy: -0.9 - Math.random() * 0.6, life: 0.75 });
        }
    }

    /** 让角色回到原位（例如收起界面后）。 */
    sendHome() {
        this.moveTarget = this.actorHome.clone();
        this.onArrive = null;
    }

    // ---------- 交互 ----------

    private bindPointer(onPlotClick: (index: number) => void) {
        const el = this.renderer.domElement;
        let downX = 0;
        let downY = 0;
        let downAt = 0;

        const onDown = (e: PointerEvent) => {
            downX = e.clientX;
            downY = e.clientY;
            downAt = performance.now();
        };
        const onUp = (e: PointerEvent) => {
            const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
            const quick = performance.now() - downAt < 600;
            if (moved > 12 || !quick) return;
            const rect = el.getBoundingClientRect();
            const ndc = new THREE.Vector2(
                ((e.clientX - rect.left) / rect.width) * 2 - 1,
                -((e.clientY - rect.top) / rect.height) * 2 + 1,
            );
            const ray = new THREE.Raycaster();
            ray.setFromCamera(ndc, this.camera);
            const hits = ray.intersectObjects(this.plotHits, false);
            if (hits.length) {
                const idx = hits[0].object.userData.plotIndex as number;
                if (typeof idx === 'number') onPlotClick(idx);
            }
        };

        el.addEventListener('pointerdown', onDown);
        el.addEventListener('pointerup', onUp);
    }

    resize() {
        const parent = this.renderer.domElement.parentElement;
        if (!parent) return;
        const w = parent.clientWidth || 360;
        const h = parent.clientHeight || 480;
        this.renderer.setSize(w, h);
        const aspect = w / Math.max(1, h);
        this.camera.aspect = aspect;
        // 按「至少要看到多宽」反推机位，否则竖屏会把两侧的地切掉
        const needWidth = 3.9;
        const vFov = (this.camera.fov * Math.PI) / 180;
        const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
        const distW = needWidth / 2 / Math.tan(hFov / 2);
        const dist = Math.max(4.35, distW + 0.35);
        this.camera.position.set(0, 2.32 + (dist - 4.35) * 0.22, dist);
        this.camera.lookAt(0, 0.42, -0.55);
        this.camera.updateProjectionMatrix();
    }

    // ---------- 帧循环 ----------

    private loop = () => {
        if (this.disposed) return;
        this.raf = requestAnimationFrame(this.loop);
        const stamp = performance.now();
        const dt = this.lastFrame ? Math.min(0.05, (stamp - this.lastFrame) / 1000) : 0.016;
        this.lastFrame = stamp;
        this.elapsed += dt;
        this.step(dt);
        this.renderer.render(this.scene, this.camera);
    };

    private step(dt: number) {
        if (!this.actor && this.placeholder) {
            this.stepPlaceholder(dt);
            return;
        }
        const actor = this.actor;
        if (actor) {
            if (this.moveTarget) {
                const pos = actor.root.position;
                const dir = this.moveTarget.clone().sub(pos);
                dir.y = 0;
                const dist = dir.length();
                if (dist < 0.06) {
                    this.moveTarget = null;
                    this.motion = 'idle';
                    actor.root.position.y = 0;
                    const cb = this.onArrive;
                    this.onArrive = null;
                    cb?.();
                } else {
                    dir.normalize();
                    const step = Math.min(dist, this.moveSpeed * dt);
                    pos.addScaledVector(dir, step);
                    const want = Math.atan2(dir.x, dir.z);
                    this.facing = smoothAngle(this.facing, want, 9 * dt);
                    actor.root.rotation.y = this.facing;
                }
                actor.animate(this.elapsed, 'walk');
            } else if (this.motion === 'water' && this.elapsed < this.motionUntil) {
                actor.animate(this.elapsed, 'water');
            } else {
                if (this.motion !== 'idle') this.motion = 'idle';
                actor.animate(this.elapsed, 'idle');
            }
        }

        for (let i = this.drops.length - 1; i >= 0; i--) {
            const d = this.drops[i];
            d.life -= dt;
            d.mesh.position.y += d.vy * dt;
            (d.mesh.material as THREE.MeshLambertMaterial).opacity = Math.max(0, d.life / 0.75) * 0.9;
            if (d.life <= 0) {
                (d.mesh.material as THREE.MeshLambertMaterial).dispose();
                d.mesh.removeFromParent();
                this.drops.splice(i, 1);
            }
        }
    }

    private stepPlaceholder(dt: number) {
        const g = this.placeholder;
        if (!g) return;
        if (this.moveTarget) {
            const dir = this.moveTarget.clone().sub(g.position);
            dir.y = 0;
            const dist = dir.length();
            if (dist < 0.06) {
                this.moveTarget = null;
                const cb = this.onArrive;
                this.onArrive = null;
                cb?.();
            } else {
                dir.normalize();
                g.position.addScaledVector(dir, Math.min(dist, this.moveSpeed * dt));
                this.facing = smoothAngle(this.facing, Math.atan2(dir.x, dir.z), 9 * dt);
                g.rotation.y = this.facing;
                // 走动时轻微上下，别像滑行
                g.position.y = Math.abs(Math.sin(this.elapsed * 9)) * 0.025;
            }
        } else {
            g.position.y = Math.sin(this.elapsed * 1.6) * 0.008;
        }
    }

    dispose() {
        this.disposed = true;
        cancelAnimationFrame(this.raf);
        this.actor?.dispose();
        this.drops.forEach(d => {
            (d.mesh.material as THREE.MeshLambertMaterial).dispose();
        });
        this.dropGeo.dispose();
        this.houseTexCache.forEach(t => t.dispose());
        this.cropTexCache.forEach(t => t.dispose());
        this.clockTexture.dispose();
        this.scene.traverse(o => {
            if (o instanceof THREE.Mesh) {
                o.geometry.dispose();
                const mats = Array.isArray(o.material) ? o.material : [o.material];
                mats.forEach(m => m.dispose());
            }
        });
        this.renderer.dispose();
        this.renderer.domElement.remove();
    }
}

/** 量出图片里真正不透明的范围，按 0~1 比例返回，用来定房子的盒子尺寸。 */
function solidBounds(img: HTMLImageElement) {
    const w = Math.min(256, img.width);
    const h = Math.round(w * (img.height / img.width));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    let top = h;
    let bottom = 0;
    let left = w;
    let right = 0;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (data[(y * w + x) * 4 + 3] > 60) {
                if (y < top) top = y;
                if (y > bottom) bottom = y;
                if (x < left) left = x;
                if (x > right) right = x;
            }
        }
    }
    if (bottom < top) return { top: 0, bottom: 1, left: 0, right: 1 };
    return { top: top / h, bottom: (bottom + 1) / h, left: left / w, right: (right + 1) / w };
}

/** 角度插值：走最短的一边，避免转身时绕远路。 */
function smoothAngle(current: number, target: number, k: number) {
    let diff = target - current;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return current + diff * Math.min(1, k);
}

/** 程序化草地：两次低频噪点叠一条淡淡的垄，比纯色耐看，也不用额外素材。 */
function makeGrassTexture() {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#7ba85a';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 2600; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        const r = Math.random() * 2.1 + 0.4;
        const shade = Math.random();
        ctx.fillStyle = shade > 0.62 ? '#8cba67' : shade > 0.28 ? '#6d9a4d' : '#5f8b44';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(14, 14);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}
