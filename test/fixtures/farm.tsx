import React, { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { FarmScene } from '../../apps/farm/FarmScene';
import { createVisitor } from '../../apps/room3d/chibi/visitor';

const params = new URLSearchParams(location.search);
const withActor = params.get('actor') !== '0';

/** 造一块纯色贴图，代理给所有部位，用来在没有捏人数据时验证角色比例 */
function stubParts() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d')!;
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#f7e0cb');
    grad.addColorStop(1, '#e8c9ae');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
    const c2 = document.createElement('canvas');
    c2.width = c2.height = 256;
    const g2 = c2.getContext('2d')!;
    g2.fillStyle = '#3b2f2a';
    g2.fillRect(0, 0, 256, 256);
    const base: Record<string, HTMLCanvasElement> = {
        skin: c,
        fronthair: c2,
        back1: c2,
        back2: c2,
        decor: c2,
        eyes: c2,
    };
    for (const key of ['fronthair', 'back1', 'back2', 'decor', 'skin', 'eyes']) {
        base[key + '-raw'] = base[key];
        base[key + '-raw-fixed'] = base[key];
    }
    return base;
}

function Demo() {
    const ref = useRef<HTMLDivElement>(null);
    const label = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const scene = new FarmScene({
            host: ref.current!,
            onPlotClick: i => {
                console.log('PLOT CLICK', i);
                if (label.current) label.current.textContent = `点击了 ${i + 1} 号地`;
                scene.walkToPlot(i, () => scene.playAction('water'));
            },
        });
        scene.setPlot(0, { crop: 'wheat', stage: 4 });
        scene.setPlot(1, { crop: 'corn', stage: 3 });
        scene.setPlot(2, { crop: 'carrot', stage: 2 });
        scene.setPlot(3, { crop: 'wheat', stage: 1 });
        scene.setHouseLevel(Number(params.get('house') ?? 2));

        const probe = stubParts();
        console.log('parts keys', Object.keys(probe).length, 'skin is', probe.skin?.constructor?.name, probe.skin?.width);
        if (params.get('actor') === 'ph') {
            scene.setPlaceholderActor();
        } else if (withActor) {
            createVisitor(stubParts() as never, { layers: {}, extras: [], bodyShape: 'classic' })
                .then(v => { (window as never as {__v:unknown}).__v = v; scene.setActor(v as never); })
                .catch(e => console.error('actor failed', (e as Error)?.stack || String(e)));
        }
        (window as never as {__scene: unknown}).__scene = scene;
        return () => scene.dispose();
    }, []);

    return (
        <>
            <div ref={ref} style={{ width: '100vw', height: '100vh' }} />
            <div ref={label} style={{ position: 'fixed', left: 12, top: 12, color: '#fff', font: '13px/1.4 sans-serif' }} />
        </>
    );
}

createRoot(document.getElementById('root')!).render(<Demo />);
