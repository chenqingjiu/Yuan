/**
 * 一块田 · 3D 院子（横屏）。
 *
 * 布局：房子在左、田在右，相机绕院子左右各转 60°。
 * 之所以敢只做「正面」，就是因为这 60° 的限制——房子的背面永远在画面外，
 * 不需要真的建一栋完整的 3D 房子，只要「正面图 + 墙体盒子 + 屋顶棱柱」就够。
 */

import * as THREE from 'three';
import { CROPS, type CropId } from '../../utils/farm/crops';
import { createVisitor } from '../room3d/chibi/visitor';
import type { HairSettings, Parts } from '../room3d/chibi/types';

export interface PlotVisual {
    crop: CropId | null;
    stage: 0 | 1 | 2 | 3 | 4;
}

export interface FarmSceneOptions {
    host: HTMLElement;
    onPlotClick: (index: number) => void;
    /** 点草地：走过去站住 */
    onGroundClick?: (x: number, z: number) => void;
    /** 点小人：眨个眼 */
    onActorClick?: () => void;
}

/** 六块地：两行三列 */
const PLOT_COLS = 3;
const PLOT_ROWS = 2;
const PLOT_SIZE = 1.16;
const GAP_X = 1.6;
const GAP_Z = 1.78;
const FIELD_X = -0.75;
const FIELD_Z = 0.1;

const HOUSE_X = -4.55;
const HOUSE_Z = -2.9;

/** 相机：绕目标左右各 42°，俯角 16°。再大房子侧面就露馅了 */
const CAM_AZ_LIMIT = (42 * Math.PI) / 180;
const CAM_ELEV = (16 * Math.PI) / 180;
const CAM_TARGET = new THREE.Vector3(-2.2, 0.85, -0.9);

/** 背景板：离场景 48 米，14 米高，底边压到地面以下，接缝藏在草里 */
const BACKDROP_DIST = 48;
const BACKDROP_Y = 2;

/** 作物四个阶段的「内容高度」（米），不是贴图尺寸 */
const STAGE_HEIGHT = [0, 0.26, 0.44, 0.62, 0.82];

/** 每张作物图里，真正有内容的部分占画布多高。用来把「内容高度」换算成平面尺寸。 */
const CROP_FRAME: Record<string, number> = {
    'wheat-1': 0.195, 'wheat-2': 0.848, 'wheat-3': 0.916, 'wheat-4': 0.861,
    'corn-1': 0.199, 'corn-2': 0.871, 'corn-3': 0.916, 'corn-4': 0.918,
    'carrot-1': 0.199, 'carrot-2': 0.912, 'carrot-3': 0.918, 'carrot-4': 0.916,
};

/** 房子每个阶段的配色 */
const HOUSE_TONE: Record<number, { wall: string; roof: string; hasRoof: boolean }> = {
    1: { wall: '#8b7a68', roof: '#6d6154', hasRoof: false },
    2: { wall: '#c6a680', roof: '#8d949c', hasRoof: true },
    3: { wall: '#e2d5bd', roof: '#7d9464', hasRoof: true },
    4: { wall: '#e3c48f', roof: '#c26a4a', hasRoof: true },
};

const BASE = import.meta.env.BASE_URL;

export class FarmScene {
    private renderer: THREE.WebGLRenderer;
    private scene = new THREE.Scene();
    private camera: THREE.PerspectiveCamera;
    private host: HTMLElement;
    private raf = 0;
    private disposed = false;
    private lastFrame = 0;
    private elapsed = 0;

    private az = 0;
    private dist = 7.6;
    private camTarget = CAM_TARGET.clone();

    private ground!: THREE.Mesh;
    private plotGroups: THREE.Group[] = [];
    private plotHits: THREE.Mesh[] = [];
    private plotCrops: (THREE.Group | null)[] = [];
    private plotState: PlotVisual[] = [];

    private houseGroup = new THREE.Group();
    private houseStage = 1;
    private houseTex = new Map<number, THREE.Texture>();

    private cropTex = new Map<string, THREE.Texture>();
    private propTex = new Map<string, THREE.Texture>();

    private actor: Awaited<ReturnType<typeof createVisitor>> | null = null;
    private placeholder: THREE.Group | null = null;
    /** 角色的外层容器：用来做弯腰/下蹲，不跟骨骼动画打架 */
    private actorPivot = new THREE.Group();
    private actorHome = new THREE.Vector3(-3.35, 0, 0.85);
    private moveTarget: THREE.Vector3 | null = null;
    private moveSpeed = 1.7;
    private onArrive: (() => void) | null = null;
    private facing = 0;
    /** 到了地方要朝哪看；null = 保持走路方向 */
    private faceTarget: number | null = null;
    private lean = 0;
    private leanTarget = 0;
    private squash = 0;
    private squashTarget = 0;
    private actionUntil = 0;
    private actionKind: 'idle' | 'water' | 'plant' | 'harvest' = 'idle';
    private blinkUntil = 0;

    private billboards: THREE.Object3D[] = [];
    private backdropPivot = new THREE.Group();
    private blobTex: THREE.Texture | null = null;
    private actorShadow: THREE.Mesh | null = null;
    private drops: { mesh: THREE.Mesh; vy: number; life: number }[] = [];
    private dropGeo = new THREE.SphereGeometry(0.032, 6, 6);
    private dropMat = new THREE.MeshLambertMaterial({ color: '#8fd0ef', transparent: true, opacity: 0.85 });

    private opts: FarmSceneOptions;

    constructor(opts: FarmSceneOptions) {
        this.opts = opts;
        this.host = opts.host;

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.shadowMap.enabled = false;
        this.host.appendChild(this.renderer.domElement);
        this.renderer.domElement.style.display = 'block';
        this.renderer.domElement.style.width = '100%';
        this.renderer.domElement.style.height = '100%';
        this.renderer.domElement.style.touchAction = 'none';

        this.camera = new THREE.PerspectiveCamera(44, 1, 0.1, 120);
        this.scene.background = new THREE.Color('#bfe3f2');
        this.scene.fog = new THREE.Fog('#cfe6ef', 15, 52);

        this.buildLights();
        this.buildGround();
        this.buildBackdrop();
        this.buildPlots();
        this.buildHouse();
        this.buildProps();

        this.scene.add(this.houseGroup);
        this.actorPivot.position.copy(this.actorHome);
        this.scene.add(this.actorPivot);
        this.actorShadow = this.blob(0.86, 0.86, this.actorHome.x, 0.012, this.actorHome.z);

        this.resize();
        this.bindPointer();
        this.lastFrame = performance.now();
        this.loop();
    }

    // ---------------------------------------------------------------- 场景搭建

    private buildLights() {
        this.scene.add(new THREE.HemisphereLight('#e8f4ff', '#6f7f52', 1.15));
        const sun = new THREE.DirectionalLight('#fff3d8', 1.45);
        sun.position.set(-6, 9.5, 5.5);
        this.scene.add(sun);
    }

    private loadTex(url: string, key: string, repeat?: [number, number]) {
        const cacheKey = repeat ? `${key}:${repeat[0]}x${repeat[1]}` : key;
        const hit = this.propTex.get(cacheKey);
        if (hit) return hit;
        const t = new THREE.TextureLoader().load(url);
        t.colorSpace = THREE.SRGBColorSpace;
        if (repeat) {
            t.wrapS = THREE.RepeatWrapping;
            t.wrapT = THREE.RepeatWrapping;
            t.repeat.set(repeat[0], repeat[1]);
        }
        this.propTex.set(cacheKey, t);
        return t;
    }

    /** 一张径向渐变的软圆斑，铺在地上当影子。比实时阴影便宜，也不会留边界。 */
    private blob(w: number, d: number, x: number, y: number, z: number, opacity = 1) {
        if (!this.blobTex) {
            const c = document.createElement('canvas');
            c.width = c.height = 128;
            const ctx = c.getContext('2d')!;
            const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
            g.addColorStop(0, 'rgba(36,48,28,0.40)');
            g.addColorStop(0.6, 'rgba(36,48,28,0.20)');
            g.addColorStop(1, 'rgba(36,48,28,0)');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, 128, 128);
            const t = new THREE.CanvasTexture(c);
            t.colorSpace = THREE.SRGBColorSpace;
            this.blobTex = t;
        }
        const m = new THREE.Mesh(
            new THREE.PlaneGeometry(w, d),
            new THREE.MeshBasicMaterial({
                map: this.blobTex,
                transparent: true,
                opacity,
                depthWrite: false,
            }),
        );
        m.rotation.x = -Math.PI / 2;
        m.position.set(x, y, z);
        m.renderOrder = 2;
        this.scene.add(m);
        return m;
    }

    private buildGround() {
        const grass = this.loadTex(`${BASE}farm/ground-grass.png`, 'grass', [4, 4]);
        const ground = new THREE.Mesh(
            new THREE.PlaneGeometry(64, 64),
            new THREE.MeshLambertMaterial({ map: grass }),
        );
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);
        this.ground = ground;
    }

    /**
     * 远景：一块跟着相机一起转的背景板。
     * 弧面贴图的 UV 方向、绕一圈的横向拉伸都很难控（试过，山会跑到头顶），
     * 改成整块平板 + 按相机方位同步旋转，永远正对镜头，也就永远不会露边。
     */
    private buildBackdrop() {
        const tex = this.loadTex(`${BASE}farm/bg-far.png`, 'bg');
        tex.wrapS = THREE.MirroredRepeatWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        // 板子 120×16，图片 3:2，横向铺 5 份才不变形；镜像重复能藏住接缝
        tex.repeat.set(5, 1);
        tex.needsUpdate = true;

        this.backdropPivot.position.set(CAM_TARGET.x, 0, CAM_TARGET.z);
        const mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(120, 16),
            new THREE.MeshBasicMaterial({ map: tex, fog: false, depthWrite: false, toneMapped: false }),
        );
        mesh.position.set(0, BACKDROP_Y, -BACKDROP_DIST);
        mesh.renderOrder = -1;
        this.backdropPivot.add(mesh);
        this.scene.add(this.backdropPivot);
    }

    private plotPos(i: number) {
        const col = i % PLOT_COLS;
        const row = Math.floor(i / PLOT_COLS);
        return new THREE.Vector3(
            FIELD_X + (col - (PLOT_COLS - 1) / 2) * GAP_X,
            0,
            FIELD_Z + (row - (PLOT_ROWS - 1) / 2) * GAP_Z,
        );
    }

    private buildPlots() {
        const soil = this.loadTex(`${BASE}farm/ground-soil.png`, 'soil');
        const soilMat = new THREE.MeshLambertMaterial({ map: soil });
        const sideMat = new THREE.MeshLambertMaterial({ color: '#6f543a' });
        const edgeMat = new THREE.MeshLambertMaterial({ color: '#8a7355' });

        for (let i = 0; i < PLOT_COLS * PLOT_ROWS; i++) {
            const g = new THREE.Group();
            g.position.copy(this.plotPos(i));

            // 地本身压得很薄：0.04 米，看起来是「翻过的一片土」，不是浮起来的托盘
            const box = new THREE.Mesh(
                new THREE.BoxGeometry(PLOT_SIZE, 0.04, PLOT_SIZE),
                [sideMat, sideMat, soilMat, sideMat, sideMat, sideMat],
            );
            box.position.y = 0.02;
            box.receiveShadow = true;
            g.add(box);

            // 一圈略深的田埂，把六块地连成一片
            const edge = new THREE.Mesh(
                new THREE.BoxGeometry(PLOT_SIZE + 0.09, 0.028, PLOT_SIZE + 0.09),
                edgeMat,
            );
            edge.position.y = 0.012;
            edge.receiveShadow = true;
            g.add(edge);

            const hit = new THREE.Mesh(
                new THREE.BoxGeometry(PLOT_SIZE, 0.34, PLOT_SIZE),
                new THREE.MeshBasicMaterial({ visible: false }),
            );
            hit.position.y = 0.17;
            hit.userData.plotIndex = i;
            this.plotHits.push(hit);
            g.add(hit);

            this.scene.add(g);
            this.plotGroups.push(g);
            this.plotCrops.push(null);
            this.plotState.push({ crop: null, stage: 0 });
        }
    }

    private buildHouse() {
        this.houseGroup.position.set(HOUSE_X, 0, HOUSE_Z);
        this.applyHouseStage(this.houseStage);
    }

    private houseTexFor(stage: number) {
        const hit = this.houseTex.get(stage);
        if (hit) return hit;
        const t = new THREE.TextureLoader().load(`${BASE}farm/house-${stage}.png`);
        t.colorSpace = THREE.SRGBColorSpace;
        this.houseTex.set(stage, t);
        return t;
    }

    /**
     * 房子：一张正面图 + 一个墙体盒子 + 一个屋顶棱柱。
     * 正面看是完整的画，转到侧面能看到真实的厚度，不会塌成纸片。
     */
    private applyHouseStage(stage: number) {
        this.houseStage = stage;
        while (this.houseGroup.children.length) {
            const c = this.houseGroup.children.pop()!;
            c.traverse((o) => {
                if (o instanceof THREE.Mesh) {
                    if (!Array.isArray(o.material)) o.material.dispose();
                    o.geometry.dispose();
                }
            });
        }

        const tone = HOUSE_TONE[stage] ?? HOUSE_TONE[1];
        // 画布 512，内容大约在 y 0.22~0.94、x 0.11~0.89 之间
        const canvasH = 4.7;
        const canvasW = canvasH;
        const contentTop = 0.224;
        const contentBottom = 0.937;
        const contentH = (contentBottom - contentTop) * canvasH;
        const contentW = 0.782 * canvasW;
        const baseY = -(1 - contentBottom) * canvasH;

        // 墙体盒子：只要墙那一段，屋顶交给棱柱
        const wallH = contentH * 0.46;
        const wall = new THREE.Mesh(
            new THREE.BoxGeometry(contentW * 0.8, wallH, 0.92),
            new THREE.MeshLambertMaterial({ color: tone.wall }),
        );
        wall.position.set(0, baseY + wallH / 2, -0.46);
        wall.castShadow = true;
        wall.receiveShadow = true;
        this.houseGroup.add(wall);

        // 屋顶棱柱
        if (tone.hasRoof) {
            const roofH = contentH * 0.42;
            const roofW = contentW * 0.8;
            const shape = new THREE.Shape();
            shape.moveTo(-roofW / 2, 0);
            shape.lineTo(roofW / 2, 0);
            shape.lineTo(0, roofH);
            shape.closePath();
            const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.98, bevelEnabled: false });
            geo.translate(0, 0, -0.49);
            const roof = new THREE.Mesh(
                geo,
                new THREE.MeshLambertMaterial({
                    color: tone.roof,
                    flatShading: true,
                    // 棱柱侧面会被压暗，补一点自发光，别在房子左边留一块黑边
                    emissive: new THREE.Color(tone.roof),
                    emissiveIntensity: 0.3,
                }),
            );
            roof.position.set(0, baseY + wallH * 0.96, -0.54);
            roof.castShadow = true;
            this.houseGroup.add(roof);
        }

        this.blob(contentW * 1.12, contentW * 0.9, HOUSE_X, 0.011, HOUSE_Z + 0.1, 0.9);

        // 正面：你的立面图
        const face = new THREE.Mesh(
            new THREE.PlaneGeometry(canvasW, canvasH),
            new THREE.MeshLambertMaterial({
                map: this.houseTexFor(stage),
                transparent: true,
                alphaTest: 0.4,
                side: THREE.DoubleSide,
            }),
        );
        face.position.set(0, canvasH / 2 + baseY, 0.02);
        this.houseGroup.add(face);
    }

    /** 装饰：树、栅栏、灌木、石头、水井、干草堆。都是正面小卡片，缩小后看不出是纸片。 */
    private buildProps() {
        const addCard = (name: string, x: number, z: number, h: number, ry = 0) => {
            const tex = this.loadTex(`${BASE}farm/${name}`, name);
            const mat = new THREE.MeshLambertMaterial({
                map: tex,
                transparent: true,
                alphaTest: 0.42,
                side: THREE.DoubleSide,
            });
            const m = new THREE.Mesh(new THREE.PlaneGeometry(h, h), mat);
            m.position.set(x, h / 2, z);
            m.rotation.y = ry;
            m.castShadow = false;
            this.scene.add(m);
            this.billboards.push(m);
            this.blob(h * 0.62, h * 0.42, x, 0.012, z + h * 0.06, 0.85);
            return m;
        };

        addCard('prop-tree.png', -7.0, -4.6, 3.4);
        addCard('prop-tree.png', 3.6, -4.9, 2.8, Math.PI * 0.12);
        addCard('prop-haystack.png', -6.1, -1.5, 1.6);
        addCard('prop-well.png', -2.25, -2.55, 1.7);
        addCard('prop-bush.png', -7.6, -2.2, 1.2);
        addCard('prop-bush.png', 2.9, -3.6, 1.05);
        addCard('prop-rock.png', 3.2, 2.1, 0.6);
        addCard('prop-rock.png', -3.6, 3.1, 0.5);

        // 栅栏：沿后排横向排开，朝观众
        for (let i = 0; i < 5; i++) {
            const tex = this.loadTex(`${BASE}farm/prop-fence.png`, 'prop-fence.png');
            const mat = new THREE.MeshLambertMaterial({
                map: tex,
                transparent: true,
                alphaTest: 0.4,
                side: THREE.DoubleSide,
            });
            const seg = new THREE.Mesh(new THREE.PlaneGeometry(1.32, 0.66), mat);
            seg.position.set(-5.4 + i * 1.26, 0.33, -4.85);
            this.scene.add(seg);
            this.billboards.push(seg);
            this.blob(0.78, 0.3, seg.position.x, 0.012, seg.position.z - 0.04, 0.7);
        }
    }

    // ---------------------------------------------------------------- 地块与作物

    setPlot(index: number, visual: PlotVisual) {
        const group = this.plotGroups[index];
        if (!group) return;
        this.plotState[index] = visual;

        const old = this.plotCrops[index];
        if (old) {
            old.removeFromParent();
            const mats = new Set<THREE.Material>();
            const geos = new Set<THREE.BufferGeometry>();
            old.traverse((o) => {
                if (!(o instanceof THREE.Mesh)) return;
                (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(m));
                geos.add(o.geometry);
            });
            mats.forEach((m) => m.dispose());
            geos.forEach((g) => g.dispose());
            this.plotCrops[index] = null;
        }
        if (!visual.crop || visual.stage < 1) return;

        const holder = this.buildCropCluster(visual.crop, visual.stage);
        holder.position.copy(group.position);
        this.scene.add(holder);
        this.plotCrops[index] = holder;
    }

    /** 一块地九株：三行三列，随机歪一点点，看起来自然，不像贴图阵列 */
    private buildCropCluster(crop: CropId, stage: number) {
        const holder = new THREE.Group();
        holder.userData.plotIndex = true;
        const key = `${crop}-${stage}`;
        const tex = this.cropTexture(crop, stage);
        const ratio = CROP_FRAME[key] ?? 0.9;
        const h = (STAGE_HEIGHT[stage] ?? 0.5) / ratio;

        const mat = new THREE.MeshLambertMaterial({
            map: tex,
            transparent: true,
            alphaTest: 0.45,
            side: THREE.DoubleSide,
        });
        const geoA = new THREE.PlaneGeometry(h, h);
        const geoB = new THREE.PlaneGeometry(h, h);

        const span = PLOT_SIZE * 0.62;
        let seed = stage * 977 + crop.length * 131;
        const rnd = () => {
            seed = (seed * 9301 + 49297) % 233280;
            return seed / 233280;
        };

        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
                const x = (c - 1) * (span / 2) + (rnd() - 0.5) * 0.06;
                const z = (r - 1) * (span / 2) + (rnd() - 0.5) * 0.06;
                const k = 0.9 + rnd() * 0.18;
                const rot = (Math.floor(rnd() * 4) * Math.PI) / 4;

                const a = new THREE.Mesh(geoA, mat);
                a.position.set(x, (h * k) / 2, z);
                a.scale.setScalar(k);
                a.rotation.y = rot;
                const b = new THREE.Mesh(geoB, mat);
                b.position.set(x, (h * k) / 2, z);
                b.scale.setScalar(k);
                b.rotation.y = rot + Math.PI / 2;
                holder.add(a, b);
            }
        }
        return holder;
    }

    private cropTexture(crop: CropId, stage: number) {
        const key = `${crop}-${stage}`;
        const hit = this.cropTex.get(key);
        if (hit) return hit;
        const t = new THREE.TextureLoader().load(`${BASE}farm/${key}.png`);
        t.colorSpace = THREE.SRGBColorSpace;
        this.cropTex.set(key, t);
        return t;
    }

    setHouseLevel(stage: number) {
        const s = Math.max(1, Math.min(4, Math.round(stage)));
        if (s === this.houseStage && this.houseGroup.children.length) return;
        this.applyHouseStage(s);
    }

    // ---------------------------------------------------------------- 角色

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
        visitor.root.position.set(0, 0, 0);
        visitor.root.rotation.y = 0;
        this.actorPivot.add(visitor.root);
        this.moveSpeed = Math.max(1.6, visitor.walkSpeed * 1.15);
    }

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
        this.actorPivot.add(g);
        this.placeholder = g;
        this.moveSpeed = 1.75;
    }

    /** 走到某块地旁边（站在靠观众这一侧），到了触发回调。 */
    walkToPlot(index: number, onArrive?: () => void) {
        const group = this.plotGroups[index];
        if (!group) return;
        const target = group.position.clone();
        target.z += PLOT_SIZE * 0.78;
        target.y = 0;
        this.faceTarget = Math.atan2(group.position.x - target.x, group.position.z - target.z);
        this.walkTo(target, onArrive);
    }

    /** 走到地面上的某个点（点草地时用）。 */
    walkToXZ(x: number, z: number) {
        this.walkTo(new THREE.Vector3(x, 0, z));
    }

    walkTo(target: THREE.Vector3, onArrive?: () => void) {
        this.moveTarget = target.clone();
        this.onArrive = onArrive ?? null;
    }

    /** 走开一点，别占着地 */
    stepBack(distance = 0.55) {
        const p = this.actorPivot.position.clone();
        p.z += distance;
        this.walkTo(p);
    }

    /**
     * 干活：弯腰 + 蹲下一点。
     * 骨骼动画是现成的（water / cook），但身体前倾要另外给，
     * 否则看起来是「站得笔直、手上洒水」。
     */
    playAction(kind: 'water' | 'plant' | 'harvest', durationMs = 1800) {
        this.actionKind = kind;
        this.actionUntil = this.elapsed + durationMs / 1000;
        if (kind === 'water') {
            this.leanTarget = 0.42;
            this.squashTarget = 0.06;
            this.spawnDrops();
        } else if (kind === 'plant') {
            this.leanTarget = 0.52;
            this.squashTarget = 0.16;
        } else {
            this.leanTarget = 0.50;
            this.squashTarget = 0.12;
        }
    }

    /** 点一下小人：眨个眼。 */
    blink() {
        this.blinkUntil = this.elapsed + 0.34;
    }

    private spawnDrops() {
        const base = this.actorPivot.position;
        for (let i = 0; i < 12; i++) {
            const mesh = new THREE.Mesh(this.dropGeo, this.dropMat);
            mesh.position.set(
                base.x + (Math.random() - 0.5) * 0.42,
                0.5 + Math.random() * 0.3,
                base.z - 0.22 + (Math.random() - 0.5) * 0.16,
            );
            this.scene.add(mesh);
            this.drops.push({ mesh, vy: -0.9 - Math.random() * 0.7, life: 0.8 });
        }
    }

    sendHome() {
        this.walkTo(this.actorHome.clone());
    }

    // ---------------------------------------------------------------- 相机

    private applyCamera() {
        const d = this.dist;
        const hx = Math.cos(CAM_ELEV) * Math.sin(this.az);
        const hz = Math.cos(CAM_ELEV) * Math.cos(this.az);
        this.camera.position.set(
            this.camTarget.x + d * hx,
            this.camTarget.y + d * Math.sin(CAM_ELEV),
            this.camTarget.z + d * hz,
        );
        this.camera.lookAt(this.camTarget);
    }

    resize() {
        const w = this.host.clientWidth || 1;
        const h = this.host.clientHeight || 1;
        this.renderer.setSize(w, h, false);
        const aspect = w / Math.max(1, h);
        this.camera.aspect = aspect;

        // 按「至少要看到多宽」反推机位：横屏刚好，竖屏会拉远（提示用户横过来）
        const needWidth = 12.2;
        const vFov = (this.camera.fov * Math.PI) / 180;
        const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
        const byWidth = needWidth / 2 / Math.tan(hFov / 2);
        const byHeight = 4.6 / 2 / Math.tan(vFov / 2);
        this.dist = Math.max(6.2, Math.min(15, Math.max(byWidth, byHeight)));
        this.camera.updateProjectionMatrix();
        this.applyCamera();
    }

    // ---------------------------------------------------------------- 交互

    private bindPointer() {
        const el = this.renderer.domElement;
        let downX = 0;
        let downY = 0;
        let downAt = 0;
        let startAz = 0;
        let dragging = false;

        el.addEventListener('pointerdown', (e) => {
            downX = e.clientX;
            downY = e.clientY;
            downAt = performance.now();
            startAz = this.az;
            dragging = false;
            el.setPointerCapture?.(e.pointerId);
        });

        el.addEventListener('pointermove', (e) => {
            if (!el.hasPointerCapture?.(e.pointerId)) return;
            const dx = e.clientX - downX;
            if (Math.abs(dx) > 8) dragging = true;
            if (!dragging) return;
            this.az = Math.max(-CAM_AZ_LIMIT, Math.min(CAM_AZ_LIMIT, startAz - dx * 0.0055));
            this.applyCamera();
        });

        const finish = (e: PointerEvent) => {
            el.releasePointerCapture?.(e.pointerId);
            const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
            const quick = performance.now() - downAt < 700;
            if (dragging || moved > 14 || !quick) return;

            const rect = el.getBoundingClientRect();
            const ndc = new THREE.Vector2(
                ((e.clientX - rect.left) / rect.width) * 2 - 1,
                -((e.clientY - rect.top) / rect.height) * 2 + 1,
            );
            const ray = new THREE.Raycaster();
            ray.setFromCamera(ndc, this.camera);

            // 先看有没有点到小人
            const actorTarget = this.actor?.root ?? this.placeholder;
            if (actorTarget) {
                const hitActor = ray.intersectObject(actorTarget, true);
                if (hitActor.length) {
                    this.opts.onActorClick?.();
                    return;
                }
            }

            const hitPlot = ray.intersectObjects(this.plotHits, false);
            if (hitPlot.length) {
                const idx = hitPlot[0].object.userData.plotIndex as number;
                this.opts.onPlotClick(idx);
                return;
            }

            if (!this.ground || !this.opts.onGroundClick) return;
            const ground = ray.intersectObject(this.ground, false);
            if (ground.length) {
                const p = ground[0].point;
                // 别让他走到看不见的地方去
                const x = Math.max(-7.2, Math.min(4.2, p.x));
                const z = Math.max(-5.6, Math.min(4.6, p.z));
                this.opts.onGroundClick(x, z);
            }
        };

        el.addEventListener('pointerup', finish);
        el.addEventListener('pointercancel', () => {
            dragging = false;
        });
    }

    // ---------------------------------------------------------------- 主循环

    private loop = () => {
        if (this.disposed) return;
        this.raf = requestAnimationFrame(this.loop);
        const now = performance.now();
        const dt = this.lastFrame ? Math.min(0.05, (now - this.lastFrame) / 1000) : 0.016;
        this.lastFrame = now;
        this.elapsed += dt;

        this.stepActor(dt);
        this.stepDrops(dt);
        // 小件始终面向镜头：它们是平面卡片，侧着看会变成一条线
        for (const b of this.billboards) b.rotation.y = this.az;
        // 背景板跟着相机转，永远正对镜头
        this.backdropPivot.rotation.y = this.az;
        this.renderer.render(this.scene, this.camera);
    };

    private stepActor(dt: number) {
        const body = (this.actor?.root ?? this.placeholder) as THREE.Object3D | null;
        if (!body) return;

        // 走路
        if (this.moveTarget) {
            const dir = this.moveTarget.clone().sub(this.actorPivot.position);
            dir.y = 0;
            const dist = dir.length();
            if (dist < 0.07) {
                this.moveTarget = null;
                if (this.faceTarget !== null) {
                    this.facing = this.faceTarget;
                    this.faceTarget = null;
                }
                const cb = this.onArrive;
                this.onArrive = null;
                cb?.();
            } else {
                dir.normalize();
                const step = Math.min(dist, this.moveSpeed * dt);
                this.actorPivot.position.addScaledVector(dir, step);
                this.facing = smoothAngle(this.facing, Math.atan2(dir.x, dir.z), 9 * dt);
                this.actorPivot.rotation.y = this.facing;
                if (this.actorShadow) {
                    this.actorShadow.position.set(this.actorPivot.position.x, 0.012, this.actorPivot.position.z);
                }
            }
        }

        // 动作结束，直起身
        if (this.actionKind !== 'idle' && this.elapsed > this.actionUntil) {
            this.actionKind = 'idle';
            this.leanTarget = 0;
            this.squashTarget = 0;
        }

        // 前倾与下蹲：插值到目标，别硬跳
        this.lean += (this.leanTarget - this.lean) * Math.min(1, dt * 7);
        this.squash += (this.squashTarget - this.squash) * Math.min(1, dt * 7);
        body.rotation.x = this.lean;
        body.scale.y = 1 - this.squash;
        body.position.y = this.squash * 0.12;

        // 骨骼动画
        if (this.actor) {
            const moving = !!this.moveTarget;
            const motion = this.actionKind !== 'idle' ? 'water' : moving ? 'walk' : 'idle';
            this.actor.animate(this.elapsed, motion);
            if (this.elapsed < this.blinkUntil) {
                this.actor.updateExpression(this.elapsed, { blink: true });
            }
        }
    }

    private stepDrops(dt: number) {
        for (let i = this.drops.length - 1; i >= 0; i--) {
            const d = this.drops[i];
            d.life -= dt;
            d.mesh.position.y += d.vy * dt;
            if (d.life <= 0 || d.mesh.position.y < 0.02) {
                d.mesh.removeFromParent();
                this.drops.splice(i, 1);
            }
        }
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        cancelAnimationFrame(this.raf);
        this.actor?.dispose();
        this.placeholder = null;
        this.cropTex.forEach((t) => t.dispose());
        this.houseTex.forEach((t) => t.dispose());
        this.propTex.forEach((t) => t.dispose());
        this.dropGeo.dispose();
        this.dropMat.dispose();
        this.renderer.dispose();
        this.renderer.domElement.remove();
    }
}

/** 角度插值：走最短的一边，避免转身时绕远路。 */
function smoothAngle(from: number, to: number, t: number) {
    let diff = ((to - from + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    return from + diff * Math.min(1, t);
}
