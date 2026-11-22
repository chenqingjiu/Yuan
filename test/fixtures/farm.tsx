import React, { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { FarmScene } from '../../apps/farm/FarmScene';

const params = new URLSearchParams(location.search);

function Demo() {
    const ref = useRef<HTMLDivElement>(null);
    const label = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const scene = new FarmScene({
            host: ref.current!,
            onPlotClick: i => {
                if (label.current) label.current.textContent = `点击了 ${i + 1} 号地`;
                scene.walkToPlot(i, () => scene.playAction('water'));
            },
            onGroundClick: (x, z) => {
                if (label.current) label.current.textContent = `走到 ${x.toFixed(1)}, ${z.toFixed(1)}`;
                scene.walkToXZ(x, z);
            },
            onActorClick: () => {
                if (label.current) label.current.textContent = '点了小人';
                scene.blink();
            },
        });
        const crops = ['wheat', 'corn', 'carrot', 'wheat', 'corn', 'carrot'] as const;
        const stages = [4, 3, 2, 1, 4, 3];
        for (let i = 0; i < 6; i++) {
            scene.setPlot(i, { crop: crops[i], stage: stages[i] as 1 | 2 | 3 | 4 });
        }
        scene.setHouseLevel(Number(params.get('house') ?? 2));
        if (params.get('actor') === 'ph') scene.setPlaceholderActor();
        (window as never as { __scene: unknown }).__scene = scene;
        return () => scene.dispose();
    }, []);

    return (
        <>
            <div ref={ref} style={{ position: 'fixed', inset: 0 }} />
            <div ref={label} style={{ position: 'fixed', left: 12, top: 8, color: '#fff', font: '12px/1.4 sans-serif', textShadow: '0 1px 2px #000' }} />
        </>
    );
}

createRoot(document.getElementById('root')!).render(<Demo />);
